import { LeiningGenerator } from '../../calendar-model/generator.ts'
import type { LeiningRun } from '../../calendar-model/model-types.ts'
import { ScrollViewModel } from '../scroll-view-model.ts'
import {
  slugForLeiningInstance,
  slugToLeiningInstance,
} from '../../calendar-model/slugs.ts'

/** Generates a URL that points to the beginning of a specific run. */
export function generateUrl(run: LeiningRun) {
  return `#/run/${run.id}`
}

/**
 * Generates a human-readable slug URL for a run, if possible.
 * Returns null if no slug is available (caller should fall back to generateUrl).
 *
 * @param disambiguationIndex - For dates that share a slug with another date
 *   (e.g., Rosh Chodesh spanning two days), pass the 1-based occurrence index.
 */
export function generateSlugUrl(run: LeiningRun, disambiguationIndex?: number): string | null {
  const slug = slugForLeiningInstance(run.leining, disambiguationIndex)
  if (!slug) return null
  return `#/${slug}`
}

// TODO(decide): Should we support links to a specific עלייה in a run?

const pathHandlers: Record<
  string,
  (
    generator: LeiningGenerator,
    ...pathParts: string[]
  ) => ScrollViewModel | null
> = {
  run(generator, runId) {
    return ScrollViewModel.forId(generator, runId)
  },
  /** Legacy URL: Specifies a ref in חומש. */
  r(generator, ref) {
    if (!ref) return null
    const [, book, chapter, verse] = ref.match(/^(\d+)-(\d+)-(\d+)$/) ?? []

    if (!book || !chapter || !verse) return null

    return ScrollViewModel.forRef(generator, {
      scroll: 'torah',
      b: Number(book),
      c: Number(chapter),
      v: Number(verse),
    })
  },
  /** Legacy URL: The next leining. */
  next(generator) {
    return ScrollViewModel.forDate(generator, new Date())
  },
}

/** Parses a URL path (without #) into the ScrollViewModel to display. */
export function parseUrl(
  generator: LeiningGenerator,
  path: string
): ScrollViewModel | null {
  const [urlType, ...pathParts] = path.split('/').filter((p) => p)

  // Try known path handlers first (run, r, next)
  const handler = pathHandlers[urlType]
  if (handler) return handler(generator, ...pathParts)

  // Try to interpret the entire path as a slug (e.g., "noach", "yom-kippur-shacharis")
  const slug = [urlType, ...pathParts].join('/')
  const instance = slugToLeiningInstance(generator, slug)
  if (instance) {
    // Resolve to the main run of this instance
    const mainRun = instance.runs.find((r) => r.type === 'Main') ?? instance.runs[0]
    if (mainRun) return ScrollViewModel.forId(generator, mainRun.id)
  }

  return null
}
