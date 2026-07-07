import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

// Inline formats that aren't in the base GFM grammar but that name.md supports:
// highlight (==x==), underline (<u>x</u>), keyboard key (<kbd>x</kbd>),
// subscript (~x~) and superscript (^x^). We render them and hide the delimiters
// via a regex pass over the viewport (a separate decoration layer from the
// syntax-tree one, so ordering stays simple).
type Pattern = { re: RegExp; cls: string; open: number; close: number }

const PATTERNS: Pattern[] = [
  { re: /==([^=\n]+)==/g, cls: 'cm-hl', open: 2, close: 2 },
  { re: /<u>([\s\S]*?)<\/u>/g, cls: 'cm-u', open: 3, close: 4 },
  { re: /<kbd>([\s\S]*?)<\/kbd>/g, cls: 'cm-kbd', open: 5, close: 6 },
  // single ~ (not ~~ strikethrough); may sit against text, e.g. H~2~O
  { re: /(?<!~)~([^~\s][^~\n]*?)~(?!~)/g, cls: 'cm-sub', open: 1, close: 1 },
  // single ^ (not a [^footnote], which has no closing ^), e.g. x^2^
  { re: /(?<!\^)\^([^\s^]+?)\^(?!\^)/g, cls: 'cm-sup', open: 1, close: 1 },
]

const hide = Decoration.replace({})

export const customInline = ViewPlugin.fromClass(
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
  const { from, to } = view.viewport
  const text = view.state.sliceDoc(from, to)
  const ranges: { from: number; to: number; deco: Decoration }[] = []
  const covered: Array<[number, number]> = []
  const overlaps = (a: number, b: number) => covered.some(([x, y]) => a < y && b > x)

  for (const pattern of PATTERNS) {
    pattern.re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.re.exec(text)) !== null) {
      const start = from + match.index
      const end = start + match[0].length
      if (overlaps(start, end)) continue
      covered.push([start, end])
      const contentStart = start + pattern.open
      const contentEnd = end - pattern.close
      ranges.push({ from: start, to: contentStart, deco: hide })
      if (contentEnd > contentStart) {
        ranges.push({ from: contentStart, to: contentEnd, deco: Decoration.mark({ class: pattern.cls }) })
      }
      ranges.push({ from: contentEnd, to: end, deco: hide })
    }
  }

  return Decoration.set(
    ranges.map((r) => r.deco.range(r.from, r.to)),
    true,
  )
}
