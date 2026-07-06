// When a rich table cell (a contentEditable outside the CM document) is focused,
// it registers itself here so the toolbar's inline-format commands wrap the
// cell's selection instead of the CM document's.
export type InlineWrapTarget = { wrap: (before: string, after: string) => void }

let active: InlineWrapTarget | null = null

export function setActiveInlineTarget(target: InlineWrapTarget | null) {
  active = target
}

export function getActiveInlineTarget(): InlineWrapTarget | null {
  return active
}

/** Wrap the current selection inside a contentEditable with before/after markers
 *  (e.g. `**`), keep the inner text selected, and report the new source text. */
export function wrapContentEditableSelection(
  el: HTMLElement | null,
  before: string,
  after: string,
  commit: (source: string) => void,
) {
  if (!el) return
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  if (!el.contains(range.commonAncestorContainer)) return
  const text = range.toString()
  range.deleteContents()
  const node = document.createTextNode(before + text + after)
  range.insertNode(node)
  const next = document.createRange()
  next.setStart(node, before.length)
  next.setEnd(node, before.length + text.length)
  sel.removeAllRanges()
  sel.addRange(next)
  commit(el.innerText)
}
