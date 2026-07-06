/* eslint-disable react-refresh/only-export-components --
   Block-renderer module: defines the table component and exports its registration
   + pure model helpers. It is mounted imperatively by a CM6 widget, not via a
   hot-reloadable React tree, so the fast-refresh constraint doesn't apply. */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlignCenter, AlignLeft, AlignRight, ArrowLeftToLine, ArrowRightToLine,
  ArrowUpToLine, ArrowDownToLine, Settings2, Trash2, X,
} from 'lucide-react'
import { registerBlock } from './registry'
import { replaceBlock, type ReactBlockRenderArgs } from './reactWidget'
import { setActiveInlineTarget, wrapContentEditableSelection } from '../activeInlineTarget'
import './advancedTable.css'

// The advanced table: a custom ```table fenced block holding JSON that markdown
// can't express — rich multi-line cells plus persisted table/column sizing —
// edited in a mini table editor (tab between cells, drag to resize, a table
// toolbar, and a properties panel). Round-trips as text.

type Align = 'left' | 'center' | 'right'
type WUnit = 'px' | '%'
type Col = { w?: number | null; unit?: WUnit; align?: Align }
type Cell = { text: string }
type Row = { h?: number | null; header?: boolean; cells: Cell[] }
type TableModel = { width?: number | null; widthUnit?: WUnit; cols: Col[]; rows: Row[] }

/** A CSS length from a value + unit (defaults to px). */
function cssLen(value: number | null | undefined, unit: WUnit | undefined): string | undefined {
  return value ? `${value}${unit ?? 'px'}` : undefined
}

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
    width: model.width,
    widthUnit: model.widthUnit,
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
  onFocus,
}: {
  initialText: string
  cellKey: string
  onText: (text: string) => void
  onKeyDown: (event: React.KeyboardEvent) => void
  onFocus?: () => void
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
        onFocus?.()
        // Let the toolbar's inline-format buttons wrap this cell's selection.
        setActiveInlineTarget({
          wrap: (before, after) =>
            wrapContentEditableSelection(ref.current, before, after, (src) => { textRef.current = src; onText(src) }),
        })
      }}
      onBlur={() => {
        setActiveInlineTarget(null)
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
  const [active, setActive] = useState(false)
  const [showProps, setShowProps] = useState(false)
  // The cell the caret is in — drives which row/column the toolbar acts on.
  const [current, setCurrent] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const rootRef = useRef<HTMLDivElement | null>(null)
  const writeTimer = useRef<number | undefined>(undefined)
  const blurTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => { window.clearTimeout(writeTimer.current); window.clearTimeout(blurTimer.current) }, [])

  const writeNow = useCallback((next: TableModel) => { window.clearTimeout(writeTimer.current); replaceBlock(view, pos, serialize(next)) }, [view, pos])
  const scheduleWrite = useCallback((next: TableModel) => {
    window.clearTimeout(writeTimer.current)
    writeTimer.current = window.setTimeout(() => replaceBlock(view, pos, serialize(next)), 350)
  }, [view, pos])

  const colCount = model.cols.length
  const focusCell = (r: number, c: number) => rootRef.current?.querySelector<HTMLElement>(`[data-cell="${r}-${c}"]`)?.focus()

  // Show the toolbar/panel while focus is anywhere inside the table (a cell, a
  // toolbar button, or a properties input).
  const onCellFocus = (r: number, c: number) => { window.clearTimeout(blurTimer.current); setCurrent({ r, c }); setActive(true) }
  const onTableBlur = (event: React.FocusEvent) => {
    const next = event.relatedTarget as Node | null
    if (next && rootRef.current?.contains(next)) return // focus stayed within the table
    blurTimer.current = window.setTimeout(() => { setActive(false); setShowProps(false) }, 150)
  }
  const keepFocus = (e: React.MouseEvent) => e.preventDefault() // toolbar mousedown shouldn't blur the cell

  const onCellKeyDown = (event: React.KeyboardEvent, r: number, c: number) => {
    if (event.key !== 'Tab') return
    event.preventDefault()
    let nr = r
    let nc = c + (event.shiftKey ? -1 : 1)
    if (nc >= colCount) { nc = 0; nr = r + 1 } else if (nc < 0) { nc = colCount - 1; nr = r - 1 }
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
    const colEl = rootRef.current?.querySelectorAll('col')[c] as HTMLTableColElement | undefined
    let width = startW
    const onMove = (e: MouseEvent) => { width = Math.max(48, startW + (e.clientX - startX)); if (colEl) colEl.style.width = `${width}px` }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
      const next = cloneModel(model); next.cols[c].w = width; next.cols[c].unit = 'px'; setModel(next); writeNow(next)
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  const startRowResize = (event: React.MouseEvent, r: number) => {
    event.preventDefault()
    const startY = event.clientY
    const rowEl = rootRef.current?.querySelectorAll('tbody tr')[r] as HTMLTableRowElement | undefined
    const startH = rowEl?.getBoundingClientRect().height ?? 32
    let height = startH
    const onMove = (e: MouseEvent) => { height = Math.max(28, startH + (e.clientY - startY)); if (rowEl) rowEl.style.height = `${height}px` }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
      const next = cloneModel(model); next.rows[r].h = height; setModel(next); writeNow(next)
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  const mutate = (fn: (next: TableModel) => void) => { const next = cloneModel(model); fn(next); setModel(next); writeNow(next) }
  const addRowAt = (index: number) => mutate((m) => m.rows.splice(index, 0, { cells: m.cols.map(() => ({ text: '' })) }))
  const addColAt = (index: number) => mutate((m) => { m.cols.splice(index, 0, {}); m.rows.forEach((row) => row.cells.splice(index, 0, { text: '' })) })
  const deleteRow = (r: number) => { if (model.rows.length > 1) mutate((m) => m.rows.splice(r, 1)) }
  const deleteColumn = (c: number) => { if (colCount > 1) mutate((m) => { m.cols.splice(c, 1); m.rows.forEach((row) => row.cells.splice(c, 1)) }) }
  const setColAlign = (c: number, align: Align) => mutate((m) => { m.cols[c].align = align })
  const setColWidth = (c: number, w: number | null, unit: WUnit) => mutate((m) => { m.cols[c].w = w; m.cols[c].unit = unit })
  const deleteTable = () => replaceBlock(view, pos, '')
  const setTableWidth = (w: number | null, unit: WUnit) => mutate((m) => {
    m.width = w
    m.widthUnit = unit
    // For a px table width, rescale px columns proportionally so the table
    // becomes exactly `w`. For a % width, columns keep their own units.
    if (w && unit === 'px' && m.cols.every((col) => (col.unit ?? 'px') === 'px')) {
      const widths = m.cols.map((col) => col.w ?? 160)
      const total = widths.reduce((a, b) => a + b, 0) || 1
      m.cols.forEach((col, i) => { col.w = Math.max(30, Math.round((widths[i] / total) * w)); col.unit = 'px' })
    }
  })

  const tbTitle = (t: string) => t
  return (
    <div className="adv-table-wrap" ref={rootRef} onBlur={onTableBlur} contentEditable={false}>
      {active && (
        <div className="adv-toolbar" onMouseDown={keepFocus}>
          <button title={tbTitle('Insert row above')} onClick={() => addRowAt(current.r)}><ArrowUpToLine size={15} /></button>
          <button title={tbTitle('Insert row below')} onClick={() => addRowAt(current.r + 1)}><ArrowDownToLine size={15} /></button>
          <button title={tbTitle('Delete row')} onClick={() => deleteRow(current.r)}><Trash2 size={15} /></button>
          <span className="adv-toolbar-sep" />
          <button title={tbTitle('Insert column left')} onClick={() => addColAt(current.c)}><ArrowLeftToLine size={15} /></button>
          <button title={tbTitle('Insert column right')} onClick={() => addColAt(current.c + 1)}><ArrowRightToLine size={15} /></button>
          <button title={tbTitle('Delete column')} onClick={() => deleteColumn(current.c)}><Trash2 size={15} className="adv-icon-col" /></button>
          <span className="adv-toolbar-sep" />
          <button title={tbTitle('Align left')} className={model.cols[current.c]?.align === 'left' || !model.cols[current.c]?.align ? 'is-on' : ''} onClick={() => setColAlign(current.c, 'left')}><AlignLeft size={15} /></button>
          <button title={tbTitle('Align center')} className={model.cols[current.c]?.align === 'center' ? 'is-on' : ''} onClick={() => setColAlign(current.c, 'center')}><AlignCenter size={15} /></button>
          <button title={tbTitle('Align right')} className={model.cols[current.c]?.align === 'right' ? 'is-on' : ''} onClick={() => setColAlign(current.c, 'right')}><AlignRight size={15} /></button>
          <span className="adv-toolbar-sep" />
          <button title={tbTitle('Table properties')} className={showProps ? 'is-on' : ''} onClick={() => setShowProps((v) => !v)}><Settings2 size={15} /></button>
          <span className="adv-toolbar-sep" />
          <button title={tbTitle('Delete table')} onClick={deleteTable}><Trash2 size={15} className="adv-icon-del" /></button>
        </div>
      )}

      {active && showProps && (
        <div className="adv-props">
          <div className="adv-props-head">
            <span>Table properties</span>
            <button title="Close" onMouseDown={keepFocus} onClick={() => setShowProps(false)}><X size={14} /></button>
          </div>
          <label className="adv-props-row">
            <span>Table width</span>
            <input type="number" min={0} placeholder="auto" value={model.width ?? ''} onChange={(e) => setTableWidth(e.target.value ? Number(e.target.value) : null, model.widthUnit ?? 'px')} />
            <select className="adv-props-unit" value={model.widthUnit ?? 'px'} onChange={(e) => setTableWidth(model.width ?? null, e.target.value as WUnit)}>
              <option value="px">px</option>
              <option value="%">%</option>
            </select>
          </label>
          <div className="adv-props-cols">
            {model.cols.map((col, c) => (
              <label className="adv-props-row" key={c}>
                <span>Col {c + 1} width</span>
                <input type="number" min={0} placeholder="auto" value={col.w ?? ''} onChange={(e) => setColWidth(c, e.target.value ? Number(e.target.value) : null, col.unit ?? 'px')} />
                <select className="adv-props-unit" value={col.unit ?? 'px'} onChange={(e) => setColWidth(c, col.w ?? null, e.target.value as WUnit)}>
                  <option value="px">px</option>
                  <option value="%">%</option>
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      <table className="adv-table" style={model.width ? { width: cssLen(model.width, model.widthUnit), tableLayout: 'fixed' } : undefined}>
        <colgroup>
          {model.cols.map((col, c) => (
            <col key={c} style={col.w ? { width: cssLen(col.w, col.unit) } : undefined} />
          ))}
        </colgroup>
        <tbody>
          {model.rows.map((row, r) => {
            const CellTag = row.header ? 'th' : 'td'
            return (
              <tr key={r} style={row.h ? { height: row.h } : undefined}>
                {row.cells.map((cell, c) => (
                  <CellTag key={c} style={model.cols[c]?.align ? { textAlign: model.cols[c].align } : undefined}>
                    <RichCell
                      initialText={cell.text}
                      cellKey={`${r}-${c}`}
                      onText={(text) => onCellText(text, r, c)}
                      onKeyDown={(e) => onCellKeyDown(e, r, c)}
                      onFocus={() => onCellFocus(r, c)}
                    />
                    {r === 0 && <span className="adv-col-resize" onMouseDown={(e) => startColResize(e, c)} />}
                    <span className="adv-row-resize" onMouseDown={(e) => startRowResize(e, r)} />
                  </CellTag>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
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
