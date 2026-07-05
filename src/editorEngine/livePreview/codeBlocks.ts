import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

// Fenced code stays editable text (unlike a read-only widget) — we just paint a
// block background over its lines and round the first/last so it reads as a code
// block. Line decorations are allowed from a view plugin.
const codeLine = Decoration.line({ class: 'cm-wp-code' })
const codeLineFirst = Decoration.line({ class: 'cm-wp-code cm-wp-code-first' })
const codeLineLast = Decoration.line({ class: 'cm-wp-code cm-wp-code-last' })

export const codeBlockStyling = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = build(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const { state } = view
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'FencedCode' && node.name !== 'CodeBlock') return true
        const firstLine = state.doc.lineAt(node.from).number
        const lastLine = state.doc.lineAt(node.to).number
        for (let n = firstLine; n <= lastLine; n++) {
          const line = state.doc.line(n)
          const deco = n === firstLine ? codeLineFirst : n === lastLine ? codeLineLast : codeLine
          builder.add(line.from, line.from, deco)
        }
        return false
      },
    })
  }
  return builder.finish()
}
