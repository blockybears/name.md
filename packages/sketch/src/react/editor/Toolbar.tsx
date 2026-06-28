import type { DiagramKind } from '../../core'
import { DIAGRAM_KINDS } from '../../core'
import { colorPreview } from './colorUtils'
import { Flyout } from './Flyout'
import { Icon, type IconName } from './Icon'
import { StyleMenu } from './StyleMenu'
import { TextMenu } from './TextMenu'
import type { DrawState, ToolId } from './types'

const shapeTools: Array<{ id: ToolId; icon: IconName; label: string }> = [
  { id: 'rectangle', icon: 'rectangle', label: 'Rectangle' },
  { id: 'ellipse', icon: 'ellipse', label: 'Ellipse' },
  { id: 'diamond', icon: 'diamond', label: 'Diamond' },
]
const connectorTools: Array<{ id: ToolId; icon: IconName; label: string }> = [
  { id: 'arrow', icon: 'arrow', label: 'Arrow' },
  { id: 'line', icon: 'line', label: 'Line' },
]

export interface ToolbarProps {
  tool: ToolId
  onTool: (tool: ToolId) => void
  onInsertDiagram: (kind: DiagramKind) => void
  onImport: (type: 'mermaid' | 'json') => void
  onNewChart: () => void
  onClear: () => void
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
  gridEnabled: boolean
  onToggleGrid: () => void
  codeOpen: boolean
  onToggleCode: () => void
  // Style context (which controls apply to the current selection/tool).
  draw: DrawState
  showFill: boolean
  showEdges: boolean
  showArrowheads: boolean
  showText: boolean
  showLinePlacement: boolean
  onDrawChange: (patch: Partial<DrawState>) => void
  onExit?: () => void
}

/** A labelled option button inside a flyout menu. */
function MenuItem({ icon, label, active, onClick }: { icon?: IconName; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="sketch-menu-item" aria-pressed={active} onClick={onClick}>
      {icon && <Icon name={icon} size={16} />}
      <span>{label}</span>
    </button>
  )
}

/**
 * Edit-mode toolbar: a tidy row of grouped icon menus. The top level shows only
 * the current tool/state; detailed options live inside each flyout.
 */
export function Toolbar(props: ToolbarProps) {
  const { tool, onTool, draw } = props
  const shapeActive = shapeTools.some((t) => t.id === tool)
  const connectorActive = connectorTools.some((t) => t.id === tool)
  const activeShape = shapeTools.find((t) => t.id === tool) ?? shapeTools[0]
  const activeConnector = connectorTools.find((t) => t.id === tool) ?? connectorTools[0]

  return (
    <div className="sketch-topbar">
      <div className="sketch-tb-group">
        <button type="button" className="sketch-tool-btn" aria-label="Select" aria-pressed={tool === 'select'} title="Select (V)" onClick={() => onTool('select')}>
          <Icon name="select" />
        </button>

        <Flyout title="Insert" trigger={<><Icon name="diagram" /><Icon name="chevron-down" size={13} className="sketch-tool-caret" /></>}>
          {(close) => (
            <div className="sketch-menu-list">
              <div className="sketch-menu-label">Diagrams</div>
              {DIAGRAM_KINDS.map((kind) => (
                <MenuItem key={kind.id} label={kind.label} onClick={() => { props.onInsertDiagram(kind.id); close() }} />
              ))}
              <div className="sketch-menu-divider" />
              <MenuItem icon="chart" label="Chart from data…" onClick={() => { props.onNewChart(); close() }} />
              <MenuItem icon="import" label="Import Mermaid…" onClick={() => { props.onImport('mermaid'); close() }} />
              <MenuItem icon="import" label="Import JSON…" onClick={() => { props.onImport('json'); close() }} />
            </div>
          )}
        </Flyout>

        <Flyout title="Shape" active={shapeActive} tool trigger={<><Icon name={activeShape.icon} /><Icon name="chevron-down" size={13} className="sketch-tool-caret" /></>}>
          {(close) => (
            <div className="sketch-menu-list">
              {shapeTools.map((t) => (
                <MenuItem key={t.id} icon={t.icon} label={t.label} active={tool === t.id} onClick={() => { onTool(t.id); close() }} />
              ))}
            </div>
          )}
        </Flyout>

        <Flyout title="Connector" active={connectorActive} tool trigger={<><Icon name={activeConnector.icon} /><Icon name="chevron-down" size={13} className="sketch-tool-caret" /></>}>
          {(close) => (
            <div className="sketch-menu-list">
              {connectorTools.map((t) => (
                <MenuItem key={t.id} icon={t.icon} label={t.label} active={tool === t.id} onClick={() => { onTool(t.id); close() }} />
              ))}
            </div>
          )}
        </Flyout>

        <button type="button" className="sketch-tool-btn" aria-label="Draw" aria-pressed={tool === 'freedraw'} title="Freehand draw (P)" onClick={() => onTool('freedraw')}>
          <Icon name="freedraw" />
        </button>

        <Flyout title="Text" active={tool === 'text' || props.showText} trigger={<><Icon name="text" /><Icon name="chevron-down" size={13} className="sketch-tool-caret" /></>}>
          {(close) => (
            <div className="sketch-menu-list">
              <MenuItem icon="text" label="Text tool" active={tool === 'text'} onClick={() => { onTool('text'); close() }} />
              <div className="sketch-menu-divider" />
              <TextMenu draw={draw} showLinePlacement={props.showLinePlacement} onChange={props.onDrawChange} />
            </div>
          )}
        </Flyout>
      </div>

      <div className="sketch-tb-divider" />

      <Flyout title="Style" className="sketch-style-flyout" trigger={<><span className="sketch-tool-swatch" style={{ background: colorPreview(draw.stroke) }} /><Icon name="chevron-down" size={13} className="sketch-tool-caret" /></>}>
        <StyleMenu draw={draw} showFill={props.showFill} showEdges={props.showEdges} showArrowheads={props.showArrowheads} onChange={props.onDrawChange} />
      </Flyout>

      <div className="sketch-topbar-spacer" />

      <Flyout title="View" align="right" trigger={<Icon name="magnify" />}>
        <div className="sketch-menu-list">
          <div className="sketch-style-seg">
            <span className="sketch-prop-label">Zoom</span>
            <div className="sketch-segmented">
              <button type="button" aria-label="Zoom out" title="Zoom out" onClick={props.onZoomOut}><Icon name="zoom-out" size={16} /></button>
              <button type="button" title="Reset zoom" onClick={props.onZoomReset}>{Math.round(props.zoom * 100)}%</button>
              <button type="button" aria-label="Zoom in" title="Zoom in" onClick={props.onZoomIn}><Icon name="zoom-in" size={16} /></button>
            </div>
          </div>
          <MenuItem icon="fit" label="Fit to content" onClick={props.onFit} />
          <MenuItem icon="set-view" label="Set read framing" onClick={props.onSetView} />
        </div>
      </Flyout>

      <Flyout title="More" align="right" trigger={<Icon name="more" />}>
        {(close) => (
          <div className="sketch-menu-list">
            <MenuItem icon="undo" label="Undo" onClick={props.onUndo} />
            <MenuItem icon="redo" label="Redo" onClick={props.onRedo} />
            <div className="sketch-menu-divider" />
            <MenuItem icon="snap" label={props.snapEnabled ? 'Snapping: on' : 'Snapping: off'} active={props.snapEnabled} onClick={props.onToggleSnap} />
            <MenuItem icon="grid" label={props.gridEnabled ? 'Grid: on' : 'Grid: off'} active={props.gridEnabled} onClick={props.onToggleGrid} />
            <MenuItem icon="code" label="View JSON" active={props.codeOpen} onClick={() => { props.onToggleCode(); close() }} />
            <div className="sketch-menu-divider" />
            <button type="button" className="sketch-menu-item sketch-menu-danger" onClick={() => { props.onClear(); close() }}>
              <Icon name="delete" size={16} /> <span>Clear canvas</span>
            </button>
          </div>
        )}
      </Flyout>

      <div className="sketch-tb-divider" />

      {props.onExit && (
        <button type="button" className="sketch-done" title="Lock — back to read mode" onClick={props.onExit}>
          <Icon name="lock" size={15} /> Read
        </button>
      )}
    </div>
  )
}
