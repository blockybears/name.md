import { StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { ReactBlockWidget } from '../blocks/reactWidget'
import { getBlockRenderer } from '../blocks/registry'
import { gfmTableRenderer } from '../blocks/gfmTable'

// CodeMirror forbids block decorations from view plugins, so block widgets live
// in a state field. A tiny watcher plugin rebuilds them for the current viewport
// (bounded work on huge docs) and pushes them in via an effect.

const setBlocks = StateEffect.define<DecorationSet>()

const blockField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes)
    for (const effect of tr.effects) if (effect.is(setBlocks)) value = effect.value
    return value
  },
  provide: (field) => EditorView.decorations.from(field),
})

const FENCE_OPEN = /^```([A-Za-z][\w-]*)\s*$/
const FENCE_CLOSE = /^```+\s*$/

function buildBlocks(view: EditorView): DecorationSet {
  const { state } = view
  // Single contiguous viewport, not gapped visibleRanges (see codeBlocks.ts).
  const { from, to } = view.viewport
  const docLen = state.doc.length
  // While the caret is ON a block's lines, the user is editing the raw fence —
  // show source (don't render the atomic widget), else typing the fence would be
  // scrambled by the widget replacing it mid-edit. Once rendered, the widget is
  // atomic so the caret can't re-enter its lines (edit via the widget's own UI).
  const main = state.selection.main
  const selLo = Math.min(state.doc.lineAt(main.from).number, state.doc.lineAt(main.to).number)
  const selHi = Math.max(state.doc.lineAt(main.from).number, state.doc.lineAt(main.to).number)
  const editingLines = (firstLine: number, lastLine: number) => selLo <= lastLine && selHi >= firstLine
  const items: { from: number; to: number; deco: Decoration }[] = []
  const covered: Array<[number, number]> = []
  const overlaps = (a: number, b: number) => covered.some(([x, y]) => a < y && b > x)
  const add = (bfrom: number, bto: number, deco: Decoration) => {
    if (overlaps(bfrom, bto)) return
    covered.push([bfrom, bto])
    items.push({ from: bfrom, to: bto, deco })
  }

  // 1) Custom fenced blocks via a direct text scan of the viewport. This is
  //    robust against the incremental parser occasionally misparsing a fence
  //    typed right after a paragraph (which the syntax tree can get wrong).
  const startLine = state.doc.lineAt(from).number
  const endLine = state.doc.lineAt(to).number
  let open: { info: string; from: number; num: number } | null = null
  for (let n = startLine; n <= endLine; n++) {
    const line = state.doc.line(n)
    if (open) {
      if (FENCE_CLOSE.test(line.text)) {
        const renderer = getBlockRenderer(open.info)
        if (renderer && !editingLines(open.num, n)) {
          const body = n - 1 >= open.num + 1 ? state.sliceDoc(state.doc.line(open.num + 1).from, state.doc.line(n - 1).to) : ''
          add(open.from, line.to, Decoration.replace({ block: true, widget: new ReactBlockWidget(open.info, body, open.from, line.to, renderer) }))
        }
        open = null
      }
    } else {
      const match = FENCE_OPEN.exec(line.text)
      if (match && getBlockRenderer(match[1].toLowerCase())) {
        open = { info: match[1].toLowerCase(), from: line.from, num: n }
      }
    }
  }

  // 2) The syntax tree handles GFM tables and any fenced block whose opening is
  //    scrolled above the viewport (loaded content; tree is correct there).
  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (node.from > docLen || node.to > docLen) return false

      if (node.name === 'Table') {
        const first = state.doc.lineAt(node.from)
        const last = state.doc.lineAt(node.to)
        if (!editingLines(first.number, last.number)) {
          add(
            first.from,
            last.to,
            Decoration.replace({ block: true, widget: new ReactBlockWidget('gfmtable', state.sliceDoc(first.from, last.to), first.from, last.to, gfmTableRenderer) }),
          )
        }
        return false
      }

      if (node.name === 'FencedCode') {
        const first = state.doc.lineAt(node.from)
        const last = state.doc.lineAt(node.to)
        const info = first.text.replace(/^`+/, '').trim().toLowerCase()
        const renderer = getBlockRenderer(info)
        if (renderer && !editingLines(first.number, last.number)) {
          let body = ''
          const bodyStartNum = first.number + 1
          const bodyEndNum = last.number - 1
          if (bodyStartNum <= bodyEndNum && bodyEndNum <= state.doc.lines) {
            body = state.sliceDoc(state.doc.line(bodyStartNum).from, state.doc.line(bodyEndNum).to)
          }
          add(first.from, last.to, Decoration.replace({ block: true, widget: new ReactBlockWidget(info, body, first.from, last.to, renderer) }))
        }
        return false
      }

      return true
    },
  })

  items.sort((a, b) => a.from - b.from || a.to - b.to)
  return Decoration.set(
    items.map((i) => i.deco.range(i.from, i.to)),
    true,
  )
}

const blockWatcher = ViewPlugin.fromClass(
  class {
    destroyed = false
    constructor(view: EditorView) {
      this.push(view)
    }
    update(update: ViewUpdate) {
      // Rebuild on edits, scroll, parser progress, and caret moves (a block
      // reveals its source while the caret is on its lines — see buildBlocks).
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.push(update.view)
      }
    }
    push(view: EditorView) {
      const decorations = buildBlocks(view)
      // A plugin can't dispatch during its own update; defer to a microtask. The
      // resulting transaction sets no doc/selection/viewport flag, so no loop.
      Promise.resolve().then(() => {
        if (!this.destroyed) view.dispatch({ effects: setBlocks.of(decorations) })
      })
    }
    destroy() {
      this.destroyed = true
    }
  },
)

export const livePreviewBlocks: Extension = [blockField, blockWatcher]
