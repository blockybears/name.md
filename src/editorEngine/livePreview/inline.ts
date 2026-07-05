import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
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
      // Markers are always hidden, so decorations don't depend on the selection
      // — but we still rebuild on selectionSet because it's a cheap way to pick
      // up parser progress after typing (the output is identical when nothing
      // changed, so it can't reflow a drag-selection).
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

  // Single contiguous viewport, not gapped visibleRanges (see codeBlocks.ts).
  // Markers are hidden unconditionally — full WYSIWYG, no active-line reveal.
  const { from, to } = view.viewport
  // Use the parsed-to-viewport tree (forcing it if needed) rather than whatever
  // syntaxTree() has so far, so freshly-typed lines (e.g. new task-list items)
  // are decorated immediately instead of leaving raw `- [ ]` markers.
  const tree = ensureSyntaxTree(state, to, 50) ?? syntaxTree(state)
  tree.iterate({
    from,
    to,
    enter: (node) => {
      const name = node.name

      if (name === 'Image') {
        const match = /!\[([^\]]*)\]\(([^)]+)\)/.exec(state.sliceDoc(node.from, node.to))
        if (match) {
          builder.add(node.from, node.to, Decoration.replace({ widget: new ImageWidget(match[2], match[1]) }))
          return false
        }
        return true
      }

      if (name === 'HorizontalRule') {
        const line = state.doc.lineAt(node.from)
        builder.add(line.from, line.to, Decoration.replace({ widget: new HrWidget() }))
        return false
      }

      if (name === 'TaskMarker') {
        // `[ ]` / `[x]` → an interactive checkbox.
        const glyph = state.sliceDoc(node.from, node.to)
        const checked = /x/i.test(glyph)
        builder.add(node.from, node.to, Decoration.replace({ widget: new TaskCheckboxWidget(checked, node.from, node.to) }))
        return false
      }

      if (name === 'ListMark') {
        // Prettify unordered bullets; leave ordered-list numbers as-is. On a
        // task item the checkbox stands in for the bullet, so drop the marker.
        const glyph = state.sliceDoc(node.from, node.to)
        if (glyph === '-' || glyph === '*' || glyph === '+') {
          const isTaskItem = /^\s*\[[ xX]\]/.test(state.sliceDoc(node.to, node.to + 5))
          builder.add(node.from, node.to, isTaskItem ? hide : Decoration.replace({ widget: new BulletWidget() }))
        }
        return false
      }

      if (MARKER_NODES.has(name)) {
        let end = node.to
        // Swallow the space after a heading '#'/'##' so text starts at the margin.
        if (name === 'HeaderMark' && state.sliceDoc(end, end + 1) === ' ') end += 1
        if (end > node.from) builder.add(node.from, end, hide)
        return false
      }

      return true
    },
  })

  return builder.finish()
}
