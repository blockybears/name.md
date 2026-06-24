import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import {
  type Camera,
  type DrawStyle,
  type FillStyle,
  type Point,
  type Rect,
  type Scene,
  type SketchColor,
  type SketchElement,
  applyResize,
  angleToPointer,
  cameraViewRect,
  createElement,
  elementBounds,
  elementsInMarquee,
  generateId,
  generateSeed,
  handlePositions,
  hitTest,
  History,
  identityCamera,
  literal,
  moveElement,
  normalizeRect,
  rectToViewBox,
  RESIZE_HANDLES,
  renderScene,
  resizeRect,
  sceneContentBounds,
  token,
  unionRects,
  viewBoxForScene,
  type ResizeHandle,
} from '../core'
import { RenderedScene } from './RenderedScene'
import './canvas.css'

type ToolId = 'select' | 'rectangle' | 'ellipse' | 'diamond' | 'line'

interface DrawStyleState {
  stroke: SketchColor
  fill: SketchColor
  fillStyle: FillStyle
  strokeWidth: number
  style: DrawStyle
}

type Gesture =
  | { mode: 'none' }
  | { mode: 'pan'; startClient: Point; startCamera: Camera }
  | { mode: 'create'; id: string; start: Point; base: Scene }
  | { mode: 'move'; start: Point; ids: Set<string>; base: Scene }
  | { mode: 'resize'; handle: ResizeHandle; elementId: string; baseRect: Rect; base: Scene }
  | { mode: 'rotate'; elementId: string; base: Scene }
  | { mode: 'marquee'; start: Point; additive: boolean; baseSelection: string[] }

export interface SketchCanvasProps {
  scene: Scene
  onChange?: (scene: Scene) => void
  onExit?: () => void
  className?: string
  style?: CSSProperties
}

const HANDLE_PX = 9
const ROTATE_OFFSET_PX = 26
const HIT_TOL_PX = 6

const strokeSwatches: Array<{ label: string; color: SketchColor }> = [
  { label: 'Foreground', color: token('foreground') },
  { label: 'Muted', color: token('muted') },
  { label: 'Accent', color: token('accent') },
  { label: 'Red', color: literal('#e11d48') },
  { label: 'Green', color: literal('#059669') },
]

const fillSwatches: Array<{ label: string; color: SketchColor }> = [
  { label: 'Surface', color: token('surface') },
  { label: 'Accent', color: token('accent') },
  { label: 'Yellow', color: literal('#fde68a') },
  { label: 'Pink', color: literal('#fbcfe8') },
]

const toolLabel: Record<ToolId, string> = {
  select: '⤢',
  rectangle: '▭',
  ellipse: '◯',
  diamond: '◇',
  line: '╱',
}

function swatchPreview(color: SketchColor): string {
  return color.kind === 'literal' ? color.value : `var(--sketch-${color.token}, #888)`
}

function sizeCreatedElement(element: SketchElement, start: Point, point: Point, rect: Rect): SketchElement {
  if (element.type === 'line') {
    return {
      ...element,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      points: [
        { x: start.x - rect.x, y: start.y - rect.y },
        { x: point.x - rect.x, y: point.y - rect.y },
      ],
    }
  }
  return { ...element, x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

/** Pure transform of the base scene given a gesture + current pointer. */
function applyGesture(gesture: Gesture, point: Point): Scene | null {
  switch (gesture.mode) {
    case 'create': {
      const rect = normalizeRect(gesture.start, point)
      return {
        ...gesture.base,
        elements: gesture.base.elements.map((element) =>
          element.id === gesture.id ? sizeCreatedElement(element, gesture.start, point, rect) : element,
        ),
      }
    }
    case 'move': {
      const dx = point.x - gesture.start.x
      const dy = point.y - gesture.start.y
      return {
        ...gesture.base,
        elements: gesture.base.elements.map((element) => (gesture.ids.has(element.id) ? moveElement(element, dx, dy) : element)),
      }
    }
    case 'resize': {
      const baseElement = gesture.base.elements.find((element) => element.id === gesture.elementId)
      if (!baseElement) {
        return null
      }
      const nextRect = resizeRect(gesture.baseRect, gesture.handle, point)
      return {
        ...gesture.base,
        elements: gesture.base.elements.map((element) => (element.id === gesture.elementId ? applyResize(baseElement, nextRect) : element)),
      }
    }
    case 'rotate': {
      const baseElement = gesture.base.elements.find((element) => element.id === gesture.elementId)
      if (!baseElement) {
        return null
      }
      const angle = angleToPointer(baseElement, point)
      return {
        ...gesture.base,
        elements: gesture.base.elements.map((element) => (element.id === gesture.elementId ? { ...element, angle } : element)),
      }
    }
    default:
      return null
  }
}

function useElementSize() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  useEffect(() => {
    const node = ref.current
    if (!node) {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect
      setSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return { ref, size }
}

export function SketchCanvas({ scene: initialScene, onChange, onExit, className, style }: SketchCanvasProps) {
  const { ref: containerRef, size } = useElementSize()
  const svgRef = useRef<SVGSVGElement | null>(null)

  const [scene, setScene] = useState<Scene>(initialScene)
  const historyRef = useRef(new History<Scene>(initialScene))
  const [history, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const [tool, setTool] = useState<ToolId>('select')
  const [selected, setSelected] = useState<string[]>([])
  const [camera, setCamera] = useState<Camera>(identityCamera)
  const [spaceDown, setSpaceDown] = useState(false)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const gestureRef = useRef<Gesture>({ mode: 'none' })

  const [draw, setDraw] = useState<DrawStyleState>({
    stroke: token('foreground'),
    fill: token('surface'),
    fillStyle: 'none',
    strokeWidth: 2,
    style: initialScene.defaultStyle,
  })

  const syncHistory = useCallback(() => {
    setHistoryState({ canUndo: historyRef.current.canUndo(), canRedo: historyRef.current.canRedo() })
  }, [])

  const commit = useCallback(
    (next: Scene) => {
      historyRef.current.push(next)
      setScene(next)
      syncHistory()
      onChange?.(next)
    },
    [onChange, syncHistory],
  )

  // Frame the content on first mount.
  const framedRef = useRef(false)
  useEffect(() => {
    if (framedRef.current || size.width <= 1) {
      return
    }
    framedRef.current = true
    const content = sceneContentBounds(initialScene.elements) ?? viewBoxForScene(initialScene)
    const padded = { x: content.x - 40, y: content.y - 40, width: content.width + 80, height: content.height + 80 }
    const zoom = Math.min(size.width / padded.width, size.height / padded.height, 1.5)
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
    setCamera({
      zoom: safeZoom,
      x: padded.x - (size.width / safeZoom - padded.width) / 2,
      y: padded.y - (size.height / safeZoom - padded.height) / 2,
    })
  }, [initialScene, size.width, size.height])

  const viewRect = useMemo(() => cameraViewRect(camera, size.width, size.height), [camera, size])
  const rendered = useMemo(() => renderScene(scene, { viewBox: viewRect }), [scene, viewRect])
  const scenePerPixel = 1 / camera.zoom

  const toScene = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) {
        return { x: 0, y: 0 }
      }
      return { x: camera.x + (clientX - rect.left) / camera.zoom, y: camera.y + (clientY - rect.top) / camera.zoom }
    },
    [camera],
  )

  const selectedElements = useMemo(() => scene.elements.filter((element) => selected.includes(element.id)), [scene.elements, selected])
  const selectionRect = useMemo<Rect | null>(() => {
    if (selectedElements.length === 0) {
      return null
    }
    if (selectedElements.length === 1 && selectedElements[0].angle === 0) {
      const el = selectedElements[0]
      return { x: el.x, y: el.y, width: el.width, height: el.height }
    }
    return unionRects(selectedElements.map(elementBounds))
  }, [selectedElements])
  const canResize = selectedElements.length === 1 && selectedElements[0].angle === 0

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      const point = toScene(event.clientX, event.clientY)

      if (spaceDown || event.button === 1) {
        gestureRef.current = { mode: 'pan', startClient: { x: event.clientX, y: event.clientY }, startCamera: camera }
        return
      }

      if (tool !== 'select') {
        const created = {
          ...createElement({ type: tool, x: point.x, y: point.y, width: 0, height: 0 }, draw.style),
          stroke: draw.stroke,
          fill: draw.fill,
          fillStyle: draw.fillStyle,
          strokeWidth: draw.strokeWidth,
        }
        const base = { ...scene, elements: [...scene.elements, created] }
        setScene(base)
        setSelected([created.id])
        gestureRef.current = { mode: 'create', id: created.id, start: point, base }
        return
      }

      if (canResize && selectionRect) {
        const tol = HIT_TOL_PX * scenePerPixel
        const rotate = { x: selectionRect.x + selectionRect.width / 2, y: selectionRect.y - ROTATE_OFFSET_PX * scenePerPixel }
        if (Math.hypot(point.x - rotate.x, point.y - rotate.y) <= HANDLE_PX * scenePerPixel) {
          gestureRef.current = { mode: 'rotate', elementId: selectedElements[0].id, base: scene }
          return
        }
        const handles = handlePositions(selectionRect)
        for (const handle of RESIZE_HANDLES) {
          const pos = handles[handle]
          if (Math.abs(point.x - pos.x) <= tol && Math.abs(point.y - pos.y) <= tol) {
            gestureRef.current = { mode: 'resize', handle, elementId: selectedElements[0].id, baseRect: selectionRect, base: scene }
            return
          }
        }
      }

      const hit = hitTest(scene.elements, point, HIT_TOL_PX * scenePerPixel)
      if (hit) {
        let nextSelection = selected
        if (event.shiftKey) {
          nextSelection = selected.includes(hit.id) ? selected.filter((id) => id !== hit.id) : [...selected, hit.id]
        } else if (!selected.includes(hit.id)) {
          nextSelection = [hit.id]
        }
        setSelected(nextSelection)
        gestureRef.current = { mode: 'move', start: point, ids: new Set(nextSelection), base: scene }
        return
      }

      gestureRef.current = { mode: 'marquee', start: point, additive: event.shiftKey, baseSelection: event.shiftKey ? selected : [] }
      if (!event.shiftKey) {
        setSelected([])
      }
    },
    [camera, canResize, draw, scene, scenePerPixel, selected, selectedElements, selectionRect, spaceDown, tool, toScene],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const gesture = gestureRef.current
      if (gesture.mode === 'none') {
        return
      }
      if (gesture.mode === 'pan') {
        const dx = (event.clientX - gesture.startClient.x) / camera.zoom
        const dy = (event.clientY - gesture.startClient.y) / camera.zoom
        setCamera({ ...gesture.startCamera, x: gesture.startCamera.x - dx, y: gesture.startCamera.y - dy })
        return
      }
      const point = toScene(event.clientX, event.clientY)
      if (gesture.mode === 'marquee') {
        const rect = normalizeRect(gesture.start, point)
        setMarquee(rect)
        const inside = elementsInMarquee(scene.elements, rect).map((element) => element.id)
        setSelected(gesture.additive ? Array.from(new Set([...gesture.baseSelection, ...inside])) : inside)
        return
      }
      const next = applyGesture(gesture, point)
      if (next) {
        setScene(next)
      }
    },
    [camera.zoom, scene.elements, toScene],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const gesture = gestureRef.current
      gestureRef.current = { mode: 'none' }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      setMarquee(null)

      if (gesture.mode === 'none' || gesture.mode === 'pan' || gesture.mode === 'marquee') {
        return
      }

      const point = toScene(event.clientX, event.clientY)
      const next = applyGesture(gesture, point)
      if (!next) {
        return
      }

      if (gesture.mode === 'create') {
        const created = next.elements.find((element) => element.id === gesture.id)
        if (created && created.width < 3 && created.height < 3) {
          commit({ ...next, elements: next.elements.filter((element) => element.id !== gesture.id) })
          setSelected([])
          return
        }
        setTool('select')
      }
      commit(next)
    },
    [commit, toScene],
  )

  const onWheel = useCallback(
    (event: ReactWheelEvent<SVGSVGElement>) => {
      if (!event.ctrlKey && !event.metaKey && event.deltaMode === 0 && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        return
      }
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) {
        return
      }
      const factor = Math.exp(-event.deltaY * 0.0015)
      const nextZoom = Math.max(0.1, Math.min(8, camera.zoom * factor))
      const cx = event.clientX - rect.left
      const cy = event.clientY - rect.top
      setCamera({ zoom: nextZoom, x: camera.x + cx / camera.zoom - cx / nextZoom, y: camera.y + cy / camera.zoom - cy / nextZoom })
    },
    [camera],
  )

  const deleteSelected = useCallback(() => {
    if (selected.length === 0) {
      return
    }
    const ids = new Set(selected)
    commit({ ...scene, elements: scene.elements.filter((element) => !ids.has(element.id)) })
    setSelected([])
  }, [commit, scene, selected])

  const duplicateSelected = useCallback(() => {
    if (selected.length === 0) {
      return
    }
    const ids = new Set(selected)
    const copies = scene.elements
      .filter((element) => ids.has(element.id))
      .map((element) => ({ ...element, id: generateId(), seed: generateSeed(), x: element.x + 16, y: element.y + 16 }))
    commit({ ...scene, elements: [...scene.elements, ...copies] })
    setSelected(copies.map((copy) => copy.id))
  }, [commit, scene, selected])

  const undo = useCallback(() => {
    const next = historyRef.current.undo()
    setScene(next)
    syncHistory()
    onChange?.(next)
  }, [onChange, syncHistory])

  const redo = useCallback(() => {
    const next = historyRef.current.redo()
    setScene(next)
    syncHistory()
    onChange?.(next)
  }, [onChange, syncHistory])

  const applyStyle = useCallback(
    (patch: Partial<DrawStyleState>) => {
      setDraw((current) => ({ ...current, ...patch }))
      if (selected.length > 0) {
        const ids = new Set(selected)
        commit({
          ...scene,
          elements: scene.elements.map((element) => (ids.has(element.id) ? ({ ...element, ...patch } as SketchElement) : element)),
        })
      }
    },
    [commit, scene, selected],
  )

  const setDefaultView = useCallback(() => {
    commit({ ...scene, defaultView: { ...viewRect } })
  }, [commit, scene, viewRect])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === ' ') {
        setSpaceDown(true)
      }
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelected()
        return
      }
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteSelected()
      } else if (event.key === 'Escape') {
        setSelected([])
        setTool('select')
      } else if (event.key === 'v') {
        setTool('select')
      } else if (event.key === 'r') {
        setTool('rectangle')
      } else if (event.key === 'o') {
        setTool('ellipse')
      } else if (event.key === 'd') {
        setTool('diamond')
      } else if (event.key === 'l') {
        setTool('line')
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ') {
        setSpaceDown(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [deleteSelected, duplicateSelected, redo, undo])

  const handleSize = HANDLE_PX * scenePerPixel
  const rotatePos = selectionRect ? { x: selectionRect.x + selectionRect.width / 2, y: selectionRect.y - ROTATE_OFFSET_PX * scenePerPixel } : null

  return (
    <div ref={containerRef} className={`sketch-canvas ${className ?? ''}`} style={style}>
      <svg
        ref={svgRef}
        className={`sketch-canvas-surface ${spaceDown ? 'is-panning' : ''}`}
        viewBox={rectToViewBox(viewRect)}
        preserveAspectRatio="none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x={viewRect.x} y={viewRect.y} width={viewRect.width} height={viewRect.height} fill={rendered.background} />
        <RenderedScene elements={rendered.elements} />

        {selectionRect && (
          <g pointerEvents="none">
            <rect
              x={selectionRect.x}
              y={selectionRect.y}
              width={selectionRect.width}
              height={selectionRect.height}
              fill="none"
              stroke="var(--sketch-accent, #2563eb)"
              strokeWidth={1 * scenePerPixel}
              strokeDasharray={`${4 * scenePerPixel} ${3 * scenePerPixel}`}
            />
            {rotatePos && (
              <>
                <line
                  x1={selectionRect.x + selectionRect.width / 2}
                  y1={selectionRect.y}
                  x2={rotatePos.x}
                  y2={rotatePos.y}
                  stroke="var(--sketch-accent, #2563eb)"
                  strokeWidth={1 * scenePerPixel}
                />
                <circle cx={rotatePos.x} cy={rotatePos.y} r={handleSize / 2} fill="var(--sketch-accent, #2563eb)" />
              </>
            )}
            {canResize &&
              RESIZE_HANDLES.map((handle) => {
                const pos = handlePositions(selectionRect)[handle]
                return (
                  <rect
                    key={handle}
                    x={pos.x - handleSize / 2}
                    y={pos.y - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    fill="#fff"
                    stroke="var(--sketch-accent, #2563eb)"
                    strokeWidth={1 * scenePerPixel}
                  />
                )
              })}
          </g>
        )}

        {marquee && (
          <rect
            x={marquee.x}
            y={marquee.y}
            width={marquee.width}
            height={marquee.height}
            fill="var(--sketch-accent, #2563eb)"
            fillOpacity={0.08}
            stroke="var(--sketch-accent, #2563eb)"
            strokeWidth={1 * scenePerPixel}
            pointerEvents="none"
          />
        )}
      </svg>

      <div className="sketch-toolbar">
        {(['select', 'rectangle', 'ellipse', 'diamond', 'line'] as ToolId[]).map((id) => (
          <button key={id} aria-pressed={tool === id} title={id} onClick={() => setTool(id)}>
            {toolLabel[id]}
          </button>
        ))}
        <span className="sketch-sep" />
        {strokeSwatches.map((swatch) => (
          <button
            key={swatch.label}
            className="sketch-swatch"
            aria-pressed={JSON.stringify(draw.stroke) === JSON.stringify(swatch.color)}
            title={`Stroke: ${swatch.label}`}
            style={{ background: swatchPreview(swatch.color) }}
            onClick={() => applyStyle({ stroke: swatch.color })}
          />
        ))}
        <span className="sketch-sep" />
        <button aria-pressed={draw.fillStyle === 'none'} title="No fill" onClick={() => applyStyle({ fillStyle: 'none' })}>
          ∅
        </button>
        <button aria-pressed={draw.fillStyle === 'hachure'} title="Hachure fill" onClick={() => applyStyle({ fillStyle: 'hachure' })}>
          ▨
        </button>
        <button aria-pressed={draw.fillStyle === 'solid'} title="Solid fill" onClick={() => applyStyle({ fillStyle: 'solid' })}>
          ■
        </button>
        {fillSwatches.map((swatch) => (
          <button
            key={swatch.label}
            className="sketch-swatch"
            aria-pressed={JSON.stringify(draw.fill) === JSON.stringify(swatch.color)}
            title={`Fill: ${swatch.label}`}
            style={{ background: swatchPreview(swatch.color) }}
            onClick={() => applyStyle({ fill: swatch.color })}
          />
        ))}
        <span className="sketch-sep" />
        {[1, 2, 4].map((width) => (
          <button key={width} aria-pressed={draw.strokeWidth === width} title={`Stroke width ${width}`} onClick={() => applyStyle({ strokeWidth: width })}>
            {width === 1 ? '┄' : width === 2 ? '─' : '━'}
          </button>
        ))}
        <span className="sketch-sep" />
        <button aria-pressed={draw.style === 'clean'} title="Clean" onClick={() => applyStyle({ style: 'clean' })}>
          clean
        </button>
        <button aria-pressed={draw.style === 'sketchy'} title="Sketchy" onClick={() => applyStyle({ style: 'sketchy' })}>
          sketchy
        </button>
        <span className="sketch-sep" />
        <button title="Undo" disabled={!history.canUndo} onClick={undo}>
          ↶
        </button>
        <button title="Redo" disabled={!history.canRedo} onClick={redo}>
          ↷
        </button>
        <button title="Duplicate" disabled={selected.length === 0} onClick={duplicateSelected}>
          ⧉
        </button>
        <button title="Delete" disabled={selected.length === 0} onClick={deleteSelected}>
          🗑
        </button>
        <span className="sketch-sep" />
        <button title="Set the framing used when reading" onClick={setDefaultView}>
          Set view
        </button>
        {onExit && (
          <button title="Done" onClick={onExit}>
            Done
          </button>
        )}
      </div>
    </div>
  )
}
