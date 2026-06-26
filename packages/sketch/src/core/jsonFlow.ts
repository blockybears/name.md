import type { GraphData, ViewId } from './diagram'
import { graphToElements, layeredLayout, type GraphEdge, type GraphNode } from './graphLayout'
import type { DrawStyle, Point, SketchElement } from './types'

const MAX_NODES = 200

function formatPrimitive(value: unknown): string {
  if (typeof value === 'string') {
    return value.length > 24 ? `"${value.slice(0, 23)}…"` : `"${value}"`
  }
  return String(value)
}

/** Turn a JSON value into a tree graph (objects/arrays branch, primitives are
 *  leaves). Returns null for invalid JSON. */
export function jsonGraph(jsonText: string): GraphData | null {
  let root: unknown
  try {
    root = JSON.parse(jsonText)
  } catch {
    return null
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
  return nodes.length === 0 ? null : { kind: 'graph', nodes, edges }
}

/**
 * Turn a JSON value into editable sketch elements (a left-to-right tree).
 * Returns [] for invalid JSON.
 */
export function jsonToElements(jsonText: string, origin: Point = { x: 0, y: 0 }, style: DrawStyle = 'soft'): SketchElement[] {
  const graph = jsonGraph(jsonText)
  if (!graph) {
    return []
  }
  const layout = layeredLayout(graph.nodes, graph.edges, 'LR')
  return graphToElements(graph.nodes, graph.edges, layout, origin, style)
}

/** Parse JSON into graph data + default view, for view-switching. */
export function jsonToData(jsonText: string): { data: GraphData; view: ViewId } | null {
  const graph = jsonGraph(jsonText)
  return graph ? { data: graph, view: 'flow-lr' } : null
}
