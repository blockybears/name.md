import { graphToElements, layeredLayout, type GraphEdge, type GraphNode, type LayoutDirection } from './graphLayout'
import { createElement, generateId } from './scene'
import { literal, token, type DrawStyle, type Point, type SketchElement } from './types'

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
        const from = byName.get(dep)
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

export function buildGanttView(gantt: GanttData, origin: Point, style: DrawStyle): SketchElement[] {
  if (gantt.tasks.length === 0) {
    return []
  }
  const minDay = Math.min(...gantt.tasks.map((task) => task.startDay))
  const maxDay = Math.max(...gantt.tasks.map((task) => task.endDay))
  const totalDays = Math.max(1, maxDay - minDay)
  const rowH = 28
  const rowGap = 8
  const labelW = 150
  const chartW = Math.max(300, Math.min(900, totalDays * 26))
  const dayPx = chartW / totalDays
  const dayToX = (day: number) => origin.x + labelW + (day - minDay) * dayPx
  const elements: SketchElement[] = []
  if (gantt.title) {
    elements.push(textEl(origin.x, origin.y - 28, gantt.title, 17, style))
  }
  const chartTop = origin.y
  const chartBottom = origin.y + gantt.tasks.length * (rowH + rowGap) + 20
  const tickStep = totalDays > 21 ? 7 : totalDays > 7 ? 2 : 1
  for (let day = minDay; day <= maxDay; day += tickStep) {
    const x = dayToX(day)
    elements.push(lineEl(x, chartTop, x, chartBottom, style, { stroke: token('muted'), strokeStyle: 'dotted' }))
    elements.push(textEl(x - 14, chartTop - 2, dayToLabel(day), 11, style, { stroke: token('muted') }))
  }
  let lastSection = ''
  gantt.tasks.forEach((task, i) => {
    const y = origin.y + 18 + i * (rowH + rowGap)
    if (task.section && task.section !== lastSection) {
      elements.push(textEl(origin.x, y - 2, task.section, 12, style, { stroke: token('muted') }))
      lastSection = task.section
    }
    elements.push(textEl(origin.x, y + 6, task.name, 13, style))
    const x = dayToX(task.startDay)
    const w = Math.max(8, (task.endDay - task.startDay) * dayPx)
    if (task.tags.includes('milestone')) {
      elements.push(createElement({ type: 'diamond', id: generateId('ms'), x: x - rowH / 2, y, width: rowH, height: rowH, fill: token('accent'), fillStyle: 'solid', stroke: token('accent') }, style))
    } else {
      const fill = task.tags.includes('crit') ? literal('#e03131') : task.tags.includes('done') ? token('muted') : token('accent')
      elements.push(createElement({ type: 'rectangle', id: generateId('bar'), x, y, width: w, height: rowH, fill, fillStyle: 'solid', stroke: fill, roundness: 5, opacity: task.tags.includes('done') ? 0.6 : 1 }, style))
    }
  })
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
