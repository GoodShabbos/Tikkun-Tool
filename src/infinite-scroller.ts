let alreadyInFlight = false
const oneAtATime = async (promise: () => Promise<unknown>) => {
  if (alreadyInFlight) return Promise.resolve()
  alreadyInFlight = true
  const val = await promise()
  alreadyInFlight = false
  return val
}

interface Fetcher<T> {
  fetch: () => Promise<T>
  render: (content: NonNullable<T>) => void
}

const InfiniteScroller = {
  new: <T>({
    container,
    fetchPreviousContent,
    fetchNextContent,
  }: {
    container: HTMLElement
    fetchPreviousContent: Fetcher<T>
    fetchNextContent: Fetcher<T>
  }) => {
    const checkScroll = () => {
      const scrollView = container
      const isHorizontal = scrollView.classList.contains('mod-sefer-torah')

      if (isHorizontal) {
        // In RTL with flex-direction: row-reverse, scrollLeft can be negative.
        // Normalize: distance from the right edge (start in RTL).
        const scrollLeft = scrollView.scrollLeft
        const scrollWidth = scrollView.scrollWidth
        const clientWidth = scrollView.clientWidth

        // "Before" = content to the right of viewport (earlier pages in RTL)
        // "After" = content to the left of viewport (later pages in RTL)
        // In RTL, scrollLeft is typically 0 at the rightmost position and
        // negative as you scroll left (toward later content).
        // However, some browsers use positive scrollLeft in RTL.
        // Use a normalized approach:
        const hiddenBeforeWidth = Math.abs(scrollLeft)
        const hiddenAfterWidth = Math.max(0,
          scrollWidth - clientWidth - Math.abs(scrollLeft)
        )

        if (hiddenBeforeWidth < 0.5 * clientWidth) {
          oneAtATime(() =>
            fetchPreviousContent.fetch().then((fetched) => {
              if (!fetched) return

              const afterWidth = scrollWidth - Math.abs(scrollLeft)

              fetchPreviousContent.render(fetched)

              // Maintain scroll position after prepending content
              scrollView.scrollLeft = -(scrollView.scrollWidth - afterWidth)
            })
          )
        } else if (hiddenAfterWidth < 0.5 * clientWidth) {
          oneAtATime(() =>
            fetchNextContent.fetch().then((fetched) => {
              if (fetched) fetchNextContent.render(fetched)
            })
          )
        }
      } else {
        const hiddenAboveHeight = scrollView.scrollTop
        const visibleHeight = scrollView.clientHeight

        const hiddenBelowHeight =
          scrollView.scrollHeight -
          (scrollView.clientHeight + scrollView.scrollTop)

        if (hiddenAboveHeight < 0.5 * visibleHeight) {
          oneAtATime(() =>
            fetchPreviousContent.fetch().then((fetched) => {
              if (!fetched) return

              const belowHeight = scrollView.scrollHeight - scrollView.scrollTop

              fetchPreviousContent.render(fetched)

              scrollView.scrollTop = scrollView.scrollHeight - belowHeight
            })
          )
        } else if (hiddenBelowHeight < 0.5 * visibleHeight) {
          oneAtATime(() =>
            fetchNextContent.fetch().then((fetched) => {
              if (fetched) fetchNextContent.render(fetched)
            })
          )
        }
      }
    }

    return {
      attach: () => {
        container.addEventListener('scroll', checkScroll)

        // In Sefer Torah mode, also check after initial render
        // since there may be no scroll event if content just barely overflows
        if (container.classList.contains('mod-sefer-torah')) {
          // Check after a short delay to allow initial pages to render
          setTimeout(checkScroll, 100)
          // Also observe DOM changes to recheck when pages are added
          const observer = new MutationObserver(() => {
            setTimeout(checkScroll, 50)
          })
          observer.observe(container, { childList: true })
        }
      },
    }
  },
}

export default InfiniteScroller
