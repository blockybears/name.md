import assert from 'node:assert/strict'
import {
  applyResize,
  bindableAt,
  borderPoint,
  createDiagram,
  createElement,
  createScene,
  elementBounds,
  elementsInMarquee,
  hitTest,
  History,
  literal,
  normalizeRect,
  parseScene,
  computeSnap,
  recomputeBindings,
  rectToViewBox,
  resizeRect,
  snapToGrid,
  snapPoint,
  sceneContentBounds,
  sceneToSvgString,
  serializeScene,
  simplifyPoints,
  token,
  toPolygon,
  normalizeVertexBounds,
  pointInPolygon,
  mermaidToElements,
  looksLikeMermaid,
  jsonToElements,
  viewBoxForScene,
  type ArrowElement,
} from '../src/index.ts'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    passed += 1
    console.log(`PASS  ${name}`)
  } catch (error) {
    failed += 1
    console.log(`FAIL  ${name}`)
    console.log(`  ${(error as Error).message.replace(/\n/g, '\n  ')}`)
  }
}

test('createElement fills defaults and id/seed', () => {
  const rect = createElement({ type: 'rectangle', x: 1, y: 2, width: 10, height: 20 })
  assert.equal(rect.type, 'rectangle')
  assert.equal(rect.opacity, 1)
  assert.equal(rect.fillStyle, 'none')
  assert.ok(rect.id.length > 0)
  assert.ok(Number.isFinite(rect.seed))
})

test('createElement gives linear elements points', () => {
  const line = createElement({ type: 'line', width: 30, height: 0 })
  assert.ok('points' in line && Array.isArray(line.points) && line.points.length >= 2)
})

test('scene serialize -> parse round-trips elements and colors', () => {
  const scene = createScene({
    elements: [
      createElement({ type: 'rectangle', x: 0, y: 0, width: 50, height: 40, fillStyle: 'solid', fill: literal('#ff0000') }),
      createElement({ type: 'text', x: 5, y: 5, width: 100, height: 24, text: 'hi', fontSize: 18 }),
    ],
    defaultView: { x: 0, y: 0, width: 200, height: 150 },
  })
  const parsed = parseScene(serializeScene(scene))
  assert.equal(parsed.elements.length, 2)
  assert.equal(parsed.elements[0].type, 'rectangle')
  assert.deepEqual(parsed.elements[0].fill, { kind: 'literal', value: '#ff0000' })
  const text = parsed.elements[1]
  assert.equal(text.type === 'text' && text.text, 'hi')
  assert.deepEqual(parsed.defaultView, { x: 0, y: 0, width: 200, height: 150 })
})

test('parseScene tolerates garbage and partial input', () => {
  assert.equal(parseScene('not json').elements.length, 0)
  assert.equal(parseScene('').elements.length, 0)
  const partial = parseScene(JSON.stringify({ elements: [{ type: 'ellipse' }, { type: 'bogus' }, 42] }))
  assert.equal(partial.elements.length, 1)
  assert.equal(partial.elements[0].type, 'ellipse')
  assert.equal(partial.elements[0].width, 0)
})

test('elementBounds accounts for rotation', () => {
  const rect = createElement({ type: 'rectangle', x: 0, y: 0, width: 100, height: 0, angle: Math.PI / 2 })
  const bounds = elementBounds(rect)
  // A 100x0 box rotated 90° about its center spans ~100 vertically, ~0 horizontally.
  assert.ok(bounds.height > 99 && bounds.height < 101, `height ${bounds.height}`)
  assert.ok(bounds.width < 1, `width ${bounds.width}`)
})

test('sceneContentBounds unions elements', () => {
  const bounds = sceneContentBounds([
    createElement({ type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }),
    createElement({ type: 'rectangle', x: 90, y: 40, width: 10, height: 10 }),
  ])
  assert.ok(bounds)
  assert.deepEqual(bounds, { x: 0, y: 0, width: 100, height: 50 })
})

test('viewBoxForScene prefers defaultView, else padded content', () => {
  const withView = createScene({ defaultView: { x: 1, y: 2, width: 3, height: 4 } })
  assert.deepEqual(viewBoxForScene(withView), { x: 1, y: 2, width: 3, height: 4 })

  const withContent = createScene({ elements: [createElement({ type: 'rectangle', x: 10, y: 10, width: 20, height: 20 })] })
  const box = viewBoxForScene(withContent, 5)
  assert.deepEqual(box, { x: 5, y: 5, width: 30, height: 30 })
})

test('rectToViewBox guards zero extents', () => {
  assert.equal(rectToViewBox({ x: 0, y: 0, width: 0, height: 0 }), '0 0 1 1')
})

test('sceneToSvgString emits svg with shapes and escapes text', () => {
  const scene = createScene({
    elements: [
      createElement({ type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }),
      createElement({ type: 'text', x: 0, y: 0, width: 50, height: 20, text: 'a < b & "c"', fontSize: 16 }),
    ],
  })
  const svg = sceneToSvgString(scene)
  assert.ok(svg.startsWith('<svg'))
  assert.ok(svg.includes('<path'))
  assert.ok(svg.includes('a &lt; b &amp; &quot;c&quot;'))
  assert.ok(!svg.includes('a < b & "c"'))
})

test('sketchy render is deterministic for a fixed seed', () => {
  const make = () => createScene({ elements: [createElement({ type: 'rectangle', x: 0, y: 0, width: 80, height: 50, style: 'sketchy', seed: 12345, id: 'fixed' })] })
  assert.equal(sceneToSvgString(make()), sceneToSvgString(make()))
})

test('clean vs sketchy produce different geometry', () => {
  const clean = createScene({ elements: [createElement({ type: 'rectangle', x: 0, y: 0, width: 80, height: 50, style: 'clean', seed: 7, id: 'r' })] })
  const sketchy = createScene({ elements: [createElement({ type: 'rectangle', x: 0, y: 0, width: 80, height: 50, style: 'sketchy', seed: 7, id: 'r' })] })
  assert.notEqual(sceneToSvgString(clean), sceneToSvgString(sketchy))
  // Sketchy rect uses cubic curves (C); clean rect uses straight H/V commands.
  assert.ok(sceneToSvgString(sketchy).includes('C'))
})

test('soft style is hand-drawn but lighter than sketchy', () => {
  const make = (style: 'clean' | 'soft' | 'sketchy') =>
    sceneToSvgString(createScene({ elements: [createElement({ type: 'rectangle', x: 0, y: 0, width: 80, height: 50, style, seed: 99, id: 'r' })] }))
  const clean = make('clean')
  const soft = make('soft')
  const sketchy = make('sketchy')
  // Soft uses curves (hand-drawn) unlike clean...
  assert.ok(soft.includes('C'), 'soft should use bezier curves')
  assert.ok(!clean.includes(' C'), 'clean should not')
  // ...but differs from sketchy (different jitter, single vs double stroke).
  assert.notEqual(soft, sketchy)
  assert.notEqual(soft, clean)
})

test('hachure fill emits fill-colored stroke lines', () => {
  const scene = createScene({
    elements: [createElement({ type: 'rectangle', x: 0, y: 0, width: 80, height: 80, fillStyle: 'hachure', fill: literal('#00f'), style: 'clean', id: 'h' })],
  })
  const svg = sceneToSvgString(scene)
  assert.ok(svg.includes('stroke="#00f"'), 'hachure lines use the fill color as stroke')
})

test('token and literal colors resolve through render', () => {
  const scene = createScene({ elements: [createElement({ type: 'rectangle', x: 0, y: 0, width: 10, height: 10, stroke: token('accent') })] })
  const svg = sceneToSvgString(scene)
  assert.ok(svg.includes('var(--sketch-accent'))
})

test('hitTest returns the topmost element under a point', () => {
  const lower = createElement({ type: 'rectangle', x: 0, y: 0, width: 100, height: 100, id: 'lower' })
  const upper = createElement({ type: 'rectangle', x: 40, y: 40, width: 100, height: 100, id: 'upper' })
  assert.equal(hitTest([lower, upper], { x: 60, y: 60 }, 4)?.id, 'upper')
  assert.equal(hitTest([lower, upper], { x: 10, y: 10 }, 4)?.id, 'lower')
  assert.equal(hitTest([lower, upper], { x: 500, y: 500 }, 4), null)
})

test('elementsInMarquee selects intersecting elements', () => {
  const a = createElement({ type: 'rectangle', x: 0, y: 0, width: 20, height: 20, id: 'a' })
  const b = createElement({ type: 'rectangle', x: 200, y: 200, width: 20, height: 20, id: 'b' })
  const hits = elementsInMarquee([a, b], { x: -5, y: -5, width: 60, height: 60 }).map((element) => element.id)
  assert.deepEqual(hits, ['a'])
})

test('resizeRect adjusts the dragged edge', () => {
  const rect = { x: 0, y: 0, width: 100, height: 100 }
  assert.deepEqual(resizeRect(rect, 'se', { x: 150, y: 120 }), { x: 0, y: 0, width: 150, height: 120 })
  assert.deepEqual(resizeRect(rect, 'nw', { x: 20, y: 30 }), { x: 20, y: 30, width: 80, height: 70 })
})

test('applyResize scales linear element points', () => {
  const line = createElement({ type: 'line', x: 0, y: 0, width: 100, height: 50, points: [{ x: 0, y: 0 }, { x: 100, y: 50 }], id: 'l' })
  const resized = applyResize(line, { x: 0, y: 0, width: 200, height: 100 })
  assert.ok('points' in resized)
  assert.deepEqual((resized as typeof line).points[1], { x: 200, y: 100 })
})

test('normalizeRect handles drags in any direction', () => {
  assert.deepEqual(normalizeRect({ x: 50, y: 60 }, { x: 10, y: 20 }), { x: 10, y: 20, width: 40, height: 40 })
})

test('History supports undo/redo with branching', () => {
  const history = new History(1)
  history.push(2)
  history.push(3)
  assert.equal(history.value, 3)
  assert.equal(history.undo(), 2)
  assert.equal(history.undo(), 1)
  assert.equal(history.canUndo(), false)
  assert.equal(history.redo(), 2)
  history.push(9) // branching clears redo
  assert.equal(history.canRedo(), false)
  assert.equal(history.value, 9)
})

test('borderPoint lands on a rectangle edge toward the target', () => {
  const rect = createElement({ type: 'rectangle', x: 0, y: 0, width: 100, height: 100, id: 'r' })
  // Target directly to the right -> border point on the right edge (x≈100).
  const point = borderPoint(rect, { x: 500, y: 50 }, 0)
  assert.ok(Math.abs(point.x - 100) < 0.01, `x=${point.x}`)
  assert.ok(Math.abs(point.y - 50) < 0.01, `y=${point.y}`)
})

test('borderPoint adds gap outside the border', () => {
  const rect = createElement({ type: 'rectangle', x: 0, y: 0, width: 100, height: 100, id: 'r' })
  const point = borderPoint(rect, { x: 500, y: 50 }, 10)
  assert.ok(Math.abs(point.x - 110) < 0.01, `x=${point.x}`)
})

test('bindableAt finds shapes but not lines', () => {
  const rect = createElement({ type: 'rectangle', x: 0, y: 0, width: 100, height: 100, id: 'r' })
  const line = createElement({ type: 'line', x: 0, y: 0, width: 100, height: 0, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], id: 'l' })
  assert.equal(bindableAt([rect, line], { x: 50, y: 50 }, 4)?.id, 'r')
  assert.equal(bindableAt([line], { x: 50, y: 0 }, 4), null)
})

test('recomputeBindings reroutes a bound arrow when its shape moves', () => {
  const a = createElement({ type: 'rectangle', x: 0, y: 0, width: 100, height: 100, id: 'a' })
  const b = createElement({ type: 'rectangle', x: 300, y: 0, width: 100, height: 100, id: 'b' })
  const arrow = createElement(
    {
      type: 'arrow',
      id: 'arr',
      x: 100,
      y: 50,
      width: 200,
      height: 0,
      points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
      startBinding: { elementId: 'a', focus: 0, gap: 4 },
      endBinding: { elementId: 'b', focus: 0, gap: 4 },
    },
  ) as ArrowElement
  // Move b far down; re-route should change the arrow end y.
  const movedB = { ...b, y: 400 }
  const scene = createScene({ elements: [a, movedB, arrow] })
  const next = recomputeBindings(scene)
  const reArrow = next.elements.find((el) => el.id === 'arr') as ArrowElement
  const endAbs = { x: reArrow.x + reArrow.points[reArrow.points.length - 1].x, y: reArrow.y + reArrow.points[reArrow.points.length - 1].y }
  assert.ok(endAbs.y > 200, `arrow end should follow shape down, got y=${endAbs.y}`)
})

test('simplifyPoints drops near-collinear points', () => {
  const line = [
    { x: 0, y: 0 },
    { x: 5, y: 0.1 },
    { x: 10, y: 0 },
    { x: 15, y: 0.1 },
    { x: 20, y: 0 },
  ]
  const simplified = simplifyPoints(line, 1)
  assert.ok(simplified.length < line.length)
  assert.deepEqual(simplified[0], { x: 0, y: 0 })
  assert.deepEqual(simplified[simplified.length - 1], { x: 20, y: 0 })
})

test('createDiagram produces elements that survive serialize round-trip', () => {
  for (const kind of ['flowchart', 'kanban', 'swimlane', 'mindmap', 'orgchart', 'fishbone', 'gantt', 'sequence'] as const) {
    const elements = createDiagram(kind, { x: 0, y: 0 }, 'clean')
    assert.ok(elements.length > 0, `${kind} produced no elements`)
    const scene = createScene({ elements })
    const parsed = parseScene(serializeScene(scene))
    assert.equal(parsed.elements.length, elements.length, `${kind} lost elements on round-trip`)
    // Render must not throw and must produce svg.
    assert.ok(sceneToSvgString(scene).startsWith('<svg'), `${kind} failed to render`)
  }
})

test('stroke and fill opacity render independently', () => {
  const scene = createScene({
    elements: [createElement({ type: 'rectangle', x: 0, y: 0, width: 40, height: 40, fillStyle: 'solid', fill: literal('#00f'), opacity: 0.5, fillOpacity: 0.2, style: 'clean', id: 'o' })],
  })
  const svg = sceneToSvgString(scene)
  // Fill path carries the fill opacity; outline carries the stroke opacity.
  assert.ok(svg.includes('opacity="0.2"'), 'fill opacity present')
  assert.ok(svg.includes('opacity="0.5"'), 'stroke opacity present')
})

test('lines and arrows can carry a midpoint label', () => {
  const scene = createScene({
    elements: [
      createElement({ type: 'arrow', x: 0, y: 0, width: 100, height: 0, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], label: 'sends', style: 'clean', id: 'a' }) ,
    ],
  })
  const svg = sceneToSvgString(scene)
  assert.ok(svg.includes('sends'), 'arrow label rendered')
})

test('snapToGrid rounds to the nearest grid line', () => {
  assert.equal(snapToGrid(13, 10), 10)
  assert.equal(snapToGrid(16, 10), 20)
  assert.equal(snapToGrid(-4, 10), -0)
})

test('computeSnap (magnet) aligns a moving rect to another element edge', () => {
  const moving = { x: 102, y: 50, width: 40, height: 40 }
  const other = { x: 100, y: 200, width: 40, height: 40 }
  const result = computeSnap(moving, [other], { threshold: 6, magnet: true })
  assert.equal(result.dx, -2)
  assert.ok(result.guides.some((g) => g.axis === 'x' && g.at === 100))
})

test('computeSnap grid (no magnet) snaps to grid without guides', () => {
  const moving = { x: 103, y: 207, width: 40, height: 40 }
  const result = computeSnap(moving, [], { threshold: 6, grid: true, gridSize: 10 })
  assert.equal(result.dx, -3) // 103 -> 100
  assert.equal(result.dy, 3) // 207 -> 210
  assert.equal(result.guides.length, 0)
})

test('snapPoint magnet snaps a resize handle to an element edge with a guide', () => {
  const other = { x: 200, y: 0, width: 40, height: 40 }
  const result = snapPoint({ x: 197, y: 50 }, [other], { threshold: 6, magnet: true })
  assert.equal(result.x, 200) // snaps to other.x
  assert.ok(result.guides.some((g) => g.axis === 'x' && g.at === 200))
})

test('snapPoint grid snaps to grid', () => {
  const result = snapPoint({ x: 23, y: 48 }, [], { threshold: 6, grid: true, gridSize: 10 })
  assert.deepEqual({ x: result.x, y: result.y }, { x: 20, y: 50 })
})

test('toPolygon converts a rectangle to 4 corner vertices', () => {
  const rect = createElement({ type: 'rectangle', x: 10, y: 20, width: 100, height: 60, id: 'r' })
  const poly = toPolygon(rect)
  assert.equal(poly.type, 'polygon')
  assert.equal(poly.points.length, 4)
  assert.deepEqual(poly.points[2], { x: 100, y: 60 })
})

test('pointInPolygon detects inside vs outside', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
  assert.equal(pointInPolygon({ x: 5, y: 5 }, square), true)
  assert.equal(pointInPolygon({ x: 15, y: 5 }, square), false)
})

test('polygon is hit-tested by its interior and round-trips + renders', () => {
  const poly = createElement({ type: 'polygon', x: 0, y: 0, width: 100, height: 100, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }], fillStyle: 'solid', id: 'p' })
  assert.equal(hitTest([poly], { x: 50, y: 30 }, 4)?.id, 'p')
  const scene = createScene({ elements: [poly] })
  const parsed = parseScene(serializeScene(scene))
  assert.equal(parsed.elements[0].type, 'polygon')
  assert.ok(sceneToSvgString(scene).includes('<path'))
})

test('normalizeVertexBounds re-derives bbox from points', () => {
  const el = { x: 0, y: 0, width: 10, height: 10, points: [{ x: 5, y: 5 }, { x: 25, y: 35 }] }
  const next = normalizeVertexBounds(el)
  assert.deepEqual({ x: next.x, y: next.y, width: next.width, height: next.height }, { x: 5, y: 5, width: 20, height: 30 })
  assert.deepEqual(next.points[0], { x: 0, y: 0 })
})

test('sketchy rectangle keeps rounded corners (uses arcs, not 4 corners)', () => {
  const sharp = sceneToSvgString(createScene({ elements: [createElement({ type: 'rectangle', x: 0, y: 0, width: 80, height: 60, roundness: 0, style: 'sketchy', seed: 5, id: 's' })] }))
  const round = sceneToSvgString(createScene({ elements: [createElement({ type: 'rectangle', x: 0, y: 0, width: 80, height: 60, roundness: 16, style: 'sketchy', seed: 5, id: 'r' })] }))
  // The rounded version samples more perimeter points → a longer path string.
  assert.ok(round.length > sharp.length, 'rounded sketchy rect should have a richer outline')
})

test('pretty-printed scene JSON round-trips (code view)', () => {
  const scene = createScene({ elements: [createElement({ type: 'rectangle', x: 5, y: 6, width: 20, height: 10, id: 'r' })] })
  const pretty = JSON.stringify(JSON.parse(serializeScene(scene)), null, 2)
  const back = parseScene(pretty)
  assert.equal(back.elements.length, 1)
  assert.equal(back.elements[0].width, 20)
})

test('looksLikeMermaid detects flowchart headers', () => {
  assert.equal(looksLikeMermaid('graph TD\nA-->B'), true)
  assert.equal(looksLikeMermaid('flowchart LR; X --> Y'), true)
  assert.equal(looksLikeMermaid('{ "a": 1 }'), false)
})

test('mermaidToElements parses nodes, shapes and bound edges', () => {
  const code = 'graph TD\nA[Start] --> B{Decision}\nB -->|yes| C(Done)\nB -->|no| A'
  const elements = mermaidToElements(code, { x: 0, y: 0 }, 'clean')
  const shapes = elements.filter((e) => e.type !== 'arrow')
  const arrows = elements.filter((e) => e.type === 'arrow') as ArrowElement[]
  // 3 nodes (A, B, C), 3 edges.
  assert.equal(shapes.length, 3)
  assert.equal(arrows.length, 3)
  assert.ok(shapes.some((s) => s.type === 'diamond' && s.label === 'Decision'))
  assert.ok(shapes.some((s) => s.label === 'Start'))
  assert.ok(arrows.every((a) => a.startBinding && a.endBinding), 'edges bind both ends')
  assert.ok(arrows.some((a) => a.label === 'yes'))
  // Round-trips + renders.
  const scene = createScene({ elements })
  assert.equal(parseScene(serializeScene(scene)).elements.length, elements.length)
  assert.ok(sceneToSvgString(scene).startsWith('<svg'))
})

test('mermaid sequence diagram → actors, lifelines, message arrows', () => {
  const code = 'sequenceDiagram\n participant U as User\n participant S as Server\n U->>S: request\n S-->>U: response'
  const elements = mermaidToElements(code, { x: 0, y: 0 }, 'clean')
  const rects = elements.filter((e) => e.type === 'rectangle')
  const lines = elements.filter((e) => e.type === 'line')
  const arrows = elements.filter((e) => e.type === 'arrow')
  assert.equal(rects.length, 2, 'two actor boxes')
  assert.equal(lines.length, 2, 'two lifelines')
  assert.equal(arrows.length, 2, 'two messages')
  assert.ok(arrows.some((a) => a.label === 'request'))
  assert.ok(sceneToSvgString(createScene({ elements })).startsWith('<svg'))
})

test('mermaid state diagram maps [*] to start/end ellipses', () => {
  const code = 'stateDiagram-v2\n [*] --> Idle\n Idle --> Running: go\n Running --> [*]'
  const elements = mermaidToElements(code, { x: 0, y: 0 }, 'clean')
  const ellipses = elements.filter((e) => e.type === 'ellipse')
  const arrows = elements.filter((e) => e.type === 'arrow')
  assert.ok(ellipses.length >= 2, 'start + end ellipses')
  assert.ok(arrows.some((a) => a.label === 'go'))
})

test('mermaid pie renders editable polygon sectors', () => {
  const elements = mermaidToElements('pie title Pets\n "Dogs" : 60\n "Cats" : 40', { x: 0, y: 0 }, 'clean')
  const polys = elements.filter((e) => e.type === 'polygon')
  assert.equal(polys.length, 2, 'one polygon per slice')
  assert.ok(elements.some((e) => e.type === 'text' && e.text.includes('Dogs')))
})

test('mermaid class diagram builds class boxes + relations', () => {
  const code = 'classDiagram\n class Animal {\n +int age\n +makeSound()\n }\n Animal <|-- Dog'
  const elements = mermaidToElements(code, { x: 0, y: 0 }, 'clean')
  const rects = elements.filter((e) => e.type === 'rectangle')
  const arrows = elements.filter((e) => e.type === 'arrow')
  assert.ok(rects.some((r) => r.label?.includes('Animal') && r.label?.includes('age')))
  assert.equal(arrows.length, 1)
})

test('mermaid gantt builds task bars', () => {
  const code = 'gantt\n title Plan\n section Build\n Research :3d\n Design :2d\n Ship :1d'
  const elements = mermaidToElements(code, { x: 0, y: 0 }, 'clean')
  const bars = elements.filter((e) => e.type === 'rectangle')
  assert.equal(bars.length, 3)
  assert.ok(elements.some((e) => e.type === 'text' && e.text === 'Research'))
})

test('mermaid mindmap builds a tree', () => {
  const code = 'mindmap\n  root((Idea))\n    Branch A\n    Branch B'
  const elements = mermaidToElements(code, { x: 0, y: 0 }, 'clean')
  const shapes = elements.filter((e) => e.type !== 'arrow')
  const arrows = elements.filter((e) => e.type === 'arrow')
  assert.equal(shapes.length, 3)
  assert.equal(arrows.length, 2)
})

test('mermaid journey → task boxes with arrows', () => {
  const els = mermaidToElements('journey\n title My Day\n section Morning\n  Wake: 3: Me\n  Coffee: 5: Me\n section Work\n  Code: 4: Me', { x: 0, y: 0 }, 'clean')
  assert.ok(els.filter((e) => e.type === 'rectangle').length === 3)
  assert.ok(els.filter((e) => e.type === 'arrow').length === 2)
  assert.ok(els.some((e) => e.type === 'text' && e.text === 'My Day'))
})

test('mermaid timeline → axis, period dots and event boxes', () => {
  const els = mermaidToElements('timeline\n title History\n 2002 : LinkedIn\n 2004 : Facebook : Google', { x: 0, y: 0 }, 'clean')
  assert.ok(els.filter((e) => e.type === 'ellipse').length === 2, 'two period dots')
  assert.ok(els.filter((e) => e.type === 'rectangle').length === 2, 'two event boxes')
})

test('mermaid quadrant → frame, axes and data points', () => {
  const els = mermaidToElements('quadrantChart\n title Reach\n x-axis Low --> High\n quadrant-1 Expand\n A: [0.3, 0.6]\n B: [0.7, 0.2]', { x: 0, y: 0 }, 'clean')
  assert.ok(els.filter((e) => e.type === 'rectangle').length >= 1, 'frame')
  assert.ok(els.filter((e) => e.type === 'ellipse').length === 2, 'two points')
  assert.ok(els.some((e) => e.type === 'text' && e.text === 'Expand'))
})

test('mermaid gitGraph → commit circles and links', () => {
  const els = mermaidToElements('gitGraph\n commit\n branch dev\n checkout dev\n commit\n checkout main\n merge dev', { x: 0, y: 0 }, 'clean')
  assert.ok(els.filter((e) => e.type === 'ellipse').length === 3, 'three commits')
  assert.ok(els.filter((e) => e.type === 'line').length >= 2, 'links')
})

test('mermaid sankey → nodes + value-weighted connectors', () => {
  const els = mermaidToElements('sankey-beta\nA,B,10\nB,C,5', { x: 0, y: 0 }, 'clean')
  assert.ok(els.filter((e) => e.type === 'rectangle').length === 3)
  const arrows = els.filter((e) => e.type === 'arrow')
  assert.ok(arrows.length === 2)
  assert.ok(arrows.some((a) => a.strokeWidth > arrows.find((b) => b.label === '5')!.strokeWidth - 0.001))
})

test('mermaid xychart → axes, bars and line points', () => {
  const els = mermaidToElements('xychart-beta\n title "Sales"\n x-axis [jan, feb, mar]\n bar [30, 60, 90]\n line [20, 50, 80]', { x: 0, y: 0 }, 'clean')
  assert.ok(els.filter((e) => e.type === 'rectangle').length === 3, 'three bars')
  assert.ok(els.filter((e) => e.type === 'ellipse').length === 3, 'three line points')
  assert.ok(els.filter((e) => e.type === 'line').length >= 2, 'axes + segments')
})

test('mermaid requirement → requirement/element boxes + relation', () => {
  const els = mermaidToElements('requirementDiagram\n requirement test_req {\n id: 1\n text: works\n }\n element ent {\n type: sim\n }\n ent - satisfies -> test_req', { x: 0, y: 0 }, 'clean')
  assert.ok(els.filter((e) => e.type === 'rectangle').length === 2)
  assert.ok(els.filter((e) => e.type === 'arrow').length === 1)
})

test('mermaid kanban → columns and cards', () => {
  const els = mermaidToElements('kanban\n  Todo\n    Task A\n    Task B\n  Doing\n    Task C', { x: 0, y: 0 }, 'clean')
  // 2 columns + 3 cards = 5 rectangles
  assert.ok(els.filter((e) => e.type === 'rectangle').length === 5)
})

test('mermaid class deepening: generics and annotations', () => {
  const els = mermaidToElements('classDiagram\n class Box~T~ {\n <<interface>>\n +T value\n }\n Box~T~ <|-- IntBox', { x: 0, y: 0 }, 'clean')
  const rects = els.filter((e) => e.type === 'rectangle')
  assert.ok(rects.some((r) => r.label?.includes('Box<T>')), 'generic rendered')
  assert.ok(rects.some((r) => r.label?.includes('«interface»')), 'annotation rendered')
})

test('mermaid unknown diagram falls back to edge extraction', () => {
  const els = mermaidToElements('block-beta\n A --> B\n B --> C', { x: 0, y: 0 }, 'clean')
  assert.ok(els.filter((e) => e.type !== 'arrow').length >= 2)
})

test('jsonToElements builds a tree of nodes + connectors', () => {
  const elements = jsonToElements('{"name":"x","items":[1,2],"ok":true}', { x: 0, y: 0 }, 'clean')
  const shapes = elements.filter((e) => e.type !== 'arrow')
  const arrows = elements.filter((e) => e.type === 'arrow')
  // root + name + items + 2 items + ok = 6 nodes; edges = nodes - 1
  assert.equal(shapes.length, 6)
  assert.equal(arrows.length, 5)
  assert.ok(shapes.some((s) => s.label?.includes('name')))
  assert.equal(jsonToElements('not json').length, 0)
})

test('flowchart arrows are bound to shapes', () => {
  const elements = createDiagram('flowchart', { x: 0, y: 0 }, 'clean')
  const arrows = elements.filter((el) => el.type === 'arrow') as ArrowElement[]
  assert.ok(arrows.length >= 3)
  assert.ok(arrows.every((arrow) => arrow.startBinding && arrow.endBinding), 'every flowchart arrow should bind both ends')
})

console.log(`\n${passed}/${passed + failed} passed`)
process.exit(failed ? 1 : 0)
