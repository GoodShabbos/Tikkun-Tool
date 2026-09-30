import test from 'ava'
import {
  buildMailBody,
  buildReportSubject,
  REPORT_TYPES,
  ADMIN_EMAIL,
  type ReportContext,
} from './report-issue.ts'

/* Note: buildMailtoLink / setupReportIssue / openReportModal touch DOM globals
   (location, document, clipboard), so they are exercised in the browser
   (ScrollDisplay.vitest.ts style) rather than here. */

const sampleContext: ReportContext = {
  url: 'https://tikkun.io/#/bereshit',
  reading: 'בראשית פרק א: יב – כה',
  columnMode: 'double',
  viewport: '1440x900',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
}

test('subject identifies the site', (t) => {
  t.true(buildReportSubject().includes('tikkun.io'))
})

test('default kind labels the error as chumash text', (t) => {
  t.true(buildMailBody(sampleContext).startsWith('Error type: Chumash text'))
  t.true(buildReportSubject().startsWith('Chumash text'))
})

test('tikkun kind labels the error as a layout issue', (t) => {
  t.true(buildMailBody(sampleContext, 'tikkun').startsWith('Error type: Tikkun layout'))
  t.true(buildReportSubject('tikkun').startsWith('Tikkun layout'))
})

test('both report kinds are offered with labels and hints', (t) => {
  t.is(REPORT_TYPES.length, 2)
  t.deepEqual(
    REPORT_TYPES.map((type) => type.value),
    ['chumash', 'tikkun']
  )
  REPORT_TYPES.forEach((type) => {
    t.true(type.label.length > 0)
    t.true(type.hint.length > 0)
  })
})

test('body starts with the error type, then the prompt', (t) => {
  const body = buildMailBody(sampleContext)
  t.true(body.includes('Describe the error you saw:'))
  t.true(body.indexOf('Error type:') < body.indexOf('Describe the error'))
})

test('body includes the auto-collected info section', (t) => {
  const body = buildMailBody(sampleContext)
  t.true(body.includes('— Auto-collected info (please leave intact) —'))
  t.true(body.includes('Page: '))
})

test('body contains one blank line for the user to type into', (t) => {
  t.true(buildMailBody(sampleContext).includes('\n\n\n'))
})

test('body carries every diagnostic field', (t) => {
  const body = buildMailBody(sampleContext)
  t.true(body.includes(`Page: ${sampleContext.url}`))
  t.true(body.includes(`Reading: ${sampleContext.reading}`))
  t.true(body.includes(`Column layout: ${sampleContext.columnMode}`))
  t.true(body.includes(`Viewport: ${sampleContext.viewport}`))
  t.true(body.includes(`Browser: ${sampleContext.userAgent}`))
})

test('body tolerates missing diagnostics (all fields optional at runtime)', (t) => {
  const body = buildMailBody({
    url: '',
    reading: '',
    columnMode: '',
    viewport: '',
    userAgent: '',
  })
  t.true(body.includes('Page: '))
  t.true(body.includes('Reading: '))
})

test('admin email is a valid-looking address', (t) => {
  t.regex(ADMIN_EMAIL, /^[^\s@]+@[^\s@]+\.[^\s@]+$/)
})

test('admin email contains no characters that would break an mailto URL', (t) => {
  t.false(/[?&=]/.test(ADMIN_EMAIL))
})

test('body encodes cleanly for a mailto URL', (t) => {
  const encoded = encodeURIComponent(buildMailBody(sampleContext))
  t.true(encoded.length > 0)
  t.false(/%00/.test(encoded))
})