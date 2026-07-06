import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import './extendedBlocks.css'

// Styling for a few more name.md markdown features, all done with inline/line
// decorations so the content stays editable inline (WYSIWYG):
//   - footnote references [^x] → small superscript link
//   - footnote definitions [^x]: … → muted footnote line with a superscript label
//   - definition lists (Term / : description) → bold term + indented description
const hide = Decoration.replace({})

class AnchorWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-heading-anchor'
    span.textContent = '#'
    span.title = 'This heading has a custom id (edit via Set heading ID)'
    return span
  }
}

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

  let inDetails = false
  for (let n = firstLine; n <= lastLine; n++) {
    const line = state.doc.line(n)
    const text = line.text

    // Collapsible <details>/<summary>: hide the raw tags and style as a boxed
    // section (content stays editable inline). Note: always-expanded for now.
    if (/^\s*<details\b[^>]*>\s*$/i.test(text)) {
      items.push({ from: line.from, to: line.from, deco: Decoration.line({ class: 'cm-details-tag' }) })
      inDetails = true
      continue
    }
    if (/^\s*<\/details>\s*$/i.test(text)) {
      items.push({ from: line.from, to: line.from, deco: Decoration.line({ class: 'cm-details-tag' }) })
      inDetails = false
      continue
    }
    const summary = /^(\s*<summary>)(.*)(<\/summary>\s*)$/i.exec(text)
    if (summary) {
      items.push({ from: line.from, to: line.from, deco: Decoration.line({ class: 'cm-details-summary' }) })
      items.push({ from: line.from, to: line.from + summary[1].length, deco: hide })
      const closeStart = line.from + summary[1].length + summary[2].length
      items.push({ from: closeStart, to: line.to, deco: hide })
      continue
    }
    if (inDetails && text.trim() !== '') {
      items.push({ from: line.from, to: line.from, deco: Decoration.line({ class: 'cm-details-body' }) })
    }

    // Heading custom id: `## Title {#id}` — hide the {#id} (managed via the
    // "Set heading ID" toolbar action), showing a small anchor indicator.
    const hid = /^#{1,6}\s.*?(\{#[\w:.-]+\})[ \t]*$/.exec(text)
    if (hid) {
      const idStart = line.from + text.lastIndexOf(hid[1])
      items.push({ from: idStart, to: line.to, deco: Decoration.replace({ widget: new AnchorWidget() }) })
      continue
    }

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
