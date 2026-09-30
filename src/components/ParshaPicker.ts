import fuzzy from '../fuzzy.ts'
import utils from './utils.ts'
import ParshaResult, { NoResults } from './ParshaResult.ts'
import Search, { SearchEmitter } from './Search.ts'
import EventEmitter from '../event-emitter.ts'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import { HDate, Locale } from '@hebcal/hdate'
import {
  LeiningInstance,
  LeiningInstanceId,
} from '../calendar-model/model-types.ts'
import { generateUrl, generateSlugUrl } from '../view-model/navigation/url-parser.ts'
import { isVezosHabracha } from '../view-model/scroll-view-model.ts'
import { last } from '../calendar-model/utils.ts'
import { toTitleCase } from '../calendar-model/hebcal-conversions.ts'
import { computeDisambiguation } from '../calendar-model/slugs.ts'

const { htmlToElement } = utils

const dateFormat = Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

/**
 * Creates template functions that use the given disambiguation map
 * to generate correct slug URLs for dates with duplicate names.
 */
const makeTemplates = (
  disambiguation: Map<LeiningInstance['date'], number>
) => {
  const slugUrl = (leining: LeiningInstance) =>
    generateSlugUrl(leining.runs[0], disambiguation.get(leining.date)) ??
    generateUrl(leining.runs[0])

  const Parsha = (leining: LeiningInstance) => `
  <li><a
    class="parsha"
    href="${slugUrl(leining)}"
  >
    ${renderTitle(leining)}
  </a></li>
  `

  const Book = (book: LeiningInstance[]) => `
  <li class="parsha-book">
    <ol class="parsha-list">
      ${book.map(Parsha).join('')}
    </ol>
  </li>
`

  const ComingUpReading = (obj: LeiningInstance, index: number) => `
  <li>
    <a
      href="${index === 0 ? '#/next' : slugUrl(obj)}"
      class="coming-up-button${index === 0 ? ' mod-next' : ''}"
    >
      ${index === 0 ? '<span class="coming-up-tag">Next</span>' : ''}
      <span class="coming-up-title">${renderTitle(obj, { forCalendar: true })}</span>
      <time class="coming-up-date">${dateFormat.format(obj.date.date)}</time>
    </a>
  </li>
  `

  return { Parsha, Book, ComingUpReading }
}

const ComingUp = (comingUpReadings: LeiningInstance[], disambiguation: Map<LeiningInstance['date'], number>) => {
  const { ComingUpReading } = makeTemplates(disambiguation)
  return `
  <section id="coming-up" class="section coming-up">
    <h2 class="section-label">Coming up</h2>
    <ol id="coming-up-readings-list" class="coming-up-list">
      ${comingUpReadings.map(ComingUpReading).join('')}
    </ol>
  </section>
` }

const holidayGroupStarts = ['ראש השנה א׳', 'סוכות א׳', 'שבועות א׳', 'פסח א׳']
const groupHolidays = (leinings: LeiningInstance[]) => {
  const groups: LeiningInstance[][] = [[]]
  for (const leining of leinings) {
    if (leining.isParsha) continue
    // Only include the first ראש חודש
    if (last(groups).length && leining.date.title.he.startsWith('ראש חודש'))
      continue
    if (leining.date.title.he.startsWith('תענית אסתר')) continue
    if (holidayGroupStarts.includes(leining.date.title.he)) groups.push([])
    last(groups).push(leining)
  }
  return groups
}

const Browse = (leinings: LeiningInstance[], disambiguation: Map<LeiningInstance['date'], number>) => {
  const { Parsha, Book } = makeTemplates(disambiguation)
  return `
  <div class="browse">
    <h2 class="section-heading">פרשת השבוע</h2>
    <ol class="parsha-books mod-emphasize-first-in-group">
      ${leinings
        .filter((o) => o.isParsha || isVezosHabracha(o.runs[0]))
        .reduce((books, leining, idx) => {
          // TODO: Change to groupBy()
          const book = leining.runs[0].aliyot[0].start.b
          books[book] = books[book] || []
          books[book].push({ ...leining, idx })
          return books
        }, [])
        .map(Book)
        .join('')}
    </ol>

    <h2 class="section-heading">חגים</h2>
    <ol class="parsha-books">
      ${groupHolidays(leinings)
        .map(
          (col) => `
        <li class="parsha-book">
          <ol class="parsha-list">
            ${col.map(Parsha).join('\n')}
          </ol>
        </li>
      `
        )
        .join('\n')}
    </ol>

    <h2 class="section-heading">מגילות</h2>
    <ol class="parsha-books">
      <li class="parsha-book">
        <ol class="parsha-list">
          ${leinings
            .filter((o) => o.id === LeiningInstanceId.Megillah)
            .map(Parsha)
            .join('\n')}
        </ol>
      </li>
    </ol>
  </div>
` }

const top = (n: number) => (_: unknown, i: number) => i < n

const search = (leinings: LeiningInstance[], query: string) => {
  const results = fuzzy(leinings, query, (o) => [
    o.date.title.he,
    o.date.title.en,
  ])

  if (!results.length) return [NoResults()]

  return results.filter(top(5)).map((result) => ParshaResult(result))
}

function renderTitle(obj: LeiningInstance, opts?: { forCalendar?: boolean }) {
  if (obj.id === LeiningInstanceId.Megillah)
    return Locale.gettext(toTitleCase(obj.runs[0].scroll), 'he-x-nonikud')

  let title = obj.date.title.he.replace('פרשת ', '')
  if (obj.id !== LeiningInstanceId.Shacharis) title += `: ${obj.id}`

  // In the holiday listing, don't include the month name.
  // In the Upcoming section, do include it.
  if (!opts?.forCalendar && title.startsWith('ראש חודש')) return 'ראש חודש'

  return title
}

declare function gtag(type: 'event', eventName: string, payload: unknown): void

export default (generator: LeiningGenerator) => {
  const allDates = generator.forEntireChumash(new HDate())
  const leinings = allDates.flatMap((ld) => ld.leinings)
  const disambiguation = computeDisambiguation(allDates)

  const searchEmitter = EventEmitter.new<SearchEmitter>()
  const s = Search({
    search: search.bind(null, leinings),
    emitter: searchEmitter,
  })

  const comingUpReadings = leinings
    .filter((ld) => ld.date.date > new Date())
    .slice(0, 3)

  const self = htmlToElement(`
    <div class="parsha-picker">
      <div class="stack xlarge">
        <div class="centerize">
          <div id="search" style="display: inline-block;"></div>
        </div>
        ${ComingUp(comingUpReadings, disambiguation)}
        ${Browse(leinings, disambiguation)}
      </div>
    </div>
  `)

  ;[
    ...self.querySelectorAll('[data-target-class="coming-up-reading"]'),
  ].forEach((comingUpReading, index) => {
    comingUpReading.addEventListener('click', () => {
      gtag('event', 'coming_up_selection', {
        event_category: 'navigation',
        event_label: ['due up', 'on deck', 'in the hole'][index],
      })
    })
  })

  searchEmitter.on('selection', (selected) => {
    gtag('event', 'search_selection', {
      event_category: 'navigation',
      event_label: selected
        .querySelector('[data-target-class="result-hebrew"]')
        .textContent.trim(),
    })
  })

  searchEmitter.on('search', (query) => {
    self.querySelector('.browse').classList.add('u-hidden')
    self.querySelector('#coming-up').classList.add('u-hidden')
    gtag('event', 'search', {
      event_category: 'navigation',
      event_label: query,
    })
  })

  searchEmitter.on('clear', () => {
    self.querySelector('.browse').classList.remove('u-hidden')
    self.querySelector('#coming-up').classList.remove('u-hidden')
  })

  self
    .querySelector('#search')
    .parentNode.replaceChild(s.node, self.querySelector('#search'))
  ;[...self.querySelectorAll('[data-target-id="parsha"]')].forEach((parsha) => {
    parsha.addEventListener('click', (e) => {
      const target = e.target as Element

      gtag('event', 'browse_selection', {
        event_category: 'navigation',
        event_label: target.textContent.trim(),
      })
    })
  })

  return {
    node: self,
    onMount: () => {
      setTimeout(() => s.focus(), 0)
    },
  }
}
