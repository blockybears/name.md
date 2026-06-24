import { viewBoxForScene, rectToViewBox } from '../camera'
import { resolveColor } from '../color'
import { diamondPath, ellipsePath, polylinePath, rectPath } from './shapes'
import {
  ellipsePoints,
  hachureEllipse,
  hachurePath,
  hachurePolygon,
  makeRng,
  roughClosedCurve,
  roughPolyline,
} from './sketch'
import type { Point, Rect, Scene, SketchElement, TextAlign } from '../types'

export interface RenderPath {
  kind: 'path'
  d: string
  stroke: string
  strokeWidth: number
  fill: string
}

export interface RenderText {
  kind: 'text'
  x: number
  y: number
  text: string
  fontSize: number
  fontFamily: string
  anchor: 'start' | 'middle' | 'end'
  fill: string
}

export type RenderShape = RenderPath | RenderText

export interface RenderElement {
  id: string
  transform: string
  opacity: number
  shapes: RenderShape[]
}

export interface RenderScene {
  viewBox: string
  background: string
  elements: RenderElement[]
}

export interface RenderOptions {
  /** Override the framing (used by the interactive editor's camera). */
  viewBox?: Rect
}

const anchorFor: Record<TextAlign, RenderText['anchor']> = {
  left: 'start',
  center: 'middle',
  right: 'end',
}

function rectPolygon(width: number, height: number): Point[] {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
}

function diamondPolygon(width: number, height: number): Point[] {
  return [
    { x: width / 2, y: 0 },
    { x: width, y: height / 2 },
    { x: width / 2, y: height },
    { x: 0, y: height / 2 },
  ]
}

function cleanOutline(element: SketchElement): string {
  switch (element.type) {
    case 'rectangle':
      return rectPath(element.width, element.height, element.roundness)
    case 'ellipse':
      return ellipsePath(element.width, element.height)
    case 'diamond':
      return diamondPath(element.width, element.height)
    case 'line':
    case 'arrow':
    case 'freedraw':
      return polylinePath(element.points)
    default:
      return ''
  }
}

function sketchyOutline(element: SketchElement, rng: () => number): string {
  switch (element.type) {
    case 'rectangle':
      return roughPolyline(rectPolygon(element.width, element.height), rng, true)
    case 'diamond':
      return roughPolyline(diamondPolygon(element.width, element.height), rng, true)
    case 'ellipse': {
      const jitterAmount = Math.min(3, 1 + (element.width + element.height) / 160)
      return roughClosedCurve(ellipsePoints(element.width, element.height), rng, jitterAmount)
    }
    case 'line':
    case 'arrow':
      return roughPolyline(element.points, rng, false)
    case 'freedraw':
      return polylinePath(element.points)
    default:
      return ''
  }
}

function fillRegionPath(element: SketchElement): string | null {
  switch (element.type) {
    case 'rectangle':
      return rectPath(element.width, element.height, element.roundness)
    case 'ellipse':
      return ellipsePath(element.width, element.height)
    case 'diamond':
      return diamondPath(element.width, element.height)
    default:
      return null
  }
}

function hachureSegments(element: SketchElement): Array<[Point, Point]> | null {
  switch (element.type) {
    case 'rectangle':
      return hachurePolygon(rectPolygon(element.width, element.height))
    case 'diamond':
      return hachurePolygon(diamondPolygon(element.width, element.height))
    case 'ellipse':
      return hachureEllipse(element.width, element.height)
    default:
      return null
  }
}

function segmentsToPath(segments: Array<[Point, Point]>): string {
  return segments
    .map(([a, b]) => `M${a.x.toFixed(2)} ${a.y.toFixed(2)} L${b.x.toFixed(2)} ${b.y.toFixed(2)}`)
    .join(' ')
}

function transformFor(element: SketchElement): string {
  const parts = [`translate(${element.x} ${element.y})`]
  if (element.angle) {
    const deg = (element.angle * 180) / Math.PI
    parts.push(`rotate(${deg.toFixed(3)} ${element.width / 2} ${element.height / 2})`)
  }
  return parts.join(' ')
}

function elementShapes(element: SketchElement): RenderShape[] {
  if (element.type === 'text') {
    const color = resolveColor(element.stroke)
    const anchor = anchorFor[element.align]
    const anchorX = element.align === 'left' ? 0 : element.align === 'center' ? element.width / 2 : element.width
    const lineHeight = element.fontSize * 1.25
    return element.text.split('\n').map((line, index) => ({
      kind: 'text' as const,
      x: anchorX,
      y: (index + 1) * lineHeight - element.fontSize * 0.25,
      text: line,
      fontSize: element.fontSize,
      fontFamily: element.fontFamily,
      anchor,
      fill: color,
    }))
  }

  const shapes: RenderShape[] = []
  const rng = makeRng(element.seed)
  const sketchy = element.style === 'sketchy'

  // Fill (drawn behind the outline).
  if (element.fillStyle === 'solid') {
    const region = fillRegionPath(element)
    if (region) {
      shapes.push({ kind: 'path', d: region, stroke: 'none', strokeWidth: 0, fill: resolveColor(element.fill) })
    }
  } else if (element.fillStyle === 'hachure') {
    const segments = hachureSegments(element)
    if (segments && segments.length > 0) {
      const d = sketchy ? hachurePath(segments, rng) : segmentsToPath(segments)
      shapes.push({
        kind: 'path',
        d,
        stroke: resolveColor(element.fill),
        strokeWidth: Math.max(1, element.strokeWidth * 0.6),
        fill: 'none',
      })
    }
  }

  // Outline.
  const outline = sketchy ? sketchyOutline(element, rng) : cleanOutline(element)
  if (outline) {
    shapes.push({ kind: 'path', d: outline, stroke: resolveColor(element.stroke), strokeWidth: element.strokeWidth, fill: 'none' })
  }

  return shapes
}

export function renderElement(element: SketchElement): RenderElement {
  return {
    id: element.id,
    transform: transformFor(element),
    opacity: element.opacity,
    shapes: elementShapes(element),
  }
}

export function renderScene(scene: Scene, options: RenderOptions = {}): RenderScene {
  const viewRect = options.viewBox ?? viewBoxForScene(scene)
  return {
    viewBox: rectToViewBox(viewRect),
    background: resolveColor(scene.background),
    elements: scene.elements.map(renderElement),
  }
}

// --- string serialization (used for export and headless tests) ---

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function shapeToString(shape: RenderShape): string {
  if (shape.kind === 'path') {
    return `<path d="${shape.d}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" fill="${shape.fill}" stroke-linejoin="round" stroke-linecap="round" />`
  }
  return `<text x="${shape.x}" y="${shape.y}" font-size="${shape.fontSize}" font-family="${escapeXml(shape.fontFamily)}" text-anchor="${shape.anchor}" fill="${shape.fill}">${escapeXml(shape.text)}</text>`
}

export function sceneToSvgString(scene: Scene, options: RenderOptions = {}): string {
  const rendered = renderScene(scene, options)
  const body = rendered.elements
    .map((element) => {
      const inner = element.shapes.map(shapeToString).join('')
      return `<g transform="${element.transform}" opacity="${element.opacity}">${inner}</g>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${rendered.viewBox}"><rect x="-100000" y="-100000" width="200000" height="200000" fill="${rendered.background}" />${body}</svg>`
}
