import { computeSchedule } from './cpm'
import { graphToElements, layeredLayout, type GraphEdge, type GraphNode, type LayoutDirection } from './graphLayout'
import { createElement, generateId, generateSeed } from './scene'
import { literal, token, type DrawStyle, type Point, type Scene, type SketchElement } from './types'

// ---------------------------------------------------------------------------
// Retained data model — what a diagram *is*, independent of how it's drawn.
// ---------------------------------------------------------------------------

export interface GraphData {
  kind: 'graph'
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface SeriesItem {
  label: string
  value: number
}
export interface SeriesData {
  kind: 'series'
  title?: string
  items: SeriesItem[]
}

export interface GanttTask {
  id?: string
  name: string
  startDay: number
  endDay: number
  deps: string[]
  section?: string
  tags: string[]
  /** True when the start was an explicit user date (vs. derived from deps/order).
   *  Derived starts stay blank on round-trip so succession links survive. */
  pinned?: boolean
  /** Percent complete, 0–100. */
  progress?: number
}
export interface GanttData {
  kind: 'gantt'
  title?: string
  tasks: GanttTask[]
}

export type DiagramData = GraphData | SeriesData | GanttData
export type DataKind = DiagramData['kind']

/** A structured diagram placed on the canvas: data + the view it's shown as. */
export interface DiagramInstance {
  id: string
  seed: number
  x: number
  y: number
  style: DrawStyle
  view: ViewId
  data: DiagramData
}

export type ViewId =
  | 'flow-td'
  | 'flow-lr'
  | 'mindmap'
  | 'orgchart'
  | 'pie'
  | 'donut'
  | 'bar'
  | 'gantt'
  | 'timeline'
  | 'network'

export interface ViewDef {
  id: ViewId
  label: string
  needs: DataKind
}

export const DIAGRAM_VIEWS: ViewDef[] = [
  { id: 'flow-td', label: 'Flowchart ↓', needs: 'graph' },
  { id: 'flow-lr', label: 'Flowchart →', needs: 'graph' },
  { id: 'mindmap', label: 'Mind map', needs: 'graph' },
  { id: 'orgchart', label: 'Org chart', needs: 'graph' },
  { id: 'pie', label: 'Pie chart', needs: 'series' },
  { id: 'donut', label: 'Donut', needs: 'series' },
  { id: 'bar', label: 'Bar chart', needs: 'series' },
  { id: 'gantt', label: 'Gantt', needs: 'gantt' },
  { id: 'timeline', label: 'Timeline', needs: 'gantt' },
  { id: 'network', label: 'Network (critical path)', needs: 'gantt' },
]

/** Can `from` data satisfy a view that needs `to`? (the honest compatibility.) */
function canConvert(from: DataKind, to: DataKind): boolean {
  if (from === to) {
    return true
  }
  // Gantt is the richest source: it has both dependency structure and values.
  return from === 'gantt' && (to === 'graph' || to === 'series')
}

/** The views a given diagram's data can be shown as. */
export function availableViews(data: DiagramData): ViewDef[] {
  return DIAGRAM_VIEWS.filter((view) => canConvert(data.kind, view.needs))
}

export function defaultViewFor(data: DiagramData): ViewId {
  if (data.kind === 'graph') return 'flow-td'
  if (data.kind === 'series') return 'pie'
  return 'gantt'
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

export function ganttToGraph(gantt: GanttData): GraphData {
  const nodeId = (task: GanttTask) => task.id ?? task.name
  const byName = new Map(gantt.tasks.map((task) => [task.name, nodeId(task)]))
  const nodes: GraphNode[] = gantt.tasks.map((task) => ({
    id: nodeId(task),
    label: task.name,
    shape: task.tags.includes('milestone') ? 'diamond' : 'rounded',
  }))
  const edges: GraphEdge[] = []
  const ordered = [...gantt.tasks].sort((a, b) => a.startDay - b.startDay)
  gantt.tasks.forEach((task) => {
    if (task.deps.length) {
      for (const dep of task.deps) {
        const from = byName.get(parseDep(dep).task)
        if (from) {
          edges.push({ from, to: nodeId(task), arrow: true })
        }
      }
    }
  })
  // Tasks with no incoming edge get chained to the previous (by start) task so
  // the flow reads start→end instead of as disconnected boxes.
  const hasIncoming = new Set(edges.map((edge) => edge.to))
  for (let i = 1; i < ordered.length; i += 1) {
    const id = nodeId(ordered[i])
    if (!hasIncoming.has(id)) {
      edges.push({ from: nodeId(ordered[i - 1]), to: id, arrow: true })
      hasIncoming.add(id)
    }
  }
  return { kind: 'graph', nodes, edges }
}

export function ganttToSeries(gantt: GanttData): SeriesData {
  return {
    kind: 'series',
    title: gantt.title,
    items: gantt.tasks.map((task) => ({ label: task.name, value: Math.max(0.5, task.endDay - task.startDay) })),
  }
}

export function dataForView(data: DiagramData, view: ViewId): DiagramData {
  const def = DIAGRAM_VIEWS.find((entry) => entry.id === view)
  if (!def || def.needs === data.kind) {
    return data
  }
  if (data.kind === 'gantt' && def.needs === 'graph') {
    return ganttToGraph(data)
  }
  if (data.kind === 'gantt' && def.needs === 'series') {
    return ganttToSeries(data)
  }
  return data
}

// ---------------------------------------------------------------------------
// Builders (data → editable elements) — shared with the Mermaid parsers.
// ---------------------------------------------------------------------------

const palette = ['#e03131', '#1971c2', '#2f9e44', '#f08c00', '#9c36b5', '#0c8599', '#e8590c', '#fab005']

function textEl(x: number, y: number, text: string, fontSize: number, style: DrawStyle, extra: Record<string, unknown> = {}): SketchElement {
  return createElement({ type: 'text', id: generateId('t'), x, y, width: Math.max(20, text.length * fontSize * 0.6), height: fontSize * 1.3, text, fontSize, ...extra }, style)
}
function lineEl(x1: number, y1: number, x2: number, y2: number, style: DrawStyle, extra: Record<string, unknown> = {}): SketchElement {
  const minX = Math.min(x1, x2)
  const minY = Math.min(y1, y2)
  return createElement({ type: 'line', id: generateId('ln'), x: minX, y: minY, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), points: [{ x: x1 - minX, y: y1 - minY }, { x: x2 - minX, y: y2 - minY }], ...extra }, style)
}

export function buildGraphView(graph: GraphData, view: ViewId, origin: Point, style: DrawStyle): SketchElement[] {
  const direction: LayoutDirection = view === 'flow-lr' || view === 'mindmap' ? 'LR' : 'TD'
  const nodes: GraphNode[] = graph.nodes.map((node, i) => {
    if (view === 'mindmap') {
      return { ...node, shape: i === 0 ? 'ellipse' : 'rounded' }
    }
    if (view === 'orgchart') {
      return { ...node, shape: 'rectangle' }
    }
    return node
  })
  const edges = view === 'mindmap' ? graph.edges.map((edge) => ({ ...edge, arrow: false })) : graph.edges
  const layout = layeredLayout(nodes, edges, direction)
  return graphToElements(nodes, edges, layout, origin, style)
}

export function buildSeriesView(series: SeriesData, view: ViewId, origin: Point, style: DrawStyle): SketchElement[] {
  if (view === 'bar') {
    return buildBar(series, origin, style)
  }
  return buildPie(series, view === 'donut', origin, style)
}

function buildPie(series: SeriesData, donut: boolean, origin: Point, style: DrawStyle): SketchElement[] {
  const total = series.items.reduce((sum, item) => sum + item.value, 0)
  if (total <= 0) {
    return []
  }
  const cx = 160
  const cy = 160
  const radius = 140
  const elements: SketchElement[] = []
  let angle = -Math.PI / 2
  if (series.title) {
    elements.push(textEl(origin.x, origin.y - 30, series.title, 18, style))
  }
  series.items.forEach((item, i) => {
    const sweep = (item.value / total) * Math.PI * 2
    const steps = Math.max(2, Math.ceil((sweep / (Math.PI / 2)) * 6))
    const abs: Point[] = [{ x: cx, y: cy }]
    for (let t = 0; t <= steps; t += 1) {
      const a = angle + sweep * (t / steps)
      abs.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius })
    }
    const minX = Math.min(...abs.map((p) => p.x))
    const minY = Math.min(...abs.map((p) => p.y))
    elements.push(
      createElement(
        { type: 'polygon', id: generateId('slice'), x: origin.x + minX, y: origin.y + minY, width: Math.max(...abs.map((p) => p.x)) - minX, height: Math.max(...abs.map((p) => p.y)) - minY, points: abs.map((p) => ({ x: p.x - minX, y: p.y - minY })), fill: literal(palette[i % palette.length]), fillStyle: 'solid', stroke: token('surface') },
        style,
      ),
    )
    const mid = angle + sweep / 2
    const lx = cx + Math.cos(mid) * radius * 1.18
    const ly = cy + Math.sin(mid) * radius * 1.18
    const label = `${item.label} (${round(item.value)})`
    elements.push(textEl(origin.x + lx - label.length * 3.5, origin.y + ly - 9, label, 13, style, { align: 'center' }))
    angle += sweep
  })
  if (donut) {
    const hole = radius * 0.55
    elements.push(createElement({ type: 'ellipse', id: generateId('hole'), x: origin.x + cx - hole, y: origin.y + cy - hole, width: hole * 2, height: hole * 2, fill: token('canvas'), fillStyle: 'solid', stroke: token('canvas') }, style))
  }
  return elements
}

function buildBar(series: SeriesData, origin: Point, style: DrawStyle): SketchElement[] {
  const max = Math.max(...series.items.map((item) => item.value), 1)
  const count = series.items.length
  const chartW = Math.max(280, count * 70)
  const chartH = 240
  const ox = origin.x + 30
  const oy = origin.y
  const elements: SketchElement[] = []
  if (series.title) {
    elements.push(textEl(ox, oy - 24, series.title, 17, style))
  }
  elements.push(lineEl(ox, oy, ox, oy + chartH, style, { stroke: token('muted'), strokeWidth: 2 }))
  elements.push(lineEl(ox, oy + chartH, ox + chartW, oy + chartH, style, { stroke: token('muted'), strokeWidth: 2 }))
  const slot = chartW / count
  const barW = slot * 0.55
  series.items.forEach((item, i) => {
    const h = (item.value / max) * chartH
    const x = ox + i * slot + (slot - barW) / 2
    elements.push(createElement({ type: 'rectangle', id: generateId('bar'), x, y: oy + chartH - h, width: barW, height: h, roundness: 3, fill: literal(palette[i % palette.length]), fillStyle: 'solid', stroke: literal(palette[i % palette.length]) }, style))
    elements.push(textEl(x + barW / 2 - item.label.length * 3, oy + chartH + 6, item.label, 11, style, { align: 'center', stroke: token('muted') }))
  })
  return elements
}

function dayToLabel(day: number): string {
  const date = new Date(day * 86400000)
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function clockLabel(day: number): string {
  const date = new Date(Math.round(day * 86400000))
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

/** Today as an epoch-day number (UTC). Null only if the clock is unavailable. */
function todayDay(): number | null {
  const now = Date.now()
  return Number.isFinite(now) ? Math.floor(now / 86400000) : null
}

/** Epoch-day number ⇄ ISO date (YYYY-MM-DD), used by the data editor. */
export function isoToDay(iso: string): number | null {
  const m = iso.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) {
    return null
  }
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000)
}

export function dayToISO(day: number): string {
  const date = new Date(Math.round(day) * 86400000)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

// --- time + duration parsing (a gantt uses continuous epoch-DAY numbers) ---

const UNIT_DAYS: Record<string, number> = {
  min: 1 / 1440, m: 1 / 1440, minute: 1 / 1440, minutes: 1 / 1440,
  h: 1 / 24, hr: 1 / 24, hrs: 1 / 24, hour: 1 / 24, hours: 1 / 24,
  d: 1, day: 1, days: 1,
  w: 7, wk: 7, wks: 7, week: 7, weeks: 7,
  mo: 30, mon: 30, month: 30, months: 30,
  y: 365, yr: 365, year: 365, years: 365,
}

/** Parse a duration like "30m", "2h", "3d", "1.5w", "2mo" → days (float). A bare
 *  number is days. Returns null if unparseable. */
export function parseGanttDuration(value: string): number | null {
  const s = value.trim().toLowerCase()
  if (s === '') {
    return null
  }
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/)
  if (!m) {
    return null
  }
  const factor = UNIT_DAYS[m[2] ?? 'd']
  return factor === undefined ? null : Number(m[1]) * factor
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
  return day + (m[2] ? (Number(m[2]) * 60 + Number(m[3])) / 1440 : 0)
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Epoch-day float → "YYYY-MM-DD" (or with " HH:MM" when it has a time). */
export function dayToDateTime(day: number): string {
  const whole = Math.floor(day + 1e-9)
  const date = dayToISO(whole)
  const frac = day - whole
  if (frac < 1e-6) {
    return date
  }
  const mins = Math.round(frac * 1440)
  return `${date} ${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`
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

// --- dependency specs: "Task", "Task+2d", "Task:SS", "Task:FF-1d" ----------

export type DepType = 'FS' | 'SS' | 'FF' | 'SF'
export interface GanttDep {
  task: string
  type: DepType
  /** Lag in days (may be negative for lead). */
  lag: number
}

/** Parse a dependency spec. Default link type is finish-to-start (FS). */
export function parseDep(spec: string): GanttDep {
  const m = spec.trim().match(/^(.*?)(?::(FS|SS|FF|SF))?\s*([+-]\s*\d+(?:\.\d+)?\s*[a-z]*)?$/i)
  if (!m || !m[1].trim()) {
    return { task: spec.trim(), type: 'FS', lag: 0 }
  }
  const type = (m[2]?.toUpperCase() as DepType) ?? 'FS'
  let lag = 0
  if (m[3]) {
    const sign = m[3].trim().startsWith('-') ? -1 : 1
    const mag = parseGanttDuration(m[3].replace(/^[+-]\s*/, '').trim())
    lag = sign * (mag ?? 0)
  }
  return { task: m[1].trim(), type, lag }
}

/** The earliest a successor may start/finish given a predecessor's schedule. */
export function depConstraintStart(dep: GanttDep, predStart: number, predEnd: number, succDuration: number): number {
  switch (dep.type) {
    case 'SS':
      return predStart + dep.lag
    case 'FF':
      return predEnd + dep.lag - succDuration
    case 'SF':
      return predStart + dep.lag - succDuration
    default:
      return predEnd + dep.lag
  }
}

const CRITICAL_COLOR = '#e03131'

export function buildGanttView(gantt: GanttData, origin: Point, style: DrawStyle): SketchElement[] {
  if (gantt.tasks.length === 0) {
    return []
  }
  const schedule = computeSchedule(gantt)
  const minDay = Math.min(...gantt.tasks.map((task) => task.startDay))
  const maxDay = Math.max(...schedule.tasks.map((s) => s.lf), ...gantt.tasks.map((task) => task.endDay))
  const totalDays = Math.max(1 / 24, maxDay - minDay)
  const rowH = 26
  const rowGap = 10
  const labelW = 150
  const chartW = Math.max(320, Math.min(900, totalDays * 26))
  const dayPx = chartW / totalDays
  const dayToX = (day: number) => origin.x + labelW + (day - minDay) * dayPx
  const elements: SketchElement[] = []
  if (gantt.title) {
    elements.push(textEl(origin.x, origin.y - 28, gantt.title, 17, style))
  }
  const chartTop = origin.y
  const chartBottom = origin.y + gantt.tasks.length * (rowH + rowGap) + 20

  // Time-aware axis: hours when the whole plan is under ~2 days, else dates.
  const withTime = totalDays <= 2
  const tickStep = withTime ? (totalDays <= 0.5 ? 1 / 24 : 4 / 24) : totalDays > 21 ? 7 : totalDays > 7 ? 2 : 1
  for (let day = Math.ceil(minDay / tickStep) * tickStep; day <= maxDay + 1e-6; day += tickStep) {
    const x = dayToX(day)
    elements.push(lineEl(x, chartTop, x, chartBottom, style, { stroke: token('muted'), strokeStyle: 'dotted' }))
    elements.push(textEl(x - 16, chartTop - 2, withTime ? clockLabel(day) : dayToLabel(day), 11, style, { stroke: token('muted') }))
  }

  const rowY = (i: number) => origin.y + 18 + i * (rowH + rowGap)

  // Dependency arrows (predecessor end → successor start), drawn behind bars.
  schedule.tasks.forEach((s, i) => {
    const startX = dayToX(s.task.startDay)
    s.task.deps.forEach((dep) => {
      const depName = parseDep(dep).task
      const pi = gantt.tasks.findIndex((t) => t.name === depName || t.id === depName)
      if (pi < 0) {
        return
      }
      const fromX = dayToX(gantt.tasks[pi].endDay)
      const fromY = rowY(pi) + rowH / 2
      const toY = rowY(i) + rowH / 2
      const critical = s.critical && schedule.tasks[pi].critical
      elements.push(
        createElement(
          {
            type: 'arrow',
            id: generateId('dep'),
            x: Math.min(fromX, startX),
            y: Math.min(fromY, toY),
            width: Math.abs(startX - fromX),
            height: Math.abs(toY - fromY),
            points: [{ x: fromX - Math.min(fromX, startX), y: fromY - Math.min(fromY, toY) }, { x: startX - Math.min(fromX, startX), y: toY - Math.min(fromY, toY) }],
            stroke: critical ? literal(CRITICAL_COLOR) : token('muted'),
            strokeWidth: 1.5,
            endArrowhead: 'triangle',
          },
          style,
        ),
      )
    })
  })

  let lastSection = ''
  schedule.tasks.forEach((s, i) => {
    const task = s.task
    const y = rowY(i)
    if (task.section && task.section !== lastSection) {
      elements.push(textEl(origin.x, y - 2, task.section, 12, style, { stroke: token('muted') }))
      lastSection = task.section
    }
    elements.push(textEl(origin.x, y + 6, task.name, 13, style))
    const x = dayToX(task.startDay)

    if (task.tags.includes('milestone')) {
      const fill = s.critical ? literal(CRITICAL_COLOR) : token('accent')
      elements.push(createElement({ type: 'diamond', id: generateId('ms'), x: x - rowH / 2, y, width: rowH, height: rowH, fill, fillStyle: 'solid', stroke: fill }, style))
      return
    }

    // Float (slack): a translucent extension from the bar end to its latest finish.
    if (s.float > 1e-3 && !task.tags.includes('done')) {
      const fx = dayToX(task.endDay)
      const fw = Math.max(4, s.float * dayPx)
      elements.push(createElement({ type: 'rectangle', id: generateId('float'), x: fx, y: y + rowH / 4, width: fw, height: rowH / 2, fill: token('muted'), fillStyle: 'hachure', stroke: token('muted'), strokeStyle: 'dashed', roundness: 3, opacity: 0.7 }, style))
    }

    const critical = s.critical || task.tags.includes('crit')
    const fill = critical ? literal(CRITICAL_COLOR) : task.tags.includes('done') ? token('muted') : token('accent')
    const w = Math.max(8, (task.endDay - task.startDay) * dayPx)
    const done = task.tags.includes('done')
    const pct = done ? 100 : task.progress ?? 0
    const partial = pct > 0 && pct < 100
    // When partly done, draw the bar lighter so the darker progress fill reads.
    elements.push(createElement({ type: 'rectangle', id: generateId('bar'), x, y, width: w, height: rowH, fill, fillStyle: 'solid', stroke: fill, roundness: 5, opacity: done ? 0.55 : partial ? 0.32 : 1 }, style))
    if (partial) {
      elements.push(createElement({ type: 'rectangle', id: generateId('prog'), x, y, width: Math.max(4, (w * pct) / 100), height: rowH, fill, fillStyle: 'solid', stroke: fill, roundness: 5 }, style))
    }
  })

  // "Today" marker — only when the current date falls within the plan.
  const today = todayDay()
  if (today !== null && today > minDay && today < maxDay) {
    const tx = dayToX(today)
    elements.push(lineEl(tx, chartTop - 4, tx, chartBottom, style, { stroke: literal('#e8590c'), strokeWidth: 1.5 }))
    elements.push(textEl(tx - 14, chartBottom + 2, 'today', 10, style, { stroke: literal('#e8590c') }))
  }
  return elements
}

export function buildTimelineView(gantt: GanttData, origin: Point, style: DrawStyle): SketchElement[] {
  if (gantt.tasks.length === 0) {
    return []
  }
  const ordered = [...gantt.tasks].sort((a, b) => a.startDay - b.startDay)
  const elements: SketchElement[] = []
  const colW = 170
  const axisY = origin.y + 40
  if (gantt.title) {
    elements.push(textEl(origin.x, origin.y - 20, gantt.title, 18, style))
  }
  elements.push(lineEl(origin.x, axisY, origin.x + ordered.length * colW, axisY, style, { stroke: token('muted'), strokeWidth: 2 }))
  ordered.forEach((task, i) => {
    const cx = origin.x + i * colW + colW / 2
    elements.push(createElement({ type: 'ellipse', id: generateId('dot'), x: cx - 6, y: axisY - 6, width: 12, height: 12, fill: token('accent'), fillStyle: 'solid', stroke: token('accent') }, style))
    const dateLabel = dayToLabel(task.startDay)
    elements.push(textEl(cx - dateLabel.length * 4, axisY - 28, dateLabel, 13, style, { align: 'center' }))
    const box = createElement({ type: 'rectangle', id: generateId('ev'), x: origin.x + i * colW + 12, y: axisY + 24, width: colW - 24, height: 44, label: task.name, labelFontSize: 12, fill: token('surface'), fillStyle: 'solid', roundness: 6 }, style)
    elements.push(box)
    elements.push(lineEl(cx, axisY, cx, box.y, style, { stroke: token('muted') }))
  })
  return elements
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** Activity-on-Node / critical-path network: each task is a box showing its
 *  CPM metrics, dependencies are arrows, and the critical path is red. */
export function buildNetworkView(gantt: GanttData, origin: Point, style: DrawStyle): SketchElement[] {
  if (gantt.tasks.length === 0) {
    return []
  }
  const schedule = computeSchedule(gantt)
  const critical = new Map(schedule.tasks.map((s) => [s.task.name, s.critical]))
  const nodeId = (task: GanttTask) => task.id ?? task.name
  const nodes: GraphNode[] = gantt.tasks.map((task) => ({ id: nodeId(task), label: task.name, shape: 'rectangle' }))
  const byKey = new Map(gantt.tasks.map((task) => [task.name, nodeId(task)]))
  if (gantt.tasks.some((t) => t.id)) {
    gantt.tasks.forEach((t) => t.id && byKey.set(t.id, nodeId(t)))
  }
  const edges: GraphEdge[] = []
  gantt.tasks.forEach((task) => {
    for (const dep of task.deps) {
      const from = byKey.get(parseDep(dep).task)
      if (from) {
        edges.push({ from, to: nodeId(task), arrow: true })
      }
    }
  })

  const NODE_W = 168
  const NODE_H = 78
  const layout = layeredLayout(nodes, edges, 'LR', { nodeWidth: NODE_W, nodeHeight: NODE_H, gapMain: 90, gapCross: 26 })
  const elements: SketchElement[] = []
  if (gantt.title) {
    elements.push(textEl(origin.x, origin.y - 26, `${gantt.title} — critical path`, 16, style))
  }

  const day0 = schedule.projectStart
  const fmt = (day: number) => `+${round(day - day0)}d`

  // Dependency edges first (behind the boxes); critical links are red.
  edges.forEach((edge) => {
    const a = layout.get(edge.from)
    const b = layout.get(edge.to)
    if (!a || !b) {
      return
    }
    const fromCrit = critical.get(gantt.tasks.find((t) => nodeId(t) === edge.from)?.name ?? '')
    const toCrit = critical.get(gantt.tasks.find((t) => nodeId(t) === edge.to)?.name ?? '')
    const isCrit = fromCrit && toCrit
    const x1 = origin.x + a.x + a.width
    const y1 = origin.y + a.y + a.height / 2
    const x2 = origin.x + b.x
    const y2 = origin.y + b.y + b.height / 2
    elements.push(
      createElement(
        {
          type: 'arrow',
          id: generateId('netdep'),
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
          points: [{ x: x1 - Math.min(x1, x2), y: y1 - Math.min(y1, y2) }, { x: x2 - Math.min(x1, x2), y: y2 - Math.min(y1, y2) }],
          stroke: isCrit ? literal(CRITICAL_COLOR) : token('muted'),
          strokeWidth: isCrit ? 2 : 1.5,
          endArrowhead: 'triangle',
        },
        style,
      ),
    )
  })

  schedule.tasks.forEach((s) => {
    const box = layout.get(nodeId(s.task))
    if (!box) {
      return
    }
    const x = origin.x + box.x
    const y = origin.y + box.y
    const accent = s.critical ? literal(CRITICAL_COLOR) : token('accent')
    elements.push(createElement({ type: 'rectangle', id: generateId('node'), x, y, width: box.width, height: box.height, stroke: accent, strokeWidth: s.critical ? 2.5 : 1.5, fill: token('surface'), fillStyle: 'solid', roundness: 6 }, style))
    // Top metrics row: earliest start → finish.
    elements.push(textEl(x + 8, y + 5, `ES ${fmt(s.es)}   EF ${fmt(s.ef)}`, 10, style, { stroke: token('muted') }))
    // Name.
    elements.push(textEl(x + 8, y + box.height / 2 - 9, s.task.name, 13, style, { stroke: accent }))
    // Bottom row: latest start → finish + float.
    elements.push(textEl(x + 8, y + box.height - 18, `LS ${fmt(s.ls)}   LF ${fmt(s.lf)}   float ${round(s.float)}d`, 10, style, { stroke: s.critical ? accent : token('muted') }))
  })
  return elements
}

/** Render data as a specific view → editable elements at `origin`. */
export function renderView(data: DiagramData, view: ViewId, origin: Point, style: DrawStyle): SketchElement[] {
  const resolved = dataForView(data, view)
  if (resolved.kind === 'graph') {
    return buildGraphView(resolved, view, origin, style)
  }
  if (resolved.kind === 'series') {
    return buildSeriesView(resolved, view, origin, style)
  }
  if (view === 'timeline') {
    return buildTimelineView(resolved, origin, style)
  }
  if (view === 'network') {
    return buildNetworkView(resolved, origin, style)
  }
  return buildGanttView(resolved, origin, style)
}

/** Render a placed diagram instance into elements with deterministic ids/seeds
 *  (so the read view is stable and shapes can be mapped back to the diagram). */
export function renderDiagramInstance(instance: DiagramInstance): SketchElement[] {
  const raw = renderView(instance.data, instance.view, { x: instance.x, y: instance.y }, instance.style)
  return raw.map((element, i) => ({
    ...element,
    id: `${instance.id}:${i}`,
    seed: (instance.seed + i * 0x9e3779b1) >>> 0,
    // Drop bindings: the builder already positioned everything, and the ids are
    // remapped, so retaining bindings would dangle.
    ...(element.type === 'arrow' ? { startBinding: undefined, endBinding: undefined } : {}),
  }))
}

/** Bounding-box-friendly: the prefix that marks an element as part of a diagram. */
export function diagramElementPrefix(id: string): string {
  return `${id}:`
}

// ---------------------------------------------------------------------------
// Scene integration
// ---------------------------------------------------------------------------

/** All renderable elements of a scene: freeform elements plus every diagram
 *  instance rendered to its current view. */
export function sceneElements(scene: Scene): SketchElement[] {
  if (!scene.diagrams || scene.diagrams.length === 0) {
    return scene.elements
  }
  const out = [...scene.elements]
  for (const instance of scene.diagrams) {
    out.push(...renderDiagramInstance(instance))
  }
  return out
}

/** If an element id belongs to a diagram instance, return that diagram's id. */
export function diagramIdOfElement(scene: Scene, elementId: string): string | null {
  for (const instance of scene.diagrams ?? []) {
    if (elementId.startsWith(`${instance.id}:`)) {
      return instance.id
    }
  }
  return null
}

/** Convert a diagram instance into ordinary, freely-editable elements (fresh
 *  ids/seeds) and drop the instance — the one-way "flatten" escape hatch. */
export function flattenDiagram(scene: Scene, diagramId: string): Scene {
  const instance = scene.diagrams?.find((d) => d.id === diagramId)
  if (!instance) {
    return scene
  }
  const baked = renderDiagramInstance(instance).map((element) => ({ ...element, id: generateId('el'), seed: generateSeed() }))
  return {
    ...scene,
    elements: [...scene.elements, ...baked],
    diagrams: (scene.diagrams ?? []).filter((d) => d.id !== diagramId),
  }
}
