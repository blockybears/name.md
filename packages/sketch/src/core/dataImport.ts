import { dayToISO, isoToDay, type GanttData, type GanttTask, type SeriesData } from './diagram'

// ---------------------------------------------------------------------------
// Spreadsheet (CSV / TSV) parsing — small, dependency-free, paste-friendly.
// Excel and Google Sheets put TAB-separated text on the clipboard, so tab is
// detected first; commas are the fallback.
// ---------------------------------------------------------------------------

/** Parse delimited text into a grid of string cells. Handles quoted fields
 *  ("a,b", embedded newlines, "" escapes) and auto-detects tab vs comma. */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  // Spreadsheet clipboards (Excel / Sheets) are tab-separated, so any tab on the
  // first line means TSV; otherwise fall back to comma.
  const firstLine = clean.split('\n').find((line) => line.trim().length > 0) ?? ''
  const delimiter = firstLine.includes('\t') ? '\t' : ','

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    // A quote only opens a field at its start (Excel quotes whole cells); a
    // mid-field quote is literal.
    if (ch === '"' && field === '') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // Drop fully-empty rows.
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c.length > 0))
}

/** Parse the clipboard's HTML-table flavour (what Excel/Sheets put on the
 *  clipboard alongside plain text) into a grid. Cleaner than TSV because cells
 *  with embedded commas/newlines stay intact. Returns null if no table/DOM. */
export function parseHtmlTable(html: string): string[][] | null {
  if (typeof DOMParser === 'undefined' || !/<tr[\s>]/i.test(html)) {
    return null
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const table = doc.querySelector('table')
  if (!table) {
    return null
  }
  const rows: string[][] = []
  table.querySelectorAll('tr').forEach((tr) => {
    const cells: string[] = []
    tr.querySelectorAll('th,td').forEach((cell) => cells.push((cell.textContent ?? '').trim()))
    if (cells.some((c) => c.length > 0)) {
      rows.push(cells)
    }
  })
  return rows.length ? rows : null
}

/** Turn a parsed grid back into TSV so the existing csv* helpers can consume it. */
export function gridToTsv(rows: string[][]): string {
  return rows.map((row) => row.join('\t')).join('\n')
}

/** Parse a numeric cell tolerantly (strips currency, %, thousands separators). */
export function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[$£€\s,]/g, '').replace(/%$/, '')
  if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) {
    return null
  }
  return Number(cleaned)
}

/** Does a row look like a header (its numeric column isn't numeric)? */
function looksLikeHeader(row: string[], valueColumn: number): boolean {
  return row.length > valueColumn && parseNumber(row[valueColumn]) === null
}

function splitList(cell: string | undefined): string[] {
  return cell ? cell.split(/[;,|]/).map((s) => s.trim()).filter(Boolean) : []
}

// --- time + duration parsing (gantt) -------------------------------------
// Internally a gantt uses a continuous epoch-DAY number, so an hour is 1/24,
// a minute 1/1440. This keeps sub-day tasks and times-of-day exact.

const UNIT_DAYS: Record<string, number> = {
  min: 1 / 1440, m: 1 / 1440, minute: 1 / 1440, minutes: 1 / 1440,
  h: 1 / 24, hr: 1 / 24, hrs: 1 / 24, hour: 1 / 24, hours: 1 / 24,
  d: 1, day: 1, days: 1,
  w: 7, wk: 7, wks: 7, week: 7, weeks: 7,
  mo: 30, mon: 30, month: 30, months: 30,
  y: 365, yr: 365, year: 365, years: 365,
}

/** Parse a duration like "30m", "2h", "3d", "1.5w", "2mo" → days (float).
 *  A bare number is days. Returns null if unparseable. */
export function parseGanttDuration(value: string): number | null {
  const s = value.trim().toLowerCase()
  if (s === '') {
    return null
  }
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/)
  if (!m) {
    return null
  }
  const n = Number(m[1])
  const unit = m[2] ?? 'd'
  const factor = UNIT_DAYS[unit]
  return factor === undefined ? null : n * factor
}

/** Parse a start like "2024-05-01" or "2024-05-01 09:30" → epoch-day float. */
export function parseGanttStart(value: string): number | null {
  const s = value.trim()
  if (s === '') {
    return null
  }
  const m = s.match(/^(\d{4}-\d{1,2}-\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/)
  if (!m) {
    return null
  }
  const day = isoToDay(m[1])
  if (day === null) {
    return null
  }
  const frac = m[2] ? (Number(m[2]) * 60 + Number(m[3])) / 1440 : 0
  return day + frac
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Epoch-day float → "YYYY-MM-DD" (or with " HH:MM" when it has a time). */
export function dayToDateTime(day: number): string {
  const whole = Math.floor(day + 1e-9)
  const frac = day - whole
  const date = dayToISO(whole)
  if (frac < 1e-6) {
    return date
  }
  const mins = Math.round(frac * 1440)
  return `${date} ${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`
}

/** Days (float) → a compact human duration string for the editor round-trip. */
export function daysToDurationStr(days: number): string {
  if (days <= 0) {
    return '0'
  }
  if (days < 1 / 24) {
    return `${Math.round(days * 1440)}m`
  }
  if (days < 1) {
    return `${Math.round(days * 24 * 10) / 10}h`
  }
  if (days >= 7 && Number.isInteger(days / 7)) {
    return `${days / 7}w`
  }
  return `${Math.round(days * 10) / 10}d`
}

// --- shared row → data (used by both CSV import and the data-table editor) ---

export interface SeriesRow {
  label: string
  value: string
}
export interface GanttRow {
  name: string
  start: string
  duration: string
  deps: string
  tags: string
  section?: string
  id?: string
}

export function seriesFromRows(rows: SeriesRow[], title?: string): SeriesData {
  const items = rows
    .map((row) => ({ label: row.label.trim(), value: parseNumber(row.value) }))
    .filter((item): item is { label: string; value: number } => item.value !== null && item.label.length > 0)
  return { kind: 'series', title: title?.trim() || undefined, items }
}

/**
 * Resolve hand-entered gantt rows to day-numbered tasks. Start priority:
 *   1. an explicit date/time,
 *   2. else after the listed dependencies (succession),
 *   3. else chained after the previous row — which also records the previous
 *      task as an implicit dependency so the chain is a real succession (and
 *      shows up in the critical-path computation).
 */
export function ganttFromRows(rows: GanttRow[], title?: string): GanttData {
  const tasks: GanttTask[] = []
  const endByKey = new Map<string, number>()
  let prevName: string | null = null
  for (const row of rows) {
    const name = row.name.trim()
    if (!name) {
      continue
    }
    const explicit = parseGanttStart(row.start)
    const userDeps = splitList(row.deps)
    const tags = splitList(row.tags).map((t) => t.toLowerCase())
    const rawDuration = parseGanttDuration(row.duration)
    const milestone = tags.includes('milestone') || rawDuration === 0
    const duration = milestone ? 0 : Math.max(0.25, rawDuration ?? 1)

    let deps = userDeps
    let startDay: number
    if (explicit !== null) {
      startDay = explicit
    } else if (userDeps.length) {
      startDay = Math.max(0, ...userDeps.map((d) => endByKey.get(d) ?? 0))
    } else if (prevName !== null) {
      startDay = endByKey.get(prevName) ?? 0
      deps = [prevName] // implicit succession so the chain is a real dependency
    } else {
      startDay = 0
    }
    const endDay = startDay + duration
    const task: GanttTask = { name, startDay, endDay, deps, section: row.section?.trim() || undefined, tags: milestone && !tags.includes('milestone') ? [...tags, 'milestone'] : tags }
    tasks.push(task)
    endByKey.set(name, endDay)
    if (row.id?.trim()) {
      endByKey.set(row.id.trim(), endDay)
    }
    prevName = name
  }
  return { kind: 'gantt', title: title?.trim() || undefined, tasks }
}

/** CSV/TSV → series data. Columns: [label, value]. Optional header row. */
export function csvToSeries(text: string): SeriesData {
  const rows = parseDelimited(text)
  if (rows.length === 0) {
    return { kind: 'series', items: [] }
  }
  let title: string | undefined
  let body = rows
  if (looksLikeHeader(rows[0], 1)) {
    title = rows[0][1] || rows[0][0] || undefined
    body = rows.slice(1)
  }
  return seriesFromRows(body.map((row) => ({ label: row[0] ?? '', value: row[1] ?? '' })), title)
}

/** CSV/TSV → gantt data. Columns: [task, start(YYYY-MM-DD), duration(days),
 *  deps, tags]. A blank start chains the task after the previous row's end. */
export function csvToGantt(text: string): GanttData {
  const rows = parseDelimited(text)
  if (rows.length === 0) {
    return { kind: 'gantt', tasks: [] }
  }
  let body = rows
  // Header if the first row's "duration" cell (col 2) isn't a duration and col 1
  // isn't a date/time.
  if (rows[0].length >= 2 && parseGanttDuration(rows[0][2] ?? '') === null && parseGanttStart(rows[0][1] ?? '') === null) {
    body = rows.slice(1)
  }
  return ganttFromRows(body.map((row) => ({ name: row[0] ?? '', start: row[1] ?? '', duration: row[2] ?? '', deps: row[3] ?? '', tags: row[4] ?? '' })))
}
