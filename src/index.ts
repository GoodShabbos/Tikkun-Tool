import '/css/master.css'
import InfiniteScroller from './infinite-scroller.ts'
import ParshaPicker from './components/ParshaPicker.ts'
import utils from './components/utils.ts'
import { ScrollViewModel } from './view-model/scroll-view-model.ts'
import { LeiningGenerator } from './calendar-model/generator.ts'
import { ScrollDisplay } from './components/ScrollDisplay.ts'
import { ViewportTracker } from './viewport-tracker.ts'
import { TopBarTracker } from './view-model/navigation/top-bar-model.ts'
import { parseUrl } from './view-model/navigation/url-parser.ts'
import { setupDownloadButtons } from './components/download-amud.ts'

declare function gtag(
  name: 'event',
  label: string,
  payload: Record<string, unknown>
): void

const { whenKey } = utils

// TODO(later): Add settings UI
const generator = new LeiningGenerator({
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
})
let display: ScrollDisplay

const app = {
  jumpTo: (target: ScrollViewModel) => {
    display = new ScrollDisplay(
      target,
      document.querySelector('[data-target-id="tikkun-book"]')
    )

    display.rendered.then(() => {
      hideParshaPicker()
    })
  },
}

const setVisibility = ({
  selector,
  visible,
}: {
  selector: string
  visible: boolean
}) => {
  const classList = document.querySelector(selector).classList

  classList.toggle('u-hidden', !visible)
  classList.toggle('mod-animated', !visible)
}

const showParshaPicker = () => {
  ;[
    { selector: '[data-target-id="repo-link"]', visible: false },
    { selector: '[data-target-id="tikkun-book"]', visible: false },
    { selector: '[data-target-id="toggle-wrapper"]', visible: false },
  ].forEach(({ selector, visible }) => setVisibility({ selector, visible }))

  const jumper = ParshaPicker(generator)

  document.querySelector('#js-app').appendChild(jumper.node)

  gtag('event', 'view', {
    event_category: 'navigation',
  })

  jumper.onMount()
}

const hideParshaPicker = () => {
  ;[
    { selector: '[data-target-id="repo-link"]', visible: true },
    { selector: '[data-target-id="tikkun-book"]', visible: true },
  ].forEach(({ selector, visible }) => setVisibility({ selector, visible }))

  // Only show the toggle wrapper if in single-column mode
  const columnMode = document.querySelector<HTMLSelectElement>('[data-target-id="column-mode"]')?.value
  if (columnMode === 'single') {
    setVisibility({ selector: '[data-target-id="toggle-wrapper"]', visible: true })
  }

  if (document.querySelector('.parsha-picker'))
    document
      .querySelector('#js-app')
      .removeChild(document.querySelector('.parsha-picker'))
}

const isShowingParshaPicker = () =>
  Boolean(document.querySelector('.parsha-picker'))

const toggleParshaPicker = () => {
  if (isShowingParshaPicker()) {
    hideParshaPicker()
  } else {
    showParshaPicker()
  }
}

const scrollState: { lastScrolledPosition: number; pageAtTop: HTMLElement } = {
  lastScrolledPosition: 0,
  pageAtTop: null,
}

const resumeLastScrollPosition = () => {
  if (!scrollState.pageAtTop) return
  const book = document.querySelector('.tikkun-book')
  const pageRect = scrollState.pageAtTop.getBoundingClientRect()

  book.scrollTop =
    scrollState.pageAtTop.offsetTop +
    scrollState.lastScrolledPosition * pageRect.height
}

const rememberLastScrolledPosition = () => {
  const book = document.querySelector('.tikkun-book')
  const bookBoundingRect = book.getBoundingClientRect()

  const topOfBookRelativeToViewport = {
    x: bookBoundingRect.left + bookBoundingRect.width / 2,
    y: bookBoundingRect.top,
  }

  const pageAtTop = [
    ...(document.elementsFromPoint(
      topOfBookRelativeToViewport.x,
      topOfBookRelativeToViewport.y
    ) as HTMLElement[]),
  ].find((el) => typeof el.className === 'string' && el.className.includes('tikkun-page'))

  if (!pageAtTop) return

  scrollState.pageAtTop = pageAtTop
  scrollState.lastScrolledPosition =
    (book.scrollTop - pageAtTop.offsetTop) / pageAtTop.clientHeight
}

const debounce = (callback: () => void, delay: number) => {
  let timeout: ReturnType<typeof setTimeout>
  return () => {
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      callback()
    }, delay)
  }
}

const listenForRevealGesture = (book: HTMLElement) => {
  const PULL_THRESHOLD = 30 // px
  const PULL_MAXIMUM = 100

  const endTouch = () => {
    book.classList.add('mod-pull-releasing')

    book.style.setProperty('--pull-translation', `0`)
  }

  let startX = 0

  book.addEventListener('touchstart', (e) => {
    book.classList.remove('mod-pull-releasing')

    startX = e.changedTouches[0].screenX
  })

  book.addEventListener('touchmove', (e) => {
    const touchX = e.changedTouches[0].screenX
    const pullDistance = -Math.max(touchX - startX, -PULL_MAXIMUM)

    if (pullDistance < PULL_THRESHOLD) return

    book.style.setProperty(
      '--pull-translation',
      `${PULL_THRESHOLD - pullDistance}px`
    )
  })

  book.addEventListener('touchend', endTouch)

  book.addEventListener('touchcancel', endTouch)
}

const setAppHeight = () => {
  // This prevents double-scroll bars from the inner "book" scrolling
  // when on browsers that have browser "chrome" (like the tab bar),
  // especially on mobile browsers
  document.documentElement.style.setProperty(
    '--app-height',
    `${window.innerHeight}px`
  )
}

document.addEventListener('resize', setAppHeight)

document.addEventListener('DOMContentLoaded', async () => {
  const book = document.querySelector<HTMLElement>(
    '[data-target-id="tikkun-book"]'
  )!

  setupDownloadButtons(book)

  const viewportTracker = new ViewportTracker(book)
  const topBarModel = new TopBarTracker()
  const titleEl = document.querySelector('[data-target-id="parsha-title"]')!
  viewportTracker.on('viewport-updated', (range) => {
    if (!display.viewModel) return
    // TODO: Noop if nothing changed?
    topBarModel.setLine(display.viewModel, range)

    // TODO: Render actual top bar.
    const run = topBarModel.info.currentRun
    titleEl.textContent = `${run?.leining.date.title.he} ${
      run?.leining.id
    }: ${topBarModel.info.aliyahRange.join(' – ')}`
  })

  book.addEventListener('mouseover', (e) => {
    const line = document
      .elementsFromPoint(e.x, e.y)
      .find((e) => typeof e.className === 'string' && e.className.includes('line'))
    console.log(line)
  })

  InfiniteScroller.new({
    container: book,
    fetchPreviousContent: {
      fetch: () => display.viewModel.fetchPreviousPage(),
      render: (entry) => display.renderPrevious(entry),
    },
    fetchNextContent: {
      fetch: () => display.viewModel.fetchNextPage(),
      render: (entry) => display.renderNext(entry),
    },
  }).attach()

  book.addEventListener(
    'scroll',
    debounce(() => {
      rememberLastScrolledPosition()
    }, 1000)
  )

  listenForRevealGesture(book)

  window.addEventListener('resize', () => {
    resumeLastScrollPosition()
  })

  // watchForHighlighting()

  // --- Column mode dropdown ---
  const columnModeSelect = document.querySelector<HTMLSelectElement>(
    '[data-target-id="column-mode"]'
  )!
  const toggleWrapper = document.querySelector<HTMLElement>(
    '[data-target-id="toggle-wrapper"]'
  )!
  const annotationsToggle = document.querySelector<HTMLInputElement>(
    '[data-target-id="annotations-toggle"]'
  )!

  const COLUMN_MODE_KEY = 'tikkun-column-mode'
  const ANNOTATIONS_KEY = 'tikkun-annotations-on'

  const applyColumnMode = (mode: 'single' | 'double' | 'sefer') => {
    const book = document.querySelector<HTMLElement>('[data-target-id="tikkun-book"]')!
    book.classList.toggle('mod-single-column', mode === 'single')
    book.classList.toggle('mod-double-column', mode === 'double')
    book.classList.toggle('mod-sefer-torah', mode === 'sefer')

    // Show/hide the annotation toggle based on column mode
    // In double-column mode, both columns are always visible so toggle is hidden
    // In single-column mode, toggle switches which column is shown
    // In sefer-torah mode, annotations are always off so toggle is hidden
    if (mode === 'single') {
      toggleWrapper.style.display = ''
      toggleWrapper.classList.remove('u-hidden', 'mod-animated')
    } else {
      toggleWrapper.style.display = 'none'
    }

    // In sefer mode, force annotations off
    if (mode === 'sefer') {
      annotationsToggle.checked = false
      localStorage.setItem(ANNOTATIONS_KEY, 'false')
    }

    // Apply annotation state
    applyAnnotationState(annotationsToggle.checked)

    // In Sefer Torah mode, pre-load enough pages to create horizontal overflow
    // so the infinite scroller can work. Pages are ~42% wide, so we need
    // at least 3 pages to overflow the viewport.
    if (mode === 'sefer' && display) {
      const loadSeferPages = async () => {
        const viewModel = display.viewModel
        // Load pages on both sides until we have enough for overflow
        for (let i = 0; i < 3; i++) {
          const prev = await viewModel.fetchPreviousPage()
          if (prev) display.renderPrevious(prev)
          const next = await viewModel.fetchNextPage()
          if (next) display.renderNext(next)
        }
        // Dispatch a scroll event to kick the infinite scroller
        book.dispatchEvent(new Event('scroll'))
      }
      loadSeferPages()
    }
  }

  const applyAnnotationState = (annotationsOn: boolean) => {
    const book = document.querySelector<HTMLElement>('[data-target-id="tikkun-book"]')!
    book.classList.toggle('mod-annotations-on', annotationsOn)
    book.classList.toggle('mod-annotations-off', !annotationsOn)
  }

  // Initialize from localStorage or defaults
  const savedColumnMode = (localStorage.getItem(COLUMN_MODE_KEY) as 'single' | 'double' | 'sefer') || 'double'
  const savedAnnotations = localStorage.getItem(ANNOTATIONS_KEY) !== 'false' // default true

  columnModeSelect.value = savedColumnMode
  annotationsToggle.checked = savedAnnotations

  applyColumnMode(savedColumnMode)

  columnModeSelect.addEventListener('change', () => {
    const mode = columnModeSelect.value as 'single' | 'double' | 'sefer'
    localStorage.setItem(COLUMN_MODE_KEY, mode)
    applyColumnMode(mode)
  })

  // --- Annotations toggle ---
  const toggleAnnotations = (getPreviousCheckedState: () => boolean) => {
    annotationsToggle.checked = !getPreviousCheckedState()
    localStorage.setItem(ANNOTATIONS_KEY, String(annotationsToggle.checked))
    applyAnnotationState(annotationsToggle.checked)
  }

  annotationsToggle.addEventListener('change', () => {
    localStorage.setItem(ANNOTATIONS_KEY, String(annotationsToggle.checked))
    applyAnnotationState(annotationsToggle.checked)
  })

  document.addEventListener(
    'keydown',
    whenKey('Shift', () => toggleAnnotations(() => annotationsToggle.checked))
  )
  document.addEventListener(
    'keyup',
    whenKey('Shift', () => toggleAnnotations(() => annotationsToggle.checked))
  )

  // --- Word peek: click a word in single-column + annotations-off to reveal its annotated form ---
  let peekingWord: HTMLSpanElement | null = null
  let peekTimeout: ReturnType<typeof setTimeout> | null = null

  const revertPeek = () => {
    if (!peekingWord) return
    const plain = peekingWord.textContent
    const annotated = peekingWord.dataset.annotated
    if (plain && annotated) {
      peekingWord.textContent = annotated
      peekingWord.dataset.annotated = plain
    }
    peekingWord.classList.remove('mod-peeking')
    peekingWord = null
    if (peekTimeout) {
      clearTimeout(peekTimeout)
      peekTimeout = null
    }
  }

  const peekWord = (span: HTMLSpanElement) => {
    // Revert any currently peeking word
    if (peekingWord && peekingWord !== span) {
      revertPeek()
    }

    // Toggle: if already peeking, revert
    if (span.classList.contains('mod-peeking')) {
      revertPeek()
      return
    }

    // Swap plain ↔ annotated
    const plain = span.textContent
    const annotated = span.dataset.annotated
    if (plain && annotated) {
      span.textContent = annotated
      span.dataset.annotated = plain
    }
    span.classList.add('mod-peeking')
    peekingWord = span

    // Auto-revert after 2 seconds
    peekTimeout = setTimeout(revertPeek, 2000)
  }

  book.addEventListener('click', (e) => {
    // Only activate in single-column + annotations-off, or sefer-torah mode
    const isSinglePeek = book.classList.contains('mod-single-column') && book.classList.contains('mod-annotations-off')
    const isSeferPeek = book.classList.contains('mod-sefer-torah')
    if (!isSinglePeek && !isSeferPeek) return

    const target = e.target as HTMLElement
    const wordSpan = target.closest<HTMLSpanElement>('.word-peek')
    if (wordSpan) {
      e.preventDefault()
      peekWord(wordSpan)
    }
  })

  // Escape key also reverts peeking word
  document.addEventListener('keydown', whenKey('Escape', () => {
    if (peekingWord) revertPeek()
  }))

  document
    .querySelector('[data-target-id="parsha-title"]')
    .addEventListener('click', toggleParshaPicker)
  document.addEventListener('keydown', whenKey('/', toggleParshaPicker))

  document.addEventListener(
    'keydown',
    whenKey('Escape', (e) => {
      if (isShowingParshaPicker()) {
        e.preventDefault()
        hideParshaPicker()
      }
    })
  )

  setAppHeight()

  window.addEventListener('hashchange', () => {
    const newVM = parseCurrentUrl()
    if (newVM) app.jumpTo(newVM)
  })

  app.jumpTo(
    parseCurrentUrl() ??
      // If the URL is invalid, default to the next leining.
      ScrollViewModel.forDate(generator, new Date())
  )
})
function parseCurrentUrl(): ScrollViewModel | null {
  return parseUrl(generator, location.hash.replace(/^#/, ''))
}
