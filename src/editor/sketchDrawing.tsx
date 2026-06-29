/* eslint-disable react-refresh/only-export-components */
import { Node, mergeAttributes, type Editor } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { NodeSelection, type EditorState } from '@tiptap/pm/state'
import { Suspense, lazy, useCallback, useMemo } from 'react'
import { parseScene, serializeScene, type Scene } from '@namemd/sketch'
import { SketchView } from '@namemd/sketch/react'
import { fencedBlockMarkdown } from './fencedBlock'

// The host wires a confirmer (e.g. a styled dialog) so deleting a whole drawing
// from the surrounding document asks first. Returns true to proceed.
let deleteConfirmer: (() => Promise<boolean>) | null = null
export function setSketchDeleteConfirmer(confirmer: (() => Promise<boolean>) | null) {
  deleteConfirmer = confirmer
}

/** The start position of a sketchDrawing node that this delete direction would
 *  remove (node-selected, or the adjacent top-level block), else null. */
function sketchDeletePos(state: EditorState, dir: 'backward' | 'forward'): number | null {
  const { selection, doc } = state
  if (selection instanceof NodeSelection && selection.node.type.name === 'sketchDrawing') {
    return selection.from
  }
  if (!selection.empty) {
    return null
  }
  const { $from } = selection
  if ($from.depth < 1) {
    return null
  }
  if (dir === 'backward') {
    if ($from.parentOffset !== 0) {
      return null
    }
    const before = $from.before(1)
    const node = before > 0 ? doc.resolve(before).nodeBefore : null
    return node?.type.name === 'sketchDrawing' ? before - node.nodeSize : null
  }
  if ($from.parentOffset !== $from.parent.content.size) {
    return null
  }
  const after = $from.after(1)
  const node = doc.resolve(after).nodeAfter
  return node?.type.name === 'sketchDrawing' ? after : null
}

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
      <div className="sketch-drawing-stage">
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

  // Deleting a whole drawing from the document asks for confirmation first (the
  // canvas's own Delete still removes only the selected item). With no confirmer
  // wired, the default deletion is left untouched.
  addKeyboardShortcuts() {
    const guard = (dir: 'backward' | 'forward') => ({ editor }: { editor: Editor }) => {
      const pos = sketchDeletePos(editor.state, dir)
      if (pos == null || !deleteConfirmer) {
        return false
      }
      void deleteConfirmer().then((ok) => {
        if (!ok) {
          return
        }
        const node = editor.state.doc.nodeAt(pos)
        if (node?.type.name === 'sketchDrawing') {
          editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize))
        }
      })
      return true
    }
    return { Backspace: guard('backward'), Delete: guard('forward') }
  },

  addNodeView() {
    // Tell ProseMirror to ignore DOM events inside the canvas: it never
    // node-selects the block (so a stray Delete can't wipe the whole drawing)
    // and the canvas owns its own mouse/keyboard — without stopping propagation,
    // so dragging to draw/move/resize stays a single natural gesture.
    return ReactNodeViewRenderer(SketchDrawingView, { stopEvent: () => true })
  },
})
