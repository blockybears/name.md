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

/**
 * Compute a snap offset for a moving rect against other rects (edge/center
 * alignment, with guide lines) and, where no alignment is found, a coarse grid.
 */
export function computeSnap(
  moving: Rect,
  others: Rect[],
  options: { threshold: number; grid?: number },
): SnapResult {
  const mx = [moving.x, moving.x + moving.width / 2, moving.x + moving.width]
  const my = [moving.y, moving.y + moving.height / 2, moving.y + moving.height]

  const candX: Candidate[] = []
  const candY: Candidate[] = []
  for (const o of others) {
    candX.push({ pos: o.x, rect: o }, { pos: o.x + o.width / 2, rect: o }, { pos: o.x + o.width, rect: o })
    candY.push({ pos: o.y, rect: o }, { pos: o.y + o.height / 2, rect: o }, { pos: o.y + o.height, rect: o })
  }

  const sx = nearest(mx, candX, options.threshold)
  const sy = nearest(my, candY, options.threshold)

  let dx = 0
  let dy = 0
  const guides: SnapGuide[] = []

  if (sx) {
    dx = sx.diff
    const top = Math.min(moving.y + dy, sx.rect.y)
    const bottom = Math.max(moving.y + moving.height + dy, sx.rect.y + sx.rect.height)
    guides.push({ axis: 'x', at: sx.at, from: top, to: bottom })
  } else if (options.grid) {
    dx = snapToGrid(moving.x, options.grid) - moving.x
  }

  if (sy) {
    dy = sy.diff
    const left = Math.min(moving.x + dx, sy.rect.x)
    const right = Math.max(moving.x + moving.width + dx, sy.rect.x + sy.rect.width)
    guides.push({ axis: 'y', at: sy.at, from: left, to: right })
  } else if (options.grid) {
    dy = snapToGrid(moving.y, options.grid) - moving.y
  }

  return { dx, dy, guides }
}
