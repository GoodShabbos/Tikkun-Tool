import '/css/master.css'
import InfiniteScroller from './infinite-scroller.ts'
import ParshaPicker from './components/ParshaPicker.ts'
import utils from './components/utils.ts'
import { ScrollViewModel } from './view-model/scroll-view-model.ts'
import { LeiningInstanceId } from './calendar-model/model-types.ts'
import { toTitleCase, toAshkenaziTitle } from './calendar-model/hebcal-conversions.ts'
import { LeiningGenerator } from './calendar-model/generator.ts'
import { ScrollDisplay } from './components/ScrollDisplay.ts'
import { ViewportTracker } from './viewport-tracker.ts'
import { TopBarTracker } from './view-model/navigation/top-bar-model.ts'
import { parseUrl } from './view-model/navigation/url-parser.ts'
import { setupPrintButtons } from './components/download-amud.ts'
import { setupReportIssue } from './components/report-issue.ts'

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
let openPickerOnRender = false

const app = {
  jumpTo: (target: ScrollViewModel) => {
    display = new ScrollDisplay(
      target,
      document.querySelector('[data-target-id="tikkun-book"]')
    )

    display.rendered.then(() => {
      hideParshaPicker()
      if (openPickerOnRender) {
        openPickerOnRender = false
        showParshaPicker()
      }
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

const setPickerExpanded = (expanded: boolean) =>
  document
    .querySelector('[data-target-id="parsha-title"]')
    ?.setAttribute('aria-expanded', String(expanded))

const showParshaPicker = () => {
  ;[
    { selector: '[data-target-id="repo-link"]', visible: false },
    { selector: '[data-target-id="tikkun-book"]', visible: false },
    { selector: '[data-target-id="toggle-wrapper"]', visible: false },
    { selector: '[data-target-id="zoom-wrapper"]', visible: false },
  ].forEach(({ selector, visible }) => setVisibility({ selector, visible }))

  const jumper = ParshaPicker(generator)

  document.querySelector('#js-app').appendChild(jumper.node)
  setPickerExpanded(true)

  gtag('event', 'view', {
    event_category: 'navigation',
  })

  jumper.onMount()
}

const hideParshaPicker = () => {
  setPickerExpanded(false)
  ;[
    { selector: '[data-target-id="repo-link"]', visible: true },
    { selector: '[data-target-id="tikkun-book"]', visible: true },
  ].forEach(({ selector, visible }) => setVisibility({ selector, visible }))

  // Only show the toggle/zoom wrappers if in single-column mode
  const columnMode = document.querySelector<HTMLSelectElement>('[data-target-id="column-mode"]')?.value
  if (columnMode === 'single') {
    setVisibility({ selector: '[data-target-id="toggle-wrapper"]', visible: true })
    setVisibility({ selector: '[data-target-id="zoom-wrapper"]', visible: true })
  } else {
    setVisibility({ selector: '[data-target-id="zoom-wrapper"]', visible: false })
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

  setupPrintButtons(book)

  const reportIssueButton = document.querySelector<HTMLButtonElement>(
    '[data-target-id="report-issue"]'
  )
  if (reportIssueButton) setupReportIssue(reportIssueButton)

  const viewportTracker = new ViewportTracker(book)
  const topBarModel = new TopBarTracker()
  const titleEl = document.querySelector('[data-target-id="parsha-title-text"]')!
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
  const zoomWrapper = document.querySelector<HTMLElement>(
    '[data-target-id="zoom-wrapper"]'
  )!
  const zoomToggle = document.querySelector<HTMLButtonElement>(
    '[data-target-id="zoom-toggle"]'
  )!
  const zoomOutToggle = document.querySelector<HTMLButtonElement>(
    '[data-target-id="zoom-out-toggle"]'
  )!

  const ANNOTATIONS_KEY = 'tikkun-annotations-on'
  const ZOOM_FIT_KEY = 'tikkun-zoom-fit'

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
      // The zoom-fit button pairs with the annotations toggle (left side)
      zoomWrapper.classList.remove('u-hidden')
    } else {
      toggleWrapper.style.display = 'none'
      zoomWrapper.classList.add('u-hidden')
      // Zoom only applies to the single-column reading layout
      zoomStage = 0
      applyZoomStage(0)
      localStorage.setItem(ZOOM_FIT_KEY, '0')
    }

    // In sefer mode, force annotations off
    if (mode === 'sefer') {
      annotationsToggle.checked = false
      localStorage.setItem(ANNOTATIONS_KEY, 'false')
    }

    // Apply annotation state
    applyAnnotationState(annotationsToggle.checked)

    // In Sefer Torah mode, pre-load enough pages to create horizontal overflow
    // so the infinite scroller can work. Pages are fit-content width, so we need
    // at least 2 pages on each side for partial visibility of neighbors.
    if (mode === 'sefer' && display) {
      const loadSeferPages = async () => {
        const viewModel = display.viewModel
        // Load pages on both sides for neighbor visibility
        for (let i = 0; i < 2; i++) {
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

  // --- Zoom (single column only) ---
  // Scale the whole amud as a picture (CSS zoom on each page table) so the
  // layout — including the space between lines — is exactly the zoomed-out
  // one, uniformly enlarged. Several gentle stages instead of one extreme.
  const ZOOM_STAGES = [1, 1.35, 1.85, 2.6, Infinity] as const
  const ZOOM_STAGE_LABELS = ['Off', '135%', '185%', '260%', 'Full width']
  const zoomScaleForStage = (stage: number) => {
    if (!isFinite(ZOOM_STAGES[stage])) {
      // "Full width" — fit the amud across the screen.
      const table = book.querySelector<HTMLElement>('.tikkun-page table')
      if (!table) return 1
      const previous = book.style.getPropertyValue('--zoom-fit-s')
      book.style.setProperty('--zoom-fit-s', '1')
      const naturalWidth = table.getBoundingClientRect().width
      if (previous) {
        book.style.setProperty('--zoom-fit-s', previous)
      } else {
        book.style.removeProperty('--zoom-fit-s')
      }
      return naturalWidth > 0 ? book.clientWidth / naturalWidth : 1
    }
    return ZOOM_STAGES[stage]
  }

  const applyZoomStage = (stage: number) => {
    const stageIndex = Math.max(0, Math.min(stage, ZOOM_STAGES.length - 1))
    if (stageIndex === 0) {
      book.classList.remove('mod-zoom-fit')
      zoomToggle.classList.remove('mod-active')
      book.style.removeProperty('--zoom-fit-s')
    } else {
      book.classList.add('mod-zoom-fit')
      zoomToggle.classList.add('mod-active')
      book.style.setProperty('--zoom-fit-s', String(zoomScaleForStage(stageIndex)))
    }
    zoomToggle.dataset.zoomStage = String(stageIndex)
    const label = ZOOM_STAGE_LABELS[stageIndex]
    zoomToggle.querySelector<HTMLElement>('.zoom-stage-badge')!.textContent =
      stageIndex === 0 ? '' : stageIndex === ZOOM_STAGES.length - 1 ? 'MAX' : label.replace('%', '')
    zoomToggle.setAttribute('aria-pressed', String(stageIndex > 0))
    zoomToggle.setAttribute('data-tooltip', `Zoom: ${label} (click to change)`)
    // The inset zoom-out button is enabled whenever a stage beyond "Off" is
    // showing; it steps back down one stage at a time.
    zoomOutToggle.disabled = stageIndex === 0
  }

  let zoomStage = 0

  window.addEventListener('resize', () => {
    if (book.classList.contains('mod-zoom-fit') && zoomStage === ZOOM_STAGES.length - 1) {
      // "Full width" stage is viewport-relative; recompute it.
      book.style.setProperty('--zoom-fit-s', String(zoomScaleForStage(zoomStage)))
    }
  })

  zoomToggle.addEventListener('click', () => {
    zoomStage = (zoomStage + 1) % ZOOM_STAGES.length
    localStorage.setItem(ZOOM_FIT_KEY, String(zoomStage))
    applyZoomStage(zoomStage)
  })

  zoomOutToggle.addEventListener('click', () => {
    if (zoomStage === 0) return
    zoomStage -= 1
    localStorage.setItem(ZOOM_FIT_KEY, String(zoomStage))
    applyZoomStage(zoomStage)
  })

  // Initialize with defaults (column mode always starts single)
  const annotationsOn = localStorage.getItem(ANNOTATIONS_KEY) !== 'false' // default true
  const savedZoomStage = parseInt(localStorage.getItem(ZOOM_FIT_KEY) || '0', 10) || 0

  columnModeSelect.value = 'single'
  annotationsToggle.checked = annotationsOn

  applyColumnMode('single')
  if (savedZoomStage > 0) {
    zoomStage = savedZoomStage
    applyZoomStage(savedZoomStage)
  }

  columnModeSelect.addEventListener('change', () => {
    const mode = columnModeSelect.value as 'single' | 'double' | 'sefer'
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

  // --- Sefer Torah mode: keyboard navigation and smooth scrolling ---
  const smoothScrollHorizontal = (target: number) => {
    // CSS scroll-behavior: smooth doesn't work reliably in RTL.
    // Implement smooth scrolling manually with requestAnimationFrame.
    const start = book.scrollLeft
    const distance = target - start
    const duration = 400 // ms
    const startTime = performance.now()

    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      book.scrollLeft = start + distance * eased

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    requestAnimationFrame(animate)
  }

  // Arrow key navigation in Sefer Torah mode
  document.addEventListener('keydown', (e) => {
    if (!book.classList.contains('mod-sefer-torah')) return
    if (isShowingParshaPicker()) return

    // Scroll by one page width (the width of a .tikkun-page element)
    const firstPage = book.querySelector('.tikkun-page') as HTMLElement | null
    const scrollAmount = firstPage ? firstPage.offsetWidth + 3 : book.clientWidth // +3 for border
    const currentScrollLeft = book.scrollLeft

    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      // In RTL, ArrowLeft scrolls toward later content (more negative scrollLeft)
      smoothScrollHorizontal(currentScrollLeft - scrollAmount)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      // In RTL, ArrowRight scrolls toward earlier content (less negative scrollLeft)
      smoothScrollHorizontal(currentScrollLeft + scrollAmount)
    }
  })

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

  const appRoot = document.querySelector<HTMLElement>('.app')!
  const welcomeScreen = document.querySelector<HTMLElement>(
    '[data-target-id="welcome-screen"]'
  )!
  const setWelcomeVisible = (visible: boolean) => {
    welcomeScreen.hidden = !visible
    appRoot.classList.toggle('mod-welcome', visible)
  }
  const hasRouteHash = () => Boolean(location.hash.replace(/^#/, ''))

  setWelcomeVisible(!hasRouteHash())

  window.addEventListener('hashchange', () => {
    const newVM = parseCurrentUrl()
    if (newVM) {
      setWelcomeVisible(false)
      app.jumpTo(newVM)
      applyColumnMode(columnModeSelect.value as 'single' | 'double' | 'sefer')
    } else if (!hasRouteHash()) {
      setWelcomeVisible(true)
    }
  })

  const initialView = parseCurrentUrl()
  if (initialView) {
    app.jumpTo(initialView)
    applyColumnMode(columnModeSelect.value as 'single' | 'double' | 'sefer')
  } else if (hasRouteHash()) {
    // If the URL is invalid, default to the next leining.
    app.jumpTo(ScrollViewModel.forDate(generator, new Date()))
  }

  document.querySelector<HTMLAnchorElement>('.welcome-brand')!.addEventListener('click', (event) => {
    event.preventDefault()
    history.pushState(null, '', `${location.pathname}${location.search}`)
    setWelcomeVisible(true)
  })

  document.querySelectorAll<HTMLButtonElement>('[data-launch-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.launchMode as 'single' | 'double' | 'sefer'
      columnModeSelect.value = mode
      applyColumnMode(mode)
      setWelcomeVisible(false)

      if (location.hash === '#/next') {
        app.jumpTo(ScrollViewModel.forDate(generator, new Date()))
        applyColumnMode(mode)
      } else {
        location.hash = '#/next'
      }
    })
  })

  // "Open Tikkun" — launch the tikkun and land with the parsha picker open
  document
    .querySelector<HTMLButtonElement>('[data-target-id="open-tikkun-menu"]')
    ?.addEventListener('click', () => {
      columnModeSelect.value = 'single'
      applyColumnMode('single')
      setWelcomeVisible(false)
      if (display) {
        // Book is already rendered — just reveal the picker on top.
        showParshaPicker()
      } else {
        // First navigation is still rendering; open the picker when ready.
        openPickerOnRender = true
        if (!location.hash) location.hash = '#/next'
      }
    })

  // Label the hero button with the upcoming leining (eg, "Open Parshas Noach").
  const upcomingLeining = ScrollViewModel.leiningForDate(generator, new Date())
  const leiningLabel =
    upcomingLeining.id === LeiningInstanceId.Megillah
      ? `Megillas ${toTitleCase(upcomingLeining.runs[0].scroll)}`
      : toAshkenaziTitle(
          upcomingLeining.date.title.en.replace(/^Parshat /, 'Parshas ')
        )
  const primaryButton = document.querySelector<HTMLButtonElement>('.welcome-primary')
  if (primaryButton) primaryButton.textContent = `Open ${leiningLabel}`
})
function parseCurrentUrl(): ScrollViewModel | null {
  return parseUrl(generator, location.hash.replace(/^#/, ''))
}
