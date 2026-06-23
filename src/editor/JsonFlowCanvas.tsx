import { useMemo } from 'react'
import { Background, Controls, MiniMap, Position, ReactFlow, type Node as FlowNodeType } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { buildJsonFlow, type JsonFlowKind } from './jsonFlowLayout'

const kindColors: Record<JsonFlowKind, string> = {
  object: '#3b82f6',
  array: '#8b5cf6',
  string: '#10b981',
  number: '#f59e0b',
  boolean: '#ef4444',
  null: '#6b7280',
}

type JsonFlowCanvasProps = {
  code: string
}

export default function JsonFlowCanvas({ code }: JsonFlowCanvasProps) {
  const { nodes, edges, error, truncated } = useMemo(() => buildJsonFlow(code), [code])

  const flowNodes = useMemo<FlowNodeType[]>(
    () =>
      nodes.map((node) => ({
        id: node.id,
        position: node.position,
        data: { label: node.data.label },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          borderLeft: `4px solid ${kindColors[node.data.kind]}`,
          borderRadius: 6,
          padding: '4px 10px',
          fontSize: 12,
          fontFamily: 'var(--mono, monospace)',
          background: 'var(--editor-bg, #fff)',
          color: 'var(--text, #111)',
          maxWidth: 220,
        },
      })),
    [nodes],
  )

  if (error) {
    return <div className="jsonflow-error">Invalid JSON: {error}</div>
  }

  if (flowNodes.length === 0) {
    return <div className="jsonflow-placeholder">Empty — edit to add JSON.</div>
  }

  return (
    <>
      {truncated && <div className="jsonflow-truncated">Large document — graph truncated for performance.</div>}
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        fitView
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </>
  )
}
