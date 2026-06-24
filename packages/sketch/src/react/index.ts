export { SketchView, type SketchViewProps } from './SketchView'
export { RenderedScene } from './RenderedScene'
// SketchCanvas (the heavy interactive editor) is exported only from the
// dedicated './canvas' subpath so it can be lazily code-split by consumers.
export type { SketchCanvasProps } from './SketchCanvas'
