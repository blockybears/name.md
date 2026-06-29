import { useMemo, useState, type ClipboardEvent } from 'react'
import {
  csvToGantt,
  csvToSeries,
  daysToDurationStr,
  dayToDateTime,
  ganttFromRows,
  gridToTsv,
  parseDelimited,
  parseHtmlTable,
  seriesFromRows,
  type DiagramData,
  type GanttData,
  type GanttRow,
  type SeriesData,
  type SeriesRow,
} from '../../core'
import { Icon } from './Icon'

type DataKind = 'gantt' | 'series'

export interface DataEditorProps {
  mode: 'create' | 'edit'
  /** When editing an existing diagram, its current data. */
  initial?: GanttData | SeriesData
  onApply: (data: DiagramData) => void
  onClose: () => void
}

const emptyGanttRow = (): GanttRow => ({ name: '', start: '', duration: '', deps: '', tags: '', progress: '' })
const emptySeriesRow = (): SeriesRow => ({ label: '', value: '' })

// Styling tags the renderer understands — offered as toggles so they can't be
// mistyped. (Milestone is set via a 0 duration, not here.)
const KNOWN_TAGS = [
  { id: 'crit', label: 'Critical' },
  { id: 'done', label: 'Done' },
] as const

/** Tags as toggle chips; any unrecognised tags on the row are preserved. */
function TagCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const set = new Set(value.split(',').map((s) => s.trim()).filter(Boolean))
  const toggle = (id: string) => {
    const next = new Set(set)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    onChange([...next].join(', '))
  }
  return (
    <div className="sketch-tagcell">
      {KNOWN_TAGS.map((t) => (
        <button key={t.id} type="button" className="sketch-tagchip" aria-pressed={set.has(t.id)} onClick={() => toggle(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

type DepTypeId = 'FS' | 'SS' | 'FF' | 'SF'
const DEP_TYPES: Array<{ id: DepTypeId; label: string }> = [
  { id: 'FS', label: 'FS · finish → start' },
  { id: 'SS', label: 'SS · start → start' },
  { id: 'FF', label: 'FF · finish → finish' },
  { id: 'SF', label: 'SF · start → finish' },
]
type DepSpec = { task: string; type: DepTypeId; lag: string }

function parseDeps(value: string): DepSpec[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((spec) => {
      const m = spec.match(/^(.*?)(?::(FS|SS|FF|SF))?\s*([+-].*)?$/i)
      if (!m) {
        return { task: spec, type: 'FS', lag: '' }
      }
      return { task: (m[1] || '').trim(), type: (m[2]?.toUpperCase() as DepTypeId) || 'FS', lag: (m[3] || '').replace(/\s+/g, '') }
    })
}
function serializeDeps(specs: DepSpec[]): string {
  return specs
    .filter((s) => s.task)
    .map((s) => `${s.task}${s.type !== 'FS' ? `:${s.type}` : ''}${s.lag}`)
    .join(', ')
}

/** Dependencies as selectable rows (predecessor + link type + lag) so task
 *  names and FS/SS/FF/SF sequence types can't be mistyped. */
function DepCell({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const specs = parseDeps(value)
  const update = (next: DepSpec[]) => onChange(serializeDeps(next))
  const optionsFor = (task: string) => (task && !options.includes(task) ? [task, ...options] : options)

  return (
    <div className="sketch-depcell">
      {specs.map((spec, i) => (
        <div className="sketch-dep-row" key={i}>
          <select className="sketch-dep-task" value={spec.task} onChange={(e) => update(specs.map((x, j) => (j === i ? { ...x, task: e.target.value } : x)))}>
            {optionsFor(spec.task).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <select className="sketch-dep-type" value={spec.type} title={DEP_TYPES.find((t) => t.id === spec.type)?.label} onChange={(e) => update(specs.map((x, j) => (j === i ? { ...x, type: e.target.value as DepTypeId } : x)))}>
            {DEP_TYPES.map((t) => (
              <option key={t.id} value={t.id} title={t.label}>
                {t.id}
              </option>
            ))}
          </select>
          <input className="sketch-dep-lag" value={spec.lag} placeholder="+0d" onChange={(e) => update(specs.map((x, j) => (j === i ? { ...x, lag: e.target.value } : x)))} />
          <button type="button" className="sketch-dep-del" aria-label="Remove dependency" onClick={() => update(specs.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      {options.length > 0 && (
        <button type="button" className="sketch-dep-add" onClick={() => update([...specs, { task: options[0], type: 'FS', lag: '' }])}>
          + After…
        </button>
      )}
    </div>
  )
}

function ganttToRows(data: GanttData): GanttRow[] {
  return data.tasks.map((task, i) => {
    // A blank-start row gets an implicit "follows previous row" dependency; hide
    // that one so the After column shows only deps the user would recognise.
    const prevName = i > 0 ? data.tasks[i - 1].name : null
    const isImplicit = prevName !== null && task.deps.length === 1 && task.deps[0] === prevName
    return {
      name: task.name,
      // Only show a start for user-pinned dates; derived starts stay blank so
      // the succession chain survives the round-trip.
      start: task.pinned ? dayToDateTime(task.startDay) : '',
      duration: task.tags.includes('milestone') ? '0' : daysToDurationStr(task.endDay - task.startDay),
      deps: isImplicit ? '' : task.deps.join(', '),
      tags: task.tags.filter((t) => t !== 'milestone').join(', '),
      section: task.section,
      progress: task.progress != null ? String(task.progress) : '',
    }
  })
}
function seriesToRows(data: SeriesData): SeriesRow[] {
  return data.items.map((item) => ({ label: item.label, value: String(item.value) }))
}

/** Modal for authoring a chart from typed/pasted numeric data. */
export function DataEditor({ mode, initial, onApply, onClose }: DataEditorProps) {
  const [kind, setKind] = useState<DataKind>(initial?.kind === 'series' ? 'series' : 'gantt')
  const [title, setTitle] = useState(initial && 'title' in initial ? initial.title ?? '' : '')
  const [ganttRows, setGanttRows] = useState<GanttRow[]>(
    initial?.kind === 'gantt' ? [...ganttToRows(initial), emptyGanttRow()] : [emptyGanttRow()],
  )
  const [seriesRows, setSeriesRows] = useState<SeriesRow[]>(
    initial?.kind === 'series' ? [...seriesToRows(initial), emptySeriesRow()] : [emptySeriesRow()],
  )
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')

  const data = useMemo<DiagramData>(
    () => (kind === 'gantt' ? ganttFromRows(ganttRows, title) : seriesFromRows(seriesRows, title)),
    [kind, ganttRows, seriesRows, title],
  )
  const count = kind === 'gantt' ? (data as GanttData).tasks.length : (data as SeriesData).items.length

  // Keep a trailing blank row so there's always somewhere to type.
  const setGantt = (rows: GanttRow[]) => setGanttRows(rows.at(-1)?.name.trim() ? [...rows, emptyGanttRow()] : rows)
  const setSeries = (rows: SeriesRow[]) => setSeriesRows(rows.at(-1)?.label.trim() ? [...rows, emptySeriesRow()] : rows)

  const editGantt = (i: number, key: keyof GanttRow, value: string) => setGantt(ganttRows.map((r, j) => (j === i ? { ...r, [key]: value } : r)))
  const editSeries = (i: number, key: keyof SeriesRow, value: string) => setSeries(seriesRows.map((r, j) => (j === i ? { ...r, [key]: value } : r)))
  const removeGantt = (i: number) => setGanttRows(ganttRows.length > 1 ? ganttRows.filter((_, j) => j !== i) : [emptyGanttRow()])
  const removeSeries = (i: number) => setSeriesRows(seriesRows.length > 1 ? seriesRows.filter((_, j) => j !== i) : [emptySeriesRow()])
  const addRow = () => (kind === 'gantt' ? setGanttRows([...ganttRows, emptyGanttRow()]) : setSeriesRows([...seriesRows, emptySeriesRow()]))
  // Enter in a row adds a new row (and an explicit "+ Add row" button below).
  const onRowKeyDown = (event: { key: string; preventDefault: () => void }) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addRow()
    }
  }

  const fillFromPaste = (text: string) => {
    if (kind === 'gantt') {
      const parsed = csvToGantt(text)
      setGanttRows([...ganttToRows(parsed), emptyGanttRow()])
    } else {
      const parsed = csvToSeries(text)
      if (parsed.title && !title) setTitle(parsed.title)
      setSeriesRows([...seriesToRows(parsed), emptySeriesRow()])
    }
  }

  // Paste a spreadsheet block directly into the grid (spills into rows).
  // Prefer the clipboard's HTML-table flavour (cells with commas/newlines stay
  // intact); fall back to plain TSV/CSV text.
  const onGridPaste = (event: ClipboardEvent) => {
    const html = event.clipboardData.getData('text/html')
    const htmlGrid = html ? parseHtmlTable(html) : null
    const text = htmlGrid ? gridToTsv(htmlGrid) : event.clipboardData.getData('text/plain')
    if (!text || parseDelimited(text).length <= 1) {
      return
    }
    event.preventDefault()
    fillFromPaste(text)
  }

  return (
    <div className="sketch-import-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sketch-data-modal" onPaste={onGridPaste}>
        <div className="sketch-import-head">
          <span>{mode === 'edit' ? 'Edit chart data' : 'New chart from data'}</span>
          <button type="button" className="sketch-icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="sketch-data-controls">
          {mode === 'create' && (
            <div className="sketch-data-kind" role="tablist">
              <button type="button" role="tab" aria-selected={kind === 'gantt'} className={kind === 'gantt' ? 'is-active' : undefined} onClick={() => setKind('gantt')}>
                Tasks / timeline
              </button>
              <button type="button" role="tab" aria-selected={kind === 'series'} className={kind === 'series' ? 'is-active' : undefined} onClick={() => setKind('series')}>
                Values (pie / bar)
              </button>
            </div>
          )}
          <input className="sketch-data-title" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="sketch-data-grid-wrap">
          {kind === 'gantt' ? (
            <table className="sketch-data-grid sketch-data-grid--gantt">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Start (date / time)</th>
                  <th>Duration</th>
                  <th>After</th>
                  <th>%</th>
                  <th>Tags</th>
                  <th aria-label="remove" />
                </tr>
              </thead>
              <tbody>
                {ganttRows.map((row, i) => (
                  <tr key={i}>
                    <td><input value={row.name} placeholder="Task name" onKeyDown={onRowKeyDown} onChange={(e) => editGantt(i, 'name', e.target.value)} /></td>
                    <td><input value={row.start} placeholder="2024-05-01 09:00" onKeyDown={onRowKeyDown} onChange={(e) => editGantt(i, 'start', e.target.value)} /></td>
                    <td><input className="sketch-data-num" value={row.duration} placeholder="5d / 2h / 0" onKeyDown={onRowKeyDown} onChange={(e) => editGantt(i, 'duration', e.target.value)} /></td>
                    <td><DepCell value={row.deps} options={ganttRows.filter((_, j) => j !== i).map((r) => r.name.trim()).filter(Boolean)} onChange={(v) => editGantt(i, 'deps', v)} /></td>
                    <td><input className="sketch-data-num sketch-data-pct" value={row.progress ?? ''} placeholder="0" onKeyDown={onRowKeyDown} onChange={(e) => editGantt(i, 'progress', e.target.value)} /></td>
                    <td><TagCell value={row.tags} onChange={(v) => editGantt(i, 'tags', v)} /></td>
                    <td><button type="button" className="sketch-data-del" aria-label="Remove row" onClick={() => removeGantt(i)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="sketch-data-grid">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Value</th>
                  <th aria-label="remove" />
                </tr>
              </thead>
              <tbody>
                {seriesRows.map((row, i) => (
                  <tr key={i}>
                    <td><input value={row.label} placeholder="Category" onKeyDown={onRowKeyDown} onChange={(e) => editSeries(i, 'label', e.target.value)} /></td>
                    <td><input className="sketch-data-num" value={row.value} placeholder="0" onKeyDown={onRowKeyDown} onChange={(e) => editSeries(i, 'value', e.target.value)} /></td>
                    <td><button type="button" className="sketch-data-del" aria-label="Remove row" onClick={() => removeSeries(i)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button type="button" className="sketch-data-addrow" onClick={addRow}>
            + Add row
          </button>
          {kind === 'gantt' && (
            <p className="sketch-data-hint">
              Blank start → follows previous task. Units: <code>m h d w mo</code>. Milestone = <code>0</code> duration. % = progress.
              <em>After</em> picks a predecessor, link type (FS/SS/FF/SF) and optional lag (e.g. <code>+2d</code>).
            </p>
          )}
        </div>

        <div className="sketch-data-paste">
          <button type="button" className="sketch-data-paste-toggle" onClick={() => setPasteOpen((o) => !o)} aria-expanded={pasteOpen}>
            <Icon name="import" size={14} /> Paste from a spreadsheet (CSV / TSV)
          </button>
          {pasteOpen && (
            <div className="sketch-data-paste-body">
              <textarea
                className="sketch-import-text"
                spellCheck={false}
                placeholder={kind === 'gantt' ? 'Task\tStart\tDays\tAfter\nDesign\t2024-03-01\t5\nBuild\t\t8\tDesign' : 'Region,Sales\nNorth,1200\nSouth,950'}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <button type="button" onClick={() => { fillFromPaste(pasteText); setPasteText(''); setPasteOpen(false) }}>
                Fill table from paste
              </button>
            </div>
          )}
        </div>

        <div className="sketch-import-foot">
          <span className="sketch-data-count">{count} {kind === 'gantt' ? 'task' : 'value'}{count === 1 ? '' : 's'}</span>
          <span className="sketch-import-spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="sketch-import-go" disabled={count === 0} onClick={() => onApply(data)}>
            {mode === 'edit' ? 'Update' : 'Create chart'}
          </button>
        </div>
      </div>
    </div>
  )
}
