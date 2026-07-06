import { EditorState, EditorSelection, type Extension } from '@codemirror/state'
import { EditorView, keymap, drawSelection, dropCursor, rectangularSelection } from '@codemirror/view'
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage, insertNewlineContinueMarkup, deleteMarkupBackward } from '@codemirror/lang-markdown'
import { themeExtensions } from './theme'
import { blockDeleteGuard } from './blockDeleteGuard'
import { livePreviewInline } from './livePreview/inline'
import { customInline } from './livePreview/customInline'
import { calloutStyling } from './livePreview/callout'
import { extendedBlocks } from './livePreview/extendedBlocks'
import { livePreviewBlocks } from './livePreview/blocks'
import { codeBlockStyling } from './livePreview/codeBlocks'
import { registerAdvancedTableBlock } from './blocks/advancedTable'
import { registerSketchBlock } from './blocks/sketchBlock'
import { registerDiagramBlocks } from './blocks/diagramBlocks'

// Register built-in custom fenced blocks (```table, ```sketch, …) once.
registerAdvancedTableBlock()
registerSketchBlock()
registerDiagramBlocks()

export type EditorSetupOptions = {
  /** Called (debounced by CM's own batching) whenever the document text changes. */
  onChange?: (markdown: string) => void
  /** Called on document OR selection changes (for toolbar active-state refresh). */
  onStateChange?: () => void
  /** Extra extensions appended last (live-preview, commands, …) — added in later phases. */
  extensions?: Extension[]
}

// Assemble the base CodeMirror 6 extension set for a markdown word-processor
// surface. Deliberately minimal in Phase 1: the markdown language (GFM),
// soft-wrapping, history, and theming. Live-preview and commands arrive later.
export function buildExtensions(options: EditorSetupOptions = {}): Extension[] {
  const { onChange, onStateChange, extensions = [] } = options
  return [
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage, codeLanguages: [] }),
    // Paste a URL over selected text → turn the selection into a link.
    EditorView.domEventHandlers({
      paste(event, view) {
        const pasted = event.clipboardData?.getData('text/plain')?.trim() ?? ''
        const sel = view.state.selection.main
        if (!sel.empty && /^(https?:\/\/|mailto:)\S+$/.test(pasted)) {
          const label = view.state.sliceDoc(sel.from, sel.to)
          const insert = `[${label}](${pasted})`
          view.dispatch({ changes: { from: sel.from, to: sel.to, insert }, selection: EditorSelection.cursor(sel.from + insert.length) })
          event.preventDefault()
          return true
        }
        return false
      },
    }),
    blockDeleteGuard,
    themeExtensions,
    livePreviewInline,
    customInline,
    calloutStyling,
    extendedBlocks,
    livePreviewBlocks,
    codeBlockStyling,
    keymap.of([
      // Proper, consistent markdown list continuation: Enter continues the list
      // marker (and clears an empty item); Backspace removes a marker. Bound
      // ahead of the default Enter/Backspace.
      { key: 'Enter', run: insertNewlineContinueMarkup },
      { key: 'Backspace', run: deleteMarkupBackward },
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    EditorView.updateListener.of((update) => {
      if (onChange && update.docChanged) {
        onChange(update.state.doc.toString())
      }
      if (onStateChange && (update.docChanged || update.selectionSet)) {
        onStateChange()
      }
    }),
    ...extensions,
  ]
}

export function createEditorState(doc: string, options: EditorSetupOptions = {}): EditorState {
  return EditorState.create({ doc, extensions: buildExtensions(options) })
}
