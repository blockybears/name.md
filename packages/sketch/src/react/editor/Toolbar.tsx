import { useEffect, useRef, useState } from 'react'
import type { DiagramKind } from '../../core'
import { DIAGRAM_KINDS } from '../../core'
import type { ToolId } from './types'

const tools: Array<{ id: ToolId; label: string; title: string; key: string }> = [
  { id: 'select', label: '⤢', title: 'Select', key: 'V' },
  { id: 'rectangle', label: '▭', title: 'Rectangle', key: 'R' },
  { id: 'ellipse', label: '◯', title: 'Ellipse', key: 'O' },
  { id: 'diamond', label: '◇', title: 'Diamond', key: 'D' },
  { id: 'arrow', label: '↗', title: 'Arrow', key: 'A' },
  { id: 'line', label: '╱', title: 'Line', key: 'L' },
  { id: 'freedraw', label: '✎', title: 'Draw', key: 'P' },
  { id: 'text', label: 'T', title: 'Text', key: 'T' },
]

export interface ToolbarProps {
  tool: ToolId
  onTool: (tool: ToolId) => void
  onInsertDiagram: (kind: DiagramKind) => void
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onFit: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onSetView: () => void
  onExit?: () => void
}

export function Toolbar({
  tool,
  onTool,
  onInsertDiagram,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFit,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSetView,
  onExit,
}: ToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  return (
    <div className="sketch-topbar">
      <div className="sketch-tools">
        {tools.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={tool === entry.id}
            title={`${entry.title} (${entry.key})`}
            onClick={() => onTool(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="sketch-topbar-spacer" />

      <div className="sketch-diagram-menu" ref={menuRef}>
        <button type="button" className="sketch-diagram-trigger" onClick={() => setMenuOpen((value) => !value)}>
          Diagram ▾
        </button>
        {menuOpen && (
          <div className="sketch-diagram-dropdown">
            {DIAGRAM_KINDS.map((kind) => (
              <button
                key={kind.id}
                type="button"
                onClick={() => {
                  onInsertDiagram(kind.id)
                  setMenuOpen(false)
                }}
              >
                {kind.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sketch-zoom">
        <button type="button" title="Zoom out" onClick={onZoomOut}>
          −
        </button>
        <button type="button" title="Reset zoom" onClick={onZoomReset}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" title="Zoom in" onClick={onZoomIn}>
          +
        </button>
        <button type="button" title="Fit to content" onClick={onFit}>
          ⤢fit
        </button>
      </div>

      <div className="sketch-history">
        <button type="button" title="Undo (Ctrl/Cmd+Z)" disabled={!canUndo} onClick={onUndo}>
          ↶
        </button>
        <button type="button" title="Redo (Ctrl/Cmd+Shift+Z)" disabled={!canRedo} onClick={onRedo}>
          ↷
        </button>
      </div>

      <button type="button" className="sketch-setview" title="Set the framing used when reading" onClick={onSetView}>
        Set view
      </button>
      {onExit && (
        <button type="button" className="sketch-done" onClick={onExit}>
          Done
        </button>
      )}
    </div>
  )
}
