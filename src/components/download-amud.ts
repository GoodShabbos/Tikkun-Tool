import { jsPDF } from 'jspdf'
import textFilter from '../text-filter'

// Base64-encoded ShlomosemiStam font — loaded lazily
let fontBase64: string | null = null

async function loadFont(): Promise<string> {
  if (fontBase64) return fontBase64
  const response = await fetch('/assets/fonts/ShlomosemiStam.ttf')
  const arrayBuffer = await response.arrayBuffer()
  fontBase64 = arrayBufferToBase64(arrayBuffer)
  return fontBase64
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

interface LineData {
  text: string[][]
  verses: unknown[]
  isPetucha: boolean
  labels: string[]
}

interface PageData {
  type: 'page'
  lines: LineData[]
}

/**
 * Sets up download buttons for all tikkun pages.
 * Generates a print-ready PDF with both annotated and plain columns
 * rendered programmatically (no screenshot).
 *
 * Also handles making the button sticky within the scroll container
 * so it stays visible as the user scrolls within a page.
 */
export function setupDownloadButtons(root: HTMLElement) {
  root.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement
    const btn = target.closest('.download-amud-btn') as HTMLElement | null
    if (!btn) return

    e.preventDefault()
    e.stopPropagation()

    const page = btn.closest('.tikkun-page') as HTMLElement | null
    if (!page) return

    const pageData = (page as HTMLElement & { tikkunPage?: unknown }).tikkunPage
    if (!pageData) return

    btn.style.pointerEvents = 'none'
    btn.style.opacity = '0.5'

    try {
      await generateAndDownloadPDF(pageData, page)
    } catch (err) {
      console.error('Failed to generate amud PDF:', err)
    } finally {
      btn.style.pointerEvents = ''
      btn.style.opacity = ''
    }
  })

  // Make download buttons sticky within the scroll container
  const updateButtonPositions = () => {
    const bookRect = root.getBoundingClientRect()
    const buttons = root.querySelectorAll('.download-amud-btn')

    buttons.forEach((btn) => {
      const page = btn.closest('.tikkun-page') as HTMLElement
      if (!page) return

      const pageRect = page.getBoundingClientRect()

      if (pageRect.top < bookRect.top) {
        const offset = bookRect.top - pageRect.top + 4
        ;(btn as HTMLElement).style.top = `${offset}px`
      } else {
        ;(btn as HTMLElement).style.top = '0.5em'
      }
    })
  }

  root.addEventListener('scroll', updateButtonPositions, { passive: true })
  window.addEventListener('resize', updateButtonPositions, { passive: true })
  requestAnimationFrame(updateButtonPositions)
}

/**
 * Convert any CSS color string (hex, rgb, rgba, hsl, hsla, named) to a hex string
 * that jsPDF can understand.
 */
function cssColorToHex(color: string): string {
  // Already hex?
  if (color.startsWith('#')) return color

  // Use a temporary canvas to resolve any CSS color to rgba
  const ctx = document.createElement('canvas').getContext('2d')!
  ctx.fillStyle = color
  const resolved = ctx.fillStyle // always returns #rrggbb or rgba(r,g,b,a)

  if (resolved.startsWith('#')) return resolved

  // Parse rgba(r, g, b, a)
  const match = resolved.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (match) {
    const r = parseInt(match[1], 10)
    const g = parseInt(match[2], 10)
    const b = parseInt(match[3], 10)
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }

  return '#000000'
}

/**
 * Render a single line of Torah text into the PDF.
 * Each line has columns (outer array) containing fragments (inner array).
 * Columns are laid out with space-between justification, like the site.
 * For petucha lines, text is left-aligned (not justified).
 */
function renderLine(
  pdf: jsPDF,
  line: LineData,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  annotated: boolean
): number {
  const lineHeight = fontSize * 1.15

  // Process each column in the line
  // text[][] — outer array = columns, inner array = fragments within each column
  const columns = line.text.map((colFragments) =>
    colFragments.map((fragment) =>
      annotated
        ? textFilter({ text: fragment, annotated: true }).replace(/\{[^}]*\}/g, '')
        : textFilter({ text: fragment, annotated: false })
    )
  )

  // Calculate total text width for all fragments to determine spacing
  const allFragmentWidths: { colIdx: number; fragIdx: number; text: string; width: number }[] = []
  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    for (let fragIdx = 0; fragIdx < columns[colIdx].length; fragIdx++) {
      const text = columns[colIdx][fragIdx]
      const w = pdf.getTextWidth(text)
      allFragmentWidths.push({ colIdx, fragIdx, text, width: w })
    }
  }

  const totalTextWidth = allFragmentWidths.reduce((sum, f) => sum + f.width, 0)
  const totalFragments = allFragmentWidths.length

  if (totalFragments === 0) return lineHeight

  // For petucha: left-align (start from the right side in RTL)
  // For regular lines: justify with space-between
  if (line.isPetucha || totalFragments === 1) {
    // Left-aligned (RTL: start from right edge)
    const fullText = allFragmentWidths.map((f) => f.text).join(' ')
    pdf.text(fullText, x + width, y, { align: 'right', isInputRtl: true })
    return lineHeight
  }

  // Justified layout: distribute fragments across the width
  // In RTL, x is the left edge and x+width is the right edge
  // Fragments are placed from right to left
  const gap = totalFragments > 1 ? (width - totalTextWidth) / (totalFragments - 1) : 0

  // Place fragments from right to left (RTL)
  let currentX = x + width // start from right edge
  for (let i = 0; i < allFragmentWidths.length; i++) {
    const frag = allFragmentWidths[i]
    // Right-align each fragment at currentX, then move left
    pdf.text(frag.text, currentX, y, { align: 'right', isInputRtl: true })
    currentX -= frag.width + gap
  }

  return lineHeight
}

async function generateAndDownloadPDF(pageData: unknown, pageEl: HTMLElement) {
  const data = pageData as PageData
  if (data.type !== 'page' || !data.lines) return

  // Load the font
  const fontData = await loadFont()

  // Generate filename from the page content
  const verses = pageEl.querySelector(
    '.location-indicator.mod-verses'
  )?.textContent?.trim()
  const filename = verses
    ? `amud-${verses.replace(/\s+/g, '-')}`
    : 'amud'

  // Create PDF — Letter size, portrait
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter', // 612 × 792 pt
  })

  // Add the ShlomosemiStam font
  pdf.addFileToVFS('ShlomosemiStam.ttf', fontData)
  pdf.addFont('ShlomosemiStam.ttf', 'ShlomosemiStam', 'normal')
  pdf.setFont('ShlomosemiStam')

  // Page dimensions
  const pageWidth = 612 // 8.5 inches in points
  const pageHeight = 792 // 11 inches in points
  const margin = 36 // 0.5 inch margins
  const contentWidth = pageWidth - margin * 2
  const contentHeight = pageHeight - margin * 2

  // Two display columns with a divider between them
  const dividerGap = 12
  const columnWidth = (contentWidth - dividerGap) / 2

  const fontSize = 14
  const lineHeight = fontSize * 1.15

  pdf.setFontSize(fontSize)

  // Set text color
  const inkColorRaw = getComputedStyle(document.documentElement)
    .getPropertyValue('--page-ink-color')?.trim() || '#000000'
  const inkColor = cssColorToHex(inkColorRaw)
  pdf.setTextColor(inkColor)

  // Lines per PDF page
  const linesPerPage = Math.floor(contentHeight / lineHeight)

  let pdfPage = 0
  for (let i = 0; i < data.lines.length; i += linesPerPage) {
    if (pdfPage > 0) pdf.addPage()

    const startLine = i
    const endLine = Math.min(i + linesPerPage, data.lines.length)

    // Draw divider line between the two display columns
    const dividerX = margin + columnWidth + dividerGap / 2
    pdf.setDrawColor(200, 200, 200) // light gray
    pdf.setLineWidth(0.5)
    pdf.line(dividerX, margin, dividerX, pageHeight - margin)

    // Column positions (RTL layout):
    // Annotated column on the RIGHT, plain column on the LEFT
    const annotatedLeft = margin + columnWidth + dividerGap
    const plainLeft = margin

    let y = margin + fontSize

    for (let lineIdx = startLine; lineIdx < endLine; lineIdx++) {
      const line = data.lines[lineIdx]

      // Render annotated column (right side)
      renderLine(pdf, line, annotatedLeft, y, columnWidth, fontSize, true)

      // Render plain column (left side)
      renderLine(pdf, line, plainLeft, y, columnWidth, fontSize, false)

      y += lineHeight
    }

    pdfPage++
  }

  pdf.save(`${filename}.pdf`)
}