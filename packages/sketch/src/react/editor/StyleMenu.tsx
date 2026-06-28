import { useState } from 'react'
import type { Arrowhead, FillStyle, StrokeStyle } from '../../core'
import { ColorSwatches } from './ColorControl'
import { colorPreview, isTransparent } from './colorUtils'
import { FlyoutRow, FlyoutSub } from './Flyout'
import { Segmented, type SegOption } from './Segmented'
import type { DrawState } from './types'

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

function Swatch({ color, transparentable }: { color: DrawState['stroke']; transparentable?: boolean }) {
  return <span className="sketch-row-swatch" style={{ background: colorPreview(color) }} data-checkerboard={transparentable && isTransparent(color) ? 'true' : undefined} />
}

/**
 * Compact, two-level style menu. The first level is a list of rows; Colour and
 * Fill drill into a second-level picker (the only place the hex field appears).
 */
export function StyleMenu({
  draw,
  showFill,
  showEdges,
  showArrowheads,
  onChange,
}: {
  draw: DrawState
  showFill: boolean
  showEdges: boolean
  showArrowheads: boolean
  onChange: (patch: Partial<DrawState>) => void
}) {
  const [sub, setSub] = useState<'main' | 'colour' | 'fill'>('main')

  if (sub === 'colour') {
    return (
      <FlyoutSub title="Stroke colour" onBack={() => setSub('main')}>
        <ColorSwatches value={draw.stroke} onChange={(stroke) => onChange({ stroke })} />
      </FlyoutSub>
    )
  }
  if (sub === 'fill') {
    return (
      <FlyoutSub title="Fill colour" onBack={() => setSub('main')}>
        <ColorSwatches value={draw.fill} allowTransparent onChange={(fill) => onChange({ fill })} />
      </FlyoutSub>
    )
  }

  return (
    <div className="sketch-style-list">
      <FlyoutRow label="Colour" value={<Swatch color={draw.stroke} />} onClick={() => setSub('colour')} />
      {showFill && <FlyoutRow label="Fill" value={<Swatch color={draw.fill} transparentable />} onClick={() => setSub('fill')} />}
      <div className="sketch-style-seg">
        <span className="sketch-prop-label">Width</span>
        <Segmented options={strokeWidthOptions} value={draw.strokeWidth} onSelect={(strokeWidth) => onChange({ strokeWidth })} />
      </div>
      <div className="sketch-style-seg">
        <span className="sketch-prop-label">Line style</span>
        <Segmented options={strokeStyleOptions} value={draw.strokeStyle} onSelect={(strokeStyle) => onChange({ strokeStyle })} />
      </div>
      <div className="sketch-style-seg">
        <span className="sketch-prop-label">Sloppiness</span>
        <Segmented options={sloppinessOptions} value={draw.style} onSelect={(style) => onChange({ style })} />
      </div>
      {showFill && (
        <div className="sketch-style-seg">
          <span className="sketch-prop-label">Fill style</span>
          <Segmented options={fillStyleOptions} value={draw.fillStyle} onSelect={(fillStyle) => onChange({ fillStyle })} />
        </div>
      )}
      {showEdges && (
        <div className="sketch-style-seg">
          <span className="sketch-prop-label">Corners</span>
          <Segmented options={edgeOptions} value={draw.roundness > 0 ? 16 : 0} onSelect={(roundness) => onChange({ roundness })} />
        </div>
      )}
      {showArrowheads && (
        <div className="sketch-style-seg">
          <span className="sketch-prop-label">Arrow ends</span>
          <Segmented options={arrowheadOptions} value={draw.endArrowhead} onSelect={(endArrowhead) => onChange({ endArrowhead })} />
        </div>
      )}
      <div className="sketch-style-seg">
        <span className="sketch-prop-label">Opacity</span>
        <input type="range" min={0} max={1} step={0.05} value={draw.opacity} onChange={(event) => onChange({ opacity: Number(event.target.value) })} />
      </div>
    </div>
  )
}
