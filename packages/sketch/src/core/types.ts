// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; width: number; height: number }

// ---------------------------------------------------------------------------
// Colors — semantic theme tokens that adapt to the host theme, or a pinned
// literal color that is rendered as-is (never inverted).
// ---------------------------------------------------------------------------

export type ColorToken = 'foreground' | 'muted' | 'accent' | 'surface' | 'canvas'

export type SketchColor = { kind: 'token'; token: ColorToken } | { kind: 'literal'; value: string }

export const token = (t: ColorToken): SketchColor => ({ kind: 'token', token: t })
export const literal = (value: string): SketchColor => ({ kind: 'literal', value })

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

/** Rendering character: crisp geometry, lightly hand-drawn, or fully sketchy. */
export type DrawStyle = 'clean' | 'soft' | 'sketchy'
export type FillStyle = 'none' | 'solid' | 'hachure'
export type StrokeStyle = 'solid' | 'dashed' | 'dotted'
export type TextAlign = 'left' | 'center' | 'right'
export type Arrowhead = 'none' | 'arrow' | 'triangle' | 'dot'
export type ElementType = 'rectangle' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'freedraw' | 'text'

/** A binding from an arrow endpoint to another element.
 *  - focus: -1..1 position offset across the target, for fanning out connectors
 *  - gap: pixels of clearance kept between the arrow tip and the target border */
export type Binding = { elementId: string; focus: number; gap: number }

export interface ElementBase {
  id: string
  /** Top-left of the element's axis-aligned bounding box (pre-rotation). */
  x: number
  y: number
  width: number
  height: number
  /** Rotation in radians, about the element center. */
  angle: number
  /** Stable per-element seed so the sketchy renderer is deterministic. */
  seed: number
  /** Stroke/outline opacity (0..1), independent of fill opacity. */
  opacity: number
  /** Fill opacity (0..1), independent of stroke opacity. */
  fillOpacity: number
  strokeWidth: number
  strokeStyle: StrokeStyle
  style: DrawStyle
  stroke: SketchColor
  fill: SketchColor
  fillStyle: FillStyle
  /** Corner rounding factor for rectangles (0 = sharp). */
  roundness: number
  groupIds: string[]
  /** Optional centered label drawn inside container shapes (diagram nodes). */
  label?: string
  labelFontSize?: number
}

export interface RectElement extends ElementBase {
  type: 'rectangle'
}
export interface EllipseElement extends ElementBase {
  type: 'ellipse'
}
export interface DiamondElement extends ElementBase {
  type: 'diamond'
}
export interface LineElement extends ElementBase {
  type: 'line'
  /** Vertices relative to (x, y). */
  points: Point[]
}
export interface ArrowElement extends ElementBase {
  type: 'arrow'
  points: Point[]
  startBinding?: Binding
  endBinding?: Binding
  startArrowhead: Arrowhead
  endArrowhead: Arrowhead
}
export interface FreedrawElement extends ElementBase {
  type: 'freedraw'
  points: Point[]
}
export interface TextElement extends ElementBase {
  type: 'text'
  text: string
  fontSize: number
  fontFamily: string
  align: TextAlign
}

export type SketchElement =
  | RectElement
  | EllipseElement
  | DiamondElement
  | LineElement
  | ArrowElement
  | FreedrawElement
  | TextElement

export type LinearElement = LineElement | ArrowElement | FreedrawElement

export function isLinear(element: SketchElement): element is LinearElement {
  return element.type === 'line' || element.type === 'arrow' || element.type === 'freedraw'
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export const SCENE_VERSION = 1

export interface Scene {
  version: number
  elements: SketchElement[]
  /** Canvas background; defaults to the `canvas` theme token. */
  background: SketchColor
  /** Default style applied to newly created elements. */
  defaultStyle: DrawStyle
  /** Saved framing used by the read-only view; null = fit to content. */
  defaultView: Rect | null
}
