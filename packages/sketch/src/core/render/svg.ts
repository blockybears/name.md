import { viewBoxForScene, rectToViewBox } from '../camera'
import { resolveColor } from '../color'
import { diamondPath, ellipsePath, polylinePath, rectPath } from './shapes'
import type { Rect, Scene, SketchElement, TextAlign } from '../types'

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

/** Clean geometric outline + fill path for a shape element (sketchy comes later). */
function shapeGeometry(element: SketchElement): { outline: string; fill: string | null } {
  switch (element.type) {
    case 'rectangle':
      return { outline: rectPath(element.width, element.height, element.roundness), fill: rectPath(element.width, element.height, element.roundness) }
    case 'ellipse':
      return { outline: ellipsePath(element.width, element.height), fill: ellipsePath(element.width, element.height) }
    case 'diamond':
      return { outline: diamondPath(element.width, element.height), fill: diamondPath(element.width, element.height) }
    case 'line':
    case 'arrow':
    case 'freedraw':
      return { outline: polylinePath(element.points), fill: null }
    default:
      return { outline: '', fill: null }
  }
}

function transformFor(element: SketchElement): string {
  const parts = [`translate(${element.x} ${element.y})`]
  if (element.angle) {
    const deg = (element.angle * 180) / Math.PI
    parts.push(`rotate(${deg.toFixed(3)} ${element.width / 2} ${element.height / 2})`)
  }
  return parts.join(' ')
}

export function renderElement(element: SketchElement): RenderElement {
  const shapes: RenderShape[] = []
  const stroke = resolveColor(element.stroke)

  if (element.type === 'text') {
    const color = resolveColor(element.stroke)
    const anchor = anchorFor[element.align]
    const anchorX = element.align === 'left' ? 0 : element.align === 'center' ? element.width / 2 : element.width
    const lineHeight = element.fontSize * 1.25
    element.text.split('\n').forEach((line, index) => {
      shapes.push({
        kind: 'text',
        x: anchorX,
        y: (index + 1) * lineHeight - element.fontSize * 0.25,
        text: line,
        fontSize: element.fontSize,
        fontFamily: element.fontFamily,
        anchor,
        fill: color,
      })
    })
  } else {
    const geometry = shapeGeometry(element)
    if (geometry.fill && element.fillStyle === 'solid') {
      shapes.push({ kind: 'path', d: geometry.fill, stroke: 'none', strokeWidth: 0, fill: resolveColor(element.fill) })
    }
    if (geometry.outline) {
      shapes.push({ kind: 'path', d: geometry.outline, stroke, strokeWidth: element.strokeWidth, fill: 'none' })
    }
  }

  return { id: element.id, transform: transformFor(element), opacity: element.opacity, shapes }
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
