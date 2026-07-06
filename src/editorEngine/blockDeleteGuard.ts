import { keymap, type EditorView } from '@codemirror/view'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

// Guard against accidentally deleting a whole drawing/diagram block: when a
// Backspace/Delete would remove (or break) one of these fenced blocks, ask a
// host-provided confirmer first — mirroring the classic editor's behaviour.
const CONFIRM_ON_DELETE = new Set(['sketch', 'mermaid', 'excalidraw', 'json-flow'])

let confirmer: (() => Promise<boolean>) | null = null
export function setBlockDeleteConfirmer(fn: (() => Promise<boolean>) | null) {
  confirmer = fn
}

function fenceOverlapping(state: EditorState, from: number, to: number): { from: number; to: number } | null {
  const lo = Math.max(0, from - 1)
  const hi = Math.min(state.doc.length, to + 1)
  ensureSyntaxTree(state, hi, 25)
  let found: { from: number; to: number } | null = null
  syntaxTree(state).iterate({
    from: lo,
    to: hi,
    enter: (node) => {
      if (found) return false
      if (node.name !== 'FencedCode') return true
      const info = state.doc.lineAt(node.from).text.replace(/^`+/, '').trim().toLowerCase()
      if (CONFIRM_ON_DELETE.has(info) && node.from <= to && node.to >= from) {
        found = { from: node.from, to: node.to }
        return false
      }
      return true
    },
  })
  return found
}

function guard(view: EditorView, dir: -1 | 1): boolean {
  if (!confirmer) return false
  const sel = view.state.selection.main
  let from: number
  let to: number
  if (!sel.empty) {
    from = sel.from
    to = sel.to
  } else if (dir < 0) {
    from = Math.max(0, sel.head - 1)
    to = sel.head
  } else {
    from = sel.head
    to = Math.min(view.state.doc.length, sel.head + 1)
  }
  const fence = fenceOverlapping(view.state, from, to)
  if (!fence) return false
  void confirmer().then((ok) => {
    if (ok) view.dispatch({ changes: { from: fence.from, to: fence.to, insert: '' } })
  })
  return true // handled — suppress the default delete until confirmed
}

export const blockDeleteGuard = keymap.of([
  { key: 'Backspace', run: (view) => guard(view, -1) },
  { key: 'Delete', run: (view) => guard(view, 1) },
])
