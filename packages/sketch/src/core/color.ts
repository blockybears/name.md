import type { ColorToken, SketchColor } from './types'

// Theme tokens resolve to CSS custom properties the host (e.g. name.md) defines
// per theme. The fallbacks keep the engine usable standalone or in a host that
// hasn't defined the variables. Pinned literal colors are emitted verbatim.
const tokenVar: Record<ColorToken, string> = {
  foreground: 'var(--sketch-foreground, #1f2933)',
  muted: 'var(--sketch-muted, #6b7280)',
  accent: 'var(--sketch-accent, #2563eb)',
  surface: 'var(--sketch-surface, transparent)',
  canvas: 'var(--sketch-canvas, transparent)',
}

export function resolveColor(color: SketchColor): string {
  return color.kind === 'token' ? tokenVar[color.token] : color.value
}

/** The CSS variable name for a token, for hosts that want to set them directly. */
export function tokenCssVar(t: ColorToken): string {
  return `--sketch-${t}`
}
