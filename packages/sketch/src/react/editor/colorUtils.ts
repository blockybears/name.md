import type { SketchColor } from '../../core'

export function colorPreview(color: SketchColor): string {
  if (color.kind === 'literal') {
    return color.value === 'transparent' ? 'transparent' : color.value
  }
  return `var(--sketch-${color.token}, #888)`
}

export function isTransparent(color: SketchColor): boolean {
  return color.kind === 'literal' && color.value === 'transparent'
}
