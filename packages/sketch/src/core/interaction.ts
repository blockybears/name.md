import { elementBounds, rectCenter, rotatePoint } from './geometry'
import { isLinear } from './types'
import type { Point, Rect, SketchElement } from './types'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Convert a scene-space point into an element's local (unrotated) coordinates. */
export function toLocalPoint(element: SketchElement, point: Point): Point {
  const center = rectCenter(element)
  const unrotated = rotatePoint(point, center, -element.angle)
  return { x: unrotated.x - element.x, y: unrotated.y - element.y }
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y)
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Whether a scene-space point hits an element, within `tolerance` scene units. */
export function elementHit(element: SketchElement, point: Point, tolerance: number): boolean {
  const local = toLocalPoint(element, point)
  if (isLinear(element)) {
    for (let i = 0; i < element.points.length - 1; i += 1) {
      if (distanceToSegment(local, element.points[i], element.points[i + 1]) <= tolerance + element.strokeWidth) {
        return true
      }
    }
    return false
  }
  return (
    local.x >= -tolerance &&
    local.y >= -tolerance &&
    local.x <= element.width + tolerance &&
    local.y <= element.height + tolerance
  )
}

/** Topmost element under a point (search front-to-back), or null. */
export function hitTest(elements: SketchElement[], point: Point, tolerance: number): SketchElement | null {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    if (elementHit(elements[i], point, tolerance)) {
      return elements[i]
    }
  }
  return null
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y)
}

/** Elements whose bounds intersect a marquee rect. */
export function elementsInMarquee(elements: SketchElement[], marquee: Rect): SketchElement[] {
  return elements.filter((element) => rectsIntersect(elementBounds(element), marquee))
}

export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

/** Pixel-space positions of the 8 resize handles for an axis-aligned rect. */
export function handlePositions(rect: Rect): Record<ResizeHandle, Point> {
  const { x, y, width, height } = rect
  return {
    nw: { x, y },
    n: { x: x + width / 2, y },
    ne: { x: x + width, y },
    e: { x: x + width, y: y + height / 2 },
    se: { x: x + width, y: y + height },
    s: { x: x + width / 2, y: y + height },
    sw: { x, y: y + height },
    w: { x, y: y + height / 2 },
  }
}

/** Compute a new rect from dragging `handle` to `pointer` (axis-aligned). */
export function resizeRect(rect: Rect, handle: ResizeHandle, pointer: Point, minSize = 1): Rect {
  let { x, y, width, height } = rect
  const right = x + width
  const bottom = y + height

  if (handle.includes('w')) {
    x = Math.min(pointer.x, right - minSize)
    width = right - x
  }
  if (handle.includes('e')) {
    width = Math.max(minSize, pointer.x - x)
  }
  if (handle.includes('n')) {
    y = Math.min(pointer.y, bottom - minSize)
    height = bottom - y
  }
  if (handle.includes('s')) {
    height = Math.max(minSize, pointer.y - y)
  }
  return { x, y, width, height }
}

/** Apply a new bounding rect to an element, scaling linear points to fit. */
export function applyResize(element: SketchElement, next: Rect): SketchElement {
  if (isLinear(element)) {
    const scaleX = element.width > 0 ? next.width / element.width : 1
    const scaleY = element.height > 0 ? next.height / element.height : 1
    return {
      ...element,
      x: next.x,
      y: next.y,
      width: next.width,
      height: next.height,
      points: element.points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })),
    }
  }
  return { ...element, x: next.x, y: next.y, width: next.width, height: next.height }
}

export function moveElement(element: SketchElement, dx: number, dy: number): SketchElement {
  return { ...element, x: element.x + dx, y: element.y + dy }
}

/** Angle (radians) from an element's center to a pointer, for the rotate handle. */
export function angleToPointer(element: SketchElement, pointer: Point): number {
  const center = rectCenter(element)
  // Handle sits above the top edge, so offset by -90° to make "up" = 0 rotation.
  return Math.atan2(pointer.y - center.y, pointer.x - center.x) + Math.PI / 2
}
