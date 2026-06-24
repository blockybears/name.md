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

export type DrawStyle = 'clean' | 'sketchy'
export type FillStyle = 'none' | 'solid' | 'hachure'
export type TextAlign = 'left' | 'center' | 'right'
export type ElementType = 'rectangle' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'freedraw' | 'text'

/** A binding from an arrow endpoint to another element. */
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
  opacity: number
  strokeWidth: number
  style: DrawStyle
  stroke: SketchColor
  fill: SketchColor
  fillStyle: FillStyle
  /** Corner rounding factor for rectangles (0 = sharp). */
  roundness: number
  groupIds: string[]
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
