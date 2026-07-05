import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import './extendedBlocks.css'

// Styling for a few more name.md markdown features, all done with inline/line
// decorations so the content stays editable inline (WYSIWYG):
//   - footnote references [^x] → small superscript link
//   - footnote definitions [^x]: … → muted footnote line with a superscript label
//   - definition lists (Term / : description) → bold term + indented description
const hide = Decoration.replace({})

class SupLabelWidget extends WidgetType {
  readonly text: string
  readonly cls: string
  constructor(text: string, cls: string) {
    super()
    this.text = text
    this.cls = cls
  }
  eq(other: SupLabelWidget) {
    return other.text === this.text && other.cls === this.cls
  }
  toDOM() {
    const sup = document.createElement('sup')
    sup.className = this.cls
    sup.textContent = this.text
    return sup
  }
}

export const extendedBlocks = ViewPlugin.fromClass(
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
  const firstLine = state.doc.lineAt(from).number
  const lastLine = state.doc.lineAt(to).number
  const items: { from: number; to: number; deco: Decoration }[] = []

  for (let n = firstLine; n <= lastLine; n++) {
    const line = state.doc.line(n)
    const text = line.text

    // Footnote definition: [^label]: text
    const def = /^\[\^([^\]]+)\]:[ \t]?/.exec(text)
    if (def) {
      items.push({ from: line.from, to: line.from, deco: Decoration.line({ class: 'cm-footnote-def' }) })
      items.push({ from: line.from, to: line.from + def[0].length, deco: Decoration.replace({ widget: new SupLabelWidget(def[1], 'cm-footnote-label') }) })
      continue
    }

    // Definition description: ": text"
    const desc = /^:[ \t]+/.exec(text)
    if (desc) {
      items.push({ from: line.from, to: line.from, deco: Decoration.line({ class: 'cm-defdesc' }) })
      items.push({ from: line.from, to: line.from + desc[0].length, deco: hide })
      continue
    }

    // Definition term: a non-empty line immediately followed by a ": …" line.
    if (text.trim() !== '' && n < state.doc.lines) {
      const next = state.doc.line(n + 1)
      if (/^:[ \t]+/.test(next.text)) {
        items.push({ from: line.from, to: line.from, deco: Decoration.line({ class: 'cm-defterm' }) })
      }
    }

    // Inline footnote references [^x] (not a definition) on this line.
    const refRe = /\[\^([^\]\s]+)\](?!:)/g
    let m: RegExpExecArray | null
    while ((m = refRe.exec(text)) !== null) {
      const start = line.from + m.index
      items.push({ from: start, to: start + m[0].length, deco: Decoration.replace({ widget: new SupLabelWidget(m[1], 'cm-footnote-ref') }) })
    }
  }

  items.sort((a, b) => a.from - b.from || a.to - b.to)
  return Decoration.set(
    items.map((i) => i.deco.range(i.from, i.to)),
    true,
  )
}
