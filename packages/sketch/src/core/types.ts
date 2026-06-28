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
/** Text typefaces: a rounded UI sans, a casual handwritten face, and monospace. */
export type FontFamily = 'rounded' | 'hand' | 'mono'
/** Whether text keeps level or rotates with its (rotated) element. */
export type TextOrientation = 'shape' | 'horizontal'
/** Where a line/arrow label sits relative to the line. */
export type LabelPlacement = 'above' | 'on' | 'below'
export type Arrowhead = 'none' | 'arrow' | 'triangle' | 'dot'
export type ElementType = 'rectangle' | 'ellipse' | 'diamond' | 'polygon' | 'line' | 'arrow' | 'freedraw' | 'text'

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
  // --- text styling (applies to a text element's text and to any label) ---
  /** Typeface; defaults to 'rounded'. */
  fontFamily?: FontFamily
  fontBold?: boolean
  fontItalic?: boolean
  /** Text/label colour, independent of the shape's stroke. */
  textColor?: SketchColor
  /** Knock out a same-coloured background behind the text so it stays legible. */
  wipeout?: boolean
  /** Keep text level or let it rotate with the element. Default 'shape'. */
  textOrientation?: TextOrientation
  /** For line/arrow labels: sit above, on, or below the line. Default 'on'. */
  labelPlacement?: LabelPlacement
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
/** Free polygon with arbitrary editable vertices (rect/diamond convert to this
 *  for reshaping). Points are relative to (x, y); the shape is closed. */
export interface PolygonElement extends ElementBase {
  type: 'polygon'
  points: Point[]
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
  align: TextAlign
}

export type SketchElement =
  | RectElement
  | EllipseElement
  | DiamondElement
  | PolygonElement
  | LineElement
  | ArrowElement
  | FreedrawElement
  | TextElement

export type LinearElement = LineElement | ArrowElement | FreedrawElement

export function isLinear(element: SketchElement): element is LinearElement {
  return element.type === 'line' || element.type === 'arrow' || element.type === 'freedraw'
}

export type VertexElement = LinearElement | PolygonElement

/** Elements whose `points` array can be edited vertex-by-vertex. */
export function hasVertices(element: SketchElement): element is VertexElement {
  return isLinear(element) || element.type === 'polygon'
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export const SCENE_VERSION = 1

// Structured diagram instances live alongside freeform elements; they retain
// their data so they can be re-viewed as different chart types. Typed via a
// type-only import to avoid a runtime cycle with the diagram module.
import type { DiagramInstance } from './diagram'

export interface Scene {
  version: number
  elements: SketchElement[]
  /** Structured, re-viewable diagrams (rendered into elements at draw time). */
  diagrams?: DiagramInstance[]
  /** Canvas background; defaults to the `canvas` theme token. */
  background: SketchColor
  /** Default style applied to newly created elements. */
  defaultStyle: DrawStyle
  /** Saved framing used by the read-only view; null = fit to content. */
  defaultView: Rect | null
  /** Saved canvas height (px) — set by the resize handle; used by edit + read. */
  canvasHeight?: number
}
