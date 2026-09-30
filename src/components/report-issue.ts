/**
 * "See something wrong?" — report an error to the site admin.
 *
 * The site is fully static, so there is no backend to POST to. Clicking the
 * button opens a modal with the admin's address and a fully pre-filled report
 * (auto-collected diagnostics) that the user can copy and paste into any mail
 * app, plus a one-click "Open in email app" mailto link for convenience. A
 * Google Analytics event is also sent so reports show up in the admin's
 * analytics even if the user never sends the email.
 */

declare function gtag(
  name: string,
  label: string,
  payload: Record<string, unknown>
): void

export const ADMIN_EMAIL = 'GoodShabbos@protonmail.com'

export type ReportKind = 'chumash' | 'tikkun'

export const REPORT_TYPES: ReadonlyArray<{
  value: ReportKind
  label: string
  hint: string
}> = [
  {
    value: 'chumash',
    label: 'Chumash text',
    hint: 'The vowels, cantillation, or spelling in the right-hand column is wrong',
  },
  {
    value: 'tikkun',
    label: 'Tikkun layout',
    hint: 'The layout, line breaks, column split, or left-hand column is wrong',
  },
]

const SUBJECT = 'Text error report — tikkun.io'

export interface ReportContext {
  url: string
  reading: string
  columnMode: string
  viewport: string
  userAgent: string
}

/** Collect the diagnostic fields that help locate the reported text. */
export const gatherContext = (): ReportContext => ({
  url: location.href,
  reading:
    document.querySelector('[data-target-id="parsha-title-text"]')?.textContent?.trim() || '',
  columnMode:
    document.querySelector<HTMLSelectElement>('[data-target-id="column-mode"]')?.value || '',
  viewport: `${window.innerWidth}x${window.innerHeight}`,
  userAgent: navigator.userAgent,
})

/**
 * Build the pre-filled email body from diagnostics. Pure in `context` so the
 * layout can be tested without a DOM. `kind` labels the error source
 * (chumash text vs tikkun layout) at the top of the report.
 */
export const buildMailBody = (
  context: ReportContext,
  kind: ReportKind = 'chumash'
): string => {
  const type = REPORT_TYPES.find((t) => t.value === kind)
  return [
    `Error type: ${type ? type.label : kind}`,
    'Describe the error you saw:',
    '',
    '',
    '— Auto-collected info (please leave intact) —',
    `Page: ${context.url}`,
    `Reading: ${context.reading}`,
    `Column layout: ${context.columnMode}`,
    `Viewport: ${context.viewport}`,
    `Browser: ${context.userAgent}`,
  ].join('\n')
}

export const buildReportSubject = (kind: ReportKind = 'chumash'): string => {
  const type = REPORT_TYPES.find((t) => t.value === kind)
  return `${type ? type.label : kind} — ${SUBJECT}`
}

export const buildMailtoLink = (): string => {
  const subject = encodeURIComponent(buildReportSubject())
  const body = encodeURIComponent(buildMailBody(gatherContext()))
  return `mailto:${ADMIN_EMAIL}?subject=${subject}&body=${body}`
}

const trackReport = (kind: ReportKind): void => {
  gtag('event', 'report_error', {
    event_category: 'feedback',
    event_label: `${kind}:${gatherContext().reading}`,
  })
}

/* ---------- Modal ---------- */

const typePillsHTML = (): string =>
  REPORT_TYPES.map(
    (type, i) => `
      <button class="report-modal__type${i === 0 ? ' mod-selected' : ''}" type="button"
        data-report-kind="${type.value}" role="radio" aria-checked="${i === 0}">
        <span class="report-modal__type-label">${type.label}</span>
        <span class="report-modal__type-hint">${type.hint}</span>
      </button>`
  ).join('')

const reportModalHTML = (): string => {
  const kind: ReportKind = 'chumash'
  return `
  <div class="report-modal-backdrop" data-report-dismiss></div>
  <div class="report-modal" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
    <button class="report-modal__close" type="button" data-report-dismiss aria-label="Close">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
    <header class="report-modal__header">
      <svg class="report-modal__flag" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </svg>
      <h2 id="report-modal-title">Report a text error</h2>
      <p class="report-modal__intro">
        Spotted a mistake? Tell the site admin what's wrong — the reading and
        page details are filled in for you.
      </p>
    </header>
    <section class="report-modal__section" role="radiogroup" aria-label="What kind of error is it?">
      <span class="report-modal__label">What kind of error is it?</span>
      <div class="report-modal__types">
        ${typePillsHTML()}
      </div>
    </section>
    <section class="report-modal__section">
      <span class="report-modal__label">To</span>
      <div class="report-modal__row">
        <code class="report-modal__email">${ADMIN_EMAIL}</code>
        <button class="report-modal__copy" type="button" data-report-copy="email">
          Copy
        </button>
      </div>
    </section>
    <section class="report-modal__section">
      <span class="report-modal__label">Subject</span>
      <div class="report-modal__row">
        <code class="report-modal__email report-modal__email--subject">${buildReportSubject(kind)}</code>
        <button class="report-modal__copy" type="button" data-report-copy="subject">
          Copy
        </button>
      </div>
    </section>
    <section class="report-modal__section">
      <span class="report-modal__label">Message</span>
      <textarea
        class="report-modal__body"
        rows="10"
        spellcheck="false"
        aria-label="Report message to copy into your email app"
      >${buildMailBody(gatherContext(), kind)}</textarea>
      <button class="report-modal__copy report-modal__copy--wide" type="button" data-report-copy="message">
        Copy message
      </button>
    </section>
    <p class="report-modal__shot">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.4-2h5.2L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
        <circle cx="12" cy="13" r="3.2" />
      </svg>
      A screenshot of the wrong spot makes fixing it much faster — please
      attach one to the email.
    </p>
    <footer class="report-modal__footer">
      <a class="report-modal__mailto" href="mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(
        buildReportSubject(kind)
      )}&body=${encodeURIComponent(buildMailBody(gatherContext(), kind))}">Open in email app</a>
      <span class="report-modal__hint">Or copy the details above into any mail app.</span>
    </footer>
  </div>
`
}

const openReportModal = (button: HTMLElement): void => {
  if (document.querySelector('.report-modal-scope')) return

  const scope = document.createElement('div')
  scope.classList.add('report-modal-scope')
  scope.innerHTML = reportModalHTML()
  document.body.appendChild(scope)

  document.body.classList.add('report-modal-open')

  let kind: ReportKind = 'chumash'
  trackReport(kind)

  const textarea = scope.querySelector<HTMLTextAreaElement>('.report-modal__body')!
  const closeButton = scope.querySelector<HTMLButtonElement>('.report-modal__close')!
  const subjectEl = scope.querySelector<HTMLElement>('.report-modal__email--subject')!
  const mailtoEl = scope.querySelector<HTMLAnchorElement>('.report-modal__mailto')!

  const syncKind = () => {
    subjectEl.textContent = buildReportSubject(kind)
    // Rewrite only the leading "Error type:" line so the label updates without
    // clobbering whatever the user already typed into the description area.
    const label = REPORT_TYPES.find((t) => t.value === kind)?.label ?? kind
    const lines = textarea.value.split('\n')
    if (lines[0]?.startsWith('Error type:')) {
      lines[0] = `Error type: ${label}`
      textarea.value = lines.join('\n')
    } else {
      textarea.value = `Error type: ${label}\n${textarea.value}`
    }
    mailtoEl.href = `mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(
      buildReportSubject(kind)
    )}&body=${encodeURIComponent(textarea.value)}`
  }

  scope.querySelectorAll<HTMLButtonElement>('[data-report-kind]').forEach((pill) => {
    pill.addEventListener('click', () => {
      kind = (pill.dataset.reportKind as ReportKind) || 'chumash'
      scope.querySelectorAll<HTMLButtonElement>('[data-report-kind]').forEach((p) => {
        const selected = p === pill
        p.classList.toggle('mod-selected', selected)
        p.setAttribute('aria-checked', String(selected))
      })
      syncKind()
    })
  })

  const dismiss = () => {
    document.body.classList.remove('report-modal-open')
    scope.remove()
    button.focus()
  }

  scope.querySelectorAll('[data-report-dismiss]').forEach((el) => {
    el.addEventListener('click', dismiss)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.querySelector('.report-modal-scope')) dismiss()
  })

  scope.querySelectorAll<HTMLButtonElement>('[data-report-copy]').forEach((copyBtn) => {
    copyBtn.addEventListener('click', async () => {
      const what = copyBtn.dataset.reportCopy
      const text =
        what === 'email'
          ? ADMIN_EMAIL
          : what === 'subject'
            ? buildReportSubject(kind)
            : textarea.value

      try {
        await navigator.clipboard.writeText(text)
        copyBtn.textContent = 'Copied!'
        copyBtn.classList.add('mod-copied')
      } catch {
        copyBtn.textContent = 'Press Ctrl+C'
        const selection = getSelection()
        if (what === 'message') {
          textarea.select()
        } else {
          const range = document.createRange()
          range.selectNodeContents(copyBtn.previousElementSibling as Node)
          selection?.removeAllRanges()
          selection?.addRange(range)
        }
        copyBtn.focus()
      } finally {
        setTimeout(() => {
          copyBtn.textContent = 'Copy'
          copyBtn.classList.remove('mod-copied')
        }, 1600)
      }
    })
  })

  closeButton.focus()
}

export const setupReportIssue = (button: HTMLElement): void => {
  button.setAttribute('aria-haspopup', 'dialog')
  button.addEventListener('click', () => openReportModal(button))
}