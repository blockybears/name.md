import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, drawSelection, dropCursor, rectangularSelection } from '@codemirror/view'
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { themeExtensions } from './theme'
import { livePreviewInline } from './livePreview/inline'
import { customInline } from './livePreview/customInline'
import { calloutStyling } from './livePreview/callout'
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
  /** Extra extensions appended last (live-preview, commands, …) — added in later phases. */
  extensions?: Extension[]
}

// Assemble the base CodeMirror 6 extension set for a markdown word-processor
// surface. Deliberately minimal in Phase 1: the markdown language (GFM),
// soft-wrapping, history, and theming. Live-preview and commands arrive later.
export function buildExtensions(options: EditorSetupOptions = {}): Extension[] {
  const { onChange, extensions = [] } = options
  return [
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage, codeLanguages: [] }),
    themeExtensions,
    livePreviewInline,
    customInline,
    calloutStyling,
    livePreviewBlocks,
    codeBlockStyling,
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorView.updateListener.of((update) => {
      if (onChange && update.docChanged) {
        onChange(update.state.doc.toString())
      }
    }),
    ...extensions,
  ]
}

export function createEditorState(doc: string, options: EditorSetupOptions = {}): EditorState {
  return EditorState.create({ doc, extensions: buildExtensions(options) })
}
