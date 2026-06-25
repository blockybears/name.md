import { graphToElements, layeredLayout, type GraphEdge, type GraphNode, type LayoutDirection, type NodeShape } from './graphLayout'
import { createElement, generateId } from './scene'
import { literal, token, type DrawStyle, type Point, type SketchElement } from './types'

/** Heuristic: does this text look like a Mermaid diagram we can import? */
export function looksLikeMermaid(text: string): boolean {
  return /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|mindmap|pie|gantt)\b/i.test(text)
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

function parseFlowchart(code: string, origin: Point, style: DrawStyle): SketchElement[] {
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
  return finishGraph([...nodes.values()], edges, direction, origin, style)
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
    if (/^stateDiagram(-v2)?\b/i.test(trimmed) || /^(direction|note|state)\b/i.test(trimmed) || trimmed === '}') {
      // `state X as "label"` aliasing.
      const alias = trimmed.match(/^state\s+"([^"]+)"\s+as\s+(\w+)/i)
      if (alias) {
        nodes.set(alias[2], { id: alias[2], label: alias[1], shape: 'rounded' })
      }
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

function parseClass(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  const members = new Map<string, string[]>()
  const order: string[] = []
  const edges: GraphEdge[] = []
  const ensure = (id: string) => {
    if (!members.has(id)) {
      members.set(id, [])
      order.push(id)
    }
  }

  const lines = cleanLines(code)
  let current: string | null = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^classDiagram\b/i.test(trimmed)) {
      continue
    }
    // class Name { ... }  (members may span following lines until })
    const open = trimmed.match(/^class\s+(\w+)\s*\{?\s*$/) || trimmed.match(/^class\s+(\w+)\s*\{(.+)\}\s*$/)
    if (open) {
      ensure(open[1])
      if (open[2]) {
        for (const m of open[2].split(/\n|;/)) {
          if (m.trim()) {
            members.get(open[1])!.push(m.trim())
          }
        }
        current = null
      } else if (trimmed.endsWith('{')) {
        current = open[1]
      }
      continue
    }
    if (trimmed === '}') {
      current = null
      continue
    }
    if (current) {
      members.get(current)!.push(trimmed)
      continue
    }
    // Name : member
    const member = trimmed.match(/^(\w+)\s*:\s*(.+)$/)
    if (member && !classRelations.some((r) => trimmed.includes(r.token))) {
      ensure(member[1])
      members.get(member[1])!.push(member[2].trim())
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
    const label = list.length ? `${id}\n${'─'.repeat(Math.min(12, id.length + 2))}\n${list.join('\n')}` : id
    return { id, label, shape: 'rectangle' }
  })
  const maxMembers = Math.max(0, ...order.map((id) => members.get(id)?.length ?? 0))
  return finishGraph(nodes, edges, 'TD', origin, style, { nodeWidth: 180, nodeHeight: 50 + maxMembers * 18 })
}

// ---------------------------------------------------------------------------
// Pie chart (rendered as editable polygon sectors)
// ---------------------------------------------------------------------------

const pieColors = ['#e03131', '#1971c2', '#2f9e44', '#f08c00', '#9c36b5', '#0c8599', '#e8590c', '#fab005']

function parsePie(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  const slices: Array<{ label: string; value: number }> = []
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
      slices.push({ label: unquote(slice[1]), value: Number(slice[2]) })
    }
  }
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  if (total <= 0) {
    return []
  }

  const cx = 160
  const cy = 160
  const radius = 140
  const elements: SketchElement[] = []
  let angle = -Math.PI / 2

  if (title) {
    elements.push(
      createElement(
        { type: 'text', id: generateId('title'), x: origin.x, y: origin.y - 30, width: title.length * 12, height: 24, text: title, fontSize: 18 },
        style,
      ),
    )
  }

  slices.forEach((slice, i) => {
    const sweep = (slice.value / total) * Math.PI * 2
    const steps = Math.max(2, Math.ceil((sweep / (Math.PI / 2)) * 6))
    const abs: Point[] = [{ x: cx, y: cy }]
    for (let t = 0; t <= steps; t += 1) {
      const a = angle + sweep * (t / steps)
      abs.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius })
    }
    const minX = Math.min(...abs.map((p) => p.x))
    const minY = Math.min(...abs.map((p) => p.y))
    elements.push(
      createElement(
        {
          type: 'polygon',
          id: generateId('slice'),
          x: origin.x + minX,
          y: origin.y + minY,
          width: Math.max(...abs.map((p) => p.x)) - minX,
          height: Math.max(...abs.map((p) => p.y)) - minY,
          points: abs.map((p) => ({ x: p.x - minX, y: p.y - minY })),
          fill: literal(pieColors[i % pieColors.length]),
          fillStyle: 'solid',
          stroke: token('surface'),
        },
        style,
      ),
    )
    // Label near the slice's mid radius.
    const mid = angle + sweep / 2
    const lx = cx + Math.cos(mid) * radius * 1.18
    const ly = cy + Math.sin(mid) * radius * 1.18
    const text = `${slice.label} (${slice.value})`
    elements.push(
      createElement(
        { type: 'text', id: generateId('lbl'), x: origin.x + lx - text.length * 3.5, y: origin.y + ly - 9, width: text.length * 7, height: 18, text, fontSize: 13, align: 'center' },
        style,
      ),
    )
    angle += sweep
  })
  return elements
}

// ---------------------------------------------------------------------------
// Sequence diagram
// ---------------------------------------------------------------------------

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
  const messages: Array<{ from: string; to: string; text: string; dashed: boolean; arrow: boolean }> = []

  for (const line of cleanLines(code)) {
    const trimmed = line.trim()
    if (/^sequenceDiagram\b/i.test(trimmed)) {
      continue
    }
    const participant = trimmed.match(/^(?:participant|actor)\s+(\w+)(?:\s+as\s+(.+))?$/i)
    if (participant) {
      ensureActor(participant[1], participant[2] ? unquote(participant[2]) : undefined)
      continue
    }
    const message = trimmed.match(/^(\w+)\s*(-{1,2}>>?|-{1,2}[x)]|-{1,2}>)\s*(\w+)\s*:\s*(.*)$/)
    if (message) {
      ensureActor(message[1])
      ensureActor(message[3])
      const op = message[2]
      messages.push({
        from: message[1],
        to: message[3],
        text: message[4].trim(),
        dashed: op.includes('--'),
        arrow: op.includes('>>') || op.includes('>') || op.includes('x') || op.includes(')'),
      })
    }
  }

  if (actors.length === 0) {
    return []
  }

  const spacing = 180
  const boxW = 130
  const boxH = 50
  const top = 0
  const firstMsgY = boxH + 44
  const msgGap = 46
  const bottom = firstMsgY + messages.length * msgGap + 20
  const centerX = (i: number) => i * spacing + boxW / 2

  const elements: SketchElement[] = []
  actors.forEach((id, i) => {
    elements.push(
      createElement(
        { type: 'rectangle', id: generateId('actor'), x: origin.x + i * spacing, y: origin.y + top, width: boxW, height: boxH, label: labels.get(id) ?? id, labelFontSize: 14, fill: token('surface'), fillStyle: 'solid', roundness: 6 },
        style,
      ),
    )
    const cx = origin.x + centerX(i)
    elements.push(
      createElement(
        { type: 'line', id: generateId('life'), x: cx, y: origin.y + boxH, width: 0, height: bottom - boxH, points: [{ x: 0, y: 0 }, { x: 0, y: bottom - boxH }], stroke: token('muted'), strokeStyle: 'dashed' },
        style,
      ),
    )
  })

  messages.forEach((message, k) => {
    const fromI = actors.indexOf(message.from)
    const toI = actors.indexOf(message.to)
    const y = origin.y + firstMsgY + k * msgGap
    const x1 = origin.x + centerX(fromI)
    const x2 = origin.x + centerX(toI)
    const minX = Math.min(x1, x2)
    elements.push(
      createElement(
        {
          type: 'arrow',
          id: generateId('msg'),
          x: minX,
          y,
          width: Math.abs(x2 - x1),
          height: 0,
          points: [{ x: x1 - minX, y: 0 }, { x: x2 - minX, y: 0 }],
          strokeStyle: message.dashed ? 'dashed' : 'solid',
          endArrowhead: message.arrow ? 'triangle' : 'none',
          label: message.text,
          labelFontSize: 12,
        },
        style,
      ),
    )
  })
  return elements
}

// ---------------------------------------------------------------------------
// Gantt (approximate — bars by duration, no real date axis)
// ---------------------------------------------------------------------------

function parseGantt(code: string, origin: Point, style: DrawStyle): SketchElement[] {
  const elements: SketchElement[] = []
  const rowH = 30
  const labelW = 140
  const unit = 26 // px per day
  let title = ''
  type Task = { label: string; section: string; duration: number }
  const tasks: Task[] = []
  let section = ''

  for (const line of cleanLines(code)) {
    const trimmed = line.trim()
    if (/^gantt\b/i.test(trimmed) || /^(dateFormat|axisFormat|excludes|todayMarker)\b/i.test(trimmed)) {
      continue
    }
    const titleMatch = trimmed.match(/^title\s+(.+)$/i)
    if (titleMatch) {
      title = titleMatch[1].trim()
      continue
    }
    const sectionMatch = trimmed.match(/^section\s+(.+)$/i)
    if (sectionMatch) {
      section = sectionMatch[1].trim()
      continue
    }
    const taskMatch = trimmed.match(/^(.+?)\s*:\s*(.+)$/)
    if (taskMatch) {
      const meta = taskMatch[2]
      const dur = meta.match(/(\d+)\s*d\b/)
      tasks.push({ label: taskMatch[1].trim(), section, duration: dur ? Number(dur[1]) : 3 })
    }
  }
  if (tasks.length === 0) {
    return []
  }

  if (title) {
    elements.push(createElement({ type: 'text', id: generateId('t'), x: origin.x, y: origin.y - 26, width: title.length * 11, height: 22, text: title, fontSize: 17 }, style))
  }

  let cursor = 0
  tasks.forEach((task, i) => {
    const y = origin.y + i * (rowH + 8)
    elements.push(createElement({ type: 'text', id: generateId('lbl'), x: origin.x, y: y + 6, width: labelW - 8, height: rowH, text: task.label, fontSize: 13 }, style))
    elements.push(
      createElement(
        {
          type: 'rectangle',
          id: generateId('bar'),
          x: origin.x + labelW + cursor * unit,
          y,
          width: Math.max(unit, task.duration * unit),
          height: rowH,
          label: `${task.duration}d`,
          labelFontSize: 12,
          fill: token('accent'),
          fillStyle: 'solid',
          stroke: token('accent'),
          roundness: 5,
        },
        style,
      ),
    )
    // Cascade the next task to start partway through this one.
    cursor += Math.max(1, Math.round(task.duration * 0.6))
  })
  return elements
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
  return parseFlowchart(code, origin, style)
}
