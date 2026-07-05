import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import './callout.css'

// GitHub-style callouts: a blockquote whose first line is `[!NOTE]` (tip,
// important, warning, caution). We style the quote lines as a callout box and
// replace the `[!TYPE]` marker with a label. The `>` markers are already hidden
// by the inline layer, so the callout body stays editable inline (WYSIWYG).
const CALLOUT_RE = /^>\s*\[!(\w+)\]/

const KNOWN = new Set(['note', 'tip', 'important', 'warning', 'caution'])

class CalloutLabelWidget extends WidgetType {
  readonly type: string
  constructor(type: string) {
    super()
    this.type = type
  }
  eq(other: CalloutLabelWidget) {
    return other.type === this.type
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = `cm-callout-label cm-callout-label-${this.type}`
    span.textContent = this.type.charAt(0).toUpperCase() + this.type.slice(1)
    return span
  }
}

export const calloutStyling = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = build(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

function build(view: EditorView): DecorationSet {
  const { state } = view
  const { from, to } = view.viewport
  const items: { from: number; to: number; deco: Decoration }[] = []
  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (node.name !== 'Blockquote') return
      const firstLine = state.doc.lineAt(node.from)
      const match = CALLOUT_RE.exec(firstLine.text)
      if (!match) return
      const type = KNOWN.has(match[1].toLowerCase()) ? match[1].toLowerCase() : 'note'
      const lastLine = state.doc.lineAt(node.to)
      for (let n = firstLine.number; n <= lastLine.number; n++) {
        const line = state.doc.line(n)
        const cls =
          `cm-callout cm-callout-${type}` +
          (n === firstLine.number ? ' cm-callout-first' : '') +
          (n === lastLine.number ? ' cm-callout-last' : '')
        items.push({ from: line.from, to: line.from, deco: Decoration.line({ class: cls }) })
      }
      // Replace `[!TYPE]` (and a trailing space) with a label chip.
      const idx = firstLine.text.indexOf('[!')
      const close = firstLine.text.indexOf(']', idx)
      if (idx >= 0 && close > idx) {
        const start = firstLine.from + idx
        let end = firstLine.from + close + 1
        if (state.sliceDoc(end, end + 1) === ' ') end += 1
        items.push({ from: start, to: end, deco: Decoration.replace({ widget: new CalloutLabelWidget(type) }) })
      }
    },
  })
  items.sort((a, b) => a.from - b.from || a.to - b.to)
  return Decoration.set(
    items.map((i) => i.deco.range(i.from, i.to)),
    true,
  )
}
