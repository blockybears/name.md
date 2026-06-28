import { useEffect, useRef, useState } from 'react'
import { literal, token, type ColorToken, type SketchColor } from '../../core'
import { colorPreview, isTransparent } from './colorUtils'

const tokenSwatches: Array<{ token: ColorToken; label: string }> = [
  { token: 'foreground', label: 'Foreground' },
  { token: 'muted', label: 'Muted' },
  { token: 'accent', label: 'Accent' },
  { token: 'surface', label: 'Surface' },
]

const presetColors = [
  '#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00',
  '#9c36b5', '#0c8599', '#e8590c', '#ffffff', 'transparent',
]

function colorEquals(a: SketchColor, b: SketchColor): boolean {
  return a.kind === b.kind && (a.kind === 'token' ? a.token === (b as typeof a).token : a.value === (b as typeof a).value)
}

/** Inline color picker (theme tokens + presets + custom hex), no trigger. */
export function ColorSwatches({
  value,
  allowTransparent,
  onChange,
}: {
  value: SketchColor
  allowTransparent?: boolean
  onChange: (color: SketchColor) => void
}) {
  const [hex, setHex] = useState(value.kind === 'literal' ? value.value : '#1971c2')

  const pick = (color: SketchColor) => {
    onChange(color)
    if (color.kind === 'literal' && color.value !== 'transparent') {
      setHex(color.value)
    }
  }

  return (
    <div className="sketch-color-fields">
      {/* Primary control: the current colour opens the OS colour picker. */}
      <div className="sketch-color-main">
        <label
          className="sketch-color-pick"
          style={{ background: colorPreview(value) }}
          data-checkerboard={isTransparent(value) ? 'true' : undefined}
          title="Pick a colour"
        >
          <input
            type="color"
            value={/^#([0-9a-f]{6})$/i.test(hex) ? hex : '#1971c2'}
            onChange={(event) => {
              setHex(event.target.value)
              pick(literal(event.target.value))
            }}
          />
        </label>
        <input
          type="text"
          className="sketch-color-hex"
          value={hex}
          spellCheck={false}
          onChange={(event) => setHex(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
              pick(literal(hex))
            }
          }}
          onBlur={() => {
            if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
              pick(literal(hex))
            }
          }}
        />
      </div>
      {/* Quick-access colours: theme tokens + presets, condensed to one line. */}
      <div className="sketch-quick-row">
        {tokenSwatches.map((swatch) => (
          <button
            key={swatch.token}
            type="button"
            className="sketch-quick-cell"
            aria-pressed={colorEquals(value, token(swatch.token))}
            style={{ background: `var(--sketch-${swatch.token}, #888)` }}
            title={swatch.label}
            onClick={() => pick(token(swatch.token))}
          />
        ))}
        {presetColors
          .filter((color) => allowTransparent || color !== 'transparent')
          .map((color) => (
            <button
              key={color}
              type="button"
              className="sketch-quick-cell"
              aria-pressed={colorEquals(value, literal(color))}
              style={{ background: color === 'transparent' ? 'transparent' : color }}
              data-checkerboard={color === 'transparent' ? 'true' : undefined}
              title={color}
              onClick={() => pick(literal(color))}
            />
          ))}
      </div>
    </div>
  )
}

export interface ColorControlProps {
  label: string
  value: SketchColor
  allowTransparent?: boolean
  onChange: (color: SketchColor) => void
}

/** Labelled color control with its own trigger swatch + popover (panel layout). */
export function ColorControl({ label, value, allowTransparent, onChange }: ColorControlProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="sketch-color" ref={rootRef}>
      <span className="sketch-prop-label">{label}</span>
      <button
        type="button"
        className="sketch-color-trigger"
        style={{ background: colorPreview(value) }}
        title={`${label} color`}
        onClick={() => setOpen((value) => !value)}
        data-checkerboard={isTransparent(value) ? 'true' : undefined}
      />
      {open && (
        <div className="sketch-color-popover">
          <ColorSwatches value={value} allowTransparent={allowTransparent} onChange={onChange} />
        </div>
      )}
    </div>
  )
}
