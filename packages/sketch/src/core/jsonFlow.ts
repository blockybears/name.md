import { graphToElements, layeredLayout, type GraphEdge, type GraphNode } from './graphLayout'
import type { DrawStyle, Point, SketchElement } from './types'

const MAX_NODES = 200

function formatPrimitive(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > 24 ? `"${value.slice(0, 23)}…"` : `"${value}"`
  }
  return String(value)
}

/**
 * Turn a JSON value into a tree of labelled nodes + parent→child connectors,
 * rendered as editable sketch elements (objects/arrays branch, primitives are
 * leaves). Returns [] for invalid JSON.
 */
export function jsonToElements(jsonText: string, origin: Point = { x: 0, y: 0 }, style: DrawStyle = 'soft'): SketchElement[] {
  let root: unknown
  try {
    root = JSON.parse(jsonText)
  } catch {
    return []
  }

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  let counter = 0

  const walk = (value: unknown, keyLabel: string | null, parentId: string | null): void => {
    if (nodes.length >= MAX_NODES) {
      return
    }
    const id = `j${counter++}`
    let label: string
    let entries: Array<[string, unknown]> = []
    let shape: GraphNode['shape']

    if (Array.isArray(value)) {
      entries = value.map((item, index) => [String(index), item])
      label = keyLabel != null ? `${keyLabel} [${value.length}]` : `[${value.length}]`
      shape = 'rounded'
    } else if (value && typeof value === 'object') {
      entries = Object.entries(value as Record<string, unknown>)
      label = keyLabel != null ? `${keyLabel} { }` : '{ }'
      shape = 'rectangle'
    } else {
      label = keyLabel != null ? `${keyLabel}: ${formatPrimitive(value)}` : formatPrimitive(value)
      shape = 'ellipse'
    }

    nodes.push({ id, label, shape })
    if (parentId != null) {
      edges.push({ from: parentId, to: id, arrow: true })
    }
    for (const [childKey, childValue] of entries) {
      walk(childValue, childKey, id)
    }
  }

  walk(root, null, null)
  if (nodes.length === 0) {
    return []
  }
  // Left-to-right tree reads best for nested data.
  const layout = layeredLayout(nodes, edges, 'LR')
  return graphToElements(nodes, edges, layout, origin, style)
}
