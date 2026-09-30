/**
 * Holy-name (shem) detection and masking, for "Print without Shiemos".
 *
 * Concept inspired by akivajgordon/no-geniza: replace forms of Hashem's name
 * with commonly-used non-sacred stand-ins so a printout doesn't require
 * geniza. The two names that occur in this project's Torah/Esther data are:
 *
 *   1. The tetragrammaton  יהוה  (pointed in the data as e.g. יְהֹוָה)
 *      → replaced with  ה׳  (he + geresh)
 *   2. The א-ל-ה-י family (אֱלֹהִים, אֱלֹהֵי, אֱלֹהֶיךָ, …)
 *      → hyphen after the aleph + kuf in place of the stem's hey:
 *      אֱלֹהִים → אֱ-לֹקִים. Marks hanging off the replaced hey (its vowel,
 *      and any te'amim) carry over onto the kuf untouched.
 *
 * Unlike no-geniza's implementation, the matcher is anchored on the exact
 * consonantal letters, tolerating any niqqud/te'amim marks interleaved
 * between them, so:
 *   - `וַיְהִי` (vayehi) is NOT a false positive (its לetter sequence is
 *     י-ה-י, missing the ו of the tetragrammaton),
 *   - bare `אל`/`אֵל`/`אֶל` are not matched (needs ה…י after the ל),
 *   - prefixed forms like `לַיהֹוָה` are matched (the match starts at the י
 *     and doesn't swallow the prefix),
 *   - trailing maqaf (`יְהֹוָה־`) and sof-pasuk (`יְהֹוָה׃`) stay in place.
 *
 * Layout-invariance contract (see holy-name.test.js):
 *   - no spaces, maqaf, or sof-pasuk are ever inserted or removed,
 *   - word count and word boundaries are preserved exactly.
 */

/**
 * Combining marks that belong to a word's letters: te’amim (0591–05AF),
 * niqqud (05B0–05BD incl. qubuts, dagesh, meteg), rafe (05BF), shin/sin
 * dots (05C1–05C2), upper/lower dots (05C4–05C5), inverted nun (05C6),
 * qamatz qatan (05C7). Contiguous ranges would swallow the maqaf (05BE)
 * and paseq (05C0), so they are explicitly excluded:
 * 05BE joins words (part of orthography — layout!), 05C0 separates clauses.
 */
const MARKS = '[\\u0591-\\u05BD\\u05BF\\u05C1\\u05C2\\u05C4-\\u05C7]'

/** Marks that may hang off a name's *final* letter. Same set as MARKS; the
 * verse-final sof-pasuk (05C3) is deliberately excluded so it stays in place
 * after the replaced name. */
const TRAILING_MARKS = '[\\u0591-\\u05BD\\u05BF\\u05C1\\u05C2\\u05C4-\\u05C7]*'
const YOD = 'י'
const HE = 'ה'
const VAV = 'ו'
const TETRAGRAMMATON = [YOD, HE, VAV, HE]
const ALEPH = 'א'
const LAMED = 'ל'
const ELOHIM_STEM = [ALEPH, LAMED, HE, YOD]

/** Any additional letters that may follow the אלהי stem before word end
 * (suffix letters: ם ך נ ו הם כם …). */
const ELOHIM_SUFFIX = '[א-ת]*'

const withMarks = (letters: string[]) =>
  letters.map((letter) => `${letter}${MARKS}*`).join('')

/** A name match = its letters + any marks hanging off the last letter,
 * followed by any remaining word letters (suffixes) with their marks. */
const namePattern = (letters: string[], suffix: string = '') =>
  `${withMarks(letters)}${TRAILING_MARKS}${suffix}${MARKS}*`

const TETRAGRAMMATON_PATTERN = namePattern(TETRAGRAMMATON)
const ELOHIM_PATTERN = namePattern(ELOHIM_STEM, ELOHIM_SUFFIX)
/** For counting the אלהי family, only the stem matters (suffix optional),
 * so a single regex finds each occurrence once. */
const ELOHIM_COUNT_PATTERN = namePattern(ELOHIM_STEM)

/** The geresh (U+05F3) used in ה׳ — not a combining mark, printed as-is. */
const GERESH = '׳'
const HE_GERESH = `${HE}${GERESH}`
/** The kuf substituted for the אלהי stem's hey (אלקים convention). */
const KUF = 'ק'

/**
 * Replace holy names in `text` with their non-sacred spellings.
 *
 * The text may be raw data (with `#(פ)`, ktiv/kri `[...]#` markers, maqaf,
 * nun-hafucha) or rendered text (post text-filter). Both contain the same
 * Hebrew letter stream, so one matcher serves both.
 */
export const maskHolyNames = (text: string): string =>
  text
    // Tetragrammaton → ה׳. The match may be preceded by a prefix (בַּ/,
    // לַ/) — those letters are outside the match and untouched.
    .replace(new RegExp(TETRAGRAMMATON_PATTERN, 'g'), HE_GERESH)
    // אלהי family → א-לקי family. The hyphen goes directly before the
    // first lamed — i.e. AFTER the aleph and any marks hanging off it
    // (e.g. the hatef-segol in אֱלֹהִים) — so it renders under the join.
    // Anchored on the aleph, since bare אל must never match. The stem's
    // hey (the FIRST hey after the lamed — never a suffix hey as in
    // אֱלֹהֵיהֶם) becomes a kuf; everything else (marks, suffixes) is kept.
    .replace(
      new RegExp(ELOHIM_PATTERN, 'g'),
      (m) => {
        const lamedIndex = m.indexOf(LAMED)
        const stemHeyIndex = m.indexOf(HE, lamedIndex + 1)
        return (
          `${m.slice(0, lamedIndex)}-` +
          `${m.slice(lamedIndex, stemHeyIndex)}${KUF}` +
          m.slice(stemHeyIndex + 1)
        )
      }
    )

/** Count how many holy names (either form) occur in `text`. */
export const countHolyNames = (text: string): number =>
  (text.match(new RegExp(TETRAGRAMMATON_PATTERN, 'g'))?.length ?? 0) +
  (text.match(new RegExp(ELOHIM_COUNT_PATTERN, 'g'))?.length ?? 0)

export default maskHolyNames