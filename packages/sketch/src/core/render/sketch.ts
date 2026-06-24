import type { Point } from '../types'

// A small, dependency-free hand-drawn stroke + hachure generator (our own mini
// "rough"). Everything is driven by a per-element seed so output is stable
// across re-renders — essential for a steady read-only view.

const ROUGHNESS = 1.4
const HACHURE_GAP = 8
const HACHURE_ANGLE = Math.PI / 4

/** Deterministic PRNG (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0 || 1
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function f(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function jitter(rng: () => number, amount: number): number {
  return (rng() * 2 - 1) * amount
}

function wobbleAmount(length: number): number {
  return Math.min(4, 1 + length / 50) * ROUGHNESS
}

/** A single wobbly stroke from a→b as a cubic bezier with perturbed controls. */
function stroke(x1: number, y1: number, x2: number, y2: number, rng: () => number, amount: number): string {
  const sx = x1 + jitter(rng, amount * 0.5)
  const sy = y1 + jitter(rng, amount * 0.5)
  const ex = x2 + jitter(rng, amount * 0.5)
  const ey = y2 + jitter(rng, amount * 0.5)
  const cx1 = x1 + (x2 - x1) / 3 + jitter(rng, amount)
  const cy1 = y1 + (y2 - y1) / 3 + jitter(rng, amount)
  const cx2 = x1 + (2 * (x2 - x1)) / 3 + jitter(rng, amount)
  const cy2 = y1 + (2 * (y2 - y1)) / 3 + jitter(rng, amount)
  return `M${f(sx)} ${f(sy)} C${f(cx1)} ${f(cy1)} ${f(cx2)} ${f(cy2)} ${f(ex)} ${f(ey)}`
}

/** A double-struck wobbly edge (the characteristic hand-drawn look). */
export function roughEdge(a: Point, b: Point, rng: () => number): string {
  const amount = wobbleAmount(Math.hypot(b.x - a.x, b.y - a.y))
  return `${stroke(a.x, a.y, b.x, b.y, rng, amount)} ${stroke(a.x, a.y, b.x, b.y, rng, amount)}`
}

export function roughPolyline(points: Point[], rng: () => number, closed: boolean): string {
  if (points.length < 2) {
    return ''
  }
  const segments: string[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    segments.push(roughEdge(points[i], points[i + 1], rng))
  }
  if (closed) {
    segments.push(roughEdge(points[points.length - 1], points[0], rng))
  }
  return segments.join(' ')
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Smooth closed curve through (perturbed) points, drawn as two passes. */
export function roughClosedCurve(points: Point[], rng: () => number, jitterAmount: number): string {
  if (points.length < 3) {
    return roughPolyline(points, rng, true)
  }
  const pass = () => {
    const pts = points.map((point) => ({ x: point.x + jitter(rng, jitterAmount), y: point.y + jitter(rng, jitterAmount) }))
    const n = pts.length
    const mids = pts.map((point, i) => midpoint(point, pts[(i + 1) % n]))
    let d = `M${f(mids[0].x)} ${f(mids[0].y)}`
    for (let i = 0; i < n; i += 1) {
      const control = pts[(i + 1) % n]
      const end = mids[(i + 1) % n]
      d += ` Q${f(control.x)} ${f(control.y)} ${f(end.x)} ${f(end.y)}`
    }
    return `${d} Z`
  }
  return `${pass()} ${pass()}`
}

export function ellipsePoints(width: number, height: number, count = 18): Point[] {
  const rx = width / 2
  const ry = height / 2
  const points: Point[] = []
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2
    points.push({ x: rx + Math.cos(angle) * rx, y: ry + Math.sin(angle) * ry })
  }
  return points
}

// --- hachure fill ---

function rotate(point: Point, angle: number): Point {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos }
}

/** Parallel fill lines clipped to a convex polygon, returned in local coords. */
export function hachurePolygon(polygon: Point[], gap = HACHURE_GAP, angle = HACHURE_ANGLE): Array<[Point, Point]> {
  // Work in a rotated frame where hachure lines are horizontal.
  const rotated = polygon.map((point) => rotate(point, -angle))
  let minY = Infinity
  let maxY = -Infinity
  for (const point of rotated) {
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }
  const segments: Array<[Point, Point]> = []
  for (let y = minY + gap; y < maxY; y += gap) {
    const xs: number[] = []
    for (let i = 0; i < rotated.length; i += 1) {
      const a = rotated[i]
      const b = rotated[(i + 1) % rotated.length]
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        const t = (y - a.y) / (b.y - a.y)
        xs.push(a.x + t * (b.x - a.x))
      }
    }
    xs.sort((p, q) => p - q)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      segments.push([rotate({ x: xs[i], y }, angle), rotate({ x: xs[i + 1], y }, angle)])
    }
  }
  return segments
}

/** Parallel fill lines clipped to an ellipse (origin box 0..w, 0..h). */
export function hachureEllipse(width: number, height: number, gap = HACHURE_GAP, angle = HACHURE_ANGLE): Array<[Point, Point]> {
  const cx = width / 2
  const cy = height / 2
  const rx = width / 2
  const ry = height / 2
  const samples = Math.max(24, Math.ceil((Math.PI * (rx + ry)) / 6))
  const polygon: Point[] = []
  for (let i = 0; i < samples; i += 1) {
    const theta = (i / samples) * Math.PI * 2
    polygon.push({ x: cx + Math.cos(theta) * rx, y: cy + Math.sin(theta) * ry })
  }
  return hachurePolygon(polygon, gap, angle)
}

export function hachurePath(segments: Array<[Point, Point]>, rng: () => number): string {
  return segments.map(([a, b]) => roughEdge(a, b, rng)).join(' ')
}
