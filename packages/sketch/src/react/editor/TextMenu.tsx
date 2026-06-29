import { useState } from 'react'
import type { FontFamily, LabelPlacement, TextOrientation } from '../../core'
import { ColorSwatches } from './ColorControl'
import { colorPreview } from './colorUtils'
import { FlyoutRow, FlyoutSub } from './Flyout'
import { Segmented, type SegOption } from './Segmented'
import type { DrawState } from './types'

const fontSizeOptions: SegOption<number>[] = [
  { value: 5, label: 'XS', title: 'Extra small' },
  { value: 7, label: 'S', title: 'Small' },
  { value: 11, label: 'M', title: 'Medium' },
  { value: 18, label: 'L', title: 'Large' },
  { value: 28, label: 'XL', title: 'Extra large' },
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

/** Compact text-style menu; Colour drills into a second-level picker. */
export function TextMenu({
  draw,
  showLinePlacement,
  onChange,
}: {
  draw: DrawState
  showLinePlacement: boolean
  onChange: (patch: Partial<DrawState>) => void
}) {
  const [sub, setSub] = useState<'main' | 'colour'>('main')

  if (sub === 'colour') {
    return (
      <FlyoutSub title="Text colour" onBack={() => setSub('main')}>
        <ColorSwatches value={draw.textColor} onChange={(textColor) => onChange({ textColor })} />
      </FlyoutSub>
    )
  }

  return (
    <div className="sketch-style-list">
      <div className="sketch-style-seg">
        <span className="sketch-prop-label">Size</span>
        <Segmented options={fontSizeOptions} value={draw.fontSize} onSelect={(fontSize) => onChange({ fontSize })} />
      </div>
      <div className="sketch-style-seg">
        <span className="sketch-prop-label">Font</span>
        <Segmented options={fontFamilyOptions} value={draw.fontFamily} onSelect={(fontFamily) => onChange({ fontFamily })} />
      </div>
      <div className="sketch-style-seg">
        <span className="sketch-prop-label">Weight</span>
        <div className="sketch-segmented">
          <button type="button" aria-label="Bold" aria-pressed={draw.fontBold} title="Bold" style={{ fontWeight: 700 }} onClick={() => onChange({ fontBold: !draw.fontBold })}>
            B
          </button>
          <button type="button" aria-label="Italic" aria-pressed={draw.fontItalic} title="Italic" style={{ fontStyle: 'italic' }} onClick={() => onChange({ fontItalic: !draw.fontItalic })}>
            I
          </button>
          <button type="button" aria-label="Wipeout background" aria-pressed={draw.wipeout} title="Knock out the background behind text" onClick={() => onChange({ wipeout: !draw.wipeout })}>
            ▢
          </button>
        </div>
      </div>
      <FlyoutRow label="Colour" value={<span className="sketch-row-swatch" style={{ background: colorPreview(draw.textColor) }} />} onClick={() => setSub('colour')} />
      <div className="sketch-style-seg">
        <span className="sketch-prop-label">Orientation</span>
        <Segmented options={orientationOptions} value={draw.textOrientation} onSelect={(textOrientation) => onChange({ textOrientation })} />
      </div>
      {showLinePlacement && (
        <div className="sketch-style-seg">
          <span className="sketch-prop-label">On line</span>
          <Segmented options={placementOptions} value={draw.labelPlacement} onSelect={(labelPlacement) => onChange({ labelPlacement })} />
        </div>
      )}
    </div>
  )
}
