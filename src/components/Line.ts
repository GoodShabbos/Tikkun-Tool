import type { RenderedLineInfo } from '../view-model/scroll-view-model.ts'
import displayRange from '../display-range.ts'
import textFilter from '../text-filter.ts'
import wordPairs from '../word-pairs.ts'

const ktivKriAnnotation = (text: string) =>
  text
    .replace(/[{]/g, `<span class="ktiv-kri">`)
    .replace(/[}]/g, `</span>`)
    .trim()

const wordPeekSpans = (rawFragment: string) =>
  wordPairs(rawFragment)
    .map(
      ({ plain, annotated }) =>
        `<span class="word-peek" data-annotated="${annotated}">${plain}</span>`
    )
    .join(' ')

const petuchaClass = (isPetucha: boolean) => (isPetucha ? 'mod-petucha' : '')
const setumaClass = (column: unknown[]) =>
  column.length > 1 ? 'mod-setuma' : ''

const Line = ({
  text,
  verses,
  isPetucha,
  labels,
  lineIndex,
}: {
  lineIndex: number
} & RenderedLineInfo) => `
  <tr data-class="line" data-line-index="${lineIndex}">
    <td class="line ${petuchaClass(isPetucha)}">
      <div class="tikkun-columns">
        <div class="tikkun-column mod-annotated">
          ${text
            .map(
              (column) => `
          <div class="column">
            ${column
              .map(
                (fragment) => `
              <span class="fragment ${setumaClass(
                column
              )}">${ktivKriAnnotation(
                  textFilter({ text: fragment, annotated: true })
                )}</span>
            `
              )
              .join('')}
          </div>
        `
            )
            .join('')}
        </div>
        <div class="tikkun-column mod-plain">
          ${text
            .map(
              (column) => `
          <div class="column">
            ${column
              .map(
                (fragment) => `
              <span class="fragment ${setumaClass(
                column
              )}">${wordPeekSpans(fragment)}</span>
            `
              )
              .join('')}
          </div>
        `
            )
            .join('')}
        </div>
      </div>
      <span class="location-indicator mod-verses">${displayRange.asVersesRange(
        verses
      )}</span>
      <span class="location-indicator mod-aliyot" data-target-id="aliyot-range">${labels}</span>
    </td>
  </tr>
`

export default Line
