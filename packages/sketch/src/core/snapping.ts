import type { Rect } from './types'

export interface SnapGuide {
  axis: 'x' | 'y'
  at: number
  from: number
  to: number
}

export interface SnapResult {
  dx: number
  dy: number
  guides: SnapGuide[]
}

export const SNAP_GRID = 10

export function snapToGrid(value: number, grid = SNAP_GRID): number {
  return Math.round(value / grid) * grid
}

type Candidate = { pos: number; rect: Rect }

function nearest(movingVals: number[], candidates: Candidate[], threshold: number) {
  let best: { diff: number; at: number; rect: Rect } | null = null
  for (const mv of movingVals) {
    for (const c of candidates) {
      const diff = c.pos - mv
      if (Math.abs(diff) <= threshold && (!best || Math.abs(diff) < Math.abs(best.diff))) {
        best = { diff, at: c.pos, rect: c.rect }
      }
    }
  }
  return best
}

export interface SnapOptions {
  threshold: number
  /** Object-alignment snapping (edges/centers of other elements), with guides. */
  magnet?: boolean
  /** Snap to a coarse grid (no guides). */
  grid?: boolean
  gridSize?: number
}

function edgeCandidates(others: Rect[]): { x: Candidate[]; y: Candidate[] } {
  const x: Candidate[] = []
  const y: Candidate[] = []
  for (const o of others) {
    x.push({ pos: o.x, rect: o }, { pos: o.x + o.width / 2, rect: o }, { pos: o.x + o.width, rect: o })
    y.push({ pos: o.y, rect: o }, { pos: o.y + o.height / 2, rect: o }, { pos: o.y + o.height, rect: o })
  }
  return { x, y }
}

/**
 * Compute a snap offset for a MOVING rect: object alignment (magnet, with
 * guides) and/or grid. Used while dragging whole elements.
 */
export function computeSnap(moving: Rect, others: Rect[], options: SnapOptions): SnapResult {
  const grid = options.gridSize ?? SNAP_GRID
  const mx = [moving.x, moving.x + moving.width / 2, moving.x + moving.width]
  const my = [moving.y, moving.y + moving.height / 2, moving.y + moving.height]
  const cand = edgeCandidates(others)

  const sx = options.magnet ? nearest(mx, cand.x, options.threshold) : null
  const sy = options.magnet ? nearest(my, cand.y, options.threshold) : null

  let dx = 0
  let dy = 0
  const guides: SnapGuide[] = []

  if (sx) {
    dx = sx.diff
    const top = Math.min(moving.y + dy, sx.rect.y)
    const bottom = Math.max(moving.y + moving.height + dy, sx.rect.y + sx.rect.height)
    guides.push({ axis: 'x', at: sx.at, from: top, to: bottom })
  } else if (options.grid) {
    dx = snapToGrid(moving.x, grid) - moving.x
  }

  if (sy) {
    dy = sy.diff
    const left = Math.min(moving.x + dx, sy.rect.x)
    const right = Math.max(moving.x + moving.width + dx, sy.rect.x + sy.rect.height)
    guides.push({ axis: 'y', at: sy.at, from: left, to: right })
  } else if (options.grid) {
    dy = snapToGrid(moving.y, grid) - moving.y
  }

  return { dx, dy, guides }
}

export interface PointSnapResult {
  x: number
  y: number
  guides: SnapGuide[]
}

/**
 * Snap a single POINT (a resize handle or a vertex) to other elements' edges
 * (magnet, with guides) and/or the grid. Used for resize and endpoint drags.
 */
export function snapPoint(point: { x: number; y: number }, others: Rect[], options: SnapOptions): PointSnapResult {
  const grid = options.gridSize ?? SNAP_GRID
  const cand = edgeCandidates(others)
  let x = point.x
  let y = point.y
  const guides: SnapGuide[] = []

  const sx = options.magnet ? nearest([point.x], cand.x, options.threshold) : null
  if (sx) {
    x = sx.at
    guides.push({ axis: 'x', at: sx.at, from: Math.min(point.y, sx.rect.y), to: Math.max(point.y, sx.rect.y + sx.rect.height) })
  } else if (options.grid) {
    x = snapToGrid(point.x, grid)
  }

  const sy = options.magnet ? nearest([point.y], cand.y, options.threshold) : null
  if (sy) {
    y = sy.at
    guides.push({ axis: 'y', at: sy.at, from: Math.min(x, sy.rect.x), to: Math.max(x, sy.rect.x + sy.rect.width) })
  } else if (options.grid) {
    y = snapToGrid(point.y, grid)
  }

  return { x, y, guides }
}
