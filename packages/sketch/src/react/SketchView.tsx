import { useMemo, type CSSProperties } from 'react'
import { renderScene, type RenderOptions, type Scene } from '../core'
import { RenderedScene } from './RenderedScene'

export interface SketchViewProps {
  scene: Scene
  className?: string
  style?: CSSProperties
  /** Override the framing; defaults to the scene's saved default view. */
  options?: RenderOptions
}

/**
 * Read-only, non-interactive render of a scene. Renders the scene's default
 * view framing and adapts to the host theme purely through CSS variables, so
 * theme switches need no re-render. This is what shows while reading the page.
 */
export function SketchView({ scene, className, style, options }: SketchViewProps) {
  const rendered = useMemo(() => renderScene(scene, options), [scene, options])

  return (
    <svg
      className={className}
      // Honour the saved canvas height so read mode matches what was set in the
      // editor (an explicit style.height from the host still wins).
      style={{ background: rendered.background, ...(scene.canvasHeight ? { height: scene.canvasHeight } : {}), ...style }}
      viewBox={rendered.viewBox}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
    >
      <RenderedScene elements={rendered.elements} />
    </svg>
  )
}
