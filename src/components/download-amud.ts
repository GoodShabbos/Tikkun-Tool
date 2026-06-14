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
 * Fragments within a line are distributed with space-between justification,
 * matching the site's layout. For petucha lines, text is right-aligned.
 *
 * All coordinates use LTR: x increases left-to-right.
 * Hebrew text is rendered right-aligned within each column.
 */
function renderLine(
  pdf: jsPDF,
  line: LineData,
  leftX: number,
  y: number,
  colWidth: number,
  fontSize: number,
  annotated: boolean
): number {
  const lineHeight = fontSize * 1.15
  const rightX = leftX + colWidth // right edge of the column

  // Process fragments: flatten all columns/fragments into a single list
  const fragments: { text: string; width: number }[] = []
  for (const colFragments of line.text) {
    for (const fragment of colFragments) {
      const processed = annotated
        ? textFilter({ text: fragment, annotated: true }).replace(/\{[^}]*\}/g, '')
        : textFilter({ text: fragment, annotated: false })
      fragments.push({ text: processed, width: pdf.getTextWidth(processed) })
    }
  }

  if (fragments.length === 0) return lineHeight

  const totalTextWidth = fragments.reduce((sum, f) => sum + f.width, 0)

  // For petucha or single-fragment lines: right-align the full text
  if (line.isPetucha || fragments.length === 1) {
    const fullText = fragments.map((f) => f.text).join(' ')
    // Place text so its right edge aligns with the column's right edge
    // Use align:'left' and calculate x position manually for reliability
    const textX = rightX - pdf.getTextWidth(fullText)
    pdf.text(fullText, textX, y)
    return lineHeight
  }

  // Justified layout: distribute fragments across the column width
  // Place fragments from right to left (RTL reading order)
  const gap = (colWidth - totalTextWidth) / (fragments.length - 1)

  let currentX = rightX // start from right edge
  for (let i = 0; i < fragments.length; i++) {
    const frag = fragments[i]
    // Place fragment so its right edge is at currentX
    const fragX = currentX - frag.width
    pdf.text(frag.text, fragX, y)
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

  // Determine the best font size: start with a size and shrink if the
  // widest line doesn't fit in the column width
  let fontSize = 14
  const lineHeightMultiplier = 1.15

  pdf.setFontSize(fontSize)

  // Check if the widest line fits; if not, reduce font size
  const maxLineIterations = 10
  for (let iter = 0; iter < maxLineIterations; iter++) {
    let maxWidth = 0
    for (const line of data.lines) {
      for (const colFragments of line.text) {
        const lineText = colFragments
          .map((f) => {
            const processed = textFilter({ text: f, annotated: true }).replace(/\{[^}]*\}/g, '')
            return processed
          })
          .join(' ')
        const w = pdf.getTextWidth(lineText)
        if (w > maxWidth) maxWidth = w
      }
    }
    // The widest single-column text should fit within the column width
    // with some margin for the justified layout
    if (maxWidth <= columnWidth * 1.05) break
    fontSize -= 0.5
    pdf.setFontSize(fontSize)
  }

  const lineHeight = fontSize * lineHeightMultiplier

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
    // Annotated column on the RIGHT side, plain column on the LEFT side
    const annotatedLeftX = margin + columnWidth + dividerGap
    const plainLeftX = margin

    let y = margin + fontSize

    for (let lineIdx = startLine; lineIdx < endLine; lineIdx++) {
      const line = data.lines[lineIdx]

      // Render annotated column (right side)
      renderLine(pdf, line, annotatedLeftX, y, columnWidth, fontSize, true)

      // Render plain column (left side)
      renderLine(pdf, line, plainLeftX, y, columnWidth, fontSize, false)

      y += lineHeight
    }

    pdfPage++
  }

  pdf.save(`${filename}.pdf`)
}