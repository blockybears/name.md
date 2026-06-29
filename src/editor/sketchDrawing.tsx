/* eslint-disable react-refresh/only-export-components */
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { Suspense, lazy, useCallback, useMemo } from 'react'
import { parseScene, serializeScene, type Scene } from '@namemd/sketch'
import { SketchView } from '@namemd/sketch/react'
import { fencedBlockMarkdown } from './fencedBlock'

// The interactive canvas loads from a dedicated subpath so it code-splits out of
// the main bundle; the lightweight SketchView renders while that chunk loads.
const SketchCanvas = lazy(() =>
  import('@namemd/sketch/react/canvas').then((mod) => ({ default: mod.SketchCanvas })),
)

function isEmptyScene(scene: Scene): boolean {
  return scene.elements.length === 0 && (scene.diagrams?.length ?? 0) === 0
}

function SketchDrawingView({ node, updateAttributes, editor }: NodeViewProps) {
  const code = String(node.attrs.code ?? '')
  const scene = useMemo<Scene>(() => parseScene(code), [code])
  const editable = editor.isEditable

  const persist = useCallback(
    (next: Scene) => {
      updateAttributes({ code: serializeScene(next) })
    },
    [updateAttributes],
  )

  // Read-only documents render the static, non-interactive view (no chrome).
  if (!editable) {
    return (
      <NodeViewWrapper className="sketch-drawing-block" contentEditable={false}>
        {isEmptyScene(scene) ? (
          <div className="sketch-drawing-empty">Empty drawing</div>
        ) : (
          <SketchView scene={scene} className="sketch-drawing-svg" />
        )}
      </NodeViewWrapper>
    )
  }

  // Editable: the full canvas inline. It opens locked (read mode) with its own
  // pan/fullscreen/unlock chrome; a freshly inserted empty drawing opens in edit
  // mode so you can start drawing straight away.
  const fallback = isEmptyScene(scene) ? (
    <div className="sketch-drawing-loading">Loading editor…</div>
  ) : (
    <SketchView scene={scene} className="sketch-drawing-svg" />
  )

  return (
    <NodeViewWrapper className="sketch-drawing-block" contentEditable={false}>
      {/* Keep mouse/keyboard interaction inside the canvas: stopping these from
          reaching ProseMirror prevents it from node-selecting the block (so a
          stray Delete can't wipe the whole drawing) and lets the canvas own its
          own keys — it deletes the selected canvas item instead. */}
      <div
        className="sketch-drawing-stage"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Delete' || event.key === 'Backspace') {
            event.stopPropagation()
          }
        }}
      >
        <Suspense fallback={fallback}>
          <SketchCanvas scene={scene} onChange={persist} defaultMode={isEmptyScene(scene) ? 'edit' : 'read'} style={{ height: 420 }} />
        </Suspense>
      </div>
    </NodeViewWrapper>
  )
}

/**
 * Unified drawing/diagram block backed by the @namemd/sketch engine. The scene
 * is stored as JSON in a ```sketch fence (app-first; degrades to a JSON code
 * block elsewhere). In an editable document it renders the interactive canvas
 * inline — locked read mode with pan/fullscreen/unlock chrome — and adapts to
 * the host theme; read-only documents get the lightweight static view.
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
