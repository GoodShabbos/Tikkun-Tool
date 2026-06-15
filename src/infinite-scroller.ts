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
        // In RTL scroll containers:
        // - scrollLeft is 0 at the rightmost position (start/earlier content)
        // - scrollLeft is negative when scrolled toward later content (left)
        // - "hiddenBefore" = content to the right of viewport (earlier pages)
        // - "hiddenAfter" = content to the left of viewport (later pages)
        const scrollLeft = scrollView.scrollLeft // negative in RTL when scrolled
        const scrollWidth = scrollView.scrollWidth
        const clientWidth = scrollView.clientWidth

        // In RTL, hiddenBefore = |scrollLeft| (or 0 if scrollLeft is 0)
        // hiddenAfter = scrollWidth - clientWidth - |scrollLeft|
        const hiddenBeforeWidth = Math.abs(scrollLeft)
        const hiddenAfterWidth = Math.max(0,
          scrollWidth - clientWidth - Math.abs(scrollLeft)
        )

        if (hiddenBeforeWidth < 0.5 * clientWidth) {
          oneAtATime(() =>
            fetchPreviousContent.fetch().then((fetched) => {
              if (!fetched) return

              // Remember how much content is after the viewport
              const afterWidth = scrollWidth - Math.abs(scrollView.scrollLeft)

              fetchPreviousContent.render(fetched)

              // Maintain scroll position after prepending content
              // In RTL, scrollLeft should become more negative by the width of the new content
              const newScrollWidth = scrollView.scrollWidth
              const addedWidth = newScrollWidth - scrollWidth
              scrollView.scrollLeft = -(Math.abs(scrollView.scrollLeft) + addedWidth)
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
          // Periodic check for edge cases where scroll events don't fire
          // (e.g., already at the edge of scrollable area)
          const intervalId = setInterval(checkScroll, 2000)
          // Clean up on page unload
          window.addEventListener('unload', () => {
            clearInterval(intervalId)
            observer.disconnect()
          })
        }
      },
    }
  },
}

export default InfiniteScroller
