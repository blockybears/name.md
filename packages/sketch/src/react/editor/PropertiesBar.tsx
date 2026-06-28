import type { Arrowhead, FillStyle, FontFamily, LabelPlacement, StrokeStyle, TextOrientation } from '../../core'
import { ColorSwatches } from './ColorControl'
import { colorPreview, isTransparent } from './colorUtils'
import { Icon } from './Icon'
import { PropMenu, PropMenuRow } from './PropMenu'
import { Segmented, type SegOption } from './Segmented'
import type { DrawState } from './types'

export type LayerAction = 'front' | 'forward' | 'backward' | 'back' | 'duplicate' | 'delete'

export interface PropertiesBarProps {
  draw: DrawState
  hasSelection: boolean
  showFill: boolean
  showEdges: boolean
  showArrowheads: boolean
  showText: boolean
  /** Show the line-label placement control (above / on / below). */
  showLinePlacement: boolean
  onChange: (patch: Partial<DrawState>) => void
  onAction: (action: LayerAction) => void
}

const fillStyleOptions: SegOption<FillStyle>[] = [
  { value: 'none', icon: 'fill-none', title: 'No fill' },
  { value: 'hachure', icon: 'fill-hachure', title: 'Hachure' },
  { value: 'solid', icon: 'fill-solid', title: 'Solid' },
]
const strokeWidthOptions: SegOption<number>[] = [
  { value: 1, icon: 'width-thin', title: 'Thin' },
  { value: 2, icon: 'width-medium', title: 'Medium' },
  { value: 4, icon: 'width-bold', title: 'Bold' },
]
const strokeStyleOptions: SegOption<StrokeStyle>[] = [
  { value: 'solid', icon: 'dash-solid', title: 'Solid' },
  { value: 'dashed', icon: 'dash-dashed', title: 'Dashed' },
  { value: 'dotted', icon: 'dash-dotted', title: 'Dotted' },
]
const sloppinessOptions: SegOption<'clean' | 'soft' | 'sketchy'>[] = [
  { value: 'clean', icon: 'style-clean', title: 'Clean' },
  { value: 'soft', icon: 'style-soft', title: 'Soft' },
  { value: 'sketchy', icon: 'style-sketchy', title: 'Sketch' },
]
const edgeOptions: SegOption<number>[] = [
  { value: 0, icon: 'edge-sharp', title: 'Sharp corners' },
  { value: 16, icon: 'edge-round', title: 'Round corners' },
]
const arrowheadOptions: SegOption<Arrowhead>[] = [
  { value: 'none', icon: 'head-none', title: 'None' },
  { value: 'arrow', icon: 'head-arrow', title: 'Arrow' },
  { value: 'triangle', icon: 'head-triangle', title: 'Triangle' },
  { value: 'dot', icon: 'head-dot', title: 'Dot' },
]
const fontSizeOptions: SegOption<number>[] = [
  { value: 14, label: 'S', title: 'Small' },
  { value: 20, label: 'M', title: 'Medium' },
  { value: 28, label: 'L', title: 'Large' },
  { value: 40, label: 'XL', title: 'Extra large' },
]
const fontFamilyOptions: SegOption<FontFamily>[] = [
  { value: 'rounded', label: 'Aa', title: 'Rounded' },
  { value: 'hand', label: 'Aa', title: 'Handwritten' },
  { value: 'mono', label: 'Aa', title: 'Monospace' },
]
const orientationOptions: SegOption<TextOrientation>[] = [
  { value: 'horizontal', label: 'Level', title: 'Keep text horizontal' },
  { value: 'shape', label: 'Shape', title: 'Align text with the shape' },
]
const placementOptions: SegOption<LabelPlacement>[] = [
  { value: 'above', label: 'Above', title: 'Above the line' },
  { value: 'on', label: 'On', title: 'On the line' },
  { value: 'below', label: 'Below', title: 'Below the line' },
]

/**
 * Compact properties bar: a row of icon buttons that each open a small popover
 * (like the name.md toolbar dropdowns). Usable on mobile — it scrolls
 * horizontally and the menus expand upward.
 */
export function PropertiesBar({ draw, hasSelection, showFill, showEdges, showArrowheads, showText, showLinePlacement, onChange, onAction }: PropertiesBarProps) {
  return (
    <div className="sketch-prop-bar" role="toolbar" aria-label="Drawing properties">
      {/* Stroke: a pencil whose underline shows the current stroke colour. */}
      <PropMenu title="Stroke (line)" trigger={<span className="sketch-bar-tool"><Icon name="pencil" /><span className="sketch-bar-underline" style={{ background: colorPreview(draw.stroke) }} /></span>}>
        <PropMenuRow label="Colour">
          <ColorSwatches value={draw.stroke} onChange={(stroke) => onChange({ stroke })} />
        </PropMenuRow>
        <PropMenuRow label="Width">
          <Segmented options={strokeWidthOptions} value={draw.strokeWidth} onSelect={(strokeWidth) => onChange({ strokeWidth })} />
        </PropMenuRow>
        <PropMenuRow label="Style">
          <Segmented options={strokeStyleOptions} value={draw.strokeStyle} onSelect={(strokeStyle) => onChange({ strokeStyle })} />
        </PropMenuRow>
        <PropMenuRow label="Sloppiness">
          <Segmented options={sloppinessOptions} value={draw.style} onSelect={(style) => onChange({ style })} />
        </PropMenuRow>
        <PropMenuRow label="Opacity">
          <input type="range" min={0} max={1} step={0.05} value={draw.opacity} onChange={(event) => onChange({ opacity: Number(event.target.value) })} />
        </PropMenuRow>
      </PropMenu>

      {/* Fill: the recognisable paint-bucket, tinted with the current fill. */}
      {showFill && (
        <PropMenu title="Fill" trigger={<span className="sketch-bar-tool"><Icon name="bucket" /><span className="sketch-bar-underline" style={{ background: colorPreview(draw.fill) }} data-checkerboard={isTransparent(draw.fill) ? 'true' : undefined} /></span>}>
          <PropMenuRow label="Colour">
            <ColorSwatches value={draw.fill} allowTransparent onChange={(fill) => onChange({ fill })} />
          </PropMenuRow>
          <PropMenuRow label="Fill style">
            <Segmented options={fillStyleOptions} value={draw.fillStyle} onSelect={(fillStyle) => onChange({ fillStyle })} />
          </PropMenuRow>
          <PropMenuRow label="Opacity">
            <input type="range" min={0} max={1} step={0.05} value={draw.fillOpacity} onChange={(event) => onChange({ fillOpacity: Number(event.target.value) })} />
          </PropMenuRow>
        </PropMenu>
      )}

      {showEdges && (
        <PropMenu title="Edges" trigger={<Icon name="edge-round" />}>
          <Segmented options={edgeOptions} value={draw.roundness > 0 ? 16 : 0} onSelect={(roundness) => onChange({ roundness })} />
        </PropMenu>
      )}

      {showArrowheads && (
        <PropMenu title="Arrowheads" trigger={<Icon name="arrow" />}>
          <PropMenuRow label="Start">
            <Segmented options={arrowheadOptions} value={draw.startArrowhead} onSelect={(startArrowhead) => onChange({ startArrowhead })} />
          </PropMenuRow>
          <PropMenuRow label="End">
            <Segmented options={arrowheadOptions} value={draw.endArrowhead} onSelect={(endArrowhead) => onChange({ endArrowhead })} />
          </PropMenuRow>
        </PropMenu>
      )}

      {showText && (
        <PropMenu title="Text" trigger={<span className="sketch-bar-tool"><Icon name="text" /><span className="sketch-bar-underline" style={{ background: colorPreview(draw.textColor) }} /></span>}>
          <PropMenuRow label="Size">
            <Segmented options={fontSizeOptions} value={draw.fontSize} onSelect={(fontSize) => onChange({ fontSize })} />
          </PropMenuRow>
          <PropMenuRow label="Font">
            <Segmented options={fontFamilyOptions} value={draw.fontFamily} onSelect={(fontFamily) => onChange({ fontFamily })} />
          </PropMenuRow>
          <PropMenuRow label="Weight">
            <div className="sketch-segmented">
              <button type="button" aria-label="Bold" aria-pressed={draw.fontBold} title="Bold" onClick={() => onChange({ fontBold: !draw.fontBold })} style={{ fontWeight: 700 }}>
                B
              </button>
              <button type="button" aria-label="Italic" aria-pressed={draw.fontItalic} title="Italic" onClick={() => onChange({ fontItalic: !draw.fontItalic })} style={{ fontStyle: 'italic' }}>
                I
              </button>
            </div>
          </PropMenuRow>
          <PropMenuRow label="Colour">
            <ColorSwatches value={draw.textColor} onChange={(textColor) => onChange({ textColor })} />
          </PropMenuRow>
          <PropMenuRow label="Wipeout">
            <div className="sketch-segmented">
              <button type="button" aria-label="Wipeout background" aria-pressed={draw.wipeout} title="Knock out the background behind the text" onClick={() => onChange({ wipeout: !draw.wipeout })}>
                {draw.wipeout ? 'On' : 'Off'}
              </button>
            </div>
          </PropMenuRow>
          <PropMenuRow label="Orientation">
            <Segmented options={orientationOptions} value={draw.textOrientation} onSelect={(textOrientation) => onChange({ textOrientation })} />
          </PropMenuRow>
          {showLinePlacement && (
            <PropMenuRow label="On line">
              <Segmented options={placementOptions} value={draw.labelPlacement} onSelect={(labelPlacement) => onChange({ labelPlacement })} />
            </PropMenuRow>
          )}
        </PropMenu>
      )}

      {hasSelection && (
        <PropMenu title="Arrange" trigger={<Icon name="layer-front" />}>
          <PropMenuRow label="Layer">
            <div className="sketch-segmented">
              <button type="button" aria-label="Send to back" title="Send to back" onClick={() => onAction('back')}>
                <Icon name="layer-back" size={16} />
              </button>
              <button type="button" aria-label="Send backward" title="Send backward" onClick={() => onAction('backward')}>
                <Icon name="layer-backward" size={16} />
              </button>
              <button type="button" aria-label="Bring forward" title="Bring forward" onClick={() => onAction('forward')}>
                <Icon name="layer-forward" size={16} />
              </button>
              <button type="button" aria-label="Bring to front" title="Bring to front" onClick={() => onAction('front')}>
                <Icon name="layer-front" size={16} />
              </button>
            </div>
          </PropMenuRow>
          <PropMenuRow label="Actions">
            <div className="sketch-segmented">
              <button type="button" aria-label="Duplicate" title="Duplicate" onClick={() => onAction('duplicate')}>
                <Icon name="duplicate" size={16} />
              </button>
              <button type="button" aria-label="Delete" title="Delete" onClick={() => onAction('delete')}>
                <Icon name="delete" size={16} />
              </button>
            </div>
          </PropMenuRow>
        </PropMenu>
      )}
    </div>
  )
}
