import type { RenderElement } from '../core'

/** Renders pre-computed RenderElements as SVG groups. Used by both the
 *  read-only view and the interactive canvas (inside their own <svg>). */
export function RenderedScene({ elements }: { elements: RenderElement[] }) {
  return (
    <>
      {elements.map((element) => (
        <g key={element.id} transform={element.transform}>
          {element.shapes.map((shape, index) =>
            shape.kind === 'path' ? (
              <path
                key={index}
                d={shape.d}
                stroke={shape.stroke}
                strokeWidth={shape.strokeWidth}
                fill={shape.fill}
                strokeDasharray={shape.dash}
                opacity={shape.opacity}
                transform={shape.rotate ? `rotate(${shape.rotate.deg} ${shape.rotate.cx} ${shape.rotate.cy})` : undefined}
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
                fontWeight={shape.fontWeight}
                fontStyle={shape.fontStyle}
                textAnchor={shape.anchor}
                dominantBaseline={shape.baseline === 'middle' ? 'central' : undefined}
                fill={shape.fill}
                opacity={shape.opacity}
                transform={shape.rotate ? `rotate(${shape.rotate.deg} ${shape.rotate.cx} ${shape.rotate.cy})` : undefined}
              >
                {shape.text}
              </text>
            ),
          )}
        </g>
      ))}
    </>
  )
}
