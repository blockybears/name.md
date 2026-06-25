import { useEffect, useRef, useState } from 'react'
import type { DiagramKind } from '../../core'
import { DIAGRAM_KINDS } from '../../core'
import { Icon, type IconName } from './Icon'
import type { ToolId } from './types'

const tools: Array<{ id: ToolId; icon: IconName; title: string; key: string }> = [
  { id: 'select', icon: 'select', title: 'Select', key: 'V' },
  { id: 'rectangle', icon: 'rectangle', title: 'Rectangle', key: 'R' },
  { id: 'ellipse', icon: 'ellipse', title: 'Ellipse', key: 'O' },
  { id: 'diamond', icon: 'diamond', title: 'Diamond', key: 'D' },
  { id: 'arrow', icon: 'arrow', title: 'Arrow', key: 'A' },
  { id: 'line', icon: 'line', title: 'Line', key: 'L' },
  { id: 'freedraw', icon: 'freedraw', title: 'Draw', key: 'P' },
  { id: 'text', icon: 'text', title: 'Text', key: 'T' },
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
  snapEnabled: boolean
  onToggleSnap: () => void
  codeOpen: boolean
  onToggleCode: () => void
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
  snapEnabled,
  onToggleSnap,
  codeOpen,
  onToggleCode,
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
            className="sketch-icon-btn"
            aria-pressed={tool === entry.id}
            aria-label={entry.title}
            title={`${entry.title} (${entry.key})`}
            onClick={() => onTool(entry.id)}
          >
            <Icon name={entry.icon} />
          </button>
        ))}
      </div>

      <div className="sketch-topbar-spacer" />

      <div className="sketch-diagram-menu" ref={menuRef}>
        <button type="button" className="sketch-diagram-trigger" title="Insert a diagram" onClick={() => setMenuOpen((value) => !value)}>
          <Icon name="diagram" />
          <span>Diagram</span>
          <span className="sketch-caret">▾</span>
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
        <button type="button" className="sketch-icon-btn" aria-label="Zoom out" title="Zoom out" onClick={onZoomOut}>
          <Icon name="zoom-out" />
        </button>
        <button type="button" className="sketch-zoom-level" title="Reset zoom" onClick={onZoomReset}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" className="sketch-icon-btn" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn}>
          <Icon name="zoom-in" />
        </button>
        <button type="button" className="sketch-icon-btn" aria-label="Fit to content" title="Fit to content" onClick={onFit}>
          <Icon name="fit" />
        </button>
      </div>

      <div className="sketch-history">
        <button type="button" className="sketch-icon-btn" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" disabled={!canUndo} onClick={onUndo}>
          <Icon name="undo" />
        </button>
        <button type="button" className="sketch-icon-btn" aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)" disabled={!canRedo} onClick={onRedo}>
          <Icon name="redo" />
        </button>
      </div>

      <button
        type="button"
        className="sketch-icon-btn"
        aria-label="Snap to grid and guides"
        aria-pressed={snapEnabled}
        title="Snap to grid and alignment guides"
        onClick={onToggleSnap}
      >
        <Icon name="snap" />
      </button>
      <button
        type="button"
        className="sketch-icon-btn"
        aria-label="Code view"
        aria-pressed={codeOpen}
        title="View / edit as JSON"
        onClick={onToggleCode}
      >
        <Icon name="code" />
      </button>
      <button type="button" className="sketch-icon-btn" aria-label="Set read view" title="Set the framing used when reading" onClick={onSetView}>
        <Icon name="set-view" />
      </button>
      {onExit && (
        <button type="button" className="sketch-done" onClick={onExit}>
          Done
        </button>
      )}
    </div>
  )
}
