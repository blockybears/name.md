import { token } from './types'
import type { DrawStyle, ElementBase, ElementType, Scene, SketchElement } from './types'

let idCounter = 0

/** Reasonably unique id; deterministic-friendly because tests can pass ids in. */
export function generateId(prefix = 'el'): string {
  idCounter += 1
  const rand = Math.floor(Math.random() * 0x7fffffff).toString(36)
  return `${prefix}-${idCounter.toString(36)}-${rand}`
}

export function generateSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

export function createScene(partial: Partial<Scene> = {}): Scene {
  return {
    version: 1,
    elements: partial.elements ?? [],
    background: partial.background ?? token('canvas'),
    defaultStyle: partial.defaultStyle ?? 'soft',
    defaultView: partial.defaultView ?? null,
  }
}

type ElementInput = Partial<ElementBase> & { type: ElementType } & Record<string, unknown>

const baseDefaults = (style: DrawStyle): Omit<ElementBase, 'id' | 'seed'> => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  angle: 0,
  opacity: 1,
  fillOpacity: 1,
  strokeWidth: 2,
  strokeStyle: 'solid',
  style,
  stroke: token('foreground'),
  fill: token('surface'),
  fillStyle: 'none',
  roundness: 0,
  groupIds: [],
})

/**
 * Create an element of the given type, filling defaults. Type-specific fields
 * (points, text, …) are merged from `props`. Pass `id`/`seed` for determinism.
 */
export function createElement(props: ElementInput, style: DrawStyle = 'sketchy'): SketchElement {
  const base = {
    ...baseDefaults(style),
    id: generateId(),
    seed: generateSeed(),
  }

  const merged = { ...base, ...props } as Record<string, unknown>

  // Ensure type-specific required fields exist so the renderer never crashes.
  if (props.type === 'line' || props.type === 'arrow' || props.type === 'freedraw') {
    merged.points = (props as { points?: unknown }).points ?? [
      { x: 0, y: 0 },
      { x: merged.width as number, y: merged.height as number },
    ]
  }
  if (props.type === 'arrow') {
    merged.startArrowhead = (props as { startArrowhead?: unknown }).startArrowhead ?? 'none'
    merged.endArrowhead = (props as { endArrowhead?: unknown }).endArrowhead ?? 'arrow'
  }
  if (props.type === 'text') {
    merged.text = (props as { text?: unknown }).text ?? ''
    merged.fontSize = (props as { fontSize?: unknown }).fontSize ?? 20
    merged.fontFamily = (props as { fontFamily?: unknown }).fontFamily ?? 'inherit'
    merged.align = (props as { align?: unknown }).align ?? 'left'
  }

  return merged as unknown as SketchElement
}

// --- immutable scene operations (history is layered on in the editor phase) ---

export function addElements(scene: Scene, elements: SketchElement[]): Scene {
  return { ...scene, elements: [...scene.elements, ...elements] }
}

export function updateElement(scene: Scene, id: string, patch: Partial<SketchElement>): Scene {
  return {
    ...scene,
    elements: scene.elements.map((element) =>
      element.id === id ? ({ ...element, ...patch } as SketchElement) : element,
    ),
  }
}

export function removeElements(scene: Scene, ids: Set<string>): Scene {
  return { ...scene, elements: scene.elements.filter((element) => !ids.has(element.id)) }
}
