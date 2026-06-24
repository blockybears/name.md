import assert from 'node:assert/strict'
import {
  createElement,
  createScene,
  elementBounds,
  literal,
  parseScene,
  rectToViewBox,
  sceneContentBounds,
  sceneToSvgString,
  serializeScene,
  token,
  viewBoxForScene,
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

test('token and literal colors resolve through render', () => {
  const scene = createScene({ elements: [createElement({ type: 'rectangle', x: 0, y: 0, width: 10, height: 10, stroke: token('accent') })] })
  const svg = sceneToSvgString(scene)
  assert.ok(svg.includes('var(--sketch-accent'))
})

console.log(`\n${passed}/${passed + failed} passed`)
process.exit(failed ? 1 : 0)
