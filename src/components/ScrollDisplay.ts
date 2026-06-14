import {
  RenderedEntry,
  RenderedMessageInfo,
  RenderedPageInfo,
  ScrollViewModel,
} from '../view-model/scroll-view-model'
import Page from './Page.ts'
import utils from './utils.ts'

const { htmlToElement, purgeNode } = utils

/**
 * Renders pages of a ScrollViewModel into a root element.
 * This is used by index.ts to render the main UI, and by
 * unit tests to test code that interact with the scroll.
 */
export class ScrollDisplay {
  /** Renders an entry (from the view model) to the top of the scroll. */
  readonly renderPrevious = this.generateRender('afterbegin')
  /** Renders an entry (from the view model) to the bottom of the scroll. */
  readonly renderNext = this.generateRender('beforeend')

  /** Resolves to the starting line after all initial pages have been rendered on the root. */
  readonly rendered: Promise<HTMLElement>
  /** Resolves after we scroll to the starting line. */
  readonly scrolled: Promise<void>

  constructor(readonly viewModel: ScrollViewModel, readonly root: HTMLElement) {
    purgeNode(root)

    this.rendered = viewModel.startingLocation.then(
      async ({ page, lineNumber }) => {
        const pageNode = await this.renderNext(page)
        const lines = [...pageNode.querySelectorAll<HTMLElement>('.line')]
        const lineIndex = lineNumber - 1

        // If the target is in the top half of the page, render the previous page
        // so that we can scroll down to center the target.
        if (lineIndex < lines.length / 2) {
          const previousPage = await viewModel.fetchPreviousPage()
          if (previousPage) await this.renderPrevious(previousPage)
        } else {
          const nextPage = await viewModel.fetchNextPage()
          if (nextPage) await this.renderNext(nextPage)
        }

        return lines[lineIndex]
      }
    )
    this.scrolled = this.rendered.then(async (line) => {
      // Wait for parsha picker to close (from `this.rendered`)
      // so that we become measurable.
      await new Promise(requestAnimationFrame)
      this.scrollTo({ element: line })
    })
  }

  private scrollTo({ element }: { element: HTMLElement }) {
    const isHorizontal = this.root.classList.contains('mod-sefer-torah')

    if (isHorizontal) {
      // Horizontal mode: scroll to the page containing the target line
      const page = element.closest('.tikkun-page') as HTMLElement
      if (page) {
        // Use scrollIntoView for RTL-safe horizontal scrolling
        page.scrollIntoView({ inline: 'center', behavior: 'auto' })
      }
    } else {
      // offsetTop is the <table>.  If we just rendered
      // the previous page, we must add its top.
      const relativeTop =
        element.offsetTop + (element.offsetParent as HTMLElement).offsetTop
      this.root.scrollTop =
        relativeTop + element.offsetHeight / 2 - this.root.offsetHeight / 2
    }
    // Raise an event so that the title updates.
    this.root.dispatchEvent(new Event('scroll'))
  }

  private generateRender(insertPosition: InsertPosition) {
    return (entry: RenderedEntry) => {
      let node: Element
      if (entry.type === 'message') {
        node = renderMessageNode(entry)
      } else {
        node = renderPageNode(entry)
      }
      this.root.insertAdjacentElement(insertPosition, node)

      return node
    }
  }
}

function renderPageNode(page: RenderedPageInfo) {
  const node = document.createElement('div')
  node.classList.add('tikkun-page')
  node.tikkunPage = page

  const table = htmlToElement(Page(page))
  node.appendChild(table)

  // Add download button between the two columns
  const downloadBtn = document.createElement('button')
  downloadBtn.classList.add('download-amud-btn')
  downloadBtn.title = 'Download Amud (PDF)'
  downloadBtn.setAttribute('aria-label', 'Download Amud as PDF')
  downloadBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
  node.appendChild(downloadBtn)

  return node
}

function renderMessageNode(entry: RenderedMessageInfo) {
  const node = document.createElement('div')
  node.classList.add('tikkun-message')

  const span = document.createElement('span')
  span.classList.add('tikkun-message-text')
  span.textContent = entry.text

  node.appendChild(span)
  return node
}
