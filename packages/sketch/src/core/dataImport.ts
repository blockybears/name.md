import { isoToDay, type GanttData, type GanttTask, type SeriesData } from './diagram'

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
}

export function seriesFromRows(rows: SeriesRow[], title?: string): SeriesData {
  const items = rows
    .map((row) => ({ label: row.label.trim(), value: parseNumber(row.value) }))
    .filter((item): item is { label: string; value: number } => item.value !== null && item.label.length > 0)
  return { kind: 'series', title: title?.trim() || undefined, items }
}

/** Resolve hand-entered gantt rows to day-numbered tasks. A blank start chains
 *  the task after the previous row's end (a bare list becomes a waterfall). */
export function ganttFromRows(rows: GanttRow[], title?: string): GanttData {
  const tasks: GanttTask[] = []
  let cursor = 0
  for (const row of rows) {
    const name = row.name.trim()
    if (!name) {
      continue
    }
    const start = isoToDay(row.start)
    const duration = parseNumber(row.duration) ?? 1
    const tags = splitList(row.tags).map((t) => t.toLowerCase())
    const startDay = start ?? cursor
    const endDay = startDay + (tags.includes('milestone') ? 0 : Math.max(0.5, duration))
    cursor = endDay
    tasks.push({ name, startDay, endDay, deps: splitList(row.deps), section: row.section?.trim() || undefined, tags })
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
  // Header if the first row's "duration" cell (col 2) isn't numeric and col 1
  // isn't a date.
  if (rows[0].length >= 2 && parseNumber(rows[0][2] ?? '') === null && isoToDay(rows[0][1] ?? '') === null) {
    body = rows.slice(1)
  }
  return ganttFromRows(body.map((row) => ({ name: row[0] ?? '', start: row[1] ?? '', duration: row[2] ?? '', deps: row[3] ?? '', tags: row[4] ?? '' })))
}
