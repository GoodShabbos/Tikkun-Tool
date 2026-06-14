import textFilter from './text-filter.ts'

export interface WordPair {
  plain: string
  annotated: string
}

/**
 * Takes a raw fragment string (as stored in the JSON data files)
 * and returns aligned { plain, annotated } word pairs.
 *
 * This handles the word-boundary mismatches that arise from:
 *  - Maqaf (־) becoming a space in kri, splitting one annotated word into two plain words
 *  - Ktiv/Kri substitutions where one kri word maps to multiple ketiv words
 *  - Combined cases
 *
 * The annotated output has `{}` ktiv-kri markers stripped for clean peek display.
 */
export const wordPairs = (rawFragment: string): WordPair[] => {
  const annotatedFull = textFilter({ text: rawFragment, annotated: true })
  const plainFull = textFilter({ text: rawFragment, annotated: false })

  // Strip ktiv-kri markers { } from annotated for clean peek display
  const cleanAnnotated = annotatedFull.replace(/[{}]/g, '')

  const plainWords = plainFull.split(' ').filter((w) => w.length > 0)
  const annotatedWords = cleanAnnotated.split(' ').filter((w) => w.length > 0)

  // If counts match, simple 1:1 pairing
  if (plainWords.length === annotatedWords.length) {
    return plainWords.map((plain, i) => ({
      plain,
      annotated: annotatedWords[i],
    }))
  }

  // Counts don't match — this happens when maqaf in annotated joins words
  // that are separate in plain, or when ktiv/kri causes word count differences.
  // Strategy: try to align by splitting annotated words on maqaf (־)
  return alignWithMaqaf(plainWords, annotatedWords)
}

/**
 * When plain has more words than annotated, it's usually because maqaf (־)
  in annotated joins words that are separate in plain.
 * Split annotated words on maqaf (U+05BE) or ASCII hyphen (from ktiv/kri notation)
 * and pair sequentially.
 * If counts still don't match, fall back to grouping.
 */
const alignWithMaqaf = (
  plainWords: string[],
  annotatedWords: string[]
): WordPair[] => {
  // Expand annotated words by splitting on maqaf (־ U+05BE) or ASCII hyphen
  const expandedAnnotated = annotatedWords.flatMap((word) =>
    word.split(/[־-]/).filter((w) => w.length > 0)
  )

  if (plainWords.length === expandedAnnotated.length) {
    return plainWords.map((plain, i) => ({
      plain,
      annotated: expandedAnnotated[i],
    }))
  }

  // Still doesn't match — fall back to grouping the entire fragment as one pair.
  // This handles rare cases like ktiv/kri where one plain word maps to
  // multiple annotated words that can't be cleanly split.
  // In this case, clicking any word reveals the whole annotated fragment.
  const fullPlain = plainWords.join(' ')
  const fullAnnotated = annotatedWords.join(' ')

  return plainWords.map((plain) => ({
    plain,
    annotated: fullAnnotated,
  }))
}

export default wordPairs