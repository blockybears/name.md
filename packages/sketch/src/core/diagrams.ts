import { borderPoint } from './binding'
import { createElement, generateId } from './scene'
import type { Arrowhead, DrawStyle, ElementType, Point, SketchColor, SketchElement } from './types'
import { token } from './types'

export type DiagramKind =
  | 'flowchart'
  | 'kanban'
  | 'swimlane'
  | 'mindmap'
  | 'orgchart'
  | 'fishbone'
  | 'gantt'
  | 'sequence'

export const DIAGRAM_KINDS: Array<{ id: DiagramKind; label: string }> = [
  { id: 'flowchart', label: 'Flowchart' },
  { id: 'kanban', label: 'Kanban board' },
  { id: 'swimlane', label: 'Swimlane' },
  { id: 'mindmap', label: 'Mind map' },
  { id: 'orgchart', label: 'Org chart' },
  { id: 'fishbone', label: 'Fishbone' },
  { id: 'gantt', label: 'Gantt' },
  { id: 'sequence', label: 'Sequence' },
]

/** Incrementally builds a set of elements with shared style + connector helpers. */
class DiagramBuilder {
  elements: SketchElement[] = []
  private origin: Point
  private style: DrawStyle

  constructor(origin: Point, style: DrawStyle) {
    this.origin = origin
    this.style = style
  }

  node(
    type: Extract<ElementType, 'rectangle' | 'ellipse' | 'diamond'>,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    extra: Partial<SketchElement> = {},
  ): SketchElement {
    const element = createElement(
      {
        type,
        id: generateId('node'),
        x: this.origin.x + x,
        y: this.origin.y + y,
        width,
        height,
        label,
        labelFontSize: 16,
        roundness: type === 'rectangle' ? 8 : 0,
        ...extra,
      },
      this.style,
    )
    this.elements.push(element)
    return element
  }

  text(x: number, y: number, text: string, fontSize = 16, extra: Partial<SketchElement> = {}): SketchElement {
    const element = createElement(
      {
        type: 'text',
        id: generateId('text'),
        x: this.origin.x + x,
        y: this.origin.y + y,
        width: text.length * fontSize * 0.6,
        height: fontSize * 1.3,
        text,
        fontSize,
        ...extra,
      },
      this.style,
    )
    this.elements.push(element)
    return element
  }

  /** A connector bound to both shapes' borders. */
  connect(from: SketchElement, to: SketchElement, options: { endArrowhead?: Arrowhead; dashed?: boolean } = {}): SketchElement {
    const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
    const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
    const start = borderPoint(from, toCenter, 4)
    const end = borderPoint(to, fromCenter, 4)
    const minX = Math.min(start.x, end.x)
    const minY = Math.min(start.y, end.y)
    const arrow = createElement(
      {
        type: 'arrow',
        id: generateId('arrow'),
        x: minX,
        y: minY,
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
        points: [
          { x: start.x - minX, y: start.y - minY },
          { x: end.x - minX, y: end.y - minY },
        ],
        startBinding: { elementId: from.id, focus: 0, gap: 4 },
        endBinding: { elementId: to.id, focus: 0, gap: 4 },
        startArrowhead: 'none',
        endArrowhead: options.endArrowhead ?? 'arrow',
        strokeStyle: options.dashed ? 'dashed' : 'solid',
      },
      this.style,
    )
    this.elements.push(arrow)
    return arrow
  }

  line(x1: number, y1: number, x2: number, y2: number, extra: Partial<SketchElement> = {}): SketchElement {
    const minX = Math.min(x1, x2)
    const minY = Math.min(y1, y2)
    const element = createElement(
      {
        type: 'line',
        id: generateId('line'),
        x: this.origin.x + minX,
        y: this.origin.y + minY,
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
        points: [
          { x: x1 - minX, y: y1 - minY },
          { x: x2 - minX, y: y2 - minY },
        ],
        ...extra,
      },
      this.style,
    )
    this.elements.push(element)
    return element
  }
}

const accent = (): SketchColor => token('accent')

function flowchart(b: DiagramBuilder) {
  const start = b.node('ellipse', 60, 0, 160, 64, 'Start')
  const step = b.node('rectangle', 50, 110, 180, 70, 'Process')
  const decision = b.node('diamond', 50, 230, 180, 110, 'Decision?')
  const yes = b.node('rectangle', 50, 390, 180, 70, 'Yes path')
  const end = b.node('ellipse', 320, 255, 160, 64, 'End')
  b.connect(start, step)
  b.connect(step, decision)
  b.connect(decision, yes)
  b.connect(decision, end)
}

function kanban(b: DiagramBuilder) {
  const columns = ['To Do', 'In Progress', 'Done']
  const colW = 200
  const gap = 24
  columns.forEach((title, i) => {
    const x = i * (colW + gap)
    b.node('rectangle', x, 0, colW, 420, '', { fill: token('surface'), fillStyle: 'solid', roundness: 12 })
    b.text(x + 16, 16, title, 18)
    for (let card = 0; card < 2; card += 1) {
      b.node('rectangle', x + 16, 56 + card * 96, colW - 32, 80, `Card ${i + 1}.${card + 1}`, {
        fill: token('canvas'),
        fillStyle: 'solid',
        roundness: 8,
        labelFontSize: 14,
      })
    }
  })
}

function swimlane(b: DiagramBuilder) {
  const lanes = ['Customer', 'System']
  const laneH = 150
  const labelW = 120
  lanes.forEach((name, row) => {
    const y = row * (laneH + 16)
    b.node('rectangle', 0, y, labelW, laneH, name, { fill: token('surface'), fillStyle: 'solid', labelFontSize: 15 })
    const steps: SketchElement[] = []
    for (let i = 0; i < 3; i += 1) {
      steps.push(b.node('rectangle', labelW + 30 + i * 180, y + 40, 140, 70, `Step ${row + 1}.${i + 1}`))
    }
    for (let i = 0; i < steps.length - 1; i += 1) {
      b.connect(steps[i], steps[i + 1])
    }
  })
}

function mindmap(b: DiagramBuilder) {
  const center = b.node('ellipse', 200, 180, 180, 80, 'Central idea', { fill: accent(), fillStyle: 'solid', stroke: token('accent') })
  const branches = [
    { x: 0, y: 40, label: 'Branch A' },
    { x: 440, y: 40, label: 'Branch B' },
    { x: 0, y: 320, label: 'Branch C' },
    { x: 440, y: 320, label: 'Branch D' },
  ]
  for (const branch of branches) {
    const node = b.node('rectangle', branch.x, branch.y, 160, 64, branch.label, { roundness: 16 })
    b.connect(center, node, { endArrowhead: 'none' })
  }
}

function orgchart(b: DiagramBuilder) {
  const ceo = b.node('rectangle', 200, 0, 180, 70, 'CEO')
  const reports = ['Engineering', 'Design', 'Sales']
  reports.forEach((label, i) => {
    const node = b.node('rectangle', i * 200, 150, 170, 70, label)
    b.connect(ceo, node)
  })
}

function fishbone(b: DiagramBuilder) {
  const spineY = 200
  const head = b.node('rectangle', 620, spineY - 40, 150, 80, 'Effect', { fill: token('surface'), fillStyle: 'solid' })
  b.line(0, spineY, 620, spineY, { stroke: token('foreground'), strokeWidth: 3 })
  const causes = ['People', 'Process', 'Equipment', 'Materials']
  causes.forEach((label, i) => {
    const top = i % 2 === 0
    const x = 120 + i * 140
    const y = top ? spineY - 130 : spineY + 130
    b.text(x - 20, top ? y - 24 : y + 8, label, 15)
    b.line(x, y, x + 90, spineY, { stroke: token('muted'), strokeWidth: 2 })
  })
  void head
}

function gantt(b: DiagramBuilder) {
  const rowH = 44
  const tasks = [
    { label: 'Research', start: 0, len: 2 },
    { label: 'Design', start: 1, len: 2 },
    { label: 'Build', start: 2, len: 3 },
    { label: 'Ship', start: 4, len: 1 },
  ]
  const unit = 90
  const labelW = 120
  for (let week = 0; week <= 5; week += 1) {
    b.text(labelW + week * unit, 0, `W${week + 1}`, 13, { stroke: token('muted') })
    b.line(labelW + week * unit, 24, labelW + week * unit, 24 + tasks.length * rowH, { stroke: token('muted'), strokeWidth: 1, strokeStyle: 'dotted' })
  }
  tasks.forEach((task, i) => {
    const y = 30 + i * rowH
    b.text(0, y + 8, task.label, 14)
    b.node('rectangle', labelW + task.start * unit, y, task.len * unit - 8, rowH - 14, '', {
      fill: accent(),
      fillStyle: 'solid',
      stroke: token('accent'),
      roundness: 6,
    })
  })
}

function sequence(b: DiagramBuilder) {
  const actors = ['User', 'App', 'Server']
  const spacing = 200
  const lifelineBottom = 360
  actors.forEach((name, i) => {
    b.node('rectangle', i * spacing, 0, 140, 56, name, { fill: token('surface'), fillStyle: 'solid' })
    const cx = i * spacing + 70 // local center x (width 140 / 2)
    b.line(cx, 56, cx, lifelineBottom, { stroke: token('muted'), strokeStyle: 'dashed', strokeWidth: 1 })
  })
  const messages = [
    { from: 0, to: 1, y: 100, label: 'request' },
    { from: 1, to: 2, y: 170, label: 'query' },
    { from: 2, to: 1, y: 240, label: 'result' },
    { from: 1, to: 0, y: 310, label: 'response' },
  ]
  for (const message of messages) {
    const fromX = message.from * spacing + 70
    const toX = message.to * spacing + 70
    const minX = Math.min(fromX, toX)
    b.text(minX + 12, message.y - 20, message.label, 13, { stroke: token('muted') })
    b.line(fromX, message.y, toX, message.y, { stroke: token('foreground'), strokeWidth: 1.5 })
  }
}

const generators: Record<DiagramKind, (b: DiagramBuilder) => void> = {
  flowchart,
  kanban,
  swimlane,
  mindmap,
  orgchart,
  fishbone,
  gantt,
  sequence,
}

/** Generate a diagram template as a set of editable elements at `origin`. */
export function createDiagram(kind: DiagramKind, origin: Point, style: DrawStyle = 'sketchy'): SketchElement[] {
  const builder = new DiagramBuilder(origin, style)
  generators[kind](builder)
  return builder.elements
}
