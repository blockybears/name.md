import { Image } from '@tiptap/extension-image'
import { Markdown } from '@tiptap/markdown'
import type { Editor, JSONContent, MarkdownRendererHelpers } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { TaskItem } from '@tiptap/extension-task-item'
import { TaskList } from '@tiptap/extension-task-list'
import { Details, DetailsContent, DetailsSummary } from './collapsible'
import { Callout, KeyboardKey, Underline } from './richFormatting'
import { MermaidDiagram } from './mermaidDiagram'
import { JsonFlow } from './jsonFlow'
import {
  DefinitionDescription,
  DefinitionList,
  DefinitionTerm,
  FootnoteDefinition,
  FootnoteReference,
  Highlight,
  MarkdownHeading,
  Subscript,
  Superscript,
  escapeUnsafeHtml,
} from './extendedMarkdown'

export type MarkdownEditorHandle = Editor

type TableCellRender = {
  align: 'left' | 'center' | 'right' | null
  isHeader: boolean
  text: string
}

const hardBreakMarkdownPattern = /(?: {2,}|\\)\n/g
const allowedTableMarks = new Set(['bold', 'italic', 'strike', 'code', 'link', 'highlight', 'subscript', 'superscript'])
const allowedTableInlineNodes = new Set(['text', 'hardBreak', 'footnoteReference'])

export const starterMarkdown = `# Untitled

Start writing directly in the document.

| Column A | Column B | Column C |
| --- | --- | --- |
| Type directly | Resize columns | Tab between cells |
| Add rows | Add columns | Save as Markdown |
`

const MarkdownTable = Table.extend({
  renderMarkdown(node, helpers) {
    return renderTableMarkdown(node, helpers)
  },
})

const MarkdownTableHeader = TableHeader.extend({
  content: 'paragraph+',
})

const MarkdownTableCell = TableCell.extend({
  content: 'paragraph+',
})

export function createMarkdownExtensions() {
  return [
    StarterKit.configure({
      heading: false,
      underline: false,
      link: {
        autolink: true,
        linkOnPaste: true,
        openOnClick: false,
      },
    }),
    MarkdownHeading,
    Highlight,
    Subscript,
    Superscript,
    FootnoteReference,
    FootnoteDefinition,
    DefinitionList,
    DefinitionTerm,
    DefinitionDescription,
    Details,
    DetailsSummary,
    DetailsContent,
    Callout,
    Underline,
    KeyboardKey,
    MermaidDiagram,
    JsonFlow,
    Image,
    TaskList,
    TaskItem.configure({ nested: true }),
    MarkdownTable.configure({
      resizable: true,
      lastColumnResizable: true,
      cellMinWidth: 120,
    }),
    TableRow,
    MarkdownTableHeader,
    MarkdownTableCell,
    Markdown.configure({
      markedOptions: {
        gfm: true,
        breaks: false,
      },
    }),
  ]
}

function renderTableMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
  const rows = (node.content ?? []).map((rowNode) => {
    return (rowNode.content ?? []).map((cellNode) => renderCell(cellNode, helpers))
  })

  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0)
  if (columnCount === 0) {
    return ''
  }

  const columnWidths = Array.from({ length: columnCount }, (_, columnIndex) => {
    const maxContentWidth = rows.reduce((max, row) => Math.max(max, row[columnIndex]?.text.length ?? 0), 0)
    return Math.max(3, maxContentWidth)
  })

  const firstRow = rows[0] ?? []
  const hasHeader = firstRow.some((cell) => cell.isHeader)
  const alignments = Array.from({ length: columnCount }, (_, columnIndex) => {
    for (const row of rows) {
      if (row[columnIndex]?.align) {
        return row[columnIndex].align
      }
    }

    return null
  })

  const headerCells = Array.from({ length: columnCount }, (_, columnIndex) => {
    return hasHeader ? firstRow[columnIndex]?.text ?? '' : ''
  })
  const bodyRows = hasHeader ? rows.slice(1) : rows
  const output = [
    makeTableRow(headerCells, columnWidths),
    makeTableRow(alignments.map((alignment, index) => makeDelimiter(alignment, columnWidths[index]))),
    ...bodyRows.map((row) => {
      return makeTableRow(
        Array.from({ length: columnCount }, (_, columnIndex) => row[columnIndex]?.text ?? ''),
        columnWidths,
      )
    }),
  ]

  return `\n${output.join('\n')}\n`
}

function renderCell(cellNode: JSONContent, helpers: MarkdownRendererHelpers): TableCellRender {
  const children = cellNode.content ?? []
  const raw = children.map((child) => renderTableCellBlock(child, helpers)).join('<br><br>')

  return {
    align: normalizeAlign(cellNode.attrs?.align),
    isHeader: cellNode.type === 'tableHeader',
    text: escapeTableCell(collapseTableCellWhitespace(raw)),
  }
}

function renderTableCellBlock(node: JSONContent, helpers: MarkdownRendererHelpers) {
  const content = node.content ?? []

  if (node.type === 'paragraph') {
    return renderTableCellInline(content, helpers)
  }

  if (node.type === 'hardBreak') {
    return '<br>'
  }

  return renderTableCellInline(node, helpers)
}

function renderTableCellInline(content: JSONContent | JSONContent[], helpers: MarkdownRendererHelpers) {
  return helpers.renderChildren(sanitizeTableInlineContent(content)).replace(hardBreakMarkdownPattern, '<br>')
}

function collapseTableCellWhitespace(value: string) {
  return value
    .split('<br>')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .join('<br>')
    .replace(/(?:<br>){3,}/g, '<br><br>')
    .replace(/^(?:<br>)+|(?:<br>)+$/g, '')
}

function escapeTableCell(value: string) {
  return value.replace(/\|/g, '&#124;')
}

function normalizeAlign(value: unknown) {
  return value === 'left' || value === 'center' || value === 'right' ? value : null
}

function makeTableRow(cells: string[], widths?: number[]) {
  return `| ${cells.map((cell, index) => padCell(cell, widths?.[index] ?? cell.length)).join(' | ')} |`
}

function makeDelimiter(alignment: TableCellRender['align'], width: number) {
  const marker = '-'.repeat(Math.max(3, width))

  if (alignment === 'left') {
    return `:${marker}`
  }

  if (alignment === 'center') {
    return `:${marker}:`
  }

  if (alignment === 'right') {
    return `${marker}:`
  }

  return marker
}

function padCell(cell: string, width: number) {
  return cell + ' '.repeat(Math.max(0, width - cell.length))
}

export function normalizeMarkdownInput(markdown: string) {
  return escapeUnsafeHtml(markdown)
}

export function getEditorMarkdown(editor: Editor) {
  return editor.getMarkdown()
}

export function setEditorMarkdown(
  editor: Editor,
  markdown: string,
  emitUpdate = false,
) {
  editor.commands.setContent(normalizeMarkdownInput(markdown), {
    contentType: 'markdown',
    emitUpdate,
  })
}

export function isTableActive(editor: Editor | null) {
  return Boolean(editor?.isActive('table'))
}

export function handleMarkdownKeyDown(
  editor: Editor | null,
  event: KeyboardEvent,
) {
  if (!editor) {
    return false
  }

  if (event.key === 'Tab' && editor.isActive('table')) {
    const moved = event.shiftKey
      ? editor.commands.goToPreviousCell()
      : editor.commands.goToNextCell()

    if (moved) {
      event.preventDefault()
      return true
    }
  }

  if (event.key === 'Enter' && editor.isActive('table')) {
    editor.commands.setHardBreak()
    event.preventDefault()
    return true
  }

  return false
}

function sanitizeTableInlineContent(content: JSONContent | JSONContent[]): JSONContent[] {
  const nodes = Array.isArray(content) ? content : [content]

  return nodes.flatMap((node) => sanitizeTableInlineNode(node))
}

function sanitizeTableInlineNode(node: JSONContent): JSONContent[] {
  if (!node.type) {
    return []
  }

  if (node.type === 'text') {
    return [{
      ...node,
      marks: node.marks?.filter((mark) => allowedTableMarks.has(mark.type)),
    }]
  }

  if (allowedTableInlineNodes.has(node.type)) {
    return [node]
  }

  if (node.type === 'image') {
    const fallback = String(node.attrs?.alt || node.attrs?.src || '').trim()

    return fallback ? [{ type: 'text', text: fallback }] : []
  }

  if (node.content) {
    return sanitizeTableInlineContent(node.content)
  }

  return []
}
