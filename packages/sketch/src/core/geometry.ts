import type { Point, Rect, SketchElement } from './types'

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

export function rotatePoint(point: Point, center: Point, angle: number): Point {
  if (!angle) {
    return point
  }
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = point.x - center.x
  const dy = point.y - center.y
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  }
}

/** Axis-aligned bounding box of an element, accounting for its rotation. */
export function elementBounds(element: SketchElement): Rect {
  const center = rectCenter(element)
  const corners: Point[] = [
    { x: element.x, y: element.y },
    { x: element.x + element.width, y: element.y },
    { x: element.x + element.width, y: element.y + element.height },
    { x: element.x, y: element.y + element.height },
  ].map((corner) => rotatePoint(corner, center, element.angle))

  return boundsOfPoints(corners) ?? { x: element.x, y: element.y, width: element.width, height: element.height }
}

export function boundsOfPoints(points: Point[]): Rect | null {
  if (points.length === 0) {
    return null
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function unionRects(rects: Rect[]): Rect | null {
  const corners: Point[] = []
  for (const rect of rects) {
    corners.push({ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height })
  }
  return boundsOfPoints(corners)
}

/** Axis-aligned bounds covering every element in the scene. */
export function sceneContentBounds(elements: SketchElement[]): Rect | null {
  if (elements.length === 0) {
    return null
  }
  return unionRects(elements.map(elementBounds))
}

export function padRect(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  }
}

export function pointInRect(point: Point, rect: Rect): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height
}
