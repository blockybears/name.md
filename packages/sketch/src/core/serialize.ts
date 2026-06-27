import type { DiagramData, DiagramInstance, ViewId } from './diagram'
import type { GraphEdge, GraphNode } from './graphLayout'
import { createScene } from './scene'
import { token } from './types'
import type {
  Arrowhead,
  ColorToken,
  DrawStyle,
  ElementType,
  FillStyle,
  Point,
  Rect,
  Scene,
  SketchColor,
  SketchElement,
  StrokeStyle,
  TextAlign,
} from './types'

export function serializeScene(scene: Scene): string {
  return JSON.stringify(scene)
}

/**
 * Parse a scene from its JSON string, tolerating partial/legacy payloads by
 * filling defaults. Never throws — an unparseable payload yields an empty scene
 * so a broken fence still renders something editable rather than crashing.
 */
export function parseScene(text: string): Scene {
  if (!text.trim()) {
    return createScene()
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return createScene()
  }
  if (!raw || typeof raw !== 'object') {
    return createScene()
  }

  const data = raw as Record<string, unknown>
  const elements = Array.isArray(data.elements)
    ? (data.elements as unknown[]).map(coerceElement).filter((element): element is SketchElement => element !== null)
    : []

  const diagrams = Array.isArray(data.diagrams)
    ? (data.diagrams as unknown[]).map(coerceDiagram).filter((d): d is DiagramInstance => d !== null)
    : undefined

  return createScene({
    elements,
    diagrams: diagrams && diagrams.length ? diagrams : undefined,
    background: coerceColor(data.background) ?? token('canvas'),
    defaultStyle: coerceStyle(data.defaultStyle),
    defaultView: coerceRect(data.defaultView),
  })
}

const viewIds: ViewId[] = ['flow-td', 'flow-lr', 'mindmap', 'orgchart', 'pie', 'donut', 'bar', 'gantt', 'timeline']

/** Tolerant coercion of a stored diagram instance (drops anything malformed). */
function coerceDiagram(value: unknown): DiagramInstance | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const d = value as Record<string, unknown>
  const data = coerceDiagramData(d.data)
  if (!data || typeof d.id !== 'string') {
    return null
  }
  const view = viewIds.includes(d.view as ViewId) ? (d.view as ViewId) : 'flow-td'
  return {
    id: d.id,
    seed: num(d.seed, 1),
    x: num(d.x, 0),
    y: num(d.y, 0),
    style: coerceStyle(d.style),
    view,
    data,
  }
}

function coerceDiagramData(value: unknown): DiagramData | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const d = value as Record<string, unknown>
  if (d.kind === 'graph' && Array.isArray(d.nodes) && Array.isArray(d.edges)) {
    return {
      kind: 'graph',
      nodes: (d.nodes as unknown[])
        .map((n) => (n && typeof n === 'object' ? (n as GraphNode) : null))
        .filter((n): n is GraphNode => n !== null && typeof n.id === 'string'),
      edges: (d.edges as unknown[])
        .map((e) => (e && typeof e === 'object' ? (e as GraphEdge) : null))
        .filter((e): e is GraphEdge => e !== null && typeof e.from === 'string' && typeof e.to === 'string'),
    }
  }
  if (d.kind === 'series' && Array.isArray(d.items)) {
    return {
      kind: 'series',
      title: typeof d.title === 'string' ? d.title : undefined,
      items: (d.items as unknown[])
        .map((i) => (i && typeof i === 'object' ? (i as Record<string, unknown>) : null))
        .filter((i): i is Record<string, unknown> => i !== null && typeof i.label === 'string' && typeof i.value === 'number')
        .map((i) => ({ label: i.label as string, value: i.value as number })),
    }
  }
  if (d.kind === 'gantt' && Array.isArray(d.tasks)) {
    return {
      kind: 'gantt',
      title: typeof d.title === 'string' ? d.title : undefined,
      tasks: (d.tasks as unknown[])
        .map((t) => (t && typeof t === 'object' ? (t as Record<string, unknown>) : null))
        .filter((t): t is Record<string, unknown> => t !== null && typeof t.name === 'string')
        .map((t) => ({
          id: typeof t.id === 'string' ? t.id : undefined,
          name: t.name as string,
          startDay: num(t.startDay, 0),
          endDay: num(t.endDay, 1),
          deps: Array.isArray(t.deps) ? (t.deps.filter((x) => typeof x === 'string') as string[]) : [],
          section: typeof t.section === 'string' ? t.section : undefined,
          tags: Array.isArray(t.tags) ? (t.tags.filter((x) => typeof x === 'string') as string[]) : [],
          pinned: t.pinned === true ? true : undefined,
          progress: typeof t.progress === 'number' ? t.progress : undefined,
        })),
    }
  }
  return null
}

const elementTypes: ElementType[] = ['rectangle', 'ellipse', 'diamond', 'polygon', 'line', 'arrow', 'freedraw', 'text']
const fillStyles: FillStyle[] = ['none', 'solid', 'hachure']
const strokeStyles: StrokeStyle[] = ['solid', 'dashed', 'dotted']
const arrowheads: Arrowhead[] = ['none', 'arrow', 'triangle', 'dot']
const aligns: TextAlign[] = ['left', 'center', 'right']

function coerceBinding(value: unknown): { elementId: string; focus: number; gap: number } | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const data = value as Record<string, unknown>
  if (typeof data.elementId !== 'string') {
    return undefined
  }
  return { elementId: data.elementId, focus: num(data.focus, 0), gap: num(data.gap, 4) }
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function coerceStyle(value: unknown): DrawStyle {
  return value === 'clean' || value === 'soft' || value === 'sketchy' ? value : 'sketchy'
}

function coerceColor(value: unknown): SketchColor | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const data = value as Record<string, unknown>
  if (data.kind === 'literal' && typeof data.value === 'string') {
    return { kind: 'literal', value: data.value }
  }
  if (data.kind === 'token' && typeof data.token === 'string') {
    const allowed: ColorToken[] = ['foreground', 'muted', 'accent', 'surface', 'canvas']
    if (allowed.includes(data.token as ColorToken)) {
      return { kind: 'token', token: data.token as ColorToken }
    }
  }
  return undefined
}

function coerceRect(value: unknown): Rect | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const data = value as Record<string, unknown>
  if (['x', 'y', 'width', 'height'].every((key) => typeof data[key] === 'number')) {
    return { x: data.x as number, y: data.y as number, width: data.width as number, height: data.height as number }
  }
  return null
}

function coercePoints(value: unknown): Point[] {
  if (!Array.isArray(value)) {
    return []
  }
  return (value as unknown[])
    .map((point) => {
      if (point && typeof point === 'object') {
        const data = point as Record<string, unknown>
        if (typeof data.x === 'number' && typeof data.y === 'number') {
          return { x: data.x, y: data.y }
        }
      }
      return null
    })
    .filter((point): point is Point => point !== null)
}

function coerceElement(value: unknown): SketchElement | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const data = value as Record<string, unknown>
  const type = data.type
  if (typeof type !== 'string' || !elementTypes.includes(type as ElementType)) {
    return null
  }

  const base = {
    id: str(data.id, `el-${Math.random().toString(36).slice(2)}`),
    type: type as ElementType,
    x: num(data.x, 0),
    y: num(data.y, 0),
    width: num(data.width, 0),
    height: num(data.height, 0),
    angle: num(data.angle, 0),
    seed: num(data.seed, 1),
    opacity: num(data.opacity, 1),
    fillOpacity: num(data.fillOpacity, 1),
    strokeWidth: num(data.strokeWidth, 2),
    style: coerceStyle(data.style),
    stroke: coerceColor(data.stroke) ?? token('foreground'),
    fill: coerceColor(data.fill) ?? token('surface'),
    fillStyle: fillStyles.includes(data.fillStyle as FillStyle) ? (data.fillStyle as FillStyle) : 'none',
    strokeStyle: strokeStyles.includes(data.strokeStyle as StrokeStyle) ? (data.strokeStyle as StrokeStyle) : 'solid',
    roundness: num(data.roundness, 0),
    groupIds: Array.isArray(data.groupIds) ? (data.groupIds.filter((id) => typeof id === 'string') as string[]) : [],
    ...(typeof data.label === 'string' ? { label: data.label } : {}),
    ...(typeof data.labelFontSize === 'number' ? { labelFontSize: data.labelFontSize } : {}),
  }

  if (type === 'arrow') {
    return {
      ...base,
      points: coercePoints(data.points),
      startArrowhead: arrowheads.includes(data.startArrowhead as Arrowhead) ? (data.startArrowhead as Arrowhead) : 'none',
      endArrowhead: arrowheads.includes(data.endArrowhead as Arrowhead) ? (data.endArrowhead as Arrowhead) : 'arrow',
      startBinding: coerceBinding(data.startBinding),
      endBinding: coerceBinding(data.endBinding),
    } as unknown as SketchElement
  }
  if (type === 'line' || type === 'freedraw' || type === 'polygon') {
    return { ...base, points: coercePoints(data.points) } as unknown as SketchElement
  }
  if (type === 'text') {
    return {
      ...base,
      text: str(data.text, ''),
      fontSize: num(data.fontSize, 20),
      fontFamily: str(data.fontFamily, 'inherit'),
      align: aligns.includes(data.align as TextAlign) ? (data.align as TextAlign) : 'left',
    } as unknown as SketchElement
  }
  return base as unknown as SketchElement
}
