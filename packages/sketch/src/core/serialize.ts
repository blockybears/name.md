import { createScene } from './scene'
import { token } from './types'
import type {
  ColorToken,
  DrawStyle,
  ElementType,
  FillStyle,
  Point,
  Rect,
  Scene,
  SketchColor,
  SketchElement,
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

  return createScene({
    elements,
    background: coerceColor(data.background) ?? token('canvas'),
    defaultStyle: coerceStyle(data.defaultStyle),
    defaultView: coerceRect(data.defaultView),
  })
}

const elementTypes: ElementType[] = ['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'freedraw', 'text']
const fillStyles: FillStyle[] = ['none', 'solid', 'hachure']
const aligns: TextAlign[] = ['left', 'center', 'right']

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function coerceStyle(value: unknown): DrawStyle {
  return value === 'clean' ? 'clean' : 'sketchy'
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
    strokeWidth: num(data.strokeWidth, 2),
    style: coerceStyle(data.style),
    stroke: coerceColor(data.stroke) ?? token('foreground'),
    fill: coerceColor(data.fill) ?? token('surface'),
    fillStyle: fillStyles.includes(data.fillStyle as FillStyle) ? (data.fillStyle as FillStyle) : 'none',
    roundness: num(data.roundness, 0),
    groupIds: Array.isArray(data.groupIds) ? (data.groupIds.filter((id) => typeof id === 'string') as string[]) : [],
  }

  if (type === 'line' || type === 'arrow' || type === 'freedraw') {
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
