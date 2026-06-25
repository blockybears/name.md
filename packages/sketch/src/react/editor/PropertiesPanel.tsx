import type { Arrowhead, FillStyle, StrokeStyle } from '../../core'
import { ColorControl } from './ColorControl'
import type { DrawState } from './types'

export type LayerAction = 'front' | 'forward' | 'backward' | 'back' | 'duplicate' | 'delete'

export interface PropertiesPanelProps {
  draw: DrawState
  hasSelection: boolean
  showFill: boolean
  showEdges: boolean
  showArrowheads: boolean
  showText: boolean
  onChange: (patch: Partial<DrawState>) => void
  onAction: (action: LayerAction) => void
}

interface SegOption<T> {
  value: T
  label: string
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
          title={option.title}
          onClick={() => onSelect(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

const fillStyleOptions: SegOption<FillStyle>[] = [
  { value: 'none', label: '∅', title: 'No fill' },
  { value: 'hachure', label: '▨', title: 'Hachure' },
  { value: 'solid', label: '■', title: 'Solid' },
]

const strokeWidthOptions: SegOption<number>[] = [
  { value: 1, label: '┄', title: 'Thin' },
  { value: 2, label: '─', title: 'Medium' },
  { value: 4, label: '━', title: 'Bold' },
]

const strokeStyleOptions: SegOption<StrokeStyle>[] = [
  { value: 'solid', label: '──', title: 'Solid' },
  { value: 'dashed', label: '- -', title: 'Dashed' },
  { value: 'dotted', label: '···', title: 'Dotted' },
]

const sloppinessOptions: SegOption<'clean' | 'soft' | 'sketchy'>[] = [
  { value: 'clean', label: 'Clean', title: 'Crisp geometry' },
  { value: 'soft', label: 'Soft', title: 'Lightly hand-drawn' },
  { value: 'sketchy', label: 'Sketch', title: 'Fully hand-drawn' },
]

const edgeOptions: SegOption<number>[] = [
  { value: 0, label: '⊏', title: 'Sharp corners' },
  { value: 16, label: '◜', title: 'Round corners' },
]

const arrowheadOptions: SegOption<Arrowhead>[] = [
  { value: 'none', label: '—', title: 'None' },
  { value: 'arrow', label: '›', title: 'Arrow' },
  { value: 'triangle', label: '▸', title: 'Triangle' },
  { value: 'dot', label: '•', title: 'Dot' },
]

export function PropertiesPanel({
  draw,
  hasSelection,
  showFill,
  showEdges,
  showArrowheads,
  showText,
  onChange,
  onAction,
}: PropertiesPanelProps) {
  return (
    <aside className="sketch-properties" aria-label="Drawing properties">
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
              <button type="button" title="Send to back" onClick={() => onAction('back')}>
                ⤓
              </button>
              <button type="button" title="Send backward" onClick={() => onAction('backward')}>
                ↓
              </button>
              <button type="button" title="Bring forward" onClick={() => onAction('forward')}>
                ↑
              </button>
              <button type="button" title="Bring to front" onClick={() => onAction('front')}>
                ⤒
              </button>
            </div>
          </div>
          <div className="sketch-prop-row">
            <span className="sketch-prop-label">Actions</span>
            <div className="sketch-segmented">
              <button type="button" title="Duplicate" onClick={() => onAction('duplicate')}>
                ⧉
              </button>
              <button type="button" title="Delete" onClick={() => onAction('delete')}>
                🗑
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
