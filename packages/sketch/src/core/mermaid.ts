import { graphToElements, layeredLayout, type GraphEdge, type GraphNode, type LayoutDirection, type NodeShape } from './graphLayout'
import type { DrawStyle, Point, SketchElement } from './types'

/** Heuristic: does this text look like a Mermaid flowchart we can import? */
export function looksLikeMermaid(text: string): boolean {
  return /^\s*(graph|flowchart)\s+(TB|TD|BT|RL|LR)\b/i.test(text)
}

// Node shapes by delimiter, longest patterns first so e.g. ([ ]) wins over ( ).
const shapePatterns: Array<{ open: string; close: string; shape: NodeShape }> = [
  { open: '([', close: '])', shape: 'rounded' },
  { open: '[[', close: ']]', shape: 'rectangle' },
  { open: '[(', close: ')]', shape: 'rectangle' },
  { open: '((', close: '))', shape: 'ellipse' },
  { open: '{{', close: '}}', shape: 'diamond' },
  { open: '[', close: ']', shape: 'rectangle' },
  { open: '(', close: ')', shape: 'rounded' },
  { open: '{', close: '}', shape: 'diamond' },
]

function unquote(label: string): string {
  const trimmed = label.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/** Parse a single node token like `A[Label]` → register the node, return its id. */
function parseNode(token: string, nodes: Map<string, GraphNode>): string | null {
  const text = token.trim()
  if (!text) {
    return null
  }
  for (const pattern of shapePatterns) {
    const openIdx = text.indexOf(pattern.open)
    if (openIdx > 0 && text.endsWith(pattern.close)) {
      const id = text.slice(0, openIdx).trim()
      const label = unquote(text.slice(openIdx + pattern.open.length, text.length - pattern.close.length))
      if (id) {
        nodes.set(id, { id, label: label || id, shape: pattern.shape })
        return id
      }
    }
  }
  // Bare id (no shape): label defaults to the id.
  const id = text.replace(/^[^\w]+|[^\w]+$/g, '')
  if (!id) {
    return null
  }
  if (!nodes.has(id)) {
    nodes.set(id, { id, label: id, shape: 'rectangle' })
  }
  return id
}

const connectorRe = /(<?-{2,3}>?|<?={2,3}>?|<?-\.->?|-\.-|--[ox]|==[ox])(?:\|([^|]*)\||)/

/** Split a statement into [node, connector, node, connector, …] preserving connectors. */
function splitStatement(statement: string): string[] {
  const parts: string[] = []
  let rest = statement
  let guard = 0
  while (guard++ < 100) {
    const match = connectorRe.exec(rest)
    if (!match || match.index === undefined) {
      parts.push(rest)
      break
    }
    parts.push(rest.slice(0, match.index))
    parts.push(rest.slice(match.index, match.index + match[0].length))
    rest = rest.slice(match.index + match[0].length)
  }
  return parts.map((p) => p.trim()).filter(Boolean)
}

function connectorMeta(connector: string): { dashed: boolean; arrow: boolean; label?: string } {
  // Extract an inline |label|.
  const labelMatch = connector.match(/\|([^|]*)\|/)
  const label = labelMatch ? unquote(labelMatch[1]) : undefined
  const body = connector.replace(/\|[^|]*\|/, '')
  const dashed = body.includes('-.') || body.includes('.-')
  const arrow = body.includes('>') || body.includes('o') || body.includes('x')
  return { dashed, arrow, label }
}

/** Parse Mermaid flowchart text into editable sketch elements at `origin`. */
export function mermaidToElements(code: string, origin: Point = { x: 0, y: 0 }, style: DrawStyle = 'soft'): SketchElement[] {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  let direction: LayoutDirection = 'TD'

  const statements = code
    .replace(/\r/g, '')
    .split(/[\n;]+/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('%%'))

  for (let statement of statements) {
    const header = statement.match(/^(graph|flowchart)\s+(TB|TD|BT|RL|LR)\b/i)
    if (header) {
      direction = header[2].toUpperCase() as LayoutDirection
      statement = statement.slice(header[0].length).trim()
      if (!statement) {
        continue
      }
    }
    // Skip styling/class/subgraph directives we don't model.
    if (/^(style|classDef|class|click|subgraph|end|linkStyle|direction)\b/i.test(statement)) {
      continue
    }

    const parts = splitStatement(statement)
    if (parts.length === 1) {
      parseNode(parts[0], nodes)
      continue
    }
    // Chain: node (connector node)+
    let prevId = parseNode(parts[0], nodes)
    for (let i = 1; i + 1 < parts.length; i += 2) {
      const meta = connectorMeta(parts[i])
      const nextId = parseNode(parts[i + 1], nodes)
      if (prevId && nextId) {
        edges.push({ from: prevId, to: nextId, label: meta.label, dashed: meta.dashed, arrow: meta.arrow })
      }
      prevId = nextId
    }
  }

  const nodeList = [...nodes.values()]
  if (nodeList.length === 0) {
    return []
  }
  const layout = layeredLayout(nodeList, edges, direction)
  return graphToElements(nodeList, edges, layout, origin, style)
}
