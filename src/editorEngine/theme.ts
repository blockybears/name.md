import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

// The editor is theme-agnostic: every colour resolves to one of the app's CSS
// custom properties (defined per-theme in src/index.css), so switching light /
// warm / dark needs no editor re-render — the browser recomputes `var(--…)`.
export const editorTheme = EditorView.theme({
  '&': {
    color: 'var(--text)',
    backgroundColor: 'var(--page-bg)',
    height: '100%',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: '1.65',
    overflow: 'auto',
  },
  '.cm-content': {
    caretColor: 'var(--accent)',
    padding: '0',
  },
  '.cm-line': {
    padding: '0 2px',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: 'var(--accent)',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent)',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 26%, transparent)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--muted)',
    border: 'none',
  },
  // Live-preview widgets
  '.cm-wp-img': {
    maxWidth: '100%',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    display: 'block',
    margin: '6px 0',
  },
  '.cm-wp-hr': {
    border: 'none',
    borderTop: '2px solid var(--border)',
    margin: '10px 0',
  },
  '.cm-wp-bullet': {
    color: 'var(--muted)',
    fontWeight: '700',
  },
  '.cm-wp-task': {
    verticalAlign: 'middle',
    marginRight: '6px',
    cursor: 'pointer',
    accentColor: 'var(--accent)',
  },
  // Plain GFM table widget
  '.cm-wp-table': {
    borderCollapse: 'collapse',
    margin: '8px 0',
    fontSize: '0.95em',
  },
  '.cm-wp-table th, .cm-wp-table td': {
    border: '1px solid var(--border)',
    padding: '6px 12px',
    textAlign: 'left',
  },
  '.cm-wp-table th': {
    background: 'color-mix(in srgb, var(--muted) 12%, transparent)',
    fontWeight: '650',
  },
  // Fenced code block (stays editable text under a painted background)
  '.cm-wp-code': {
    background: 'color-mix(in srgb, var(--muted) 12%, transparent)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.9em',
  },
  '.cm-wp-code-first': {
    borderTopLeftRadius: '8px',
    borderTopRightRadius: '8px',
    paddingTop: '4px',
  },
  '.cm-wp-code-last': {
    borderBottomLeftRadius: '8px',
    borderBottomRightRadius: '8px',
    paddingBottom: '4px',
  },
})

// Text styling for markdown tokens. Marker glyphs (#, **, `) are hidden by the
// live-preview layer (Phase 2); this only styles the visible text.
export const editorHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.9em', fontWeight: '700', lineHeight: '1.3' },
  { tag: t.heading2, fontSize: '1.5em', fontWeight: '700', lineHeight: '1.3' },
  { tag: t.heading3, fontSize: '1.25em', fontWeight: '600' },
  { tag: [t.heading4, t.heading5, t.heading6], fontSize: '1.1em', fontWeight: '600' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  {
    tag: t.monospace,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.92em',
    background: 'color-mix(in srgb, var(--muted) 14%, transparent)',
    padding: '1px 4px',
    borderRadius: '4px',
  },
  { tag: t.link, color: 'var(--accent)', textDecoration: 'underline' },
  { tag: t.url, color: 'var(--muted)' },
  { tag: t.quote, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: t.list, color: 'var(--text)' },
  { tag: [t.processingInstruction, t.meta], color: 'var(--muted)' },
])

export const themeExtensions = [editorTheme, syntaxHighlighting(editorHighlight)]
