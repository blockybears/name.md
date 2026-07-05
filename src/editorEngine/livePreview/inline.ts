import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { BulletWidget, HrWidget, ImageWidget, TaskCheckboxWidget } from './widgets'

const hide = Decoration.replace({})

// Markdown marker node names whose glyphs we hide off the active line so the
// text reads as formatted prose (the HighlightStyle handles the visible styling).
const MARKER_NODES = new Set([
  'HeaderMark', 'EmphasisMark', 'CodeMark', 'StrikethroughMark',
  'QuoteMark', 'LinkMark', 'URL', 'CodeInfo',
])

// The inline live-preview plugin. Works only over the visible ranges (so it
// stays fast on huge documents) and never touches the line the cursor is on —
// that line shows raw markdown so it can be edited.
export const livePreviewInline = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildInline(view)
    }
    update(update: ViewUpdate) {
      // Rebuild on edits, scroll, and parser progress (large docs parse the new
      // viewport a beat after the scroll update). For selection, rebuild only on
      // caret moves — never during a drag (range selection), so revealing/hiding
      // markers can't reflow text mid-selection.
      const caretMove = update.selectionSet && update.state.selection.main.empty
      if (
        update.docChanged ||
        caretMove ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = buildInline(update.view)
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    // Treat hidden markers / widgets as atomic so the caret steps over them.
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
  },
)

function buildInline(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const { state } = view

  // Reveal raw markdown only on lines holding an empty caret. During a drag /
  // range selection we reveal nothing, so hiding/showing markers can't reflow
  // text under the pointer and scramble the selection.
  const activeLines = new Set<number>()
  for (const range of state.selection.ranges) {
    if (!range.empty) continue
    activeLines.add(state.doc.lineAt(range.head).number)
  }
  const lineActive = (pos: number) => activeLines.has(state.doc.lineAt(pos).number)

  // Single contiguous viewport, not gapped visibleRanges (see codeBlocks.ts).
  const { from, to } = view.viewport
  {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name

        if (name === 'Image') {
          if (!lineActive(node.from)) {
            const match = /!\[([^\]]*)\]\(([^)]+)\)/.exec(state.sliceDoc(node.from, node.to))
            if (match) {
              builder.add(node.from, node.to, Decoration.replace({ widget: new ImageWidget(match[2], match[1]) }))
              return false
            }
          }
          return true
        }

        if (name === 'HorizontalRule') {
          if (!lineActive(node.from)) {
            const line = state.doc.lineAt(node.from)
            builder.add(line.from, line.to, Decoration.replace({ widget: new HrWidget() }))
          }
          return false
        }

        if (name === 'TaskMarker') {
          // `[ ]` / `[x]` → an interactive checkbox (kept live even on the
          // active line so it's always clickable).
          const glyph = state.sliceDoc(node.from, node.to)
          const checked = /x/i.test(glyph)
          builder.add(node.from, node.to, Decoration.replace({ widget: new TaskCheckboxWidget(checked, node.from, node.to) }))
          return false
        }

        if (name === 'ListMark') {
          // Prettify unordered bullets; leave ordered-list numbers as-is. On a
          // task item the checkbox stands in for the bullet, so drop the marker.
          if (!lineActive(node.from)) {
            const glyph = state.sliceDoc(node.from, node.to)
            if (glyph === '-' || glyph === '*' || glyph === '+') {
              const isTaskItem = /^\s*\[[ xX]\]/.test(state.sliceDoc(node.to, node.to + 5))
              builder.add(
                node.from,
                node.to,
                isTaskItem ? hide : Decoration.replace({ widget: new BulletWidget() }),
              )
            }
          }
          return false
        }

        if (MARKER_NODES.has(name)) {
          if (!lineActive(node.from)) {
            let end = node.to
            // Swallow the space after a heading '#'/'##' so text starts at the margin.
            if (name === 'HeaderMark' && state.sliceDoc(end, end + 1) === ' ') end += 1
            if (end > node.from) builder.add(node.from, end, hide)
          }
          return false
        }

        return true
      },
    })
  }

  return builder.finish()
}
