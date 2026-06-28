import type { Point } from '../types'

// All generators work in element-local coordinates: (0,0) at the top-left of
// the element box, extending to (width, height). The renderer applies the
// element's translate/rotate transform around this.

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

export function rectPath(width: number, height: number, roundness = 0): string {
  const r = Math.max(0, Math.min(roundness, Math.min(width, height) / 2))
  if (r <= 0) {
    return `M0 0 H${fmt(width)} V${fmt(height)} H0 Z`
  }
  return [
    `M${fmt(r)} 0`,
    `H${fmt(width - r)}`,
    `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(width)} ${fmt(r)}`,
    `V${fmt(height - r)}`,
    `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(width - r)} ${fmt(height)}`,
    `H${fmt(r)}`,
    `A${fmt(r)} ${fmt(r)} 0 0 1 0 ${fmt(height - r)}`,
    `V${fmt(r)}`,
    `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(r)} 0`,
    'Z',
  ].join(' ')
}

export function ellipsePath(width: number, height: number): string {
  const rx = width / 2
  const ry = height / 2
  return [
    `M0 ${fmt(ry)}`,
    `a ${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(width)} 0`,
    `a ${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(-width)} 0`,
    'Z',
  ].join(' ')
}

export function diamondPath(width: number, height: number): string {
  const hx = width / 2
  const hy = height / 2
  return `M${fmt(hx)} 0 L${fmt(width)} ${fmt(hy)} L${fmt(hx)} ${fmt(height)} L0 ${fmt(hy)} Z`
}

/** Sample a rounded-rectangle outline into perimeter points (for sketchy fill
 *  and outline so hand-drawn rectangles keep their rounded corners). */
export function roundedRectPoints(width: number, height: number, radius: number, perCorner = 4): Point[] {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2))
  if (r <= 0) {
    return [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ]
  }
  const points: Point[] = []
  // Corner centers and their arc start angle (radians), going clockwise.
  const corners: Array<{ cx: number; cy: number; start: number }> = [
    { cx: width - r, cy: r, start: -Math.PI / 2 }, // top-right
    { cx: width - r, cy: height - r, start: 0 }, // bottom-right
    { cx: r, cy: height - r, start: Math.PI / 2 }, // bottom-left
    { cx: r, cy: r, start: Math.PI }, // top-left
  ]
  for (const corner of corners) {
    for (let i = 0; i <= perCorner; i += 1) {
      const angle = corner.start + (Math.PI / 2) * (i / perCorner)
      points.push({ x: corner.cx + Math.cos(angle) * r, y: corner.cy + Math.sin(angle) * r })
    }
  }
  return points
}

export function polylinePath(points: Point[]): string {
  if (points.length === 0) {
    return ''
  }
  const [first, ...rest] = points
  return `M${fmt(first.x)} ${fmt(first.y)}` + rest.map((point) => ` L${fmt(point.x)} ${fmt(point.y)}`).join('')
}

/**
 * Smooth path through points using a Catmull-Rom spline expressed as cubic
 * béziers — turns a simplified freehand polyline into a clean flowing curve.
 */
export function smoothPath(points: Point[]): string {
  if (points.length < 3) {
    return polylinePath(points)
  }
  const p = points
  let d = `M${fmt(p[0].x)} ${fmt(p[0].y)}`
  for (let i = 0; i < p.length - 1; i += 1) {
    const p0 = p[i - 1] ?? p[i]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2.x)} ${fmt(p2.y)}`
  }
  return d
}
