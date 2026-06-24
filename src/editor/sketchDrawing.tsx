/* eslint-disable react-refresh/only-export-components */
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { Suspense, lazy, useMemo, useState } from 'react'
import { parseScene, serializeScene, type Scene } from '@namemd/sketch'
import { SketchView } from '@namemd/sketch/react'
import { fencedBlockMarkdown } from './fencedBlock'

// The interactive editor loads only when editing. Imported from a dedicated
// subpath (not the react barrel that SketchView uses) so it truly code-splits.
const SketchCanvas = lazy(() =>
  import('@namemd/sketch/react/canvas').then((mod) => ({ default: mod.SketchCanvas })),
)

function SketchDrawingView({ node, updateAttributes, editor }: NodeViewProps) {
  const code = String(node.attrs.code ?? '')
  const [editing, setEditing] = useState(false)
  const scene = useMemo<Scene>(() => parseScene(code), [code])
  const editable = editor.isEditable

  const persist = (next: Scene) => {
    updateAttributes({ code: serializeScene(next) })
  }

  return (
    <NodeViewWrapper className="sketch-drawing-block" contentEditable={false}>
      {editing ? (
        <div className="sketch-drawing-stage">
          <Suspense fallback={<div className="sketch-drawing-loading">Loading editor…</div>}>
            <SketchCanvas scene={scene} onChange={persist} onExit={() => setEditing(false)} />
          </Suspense>
        </div>
      ) : (
        <div
          className="sketch-drawing-readview"
          role={editable ? 'button' : undefined}
          tabIndex={editable ? 0 : undefined}
          onDoubleClick={() => editable && setEditing(true)}
          onKeyDown={(event) => {
            if (editable && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault()
              setEditing(true)
            }
          }}
        >
          {scene.elements.length === 0 ? (
            <div className="sketch-drawing-empty">{editable ? 'Double-click to draw' : 'Empty drawing'}</div>
          ) : (
            <SketchView scene={scene} className="sketch-drawing-svg" />
          )}
          {editable && (
            <button type="button" className="sketch-drawing-edit" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
      )}
    </NodeViewWrapper>
  )
}

/**
 * Unified drawing/diagram block backed by the @namemd/sketch engine. The scene
 * is stored as JSON in a ```sketch fence (app-first; degrades to a JSON code
 * block elsewhere). Read mode renders the scene's default view inline and
 * adapts to the host theme; double-click / Edit opens the interactive editor.
 */
export const SketchDrawing = Node.create({
  name: 'sketchDrawing',

  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      code: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-sketch') ?? '',
        renderHTML: (attributes: { code?: string }) => ({ 'data-sketch': attributes.code ?? '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-sketch]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ class: 'sketch-drawing-block' }, HTMLAttributes)]
  },

  ...fencedBlockMarkdown('sketchDrawing', 'sketch'),

  addNodeView() {
    return ReactNodeViewRenderer(SketchDrawingView)
  },
})
