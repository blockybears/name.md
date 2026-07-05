import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { BulletWidget, HrWidget, ImageWidget } from './widgets'

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
      // Rebuild on edits, cursor moves, and scroll — but also when the language
      // parser advances (large docs parse the new viewport a beat after the
      // scroll update, via a transaction with none of the flags below set).
      if (
        update.docChanged ||
        update.selectionSet ||
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

  const activeLines = new Set<number>()
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    for (let n = first; n <= last; n++) activeLines.add(n)
  }
  const lineActive = (pos: number) => activeLines.has(state.doc.lineAt(pos).number)

  for (const { from, to } of view.visibleRanges) {
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

        if (name === 'ListMark') {
          // Prettify unordered bullets; leave ordered-list numbers as-is.
          if (!lineActive(node.from)) {
            const glyph = state.sliceDoc(node.from, node.to)
            if (glyph === '-' || glyph === '*' || glyph === '+') {
              builder.add(node.from, node.to, Decoration.replace({ widget: new BulletWidget() }))
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
