/**
 * Wrap a marked block-extension `start(src)` scanner so it stops rescanning the
 * whole remaining document on every call.
 *
 * marked calls `start` once per paragraph on the remaining source to find where
 * the next custom block begins, so a naive full scan per call is O(n^2) — enough
 * to make a large document take tens of seconds to open. marked feeds
 * progressively shorter suffixes, so once a scan finds no match ahead, every
 * shorter suffix is match-free too: cache that and return immediately. A `src`
 * longer than the last one we saw means a new (or restarted / nested-into-a-
 * larger-block) parse, which resets the cache. The wrapped scanner returns the
 * same value the raw scanner would, so parsing behaviour is unchanged.
 */
export function memoizedBlockStart(scan: (src: string) => number): (src: string) => number {
  let seenLength = -1
  let noneAhead = false

  return (src: string) => {
    if (src.length > seenLength) {
      noneAhead = false
    }
    seenLength = src.length
    if (noneAhead) {
      return -1
    }
    const index = scan(src)
    if (index < 0) {
      noneAhead = true
    }
    return index
  }
}
