import type { Arrowhead, FillStyle, StrokeStyle } from '../../core'
import { ColorControl } from './ColorControl'
import { Icon, type IconName } from './Icon'
import type { DrawState } from './types'

export type LayerAction = 'front' | 'forward' | 'backward' | 'back' | 'duplicate' | 'delete'

export interface PropertiesPanelProps {
  draw: DrawState
  hasSelection: boolean
  showFill: boolean
  showEdges: boolean
  showArrowheads: boolean
  showText: boolean
  narrow?: boolean
  onChange: (patch: Partial<DrawState>) => void
  onAction: (action: LayerAction) => void
  onClose?: () => void
}

interface SegOption<T> {
  value: T
  icon?: IconName
  label?: string
  title: string
}

function Segmented<T extends string | number>({
  options,
  value,
  onSelect,
}: {
  options: SegOption<T>[]
  value: T
  onSelect: (value: T) => void
}) {
  return (
    <div className="sketch-segmented">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={value === option.value}
          aria-label={option.title}
          title={option.title}
          onClick={() => onSelect(option.value)}
        >
          {option.icon ? <Icon name={option.icon} size={16} /> : option.label}
        </button>
      ))}
    </div>
  )
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
  { value: 'clean', icon: 'style-clean', title: 'Clean — crisp geometry' },
  { value: 'soft', icon: 'style-soft', title: 'Soft — lightly hand-drawn' },
  { value: 'sketchy', icon: 'style-sketchy', title: 'Sketch — fully hand-drawn' },
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

export function PropertiesPanel({
  draw,
  hasSelection,
  showFill,
  showEdges,
  showArrowheads,
  showText,
  narrow,
  onChange,
  onAction,
  onClose,
}: PropertiesPanelProps) {
  return (
    <aside className={narrow ? 'sketch-properties is-narrow' : 'sketch-properties'} aria-label="Drawing properties">
      {onClose && (
        <div className="sketch-prop-header">
          <span>Properties</span>
          <button type="button" className="sketch-prop-close" aria-label="Close panel" title="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      <div className="sketch-prop-group">
        <ColorControl label="Stroke" value={draw.stroke} onChange={(stroke) => onChange({ stroke })} />
        {showFill && (
          <ColorControl label="Background" value={draw.fill} allowTransparent onChange={(fill) => onChange({ fill })} />
        )}
      </div>

      {showFill && (
        <div className="sketch-prop-row">
          <span className="sketch-prop-label">Fill</span>
          <Segmented options={fillStyleOptions} value={draw.fillStyle} onSelect={(fillStyle) => onChange({ fillStyle })} />
        </div>
      )}

      <div className="sketch-prop-row">
        <span className="sketch-prop-label">Stroke width</span>
        <Segmented options={strokeWidthOptions} value={draw.strokeWidth} onSelect={(strokeWidth) => onChange({ strokeWidth })} />
      </div>

      <div className="sketch-prop-row">
        <span className="sketch-prop-label">Stroke style</span>
        <Segmented options={strokeStyleOptions} value={draw.strokeStyle} onSelect={(strokeStyle) => onChange({ strokeStyle })} />
      </div>

      <div className="sketch-prop-row">
        <span className="sketch-prop-label">Sloppiness</span>
        <Segmented options={sloppinessOptions} value={draw.style} onSelect={(style) => onChange({ style })} />
      </div>

      {showEdges && (
        <div className="sketch-prop-row">
          <span className="sketch-prop-label">Edges</span>
          <Segmented options={edgeOptions} value={draw.roundness > 0 ? 16 : 0} onSelect={(roundness) => onChange({ roundness })} />
        </div>
      )}

      {showArrowheads && (
        <div className="sketch-prop-row">
          <span className="sketch-prop-label">Arrowheads</span>
          <div className="sketch-arrowheads">
            <Segmented options={arrowheadOptions} value={draw.startArrowhead} onSelect={(startArrowhead) => onChange({ startArrowhead })} />
            <Segmented options={arrowheadOptions} value={draw.endArrowhead} onSelect={(endArrowhead) => onChange({ endArrowhead })} />
          </div>
        </div>
      )}

      {showText && (
        <div className="sketch-prop-row">
          <span className="sketch-prop-label">Font size</span>
          <Segmented
            options={[
              { value: 14, label: 'S', title: 'Small' },
              { value: 20, label: 'M', title: 'Medium' },
              { value: 28, label: 'L', title: 'Large' },
              { value: 40, label: 'XL', title: 'Extra large' },
            ]}
            value={draw.fontSize}
            onSelect={(fontSize) => onChange({ fontSize })}
          />
        </div>
      )}

      <div className="sketch-prop-row">
        <span className="sketch-prop-label">Stroke opacity</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={draw.opacity}
          onChange={(event) => onChange({ opacity: Number(event.target.value) })}
        />
      </div>

      {showFill && (
        <div className="sketch-prop-row">
          <span className="sketch-prop-label">Fill opacity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={draw.fillOpacity}
            onChange={(event) => onChange({ fillOpacity: Number(event.target.value) })}
          />
        </div>
      )}

      {hasSelection && (
        <>
          <div className="sketch-prop-row">
            <span className="sketch-prop-label">Layers</span>
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
          </div>
          <div className="sketch-prop-row">
            <span className="sketch-prop-label">Actions</span>
            <div className="sketch-segmented">
              <button type="button" aria-label="Duplicate" title="Duplicate" onClick={() => onAction('duplicate')}>
                <Icon name="duplicate" size={16} />
              </button>
              <button type="button" aria-label="Delete" title="Delete" onClick={() => onAction('delete')}>
                <Icon name="delete" size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
