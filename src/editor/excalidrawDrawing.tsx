/* eslint-disable react-refresh/only-export-components */
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { Suspense, lazy, useState } from 'react'
import { fencedBlockMarkdown } from './fencedBlock'

const ExcalidrawCanvas = lazy(() => import('./ExcalidrawCanvas'))

function ExcalidrawView({ node, updateAttributes }: NodeViewProps) {
  const code = String(node.attrs.code ?? '')
  const [editing, setEditing] = useState(false)

  return (
    <NodeViewWrapper className="excalidraw-block" contentEditable={false}>
      <div className="excalidraw-toolbar">
        <button type="button" className="excalidraw-edit-toggle" onClick={() => setEditing((value) => !value)}>
          {editing ? 'Done' : 'Edit drawing'}
        </button>
      </div>
      <div className={editing ? 'excalidraw-stage is-editing' : 'excalidraw-stage'}>
        <Suspense fallback={<div className="excalidraw-placeholder">Loading drawing…</div>}>
          <ExcalidrawCanvas code={code} editing={editing} onChangeScene={(next) => updateAttributes({ code: next })} />
        </Suspense>
      </div>
    </NodeViewWrapper>
  )
}

/**
 * Freeform Excalidraw drawing block. The scene (elements + files) is stored as
 * JSON in a ```excalidraw fence. App-only rendering: in-app it shows an SVG
 * preview with an inline Excalidraw editor; elsewhere it degrades to a JSON
 * code block. Excalidraw is lazily imported so it stays out of the main bundle.
 */
export const ExcalidrawDrawing = Node.create({
  name: 'excalidrawDrawing',

  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      code: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-excalidraw') ?? '',
        renderHTML: (attributes: { code?: string }) => ({ 'data-excalidraw': attributes.code ?? '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-excalidraw]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ class: 'excalidraw-block' }, HTMLAttributes)]
  },

  ...fencedBlockMarkdown('excalidrawDrawing', 'excalidraw'),

  addNodeView() {
    return ReactNodeViewRenderer(ExcalidrawView)
  },
})
