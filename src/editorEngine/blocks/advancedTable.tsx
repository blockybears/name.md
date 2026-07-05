/* eslint-disable react-refresh/only-export-components --
   Block-renderer module: defines the table component and exports its registration
   + pure model helpers. It is mounted imperatively by a CM6 widget, not via a
   hot-reloadable React tree, so the fast-refresh constraint doesn't apply. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { registerBlock } from './registry'
import { replaceBlock, type ReactBlockRenderArgs } from './reactWidget'
import './advancedTable.css'

// The advanced table: a custom ```table fenced block holding JSON that markdown
// can't express — rich multi-line cells plus persisted column widths and row
// heights — edited in a mini table editor (tab between cells, drag to resize,
// add/remove rows & columns). Round-trips as text.

type Cell = { text: string }
type Row = { h?: number | null; header?: boolean; cells: Cell[] }
type TableModel = { cols: { w?: number | null }[]; rows: Row[] }

const DEFAULT_MODEL: TableModel = {
  cols: [{ w: 180 }, { w: 180 }],
  rows: [
    { header: true, cells: [{ text: 'Column A' }, { text: 'Column B' }] },
    { cells: [{ text: '' }, { text: '' }] },
  ],
}

function parseModel(source: string): TableModel {
  try {
    const model = JSON.parse(source) as TableModel
    if (model && Array.isArray(model.cols) && Array.isArray(model.rows)) return model
  } catch {
    // fall through to default
  }
  return DEFAULT_MODEL
}

function serialize(model: TableModel): string {
  return '```table\n' + JSON.stringify(model) + '\n```'
}

function cloneModel(model: TableModel): TableModel {
  return {
    cols: model.cols.map((col) => ({ ...col })),
    rows: model.rows.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell })) })),
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Minimal inline markdown → HTML for cell display (bold, italic, code, strike,
// highlight). Applied after escaping, so it's safe.
function inlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

/** Render a cell's markdown (multi-line, with `- ` bullets and inline formats)
 *  to HTML for display. */
function renderCellMarkdown(text: string): string {
  const parts: string[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) {
      parts.push('<ul class="adv-cell-list">' + list.map((li) => `<li>${inlineMarkdown(li)}</li>`).join('') + '</ul>')
      list = []
    }
  }
  for (const line of text.split('\n')) {
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (bullet) list.push(bullet[1])
    else {
      flush()
      if (line.trim() !== '') parts.push(`<div>${inlineMarkdown(line)}</div>`)
    }
  }
  flush()
  return parts.join('') || '&nbsp;'
}

// A rich cell: displays formatted markdown (bullets, bold, italic, code) and, on
// focus, swaps to the raw markdown source for editing. Uncontrolled — parent
// re-renders never disturb the caret while editing.
export function RichCell({
  initialText,
  cellKey,
  onText,
  onKeyDown,
}: {
  initialText: string
  cellKey: string
  onText: (text: string) => void
  onKeyDown: (event: React.KeyboardEvent) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const textRef = useRef(initialText)
  useEffect(() => {
    textRef.current = initialText
    if (ref.current) ref.current.innerHTML = renderCellMarkdown(initialText)
    // mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div
      className="adv-cell"
      data-cell={cellKey}
      contentEditable
      suppressContentEditableWarning
      ref={ref}
      onFocus={() => {
        if (ref.current) ref.current.textContent = textRef.current // show source to edit
      }}
      onBlur={() => {
        if (!ref.current) return
        textRef.current = ref.current.innerText
        onText(textRef.current)
        ref.current.innerHTML = renderCellMarkdown(textRef.current) // re-render formatted
      }}
      onKeyDown={onKeyDown}
    />
  )
}

// An uncontrolled cell: seeds its text once on mount and never re-reads it, so
// parent re-renders (from typing elsewhere) can't disturb the caret.
export function Cell({
  initialText,
  cellKey,
  onText,
  onKeyDown,
}: {
  initialText: string
  cellKey: string
  onText: (text: string) => void
  onKeyDown: (event: React.KeyboardEvent) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (ref.current) ref.current.innerText = initialText
    // mount only — never re-seed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div
      className="adv-cell"
      data-cell={cellKey}
      contentEditable
      suppressContentEditableWarning
      ref={ref}
      onInput={(e) => onText(e.currentTarget.innerText)}
      onKeyDown={onKeyDown}
    />
  )
}

function AdvancedTable({ view, pos, source }: ReactBlockRenderArgs) {
  const [model, setModel] = useState<TableModel>(() => parseModel(source))
  const rootRef = useRef<HTMLDivElement | null>(null)
  const writeTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(writeTimer.current), [])

  const writeNow = useCallback(
    (next: TableModel) => {
      window.clearTimeout(writeTimer.current)
      replaceBlock(view, pos, serialize(next))
    },
    [view, pos],
  )
  const scheduleWrite = useCallback(
    (next: TableModel) => {
      window.clearTimeout(writeTimer.current)
      writeTimer.current = window.setTimeout(() => replaceBlock(view, pos, serialize(next)), 350)
    },
    [view, pos],
  )

  const colCount = model.cols.length
  const focusCell = (r: number, c: number) =>
    rootRef.current?.querySelector<HTMLElement>(`[data-cell="${r}-${c}"]`)?.focus()

  const onCellKeyDown = (event: React.KeyboardEvent, r: number, c: number) => {
    if (event.key !== 'Tab') return
    event.preventDefault()
    let nr = r
    let nc = c + (event.shiftKey ? -1 : 1)
    if (nc >= colCount) {
      nc = 0
      nr = r + 1
    } else if (nc < 0) {
      nc = colCount - 1
      nr = r - 1
    }
    if (nr < 0 || nr >= model.rows.length) return
    focusCell(nr, nc)
  }

  const onCellText = (text: string, r: number, c: number) => {
    const next = cloneModel(model)
    next.rows[r].cells[c].text = text
    setModel(next)
    scheduleWrite(next)
  }

  const startColResize = (event: React.MouseEvent, c: number) => {
    event.preventDefault()
    const startX = event.clientX
    const startW = model.cols[c].w ?? 160
    const colEl = rootRef.current?.querySelectorAll('col')[c + 1] as HTMLTableColElement | undefined
    let width = startW
    const onMove = (e: MouseEvent) => {
      width = Math.max(48, startW + (e.clientX - startX))
      if (colEl) colEl.style.width = `${width}px`
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const next = cloneModel(model)
      next.cols[c].w = width
      setModel(next)
      writeNow(next)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startRowResize = (event: React.MouseEvent, r: number) => {
    event.preventDefault()
    const startY = event.clientY
    const rowEl = rootRef.current?.querySelectorAll('tbody tr')[r] as HTMLTableRowElement | undefined
    const startH = rowEl?.getBoundingClientRect().height ?? 32
    let height = startH
    const onMove = (e: MouseEvent) => {
      height = Math.max(28, startH + (e.clientY - startY))
      if (rowEl) rowEl.style.height = `${height}px`
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const next = cloneModel(model)
      next.rows[r].h = height
      setModel(next)
      writeNow(next)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const mutate = (fn: (next: TableModel) => void) => {
    const next = cloneModel(model)
    fn(next)
    setModel(next)
    writeNow(next)
  }
  const addColumn = () => mutate((m) => { m.cols.push({ w: 160 }); m.rows.forEach((row) => row.cells.push({ text: '' })) })
  const addRow = () => mutate((m) => m.rows.push({ cells: m.cols.map(() => ({ text: '' })) }))
  const deleteColumn = (c: number) => { if (colCount > 1) mutate((m) => { m.cols.splice(c, 1); m.rows.forEach((row) => row.cells.splice(c, 1)) }) }
  const deleteRow = (r: number) => { if (model.rows.length > 1) mutate((m) => m.rows.splice(r, 1)) }

  return (
    <div className="adv-table-wrap" ref={rootRef}>
      <table className="adv-table">
        <colgroup>
          <col style={{ width: 20 }} />
          {model.cols.map((col, c) => (
            <col key={c} style={{ width: col.w ?? 160 }} />
          ))}
        </colgroup>
        <tbody>
          {model.rows.map((row, r) => {
            const CellTag = row.header ? 'th' : 'td'
            return (
              <tr key={r} style={row.h ? { height: row.h } : undefined}>
                <td className="adv-gutter">
                  <button className="adv-del adv-del-row" title="Delete row" onMouseDown={(e) => { e.preventDefault(); deleteRow(r) }}>
                    ×
                  </button>
                </td>
                {row.cells.map((cell, c) => (
                  <CellTag key={c}>
                    <RichCell
                      initialText={cell.text}
                      cellKey={`${r}-${c}`}
                      onText={(text) => onCellText(text, r, c)}
                      onKeyDown={(e) => onCellKeyDown(e, r, c)}
                    />
                    {r === 0 && (
                      <>
                        <span className="adv-col-resize" onMouseDown={(e) => startColResize(e, c)} />
                        <button className="adv-del adv-del-col" title="Delete column" onMouseDown={(ev) => { ev.preventDefault(); deleteColumn(c) }}>
                          ×
                        </button>
                      </>
                    )}
                    <span className="adv-row-resize" onMouseDown={(e) => startRowResize(e, r)} />
                  </CellTag>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="adv-controls">
        <button onMouseDown={(e) => { e.preventDefault(); addRow() }}>+ Row</button>
        <button onMouseDown={(e) => { e.preventDefault(); addColumn() }}>+ Column</button>
      </div>
    </div>
  )
}

let registered = false
export function registerAdvancedTableBlock() {
  if (registered) return
  registered = true
  registerBlock('table', (args) => <AdvancedTable {...args} />)
}

/** Build a ```table block from a plain GFM pipe-table source (for the
 *  "upgrade to advanced table" command in phase 5). */
export function gfmToAdvancedTable(gfmSource: string): string {
  const lines = gfmSource.split('\n').filter((line) => line.trim().startsWith('|'))
  const splitCells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
  const rows: Row[] = []
  lines.forEach((line, index) => {
    if (index === 1 && /^\s*\|?[\s:|-]+\|?\s*$/.test(line)) return
    rows.push({ header: index === 0, cells: splitCells(line).map((text) => ({ text })) })
  })
  const colCount = rows.reduce((max, row) => Math.max(max, row.cells.length), 0)
  const model: TableModel = { cols: Array.from({ length: colCount }, () => ({ w: 160 })), rows }
  return serialize(model)
}

// Kept for potential direct use by callers/tests.
export type { TableModel }
export { serialize as serializeAdvancedTable, parseModel as parseAdvancedTable }
