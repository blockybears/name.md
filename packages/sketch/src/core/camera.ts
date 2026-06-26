import { sceneElements } from './diagram'
import { padRect, sceneContentBounds } from './geometry'
import type { Rect, Scene } from './types'

export const DEFAULT_VIEW_PADDING = 24
const FALLBACK_VIEW: Rect = { x: 0, y: 0, width: 400, height: 300 }

/**
 * The framing the read-only view should render: the saved `defaultView` if set,
 * otherwise a padded fit around the content, otherwise a sensible fallback.
 */
export function viewBoxForScene(scene: Scene, padding = DEFAULT_VIEW_PADDING): Rect {
  if (scene.defaultView) {
    return scene.defaultView
  }
  const content = sceneContentBounds(sceneElements(scene))
  if (!content) {
    return FALLBACK_VIEW
  }
  return padRect(content, padding)
}

export function rectToViewBox(rect: Rect): string {
  // Guard against zero/negative extents which produce an invalid viewBox.
  const width = Math.max(1, rect.width)
  const height = Math.max(1, rect.height)
  return `${rect.x} ${rect.y} ${width} ${height}`
}

/** An interactive camera: translation + uniform scale over scene coordinates. */
export interface Camera {
  x: number
  y: number
  zoom: number
}

export const identityCamera: Camera = { x: 0, y: 0, zoom: 1 }

/** Build a camera that frames the given rect inside a viewport of w×h pixels. */
export function cameraForRect(rect: Rect, viewportWidth: number, viewportHeight: number): Camera {
  const width = Math.max(1, rect.width)
  const height = Math.max(1, rect.height)
  const zoom = Math.min(viewportWidth / width, viewportHeight / height)
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  return {
    zoom: safeZoom,
    x: rect.x - (viewportWidth / safeZoom - width) / 2,
    y: rect.y - (viewportHeight / safeZoom - height) / 2,
  }
}

/** The scene-space rect currently visible through a camera + viewport. */
export function cameraViewRect(camera: Camera, viewportWidth: number, viewportHeight: number): Rect {
  return {
    x: camera.x,
    y: camera.y,
    width: viewportWidth / camera.zoom,
    height: viewportHeight / camera.zoom,
  }
}
