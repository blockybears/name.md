import type { ReactBlockRenderer } from './reactWidget'

// Custom fenced-block renderers, keyed by the fence info string (e.g. ```table,
// ```sketch). A fence whose language matches a registered key is rendered as a
// React block widget instead of styled code.

const renderers = new Map<string, ReactBlockRenderer>()

export function registerBlock(info: string, renderer: ReactBlockRenderer) {
  renderers.set(info, renderer)
}

export function getBlockRenderer(info: string): ReactBlockRenderer | undefined {
  return renderers.get(info.trim().toLowerCase())
}

export function isRegisteredBlock(info: string): boolean {
  return renderers.has(info.trim().toLowerCase())
}
