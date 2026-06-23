import { useEffect, useMemo, useRef } from 'react'
import { Excalidraw, exportToSvg } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

type Scene = {
  elements: unknown[]
  appState: { viewBackgroundColor?: string }
  files: Record<string, unknown>
}

function parseScene(code: string): Scene {
  if (!code.trim()) {
    return { elements: [], appState: {}, files: {} }
  }
  try {
    const data = JSON.parse(code) as Partial<Scene> & { appState?: { viewBackgroundColor?: string } }
    return {
      elements: Array.isArray(data.elements) ? data.elements : [],
      appState: { viewBackgroundColor: data.appState?.viewBackgroundColor },
      files: (data.files as Record<string, unknown>) ?? {},
    }
  } catch {
    return { elements: [], appState: {}, files: {} }
  }
}

type ExcalidrawCanvasProps = {
  code: string
  editing: boolean
  onChangeScene: (code: string) => void
}

export default function ExcalidrawCanvas({ code, editing, onChangeScene }: ExcalidrawCanvasProps) {
  // Parse once on mount so live edits aren't clobbered by the incoming prop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialScene = useMemo(() => parseScene(code), [])
  const previewScene = useMemo(() => parseScene(code), [code])
  const previewRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef(0)

  useEffect(() => {
    if (editing) {
      return
    }
    let cancelled = false
    const container = previewRef.current
    if (!container) {
      return
    }
    if (previewScene.elements.length === 0) {
      container.innerHTML = ''
      return
    }
    void exportToSvg({
      elements: previewScene.elements,
      appState: { ...previewScene.appState, exportBackground: true },
      files: previewScene.files,
    } as unknown as Parameters<typeof exportToSvg>[0]).then((svg: SVGSVGElement) => {
      if (!cancelled && previewRef.current) {
        svg.setAttribute('style', 'max-width:100%;height:auto')
        previewRef.current.innerHTML = ''
        previewRef.current.appendChild(svg)
      }
    })
    return () => {
      cancelled = true
    }
  }, [editing, previewScene])

  if (editing) {
    return (
      <div className="excalidraw-host">
        <Excalidraw
          initialData={
            {
              elements: initialScene.elements,
              appState: { viewBackgroundColor: initialScene.appState.viewBackgroundColor ?? '#ffffff' },
              files: initialScene.files,
              scrollToContent: true,
            } as unknown as Parameters<typeof Excalidraw>[0]['initialData']
          }
          onChange={(elements, appState, files) => {
            window.clearTimeout(debounceRef.current)
            debounceRef.current = window.setTimeout(() => {
              onChangeScene(
                JSON.stringify({
                  type: 'excalidraw',
                  version: 2,
                  elements,
                  appState: { viewBackgroundColor: appState.viewBackgroundColor },
                  files,
                }),
              )
            }, 600)
          }}
        />
      </div>
    )
  }

  if (previewScene.elements.length === 0) {
    return <div className="excalidraw-placeholder">Empty drawing — click Edit to draw.</div>
  }

  return <div ref={previewRef} className="excalidraw-preview" />
}
