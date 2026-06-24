import type { Point } from './types'

function perpendicularDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y)
  }
  const area = Math.abs(dy * point.x - dx * point.y + b.x * a.y - b.y * a.x)
  return area / Math.sqrt(lenSq)
}

/**
 * Ramer–Douglas–Peucker polyline simplification. Keeps freedraw strokes light
 * enough for SVG without visibly changing their shape.
 */
export function simplifyPoints(points: Point[], tolerance = 1): Point[] {
  if (points.length <= 2) {
    return points
  }
  let maxDist = 0
  let index = 0
  const end = points.length - 1
  for (let i = 1; i < end; i += 1) {
    const dist = perpendicularDistance(points[i], points[0], points[end])
    if (dist > maxDist) {
      maxDist = dist
      index = i
    }
  }
  if (maxDist > tolerance) {
    const left = simplifyPoints(points.slice(0, index + 1), tolerance)
    const right = simplifyPoints(points.slice(index), tolerance)
    return [...left.slice(0, -1), ...right]
  }
  return [points[0], points[end]]
}
