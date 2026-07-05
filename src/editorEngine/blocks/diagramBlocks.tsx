/* eslint-disable react-refresh/only-export-components --
   Block-renderer module (mounted imperatively by a CM6 widget). */
import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import { registerBlock } from './registry'
import { replaceBlock, type ReactBlockRenderArgs } from './reactWidget'
import './diagram.css'

const ExcalidrawCanvas = lazy(() => import('../../editor/ExcalidrawCanvas'))
const JsonFlowCanvas = lazy(() => import('../../editor/JsonFlowCanvas'))

function useFenceWriter(view: ReactBlockRenderArgs['view'], pos: ReactBlockRenderArgs['pos'], fence: string) {
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (code: string) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => replaceBlock(view, pos, '```' + fence + '\n' + code + '\n```'), 400)
  }
}

/** Mermaid preview — renders the DSL to SVG via the lazily-imported library. */
function MermaidPreview({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [id] = useState(() => 'mmd-' + Math.round(performance.now()) + '-' + Math.round(Math.random() * 1e6))
  useEffect(() => {
    let alive = true
    import('mermaid').then((mod) => {
      mod.default.initialize({ startOnLoad: false })
      mod.default
        .render(id, code.trim() || 'graph TD; empty;')
        .then(({ svg }) => { if (alive && ref.current) ref.current.innerHTML = svg })
        .catch(() => { if (alive && ref.current) ref.current.textContent = 'Invalid Mermaid syntax' })
    })
    return () => { alive = false }
  }, [code, id])
  return <div ref={ref} className="ee-mermaid" />
}

// Generic diagram block: a preview with an Edit/Preview toggle and a source
// textarea. Uncontrolled (code owned locally) so doc write-backs don't reset it.
function SourceDiagram({
  view, pos, source, fence, preview,
}: ReactBlockRenderArgs & { fence: string; preview: (code: string) => ReactNode }) {
  const [code, setCode] = useState(source)
  const [editing, setEditing] = useState(source.trim() === '')
  const write = useFenceWriter(view, pos, fence)
  return (
    <div className="ee-diagram" contentEditable={false}>
      <div className="ee-diagram-toolbar">
        <button type="button" onMouseDown={(e) => { e.preventDefault(); setEditing((v) => !v) }}>
          {editing ? 'Preview' : 'Edit source'}
        </button>
      </div>
      {editing ? (
        <textarea
          className="ee-diagram-source"
          defaultValue={code}
          spellCheck={false}
          onChange={(e) => { setCode(e.target.value); write(e.target.value) }}
        />
      ) : (
        <div className="ee-diagram-preview">{preview(code)}</div>
      )}
    </div>
  )
}

function ExcalidrawBlock({ view, pos, source }: ReactBlockRenderArgs) {
  const [code, setCode] = useState(source)
  const [editing, setEditing] = useState(source.trim() === '')
  const write = useFenceWriter(view, pos, 'excalidraw')
  return (
    <div className="ee-diagram" contentEditable={false}>
      <div className="ee-diagram-toolbar">
        <button type="button" onMouseDown={(e) => { e.preventDefault(); setEditing((v) => !v) }}>
          {editing ? 'Preview' : 'Edit'}
        </button>
      </div>
      <Suspense fallback={<div className="ee-diagram-loading">Loading…</div>}>
        <ExcalidrawCanvas code={code} editing={editing} onChangeScene={(next) => { setCode(next); write(next) }} />
      </Suspense>
    </div>
  )
}

let registered = false
export function registerDiagramBlocks() {
  if (registered) return
  registered = true
  registerBlock('mermaid', (args) => <SourceDiagram {...args} fence="mermaid" preview={(code) => <MermaidPreview code={code} />} />)
  registerBlock('json-flow', (args) => (
    <SourceDiagram {...args} fence="json-flow" preview={(code) => (
      <Suspense fallback={<div className="ee-diagram-loading">Loading…</div>}><JsonFlowCanvas code={code} /></Suspense>
    )} />
  ))
  registerBlock('excalidraw', (args) => <ExcalidrawBlock {...args} />)
}
