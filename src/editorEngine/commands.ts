import { EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { undo, redo } from '@codemirror/commands'
import { syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import { getActiveInlineTarget } from './activeInlineTarget'

// A surface-agnostic set of editor actions the toolbar / document map drive, so
// App.tsx can talk to one interface whether the classic (TipTap) or new (CM6)
// engine is active.
export interface FormatController {
  focus(): void
  undo(): void
  redo(): void
  toggleBold(): void
  toggleItalic(): void
  toggleStrike(): void
  toggleUnderline(): void
  toggleHighlight(): void
  toggleSubscript(): void
  toggleSuperscript(): void
  toggleKbd(): void
  toggleInlineCode(): void
  toggleCodeBlock(): void
  toggleBlockquote(): void
  toggleBulletList(): void
  toggleOrderedList(): void
  toggleTaskList(): void
  setParagraph(): void
  toggleHeading(level: number): void
  setHorizontalRule(): void
  insertTable(): void
  insertAdvancedTable(): void
  insertLink(text: string, href: string, title?: string): void
  insertImage(src: string, alt: string, title?: string): void
  insertText(text: string): void
  isActive(name: string): boolean
  headingLevel(): number
  focusEnd(): void
  /** If the caret is inside a link, select it and return its parts (for editing
   *  via the toolbar, since the source is hidden); else null. */
  linkAtCursor(): { text: string; href: string; title: string } | null
  /** If the caret is inside an image, select it and return its parts; else null. */
  imageAtCursor(): { alt: string; src: string; title: string } | null
  /** The custom id (`{#id}`) of the heading the caret is in, '' if none/not a heading. */
  getHeadingId(): string | null
  /** Set (or clear, with '') the custom id on the caret's heading line. */
  setHeadingId(id: string): void
  getHeadings(): OutlineItem[]
  gotoPos(pos: number): void
}

export type OutlineItem = { level: number; text: string; pos: number }

const DEFAULT_ADVANCED_TABLE = JSON.stringify({
  cols: [{ w: 180 }, { w: 180 }, { w: 180 }],
  rows: [
    { header: true, cells: [{ text: 'Column A' }, { text: 'Column B' }, { text: 'Column C' }] },
    { cells: [{ text: '' }, { text: '' }, { text: '' }] },
    { cells: [{ text: '' }, { text: '' }, { text: '' }] },
  ],
})

// ---- primitives ----

function wrapInline(view: EditorView, before: string, after = before) {
  // If a rich table cell is focused, format its selection instead of the doc.
  const cell = getActiveInlineTarget()
  if (cell) {
    cell.wrap(before, after)
    return
  }
  const { state } = view
  const { from, to } = state.selection.main
  const sel = state.sliceDoc(from, to)
  const len = state.doc.length
  const outBefore = state.sliceDoc(Math.max(0, from - before.length), from)
  const outAfter = state.sliceDoc(to, Math.min(len, to + after.length))
  if (outBefore === before && outAfter === after) {
    view.dispatch({
      changes: [
        { from: from - before.length, to: from, insert: '' },
        { from: to, to: to + after.length, insert: '' },
      ],
      selection: EditorSelection.range(from - before.length, to - before.length),
    })
  } else {
    view.dispatch({
      changes: { from, to, insert: before + sel + after },
      selection: EditorSelection.range(from + before.length, from + before.length + sel.length),
    })
  }
  view.focus()
}

function selectedLineNumbers(view: EditorView) {
  const { from, to } = view.state.selection.main
  return {
    first: view.state.doc.lineAt(from).number,
    last: view.state.doc.lineAt(to).number,
  }
}

// Any leading list marker (bullet, number, or task) — used to strip before
// applying a new one, so bullet↔number↔task conversions replace cleanly.
const LIST_MARKER_RE = /^(?:[-*+]|\d+\.)[ \t]+(?:\[[ xX]\][ \t]+)?/
const HEADING_RE = /^#{1,6}[ \t]+/
const QUOTE_RE = /^>[ \t]?/

function selectedLines(view: EditorView) {
  const { first, last } = selectedLineNumbers(view)
  const lines = []
  for (let n = first; n <= last; n++) lines.push(view.state.doc.line(n))
  return lines
}

// Apply prefix edits that touch ONLY the marker region at each line start (never
// the whole line), so the caret stays with its text instead of jumping.
type PrefixEdit = { from: number; to: number; insert: string }
function dispatchPrefixEdits(view: EditorView, edits: (PrefixEdit | null)[]) {
  const changes = edits.filter((edit): edit is PrefixEdit => edit != null && !(edit.from === edit.to && edit.insert === ''))
  if (changes.length) view.dispatch({ changes })
  view.focus()
}

type ListKind = 'bullet' | 'ordered' | 'task'

function applyList(view: EditorView, kind: ListKind) {
  const lines = selectedLines(view)
  const isKind = (text: string) =>
    kind === 'bullet'
      ? /^[-*+][ \t]+(?!\[[ xX]\])/.test(text)
      : kind === 'ordered'
        ? /^\d+\.[ \t]+/.test(text)
        : /^[-*+][ \t]+\[[ xX]\][ \t]+/.test(text)
  const meaningful = lines.filter((line) => line.text.trim() !== '')
  const allKind = meaningful.length > 0 && meaningful.every((line) => isKind(line.text))
  let index = 0
  dispatchPrefixEdits(
    view,
    lines.map((line) => {
      const match = LIST_MARKER_RE.exec(line.text)
      const matchLen = match ? match[0].length : 0
      if (allKind || line.text.trim() === '') {
        return { from: line.from, to: line.from + matchLen, insert: '' } // toggle off
      }
      index += 1
      const marker = kind === 'bullet' ? '- ' : kind === 'ordered' ? `${index}. ` : '- [ ] '
      return { from: line.from, to: line.from + matchLen, insert: marker }
    }),
  )
}

function setHeading(view: EditorView, level: number) {
  dispatchPrefixEdits(
    view,
    selectedLines(view).map((line) => {
      const match = HEADING_RE.exec(line.text)
      const matchLen = match ? match[0].length : 0
      return { from: line.from, to: line.from + matchLen, insert: level > 0 ? `${'#'.repeat(level)} ` : '' }
    }),
  )
}

function toggleBlockquote(view: EditorView) {
  const lines = selectedLines(view)
  const meaningful = lines.filter((line) => line.text.trim() !== '')
  const allQuoted = meaningful.length > 0 && meaningful.every((line) => QUOTE_RE.test(line.text))
  dispatchPrefixEdits(
    view,
    lines.map((line) => {
      const match = QUOTE_RE.exec(line.text)
      const matchLen = match ? match[0].length : 0
      if (allQuoted) return { from: line.from, to: line.from + matchLen, insert: '' }
      if (matchLen) return null // already quoted
      return { from: line.from, to: line.from, insert: '> ' }
    }),
  )
}

function insertBlockAtCursor(view: EditorView, text: string) {
  const { from, to } = view.state.selection.main
  const before = from > 0 && view.state.sliceDoc(from - 1, from) !== '\n' ? '\n' : ''
  const insert = `${before}${text}\n`
  view.dispatch({ changes: { from, to, insert }, selection: EditorSelection.cursor(from + insert.length) })
  view.focus()
}

function scanHeadings(view: EditorView): OutlineItem[] {
  // Regex over raw text — cheap and reliable on huge docs (no full parse needed).
  const items: OutlineItem[] = []
  const doc = view.state.doc
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n)
    const match = /^(#{1,6})\s+(.*)$/.exec(line.text)
    if (match) {
      items.push({ level: match[1].length, text: match[2].trim() || 'Untitled section', pos: line.from })
    }
  }
  return items
}

// ---- active-state queries ----

// Inline formats map to syntax-tree node names; block formats are detected from
// the current line prefix (or a fenced-code ancestor).
const INLINE_NODE: Record<string, string> = {
  bold: 'StrongEmphasis',
  italic: 'Emphasis',
  strike: 'Strikethrough',
  code: 'InlineCode',
}

function currentHeadingLevel(view: EditorView): number {
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  const match = /^(#{1,6})\s/.exec(line.text)
  return match ? match[1].length : 0
}

function hasAncestor(view: EditorView, pos: number, names: Set<string>): boolean {
  let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, -1)
  while (node) {
    if (names.has(node.name)) return true
    node = node.parent
  }
  return false
}

const CODE_BLOCK_NODES = new Set(['FencedCode', 'CodeBlock'])

// Regex-detected inline formats (not in the base grammar): true when the caret
// sits inside a match on its line.
const REGEX_FORMAT: Record<string, RegExp> = {
  highlight: /==[^=\n]+==/g,
  underline: /<u>[\s\S]*?<\/u>/g,
  keyboardKey: /<kbd>[\s\S]*?<\/kbd>/g,
  subscript: /(?<![~\w])~[^~\s][^~\n]*?~(?![~\w])/g,
  superscript: /(?<![\^\w])\^[^\s^]+?\^(?![\^\w])/g,
}

function regexFormatActive(view: EditorView, re: RegExp): boolean {
  const pos = view.state.selection.main.head
  const line = view.state.doc.lineAt(pos)
  const rel = pos - line.from
  re.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(line.text)) !== null) {
    if (rel > match.index && rel < match.index + match[0].length) return true
  }
  return false
}

function isActiveFormat(view: EditorView, name: string): boolean {
  const pos = view.state.selection.main.head
  const text = view.state.doc.lineAt(pos).text

  switch (name) {
    case 'heading':
      return /^#{1,6}\s/.test(text)
    case 'blockquote':
      return /^>/.test(text)
    case 'taskList':
      return /^\s*[-*+]\s+\[[ xX]\]/.test(text)
    case 'bulletList':
      return /^\s*[-*+]\s/.test(text) && !/^\s*[-*+]\s+\[[ xX]\]/.test(text)
    case 'orderedList':
      return /^\s*\d+\.\s/.test(text)
    case 'paragraph':
      return !/^\s*(#{1,6}\s|>|[-*+]\s|\d+\.\s|```)/.test(text)
    case 'codeBlock':
      return hasAncestor(view, pos, CODE_BLOCK_NODES)
  }

  if (REGEX_FORMAT[name]) return regexFormatActive(view, REGEX_FORMAT[name])
  const wanted = INLINE_NODE[name]
  return wanted ? hasAncestor(view, pos, new Set([wanted])) : false
}

// ---- controller ----

export function createCm6FormatController(view: EditorView): FormatController {
  return {
    focus: () => view.focus(),
    undo: () => { undo(view); view.focus() },
    redo: () => { redo(view); view.focus() },
    toggleBold: () => wrapInline(view, '**'),
    toggleItalic: () => wrapInline(view, '*'),
    toggleStrike: () => wrapInline(view, '~~'),
    toggleUnderline: () => wrapInline(view, '<u>', '</u>'),
    toggleHighlight: () => wrapInline(view, '=='),
    toggleSubscript: () => wrapInline(view, '~'),
    toggleSuperscript: () => wrapInline(view, '^'),
    toggleKbd: () => wrapInline(view, '<kbd>', '</kbd>'),
    toggleInlineCode: () => wrapInline(view, '`'),
    toggleCodeBlock: () => {
      const { from, to } = view.state.selection.main
      const sel = view.state.sliceDoc(from, to)
      view.dispatch({ changes: { from, to, insert: '```\n' + sel + '\n```' } })
      view.focus()
    },
    toggleBlockquote: () => toggleBlockquote(view),
    toggleBulletList: () => applyList(view, 'bullet'),
    toggleOrderedList: () => applyList(view, 'ordered'),
    toggleTaskList: () => applyList(view, 'task'),
    setParagraph: () => setHeading(view, 0),
    toggleHeading: (level: number) => setHeading(view, level),
    setHorizontalRule: () => insertBlockAtCursor(view, '---'),
    // One table: the capable grid (fixed widths + rich cells). Plain GFM tables
    // still render (back-compat) but this is what "Insert table" creates.
    insertTable: () => insertBlockAtCursor(view, '```table\n' + DEFAULT_ADVANCED_TABLE + '\n```'),
    insertAdvancedTable: () => insertBlockAtCursor(view, '```table\n' + DEFAULT_ADVANCED_TABLE + '\n```'),
    insertLink: (text: string, href: string, title?: string) => {
      const label = text || href
      const titlePart = title ? ` "${title}"` : ''
      const { from, to } = view.state.selection.main
      view.dispatch({ changes: { from, to, insert: `[${label}](${href}${titlePart})` } })
      view.focus()
    },
    insertImage: (src: string, alt: string, title?: string) => {
      const titlePart = title ? ` "${title}"` : ''
      const { from, to } = view.state.selection.main
      view.dispatch({ changes: { from, to, insert: `![${alt}](${src}${titlePart})` } })
      view.focus()
    },
    insertText: (text: string) => {
      const { from, to } = view.state.selection.main
      view.dispatch({ changes: { from, to, insert: text } })
      view.focus()
    },
    isActive: (name: string) => isActiveFormat(view, name),
    headingLevel: () => currentHeadingLevel(view),
    focusEnd: () => { view.dispatch({ selection: EditorSelection.cursor(view.state.doc.length) }); view.focus() },
    linkAtCursor: () => {
      const { state } = view
      const pos = state.selection.main.head
      const line = state.doc.lineAt(pos)
      const re = /(?<!!)\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g
      let match: RegExpExecArray | null
      while ((match = re.exec(line.text)) !== null) {
        const start = line.from + match.index
        const end = start + match[0].length
        if (pos >= start && pos <= end) {
          view.dispatch({ selection: EditorSelection.range(start, end) })
          return { text: match[1], href: match[2], title: match[3] ?? '' }
        }
      }
      return null
    },
    imageAtCursor: () => {
      const { state } = view
      const pos = state.selection.main.head
      const line = state.doc.lineAt(pos)
      const re = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g
      let match: RegExpExecArray | null
      while ((match = re.exec(line.text)) !== null) {
        const start = line.from + match.index
        const end = start + match[0].length
        if (pos >= start && pos <= end) {
          view.dispatch({ selection: EditorSelection.range(start, end) })
          return { alt: match[1], src: match[2], title: match[3] ?? '' }
        }
      }
      return null
    },
    getHeadingId: () => {
      const line = view.state.doc.lineAt(view.state.selection.main.head)
      const match = /\{#([\w:.-]+)\}\s*$/.exec(line.text)
      return match ? match[1] : ''
    },
    setHeadingId: (id: string) => {
      const line = view.state.doc.lineAt(view.state.selection.main.head)
      if (!/^#{1,6}\s/.test(line.text)) return
      let text = line.text.replace(/\s*\{#[\w:.-]+\}\s*$/, '').replace(/\s+$/, '')
      if (id) text += ` {#${id}}`
      view.dispatch({ changes: { from: line.from, to: line.to, insert: text } })
      view.focus()
    },
    getHeadings: () => scanHeadings(view),
    gotoPos: (pos: number) => {
      view.dispatch({ selection: EditorSelection.cursor(pos), effects: EditorView.scrollIntoView(pos, { y: 'start' }) })
      view.focus()
    },
  }
}
