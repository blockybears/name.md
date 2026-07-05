/* eslint-disable react-refresh/only-export-components --
   Block-renderer module (mounted imperatively by a CM6 widget), not a
   hot-reloadable React tree. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { replaceBlock, type ReactBlockRenderArgs, type ReactBlockRenderer } from './reactWidget'
import { Cell } from './advancedTable'
import './advancedTable.css'

// Plain GFM pipe tables rendered as an always-WYSIWYG, editable grid (no raw
// pipe source is ever shown). Edits write back to `| a | b |` markdown so the
// table stays portable. Column widths / row heights need the advanced table.

type GfmModel = { header: string[]; rows: string[][] }

function parseGfm(source: string): GfmModel {
  const lines = source.split('\n').filter((line) => line.trim().startsWith('|'))
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
  const header = lines[0] ? cells(lines[0]) : ['Column A', 'Column B']
  const body = lines.slice(1).filter((line) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(line))
  const colCount = Math.max(header.length, ...body.map((line) => cells(line).length), 1)
  const pad = (arr: string[]) => {
    const next = [...arr]
    while (next.length < colCount) next.push('')
    return next.slice(0, colCount)
  }
  return { header: pad(header), rows: body.map((line) => pad(cells(line))) }
}

function serializeGfm(model: GfmModel): string {
  const escape = (text: string) => text.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim()
  const row = (cells: string[]) => `| ${cells.map((c) => escape(c) || ' ').join(' | ')} |`
  const delimiter = `| ${model.header.map(() => '---').join(' | ')} |`
  return [row(model.header), delimiter, ...model.rows.map(row)].join('\n')
}

function cloneGfm(model: GfmModel): GfmModel {
  return { header: [...model.header], rows: model.rows.map((r) => [...r]) }
}

function GfmTable({ view, pos, source }: ReactBlockRenderArgs) {
  const [model, setModel] = useState<GfmModel>(() => parseGfm(source))
  const rootRef = useRef<HTMLDivElement | null>(null)
  const writeTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(writeTimer.current), [])

  const write = useCallback(
    (next: GfmModel, immediate: boolean) => {
      window.clearTimeout(writeTimer.current)
      const run = () => replaceBlock(view, pos, serializeGfm(next))
      if (immediate) run()
      else writeTimer.current = window.setTimeout(run, 350)
    },
    [view, pos],
  )

  const colCount = model.header.length
  const totalRows = model.rows.length + 1 // + header
  const focusCell = (r: number, c: number) =>
    rootRef.current?.querySelector<HTMLElement>(`[data-cell="${r}-${c}"]`)?.focus()

  const onKeyDown = (event: React.KeyboardEvent, r: number, c: number) => {
    if (event.key !== 'Tab') return
    event.preventDefault()
    let nr = r
    let nc = c + (event.shiftKey ? -1 : 1)
    if (nc >= colCount) { nc = 0; nr = r + 1 } else if (nc < 0) { nc = colCount - 1; nr = r - 1 }
    if (nr < 0 || nr >= totalRows) return
    focusCell(nr, nc)
  }

  const onText = (text: string, r: number, c: number) => {
    const next = cloneGfm(model)
    if (r === 0) next.header[c] = text
    else next.rows[r - 1][c] = text
    setModel(next)
    write(next, false)
  }

  const mutate = (fn: (m: GfmModel) => void) => {
    const next = cloneGfm(model)
    fn(next)
    setModel(next)
    write(next, true)
  }
  const addRow = () => mutate((m) => m.rows.push(m.header.map(() => '')))
  const addColumn = () => mutate((m) => { m.header.push(''); m.rows.forEach((row) => row.push('')) })
  const deleteRow = (bodyIndex: number) => { if (model.rows.length > 1) mutate((m) => m.rows.splice(bodyIndex, 1)) }
  const deleteColumn = (c: number) => { if (colCount > 1) mutate((m) => { m.header.splice(c, 1); m.rows.forEach((row) => row.splice(c, 1)) }) }

  const renderRow = (cells: string[], r: number, isHeader: boolean) => {
    const CellTag = isHeader ? 'th' : 'td'
    return (
      <tr key={r}>
        <td className="adv-gutter">
          {!isHeader && (
            <button className="adv-del adv-del-row" title="Delete row" onMouseDown={(e) => { e.preventDefault(); deleteRow(r - 1) }}>×</button>
          )}
        </td>
        {cells.map((text, c) => (
          <CellTag key={c}>
            <Cell initialText={text} cellKey={`${r}-${c}`} onText={(value) => onText(value, r, c)} onKeyDown={(e) => onKeyDown(e, r, c)} />
            {isHeader && (
              <button className="adv-del adv-del-col" title="Delete column" onMouseDown={(e) => { e.preventDefault(); deleteColumn(c) }}>×</button>
            )}
          </CellTag>
        ))}
      </tr>
    )
  }

  return (
    <div className="adv-table-wrap" ref={rootRef}>
      <table className="adv-table">
        <tbody>
          {renderRow(model.header, 0, true)}
          {model.rows.map((cells, i) => renderRow(cells, i + 1, false))}
        </tbody>
      </table>
      <div className="adv-controls">
        <button onMouseDown={(e) => { e.preventDefault(); addRow() }}>+ Row</button>
        <button onMouseDown={(e) => { e.preventDefault(); addColumn() }}>+ Column</button>
      </div>
    </div>
  )
}

export const gfmTableRenderer: ReactBlockRenderer = (args) => <GfmTable {...args} />
