import { borderPoint } from './binding'
import { createElement, generateId } from './scene'
import type { DrawStyle, SketchElement } from './types'

export type NodeShape = 'rectangle' | 'rounded' | 'ellipse' | 'diamond'
export type LayoutDirection = 'TD' | 'TB' | 'BT' | 'LR' | 'RL'

export interface GraphNode {
  id: string
  label: string
  shape: NodeShape
}

export interface GraphEdge {
  from: string
  to: string
  label?: string
  dashed?: boolean
  /** false = a plain line (no arrowhead). */
  arrow?: boolean
}

export interface NodeBox {
  x: number
  y: number
  width: number
  height: number
}

const NODE_W = 150
const NODE_H = 64
const GAP_MAIN = 70
const GAP_CROSS = 36

/**
 * Layered ("Sugiyama-lite") layout: rank nodes by longest path from a root and
 * place each rank in a column (LR/RL) or row (TD/TB/BT). Good enough for
 * flowcharts and JSON trees; everything stays editable afterwards.
 */
export function layeredLayout(nodes: GraphNode[], edges: GraphEdge[], direction: LayoutDirection): Map<string, NodeBox> {
  const rank = new Map<string, number>()
  for (const node of nodes) {
    rank.set(node.id, 0)
  }
  // Longest-path ranking with a cycle guard.
  let changed = true
  let guard = 0
  while (changed && guard <= nodes.length + 2) {
    changed = false
    guard += 1
    for (const edge of edges) {
      if (!rank.has(edge.from) || !rank.has(edge.to)) {
        continue
      }
      const candidate = (rank.get(edge.from) ?? 0) + 1
      if (candidate > (rank.get(edge.to) ?? 0)) {
        rank.set(edge.to, candidate)
        changed = true
      }
    }
  }

  const byRank = new Map<number, string[]>()
  for (const node of nodes) {
    const r = rank.get(node.id) ?? 0
    const list = byRank.get(r) ?? []
    list.push(node.id)
    byRank.set(r, list)
  }

  const horizontal = direction === 'LR' || direction === 'RL'
  const pos = new Map<string, NodeBox>()
  const ranks = [...byRank.keys()].sort((a, b) => a - b)

  for (const r of ranks) {
    const ids = byRank.get(r) ?? []
    const crossStep = (horizontal ? NODE_H : NODE_W) + GAP_CROSS
    const mainStep = (horizontal ? NODE_W : NODE_H) + GAP_MAIN
    const crossExtent = (ids.length - 1) * crossStep
    ids.forEach((id, i) => {
      const main = r * mainStep
      const cross = i * crossStep - crossExtent / 2
      let x = horizontal ? main : cross
      let y = horizontal ? cross : main
      if (direction === 'BT') {
        y = -y
      }
      if (direction === 'RL') {
        x = -x
      }
      pos.set(id, { x, y, width: NODE_W, height: NODE_H })
    })
  }

  // Shift to a positive origin.
  let minX = Infinity
  let minY = Infinity
  for (const box of pos.values()) {
    minX = Math.min(minX, box.x)
    minY = Math.min(minY, box.y)
  }
  if (Number.isFinite(minX)) {
    for (const [id, box] of pos) {
      pos.set(id, { ...box, x: box.x - minX, y: box.y - minY })
    }
  }
  return pos
}

function shapeType(shape: NodeShape): 'rectangle' | 'ellipse' | 'diamond' {
  if (shape === 'ellipse') {
    return 'ellipse'
  }
  if (shape === 'diamond') {
    return 'diamond'
  }
  return 'rectangle'
}

/** Build editable sketch elements (labelled shapes + bound connectors) from a graph. */
export function graphToElements(
  nodes: GraphNode[],
  edges: GraphEdge[],
  layout: Map<string, NodeBox>,
  origin: { x: number; y: number },
  style: DrawStyle,
): SketchElement[] {
  const elements: SketchElement[] = []
  const byId = new Map<string, SketchElement>()

  for (const node of nodes) {
    const box = layout.get(node.id)
    if (!box) {
      continue
    }
    const type = shapeType(node.shape)
    const roundness = node.shape === 'rounded' ? 16 : type === 'rectangle' ? 6 : 0
    const element = createElement(
      {
        type,
        id: generateId('node'),
        x: origin.x + box.x,
        y: origin.y + box.y,
        width: box.width,
        height: box.height,
        label: node.label,
        labelFontSize: 14,
        roundness,
      },
      style,
    )
    elements.push(element)
    byId.set(node.id, element)
  }

  for (const edge of edges) {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (!from || !to) {
      continue
    }
    const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
    const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 }
    const start = borderPoint(from, toCenter, 4)
    const end = borderPoint(to, fromCenter, 4)
    const minX = Math.min(start.x, end.x)
    const minY = Math.min(start.y, end.y)
    const arrow = createElement(
      {
        type: 'arrow',
        id: generateId('edge'),
        x: minX,
        y: minY,
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
        points: [
          { x: start.x - minX, y: start.y - minY },
          { x: end.x - minX, y: end.y - minY },
        ],
        startBinding: { elementId: from.id, focus: 0, gap: 4 },
        endBinding: { elementId: to.id, focus: 0, gap: 4 },
        startArrowhead: 'none',
        endArrowhead: edge.arrow === false ? 'none' : 'arrow',
        strokeStyle: edge.dashed ? 'dashed' : 'solid',
        ...(edge.label ? { label: edge.label, labelFontSize: 13 } : {}),
      },
      style,
    )
    elements.push(arrow)
    byId.set(`__edge_${edge.from}_${edge.to}`, arrow)
  }

  return elements
}
