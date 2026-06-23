/* eslint-disable react-refresh/only-export-components */
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { Suspense, lazy, useState } from 'react'
import { fencedBlockMarkdown } from './fencedBlock'

const JsonFlowCanvas = lazy(() => import('./JsonFlowCanvas'))

function JsonFlowView({ node, updateAttributes }: NodeViewProps) {
  const code = String(node.attrs.code ?? '')
  const [editing, setEditing] = useState(() => !code.trim())
  const [draft, setDraft] = useState(code)

  const toggle = () => {
    if (editing) {
      if (draft !== code) {
        updateAttributes({ code: draft })
      }
      setEditing(false)
    } else {
      setDraft(code)
      setEditing(true)
    }
  }

  const commit = () => {
    if (draft !== code) {
      updateAttributes({ code: draft })
    }
  }

  return (
    <NodeViewWrapper className="jsonflow-block" contentEditable={false}>
      <div className="jsonflow-toolbar">
        <button type="button" className="jsonflow-edit-toggle" onClick={toggle}>
          {editing ? 'Done' : 'Edit JSON'}
        </button>
      </div>

      {editing && (
        <textarea
          className="jsonflow-source"
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          placeholder='{ "example": [1, 2, 3] }'
        />
      )}

      <div className="jsonflow-canvas">
        <Suspense fallback={<div className="jsonflow-placeholder">Loading graph…</div>}>
          <JsonFlowCanvas code={editing ? draft : code} />
        </Suspense>
      </div>
    </NodeViewWrapper>
  )
}

/**
 * JSON → flow graph block (vscode-json-flow style). App-only rendering: the
 * source is stored in a ```json-flow fence so it degrades to a readable JSON
 * code block anywhere that can't render the interactive React Flow graph.
 */
export const JsonFlow = Node.create({
  name: 'jsonFlow',

  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      code: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-json-flow') ?? element.textContent ?? '',
        renderHTML: (attributes: { code?: string }) => ({ 'data-json-flow': attributes.code ?? '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-json-flow]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ class: 'jsonflow-block' }, HTMLAttributes)]
  },

  ...fencedBlockMarkdown('jsonFlow', 'json-flow'),

  addNodeView() {
    return ReactNodeViewRenderer(JsonFlowView)
  },
})
