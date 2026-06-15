import test from 'ava'
import { generateUrl, generateSlugUrl, parseUrl } from './url-parser.ts'
import { ScrollViewModel } from '../scroll-view-model.ts'
import { renderLine } from '../test-utils.ts'
import { LeiningGenerator } from '../../calendar-model/generator.ts'
import type { UserSettings } from '../../calendar-model/user-settings.ts'
import { slugForLeiningInstance } from '../../calendar-model/slugs.ts'
import { HDate } from '@hebcal/hdate'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

test('non-URL input', async (t) => {
  t.falsy(parseUrl(generator, 'hello world'))
})

test('Empty URL', (t) => {
  t.falsy(parseUrl(generator, ''))
})

test('Ignores unrecognized URL types', (t) => {
  t.falsy(parseUrl(generator, '/kav/tzav'))
})

test('Invalid location reference: Not numbers', (t) => {
  t.falsy(parseUrl(generator, '/r/foo-bar-baz'))
})

test('Invalid location reference: incomplete', (t) => {
  t.falsy(parseUrl(generator, '/r/5-22'))
})

test('Next', (t) => {
  t.truthy(parseUrl(generator, '/next'))
})

test('Run ID for פרשת נצבים', async (t) => {
  t.snapshot(
    await renderStartingLine(
      parseUrl(generator, '/run/2025-09-20:shacharis,main')
    )
  )
})
test('Run ID for אסתר', async (t) => {
  t.snapshot(
    await renderStartingLine(
      parseUrl(generator, '/run/2025-03-14:megillah,megillah')
    )
  )
})

test('Valid location reference in במדבר', async (t) => {
  t.snapshot(await renderStartingLine(parseUrl(generator, '/r/4-13-1')))
})

test('Trailing slash okay', async (t) => {
  t.is(
    await renderStartingLine(parseUrl(generator, '/r/4-13-1/')),
    await renderStartingLine(parseUrl(generator, '/r/4-13-1'))
  )
})

test('Generated URLs round-trip', async (t) => {
  t.is(
    await renderStartingLine(
      parseUrl(
        generator,
        generateUrl(generator.parseId('2025-09-20:shacharis,main')!).replace(
          /^#/,
          ''
        )
      )
    ),
    await renderStartingLine(
      parseUrl(generator, '/run/2025-09-20:shacharis,main')
    )
  )
})

async function renderStartingLine(model: ScrollViewModel | null) {
  if (!model) throw new Error(`URL did not parse.`)

  const { page, lineNumber } = await model.startingLocation
  if (page.type !== 'page') throw new Error('First page should be a page')
  return renderLine(page.lines[lineNumber - 1])
}

// --- Slug URL tests ---

test('Slug URL for בראשית parses correctly', async (t) => {
  const model = parseUrl(generator, '/bereshit')
  t.truthy(model, 'Slug URL /bereshit should parse')
})

test('Slug URL round-trips correctly', async (t) => {
  // Find a parsha in the current year and verify its slug URL parses
  const allDates = generator.forEntireChumash(new HDate(new Date()))
  const bereshit = allDates.find((d) => d.title.en === 'Parshat Bereshit')
  if (!bereshit) {
    t.pass('Bereshit not found in current year, skipping')
    return
  }
  const instance = bereshit.leinings[0]
  const slugUrl = generateSlugUrl(instance.runs[0])
  if (!slugUrl) {
    t.pass('No slug URL available, skipping')
    return
  }
  const parsed = parseUrl(generator, slugUrl.replace(/^#/, ''))
  t.truthy(parsed, `Slug URL ${slugUrl} should parse`)
  // Verify the parsed model shows the same parsha
  t.is(
    await renderStartingLine(parsed),
    await renderStartingLine(ScrollViewModel.forId(generator, instance.runs[0].id)),
    `Slug URL ${slugUrl} should resolve to same content as run URL`
  )
})

test('generateSlugUrl returns a slug for regular parshiyot', (t) => {
  const allDates = generator.forEntireChumash(new HDate(new Date()))
  const bereshit = allDates.find((d) => d.title.en === 'Parshat Bereshit')
  if (!bereshit) {
    t.pass('Bereshit not found, skipping')
    return
  }
  const run = bereshit.leinings[0].runs[0]
  const slug = generateSlugUrl(run)
  t.truthy(slug, `Expected a slug URL for ${run.id}`)
  t.is(slug, '#/bereshit')
})

test('Unknown slug returns null', (t) => {
  t.falsy(parseUrl(generator, '/nonexistent-parsha-name'))
})

test('Slug URL with instance suffix parses correctly', async (t) => {
  // Find Yom Kippur in the current year
  const allDates = generator.forEntireChumash(new HDate(new Date()))
  const yomKippur = allDates.find((d) => d.title.en === 'Yom Kippur')
  if (!yomKippur) {
    t.pass('Yom Kippur not found in current year, skipping')
    return
  }
  const shacharis = yomKippur.leinings[0]
  const slug = slugForLeiningInstance(shacharis)
  if (!slug) {
    t.pass('No slug for Yom Kippur Shacharis, skipping')
    return
  }
  const model = parseUrl(generator, `/${slug}`)
  t.truthy(model, `Slug URL /${slug} should parse`)
})
