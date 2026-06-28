import type { FontFamily } from './types'

/** CSS font stacks for the three typefaces. The handwritten face falls back
 *  through commonly-installed casual fonts; mono and rounded are widely safe. */
export const FONT_STACKS: Record<FontFamily, string> = {
  rounded: "var(--sketch-ui-font, 'Inter'), ui-rounded, 'Segoe UI', system-ui, sans-serif",
  hand: "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', 'Comic Sans', 'Chalkboard SE', 'Marker Felt', cursive",
  mono: "ui-monospace, 'Cascadia Code', 'JetBrains Mono', 'Source Code Pro', Menlo, Consolas, monospace",
}

export function fontStack(family: FontFamily | undefined): string {
  return FONT_STACKS[family ?? 'rounded']
}
