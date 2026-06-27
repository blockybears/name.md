import {
  buildGanttView,
  buildSeriesView,
  type DiagramData,
  type GanttData,
  type GanttTask,
  type GraphData,
  type SeriesData,
  type SeriesItem,
  type ViewId,
} from './diagram'
import { graphToElements, layeredLayout, type GraphEdge, type GraphNode, type LayoutDirection, type NodeShape } from './graphLayout'
import { createElement, generateId } from './scene'
import { literal, token, type DrawStyle, type Point, type SketchElement } from './types'

/** Heuristic: does this text look like a Mermaid diagram we can import? */
export function looksLikeMermaid(text: string): boolean {
  return /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|mindmap|pie|gantt|journey|timeline|quadrantChart|gitGraph|sankey(-beta)?|xychart(-beta)?|requirementDiagram|kanban|block(-beta)?|C4Context|architecture(-beta)?|radar|packet(-beta)?|zenuml)\b/i.test(text)
}

function cleanLines(code: string): string[] {
  return code
    .replace(/\r/g, '')
    .split(/\n/)
    .map((line) => line.replace(/%%.*$/, '').replace(/\s+$/, ''))
    .filter((line) => line.trim().length > 0)
}

function unquote(label: string): string {
  const trimmed = label.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

// --- element helpers (coords are absolute; callers fold in the origin) ---
function textEl(x: number, y: number, text: string, fontSize: number, style: DrawStyle, extra: Record<string, unknown> = {}): SketchElement {
  return createElement({ type: 'text', id: generateId('t'), x, y, width: Math.max(20, text.length * fontSize * 0.6), height: fontSize * 1.3, text, fontSize, ...extra }, style)
}
function rectEl(x: number, y: number, w: number, h: number, style: DrawStyle, extra: Record<string, unknown> = {}): SketchElement {
  return createElement({ type: 'rectangle', id: generateId('r'), x, y, width: w, height: h, roundness: 6, ...extra }, style)
}
function ellipseEl(x: number, y: number, w: number, h: number, style: DrawStyle, extra: Record<string, unknown> = {}): SketchElement {
  return createElement({ type: 'ellipse', id: generateId('e'), x, y, width: w, height: h, ...extra }, style)
}
function lineEl(x1: number, y1: number, x2: number, y2: number, style: DrawStyle, extra: Record<string, unknown> = {}): SketchElement {
  const minX = Math.min(x1, x2)
  const minY = Math.min(y1, y2)
  return createElement({ type: 'line', id: generateId('ln'), x: minX, y: minY, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), points: [{ x: x1 - minX, y: y1 - minY }, { x: x2 - minX, y: y2 - minY }], ...extra }, style)
}
function arrowEl(x1: number, y1: number, x2: number, y2: number, style: DrawStyle, extra: Record<string, unknown> = {}): SketchElement {
  const minX = Math.min(x1, x2)
  const minY = Math.min(y1, y2)
  return createElement({ type: 'arrow', id: generateId('ar'), x: minX, y: minY, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), points: [{ x: x1 - minX, y: y1 - minY }, { x: x2 - minX, y: y2 - minY }], ...extra }, style)
}

/** Convert a {nodes, edges} graph into elements via layered layout. */
function finishGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  direction: LayoutDirection,
  origin: Point,
  style: DrawStyle,
  sizing?: { nodeWidth?: number; nodeHeight?: number },
): SketchElement[] {
  if (nodes.length === 0) {
    return []
  }
  const layout = layeredLayout(nodes, edges, direction, sizing)
  return graphToElements(nodes, edges, layout, origin, style)
}

// ---------------------------------------------------------------------------
// Flowchart (graph / flowchart)
// ---------------------------------------------------------------------------

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

function parseFlowNode(token_: string, nodes: Map<string, GraphNode>): string | null {
  const text = token_.trim()
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
  const labelMatch = connector.match(/\|([^|]*)\|/)
  const label = labelMatch ? unquote(labelMatch[1]) : undefined
  const body = connector.replace(/\|[^|]*\|/, '')
  const dashed = body.includes('-.') || body.includes('.-')
  const arrow = body.includes('>') || body.includes('o') || body.includes('x')
  return { dashed, arrow, label }
}

/** Extract flowchart structure as a graph (shared by the element path and the
 *  data path used for view-switching). */
export function flowchartGraph(code: string): { graph: GraphData; direction: LayoutDirection } {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  let direction: LayoutDirection = 'TD'

  for (let statement of code.split(/[\n;]+/).map((s) => s.replace(/%%.*$/, '').trim()).filter(Boolean)) {
    const header = statement.match(/^(graph|flowchart)\s+(TB|TD|BT|RL|LR)\b/i)
    if (header) {
      direction = header[2].toUpperCase() as LayoutDirection
      statement = statement.slice(header[0].length).trim()
      if (!statement) {
        continue
      }
    }
    if (/^(style|classDef|class|click|subgraph|end|linkStyle|direction)\b/i.test(statement)) {
      continue
    }
    const parts = splitStatement(statement)
    if (parts.length === 1) {
      parseFlowNode(parts[0], nodes)
      continue
    }
    let prevId = parseFlowNode(parts[0], nodes)
    for (let i = 1; i + 1 < parts.length; i += 2) {
      const meta = connectorMeta(parts[i])
      const nextId = parseFlowNode(parts[i + 1], nodes)
      if (prevId && nextId) {
        edges.push({ from: prevId, to: nextId, label: meta.label, dashed: meta.dashed, arrow: meta.arrow })
      }
      prevId = nextId
    }
  }
  return { graph: { kind: 'graph', nodes: [...nodes.values()], edges }, direction }
}

function parseFlowchart(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  const { graph, direction } = flowchartGraph(code)
  return finishGraph(graph.nodes, graph.edges, direction, origin, style)
}

// ---------------------------------------------------------------------------
// State diagram
// ---------------------------------------------------------------------------

function parseState(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const ensure = (id: string): string => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label: id, shape: 'rounded' })
    }
    return id
  }
  const ref = (raw: string, isTarget: boolean): string => {
    if (raw === '[*]') {
      const id = isTarget ? '__end' : '__start'
      if (!nodes.has(id)) {
        nodes.set(id, { id, label: '', shape: 'ellipse' })
      }
      return id
    }
    return ensure(raw)
  }

  for (const line of cleanLines(code)) {
    const trimmed = line.trim()
    // fork/choice/join pseudo-states render as small filled circles.
    const pseudo = trimmed.match(/^state\s+(\w+)\s*<<(fork|join|choice)>>/i)
    if (pseudo) {
      nodes.set(pseudo[1], { id: pseudo[1], label: '', shape: 'ellipse' })
      continue
    }
    // `state X as "label"` or `state "label" as X` aliasing.
    const alias = trimmed.match(/^state\s+"([^"]+)"\s+as\s+(\w+)/i) || trimmed.match(/^state\s+(\w+)\s+as\s+"([^"]+)"/i)
    if (alias) {
      const id = trimmed.match(/as\s+"([^"]+)"/i) ? alias[1] : alias[2]
      const label = trimmed.match(/as\s+"([^"]+)"/i) ? alias[2] : alias[1]
      nodes.set(id, { id, label, shape: 'rounded' })
      continue
    }
    if (/^stateDiagram(-v2)?\b/i.test(trimmed) || /^(direction|note)\b/i.test(trimmed) || /^state\s+\w+\s*\{/i.test(trimmed) || trimmed === '}' || trimmed === '--') {
      continue
    }
    // `Idle : description` state description.
    const desc = trimmed.match(/^(\w+)\s*:\s*(.+)$/)
    if (desc && !trimmed.includes('-->')) {
      ensure(desc[1])
      nodes.set(desc[1], { id: desc[1], label: `${desc[1]}\n${desc[2].trim()}`, shape: 'rounded' })
      continue
    }
    const transition = trimmed.match(/^(\[\*\]|[\w".]+)\s*-->\s*(\[\*\]|[\w".]+)(?:\s*:\s*(.+))?$/)
    if (transition) {
      const from = ref(transition[1], false)
      const to = ref(transition[2], true)
      edges.push({ from, to, label: transition[3] ? unquote(transition[3]) : undefined, arrow: true })
    }
  }
  return finishGraph([...nodes.values()], edges, 'TD', origin, style)
}

// ---------------------------------------------------------------------------
// ER diagram
// ---------------------------------------------------------------------------

function parseEr(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const ensure = (id: string) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label: id, shape: 'rectangle' })
    }
    return id
  }
  for (const line of cleanLines(code)) {
    const trimmed = line.trim()
    if (/^erDiagram\b/i.test(trimmed)) {
      continue
    }
    // CUSTOMER ||--o{ ORDER : places
    const rel = trimmed.match(/^(\w+)\s+([|}{o<>.-]+)\s+(\w+)\s*:\s*(.+)$/)
    if (rel) {
      const from = ensure(rel[1])
      const to = ensure(rel[3])
      edges.push({ from, to, label: unquote(rel[4]), arrow: false })
      continue
    }
    const bare = trimmed.match(/^(\w+)\s*\{?\s*$/)
    if (bare) {
      ensure(bare[1])
    }
  }
  return finishGraph([...nodes.values()], edges, 'LR', origin, style)
}

// ---------------------------------------------------------------------------
// Mindmap
// ---------------------------------------------------------------------------

function mindmapLabel(text: string): string {
  const trimmed = text.trim()
  for (const pattern of shapePatterns) {
    if (trimmed.startsWith(pattern.open) && trimmed.endsWith(pattern.close)) {
      return unquote(trimmed.slice(pattern.open.length, trimmed.length - pattern.close.length))
    }
    const idx = trimmed.indexOf(pattern.open)
    if (idx > 0 && trimmed.endsWith(pattern.close)) {
      return unquote(trimmed.slice(idx + pattern.open.length, trimmed.length - pattern.close.length))
    }
  }
  return trimmed
}

function parseMindmap(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const stack: Array<{ depth: number; id: string }> = []
  let started = false

  for (const line of cleanLines(code)) {
    if (!started) {
      if (/^\s*mindmap\b/i.test(line)) {
        started = true
      }
      continue
    }
    const depth = line.length - line.trimStart().length
    const label = mindmapLabel(line)
    if (!label) {
      continue
    }
    const id = generateId('mm')
    nodes.push({ id, label, shape: nodes.length === 0 ? 'ellipse' : 'rounded' })
    while (stack.length && stack[stack.length - 1].depth >= depth) {
      stack.pop()
    }
    const parent = stack[stack.length - 1]
    if (parent) {
      edges.push({ from: parent.id, to: id, arrow: false })
    }
    stack.push({ depth, id })
  }
  return finishGraph(nodes, edges, 'LR', origin, style)
}

// ---------------------------------------------------------------------------
// Class diagram
// ---------------------------------------------------------------------------

const classRelations: Array<{ token: string; dashed: boolean }> = [
  { token: '<|--', dashed: false },
  { token: '--|>', dashed: false },
  { token: '*--', dashed: false },
  { token: 'o--', dashed: false },
  { token: '..>', dashed: true },
  { token: '..|>', dashed: true },
  { token: '-->', dashed: false },
  { token: '--', dashed: false },
  { token: '..', dashed: true },
]

function tidyClassText(text: string): string {
  return text.replace(/~([^~]+)~/g, '<$1>').replace(/<<([^>]+)>>/g, '«$1»')
}

function classBaseId(name: string): string {
  return name.replace(/~.*$/, '').replace(/<.*$/, '').trim()
}

function parseClass(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  const members = new Map<string, string[]>()
  const display = new Map<string, string>()
  const order: string[] = []
  const edges: GraphEdge[] = []
  const ensure = (id: string, name?: string) => {
    if (!members.has(id)) {
      members.set(id, [])
      display.set(id, tidyClassText(name ?? id))
      order.push(id)
    } else if (name && !display.get(id)) {
      display.set(id, tidyClassText(name))
    }
  }

  const lines = cleanLines(code)
  let current: string | null = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^classDiagram\b/i.test(trimmed) || /^namespace\b/i.test(trimmed) || /^direction\b/i.test(trimmed)) {
      continue
    }
    // class Name { ... }  (members may span following lines until })
    const open = trimmed.match(/^class\s+(\S+)\s*\{?\s*$/) || trimmed.match(/^class\s+(\S+)\s*\{(.+)\}\s*$/)
    if (open) {
      const id = classBaseId(open[1])
      ensure(id, open[1])
      if (open[2]) {
        for (const m of open[2].split(/\n|;/)) {
          if (m.trim()) {
            members.get(id)!.push(tidyClassText(m.trim()))
          }
        }
        current = null
      } else if (trimmed.endsWith('{')) {
        current = id
      }
      continue
    }
    if (trimmed === '}') {
      current = null
      continue
    }
    if (current) {
      members.get(current)!.push(tidyClassText(trimmed))
      continue
    }
    // Name : member   or   Name : <<interface>>
    const member = trimmed.match(/^(\w+)\s*:\s*(.+)$/)
    if (member && !classRelations.some((r) => trimmed.includes(r.token))) {
      ensure(member[1])
      members.get(member[1])!.push(tidyClassText(member[2].trim()))
      continue
    }
    // Relationship: A <|-- B : label
    for (const rel of classRelations) {
      const idx = trimmed.indexOf(rel.token)
      if (idx > 0) {
        const left = trimmed.slice(0, idx).trim().split(/\s+/)[0].replace(/"[^"]*"/g, '').trim()
        const after = trimmed.slice(idx + rel.token.length).trim()
        const rightMatch = after.match(/^"?[^":]*"?\s*(\w+)/) || after.match(/^(\w+)/)
        const right = rightMatch ? rightMatch[1] : ''
        const labelMatch = after.match(/:\s*(.+)$/)
        if (left && right) {
          ensure(left)
          ensure(right)
          edges.push({ from: left, to: right, dashed: rel.dashed, arrow: true, label: labelMatch ? labelMatch[1].trim() : undefined })
        }
        break
      }
    }
  }

  const nodes: GraphNode[] = order.map((id) => {
    const list = members.get(id) ?? []
    const name = display.get(id) ?? id
    const label = list.length ? `${name}\n${'─'.repeat(Math.min(14, name.length + 2))}\n${list.join('\n')}` : name
    return { id, label, shape: 'rectangle' }
  })
  const maxMembers = Math.max(0, ...order.map((id) => members.get(id)?.length ?? 0))
  return finishGraph(nodes, edges, 'TD', origin, style, { nodeWidth: 180, nodeHeight: 50 + maxMembers * 18 })
}

// ---------------------------------------------------------------------------
// Pie chart (rendered as editable polygon sectors via the shared builder)
// ---------------------------------------------------------------------------

/** Extract pie slices as series data. */
export function pieSeries(code: string): SeriesData {
  const items: SeriesItem[] = []
  let title = ''
  for (const line of cleanLines(code)) {
    const trimmed = line.trim()
    const head = trimmed.match(/^pie(?:\s+showData)?(?:\s+title\s+(.+))?$/i)
    if (head) {
      title = head[1]?.trim() ?? ''
      continue
    }
    const slice = trimmed.match(/^"([^"]+)"\s*:\s*([\d.]+)$/) || trimmed.match(/^([^:]+):\s*([\d.]+)$/)
    if (slice) {
      items.push({ label: unquote(slice[1]), value: Number(slice[2]) })
    }
  }
  return { kind: 'series', title: title || undefined, items }
}

function parsePie(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  return buildSeriesView(pieSeries(code), 'pie', origin, style)
}

// ---------------------------------------------------------------------------
// Sequence diagram
// ---------------------------------------------------------------------------

type SeqStep =
  | { kind: 'message'; from: string; to: string; text: string; dashed: boolean; arrow: boolean }
  | { kind: 'note'; actors: string[]; text: string }
  | { kind: 'open'; type: string; label: string }
  | { kind: 'divider'; type: string; label: string }
  | { kind: 'close' }

function parseSequence(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  const actors: string[] = []
  const labels = new Map<string, string>()
  const ensureActor = (id: string, label?: string) => {
    if (!actors.includes(id)) {
      actors.push(id)
    }
    if (label) {
      labels.set(id, label)
    }
  }
  const steps: SeqStep[] = []

  for (const line of cleanLines(code)) {
    const trimmed = line.trim()
    if (/^sequenceDiagram\b/i.test(trimmed) || /^(autonumber|activate|deactivate)\b/i.test(trimmed)) {
      continue
    }
    const participant = trimmed.match(/^(?:participant|actor)\s+(\w+)(?:\s+as\s+(.+))?$/i)
    if (participant) {
      ensureActor(participant[1], participant[2] ? unquote(participant[2]) : undefined)
      continue
    }
    const block = trimmed.match(/^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i)
    if (block) {
      steps.push({ kind: 'open', type: block[1].toLowerCase(), label: block[2].trim() })
      continue
    }
    const divider = trimmed.match(/^(else|and|option)\b\s*(.*)$/i)
    if (divider) {
      steps.push({ kind: 'divider', type: divider[1].toLowerCase(), label: divider[2].trim() })
      continue
    }
    if (/^end\b/i.test(trimmed)) {
      steps.push({ kind: 'close' })
      continue
    }
    const note = trimmed.match(/^note\s+(?:over|(?:left|right)\s+of)\s+([\w, ]+?)\s*:\s*(.+)$/i)
    if (note) {
      const noteActors = note[1].split(',').map((a) => a.trim()).filter(Boolean)
      noteActors.forEach((a) => ensureActor(a))
      steps.push({ kind: 'note', actors: noteActors, text: note[2].trim() })
      continue
    }
    const message = trimmed.match(/^([\w]+)\s*(-{1,2}>>?|-{1,2}[x)]|-{1,2}>)\s*([\w]+)\s*:\s*(.*)$/)
    if (message) {
      ensureActor(message[1])
      ensureActor(message[3])
      const op = message[2]
      steps.push({ kind: 'message', from: message[1], to: message[3], text: message[4].trim(), dashed: op.includes('--'), arrow: op.includes('>>') || op.includes('>') || op.includes('x') || op.includes(')') })
    }
  }

  if (actors.length === 0) {
    return []
  }

  const spacing = 180
  const boxW = 130
  const boxH = 50
  const rowGap = 46
  const noteGap = 50
  const centerX = (i: number) => origin.x + i * spacing + boxW / 2
  const actorIndex = (id: string) => Math.max(0, actors.indexOf(id))

  // First pass: assign a y to each row-producing step and total height.
  let y = origin.y + boxH + 36
  type Placed = { step: SeqStep; y: number }
  const placed: Placed[] = []
  for (const step of steps) {
    if (step.kind === 'message') {
      placed.push({ step, y })
      y += rowGap
    } else if (step.kind === 'note') {
      placed.push({ step, y })
      y += noteGap
    } else {
      placed.push({ step, y })
      if (step.kind === 'open') {
        y += 28 // room for the frame label tab
      } else if (step.kind === 'divider') {
        y += 22
      }
    }
  }
  const bottom = y + 16

  const elements: SketchElement[] = []

  // Frames for loop/alt/opt/par blocks (drawn first, behind messages).
  const stack: Array<{ type: string; label: string; startY: number; minX: number; maxX: number; dividers: Array<{ y: number; label: string }> }> = []
  placed.forEach((p) => {
    if (p.step.kind === 'open') {
      stack.push({ type: p.step.type, label: p.step.label, startY: p.y, minX: Infinity, maxX: -Infinity, dividers: [] })
    } else if (p.step.kind === 'divider' && stack.length) {
      stack[stack.length - 1].dividers.push({ y: p.y, label: p.step.label })
    } else if (p.step.kind === 'close' && stack.length) {
      const frame = stack.pop()!
      const pad = 30
      const x = (Number.isFinite(frame.minX) ? frame.minX : centerX(0)) - pad
      const right = (Number.isFinite(frame.maxX) ? frame.maxX : centerX(actors.length - 1)) + pad
      const top = frame.startY - 6
      elements.push(
        createElement({ type: 'rectangle', id: generateId('frame'), x, y: top, width: Math.max(80, right - x), height: p.y - top + 4, fill: token('accent'), fillStyle: 'none', stroke: token('muted'), roundness: 4 }, style),
      )
      elements.push(textEl(x + 4, top + 2, frame.type + (frame.label ? `: ${frame.label}` : ''), 11, style, { stroke: token('muted') }))
      for (const divider of frame.dividers) {
        elements.push(createElement({ type: 'line', id: generateId('div'), x, y: divider.y, width: Math.max(80, right - x), height: 0, points: [{ x: 0, y: 0 }, { x: Math.max(80, right - x), y: 0 }], stroke: token('muted'), strokeStyle: 'dashed' }, style))
        if (divider.label) {
          elements.push(textEl(x + 4, divider.y + 2, `[${divider.label}]`, 11, style, { stroke: token('muted') }))
        }
      }
    } else if (p.step.kind === 'message' || p.step.kind === 'note') {
      // Track x-extent for the enclosing frames.
      const xs = p.step.kind === 'message' ? [centerX(actorIndex(p.step.from)), centerX(actorIndex(p.step.to))] : p.step.actors.map((a) => centerX(actorIndex(a)))
      for (const frame of stack) {
        frame.minX = Math.min(frame.minX, ...xs)
        frame.maxX = Math.max(frame.maxX, ...xs)
      }
    }
  })

  // Actor boxes + lifelines.
  actors.forEach((id, i) => {
    elements.push(
      createElement({ type: 'rectangle', id: generateId('actor'), x: origin.x + i * spacing, y: origin.y, width: boxW, height: boxH, label: labels.get(id) ?? id, labelFontSize: 14, fill: token('surface'), fillStyle: 'solid', roundness: 6 }, style),
    )
    const cx = centerX(i)
    elements.push(
      createElement({ type: 'line', id: generateId('life'), x: cx, y: origin.y + boxH, width: 0, height: bottom - origin.y - boxH, points: [{ x: 0, y: 0 }, { x: 0, y: bottom - origin.y - boxH }], stroke: token('muted'), strokeStyle: 'dashed' }, style),
    )
  })

  // Messages and notes.
  placed.forEach((p) => {
    if (p.step.kind === 'message') {
      const x1 = centerX(actorIndex(p.step.from))
      const x2 = centerX(actorIndex(p.step.to))
      const minX = Math.min(x1, x2)
      elements.push(
        createElement({ type: 'arrow', id: generateId('msg'), x: minX, y: p.y, width: Math.abs(x2 - x1), height: 0, points: [{ x: x1 - minX, y: 0 }, { x: x2 - minX, y: 0 }], strokeStyle: p.step.dashed ? 'dashed' : 'solid', endArrowhead: p.step.arrow ? 'triangle' : 'none', label: p.step.text, labelFontSize: 12 }, style),
      )
    } else if (p.step.kind === 'note') {
      const xs = p.step.actors.map((a) => centerX(actorIndex(a)))
      const nx = Math.min(...xs) - 50
      const nw = Math.max(...xs) - Math.min(...xs) + 100
      elements.push(
        createElement({ type: 'rectangle', id: generateId('note'), x: nx, y: p.y - 14, width: nw, height: 34, label: p.step.text, labelFontSize: 12, fill: literal('#fff3bf'), fillStyle: 'solid', stroke: token('muted') }, style),
      )
    }
  })

  return elements
}

// ---------------------------------------------------------------------------
// Gantt (approximate — bars by duration, no real date axis)
// ---------------------------------------------------------------------------

/** Parse a date into an epoch-day number for common Mermaid dateFormats. */
function parseGanttDate(value: string, format: string): number | null {
  const text = value.trim()
  let y: number
  let mo: number
  let d: number
  if (/YYYY-MM-DD/i.test(format) || /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const m = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return null
    y = +m[1]
    mo = +m[2]
    d = +m[3]
  } else if (/DD\/MM\/YYYY/i.test(format)) {
    const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (!m) return null
    d = +m[1]
    mo = +m[2]
    y = +m[3]
  } else if (/MM\/DD\/YYYY/i.test(format)) {
    const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (!m) return null
    mo = +m[1]
    d = +m[2]
    y = +m[3]
  } else if (/YYYY-MM/i.test(format)) {
    const m = text.match(/^(\d{4})-(\d{2})/)
    if (!m) return null
    y = +m[1]
    mo = +m[2]
    d = 1
  } else {
    const m = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return null
    y = +m[1]
    mo = +m[2]
    d = +m[3]
  }
  return Math.floor(Date.UTC(y, mo - 1, d) / 86400000)
}

function parseDuration(value: string): number | null {
  const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*([dwhms]?)$/i)
  if (!m) return null
  const n = Number(m[1])
  switch ((m[2] || 'd').toLowerCase()) {
    case 'w':
      return n * 7
    case 'h':
      return n / 24
    case 'm':
      return n / (24 * 60)
    default:
      return n
  }
}


/** Extract gantt structure (resolved day numbers + dependencies) as data. */
export function ganttData(code: string): GanttData {
  let dateFormat = 'YYYY-MM-DD'
  let title = ''
  let section = ''
  type Raw = { label: string; section: string; id?: string; startDay: number | null; afterId?: string; endDay: number | null; tags: string[] }
  const raws: Raw[] = []

  for (const line of cleanLines(code)) {
    const trimmed = line.trim()
    if (/^gantt\b/i.test(trimmed) || /^(axisFormat|excludes|todayMarker|tickInterval|weekday|includes)\b/i.test(trimmed)) {
      continue
    }
    let m: RegExpMatchArray | null
    if ((m = trimmed.match(/^dateFormat\s+(.+)$/i))) {
      dateFormat = m[1].trim()
      continue
    }
    if ((m = trimmed.match(/^title\s+(.+)$/i))) {
      title = m[1].trim()
      continue
    }
    if ((m = trimmed.match(/^section\s+(.+)$/i))) {
      section = m[1].trim()
      continue
    }
    const taskMatch = trimmed.match(/^(.+?)\s*:\s*(.+)$/)
    if (!taskMatch) {
      continue
    }
    const label = taskMatch[1].trim()
    const parts = taskMatch[2].split(',').map((p) => p.trim())
    const tags: string[] = []
    let id: string | undefined
    let startDay: number | null = null
    let afterId: string | undefined
    let endDay: number | null = null
    for (const part of parts) {
      if (/^(done|active|crit|milestone)$/i.test(part)) {
        tags.push(part.toLowerCase())
      } else if (/^after\s+/i.test(part)) {
        afterId = part.replace(/^after\s+/i, '').trim().split(/\s+/)[0]
      } else {
        const asDate = parseGanttDate(part, dateFormat)
        const asDur = parseDuration(part)
        if (startDay === null && afterId === undefined && asDate !== null) {
          startDay = asDate
        } else if (asDate !== null && startDay !== null) {
          endDay = asDate
        } else if (asDur !== null && endDay === null) {
          endDay = -asDur
        } else if (id === undefined && /^[A-Za-z]\w*$/.test(part)) {
          id = part
        }
      }
    }
    raws.push({ label, section, id, startDay, afterId, endDay, tags })
  }

  const byId = new Map<string, Raw>()
  for (const raw of raws) {
    if (raw.id) byId.set(raw.id, raw)
  }
  const resolve = (raw: Raw): { start: number; end: number } => {
    let start = raw.startDay
    if (start === null && raw.afterId) {
      const ref = byId.get(raw.afterId)
      if (ref) {
        start = resolve(ref).end
      }
    }
    if (start === null) {
      start = 0
    }
    let end: number
    if (raw.endDay === null) {
      end = start + 1
    } else if (raw.endDay < 0) {
      end = start - raw.endDay
    } else {
      end = raw.endDay
    }
    return { start, end }
  }

  const tasks: GanttTask[] = raws.map((raw) => {
    const { start, end } = resolve(raw)
    const dep = raw.afterId ? byId.get(raw.afterId)?.label : undefined
    return { id: raw.id, name: raw.label, startDay: start, endDay: end, deps: dep ? [dep] : [], section: raw.section || undefined, tags: raw.tags, pinned: raw.startDay !== null }
  })
  return { kind: 'gantt', title: title || undefined, tasks }
}

function parseGantt(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  return buildGanttView(ganttData(code), origin, style)
}

// ---------------------------------------------------------------------------
// User journey
// ---------------------------------------------------------------------------

const scoreColors = ['#e03131', '#f08c00', '#fab005', '#82c91e', '#2f9e44']

function parseJourney(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  type Task = { label: string; score: number; actors: string; section: string }
  const tasks: Task[] = []
  let title = ''
  let section = ''
  for (const line of cleanLines(code)) {
    const trimmed = line.trim()
    if (/^journey\b/i.test(trimmed)) {
      continue
    }
    const t = trimmed.match(/^title\s+(.+)$/i)
    if (t) {
      title = t[1].trim()
      continue
    }
    const s = trimmed.match(/^section\s+(.+)$/i)
    if (s) {
      section = s[1].trim()
      continue
    }
    const task = trimmed.match(/^(.+?)\s*:\s*(\d+)\s*:\s*(.+)$/)
    if (task) {
      tasks.push({ label: task[1].trim(), score: Number(task[2]), actors: task[3].trim(), section })
    }
  }
  if (tasks.length === 0) {
    return []
  }
  const elements: SketchElement[] = []
  const boxW = 130
  const boxH = 64
  const gap = 28
  if (title) {
    elements.push(textEl(origin.x, origin.y - 30, title, 18, style))
  }
  let lastSection = ''
  const boxes: SketchElement[] = []
  tasks.forEach((task, i) => {
    const x = origin.x + i * (boxW + gap)
    if (task.section && task.section !== lastSection) {
      elements.push(textEl(x, origin.y - 4, task.section, 13, style, { stroke: token('muted') }))
      lastSection = task.section
    }
    const box = rectEl(x, origin.y + 22, boxW, boxH, style, {
      label: `${task.label}\n${'★'.repeat(task.score)} ${task.actors}`,
      labelFontSize: 12,
      fill: literal(scoreColors[Math.max(0, Math.min(4, task.score - 1))]),
      fillStyle: 'solid',
      fillOpacity: 0.35,
    })
    boxes.push(box)
    elements.push(box)
  })
  for (let i = 0; i < boxes.length - 1; i += 1) {
    const a = boxes[i]
    const b = boxes[i + 1]
    elements.push(arrowEl(a.x + a.width, a.y + a.height / 2, b.x, b.y + b.height / 2, style, { endArrowhead: 'arrow' }))
  }
  return elements
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function parseTimeline(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  type Period = { time: string; events: string[] }
  const periods: Period[] = []
  let title = ''
  for (const line of cleanLines(code)) {
    const trimmed = line.trim()
    if (/^timeline\b/i.test(trimmed)) {
      continue
    }
    const t = trimmed.match(/^title\s+(.+)$/i)
    if (t) {
      title = t[1].trim()
      continue
    }
    if (/^section\s+/i.test(trimmed)) {
      continue
    }
    const parts = trimmed.split(':').map((p) => p.trim()).filter(Boolean)
    if (parts.length >= 2) {
      periods.push({ time: parts[0], events: parts.slice(1) })
    } else if (parts.length === 1 && periods.length) {
      periods[periods.length - 1].events.push(parts[0])
    }
  }
  if (periods.length === 0) {
    return []
  }
  const elements: SketchElement[] = []
  const colW = 170
  const axisY = origin.y + 40
  if (title) {
    elements.push(textEl(origin.x, origin.y - 20, title, 18, style))
  }
  // Horizontal axis line.
  elements.push(lineEl(origin.x, axisY, origin.x + periods.length * colW, axisY, style, { stroke: token('muted'), strokeWidth: 2 }))
  periods.forEach((period, i) => {
    const cx = origin.x + i * colW + colW / 2
    elements.push(ellipseEl(cx - 6, axisY - 6, 12, 12, style, { fill: token('accent'), fillStyle: 'solid', stroke: token('accent') }))
    elements.push(textEl(cx - period.time.length * 4, axisY - 28, period.time, 14, style, { align: 'center' }))
    const box = rectEl(origin.x + i * colW + 12, axisY + 24, colW - 24, 30 + period.events.length * 16, style, {
      label: period.events.join('\n'),
      labelFontSize: 12,
      fill: token('surface'),
      fillStyle: 'solid',
    })
    elements.push(box)
    elements.push(lineEl(cx, axisY, cx, box.y, style, { stroke: token('muted') }))
  })
  return elements
}

// ---------------------------------------------------------------------------
// Quadrant chart
// ---------------------------------------------------------------------------

function parseQuadrant(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  let title = ''
  let xAxis = ''
  let yAxis = ''
  const quadrants: string[] = ['', '', '', '']
  const points: Array<{ label: string; x: number; y: number }> = []
  for (const line of cleanLines(code)) {
    const trimmed = line.trim()
    if (/^quadrantChart\b/i.test(trimmed)) {
      continue
    }
    let m: RegExpMatchArray | null
    if ((m = trimmed.match(/^title\s+(.+)$/i))) {
      title = m[1].trim()
    } else if ((m = trimmed.match(/^x-axis\s+(.+)$/i))) {
      xAxis = m[1].replace(/-->/g, '→').trim()
    } else if ((m = trimmed.match(/^y-axis\s+(.+)$/i))) {
      yAxis = m[1].replace(/-->/g, '→').trim()
    } else if ((m = trimmed.match(/^quadrant-([1-4])\s+(.+)$/i))) {
      quadrants[Number(m[1]) - 1] = m[2].trim()
    } else if ((m = trimmed.match(/^(.+?):\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]$/))) {
      points.push({ label: m[1].trim(), x: Number(m[2]), y: Number(m[3]) })
    }
  }
  const size = 320
  const elements: SketchElement[] = []
  const ox = origin.x
  const oy = origin.y
  if (title) {
    elements.push(textEl(ox, oy - 26, title, 17, style, { align: 'center' }))
  }
  elements.push(rectEl(ox, oy, size, size, style, { roundness: 0, fill: token('surface'), fillStyle: 'solid', fillOpacity: 0.3 }))
  elements.push(lineEl(ox, oy + size / 2, ox + size, oy + size / 2, style, { stroke: token('muted') }))
  elements.push(lineEl(ox + size / 2, oy, ox + size / 2, oy + size, style, { stroke: token('muted') }))
  // Quadrant labels (q1 top-right, q2 top-left, q3 bottom-left, q4 bottom-right).
  const qpos = [
    { x: ox + size * 0.75, y: oy + size * 0.25 },
    { x: ox + size * 0.25, y: oy + size * 0.25 },
    { x: ox + size * 0.25, y: oy + size * 0.75 },
    { x: ox + size * 0.75, y: oy + size * 0.75 },
  ]
  quadrants.forEach((label, i) => {
    if (label) {
      elements.push(textEl(qpos[i].x - label.length * 3, qpos[i].y, label, 12, style, { align: 'center', stroke: token('muted') }))
    }
  })
  if (xAxis) {
    elements.push(textEl(ox + size / 2 - xAxis.length * 3.5, oy + size + 8, xAxis, 12, style, { align: 'center' }))
  }
  if (yAxis) {
    elements.push(textEl(ox - 12, oy + size / 2, yAxis, 12, style, { align: 'center', angle: -Math.PI / 2 }))
  }
  for (const point of points) {
    const px = ox + point.x * size
    const py = oy + (1 - point.y) * size
    elements.push(ellipseEl(px - 6, py - 6, 12, 12, style, { fill: token('accent'), fillStyle: 'solid', stroke: token('accent') }))
    elements.push(textEl(px + 8, py - 8, point.label, 12, style))
  }
  return elements
}

// ---------------------------------------------------------------------------
// Git graph
// ---------------------------------------------------------------------------

function parseGitGraph(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  const laneOf = new Map<string, number>()
  laneOf.set('main', 0)
  let current = 'main'
  const commits: Array<{ branch: string; x: number; label: string }> = []
  const lastOnBranch = new Map<string, { x: number; lane: number }>()
  const branchLinks: Array<{ from: { x: number; lane: number }; to: { x: number; lane: number } }> = []
  let x = 0

  const ensureLane = (name: string): number => {
    if (!laneOf.has(name)) {
      laneOf.set(name, laneOf.size)
    }
    return laneOf.get(name)!
  }

  for (const line of cleanLines(code)) {
    const trimmed = line.trim()
    if (/^gitGraph\b/i.test(trimmed) || trimmed === '') {
      continue
    }
    let m: RegExpMatchArray | null
    if ((m = trimmed.match(/^commit(?:\s+id:\s*"([^"]*)")?/i))) {
      x += 1
      const lane = ensureLane(current)
      commits.push({ branch: current, x, label: m[1] ?? '' })
      const prev = lastOnBranch.get(current)
      if (prev) {
        branchLinks.push({ from: prev, to: { x, lane } })
      }
      lastOnBranch.set(current, { x, lane })
    } else if ((m = trimmed.match(/^branch\s+(\S+)/i))) {
      const lane = ensureLane(m[1])
      const parent = lastOnBranch.get(current)
      if (parent) {
        lastOnBranch.set(m[1], parent)
      } else {
        lastOnBranch.set(m[1], { x, lane })
      }
    } else if ((m = trimmed.match(/^checkout\s+(\S+)/i))) {
      current = m[1]
      ensureLane(current)
    } else if ((m = trimmed.match(/^merge\s+(\S+)/i))) {
      x += 1
      const lane = ensureLane(current)
      const source = lastOnBranch.get(m[1])
      const prev = lastOnBranch.get(current)
      commits.push({ branch: current, x, label: `merge ${m[1]}` })
      if (prev) {
        branchLinks.push({ from: prev, to: { x, lane } })
      }
      if (source) {
        branchLinks.push({ from: source, to: { x, lane } })
      }
      lastOnBranch.set(current, { x, lane })
    }
  }

  if (commits.length === 0) {
    return []
  }
  const elements: SketchElement[] = []
  const stepX = 70
  const laneH = 64
  const r = 12
  // Branch name labels.
  for (const [name, lane] of laneOf) {
    elements.push(textEl(origin.x - 4, origin.y + lane * laneH + r - 8, name, 12, style, { stroke: token('muted') }))
  }
  for (const link of branchLinks) {
    elements.push(
      lineEl(origin.x + 60 + link.from.x * stepX + r, origin.y + link.from.lane * laneH + r, origin.x + 60 + link.to.x * stepX + r, origin.y + link.to.lane * laneH + r, style, { stroke: token('muted'), strokeWidth: 2 }),
    )
  }
  for (const commit of commits) {
    const lane = laneOf.get(commit.branch) ?? 0
    const cx = origin.x + 60 + commit.x * stepX
    const cy = origin.y + lane * laneH
    elements.push(ellipseEl(cx, cy, r * 2, r * 2, style, { fill: token('accent'), fillStyle: 'solid', stroke: token('accent') }))
    if (commit.label) {
      elements.push(textEl(cx - 4, cy + r * 2 + 2, commit.label, 11, style))
    }
  }
  return elements
}

// ---------------------------------------------------------------------------
// Sankey (sankey-beta) — CSV source,target,value
// ---------------------------------------------------------------------------

function parseSankey(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  let maxValue = 1
  const ensure = (id: string) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label: id, shape: 'rectangle' })
    }
    return id
  }
  for (const line of cleanLines(code)) {
    const trimmed = line.trim()
    if (/^sankey(-beta)?\b/i.test(trimmed)) {
      continue
    }
    const cells = trimmed.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    if (cells.length >= 3 && cells[2] !== '' && !Number.isNaN(Number(cells[2]))) {
      const value = Number(cells[2])
      maxValue = Math.max(maxValue, value)
      ensure(cells[0])
      ensure(cells[1])
      edges.push({ from: cells[0], to: cells[1], label: String(value), arrow: false })
    }
  }
  if (nodes.size === 0) {
    return []
  }
  const elements = finishGraph([...nodes.values()], edges, 'LR', origin, style)
  // Thicken connectors by relative value.
  return elements.map((element) => {
    if (element.type === 'arrow' && element.label) {
      const value = Number(element.label)
      const width = Math.max(1, Math.round((value / maxValue) * 8))
      return { ...element, strokeWidth: width }
    }
    return element
  })
}

// ---------------------------------------------------------------------------
// XY chart (xychart-beta) — bars and/or lines (scatter = line points)
// ---------------------------------------------------------------------------

function parseXychart(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  let title = ''
  let categories: string[] = []
  let yLabel = ''
  let yMin = 0
  let yMax = 0
  const bars: number[][] = []
  const lines: number[][] = []
  for (const line of cleanLines(code)) {
    const trimmed = line.trim()
    if (/^xychart(-beta)?\b/i.test(trimmed)) {
      continue
    }
    let m: RegExpMatchArray | null
    if ((m = trimmed.match(/^title\s+"?([^"]+)"?$/i))) {
      title = m[1].trim()
    } else if ((m = trimmed.match(/^x-axis\s+\[(.+)\]$/i))) {
      categories = m[1].split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    } else if ((m = trimmed.match(/^y-axis\s+"?([^"\d]*)"?\s*([\d.]+)?\s*-->\s*([\d.]+)?/i))) {
      yLabel = m[1].trim()
      if (m[2]) yMin = Number(m[2])
      if (m[3]) yMax = Number(m[3])
    } else if ((m = trimmed.match(/^bar\s+\[(.+)\]$/i))) {
      bars.push(m[1].split(',').map((v) => Number(v.trim())))
    } else if ((m = trimmed.match(/^line\s+\[(.+)\]$/i))) {
      lines.push(m[1].split(',').map((v) => Number(v.trim())))
    }
  }
  const allValues = [...bars.flat(), ...lines.flat()]
  if (allValues.length === 0) {
    return []
  }
  if (yMax === 0) {
    yMax = Math.max(...allValues)
  }
  const count = Math.max(categories.length, ...bars.map((b) => b.length), ...lines.map((l) => l.length))
  const chartW = Math.max(280, count * 70)
  const chartH = 240
  const ox = origin.x + 30
  const oy = origin.y
  const elements: SketchElement[] = []
  const yToPx = (v: number) => oy + chartH - ((v - yMin) / (yMax - yMin || 1)) * chartH
  const xOf = (i: number) => ox + (i + 0.5) * (chartW / count)

  if (title) {
    elements.push(textEl(ox, oy - 24, title, 17, style))
  }
  // Axes.
  elements.push(lineEl(ox, oy, ox, oy + chartH, style, { stroke: token('muted'), strokeWidth: 2 }))
  elements.push(lineEl(ox, oy + chartH, ox + chartW, oy + chartH, style, { stroke: token('muted'), strokeWidth: 2 }))
  if (yLabel) {
    elements.push(textEl(origin.x - 6, oy + chartH / 2, yLabel, 12, style, { align: 'center', angle: -Math.PI / 2, stroke: token('muted') }))
  }
  categories.forEach((c, i) => {
    elements.push(textEl(xOf(i) - c.length * 3.2, oy + chartH + 6, c, 11, style, { align: 'center', stroke: token('muted') }))
  })
  // Bars.
  const barW = (chartW / count) * 0.5
  for (const series of bars) {
    series.forEach((v, i) => {
      const top = yToPx(v)
      elements.push(rectEl(xOf(i) - barW / 2, top, barW, oy + chartH - top, style, { roundness: 3, fill: token('accent'), fillStyle: 'solid', stroke: token('accent') }))
    })
  }
  // Lines (+ points, so this also covers scatter).
  for (const series of lines) {
    const pts = series.map((v, i) => ({ x: xOf(i), y: yToPx(v) }))
    for (let i = 0; i < pts.length - 1; i += 1) {
      elements.push(lineEl(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, style, { stroke: literal('#e8590c'), strokeWidth: 2 }))
    }
    for (const p of pts) {
      elements.push(ellipseEl(p.x - 5, p.y - 5, 10, 10, style, { fill: literal('#e8590c'), fillStyle: 'solid', stroke: literal('#e8590c') }))
    }
  }
  return elements
}

// ---------------------------------------------------------------------------
// Requirement diagram
// ---------------------------------------------------------------------------

function parseRequirement(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const lines = cleanLines(code)
  let current: { id: string; rows: string[]; kind: string } | null = null
  const flush = () => {
    if (current) {
      const label = `«${current.kind}»\n${current.id}\n${current.rows.join('\n')}`
      nodes.set(current.id, { id: current.id, label, shape: 'rectangle' })
      current = null
    }
  }
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^requirementDiagram\b/i.test(trimmed)) {
      continue
    }
    const open = trimmed.match(/^(requirement|functionalRequirement|performanceRequirement|element)\s+(\S+)\s*\{?$/i)
    if (open) {
      flush()
      current = { id: open[2], rows: [], kind: open[1] }
      continue
    }
    if (trimmed === '}') {
      flush()
      continue
    }
    if (current) {
      if (trimmed) {
        current.rows.push(trimmed)
      }
      continue
    }
    // relationship: `a - satisfies -> b`  or  `a -> b : satisfies`
    const rel1 = trimmed.match(/^(\S+)\s*-\s*(\w+)\s*->\s*(\S+)$/)
    const rel2 = trimmed.match(/^(\S+)\s*->\s*(\S+)\s*:\s*(\w+)$/)
    if (rel1) {
      edges.push({ from: rel1[1], to: rel1[3], label: rel1[2], arrow: true })
    } else if (rel2) {
      edges.push({ from: rel2[1], to: rel2[2], label: rel2[3], arrow: true })
    }
  }
  flush()
  if (nodes.size === 0 && edges.length === 0) {
    return []
  }
  // Ensure endpoints exist as nodes.
  for (const edge of edges) {
    if (!nodes.has(edge.from)) nodes.set(edge.from, { id: edge.from, label: edge.from, shape: 'rectangle' })
    if (!nodes.has(edge.to)) nodes.set(edge.to, { id: edge.to, label: edge.to, shape: 'rectangle' })
  }
  return finishGraph([...nodes.values()], edges, 'TD', origin, style, { nodeWidth: 180, nodeHeight: 96 })
}

// ---------------------------------------------------------------------------
// Kanban
// ---------------------------------------------------------------------------

function parseKanban(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  const columns: Array<{ title: string; cards: string[] }> = []
  for (const line of cleanLines(code)) {
    const trimmed = line.trim()
    if (/^kanban\b/i.test(trimmed)) {
      continue
    }
    const indent = line.length - line.trimStart().length
    const label = mindmapLabel(trimmed)
    if (indent <= 2) {
      columns.push({ title: label, cards: [] })
    } else if (columns.length) {
      columns[columns.length - 1].cards.push(label)
    }
  }
  if (columns.length === 0) {
    return []
  }
  const elements: SketchElement[] = []
  const colW = 180
  const gap = 20
  const cardH = 56
  columns.forEach((column, i) => {
    const x = origin.x + i * (colW + gap)
    const height = 60 + Math.max(1, column.cards.length) * (cardH + 12)
    elements.push(rectEl(x, origin.y, colW, height, style, { roundness: 10, fill: token('surface'), fillStyle: 'solid' }))
    elements.push(textEl(x + 14, origin.y + 12, column.title, 15, style))
    column.cards.forEach((card, c) => {
      elements.push(rectEl(x + 14, origin.y + 48 + c * (cardH + 12), colW - 28, cardH, style, { roundness: 8, fill: token('canvas'), fillStyle: 'solid', label: card, labelFontSize: 13 }))
    })
  })
  return elements
}

// ---------------------------------------------------------------------------
// Generic fallback — pull any "A --> B" edges out of an unknown diagram.
// ---------------------------------------------------------------------------

function parseGenericGraph(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const ensure = (id: string) => {
    const clean = id.trim().replace(/^["']|["']$/g, '')
    if (!clean) {
      return null
    }
    if (!nodes.has(clean)) {
      nodes.set(clean, { id: clean, label: clean, shape: 'rectangle' })
    }
    return clean
  }
  for (const line of cleanLines(code).slice(1)) {
    const m = line.match(/^\s*([\w"' ]+?)\s*(--+>?|==+>?|-\.->?|->)\s*([\w"' ]+?)\s*(?::\s*(.+))?$/)
    if (m) {
      const from = ensure(m[1])
      const to = ensure(m[3])
      if (from && to) {
        edges.push({ from, to, label: m[4]?.trim(), arrow: m[2].includes('>') })
      }
    }
  }
  return finishGraph([...nodes.values()], edges, 'TD', origin, style)
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/** Parse Mermaid text into editable sketch elements (dispatches by diagram type). */
export function mermaidToElements(code: string, origin: Point = { x: 0, y: 0 }, style: DrawStyle = 'soft'): SketchElement[] {
  const head = (code.trim().match(/^\s*([A-Za-z-]+)/)?.[1] ?? '').toLowerCase()
  if (head.startsWith('sequence')) {
    return parseSequence(code, origin, style)
  }
  if (head === 'classdiagram') {
    return parseClass(code, origin, style)
  }
  if (head.startsWith('state')) {
    return parseState(code, origin, style)
  }
  if (head === 'erdiagram') {
    return parseEr(code, origin, style)
  }
  if (head === 'mindmap') {
    return parseMindmap(code, origin, style)
  }
  if (head === 'pie') {
    return parsePie(code, origin, style)
  }
  if (head === 'gantt') {
    return parseGantt(code, origin, style)
  }
  if (head === 'journey') {
    return parseJourney(code, origin, style)
  }
  if (head === 'timeline') {
    return parseTimeline(code, origin, style)
  }
  if (head === 'quadrantchart') {
    return parseQuadrant(code, origin, style)
  }
  if (head === 'gitgraph') {
    return parseGitGraph(code, origin, style)
  }
  if (head.startsWith('sankey')) {
    return parseSankey(code, origin, style)
  }
  if (head.startsWith('xychart')) {
    return parseXychart(code, origin, style)
  }
  if (head === 'requirementdiagram') {
    return parseRequirement(code, origin, style)
  }
  if (head === 'kanban') {
    return parseKanban(code, origin, style)
  }
  if (head === 'graph' || head === 'flowchart') {
    return parseFlowchart(code, origin, style)
  }
  // Unknown/exotic diagram (block, c4, packet, architecture, radar, …):
  // best-effort — extract any A-->B edges so it still imports something.
  const generic = parseGenericGraph(code, origin, style)
  return generic.length > 0 ? generic : parseFlowchart(code, origin, style)
}

// ---------------------------------------------------------------------------
// Structured-data extraction (for view-switching): produce DiagramData for the
// convertible diagram families. Returns null for kinds we only bake to shapes.
// ---------------------------------------------------------------------------

/** Parse Mermaid into a retained data model + a suggested default view, when
 *  the diagram type supports re-viewing as other chart types. */
export function mermaidToData(code: string): { data: DiagramData; view: ViewId } | null {
  const head = (code.trim().match(/^\s*([A-Za-z-]+)/)?.[1] ?? '').toLowerCase()
  if (head === 'graph' || head === 'flowchart') {
    const { graph, direction } = flowchartGraph(code)
    if (graph.nodes.length === 0) return null
    return { data: graph, view: direction === 'LR' || direction === 'RL' ? 'flow-lr' : 'flow-td' }
  }
  if (head === 'gantt') {
    const data = ganttData(code)
    if (data.tasks.length === 0) return null
    return { data, view: 'gantt' }
  }
  if (head === 'pie') {
    const data = pieSeries(code)
    if (data.items.length === 0) return null
    return { data, view: 'pie' }
  }
  return null
}
