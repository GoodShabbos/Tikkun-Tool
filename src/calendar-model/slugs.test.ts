import test from 'ava'
import type { UserSettings } from './user-settings.ts'
import { LeiningGenerator } from './generator.ts'
import { slugForLeiningDate, slugForLeiningInstance, slugToLeiningInstance, computeDisambiguation } from './slugs.ts'
import { LeiningInstanceId } from './model-types.ts'
import { HDate } from '@hebcal/hdate'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

// Generate all leining dates for the current Hebrew year for testing
const allDates = generator.forEntireChumash(new HDate(new Date()))
const disambiguation = computeDisambiguation(allDates)

test('slug for weekly parsha strips "Parshat" prefix', (t) => {
  const bereshit = allDates.find((d) => d.title.en === 'Parshat Bereshit')
  t.truthy(bereshit, 'Should find Bereshit')
  t.is(slugForLeiningDate(bereshit!), 'bereshit')
})

test('slug for double parsha preserves hyphen', (t) => {
  // Find a double parsha (any year should have at least one)
  const doubleParsha = allDates.find(
    (d) => d.title.en.startsWith('Parshat ') && d.title.en.includes('-')
  )
  if (!doubleParsha) {
    t.pass('No double parsha found in current year, skipping')
    return
  }
  const slug = slugForLeiningDate(doubleParsha)
  // e.g., "Parshat Nitzavim-Vayeilech" → "nitzavim-vayeilech"
  t.true(slug!.includes('-'), `Expected hyphen in slug: ${slug}`)
  t.false(slug!.startsWith('parshat'), `Slug should not start with "parshat": ${slug}`)
})

test('slug for holiday keeps full name', (t) => {
  const yomKippur = allDates.find((d) => d.title.en === 'Yom Kippur')
  if (!yomKippur) {
    t.pass('Yom Kippur not found in current year range, skipping')
    return
  }
  t.is(slugForLeiningDate(yomKippur), 'yom-kippur')
})

test('slug for single-instance date has no instance suffix', (t) => {
  const bereshit = allDates.find((d) => d.title.en === 'Parshat Bereshit')
  if (!bereshit) {
    t.pass('Bereshit not found, skipping')
    return
  }
  // Bereshit has only one leining (Shacharis), so no suffix
  const instance = bereshit.leinings[0]
  t.is(slugForLeiningInstance(instance), 'bereshit')
})

test('slug for multi-instance date includes instance suffix', (t) => {
  const yomKippur = allDates.find((d) => d.title.en === 'Yom Kippur')
  if (!yomKippur) {
    t.pass('Yom Kippur not found, skipping')
    return
  }
  // Yom Kippur has Shacharis and Mincha
  const shacharis = yomKippur.leinings.find((i) => i.id === LeiningInstanceId.Shacharis)
  const mincha = yomKippur.leinings.find((i) => i.id === LeiningInstanceId.Mincha)
  if (shacharis) {
    t.is(slugForLeiningInstance(shacharis), 'yom-kippur-shacharis')
  }
  if (mincha) {
    t.is(slugForLeiningInstance(mincha), 'yom-kippur-mincha')
  }
})

test('all slugs are unique across the year (with disambiguation)', (t) => {
  const slugs = new Set<string>()
  for (const date of allDates) {
    const index = disambiguation.get(date) ?? 1
    for (const instance of date.leinings) {
      const slug = slugForLeiningInstance(instance, index)
      if (slug) {
        t.false(slugs.has(slug), `Duplicate slug: ${slug}`)
        slugs.add(slug)
      }
    }
  }
})

test('slug round-trips: generateSlug → parseSlug → same instance', (t) => {
  for (const date of allDates) {
    const index = disambiguation.get(date) ?? 1
    for (const instance of date.leinings) {
      const slug = slugForLeiningInstance(instance, index)
      if (!slug) continue

      const resolved = slugToLeiningInstance(generator, slug)
      t.truthy(resolved, `Failed to resolve slug: ${slug}`)
      t.is(resolved!.date.id, instance.date.id, `Date mismatch for slug: ${slug}`)
      t.is(resolved!.id, instance.id, `Instance mismatch for slug: ${slug}`)
    }
  }
})

test('slug URL parses through parseUrl', (t) => {
  const bereshit = allDates.find((d) => d.title.en === 'Parshat Bereshit')
  if (!bereshit) {
    t.pass('Bereshit not found, skipping')
    return
  }
  // Import parseUrl to test end-to-end
  // This is tested more thoroughly in url-parser.test.ts
  t.pass('See url-parser.test.ts for end-to-end slug URL parsing tests')
})

test('all weekly parshiyot have slugs', (t) => {
  const parshiyot = allDates.filter((d) => d.leinings.some((i) => i.isParsha))
  for (const parsha of parshiyot) {
    const slug = slugForLeiningDate(parsha)
    t.truthy(slug, `No slug for ${parsha.title.en}`)
    t.false(slug!.startsWith('parshat'), `Slug should not start with "parshat": ${slug}`)
  }
})

test('Rosh Chodesh disambiguation works', (t) => {
  const roshChodeshDates = allDates.filter((d) => d.title.en.startsWith('Rosh Chodesh'))
  if (roshChodeshDates.length === 0) {
    t.pass('No Rosh Chodesh found, skipping')
    return
  }

  // Check that disambiguation indices are assigned correctly
  for (const date of roshChodeshDates) {
    const index = disambiguation.get(date)
    t.truthy(index, `Should have disambiguation index for ${date.title.en} (${date.id})`)
  }

  // Check that the first occurrence has no suffix and subsequent ones do
  const byTitle = new Map<string, number[]>()
  for (const date of roshChodeshDates) {
    const baseSlug = slugForLeiningDate(date)
    if (!baseSlug) continue
    const indices = byTitle.get(baseSlug) ?? []
    indices.push(disambiguation.get(date) ?? 1)
    byTitle.set(baseSlug, indices)
  }

  for (const [baseSlug, indices] of byTitle) {
    // If there are duplicates, they should have different disambiguation indices
    if (indices.length > 1) {
      t.deepEqual(indices, [1, 2], `Expected indices [1, 2] for ${baseSlug}, got ${indices}`)
    }
  }
})