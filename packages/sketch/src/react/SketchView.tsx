import { useMemo, type CSSProperties } from 'react'
import { renderScene, type RenderOptions, type Scene } from '../core'

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
      style={{ background: rendered.background, ...style }}
      viewBox={rendered.viewBox}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
    >
      {rendered.elements.map((element) => (
        <g key={element.id} transform={element.transform} opacity={element.opacity}>
          {element.shapes.map((shape, index) =>
            shape.kind === 'path' ? (
              <path
                key={index}
                d={shape.d}
                stroke={shape.stroke}
                strokeWidth={shape.strokeWidth}
                fill={shape.fill}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : (
              <text
                key={index}
                x={shape.x}
                y={shape.y}
                fontSize={shape.fontSize}
                fontFamily={shape.fontFamily}
                textAnchor={shape.anchor}
                fill={shape.fill}
              >
                {shape.text}
              </text>
            ),
          )}
        </g>
      ))}
    </svg>
  )
}
