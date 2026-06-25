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
  dash?: string
  opacity?: number
}

export interface RenderText {
  kind: 'text'
  x: number
  y: number
  text: string
  fontSize: number
  fontFamily: string
  anchor: 'start' | 'middle' | 'end'
  baseline?: 'auto' | 'middle'
  fill: string
  opacity?: number
}

export type RenderShape = RenderPath | RenderText

export interface RenderElement {
  id: string
  transform: string
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

// Jitter strength per style. 'clean' never reaches here.
function roughnessFor(style: SketchElement['style']): number {
  return style === 'soft' ? 0.55 : 1.3
}

function sketchyOutline(element: SketchElement, rng: () => number): string {
  const roughness = roughnessFor(element.style)
  switch (element.type) {
    case 'rectangle':
      return roughPolyline(rectPolygon(element.width, element.height), rng, true, roughness)
    case 'diamond':
      return roughPolyline(diamondPolygon(element.width, element.height), rng, true, roughness)
    case 'ellipse': {
      const jitterAmount = Math.min(3, 1 + (element.width + element.height) / 160) * (roughness / 1.3)
      return roughClosedCurve(ellipsePoints(element.width, element.height), rng, jitterAmount)
    }
    case 'line':
    case 'arrow':
      return roughPolyline(element.points, rng, false, roughness)
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

function dashArray(element: SketchElement): string | undefined {
  const w = Math.max(1, element.strokeWidth)
  if (element.strokeStyle === 'dashed') {
    return `${w * 3} ${w * 2.5}`
  }
  if (element.strokeStyle === 'dotted') {
    return `${w * 0.1} ${w * 2}`
  }
  return undefined
}

/** Arrowhead path at point `tip`, pointing along direction (dx,dy), local coords. */
function arrowheadPath(kind: string, tip: Point, dx: number, dy: number, size: number): string {
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  if (kind === 'dot') {
    const r = size * 0.4
    return `M${(tip.x - r).toFixed(2)} ${tip.y.toFixed(2)} a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(r * 2).toFixed(2)} 0 a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-r * 2).toFixed(2)} 0 Z`
  }
  // Two barbs at ±30°.
  const angle = Math.PI / 6
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const back = { x: -ux, y: -uy }
  const left = { x: back.x * cos - back.y * sin, y: back.x * sin + back.y * cos }
  const right = { x: back.x * cos + back.y * sin, y: -back.x * sin + back.y * cos }
  const p1 = { x: tip.x + left.x * size, y: tip.y + left.y * size }
  const p2 = { x: tip.x + right.x * size, y: tip.y + right.y * size }
  if (kind === 'triangle') {
    return `M${tip.x.toFixed(2)} ${tip.y.toFixed(2)} L${p1.x.toFixed(2)} ${p1.y.toFixed(2)} L${p2.x.toFixed(2)} ${p2.y.toFixed(2)} Z`
  }
  return `M${p1.x.toFixed(2)} ${p1.y.toFixed(2)} L${tip.x.toFixed(2)} ${tip.y.toFixed(2)} L${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
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
      opacity: element.opacity,
    }))
  }

  const shapes: RenderShape[] = []
  const rng = makeRng(element.seed)
  const sketchy = element.style !== 'clean'

  // Fill (drawn behind the outline) — uses the independent fill opacity.
  if (element.fillStyle === 'solid') {
    const region = fillRegionPath(element)
    if (region) {
      shapes.push({ kind: 'path', d: region, stroke: 'none', strokeWidth: 0, fill: resolveColor(element.fill), opacity: element.fillOpacity })
    }
  } else if (element.fillStyle === 'hachure') {
    const segments = hachureSegments(element)
    if (segments && segments.length > 0) {
      const d = sketchy ? hachurePath(segments, rng, roughnessFor(element.style)) : segmentsToPath(segments)
      shapes.push({
        kind: 'path',
        d,
        stroke: resolveColor(element.fill),
        strokeWidth: Math.max(1, element.strokeWidth * 0.6),
        fill: 'none',
        opacity: element.fillOpacity,
      })
    }
  }

  // Outline — uses the independent stroke opacity.
  const outline = sketchy ? sketchyOutline(element, rng) : cleanOutline(element)
  if (outline) {
    shapes.push({
      kind: 'path',
      d: outline,
      stroke: resolveColor(element.stroke),
      strokeWidth: element.strokeWidth,
      fill: 'none',
      dash: dashArray(element),
      opacity: element.opacity,
    })
  }

  // Arrowheads.
  if (element.type === 'arrow' && element.points.length >= 2) {
    const pts = element.points
    const strokeColor = resolveColor(element.stroke)
    const size = 8 + element.strokeWidth * 2
    if (element.endArrowhead !== 'none') {
      const tip = pts[pts.length - 1]
      const prev = pts[pts.length - 2]
      const filled = element.endArrowhead !== 'arrow'
      shapes.push({
        kind: 'path',
        d: arrowheadPath(element.endArrowhead, tip, tip.x - prev.x, tip.y - prev.y, size),
        stroke: strokeColor,
        strokeWidth: element.strokeWidth,
        fill: filled ? strokeColor : 'none',
        opacity: element.opacity,
      })
    }
    if (element.startArrowhead !== 'none') {
      const tip = pts[0]
      const next = pts[1]
      const filled = element.startArrowhead !== 'arrow'
      shapes.push({
        kind: 'path',
        d: arrowheadPath(element.startArrowhead, tip, tip.x - next.x, tip.y - next.y, size),
        stroke: strokeColor,
        strokeWidth: element.strokeWidth,
        fill: filled ? strokeColor : 'none',
        opacity: element.opacity,
      })
    }
  }

  // Label: centered in container shapes, at the midpoint of lines/arrows.
  if (element.label) {
    const fontSize = element.labelFontSize ?? 16
    const lines = element.label.split('\n')
    const lineHeight = fontSize * 1.25
    let cx = element.width / 2
    let cy = element.height / 2
    let backdrop = false
    if (element.type === 'line' || element.type === 'arrow') {
      // Midpoint of the polyline (in local coords), with a small backdrop so
      // the text reads over the line.
      const pts = element.points
      const mid = pts[Math.floor(pts.length / 2)] ?? { x: cx, y: cy }
      const prev = pts[Math.floor(pts.length / 2) - 1] ?? mid
      cx = (mid.x + prev.x) / 2
      cy = (mid.y + prev.y) / 2
      backdrop = true
    } else if (!(element.type === 'rectangle' || element.type === 'ellipse' || element.type === 'diamond')) {
      return shapes
    }
    const startY = cy - ((lines.length - 1) * lineHeight) / 2
    if (backdrop) {
      const longest = lines.reduce((max, line) => Math.max(max, line.length), 1)
      shapes.push({
        kind: 'path',
        d: rectAround(cx, cy, longest * fontSize * 0.58 + 8, lines.length * lineHeight + 4),
        stroke: 'none',
        strokeWidth: 0,
        fill: resolveColor({ kind: 'token', token: 'canvas' }),
        opacity: 0.85,
      })
    }
    lines.forEach((line, index) => {
      shapes.push({
        kind: 'text',
        x: cx,
        y: startY + index * lineHeight,
        text: line,
        fontSize,
        fontFamily: 'inherit',
        anchor: 'middle',
        baseline: 'middle',
        fill: resolveColor(element.stroke),
        opacity: element.opacity,
      })
    })
  }

  return shapes
}

function rectAround(cx: number, cy: number, width: number, height: number): string {
  const x = cx - width / 2
  const y = cy - height / 2
  return `M${x.toFixed(2)} ${y.toFixed(2)} h${width.toFixed(2)} v${height.toFixed(2)} h${(-width).toFixed(2)} Z`
}

export function renderElement(element: SketchElement): RenderElement {
  return {
    id: element.id,
    transform: transformFor(element),
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

function opacityAttr(opacity?: number): string {
  return opacity != null && opacity < 1 ? ` opacity="${opacity}"` : ''
}

function shapeToString(shape: RenderShape): string {
  if (shape.kind === 'path') {
    const dash = shape.dash ? ` stroke-dasharray="${shape.dash}"` : ''
    return `<path d="${shape.d}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" fill="${shape.fill}"${dash}${opacityAttr(shape.opacity)} stroke-linejoin="round" stroke-linecap="round" />`
  }
  const baseline = shape.baseline === 'middle' ? ' dominant-baseline="central"' : ''
  return `<text x="${shape.x}" y="${shape.y}" font-size="${shape.fontSize}" font-family="${escapeXml(shape.fontFamily)}" text-anchor="${shape.anchor}"${baseline} fill="${shape.fill}"${opacityAttr(shape.opacity)}>${escapeXml(shape.text)}</text>`
}

export function sceneToSvgString(scene: Scene, options: RenderOptions = {}): string {
  const rendered = renderScene(scene, options)
  const body = rendered.elements
    .map((element) => {
      const inner = element.shapes.map(shapeToString).join('')
      return `<g transform="${element.transform}">${inner}</g>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${rendered.viewBox}"><rect x="-100000" y="-100000" width="200000" height="200000" fill="${rendered.background}" />${body}</svg>`
}
