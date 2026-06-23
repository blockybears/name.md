export type JsonFlowKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

export type JsonFlowNode = {
  id: string
  position: { x: number; y: number }
  data: { label: string; kind: JsonFlowKind }
}

export type JsonFlowEdge = {
  id: string
  source: string
  target: string
}

export type JsonFlowGraph = {
  nodes: JsonFlowNode[]
  edges: JsonFlowEdge[]
  error?: string
  truncated?: boolean
}

const X_GAP = 240
const Y_GAP = 58
const MAX_NODES = 600

function kindOf(value: unknown): JsonFlowKind {
  if (Array.isArray(value)) {
    return 'array'
  }
  if (value === null) {
    return 'null'
  }
  const type = typeof value
  if (type === 'object') {
    return 'object'
  }
  if (type === 'number' || type === 'boolean' || type === 'string') {
    return type
  }
  return 'string'
}

function formatPrimitive(value: unknown) {
  if (typeof value === 'string') {
    const text = value.length > 40 ? `${value.slice(0, 39)}…` : value
    return JSON.stringify(text)
  }
  return String(value)
}

/**
 * Convert a JSON string into a node/edge graph with a tidy left-to-right tree
 * layout (objects/arrays branch into their children, primitives are leaves).
 * Pure and DOM-free so it can be unit tested and reused by the React canvas.
 */
export function buildJsonFlow(jsonText: string): JsonFlowGraph {
  const trimmed = jsonText.trim()
  if (!trimmed) {
    return { nodes: [], edges: [] }
  }

  let root: unknown
  try {
    root = JSON.parse(trimmed)
  } catch (error) {
    return { nodes: [], edges: [], error: (error as Error).message }
  }

  const nodes: JsonFlowNode[] = []
  const edges: JsonFlowEdge[] = []
  const nodeY = new Map<string, number>()
  let idCounter = 0
  let leafCursor = 0
  let truncated = false

  const add = (value: unknown, keyLabel: string | null, depth: number, parentId: string | null): string => {
    const id = String(idCounter++)
    const kind = kindOf(value)

    let label: string
    let entries: Array<[string, unknown]> = []

    if (kind === 'object') {
      const record = value as Record<string, unknown>
      entries = Object.entries(record)
      label = keyLabel != null ? `${keyLabel} { }` : '{ }'
    } else if (kind === 'array') {
      const list = value as unknown[]
      entries = list.map((item, index) => [String(index), item] as [string, unknown])
      label = keyLabel != null ? `${keyLabel} [${list.length}]` : `[${list.length}]`
    } else {
      label = keyLabel != null ? `${keyLabel}: ${formatPrimitive(value)}` : formatPrimitive(value)
    }

    let y: number
    if (entries.length === 0 || idCounter > MAX_NODES) {
      if (idCounter > MAX_NODES) {
        truncated = true
      }
      y = leafCursor * Y_GAP
      leafCursor += 1
    } else {
      const childYs = entries.map(([childKey, childValue]) => {
        const childId = add(childValue, childKey, depth + 1, id)
        return nodeY.get(childId) ?? 0
      })
      y = (childYs[0] + childYs[childYs.length - 1]) / 2
    }

    nodes.push({ id, position: { x: depth * X_GAP, y }, data: { label, kind } })
    nodeY.set(id, y)
    if (parentId != null) {
      edges.push({ id: `e${parentId}-${id}`, source: parentId, target: id })
    }
    return id
  }

  add(root, null, 0, null)

  return { nodes, edges, truncated }
}
