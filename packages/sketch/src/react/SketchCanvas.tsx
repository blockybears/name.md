import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent as ReactClipboardEvent,
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
  availableViews,
  bindableAt,
  cameraViewRect,
  defaultViewFor,
  diagramIdOfElement,
  flattenDiagram,
  fontStack,
  ganttGeometry,
  rescheduleGantt,
  sceneElements,
  type DiagramInstance,
  type GanttData,
  type GanttGeometry,
  type SeriesData,
  type ViewId,
  computeSnap,
  createDiagram,
  createElement,
  elementBounds,
  elementsInMarquee,
  snapPoint,
  SNAP_GRID,
  type SnapGuide,
  generateId,
  generateSeed,
  handlePositions,
  hasVertices,
  hitTest,
  jsonToData,
  jsonToElements,
  looksLikeMermaid,
  mermaidToData,
  mermaidToElements,
  History,
  identityCamera,
  isBindable,
  isLinear,
  moveElement,
  normalizeRect,
  parseScene,
  rotatePoint,
  serializeScene,
  toPolygon,
  recomputeBindings,
  resolveColor,
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
import { Icon } from './editor/Icon'
import { Toolbar } from './editor/Toolbar'
import { DataEditor } from './editor/DataEditor'
import { PropertiesBar, type LayerAction } from './editor/PropertiesBar'
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
  | { mode: 'point'; elementId: string; index: number; base: Scene }
  | { mode: 'rotate'; elementId: string; base: Scene }
  | { mode: 'diagram-move'; diagramId: string; start: Point; baseX: number; baseY: number; base: Scene }
  | { mode: 'gantt-edit'; diagramId: string; taskIndex: number; editMode: 'move' | 'resize-start' | 'resize-end'; grabOffset: number; base: Scene; baseGantt: GanttData }
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
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [gridEnabled, setGridEnabled] = useState(false)
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([])
  const [reshaping, setReshaping] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ left: number; top: number; elementId: string } | null>(null)
  const [selectedDiagramId, setSelectedDiagramId] = useState<string | null>(null)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [editorHeight, setEditorHeight] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null)
  const [dataEditor, setDataEditor] = useState<{ mode: 'create' | 'edit'; diagramId?: string; initial?: GanttData | SeriesData } | null>(null)
  const [codeOpen, setCodeOpen] = useState(false)
  const [codeText, setCodeText] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  // Collapse the properties panel by default on small (mobile) viewports.
  const [panelOpen, setPanelOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 640)
  const [importState, setImportState] = useState<{ type: 'mermaid' | 'json'; text: string; error: string | null } | null>(null)
  const pointersRef = useRef<Map<number, Point>>(new Map())
  const pinchRef = useRef<{ dist: number; mid: Point; camera: Camera } | null>(null)
  const [editingText, setEditingText] = useState<{ id: string; value: string; isLabel: boolean; draft?: { x: number; y: number } } | null>(null)
  const textEditorRef = useRef<HTMLTextAreaElement>(null)
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
  // Freeform elements + every diagram rendered to its current view (for
  // hit-testing; freeform editing still operates only on scene.elements).
  const flatElements = useMemo(() => sceneElements(scene), [scene])
  const selectedDiagram = useMemo<DiagramInstance | null>(
    () => scene.diagrams?.find((d) => d.id === selectedDiagramId) ?? null,
    [scene.diagrams, selectedDiagramId],
  )
  const diagramRect = useMemo<Rect | null>(() => {
    if (!selectedDiagramId) {
      return null
    }
    const els = flatElements.filter((el) => el.id.startsWith(`${selectedDiagramId}:`))
    return els.length ? unionRects(els.map(elementBounds)) : null
  }, [flatElements, selectedDiagramId])
  // Geometry for drag-editing a selected gantt's bars (only in the gantt view).
  const ganttEditGeo = useMemo<GanttGeometry | null>(
    () =>
      selectedDiagram && selectedDiagram.data.kind === 'gantt' && selectedDiagram.view === 'gantt'
        ? ganttGeometry(selectedDiagram.data, { x: selectedDiagram.x, y: selectedDiagram.y })
        : null,
    [selectedDiagram],
  )

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
  const singleSelected = selectedElements.length === 1 ? selectedElements[0] : null
  // For a single element the selection box is its local (pre-rotation) box, and
  // the overlay is rotated to match; for multi-selection it's the AABB union.
  const selectionRect = useMemo<Rect | null>(() => {
    if (selectedElements.length === 0) {
      return null
    }
    if (singleSelected) {
      return { x: singleSelected.x, y: singleSelected.y, width: singleSelected.width, height: singleSelected.height }
    }
    return unionRects(selectedElements.map(elementBounds))
  }, [selectedElements, singleSelected])
  const selectionAngle = singleSelected?.angle ?? 0
  const selectionCenter = useMemo<Point | null>(
    () => (selectionRect ? { x: selectionRect.x + selectionRect.width / 2, y: selectionRect.y + selectionRect.height / 2 } : null),
    [selectionRect],
  )
  // Lines/arrows always get endpoint handles; polygons/freedraw get vertex
  // handles only while reshaping (otherwise they use the resize box).
  const vertexTarget =
    singleSelected &&
    (singleSelected.type === 'line' || singleSelected.type === 'arrow' || (reshaping && hasVertices(singleSelected)))
      ? singleSelected
      : null
  const canResize = singleSelected != null && !vertexTarget

  // --- properties panel context ---
  const selTypes = useMemo(() => new Set(selectedElements.map((element) => element.type)), [selectedElements])
  const fillableActive =
    selectedElements.length > 0
      ? selectedElements.some((element) => ['rectangle', 'ellipse', 'diamond', 'polygon'].includes(element.type))
      : ['rectangle', 'ellipse', 'diamond'].includes(tool)
  const edgesActive = selectedElements.length > 0 ? selTypes.has('rectangle') : tool === 'rectangle'
  const arrowActive = selectedElements.length > 0 ? selTypes.has('arrow') : tool === 'arrow'
  // The text menu applies to text elements and to any label-bearing shape/line.
  const labelBearing = (t: string) => ['text', 'rectangle', 'ellipse', 'diamond', 'polygon', 'line', 'arrow'].includes(t)
  const textActive =
    selectedElements.length > 0 ? selectedElements.some((el) => labelBearing(el.type)) : tool === 'text' || labelBearing(tool)
  const linePlacementActive = selectedElements.length > 0 ? selTypes.has('line') || selTypes.has('arrow') : tool === 'line' || tool === 'arrow'

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
        const theta = baseElement.angle
        const baseRect = gesture.baseRect
        const center = { x: baseRect.x + baseRect.width / 2, y: baseRect.y + baseRect.height / 2 }
        // Resize in the element's un-rotated frame.
        const localPointer = theta ? rotatePoint(point, center, -theta) : point
        const nextRect = resizeRect(baseRect, gesture.handle, localPointer)
        let updated = applyResize(baseElement, nextRect)
        if (theta) {
          // Keep the edge/corner opposite the handle fixed in world space.
          const fixed = {
            x: gesture.handle.includes('w') ? baseRect.x + baseRect.width : gesture.handle.includes('e') ? baseRect.x : center.x,
            y: gesture.handle.includes('n') ? baseRect.y + baseRect.height : gesture.handle.includes('s') ? baseRect.y : center.y,
          }
          const newCenter = { x: nextRect.x + nextRect.width / 2, y: nextRect.y + nextRect.height / 2 }
          const before = rotatePoint(fixed, center, theta)
          const after = rotatePoint(fixed, newCenter, theta)
          updated = { ...updated, x: updated.x + (before.x - after.x), y: updated.y + (before.y - after.y) }
        }
        return recomputeBindings({
          ...gesture.base,
          elements: gesture.base.elements.map((element) => (element.id === gesture.elementId ? updated : element)),
        })
      }
      case 'point': {
        return {
          ...gesture.base,
          elements: gesture.base.elements.map((element) => {
            if (element.id !== gesture.elementId || !hasVertices(element)) {
              return element
            }
            const isEnd = gesture.index === 0 || gesture.index === element.points.length - 1
            const cleared = element.type === 'arrow' && isEnd
              ? gesture.index === 0
                ? { startBinding: undefined }
                : { endBinding: undefined }
              : {}
            if (element.angle) {
              // Rotated: edit the vertex in the local frame and keep the box
              // (and rotation center) fixed so the other vertices don't drift.
              const center = { x: element.x + element.width / 2, y: element.y + element.height / 2 }
              const local = rotatePoint(point, center, -element.angle)
              const points = element.points.map((p, i) =>
                i === gesture.index ? { x: local.x - element.x, y: local.y - element.y } : p,
              )
              return { ...element, ...cleared, points }
            }
            // Axis-aligned: move the vertex and re-fit the bounding box.
            const abs = element.points.map((p) => ({ x: element.x + p.x, y: element.y + p.y }))
            abs[gesture.index] = point
            let minX = Infinity
            let minY = Infinity
            for (const p of abs) {
              minX = Math.min(minX, p.x)
              minY = Math.min(minY, p.y)
            }
            return { ...element, ...cleared, x: minX, y: minY, width: Math.max(...abs.map((p) => p.x)) - minX, height: Math.max(...abs.map((p) => p.y)) - minY, points: abs.map((p) => ({ x: p.x - minX, y: p.y - minY })) }
          }),
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
  }, [])

  const newElementStyle = useMemo(
    () => ({
      stroke: draw.stroke,
      fill: draw.fill,
      fillStyle: draw.fillStyle,
      strokeWidth: draw.strokeWidth,
      strokeStyle: draw.strokeStyle,
      opacity: draw.opacity,
      fillOpacity: draw.fillOpacity,
      roundness: draw.roundness,
      fontFamily: draw.fontFamily,
      fontBold: draw.fontBold,
      fontItalic: draw.fontItalic,
      textColor: draw.textColor,
    }),
    [draw],
  )

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (editingText) {
        return
      }
      if (event.button === 2) {
        return // right-click handled by onContextMenu
      }
      setContextMenu(null)
      event.currentTarget.setPointerCapture(event.pointerId)
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

      // Two fingers down → start a pinch zoom/pan and abandon any other gesture.
      if (pointersRef.current.size === 2) {
        const [a, b] = [...pointersRef.current.values()]
        pinchRef.current = {
          dist: Math.hypot(b.x - a.x, b.y - a.y),
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          camera,
        }
        gestureRef.current = { mode: 'none' }
        return
      }

      const point = toScene(event.clientX, event.clientY)

      if (spaceDown || event.button === 1) {
        gestureRef.current = { mode: 'pan', startClient: { x: event.clientX, y: event.clientY }, startCamera: camera }
        return
      }

      // Drag-edit a bar of the selected gantt: edges resize, body moves.
      if (tool === 'select' && ganttEditGeo && selectedDiagram && selectedDiagram.data.kind === 'gantt') {
        const tol = HIT_TOL_PX * scenePerPixel
        for (const bar of ganttEditGeo.bars) {
          if (point.y < bar.y - 4 * scenePerPixel || point.y > bar.y + bar.h + 4 * scenePerPixel) {
            continue
          }
          const task = selectedDiagram.data.tasks[bar.index]
          let editMode: 'move' | 'resize-start' | 'resize-end' | null = null
          if (bar.milestone) {
            if (point.x >= bar.x - bar.h && point.x <= bar.x + bar.h) {
              editMode = 'move'
            }
          } else if (Math.abs(point.x - (bar.x + bar.w)) <= tol) {
            editMode = 'resize-end'
          } else if (Math.abs(point.x - bar.x) <= tol) {
            editMode = 'resize-start'
          } else if (point.x >= bar.x && point.x <= bar.x + bar.w) {
            editMode = 'move'
          }
          if (editMode) {
            gestureRef.current = {
              mode: 'gantt-edit',
              diagramId: selectedDiagram.id,
              taskIndex: bar.index,
              editMode,
              grabOffset: task.startDay - ganttEditGeo.xToDay(point.x),
              base: scene,
              baseGantt: selectedDiagram.data,
            }
            return
          }
        }
      }

      if (tool === 'text') {
        // Don't create the element yet — open a draft editor at the click and
        // only materialise it on commit, so an empty/blurred edit leaves nothing.
        // preventDefault stops this click from stealing focus back off the
        // freshly-mounted text editor (which would blur+cancel it).
        event.preventDefault()
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        setEditingText({ id: generateId('text'), value: '', isLabel: false, draft: { x: point.x, y: point.y } })
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

      // Handle hit-testing happens in the element's un-rotated local frame so
      // handles can be grabbed wherever the rotation has placed them.
      const localPoint = selectionAngle && selectionCenter ? rotatePoint(point, selectionCenter, -selectionAngle) : point

      // Vertex handles for a selected line/arrow (or polygon/freedraw while reshaping).
      if (vertexTarget) {
        const tol = HANDLE_PX * scenePerPixel
        for (let i = 0; i < vertexTarget.points.length; i += 1) {
          const abs = { x: vertexTarget.x + vertexTarget.points[i].x, y: vertexTarget.y + vertexTarget.points[i].y }
          if (Math.hypot(localPoint.x - abs.x, localPoint.y - abs.y) <= tol) {
            gestureRef.current = { mode: 'point', elementId: vertexTarget.id, index: i, base: scene }
            return
          }
        }
      }

      if (canResize && selectionRect) {
        const tol = HIT_TOL_PX * scenePerPixel
        const rotate = { x: selectionRect.x + selectionRect.width / 2, y: selectionRect.y - ROTATE_OFFSET_PX * scenePerPixel }
        if (Math.hypot(localPoint.x - rotate.x, localPoint.y - rotate.y) <= HANDLE_PX * scenePerPixel) {
          gestureRef.current = { mode: 'rotate', elementId: selectedElements[0].id, base: scene }
          return
        }
        const handles = handlePositions(selectionRect)
        for (const handle of RESIZE_HANDLES) {
          const pos = handles[handle]
          if (Math.abs(localPoint.x - pos.x) <= tol && Math.abs(localPoint.y - pos.y) <= tol) {
            gestureRef.current = { mode: 'resize', handle, elementId: selectedElements[0].id, baseRect: selectionRect, base: scene }
            return
          }
        }
      }

      // Hit-test everything (including diagram-rendered shapes). A hit on a
      // diagram selects the diagram as a unit and starts a diagram move.
      const flatHit = hitTest(flatElements, point, HIT_TOL_PX * scenePerPixel)
      const diagramId = flatHit ? diagramIdOfElement(scene, flatHit.id) : null
      if (diagramId) {
        const instance = scene.diagrams?.find((d) => d.id === diagramId)
        setSelectedDiagramId(diagramId)
        setSelected([])
        setViewMenuOpen(false)
        if (instance) {
          gestureRef.current = { mode: 'diagram-move', diagramId, start: point, baseX: instance.x, baseY: instance.y, base: scene }
        }
        return
      }
      setSelectedDiagramId(null)

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
    [camera, canResize, draw, flatElements, ganttEditGeo, selectedDiagram, vertexTarget, editingText, newElementStyle, scene, scenePerPixel, selected, selectedElements, selectionRect, selectionAngle, selectionCenter, spaceDown, tool, toScene],
  )

  const snapActive = snapEnabled || gridEnabled
  /** Snap a draw/resize/endpoint point to other elements (magnet) and/or grid. */
  const snapDrawPoint = useCallback(
    (p: Point, excludeId: string | null): { point: Point; guides: SnapGuide[] } => {
      if (!snapActive) {
        return { point: p, guides: [] }
      }
      const others = scene.elements.filter((el) => el.id !== excludeId).map(elementBounds)
      const result = snapPoint(p, others, { threshold: 6 * scenePerPixel, magnet: snapEnabled, grid: gridEnabled, gridSize: SNAP_GRID })
      return { point: { x: result.x, y: result.y }, guides: result.guides }
    },
    [gridEnabled, scene.elements, scenePerPixel, snapActive, snapEnabled],
  )

  const gestureElementId = (gesture: Gesture): string | null => {
    if (gesture.mode === 'create' || gesture.mode === 'arrow' || gesture.mode === 'freedraw') {
      return gesture.id
    }
    if (gesture.mode === 'resize' || gesture.mode === 'point') {
      return gesture.elementId
    }
    return null
  }

  /** Apply a live gantt bar drag (move / resize) and reschedule dependents. */
  const applyGanttEdit = useCallback((gesture: Extract<Gesture, { mode: 'gantt-edit' }>, point: Point): Scene => {
    const inst = gesture.base.diagrams?.find((d) => d.id === gesture.diagramId)
    if (!inst) {
      return gesture.base
    }
    const geo = ganttGeometry(gesture.baseGantt, { x: inst.x, y: inst.y })
    const snap = (d: number) => (geo.maxDay - geo.minDay <= 2 ? Math.round(d * 24) / 24 : Math.round(d))
    const task = gesture.baseGantt.tasks[gesture.taskIndex]
    const dur = Math.max(0.25, task.endDay - task.startDay)
    const milestone = task.tags.includes('milestone')
    let edited = task
    if (gesture.editMode === 'move') {
      const ns = snap(geo.xToDay(point.x) + gesture.grabOffset)
      edited = { ...task, startDay: ns, endDay: milestone ? ns : ns + dur, pinned: true }
    } else if (gesture.editMode === 'resize-start') {
      const ns = Math.min(snap(geo.xToDay(point.x)), task.endDay - 0.25)
      edited = { ...task, startDay: ns, pinned: true }
    } else {
      const ne = Math.max(snap(geo.xToDay(point.x)), task.startDay + 0.25)
      edited = { ...task, endDay: ne }
    }
    const tasks = gesture.baseGantt.tasks.map((t, i) => (i === gesture.taskIndex ? edited : t))
    const data = rescheduleGantt({ ...gesture.baseGantt, tasks })
    return { ...gesture.base, diagrams: (gesture.base.diagrams ?? []).map((d) => (d.id === gesture.diagramId ? { ...d, data } : d)) }
  }, [])

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (pointersRef.current.has(event.pointerId)) {
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      }
      // Pinch zoom/pan with two pointers.
      if (pinchRef.current && pointersRef.current.size >= 2) {
        const [a, b] = [...pointersRef.current.values()]
        const dist = Math.hypot(b.x - a.x, b.y - a.y)
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const start = pinchRef.current
        const rect = svgRef.current?.getBoundingClientRect()
        if (rect && start.dist > 0) {
          const nextZoom = Math.max(0.1, Math.min(8, (start.camera.zoom * dist) / start.dist))
          const px = mid.x - rect.left
          const py = mid.y - rect.top
          // Anchor on the starting midpoint, plus pan by midpoint drift.
          const panX = (mid.x - start.mid.x) / nextZoom
          const panY = (mid.y - start.mid.y) / nextZoom
          setCamera({
            zoom: nextZoom,
            x: start.camera.x + px / start.camera.zoom - px / nextZoom - panX,
            y: start.camera.y + py / start.camera.zoom - py / nextZoom - panY,
          })
        }
        return
      }

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
      const rawPoint = toScene(event.clientX, event.clientY)

      if (gesture.mode === 'diagram-move') {
        const dx = rawPoint.x - gesture.start.x
        const dy = rawPoint.y - gesture.start.y
        setScene({
          ...gesture.base,
          diagrams: (gesture.base.diagrams ?? []).map((d) =>
            d.id === gesture.diagramId ? { ...d, x: gesture.baseX + dx, y: gesture.baseY + dy } : d,
          ),
        })
        return
      }

      if (gesture.mode === 'gantt-edit') {
        setScene(applyGanttEdit(gesture, rawPoint))
        return
      }

      if (gesture.mode === 'marquee') {
        const rect = normalizeRect(gesture.start, rawPoint)
        setMarquee(rect)
        const inside = elementsInMarquee(scene.elements, rect).map((element) => element.id)
        setSelected(gesture.additive ? Array.from(new Set([...gesture.baseSelection, ...inside])) : inside)
        return
      }

      if (gesture.mode === 'freedraw') {
        gesture.points.push(rawPoint)
      }
      if (gesture.mode === 'arrow') {
        const target = bindableAt(scene.elements, rawPoint, BIND_TOL_PX * scenePerPixel)
        setBindHighlight(target && target.id !== gesture.id ? target.id : null)
      }
      if (gesture.mode === 'point') {
        const element = scene.elements.find((el) => el.id === gesture.elementId)
        const isEnd = element && (gesture.index === 0 || gesture.index === (isLinear(element) ? element.points.length - 1 : 0))
        if (element?.type === 'arrow' && isEnd) {
          const target = bindableAt(scene.elements, rawPoint, BIND_TOL_PX * scenePerPixel)
          setBindHighlight(target && target.id !== gesture.elementId ? target.id : null)
        }
      }

      // Snapping: alignment guides + grid for moves, resizes, draws and endpoints.
      let point = rawPoint
      let guides: SnapGuide[] = []
      if (snapActive) {
        if (gesture.mode === 'move') {
          const primaryId = [...gesture.ids][0]
          const primary = gesture.base.elements.find((el) => el.id === primaryId)
          if (primary) {
            const b = elementBounds(primary)
            const moved = { x: b.x + (rawPoint.x - gesture.start.x), y: b.y + (rawPoint.y - gesture.start.y), width: b.width, height: b.height }
            const others = gesture.base.elements.filter((el) => !gesture.ids.has(el.id)).map(elementBounds)
            const snap = computeSnap(moved, others, { threshold: 6 * scenePerPixel, magnet: snapEnabled, grid: gridEnabled, gridSize: SNAP_GRID })
            point = { x: rawPoint.x + snap.dx, y: rawPoint.y + snap.dy }
            guides = snap.guides
          }
        } else if (gesture.mode === 'create' || gesture.mode === 'arrow' || gesture.mode === 'resize' || gesture.mode === 'point') {
          const snapped = snapDrawPoint(rawPoint, gestureElementId(gesture))
          point = snapped.point
          guides = snapped.guides
        }
      }
      setSnapGuides(guides)

      const next = applyGesture(gesture, point)
      if (next) {
        setScene(next)
      }
    },
    [applyGanttEdit, applyGesture, camera, gridEnabled, scene.elements, scenePerPixel, snapActive, snapDrawPoint, snapEnabled, toScene],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      pointersRef.current.delete(event.pointerId)
      if (pointersRef.current.size < 2) {
        pinchRef.current = null
      }
      const gesture = gestureRef.current
      gestureRef.current = { mode: 'none' }
      setMarquee(null)
      setBindHighlight(null)
      setSnapGuides([])
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      if (gesture.mode === 'none' || gesture.mode === 'pan' || gesture.mode === 'marquee') {
        return
      }

      if (gesture.mode === 'diagram-move') {
        const dropPoint = toScene(event.clientX, event.clientY)
        const dx = dropPoint.x - gesture.start.x
        const dy = dropPoint.y - gesture.start.y
        if (dx !== 0 || dy !== 0) {
          commit({
            ...gesture.base,
            diagrams: (gesture.base.diagrams ?? []).map((d) =>
              d.id === gesture.diagramId ? { ...d, x: gesture.baseX + dx, y: gesture.baseY + dy } : d,
            ),
          })
        }
        return
      }

      if (gesture.mode === 'gantt-edit') {
        commit(applyGanttEdit(gesture, toScene(event.clientX, event.clientY)))
        return
      }

      const rawPoint = toScene(event.clientX, event.clientY)
      // Re-apply the same snap as the live drag so the committed result matches.
      let point = rawPoint
      if (snapActive) {
        if (gesture.mode === 'move') {
          const primaryId = [...gesture.ids][0]
          const primary = gesture.base.elements.find((el) => el.id === primaryId)
          if (primary) {
            const b = elementBounds(primary)
            const moved = { x: b.x + (rawPoint.x - gesture.start.x), y: b.y + (rawPoint.y - gesture.start.y), width: b.width, height: b.height }
            const others = gesture.base.elements.filter((el) => !gesture.ids.has(el.id)).map(elementBounds)
            const snap = computeSnap(moved, others, { threshold: 6 * scenePerPixel, magnet: snapEnabled, grid: gridEnabled, gridSize: SNAP_GRID })
            point = { x: rawPoint.x + snap.dx, y: rawPoint.y + snap.dy }
          }
        } else if (gesture.mode === 'create' || gesture.mode === 'arrow' || gesture.mode === 'resize' || gesture.mode === 'point') {
          point = snapDrawPoint(rawPoint, gestureElementId(gesture)).point
        }
      }
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

      if (gesture.mode === 'point') {
        const element = scene.elements.find((el) => el.id === gesture.elementId)
        if (element?.type === 'arrow' && (gesture.index === 0 || gesture.index === element.points.length - 1)) {
          const target = bindableAt(scene.elements, point, BIND_TOL_PX * scenePerPixel)
          const binding = target && target.id !== gesture.elementId ? { elementId: target.id, focus: 0, gap: 4 } : undefined
          next = {
            ...next,
            elements: next.elements.map((el) =>
              el.id === gesture.elementId && el.type === 'arrow'
                ? gesture.index === 0
                  ? { ...el, startBinding: binding }
                  : { ...el, endBinding: binding }
                : el,
            ),
          }
        }
      }

      if (gesture.mode === 'freedraw') {
        // Simplify to a sparse vector path (the renderer smooths it into a
        // flowing curve), with the tolerance scaled to the current zoom.
        next = {
          ...next,
          elements: next.elements.map((element) =>
            element.id === gesture.id && element.type === 'freedraw' ? { ...element, points: simplifyPoints(element.points, 2.2 * scenePerPixel) } : element,
          ),
        }
      }

      if (gesture.mode === 'create') {
        setTool('select')
      }
      commit(next)
    },
    [applyGanttEdit, applyGesture, commit, gridEnabled, scene.elements, scenePerPixel, snapActive, snapDrawPoint, snapEnabled, toScene],
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

  /** Open inline label/text editing for a given element id. */
  const editLabelOf = useCallback(
    (id: string) => {
      const element = scene.elements.find((el) => el.id === id)
      if (!element || element.type === 'freedraw') {
        return
      }
      setSelected([id])
      if (element.type === 'text') {
        setEditingText({ id, value: element.text, isLabel: false })
      } else {
        setEditingText({ id, value: element.label ?? '', isLabel: true })
      }
    },
    [scene.elements],
  )

  // Refs so the global keyboard handler can read current selection / edit
  // without re-subscribing on every change (synced after each render).
  const selectedIdsRef = useRef<string[]>([])
  const editLabelRef = useRef(editLabelOf)
  const deleteDiagramRef = useRef<() => boolean>(() => false)
  useEffect(() => {
    selectedIdsRef.current = selected
    editLabelRef.current = editLabelOf
    deleteDiagramRef.current = () => {
      if (!selectedDiagramId) {
        return false
      }
      commit({ ...scene, diagrams: (scene.diagrams ?? []).filter((d) => d.id !== selectedDiagramId) })
      setSelectedDiagramId(null)
      return true
    }
  })

  // --- double-click: edit text/label ---
  const onDoubleClick = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const point = toScene(event.clientX, event.clientY)
      // Prefer a direct hit; fall back to the current single selection so a
      // near-miss on a thin line still edits the intended element.
      const hit = hitTest(scene.elements, point, HIT_TOL_PX * 2 * scenePerPixel) ?? (selected.length === 1 ? scene.elements.find((el) => el.id === selected[0]) ?? null : null)
      if (hit) {
        editLabelOf(hit.id)
      }
    },
    [editLabelOf, scene.elements, scenePerPixel, selected, toScene],
  )

  // --- right-click context menu + reshape ---
  const onContextMenu = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      event.preventDefault()
      const rect = containerRef.current?.getBoundingClientRect()
      const point = toScene(event.clientX, event.clientY)
      const hit = hitTest(scene.elements, point, HIT_TOL_PX * scenePerPixel)
      if (!hit || !rect) {
        setContextMenu(null)
        return
      }
      setSelected([hit.id])
      setContextMenu({ left: event.clientX - rect.left, top: event.clientY - rect.top, elementId: hit.id })
    },
    [containerRef, scene.elements, scenePerPixel, toScene],
  )

  const enterReshape = useCallback(
    (id: string) => {
      const element = scene.elements.find((el) => el.id === id)
      if (!element) {
        return
      }
      if (element.type === 'rectangle' || element.type === 'diamond') {
        const poly = toPolygon(element)
        commit({ ...scene, elements: scene.elements.map((el) => (el.id === id ? poly : el)) })
      }
      setSelected([id])
      setReshaping(true)
      setContextMenu(null)
    },
    [commit, scene],
  )

  const exitReshape = useCallback(() => {
    setReshaping(false)
    setContextMenu(null)
  }, [])

  // --- code (JSON) view ---
  const toggleCode = useCallback(() => {
    setCodeOpen((open) => {
      if (!open) {
        setCodeText(JSON.stringify(JSON.parse(serializeScene(scene)), null, 2))
        setCodeError(null)
      }
      return !open
    })
  }, [scene])

  const applyCode = useCallback(() => {
    try {
      JSON.parse(codeText)
    } catch (error) {
      setCodeError((error as Error).message)
      return
    }
    commit(parseScene(codeText))
    setCodeError(null)
    setCodeOpen(false)
  }, [codeText, commit])

  const contextElement = contextMenu ? scene.elements.find((el) => el.id === contextMenu.elementId) ?? null : null
  const contextCanReshape =
    contextElement != null &&
    (hasVertices(contextElement) || contextElement.type === 'rectangle' || contextElement.type === 'diamond')

  // Focus the text editor after the creating click settles (a timeout, not
  // autoFocus, so the click that opened it can't immediately blur it).
  useEffect(() => {
    if (!editingText) {
      return
    }
    const t = setTimeout(() => {
      const el = textEditorRef.current
      if (el) {
        el.focus()
        el.select()
      }
    }, 30)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingText?.id])

  const commitEditingText = useCallback(() => {
    if (!editingText) {
      return
    }
    const { id, value, isLabel, draft } = editingText
    setEditingText(null)

    // Draft text element (from the Text tool): create only if non-empty.
    if (draft) {
      if (!value.trim()) {
        return
      }
      const size = measureText(value, draw.fontSize)
      const element = createElement(
        { type: 'text', id, x: draft.x, y: draft.y, width: size.width, height: size.height, text: value, fontSize: draw.fontSize, align: 'left', ...newElementStyle },
        draw.style,
      )
      commit({ ...scene, elements: [...scene.elements, element] })
      setSelected([id])
      return
    }

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
  }, [commit, draw.fontSize, draw.style, editingText, newElementStyle, scene])

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

  /** Insert parsed graph elements at the viewport's top-left-ish, then select. */
  const insertElements = useCallback(
    (elements: SketchElement[]) => {
      if (elements.length === 0) {
        return false
      }
      const origin = { x: viewRect.x + 40, y: viewRect.y + 40 }
      const placed = elements.map((el) => ({ ...el, x: el.x + origin.x, y: el.y + origin.y }))
      commit({ ...scene, elements: [...scene.elements, ...placed] })
      setSelected(placed.map((el) => el.id))
      setTool('select')
      return true
    },
    [commit, scene, viewRect],
  )

  /** Insert a structured, re-viewable diagram (retains its data). */
  const insertStructuredDiagram = useCallback(
    (data: DiagramInstance['data'], view: ViewId) => {
      const origin = { x: viewRect.x + 60, y: viewRect.y + 60 }
      const instance: DiagramInstance = { id: generateId('dg'), seed: generateSeed(), x: origin.x, y: origin.y, style: draw.style, view, data }
      commit({ ...scene, diagrams: [...(scene.diagrams ?? []), instance] })
      setSelectedDiagramId(instance.id)
      setSelected([])
      setTool('select')
      return true
    },
    [commit, draw.style, scene, viewRect],
  )

  const switchDiagramView = useCallback(
    (view: ViewId) => {
      if (!selectedDiagramId) {
        return
      }
      commit({ ...scene, diagrams: (scene.diagrams ?? []).map((d) => (d.id === selectedDiagramId ? { ...d, view } : d)) })
      setViewMenuOpen(false)
    },
    [commit, scene, selectedDiagramId],
  )

  const flattenSelectedDiagram = useCallback(() => {
    if (!selectedDiagramId) {
      return
    }
    const flat = flattenDiagram(scene, selectedDiagramId)
    commit(flat)
    setSelectedDiagramId(null)
    setViewMenuOpen(false)
  }, [commit, scene, selectedDiagramId])

  const editSelectedDiagramData = useCallback(() => {
    if (!selectedDiagram || (selectedDiagram.data.kind !== 'gantt' && selectedDiagram.data.kind !== 'series')) {
      return
    }
    setViewMenuOpen(false)
    setDataEditor({ mode: 'edit', diagramId: selectedDiagram.id, initial: selectedDiagram.data })
  }, [selectedDiagram])

  const applyDataEditor = useCallback(
    (data: DiagramInstance['data']) => {
      if (!dataEditor) {
        return
      }
      if (dataEditor.mode === 'edit' && dataEditor.diagramId) {
        const id = dataEditor.diagramId
        commit({
          ...scene,
          diagrams: (scene.diagrams ?? []).map((d) =>
            d.id === id ? { ...d, data, view: availableViews(data).some((v) => v.id === d.view) ? d.view : defaultViewFor(data) } : d,
          ),
        })
      } else {
        insertStructuredDiagram(data, defaultViewFor(data))
      }
      setDataEditor(null)
    },
    [commit, dataEditor, insertStructuredDiagram, scene],
  )

  const openImport = useCallback((type: 'mermaid' | 'json') => {
    setImportState({ type, text: '', error: null })
  }, [])

  const onResizeDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const h = rootRef.current?.getBoundingClientRect().height ?? 480
    resizeRef.current = { startY: event.clientY, startH: h }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }, [])
  const onResizeMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) {
      return
    }
    setEditorHeight(Math.max(280, Math.min(4000, resizeRef.current.startH + (event.clientY - resizeRef.current.startY))))
  }, [])
  const onResizeUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    resizeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    // Persist the height on the scene (so it survives read mode / re-opening),
    // then drop the live override so the scene value is the source of truth.
    const h = rootRef.current?.getBoundingClientRect().height
    if (h && Math.round(h) !== Math.round(scene.canvasHeight ?? 0)) {
      commit({ ...scene, canvasHeight: Math.round(h) })
    }
    setEditorHeight(null)
  }, [commit, scene])

  const clearCanvas = useCallback(() => {
    if (scene.elements.length === 0 && !(scene.diagrams && scene.diagrams.length)) {
      return
    }
    setSelected([])
    setSelectedDiagramId(null)
    // Undoable: a Ctrl+Z brings the work back.
    commit({ ...scene, elements: [], diagrams: undefined })
  }, [commit, scene])

  const applyImport = useCallback(() => {
    if (!importState) {
      return
    }
    // Convertible kinds (flowchart/graph, gantt, pie, json) become structured,
    // re-viewable diagrams; everything else bakes to freeform shapes.
    const structured = importState.type === 'mermaid' ? mermaidToData(importState.text) : jsonToData(importState.text)
    if (structured) {
      insertStructuredDiagram(structured.data, structured.view)
      setImportState(null)
      return
    }
    const elements =
      importState.type === 'mermaid'
        ? mermaidToElements(importState.text, { x: 0, y: 0 }, draw.style)
        : jsonToElements(importState.text, { x: 0, y: 0 }, draw.style)
    if (!insertElements(elements)) {
      setImportState({ ...importState, error: importState.type === 'mermaid' ? 'No flowchart nodes found.' : 'Invalid or empty JSON.' })
      return
    }
    setImportState(null)
  }, [draw.style, importState, insertStructuredDiagram, insertElements])

  // Paste native Mermaid text straight onto the canvas.
  const onPaste = useCallback(
    (event: ReactClipboardEvent) => {
      if (editingText || importState) {
        return
      }
      const text = event.clipboardData.getData('text/plain')
      if (text && looksLikeMermaid(text)) {
        event.preventDefault()
        insertElements(mermaidToElements(text, { x: 0, y: 0 }, draw.style))
      }
    },
    [draw.style, editingText, importState, insertElements],
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
    // Frame everything, including unflattened diagram-rendered shapes.
    const content = sceneContentBounds(flatElements)
    if (!content) {
      return
    }
    const padded = { x: content.x - 24, y: content.y - 24, width: content.width + 48, height: content.height + 48 }
    const zoom = Math.min(size.width / padded.width, size.height / padded.height, 2)
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
    setCamera({ zoom: safeZoom, x: padded.x - (size.width / safeZoom - padded.width) / 2, y: padded.y - (size.height / safeZoom - padded.height) / 2 })
  }, [flatElements, size])

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
      if ((event.key === 'Enter' || event.key === 'F2') && selectedIdsRef.current.length === 1) {
        event.preventDefault()
        editLabelRef.current(selectedIdsRef.current[0])
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        if (!deleteDiagramRef.current()) {
          deleteSelected()
        }
      } else if (event.key === 'Escape') {
        setSelected([])
        setSelectedDiagramId(null)
        setViewMenuOpen(false)
        setTool('select')
        setReshaping(false)
        setContextMenu(null)
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
  // The selection overlay is drawn in the element's local frame and rotated to
  // match, so handles sit on the rotated shape.
  const selectionTransform =
    selectionAngle && selectionCenter ? `rotate(${(selectionAngle * 180) / Math.PI} ${selectionCenter.x} ${selectionCenter.y})` : undefined
  const bindRect = useMemo(() => {
    if (!bindHighlight) {
      return null
    }
    const element = scene.elements.find((el) => el.id === bindHighlight)
    return element && isBindable(element) ? { x: element.x, y: element.y, width: element.width, height: element.height } : null
  }, [bindHighlight, scene.elements])

  // editing-text overlay position (pixels relative to canvas wrap)
  const editingElement = editingText ? scene.elements.find((el) => el.id === editingText.id) : null
  // WYSIWYG font for the inline editor (from the element being edited, or the
  // current text defaults for a fresh draft).
  const editorFont = useMemo(() => {
    const src = editingElement ?? draw
    return {
      fontFamily: fontStack(src.fontFamily),
      fontWeight: src.fontBold ? 700 : 400,
      fontStyle: src.fontItalic ? 'italic' : 'normal',
      color: resolveColor(src.textColor ?? (editingText?.isLabel ? { kind: 'token', token: 'foreground' } : draw.textColor)),
    }
  }, [draw, editingElement, editingText?.isLabel])
  const editorBox = useMemo(() => {
    if (!editingText) {
      return null
    }
    if (editingText.draft) {
      const fontPx = draw.fontSize * camera.zoom
      return { left: (editingText.draft.x - camera.x) * camera.zoom, top: (editingText.draft.y - camera.y) * camera.zoom, width: 220, fontPx, height: fontPx * 1.4 }
    }
    if (!editingElement) {
      return null
    }
    const fontPx = (editingText.isLabel ? editingElement.labelFontSize ?? 16 : editingElement.type === 'text' ? editingElement.fontSize : draw.fontSize) * camera.zoom
    const isLinearLabel = editingText.isLabel && (editingElement.type === 'line' || editingElement.type === 'arrow')
    if (isLinearLabel && (editingElement.type === 'line' || editingElement.type === 'arrow')) {
      // Center the editor on the polyline's midpoint.
      const pts = editingElement.points
      const mid = pts[Math.floor(pts.length / 2)] ?? { x: 0, y: 0 }
      const prev = pts[Math.floor(pts.length / 2) - 1] ?? mid
      const cx = editingElement.x + (mid.x + prev.x) / 2
      const cy = editingElement.y + (mid.y + prev.y) / 2
      const width = 140
      return { left: (cx - camera.x) * camera.zoom - width / 2, top: (cy - camera.y) * camera.zoom - fontPx, width, fontPx, height: fontPx * 1.4 }
    }
    const left = (editingElement.x - camera.x) * camera.zoom
    const top = (editingElement.y - camera.y) * camera.zoom
    const width = Math.max(60, editingElement.width * camera.zoom)
    return { left, top, width, fontPx, height: Math.max(fontPx * 1.4, editingElement.height * camera.zoom) }
  }, [camera, draw.fontSize, editingElement, editingText])

  return (
    <div ref={rootRef} className={`sketch-editor ${className ?? ''}`} style={{ ...style, height: editorHeight ?? scene.canvasHeight ?? style?.height }} onPaste={onPaste}>
      <Toolbar
        tool={tool}
        onTool={setTool}
        onInsertDiagram={insertDiagram}
        onImport={openImport}
        onNewChart={() => setDataEditor({ mode: 'create' })}
        onClear={clearCanvas}
        chartStyle={scene.diagramStyle ?? draw.style}
        onChartStyle={(diagramStyle) => commit({ ...scene, diagramStyle })}
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
        snapEnabled={snapEnabled}
        onToggleSnap={() => setSnapEnabled((value) => !value)}
        gridEnabled={gridEnabled}
        onToggleGrid={() => setGridEnabled((value) => !value)}
        codeOpen={codeOpen}
        onToggleCode={toggleCode}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((value) => !value)}
        onExit={onExit}
      />
      {codeOpen && (
        <div className="sketch-code-view">
          <div className="sketch-code-bar">
            <span>Scene JSON</span>
            {codeError && <span className="sketch-code-error">{codeError}</span>}
            <span className="sketch-code-spacer" />
            <button type="button" onClick={() => setCodeOpen(false)}>
              Cancel
            </button>
            <button type="button" className="sketch-code-apply" onClick={applyCode}>
              Apply
            </button>
          </div>
          <textarea
            className="sketch-code-text"
            spellCheck={false}
            value={codeText}
            onChange={(event) => {
              setCodeText(event.target.value)
              setCodeError(null)
            }}
          />
        </div>
      )}
      <div className="sketch-body" hidden={codeOpen}>
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
            onContextMenu={onContextMenu}
            onWheel={onWheel}
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x={viewRect.x} y={viewRect.y} width={viewRect.width} height={viewRect.height} fill={rendered.background} />
            {gridEnabled && (
              <>
                <defs>
                  <pattern id="sketch-grid" width={SNAP_GRID} height={SNAP_GRID} patternUnits="userSpaceOnUse">
                    <path d={`M ${SNAP_GRID} 0 L 0 0 0 ${SNAP_GRID}`} fill="none" stroke="var(--sketch-muted, #888)" strokeOpacity={0.28} strokeWidth={scenePerPixel} />
                  </pattern>
                </defs>
                <rect x={viewRect.x} y={viewRect.y} width={viewRect.width} height={viewRect.height} fill="url(#sketch-grid)" pointerEvents="none" />
              </>
            )}
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

            {vertexTarget ? (
              <g pointerEvents="none" transform={selectionTransform}>
                {vertexTarget.points.map((p, i) => (
                  <circle
                    key={i}
                    cx={vertexTarget.x + p.x}
                    cy={vertexTarget.y + p.y}
                    r={handleSize / 2}
                    fill="#fff"
                    stroke="var(--sketch-accent, #2563eb)"
                    strokeWidth={1.5 * scenePerPixel}
                  />
                ))}
              </g>
            ) : (
              selectionRect && (
                <g pointerEvents="none" transform={selectionTransform}>
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
              )
            )}

            {marquee && (
              <rect x={marquee.x} y={marquee.y} width={marquee.width} height={marquee.height} fill="var(--sketch-accent, #2563eb)" fillOpacity={0.08} stroke="var(--sketch-accent, #2563eb)" strokeWidth={scenePerPixel} pointerEvents="none" />
            )}

            {diagramRect && (
              <rect
                x={diagramRect.x - 8 * scenePerPixel}
                y={diagramRect.y - 8 * scenePerPixel}
                width={diagramRect.width + 16 * scenePerPixel}
                height={diagramRect.height + 16 * scenePerPixel}
                fill="var(--sketch-accent, #2563eb)"
                fillOpacity={0.04}
                stroke="var(--sketch-accent, #2563eb)"
                strokeWidth={1.5 * scenePerPixel}
                strokeDasharray={`${6 * scenePerPixel} ${4 * scenePerPixel}`}
                rx={6 * scenePerPixel}
                pointerEvents="none"
              />
            )}

            {/* Drag affordance: resize grips on each gantt bar's edges. */}
            {ganttEditGeo &&
              ganttEditGeo.bars.map((bar) =>
                bar.milestone ? null : (
                  <g key={bar.index} pointerEvents="none">
                    <rect x={bar.x - 1.5 * scenePerPixel} y={bar.y + 3 * scenePerPixel} width={3 * scenePerPixel} height={bar.h - 6 * scenePerPixel} rx={1.5 * scenePerPixel} fill="#fff" stroke="var(--sketch-accent, #2563eb)" strokeWidth={scenePerPixel} />
                    <rect x={bar.x + bar.w - 1.5 * scenePerPixel} y={bar.y + 3 * scenePerPixel} width={3 * scenePerPixel} height={bar.h - 6 * scenePerPixel} rx={1.5 * scenePerPixel} fill="#fff" stroke="var(--sketch-accent, #2563eb)" strokeWidth={scenePerPixel} />
                  </g>
                ),
              )}

            {snapGuides.map((guide, i) =>
              guide.axis === 'x' ? (
                <line key={i} x1={guide.at} y1={guide.from} x2={guide.at} y2={guide.to} stroke="#f43f5e" strokeWidth={scenePerPixel} pointerEvents="none" />
              ) : (
                <line key={i} x1={guide.from} y1={guide.at} x2={guide.to} y2={guide.at} stroke="#f43f5e" strokeWidth={scenePerPixel} pointerEvents="none" />
              ),
            )}
          </svg>

          {editorBox && editingText && (
            <textarea
              ref={textEditorRef}
              className="sketch-text-editor"
              value={editingText.value}
              spellCheck={false}
              style={{ left: editorBox.left, top: editorBox.top, width: editorBox.width, minHeight: editorBox.height, fontSize: editorBox.fontPx, textAlign: editingText.isLabel ? 'center' : 'left', fontFamily: editorFont.fontFamily, fontWeight: editorFont.fontWeight, fontStyle: editorFont.fontStyle, color: editorFont.color }}
              onChange={(event) => setEditingText({ ...editingText, value: event.target.value })}
              onBlur={commitEditingText}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey)) {
                  event.preventDefault()
                  commitEditingText()
                }
              }}
            />
          )}

          {contextMenu && (
            <div className="sketch-context-menu" style={{ left: contextMenu.left, top: contextMenu.top }}>
              {contextCanReshape &&
                (reshaping ? (
                  <button type="button" onClick={exitReshape}>
                    Done reshaping
                  </button>
                ) : (
                  <button type="button" onClick={() => enterReshape(contextMenu.elementId)}>
                    Edit points
                  </button>
                ))}
              <button type="button" onClick={() => { onLayerAction('front'); setContextMenu(null) }}>
                Bring to front
              </button>
              <button type="button" onClick={() => { onLayerAction('back'); setContextMenu(null) }}>
                Send to back
              </button>
              <button type="button" onClick={() => { onLayerAction('duplicate'); setContextMenu(null) }}>
                Duplicate
              </button>
              <button type="button" className="sketch-context-danger" onClick={() => { onLayerAction('delete'); setContextMenu(null) }}>
                Delete
              </button>
            </div>
          )}

          {selectedDiagram && diagramRect && !dataEditor && !importState && (
            <div
              className="sketch-diagram-toolbar"
              style={{
                left: Math.max(4, (diagramRect.x - camera.x) * camera.zoom),
                top: Math.max(4, (diagramRect.y - camera.y) * camera.zoom - 44),
              }}
            >
              <div className="sketch-diagram-viewas">
                <button type="button" className="sketch-diagram-btn" onClick={() => setViewMenuOpen((open) => !open)} aria-expanded={viewMenuOpen}>
                  <Icon name="chart" /> View as <Icon name="chevron-down" />
                </button>
                {viewMenuOpen && (
                  <div className="sketch-viewas-menu" role="menu">
                    {availableViews(selectedDiagram.data).map((view) => (
                      <button
                        key={view.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selectedDiagram.view === view.id}
                        className={selectedDiagram.view === view.id ? 'is-active' : undefined}
                        onClick={() => switchDiagramView(view.id)}
                      >
                        {view.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {(selectedDiagram.data.kind === 'gantt' || selectedDiagram.data.kind === 'series') && (
                <button type="button" className="sketch-diagram-btn" onClick={editSelectedDiagramData} title="Edit the underlying data">
                  <Icon name="sliders" /> Edit data
                </button>
              )}
              <button type="button" className="sketch-diagram-btn" onClick={flattenSelectedDiagram} title="Convert to editable shapes (one-way)">
                Flatten
              </button>
            </div>
          )}

          {panelOpen && (
            <PropertiesBar
              draw={draw}
              hasSelection={selected.length > 0}
              showFill={fillableActive}
              showEdges={edgesActive}
              showArrowheads={arrowActive}
              showText={textActive}
              showLinePlacement={linePlacementActive}
              onChange={onDrawChange}
              onAction={onLayerAction}
            />
          )}
        </div>
      </div>

      {dataEditor && (
        <DataEditor mode={dataEditor.mode} initial={dataEditor.initial} onApply={applyDataEditor} onClose={() => setDataEditor(null)} />
      )}

      {importState && (
        <div className="sketch-import-overlay">
          <div className="sketch-import-modal">
            <div className="sketch-import-head">
              <span>{importState.type === 'mermaid' ? 'Import Mermaid flowchart' : 'Import JSON'}</span>
              <button type="button" className="sketch-icon-btn" aria-label="Close" onClick={() => setImportState(null)}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <textarea
              className="sketch-import-text"
              autoFocus
              spellCheck={false}
              placeholder={importState.type === 'mermaid' ? 'graph TD\n  A[Start] --> B{OK?}\n  B -->|yes| C[Done]' : '{ "name": "example", "items": [1, 2, 3] }'}
              value={importState.text}
              onChange={(event) => setImportState({ ...importState, text: event.target.value, error: null })}
            />
            <div className="sketch-import-foot">
              {importState.error && <span className="sketch-import-error">{importState.error}</span>}
              <span className="sketch-import-spacer" />
              <button type="button" onClick={() => setImportState(null)}>
                Cancel
              </button>
              <button type="button" className="sketch-import-go" onClick={applyImport}>
                Insert
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="sketch-resize-handle"
        title="Drag to resize the canvas height"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
      >
        <span className="sketch-resize-grip" />
      </div>
    </div>
  )
}
