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
  sceneContentBounds,
  sceneToSvgString,
  serializeScene,
  simplifyPoints,
  token,
  toPolygon,
  normalizeVertexBounds,
  pointInPolygon,
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

test('computeSnap aligns a moving rect to another element edge', () => {
  const moving = { x: 102, y: 50, width: 40, height: 40 }
  const other = { x: 100, y: 200, width: 40, height: 40 }
  const result = computeSnap(moving, [other], { threshold: 6 })
  // Left edges (102 vs 100) within threshold → dx = -2, with a vertical guide.
  assert.equal(result.dx, -2)
  assert.ok(result.guides.some((g) => g.axis === 'x' && g.at === 100))
})

test('computeSnap falls back to grid when nothing aligns', () => {
  const moving = { x: 103, y: 207, width: 40, height: 40 }
  const result = computeSnap(moving, [], { threshold: 6, grid: 10 })
  assert.equal(result.dx, -3) // 103 -> 100
  assert.equal(result.dy, 3) // 207 -> 210
  assert.equal(result.guides.length, 0)
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

test('flowchart arrows are bound to shapes', () => {
  const elements = createDiagram('flowchart', { x: 0, y: 0 }, 'clean')
  const arrows = elements.filter((el) => el.type === 'arrow') as ArrowElement[]
  assert.ok(arrows.length >= 3)
  assert.ok(arrows.every((arrow) => arrow.startBinding && arrow.endBinding), 'every flowchart arrow should bind both ends')
})

console.log(`\n${passed}/${passed + failed} passed`)
process.exit(failed ? 1 : 0)
