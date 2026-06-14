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

    console.log('[Download] Button clicked')

    e.preventDefault()
    e.stopPropagation()

    const page = btn.closest('.tikkun-page') as HTMLElement | null
    if (!page) {
      console.log('[Download] No parent page found')
      return
    }

    const pageData = (page as HTMLElement & { tikkunPage?: unknown }).tikkunPage
    if (!pageData) {
      console.log('[Download] No page data found')
      return
    }

    console.log('[Download] Page data found, generating PDF...')

    btn.style.pointerEvents = 'none'
    btn.style.opacity = '0.5'

    try {
      await generateAndDownloadPDF(pageData, page)
      console.log('[Download] PDF generated successfully')
    } catch (err) {
      console.error('[Download] Failed to generate amud PDF:', err)
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
 * Reverse a single word's characters for RTL display in PDF,
 * keeping combining marks (niqqud, cantillation, dagesh, etc.)
 * attached to their base character.
 *
 * jsPDF draws characters left-to-right in string order. For RTL Hebrew,
 * each word's characters must be reversed so they render visually correct.
 */
function reverseWordPreservingCombiningMarks(word: string): string {
  // Build segments: each segment is a base char + its following combining marks
  const segments: string[] = []
  let i = 0
  while (i < word.length) {
    const code = word.codePointAt(i)!
    if (isHebrewCombiningMark(code) && segments.length > 0) {
      // Attach this combining mark to the previous segment's base character
      segments[segments.length - 1] += word[i]
    } else {
      // Start a new segment with this base character
      segments.push(word[i])
    }
    i++
  }
  // Reverse the segments so the word reads right-to-left visually
  return segments.reverse().join('')
}

/**
 * Reverse an entire string for RTL display in PDF.
 * Reverses both word order AND character order within each word,
 * while keeping combining marks attached to their base characters.
 *
 * Use this for direct pdf.text() calls where the entire string is
 * rendered as one unit (e.g., petucha lines).
 *
 * For renderJustifiedText (which places words individually right-to-left),
 * use reverseWordPreservingCombiningMarks on each word instead.
 */
function reverseRtlText(text: string): string {
  // Split into words, reverse each word's characters, then reverse word order
  const words = text.split(/\s+/).filter(w => w.length > 0)
  const reversedWords = words.map(w => reverseWordPreservingCombiningMarks(w))
  // Reverse word order too (first word in reading order = rightmost in visual order)
  return reversedWords.reverse().join(' ')
}

/**
 * Check if a Unicode code point is a Hebrew combining mark that should
 * stay attached to its preceding base character when reversing text.
 *
 * This includes:
 * - Cantillation marks (ta'amim): 0x0591–0x05AF
 * - Niqqud (vowel points): 0x05B0–0x05BD
 * - Dagesh/mapiq: 0x05BC (within niqqud range)
 * - Rafe: 0x05BF
 * - Shin dot: 0x05C1
 * - Sin dot: 0x05C2
 * - Upper dot (holam): 0x05C4 (covered by 0x05C0-0x05C4 but only some are combining)
 * - General Unicode combining marks: 0x0300–0x036F
 *
 * NOT included (these are standalone characters):
 * - 0x05BE (maqaf ־): hyphen connecting words, standalone
 * - 0x05C0 (paseq ׀): vertical bar, standalone
 * - 0x05C3 (sof pasuq ׃): colon-like, standalone
 * - 0x05F3 (geresh ׳): standalone punctuation
 * - 0x05F4 (gershayim ״): standalone punctuation
 */
function isHebrewCombiningMark(code: number): boolean {
  return (
    // Cantillation marks (ta'amim)
    (code >= 0x0591 && code <= 0x05AF) ||
    // Niqqud (vowel points) including dagesh
    (code >= 0x05B0 && code <= 0x05BD) ||
    // Rafe
    code === 0x05BF ||
    // Shin dot and sin dot
    code === 0x05C1 ||
    code === 0x05C2 ||
    // Holam haser (upper dot) — combining
    code === 0x05C4 ||
    code === 0x05C5 ||
    // Holam haser for qamets qatan — combining
    code === 0x05C7 ||
    // General Unicode combining diacritical marks
    (code >= 0x0300 && code <= 0x036F)
  )
}

/**
 * Render justified text by splitting into words and distributing them
 * evenly across the column width. This mimics `text-align: justify`
 * where every line fills the full width, including the "last line."
 *
 * For RTL Hebrew: words are placed from right to left.
 * The first word starts at rightX, the last word ends at leftX,
 * and equal spacing is inserted between all words.
 *
 * Each word is rendered character-by-character (base + combining marks
 * as a cluster) with explicit X positioning. This ensures combining
 * marks (niqqud, cantillation, dagesh, etc.) are positioned correctly
 * on their base character, without relying on GPOS tables which many
 * PDF viewers don't apply correctly for jsPDF-generated fonts.
 */
function renderJustifiedText(
  pdf: jsPDF,
  text: string,
  leftX: number,
  rightX: number,
  y: number,
  colWidth: number
): void {
  // Split text into words (by spaces)
  const words = text.split(/\s+/).filter(w => w.length > 0)

  if (words.length === 0) return
  if (words.length === 1) {
    // Single word: render at rightX with explicit cluster positioning
    renderWordWithClusters(pdf, words[0], rightX, y)
    return
  }

  // Calculate total width of all words
  const wordWidths = words.map(w => pdf.getTextWidth(w))
  const totalWordWidth = wordWidths.reduce((sum, w) => sum + w, 0)

  // Calculate spacing between words to fill the column width
  const totalSpacing = colWidth - totalWordWidth
  const gapBetweenWords = totalSpacing / (words.length - 1)

  // Place words from right to left (RTL)
  let currentX = rightX
  for (let i = 0; i < words.length; i++) {
    renderWordWithClusters(pdf, words[i], currentX, y)
    currentX -= wordWidths[i] + gapBetweenWords
  }
}

/**
 * Render a single word by placing each character cluster (base char +
 * combining marks) at an explicit X position. This avoids the problem
 * of PDF viewers not applying GPOS mark positioning correctly.
 *
 * The word must be in VISUAL order (reversed for RTL), with combining
 * marks kept after their base character within each cluster.
 *
 * We render right-to-left: the first cluster goes at startX (rightmost),
 * and each subsequent cluster goes to the left.
 */
function renderWordWithClusters(pdf: jsPDF, word: string, startX: number, y: number): void {
  // Split the word into clusters: each cluster is a base char + its combining marks
  const clusters = splitIntoClusters(word)
  if (clusters.length === 0) return

  // Calculate the width of each cluster.
  // For a cluster like "בְּ", getTextWidth returns the advance width of the
  // base character only (combining marks have 0 advance width).
  // We use the base character's width for positioning.
  const clusterWidths = clusters.map(c => {
    // Get the width of just the base character (first char of cluster)
    const baseChar = c[0]
    return pdf.getTextWidth(baseChar)
  })

  // Render clusters from right to left (RTL visual order)
  // The first cluster in the visual-order string is the rightmost.
  // Each cluster is rendered as a separate pdf.text() call at an explicit X
  // position, so combining marks stay with their base character.
  let currentX = startX
  for (let i = 0; i < clusters.length; i++) {
    // Render the cluster right-aligned at currentX.
    // With align:'right', the RIGHT edge of the cluster text is at currentX.
    // Since combining marks have 0 advance width, the base character occupies
    // the full cluster width, and marks overlay on top of it.
    pdf.text(clusters[i], currentX, y, { align: 'right' })
    currentX -= clusterWidths[i]
  }
}

/**
 * Split a word (in visual/reversed order) into clusters.
 * Each cluster is a base character followed by its combining marks.
 */
function splitIntoClusters(word: string): string[] {
  const clusters: string[] = []
  let i = 0
  while (i < word.length) {
    const code = word.codePointAt(i)!
    if (isHebrewCombiningMark(code) && clusters.length > 0) {
      // Attach this combining mark to the previous cluster
      clusters[clusters.length - 1] += word[i]
    } else {
      // Start a new cluster with this base character
      clusters.push(word[i])
    }
    i++
  }
  return clusters
}

/**
 * Render a line of words at a given X position, placing each word
 * using cluster-based rendering for correct mark positioning.
 * Words are placed right-to-left starting from startX.
 */
function renderWordsRightToLeft(
  pdf: jsPDF,
  words: string[],
  startX: number,
  y: number,
  gap: number = 0
): void {
  const wordWidths = words.map(w => pdf.getTextWidth(w))
  let currentX = startX
  for (let i = 0; i < words.length; i++) {
    renderWordWithClusters(pdf, words[i], currentX, y)
    currentX -= wordWidths[i] + gap
  }
}

/**
 * Render a single line of Torah text into the PDF, preserving the
 * column/fragment layout from the site.
 *
 * The site uses `text-align: justify` and `justify-content: space-between`
 * to create a "clean column" effect where each line fills the full width.
 * We replicate this by:
 * - For non-petucha lines: justifying the text to fill the column width
 * - For petucha lines: right-aligning (RTL start-align)
 * - For multi-fragment lines: distributing fragments with space-between
 * - For multi-column lines (שירה): dividing width equally among columns
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
  const rightX = leftX + colWidth
  const numColumns = line.text.length

  // Process all fragments, grouped by column.
  // Each fragment stores its words in visual order (chars reversed within
  // each word, word order preserved for RTL right-to-left placement).
  const columns: {
    fragments: {
      words: string[]  // words in visual order (chars reversed, word order preserved)
      width: number
    }[]
    totalWidth: number
  }[] = []
  for (const colFragments of line.text) {
    const frags: { words: string[]; width: number }[] = []
    for (const fragment of colFragments) {
      const processed = annotated
        ? textFilter({ text: fragment, annotated: true }).replace(/\{[^}]*\}/g, '')
        : textFilter({ text: fragment, annotated: false })
      // Split into words and reverse chars within each word (visual order)
      const words = processed.split(/\s+/).filter(w => w.length > 0)
      const visualWords = words.map(w => reverseWordPreservingCombiningMarks(w))
      const width = visualWords.reduce((sum, w) => sum + pdf.getTextWidth(w), 0)
      frags.push({ words: visualWords, width })
    }
    columns.push({
      fragments: frags,
      totalWidth: frags.reduce((sum, f) => sum + f.width, 0),
    })
  }

  const totalTextWidth = columns.reduce((sum, col) => sum + col.totalWidth, 0)

  if (totalTextWidth === 0) return lineHeight

  // For petucha lines: right-align all text (RTL start-align, no justification)
  if (line.isPetucha) {
    const allWords = columns.flatMap(col => col.fragments.flatMap(f => f.words))
    renderWordsRightToLeft(pdf, allWords, rightX, y)
    return lineHeight
  }

  // For single-column, single-fragment lines: JUSTIFY the text to fill the column width.
  if (numColumns === 1 && columns[0].fragments.length === 1) {
    const words = columns[0].fragments[0].words
    renderJustifiedText(pdf, words.join(' '), leftX, rightX, y, colWidth)
    return lineHeight
  }

  // For single-column, multi-fragment lines: distribute fragments with space-between
  if (numColumns === 1) {
    const frags = columns[0].fragments
    if (frags.length === 1) {
      renderJustifiedText(pdf, frags[0].words.join(' '), leftX, rightX, y, colWidth)
      return lineHeight
    }
    // Reverse fragment order for RTL (first fragment = rightmost)
    const reversedFrags = [...frags].reverse()
    const gap = (colWidth - columns[0].totalWidth) / (reversedFrags.length - 1)
    let currentX = rightX
    for (const frag of reversedFrags) {
      renderWordsRightToLeft(pdf, frag.words, currentX, y)
      currentX -= frag.width + gap
    }
    return lineHeight
  }

  // For multi-column lines (שירה format):
  // Each column gets an equal share of the width, with fragments
  // distributed within each column using space-between.
  // Columns are laid out from right to left (RTL).
  const subColWidth = colWidth / numColumns
  const reversedColumns = [...columns].reverse() // RTL: first column on right

  for (let colIdx = 0; colIdx < reversedColumns.length; colIdx++) {
    const col = reversedColumns[colIdx]
    const colLeftX = leftX + colIdx * subColWidth
    const colRightX = colLeftX + subColWidth

    if (col.fragments.length === 1) {
      // Justify single-fragment columns to fill their sub-column width
      renderJustifiedText(pdf, col.fragments[0].words.join(' '), colLeftX, colRightX, y, subColWidth)
    } else {
      // Distribute fragments within the column using space-between
      const frags = [...col.fragments].reverse() // RTL within column
      const gap = (subColWidth - col.totalWidth) / (frags.length - 1)
      let currentX = colRightX
      for (const frag of frags) {
        renderWordsRightToLeft(pdf, frag.words, currentX, y)
        currentX -= frag.width + gap
      }
    }
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

  // Patch jsPDF's font subsetting to include GPOS/GSUB/GDEF tables.
  // By default, jsPDF strips these OpenType tables when subsetting the font,
  // which causes combining marks (niqqud, cantillation, dagesh, shin/sin dots)
  // to render at incorrect positions in the PDF. Including these tables
  // allows the PDF viewer to use the font's GPOS data to position marks
  // correctly on their base characters.
  const fontObj = pdf.getFont()
  if (fontObj.metadata?.subset && fontObj.metadata?.directory) {
    const subset = fontObj.metadata.subset
    const directory = fontObj.metadata.directory
    const contents = fontObj.metadata.contents
    const originalDirEncode = directory.encode.bind(directory)
    directory.encode = function (tables: Record<string, unknown>) {
      // Add GPOS, GSUB, and GDEF tables from the original font
      for (const tag of ['GPOS', 'GSUB', 'GDEF'] as const) {
        const tableInfo = directory.tables[tag]
        if (tableInfo) {
          contents.pos = tableInfo.offset
          tables[tag] = contents.read(tableInfo.length)
        }
      }
      return originalDirEncode(tables)
    }
  }

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

  // Check if the widest line fits; if not, reduce font size.
  // For multi-column lines, each column's text must fit within its
  // proportional share of the column width.
  const maxLineIterations = 10
  for (let iter = 0; iter < maxLineIterations; iter++) {
    let maxOverflow = 0
    for (const line of data.lines) {
      const numCols = line.text.length
      const subColWidth = numCols > 1 ? columnWidth / numCols : columnWidth
      for (const colFragments of line.text) {
        const lineText = colFragments
          .map((f) => {
            const processed = textFilter({ text: f, annotated: true }).replace(/\{[^}]*\}/g, '')
            return processed
          })
          .join(' ')
        const w = pdf.getTextWidth(lineText)
        const overflow = w - subColWidth
        if (overflow > maxOverflow) maxOverflow = overflow
      }
    }
    if (maxOverflow <= 0) break
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