import slugify from '../slugify.ts'
import type { LeiningDate, LeiningInstance } from './model-types.ts'
import { LeiningInstanceId } from './model-types.ts'
import type { LeiningGenerator } from './generator.ts'
import { HDate } from '@hebcal/hdate'

const PARSHAT_PREFIX = 'parshat '

/**
 * Like slugify, but preserves hyphens in the input (for double parshiyot).
 * The built-in slugify strips hyphens since they're non-alphanumeric.
 */
function slugForUrl(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
}

/**
 * Generates a URL slug for a LeiningDate.
 *
 * For weekly parshiyot, strips the "Parshat " prefix:
 *   "Parshat Noach" → "noach"
 *   "Parshat Nitzavim-Vayeilech" → "nitzavim-vayeilech"
 *
 * For holidays, keeps the full name:
 *   "Yom Kippur" → "yom-kippur"
 *   "Sukkot I" → "sukkot-i"
 *
 * For Rosh Chodesh (which can span two consecutive days with the same name),
 * appends a day index to disambiguate:
 *   "Rosh Chodesh Cheshvan" (1st day) → "rosh-chodesh-cheshvan"
 *   "Rosh Chodesh Cheshvan" (2nd day) → "rosh-chodesh-cheshvan-2"
 *
 * Returns null for dates that shouldn't have a slug.
 */
export function slugForLeiningDate(
  date: LeiningDate,
  disambiguationIndex?: number
): string | null {
  const en = date.title.en

  // Skip dates with no meaningful name
  if (!en || en === 'TODO: unknown') return null

  let baseSlug: string

  // Weekly parshiyot: strip "Parshat " prefix
  if (en.toLowerCase().startsWith(PARSHAT_PREFIX)) {
    baseSlug = slugForUrl(en.slice(PARSHAT_PREFIX.length))
  } else {
    baseSlug = slugForUrl(en)
  }

  // Append disambiguation index for duplicate names (e.g., Rosh Chodesh spanning 2 days)
  if (disambiguationIndex && disambiguationIndex > 1) {
    return `${baseSlug}-${disambiguationIndex}`
  }

  return baseSlug
}

/**
 * Generates a URL slug for a specific LeiningInstance (a particular davening on a date).
 *
 * For dates with a single leining (most Shabbatot), returns just the date slug:
 *   "noach"
 *
 * For dates with multiple leinings (Yom Kippur, Simchat Torah, etc.),
 * appends the instance identifier:
 *   "yom-kippur-shacharis"
 *   "yom-kippur-mincha"
 *
 * @param disambiguationIndex - For dates that share a slug with another date
 *   (e.g., Rosh Chodesh spanning two days), pass the 1-based occurrence index.
 *   The first occurrence gets no suffix; subsequent ones get "-2", "-3", etc.
 */
export function slugForLeiningInstance(
  instance: LeiningInstance,
  disambiguationIndex?: number
): string | null {
  const dateSlug = slugForLeiningDate(instance.date, disambiguationIndex)
  if (!dateSlug) return null

  // If there's only one leining on this date, no instance suffix needed
  if (instance.date.leinings.length <= 1) return dateSlug

  // Append the instance identifier for multi-davening days
  const instanceSuffix = instanceIdToSlug[instance.id]
  if (!instanceSuffix) return null

  return `${dateSlug}-${instanceSuffix}`
}

const instanceIdToSlug: Record<LeiningInstanceId, string> = {
  [LeiningInstanceId.Shacharis]: 'shacharis',
  [LeiningInstanceId.Mincha]: 'mincha',
  [LeiningInstanceId.Maariv]: 'maariv',
  [LeiningInstanceId.Megillah]: 'megillah',
}

/**
 * Computes disambiguation indices for a list of LeiningDates.
 * Returns a Map from each LeiningDate to its 1-based occurrence index
 * among dates with the same base slug.
 */
export function computeDisambiguation(
  dates: LeiningDate[]
): Map<LeiningDate, number> {
  const slugCounts = new Map<string, number>()
  const result = new Map<LeiningDate, number>()

  for (const date of dates) {
    const baseSlug = slugForLeiningDate(date)
    if (!baseSlug) continue

    const count = (slugCounts.get(baseSlug) ?? 0) + 1
    slugCounts.set(baseSlug, count)
    result.set(date, count)
  }

  return result
}

/**
 * Resolves a slug to a LeiningInstance.
 *
 * For parshiyot, finds the next upcoming occurrence (or current if this week).
 * For holidays, finds the next occurrence in the year.
 *
 * If the slug includes an instance suffix (e.g., "-shacharis"),
 * resolves to that specific davening. Otherwise, defaults to the first leining.
 *
 * For disambiguated slugs (e.g., "rosh-chodesh-cheshvan-2"),
 * resolves to the Nth occurrence of that name.
 */
export function slugToLeiningInstance(
  generator: LeiningGenerator,
  slug: string
): LeiningInstance | null {
  const allDates = generator.forEntireChumash(new HDate(new Date()))

  // Track how many times we've seen each base slug to handle disambiguation
  const slugCounts = new Map<string, number>()

  for (const date of allDates) {
    const baseSlug = slugForLeiningDate(date)
    if (!baseSlug) continue

    const count = (slugCounts.get(baseSlug) ?? 0) + 1
    slugCounts.set(baseSlug, count)

    const dateSlug = slugForLeiningDate(date, count)

    // Check if the slug matches this date (with disambiguation)
    if (slug === dateSlug) {
      // Default to the first leining
      return date.leinings[0] ?? null
    }

    // Check if the slug matches a date + instance suffix
    for (const instance of date.leinings) {
      // Compute the instance slug with disambiguation
      const instanceSlug = dateSlug && instance.date.leinings.length > 1
        ? `${dateSlug}-${instanceIdToSlug[instance.id]}`
        : dateSlug

      if (instanceSlug === slug) {
        return instance
      }
    }
  }

  return null
}