import { rectCenter, rotatePoint } from './geometry'
import type { ArrowElement, Point, Scene, SketchElement } from './types'

/** Shapes an arrow endpoint can bind to. */
export function isBindable(element: SketchElement): boolean {
  return element.type === 'rectangle' || element.type === 'ellipse' || element.type === 'diamond'
}

/**
 * The point on an element's border along the ray from its center toward
 * `target`, pushed outward by `gap`. Honors the element's rotation. `focus`
 * (-1..1) slides the anchor laterally so multiple connectors can fan out.
 */
export function borderPoint(element: SketchElement, target: Point, gap = 0, focus = 0): Point {
  const center = rectCenter(element)
  const local = rotatePoint(target, center, -element.angle)
  const halfW = Math.max(1, element.width / 2)
  const halfH = Math.max(1, element.height / 2)
  const localCx = element.x + element.width / 2
  const localCy = element.y + element.height / 2

  let dx = local.x - localCx
  let dy = local.y - localCy
  // Apply focus as a lateral offset perpendicular to the connection direction.
  if (focus !== 0) {
    const len = Math.hypot(dx, dy) || 1
    const px = -dy / len
    const py = dx / len
    dx += px * focus * halfW
    dy += py * focus * halfH
  }
  if (dx === 0 && dy === 0) {
    dy = -1
  }

  let t: number
  switch (element.type) {
    case 'ellipse':
      t = 1 / Math.sqrt((dx / halfW) ** 2 + (dy / halfH) ** 2)
      break
    case 'diamond':
      t = 1 / (Math.abs(dx) / halfW + Math.abs(dy) / halfH)
      break
    default: // rectangle and fallbacks
      t = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH)
      break
  }

  const edgeLocal = { x: localCx + dx * t, y: localCy + dy * t }
  // Push outward by gap along the same direction.
  if (gap) {
    const len = Math.hypot(dx, dy) || 1
    edgeLocal.x += (dx / len) * gap
    edgeLocal.y += (dy / len) * gap
  }
  return rotatePoint(edgeLocal, center, element.angle)
}

function absolutePoints(arrow: ArrowElement): Point[] {
  return arrow.points.map((point) => ({ x: arrow.x + point.x, y: arrow.y + point.y }))
}

function withAbsolutePoints(arrow: ArrowElement, points: Point[]): ArrowElement {
  let minX = Infinity
  let minY = Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
  }
  return { ...arrow, x: minX, y: minY, points: points.map((point) => ({ x: point.x - minX, y: point.y - minY })) }
}

/** Recompute an arrow's bound endpoints against the current shapes. */
export function recomputeArrow(arrow: ArrowElement, byId: Map<string, SketchElement>): ArrowElement {
  if (!arrow.startBinding && !arrow.endBinding) {
    return arrow
  }
  const pts = absolutePoints(arrow)
  if (pts.length < 2) {
    return arrow
  }
  let start = pts[0]
  let end = pts[pts.length - 1]

  if (arrow.startBinding) {
    const shape = byId.get(arrow.startBinding.elementId)
    if (shape) {
      const toward = pts[1] ?? end
      start = borderPoint(shape, toward, arrow.startBinding.gap, arrow.startBinding.focus)
    }
  }
  if (arrow.endBinding) {
    const shape = byId.get(arrow.endBinding.elementId)
    if (shape) {
      const toward = pts[pts.length - 2] ?? start
      end = borderPoint(shape, toward, arrow.endBinding.gap, arrow.endBinding.focus)
    }
  }

  const next = [start, ...pts.slice(1, -1), end]
  return withAbsolutePoints(arrow, next)
}

/** Recompute every bound arrow in a scene (after a shape moved/resized). */
export function recomputeBindings(scene: Scene): Scene {
  const hasBindings = scene.elements.some(
    (element) => element.type === 'arrow' && (element.startBinding || element.endBinding),
  )
  if (!hasBindings) {
    return scene
  }
  const byId = new Map(scene.elements.map((element) => [element.id, element]))
  return {
    ...scene,
    elements: scene.elements.map((element) =>
      element.type === 'arrow' ? recomputeArrow(element, byId) : element,
    ),
  }
}

/** The topmost bindable element under a point (for arrow endpoint snapping). */
export function bindableAt(elements: SketchElement[], point: Point, tolerance: number): SketchElement | null {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const element = elements[i]
    if (!isBindable(element)) {
      continue
    }
    const center = rectCenter(element)
    const local = rotatePoint(point, center, -element.angle)
    if (
      local.x >= element.x - tolerance &&
      local.y >= element.y - tolerance &&
      local.x <= element.x + element.width + tolerance &&
      local.y <= element.y + element.height + tolerance
    ) {
      return element
    }
  }
  return null
}
