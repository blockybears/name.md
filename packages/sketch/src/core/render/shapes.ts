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

export function polylinePath(points: Point[]): string {
  if (points.length === 0) {
    return ''
  }
  const [first, ...rest] = points
  return `M${fmt(first.x)} ${fmt(first.y)}` + rest.map((point) => ` L${fmt(point.x)} ${fmt(point.y)}`).join('')
}
