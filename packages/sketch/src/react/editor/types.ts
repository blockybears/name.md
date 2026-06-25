import type { Arrowhead, DrawStyle, FillStyle, SketchColor, StrokeStyle } from '../../core'

export type ToolId =
  | 'select'
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text'

/** The active drawing properties applied to new elements (and to the selection
 *  when edited through the properties panel). */
export interface DrawState {
  stroke: SketchColor
  fill: SketchColor
  fillStyle: FillStyle
  strokeWidth: number
  strokeStyle: StrokeStyle
  style: DrawStyle
  roundness: number
  opacity: number
  fillOpacity: number
  startArrowhead: Arrowhead
  endArrowhead: Arrowhead
  fontSize: number
}

export const defaultDrawState = (style: DrawStyle): DrawState => ({
  stroke: { kind: 'token', token: 'foreground' },
  fill: { kind: 'token', token: 'surface' },
  fillStyle: 'none',
  strokeWidth: 2,
  strokeStyle: 'solid',
  style,
  roundness: 0,
  opacity: 1,
  fillOpacity: 1,
  startArrowhead: 'none',
  endArrowhead: 'arrow',
  fontSize: 20,
})
