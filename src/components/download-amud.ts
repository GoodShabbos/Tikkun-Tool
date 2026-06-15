/**
 * Download Amud as PDF — uses the browser's native print dialog.
 *
 * The browser's text rendering engine (HarfBuzz) correctly handles Hebrew
 * combining marks (niqqud, cantillation, dagesh, shin/sin dots), which
 * jsPDF cannot do reliably because PDF viewers don't apply GPOS mark
 * positioning for jsPDF-generated fonts.
 *
 * When the user clicks the download button, we:
 * 1. Add a `printing-amud` class to the body (for print CSS scoping)
 * 2. Hide all tikkun pages except the one being printed
 * 3. Call window.print() to open the browser's print dialog
 * 4. Restore the page after printing
 *
 * The print CSS in css/print.css handles all the layout adjustments.
 */

/**
 * Sets up download buttons for all tikkun pages.
 * Uses the browser's print dialog to generate a PDF with correct
 * Hebrew text rendering (combining marks, niqqud, cantillation).
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
    if (!page) {
      console.log('[Download] No parent page found')
      return
    }

    console.log('[Download] Opening print dialog...')

    btn.style.pointerEvents = 'none'
    btn.style.opacity = '0.5'

    try {
      await printAmud(page)
      console.log('[Download] Print dialog closed')
    } catch (err) {
      console.error('[Download] Print failed:', err)
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
 * Print the current amud page using the browser's print dialog.
 *
 * This approach leverages the browser's native text rendering engine
 * (HarfBuzz) which correctly handles Hebrew combining marks — unlike
 * jsPDF which cannot reliably position these marks in PDFs.
 *
 * Steps:
 * 1. Add `printing-amud` class to <body> for print CSS scoping
 * 2. Hide all tikkun pages except the one being printed
 * 3. Calculate the maximum font size that fits one amud on one page
 * 4. Call window.print() to open the print dialog
 * 5. Restore the page after the dialog closes
 */
async function printAmud(pageEl: HTMLElement): Promise<void> {
  // Add print class to body for CSS scoping
  document.body.classList.add('printing-amud')

  // Mark the page being printed so CSS can target it
  pageEl.setAttribute('data-printing', 'true')

  // Hide all other tikkun pages
  const allPages = document.querySelectorAll('.tikkun-page')
  const hiddenPages: HTMLElement[] = []
  allPages.forEach((p) => {
    if (p !== pageEl) {
      const el = p as HTMLElement
      el.style.display = 'none'
      hiddenPages.push(el)
    }
  })

  // Save original font size so we can restore it
  const originalFontSize = pageEl.style.fontSize

  // Calculate the maximum font size that fits one amud on one page.
  // Letter paper is 11" tall with 0.4in top/bottom margins = 10.2" usable.
  // At 96 DPI, that's ~979px. We use a conservative target to account for
  // browser variations and potential sub-pixel differences.
  const maxPageHeightPx = 950 // conservative: ~10.2" at ~93 DPI
  const minFontSize = 8    // minimum readable size in px
  const maxFontSize = 24   // maximum size in px
  const precision = 0.1    // fractional px precision for best fit

  // Binary search for the largest font size that fits.
  // We use fractional sizes (0.1px precision) to maximize column size
  // while ensuring the amud fits on one page.
  let lo = minFontSize
  let hi = maxFontSize
  let bestFontSize = minFontSize

  // Temporarily make the page visible for measurement
  pageEl.style.visibility = 'hidden'

  while (hi - lo > precision) {
    const mid = Math.round(((lo + hi) / 2) * 10) / 10 // round to 0.1px
    pageEl.style.fontSize = `${mid}px`

    // Force layout recalculation
    const tableEl = pageEl.querySelector('table')
    const contentHeight = tableEl
      ? tableEl.getBoundingClientRect().height
      : pageEl.getBoundingClientRect().height

    if (contentHeight <= maxPageHeightPx) {
      bestFontSize = mid
      lo = mid + precision
    } else {
      hi = mid - precision
    }
  }

  // Apply the best font size
  pageEl.style.fontSize = `${bestFontSize}px`
  pageEl.style.visibility = ''

  try {
    // Open the browser's print dialog
    // The user can save as PDF from here
    window.print()
  } finally {
    // Restore all pages
    hiddenPages.forEach((el) => {
      el.style.display = ''
    })

    // Restore original font size
    pageEl.style.fontSize = originalFontSize

    // Remove print markers
    pageEl.removeAttribute('data-printing')
    document.body.classList.remove('printing-amud')
  }
}