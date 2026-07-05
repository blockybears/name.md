import { WidgetType, type EditorView } from '@codemirror/view'
import { createRoot, type Root } from 'react-dom/client'
import type { ReactNode } from 'react'

/** Live position of a block in the document. Kept as a stable, mutable object so
 *  a widget's React content can read the *current* range at event time even
 *  after edits elsewhere shift it. */
export type BlockPos = { from: number; to: number }

export type ReactBlockRenderArgs = {
  view: EditorView
  /** Mutable — always holds the block's current range (see BlockPos). */
  pos: BlockPos
  /** The block's source text (fence body). Treat as initial value: the React
   *  component should own its editing state and write back via replaceBlock. */
  source: string
}

export type ReactBlockRenderer = (args: ReactBlockRenderArgs) => ReactNode

type Mounted = { root: Root; pos: BlockPos }
const mounts = new WeakMap<HTMLElement, Mounted>()

/** Replace the current block range with new source text. Callers pass the same
 *  `pos` object handed to their renderer; it is kept current by updateDOM. */
export function replaceBlock(view: EditorView, pos: BlockPos, text: string) {
  view.dispatch({ changes: { from: pos.from, to: pos.to, insert: text } })
}

/** A CodeMirror block widget that hosts a React root. The root persists across
 *  document edits (CM calls updateDOM, not toDOM, when only the range/source
 *  changes) so focus and component state survive typing elsewhere. */
export class ReactBlockWidget extends WidgetType {
  readonly key: string
  readonly source: string
  readonly from: number
  readonly to: number
  readonly render: ReactBlockRenderer

  constructor(key: string, source: string, from: number, to: number, render: ReactBlockRenderer) {
    super()
    this.key = key
    this.source = source
    this.from = from
    this.to = to
    this.render = render
  }

  eq(other: ReactBlockWidget) {
    // Same identity + same source + same range → CM reuses the DOM untouched.
    // A range change alone still routes through updateDOM to refresh pos.
    return (
      other.key === this.key &&
      other.source === this.source &&
      other.from === this.from &&
      other.to === this.to
    )
  }

  toDOM(view: EditorView) {
    const container = document.createElement('div')
    container.className = 'cm-wp-block'
    const pos: BlockPos = { from: this.from, to: this.to }
    const root = createRoot(container)
    root.render(this.render({ view, pos, source: this.source }))
    mounts.set(container, { root, pos })
    return container
  }

  updateDOM(dom: HTMLElement, view: EditorView) {
    const mounted = mounts.get(dom)
    if (!mounted) return false
    // Keep the shared pos object current so writes target the live range.
    mounted.pos.from = this.from
    mounted.pos.to = this.to
    mounted.root.render(this.render({ view, pos: mounted.pos, source: this.source }))
    return true
  }

  destroy(dom: HTMLElement) {
    const mounted = mounts.get(dom)
    if (!mounted) return
    mounts.delete(dom)
    // Defer: React forbids unmounting a root while it may be rendering.
    const { root } = mounted
    setTimeout(() => root.unmount(), 0)
  }

  ignoreEvent() {
    return true
  }

  get estimatedHeight() {
    return 60
  }
}
