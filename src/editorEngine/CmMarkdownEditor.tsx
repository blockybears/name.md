import { useEffect, useRef } from 'react'
import { EditorView } from '@codemirror/view'
import { createEditorState } from './setup'

type CmMarkdownEditorProps = {
  /** Markdown source. Changing this from outside (e.g. opening a file) replaces
   *  the document; edits the user makes are reported via onChange. */
  value: string
  onChange?: (markdown: string) => void
  className?: string
}

/** Phase 1 CodeMirror 6 markdown editing surface. Live-preview, block widgets,
 *  and toolbar commands are layered on in later phases. */
export function CmMarkdownEditor({ value, onChange, className }: CmMarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  // Keep the latest onChange without re-creating the editor on every render.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      state: createEditorState(value, { onChange: (md) => onChangeRef.current?.(md) }),
      parent: hostRef.current,
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Mount once; external value updates are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reflect external value changes (file open/switch) without clobbering the
  // user's in-progress edits: only replace when the incoming value truly differs.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (value === current) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    })
  }, [value])

  return <div ref={hostRef} className={className} />
}
