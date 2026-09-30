/**
 * Print Amud as PDF — uses the browser's native print dialog.
 *
 * The browser's text rendering engine (HarfBuzz) correctly handles Hebrew
 * combining marks (niqqud, cantillation, dagesh, shin/sin dots), which
 * jsPDF cannot do reliably because PDF viewers don't apply GPOS mark
 * positioning for jsPDF-generated fonts.
 *
 * Clicking the print button opens a small chooser with two options:
 *   - "Print with Shiemos" — print the page exactly as rendered (holy
 *     names intact).
 *   - "Print without Shiemos" — print a text-masked clone of the page
 *     where holy names (tetragrammaton, אלהי family) are replaced with
 *     non-sacred spellings (ה׳, אֱ-לֹקִים) per the no-geniza concept.
 *
 * Layout fidelity for the masked print is guaranteed by construction:
 * the clone's DOM structure, whitespace text nodes, and CSS are identical
 * to the original; only the *characters* inside existing text nodes (and
 * the `data-annotated` attribute paired with each word) change, which does
 * not affect the flex-justified layout (see css/print.css notes).
 *
 * When the user presses either option, we:
 * 1. Add a `printing-amud` class to the body (for print CSS scoping)
 * 2. Hide all tikkun pages except the one being printed
 * 3. Call window.print() to open the browser's print dialog
 * 4. Restore the page after printing
 */

import { maskHolyNames, countHolyNames } from '../holy-name.ts'

const menuLabel = (withShiemos: boolean) =>
  withShiemos ? 'Print with Shiemos' : 'Print without Shiemos'

const buildPrintMenu = (button: HTMLElement): HTMLElement => {
  const menu = document.createElement('div')
  menu.classList.add('print-options-menu')
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', 'Print options')

  const withOption = document.createElement('button')
  withOption.type = 'button'
  withOption.classList.add('print-option')
  withOption.dataset.withoutHolyNames = 'false'
  withOption.setAttribute('role', 'menuitem')
  withOption.textContent = menuLabel(true)

  const withoutOption = document.createElement('button')
  withoutOption.type = 'button'
  withoutOption.classList.add('print-option')
  withoutOption.dataset.withoutHolyNames = 'true'
  withoutOption.setAttribute('role', 'menuitem')
  withoutOption.textContent = menuLabel(false)

  menu.append(withOption, withoutOption)
  button.after(menu)

  return menu
}

/**
 * Replace holy names inside the rendered page (a clone).
 *
 * Only text characters mutate — DOM structure, whitespace text nodes,
 * and CSS are untouched, so the flex-justified layout reflows exactly.
 *
 * The plain column shows `plain` text and (on tap) swaps in
 * `data-annotated`; the annotated column shows the pointed text with
 * ktiv-kri boxes. Both must be masked consistently:
 *   - `.word-peek` span: mask its textContent AND its data-annotated,
 *   - `.fragment` in the annotated column: mask all its text nodes
 *     (ktiv-kri child spans keep their classes; we walk every text node).
 */
const maskPage = (root: HTMLElement): number => {
  let count = 0

  root
    .querySelectorAll<HTMLElement>('.tikkun-column .fragment, .word-peek')
    .forEach((el) => {
      const isWordPeek = el.classList.contains('word-peek')

      // Mask every child text node (fragment may contain .ktiv-kri spans).
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      const textNodes: Text[] = []
      while (walker.nextNode()) textNodes.push(walker.currentNode as Text)

      textNodes.forEach((node) => {
        const before = node.data
        const masked = maskHolyNames(before)
        if (masked !== before) {
          count += countHolyNames(before)
          node.data = masked
        }
      })

      if (isWordPeek && el.dataset.annotated) {
        const before = el.dataset.annotated
        const masked = maskHolyNames(before)
        if (masked !== before) {
          count += countHolyNames(before)
          el.dataset.annotated = masked
        }
      }
    })

  return count
}

/**
 * Print the page: mask holy names if requested (on a swapped-in clone),
 * open the print dialog, then restore everything.
 */
const printAmud = async (
  pageEl: HTMLElement,
  { withoutHolyNames = false }: { withoutHolyNames?: boolean } = {}
): Promise<void> => {
  document.body.classList.add('printing-amud')

  let printingElement: HTMLElement = pageEl
  let clone: HTMLElement | null = null
  const hiddenPages: HTMLElement[] = []

  if (withoutHolyNames) {
    clone = pageEl.cloneNode(true) as HTMLElement
    const maskedCount = maskPage(clone)
    console.log(`[Download] Masked ${maskedCount} holy name(s)`)

    // Swap: show the text-masked clone, hide the original.
    pageEl.after(clone)
    printingElement = clone
  }

  // Mark the page being printed so CSS can target it
  printingElement.setAttribute('data-printing', 'true')

  // Hide all other tikkun pages (including the unmasked original)
  const allPages = document.querySelectorAll('.tikkun-page')
  allPages.forEach((p) => {
    if (p !== printingElement) {
      const el = p as HTMLElement
      el.style.display = 'none'
      hiddenPages.push(el)
    }
  })

  try {
    // Open the browser's print dialog
    // The user can save as PDF from here
    window.print()
  } finally {
    // Restore all pages
    hiddenPages.forEach((el) => {
      el.style.display = ''
    })

    // Remove print markers
    printingElement.removeAttribute('data-printing')
    document.body.classList.remove('printing-amud')

    if (clone) {
      clone.remove()
    }
  }
}

/**
 * Sets up print buttons for all tikkun pages.
 * A click opens the two-option chooser instead of printing directly.
 */
export function setupPrintButtons(root: HTMLElement) {
  const closeActiveMenu = () => {
    const menu = document.querySelector<HTMLElement>('.print-options-menu.open')
    if (!menu) return false
    menu.classList.remove('open')
    const button = menu.previousElementSibling as HTMLElement | null
    button?.setAttribute('aria-expanded', 'false')
    return true
  }

  root.addEventListener('click', (e) => {
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

    // Toggle the chooser instead of printing directly.
    let menu = btn.nextElementSibling as HTMLElement | null
    if (!menu || !menu.classList.contains('print-options-menu')) {
      menu = buildPrintMenu(btn)
    }

    const isOpen = menu.classList.toggle('open')
    btn.setAttribute('aria-haspopup', 'menu')
    btn.setAttribute('aria-expanded', String(isOpen))

    if (isOpen) {
      ;(menu.querySelector('.print-option') as HTMLElement | null)?.focus()
    }
  })

  // Option clicks: actually print.
  root.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement
    const option = target.closest('.print-option') as HTMLElement | null
    if (!option) return

    const menu = option.closest('.print-options-menu') as HTMLElement
    const button = menu.previousElementSibling as HTMLElement
    const page = menu.closest('.tikkun-page') as HTMLElement | null
    if (!page) {
      console.log('[Download] No parent page found for print option')
      return
    }

    const withoutHolyNames = option.dataset.withoutHolyNames === 'true'

    menu.classList.remove('open')
    button?.setAttribute('aria-expanded', 'false')

    console.log(
      `[Download] Opening print dialog (withoutHolyNames=${withoutHolyNames})...`
    )

    button.style.pointerEvents = 'none'
    button.style.opacity = '0.5'

    try {
      await printAmud(page, { withoutHolyNames })
      console.log('[Download] Print dialog closed')
    } catch (err) {
      console.error('[Download] Print failed:', err)
    } finally {
      button.style.pointerEvents = ''
      button.style.opacity = ''
    }
  })

  // Outside-click closes an open chooser (a click on the button itself is
  // handled by the toggle handler above; this listener covers clicks
  // anywhere else in the document, incl. outside the scroller). Uses
  // capture so it still sees clicks before other handlers.
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement
      if (
        target.closest('.print-options-menu') ||
        target.closest('.download-amud-btn')
      )
        return
      closeActiveMenu()
    },
    true
  )

  // Escape closes the chooser and returns focus to the print button.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    const menu = document.querySelector<HTMLElement>(
      '.print-options-menu.open'
    )
    if (!menu) return
    menu.classList.remove('open')
    const button = menu.previousElementSibling as HTMLElement
    button?.setAttribute('aria-expanded', 'false')
    button?.focus()
  })
}