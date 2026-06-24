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
  type DiagramKind,
  type Point,
  type Rect,
  type Scene,
  type SketchElement,
  applyResize,
  angleToPointer,
  bindableAt,
  cameraViewRect,
  createDiagram,
  createElement,
  elementBounds,
  elementsInMarquee,
  generateId,
  generateSeed,
  handlePositions,
  hitTest,
  History,
  identityCamera,
  isBindable,
  moveElement,
  normalizeRect,
  recomputeBindings,
  rectToViewBox,
  RESIZE_HANDLES,
  renderScene,
  resizeRect,
  sceneContentBounds,
  simplifyPoints,
  unionRects,
  viewBoxForScene,
  type ResizeHandle,
} from '../core'
import { RenderedScene } from './RenderedScene'
import { Toolbar } from './editor/Toolbar'
import { PropertiesPanel, type LayerAction } from './editor/PropertiesPanel'
import { defaultDrawState, type DrawState, type ToolId } from './editor/types'
import './editor/editor.css'

type Gesture =
  | { mode: 'none' }
  | { mode: 'pan'; startClient: Point; startCamera: Camera }
  | { mode: 'create'; id: string; start: Point; base: Scene }
  | { mode: 'arrow'; id: string; start: Point; startBindId: string | null; base: Scene }
  | { mode: 'freedraw'; id: string; start: Point; points: Point[]; base: Scene }
  | { mode: 'move'; start: Point; ids: Set<string>; base: Scene }
  | { mode: 'resize'; handle: ResizeHandle; elementId: string; baseRect: Rect; base: Scene }
  | { mode: 'rotate'; elementId: string; base: Scene }
  | { mode: 'marquee'; start: Point; additive: boolean; baseSelection: string[]; base: Scene }

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
const BIND_TOL_PX = 8

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

function measureText(text: string, fontSize: number): { width: number; height: number } {
  const lines = text.split('\n')
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 1)
  return { width: Math.max(20, longest * fontSize * 0.6), height: lines.length * fontSize * 1.25 }
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
  const [bindHighlight, setBindHighlight] = useState<string | null>(null)
  const [editingText, setEditingText] = useState<{ id: string; value: string; isLabel: boolean } | null>(null)
  const gestureRef = useRef<Gesture>({ mode: 'none' })

  const [draw, setDraw] = useState<DrawState>(() => defaultDrawState(initialScene.defaultStyle))

  const syncHistory = useCallback(() => {
    setHistoryState({ canUndo: historyRef.current.canUndo(), canRedo: historyRef.current.canRedo() })
  }, [])

  const commit = useCallback(
    (next: Scene) => {
      const bound = recomputeBindings(next)
      historyRef.current.push(bound)
      setScene(bound)
      syncHistory()
      onChange?.(bound)
    },
    [onChange, syncHistory],
  )

  // Initial camera: honor a saved default view, else fit content. Runs once.
  const framedRef = useRef(false)
  useEffect(() => {
    if (framedRef.current || size.width <= 1) {
      return
    }
    framedRef.current = true
    const target = initialScene.defaultView ?? viewBoxForScene(initialScene)
    const padded = initialScene.defaultView ? target : { x: target.x - 24, y: target.y - 24, width: target.width + 48, height: target.height + 48 }
    const zoom = Math.min(size.width / padded.width, size.height / padded.height, 2)
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
    setCamera({ zoom: safeZoom, x: padded.x - (size.width / safeZoom - padded.width) / 2, y: padded.y - (size.height / safeZoom - padded.height) / 2 })
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

  // --- properties panel context ---
  const selTypes = useMemo(() => new Set(selectedElements.map((element) => element.type)), [selectedElements])
  const fillableActive =
    selectedElements.length > 0
      ? selectedElements.some((element) => ['rectangle', 'ellipse', 'diamond'].includes(element.type))
      : ['rectangle', 'ellipse', 'diamond'].includes(tool)
  const edgesActive = selectedElements.length > 0 ? selTypes.has('rectangle') : tool === 'rectangle'
  const arrowActive = selectedElements.length > 0 ? selTypes.has('arrow') : tool === 'arrow'
  const textActive = selectedElements.length > 0 ? selTypes.has('text') : tool === 'text'

  // --- gesture application (pure) ---
  const applyGesture = useCallback((gesture: Gesture, point: Point): Scene | null => {
    switch (gesture.mode) {
      case 'create': {
        const rect = normalizeRect(gesture.start, point)
        return {
          ...gesture.base,
          elements: gesture.base.elements.map((element) => {
            if (element.id !== gesture.id) {
              return element
            }
            if (element.type === 'line') {
              return { ...element, x: rect.x, y: rect.y, width: rect.width, height: rect.height, points: [{ x: gesture.start.x - rect.x, y: gesture.start.y - rect.y }, { x: point.x - rect.x, y: point.y - rect.y }] }
            }
            return { ...element, x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          }),
        }
      }
      case 'arrow': {
        const minX = Math.min(gesture.start.x, point.x)
        const minY = Math.min(gesture.start.y, point.y)
        return {
          ...gesture.base,
          elements: gesture.base.elements.map((element) =>
            element.id === gesture.id
              ? { ...element, x: minX, y: minY, width: Math.abs(point.x - gesture.start.x), height: Math.abs(point.y - gesture.start.y), points: [{ x: gesture.start.x - minX, y: gesture.start.y - minY }, { x: point.x - minX, y: point.y - minY }] }
              : element,
          ),
        }
      }
      case 'freedraw': {
        const pts = [...gesture.points, point]
        let minX = Infinity
        let minY = Infinity
        for (const p of pts) {
          minX = Math.min(minX, p.x)
          minY = Math.min(minY, p.y)
        }
        return {
          ...gesture.base,
          elements: gesture.base.elements.map((element) =>
            element.id === gesture.id ? { ...element, x: minX, y: minY, width: Math.max(...pts.map((p) => p.x)) - minX, height: Math.max(...pts.map((p) => p.y)) - minY, points: pts.map((p) => ({ x: p.x - minX, y: p.y - minY })) } : element,
          ),
        }
      }
      case 'move': {
        const dx = point.x - gesture.start.x
        const dy = point.y - gesture.start.y
        return recomputeBindings({
          ...gesture.base,
          elements: gesture.base.elements.map((element) => (gesture.ids.has(element.id) ? moveElement(element, dx, dy) : element)),
        })
      }
      case 'resize': {
        const baseElement = gesture.base.elements.find((element) => element.id === gesture.elementId)
        if (!baseElement) {
          return null
        }
        const nextRect = resizeRect(gesture.baseRect, gesture.handle, point)
        return recomputeBindings({
          ...gesture.base,
          elements: gesture.base.elements.map((element) => (element.id === gesture.elementId ? applyResize(baseElement, nextRect) : element)),
        })
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
  }, [])

  const newElementStyle = useMemo(
    () => ({ stroke: draw.stroke, fill: draw.fill, fillStyle: draw.fillStyle, strokeWidth: draw.strokeWidth, strokeStyle: draw.strokeStyle, opacity: draw.opacity, roundness: draw.roundness }),
    [draw],
  )

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (editingText) {
        return
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      const point = toScene(event.clientX, event.clientY)

      if (spaceDown || event.button === 1) {
        gestureRef.current = { mode: 'pan', startClient: { x: event.clientX, y: event.clientY }, startCamera: camera }
        return
      }

      if (tool === 'text') {
        const id = generateId('text')
        const element = createElement({ type: 'text', id, x: point.x, y: point.y, width: 20, height: draw.fontSize * 1.25, text: '', fontSize: draw.fontSize, stroke: draw.stroke, opacity: draw.opacity, style: draw.style }, draw.style)
        setScene((current) => ({ ...current, elements: [...current.elements, element] }))
        setSelected([id])
        setEditingText({ id, value: '', isLabel: false })
        setTool('select')
        return
      }

      if (tool === 'freedraw') {
        const id = generateId('draw')
        const element = createElement({ type: 'freedraw', id, x: point.x, y: point.y, width: 0, height: 0, points: [{ x: 0, y: 0 }], ...newElementStyle }, draw.style)
        const base = { ...scene, elements: [...scene.elements, element] }
        setScene(base)
        gestureRef.current = { mode: 'freedraw', id, start: point, points: [point], base }
        return
      }

      if (tool === 'arrow' || tool === 'line') {
        const id = generateId(tool)
        const startBind = tool === 'arrow' ? bindableAt(scene.elements, point, BIND_TOL_PX * scenePerPixel) : null
        const element = createElement(
          { type: tool, id, x: point.x, y: point.y, width: 0, height: 0, points: [{ x: 0, y: 0 }, { x: 0, y: 0 }], ...newElementStyle, ...(tool === 'arrow' ? { startArrowhead: draw.startArrowhead, endArrowhead: draw.endArrowhead } : {}) },
          draw.style,
        )
        const base = { ...scene, elements: [...scene.elements, element] }
        setScene(base)
        setSelected([id])
        if (tool === 'arrow') {
          gestureRef.current = { mode: 'arrow', id, start: point, startBindId: startBind?.id ?? null, base }
        } else {
          gestureRef.current = { mode: 'create', id, start: point, base }
        }
        return
      }

      if (tool !== 'select') {
        const id = generateId(tool)
        const created = createElement({ type: tool, id, x: point.x, y: point.y, width: 0, height: 0, ...newElementStyle }, draw.style)
        const base = { ...scene, elements: [...scene.elements, created] }
        setScene(base)
        setSelected([id])
        gestureRef.current = { mode: 'create', id, start: point, base }
        return
      }

      // select tool
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

      gestureRef.current = { mode: 'marquee', start: point, additive: event.shiftKey, baseSelection: event.shiftKey ? selected : [], base: scene }
      if (!event.shiftKey) {
        setSelected([])
      }
    },
    [camera, canResize, draw, editingText, newElementStyle, scene, scenePerPixel, selected, selectedElements, selectionRect, spaceDown, tool, toScene],
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

      if (gesture.mode === 'freedraw') {
        gesture.points.push(point)
      }
      if (gesture.mode === 'arrow') {
        const target = bindableAt(scene.elements, point, BIND_TOL_PX * scenePerPixel)
        setBindHighlight(target && target.id !== gesture.id ? target.id : null)
      }

      const next = applyGesture(gesture, point)
      if (next) {
        setScene(next)
      }
    },
    [applyGesture, camera.zoom, scene.elements, scenePerPixel, toScene],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const gesture = gestureRef.current
      gestureRef.current = { mode: 'none' }
      setMarquee(null)
      setBindHighlight(null)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      if (gesture.mode === 'none' || gesture.mode === 'pan' || gesture.mode === 'marquee') {
        return
      }

      const point = toScene(event.clientX, event.clientY)
      let next = applyGesture(gesture, point)
      if (!next) {
        return
      }

      if (gesture.mode === 'create' || gesture.mode === 'arrow') {
        const created = next.elements.find((element) => element.id === gesture.id)
        const tiny = created && created.width < 4 && created.height < 4 && created.type !== 'line' && created.type !== 'arrow'
        if (tiny) {
          commit({ ...next, elements: next.elements.filter((element) => element.id !== gesture.id) })
          setSelected([])
          return
        }
      }

      if (gesture.mode === 'arrow') {
        const endBind = bindableAt(scene.elements, point, BIND_TOL_PX * scenePerPixel)
        next = {
          ...next,
          elements: next.elements.map((element) => {
            if (element.id !== gesture.id || element.type !== 'arrow') {
              return element
            }
            return {
              ...element,
              startBinding: gesture.startBindId ? { elementId: gesture.startBindId, focus: 0, gap: 4 } : undefined,
              endBinding: endBind && endBind.id !== gesture.id ? { elementId: endBind.id, focus: 0, gap: 4 } : undefined,
            }
          }),
        }
        setTool('select')
      }

      if (gesture.mode === 'freedraw') {
        next = {
          ...next,
          elements: next.elements.map((element) =>
            element.id === gesture.id && element.type === 'freedraw' ? { ...element, points: simplifyPoints(element.points, 1.2) } : element,
          ),
        }
      }

      if (gesture.mode === 'create') {
        setTool('select')
      }
      commit(next)
    },
    [applyGesture, commit, scene.elements, scenePerPixel, toScene],
  )

  const onWheel = useCallback(
    (event: ReactWheelEvent<SVGSVGElement>) => {
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

  // --- double-click: edit text/label ---
  const onDoubleClick = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const point = toScene(event.clientX, event.clientY)
      const hit = hitTest(scene.elements, point, HIT_TOL_PX * scenePerPixel)
      if (!hit) {
        return
      }
      if (hit.type === 'text') {
        setSelected([hit.id])
        setEditingText({ id: hit.id, value: hit.text, isLabel: false })
      } else if (hit.type === 'rectangle' || hit.type === 'ellipse' || hit.type === 'diamond') {
        setSelected([hit.id])
        setEditingText({ id: hit.id, value: hit.label ?? '', isLabel: true })
      }
    },
    [scene.elements, scenePerPixel, toScene],
  )

  const commitEditingText = useCallback(() => {
    if (!editingText) {
      return
    }
    const { id, value, isLabel } = editingText
    setEditingText(null)
    const element = scene.elements.find((el) => el.id === id)
    if (!element) {
      return
    }
    if (isLabel) {
      commit({ ...scene, elements: scene.elements.map((el) => (el.id === id ? { ...el, label: value } : el)) })
      return
    }
    if (!value.trim()) {
      commit({ ...scene, elements: scene.elements.filter((el) => el.id !== id) })
      setSelected([])
      return
    }
    const size = measureText(value, element.type === 'text' ? element.fontSize : draw.fontSize)
    commit({
      ...scene,
      elements: scene.elements.map((el) => (el.id === id && el.type === 'text' ? { ...el, text: value, width: size.width, height: size.height } : el)),
    })
  }, [commit, draw.fontSize, editingText, scene])

  // --- toolbar / panel actions ---
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
    const copies = scene.elements.filter((element) => ids.has(element.id)).map((element) => ({ ...element, id: generateId(), seed: generateSeed(), x: element.x + 16, y: element.y + 16, startBinding: undefined, endBinding: undefined }))
    commit({ ...scene, elements: [...scene.elements, ...copies] })
    setSelected(copies.map((copy) => copy.id))
  }, [commit, scene, selected])

  const reorder = useCallback(
    (action: 'front' | 'back' | 'forward' | 'backward') => {
      if (selected.length === 0) {
        return
      }
      const ids = new Set(selected)
      const moving = scene.elements.filter((element) => ids.has(element.id))
      const rest = scene.elements.filter((element) => !ids.has(element.id))
      let next: SketchElement[]
      if (action === 'front') {
        next = [...rest, ...moving]
      } else if (action === 'back') {
        next = [...moving, ...rest]
      } else {
        // forward/backward: shift by one within the full array
        next = [...scene.elements]
        const indices = next.map((el, i) => (ids.has(el.id) ? i : -1)).filter((i) => i >= 0)
        const order = action === 'forward' ? indices.reverse() : indices
        for (const index of order) {
          const swap = action === 'forward' ? index + 1 : index - 1
          if (swap >= 0 && swap < next.length && !ids.has(next[swap].id)) {
            ;[next[index], next[swap]] = [next[swap], next[index]]
          }
        }
      }
      commit({ ...scene, elements: next })
    },
    [commit, scene, selected],
  )

  const onLayerAction = useCallback(
    (action: LayerAction) => {
      if (action === 'duplicate') {
        duplicateSelected()
      } else if (action === 'delete') {
        deleteSelected()
      } else {
        reorder(action)
      }
    },
    [deleteSelected, duplicateSelected, reorder],
  )

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

  const onDrawChange = useCallback(
    (patch: Partial<DrawState>) => {
      setDraw((current) => ({ ...current, ...patch }))
      if (selected.length > 0) {
        const ids = new Set(selected)
        commit({ ...scene, elements: scene.elements.map((element) => (ids.has(element.id) ? ({ ...element, ...patch } as SketchElement) : element)) })
      }
    },
    [commit, scene, selected],
  )

  const insertDiagram = useCallback(
    (kind: DiagramKind) => {
      const center = { x: viewRect.x + viewRect.width / 2 - 250, y: viewRect.y + viewRect.height / 2 - 200 }
      const elements = createDiagram(kind, center, draw.style)
      commit({ ...scene, elements: [...scene.elements, ...elements] })
      setSelected(elements.map((element) => element.id))
      setTool('select')
    },
    [commit, draw.style, scene, viewRect],
  )

  const zoomBy = useCallback(
    (factor: number) => {
      const cx = size.width / 2
      const cy = size.height / 2
      const nextZoom = Math.max(0.1, Math.min(8, camera.zoom * factor))
      setCamera({ zoom: nextZoom, x: camera.x + cx / camera.zoom - cx / nextZoom, y: camera.y + cy / camera.zoom - cy / nextZoom })
    },
    [camera, size],
  )

  const fitContent = useCallback(() => {
    const content = sceneContentBounds(scene.elements)
    if (!content) {
      return
    }
    const padded = { x: content.x - 24, y: content.y - 24, width: content.width + 48, height: content.height + 48 }
    const zoom = Math.min(size.width / padded.width, size.height / padded.height, 2)
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
    setCamera({ zoom: safeZoom, x: padded.x - (size.width / safeZoom - padded.width) / 2, y: padded.y - (size.height / safeZoom - padded.height) / 2 })
  }, [scene.elements, size])

  const setDefaultView = useCallback(() => {
    commit({ ...scene, defaultView: { ...viewRect } })
  }, [commit, scene, viewRect])

  // --- keyboard ---
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      if (event.key === ' ' && !typing) {
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
      if (typing) {
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteSelected()
      } else if (event.key === 'Escape') {
        setSelected([])
        setTool('select')
      } else {
        const map: Record<string, ToolId> = { v: 'select', r: 'rectangle', o: 'ellipse', d: 'diamond', a: 'arrow', l: 'line', p: 'freedraw', t: 'text' }
        const next = map[event.key.toLowerCase()]
        if (next) {
          setTool(next)
        }
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

  // --- overlay geometry ---
  const handleSize = HANDLE_PX * scenePerPixel
  const rotatePos = selectionRect ? { x: selectionRect.x + selectionRect.width / 2, y: selectionRect.y - ROTATE_OFFSET_PX * scenePerPixel } : null
  const bindRect = useMemo(() => {
    if (!bindHighlight) {
      return null
    }
    const element = scene.elements.find((el) => el.id === bindHighlight)
    return element && isBindable(element) ? { x: element.x, y: element.y, width: element.width, height: element.height } : null
  }, [bindHighlight, scene.elements])

  // editing-text overlay position (pixels relative to canvas wrap)
  const editingElement = editingText ? scene.elements.find((el) => el.id === editingText.id) : null
  const editorBox = useMemo(() => {
    if (!editingText || !editingElement) {
      return null
    }
    const fontPx = (editingText.isLabel ? editingElement.labelFontSize ?? 16 : editingElement.type === 'text' ? editingElement.fontSize : draw.fontSize) * camera.zoom
    const left = (editingElement.x - camera.x) * camera.zoom
    const top = (editingElement.y - camera.y) * camera.zoom
    const width = Math.max(60, editingElement.width * camera.zoom)
    return { left, top, width, fontPx, height: Math.max(fontPx * 1.4, editingElement.height * camera.zoom) }
  }, [camera, draw.fontSize, editingElement, editingText])

  return (
    <div className={`sketch-editor ${className ?? ''}`} style={style}>
      <Toolbar
        tool={tool}
        onTool={setTool}
        onInsertDiagram={insertDiagram}
        zoom={camera.zoom}
        onZoomIn={() => zoomBy(1.2)}
        onZoomOut={() => zoomBy(1 / 1.2)}
        onZoomReset={() => zoomBy(1 / camera.zoom)}
        onFit={fitContent}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={undo}
        onRedo={redo}
        onSetView={setDefaultView}
        onExit={onExit}
      />
      <div className="sketch-body">
        <div ref={containerRef} className={`sketch-canvas ${className ?? ''}`}>
          <svg
            ref={svgRef}
            className={`sketch-canvas-surface ${spaceDown ? 'is-panning' : ''} tool-${tool}`}
            viewBox={rectToViewBox(viewRect)}
            preserveAspectRatio="none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDoubleClick={onDoubleClick}
            onWheel={onWheel}
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x={viewRect.x} y={viewRect.y} width={viewRect.width} height={viewRect.height} fill={rendered.background} />
            <RenderedScene elements={rendered.elements} />

            {bindRect && (
              <rect
                x={bindRect.x}
                y={bindRect.y}
                width={bindRect.width}
                height={bindRect.height}
                fill="var(--sketch-accent, #2563eb)"
                fillOpacity={0.1}
                stroke="var(--sketch-accent, #2563eb)"
                strokeWidth={1.5 * scenePerPixel}
                pointerEvents="none"
              />
            )}

            {selectionRect && (
              <g pointerEvents="none">
                <rect x={selectionRect.x} y={selectionRect.y} width={selectionRect.width} height={selectionRect.height} fill="none" stroke="var(--sketch-accent, #2563eb)" strokeWidth={scenePerPixel} strokeDasharray={`${4 * scenePerPixel} ${3 * scenePerPixel}`} />
                {rotatePos && (
                  <>
                    <line x1={selectionRect.x + selectionRect.width / 2} y1={selectionRect.y} x2={rotatePos.x} y2={rotatePos.y} stroke="var(--sketch-accent, #2563eb)" strokeWidth={scenePerPixel} />
                    <circle cx={rotatePos.x} cy={rotatePos.y} r={handleSize / 2} fill="var(--sketch-accent, #2563eb)" />
                  </>
                )}
                {canResize &&
                  RESIZE_HANDLES.map((handle) => {
                    const pos = handlePositions(selectionRect)[handle]
                    return <rect key={handle} x={pos.x - handleSize / 2} y={pos.y - handleSize / 2} width={handleSize} height={handleSize} fill="#fff" stroke="var(--sketch-accent, #2563eb)" strokeWidth={scenePerPixel} />
                  })}
              </g>
            )}

            {marquee && (
              <rect x={marquee.x} y={marquee.y} width={marquee.width} height={marquee.height} fill="var(--sketch-accent, #2563eb)" fillOpacity={0.08} stroke="var(--sketch-accent, #2563eb)" strokeWidth={scenePerPixel} pointerEvents="none" />
            )}
          </svg>

          {editorBox && editingText && (
            <textarea
              className="sketch-text-editor"
              autoFocus
              value={editingText.value}
              spellCheck={false}
              style={{ left: editorBox.left, top: editorBox.top, width: editorBox.width, minHeight: editorBox.height, fontSize: editorBox.fontPx, textAlign: editingText.isLabel ? 'center' : 'left' }}
              onChange={(event) => setEditingText({ ...editingText, value: event.target.value })}
              onBlur={commitEditingText}
              onKeyDown={(event) => {
                if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey)) {
                  event.preventDefault()
                  commitEditingText()
                }
              }}
            />
          )}
        </div>

        <PropertiesPanel
          draw={draw}
          hasSelection={selected.length > 0}
          showFill={fillableActive}
          showEdges={edgesActive}
          showArrowheads={arrowActive}
          showText={textActive}
          onChange={onDrawChange}
          onAction={onLayerAction}
        />
      </div>
    </div>
  )
}
