import { EditorSelection, type ChangeSpec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { undo, redo } from '@codemirror/commands'

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
  getHeadings(): OutlineItem[]
  gotoPos(pos: number): void
}

export type OutlineItem = { level: number; text: string; pos: number }

const DEFAULT_TABLE = ['| Column A | Column B | Column C |', '| --- | --- | --- |', '| | | |', '| | | |'].join('\n')

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

/** Add a line prefix to every selected line, or strip it if all lines already
 *  have it (toggle). `pattern` matches an existing prefix to replace. */
function toggleLinePrefix(view: EditorView, prefix: string, pattern: RegExp) {
  const { first, last } = selectedLineNumbers(view)
  const lines = []
  for (let n = first; n <= last; n++) lines.push(view.state.doc.line(n))
  const allHave = lines.every((line) => pattern.test(line.text))
  const changes: ChangeSpec[] = lines.map((line) => {
    if (allHave) {
      return { from: line.from, to: line.to, insert: line.text.replace(pattern, '') }
    }
    const stripped = line.text.replace(pattern, '')
    return { from: line.from, to: line.to, insert: prefix + stripped }
  })
  view.dispatch({ changes })
  view.focus()
}

function setHeading(view: EditorView, level: number) {
  const headingPrefix = /^#{1,6}\s+/
  toggleLinePrefix(view, level > 0 ? `${'#'.repeat(level)} ` : '', headingPrefix)
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
    toggleBlockquote: () => toggleLinePrefix(view, '> ', /^>\s?/),
    toggleBulletList: () => toggleLinePrefix(view, '- ', /^[-*+]\s+/),
    toggleOrderedList: () => toggleLinePrefix(view, '1. ', /^\d+\.\s+/),
    toggleTaskList: () => toggleLinePrefix(view, '- [ ] ', /^[-*+]\s+(\[[ xX]\]\s+)?/),
    setParagraph: () => setHeading(view, 0),
    toggleHeading: (level: number) => setHeading(view, level),
    setHorizontalRule: () => insertBlockAtCursor(view, '---'),
    insertTable: () => insertBlockAtCursor(view, DEFAULT_TABLE),
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
    // Active-state highlighting for the CM6 surface is a later polish.
    isActive: () => false,
    getHeadings: () => scanHeadings(view),
    gotoPos: (pos: number) => {
      view.dispatch({ selection: EditorSelection.cursor(pos), effects: EditorView.scrollIntoView(pos, { y: 'start' }) })
      view.focus()
    },
  }
}
