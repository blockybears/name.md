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
  // A translucent, muted slate-blue. Because it is translucent it composites
  // over whatever background is behind it — darker in dark themes, lighter in
  // light themes — so it always reads as a distinct selection with legible text.
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(109, 143, 199, 0.4) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(109, 143, 199, 0.5) !important',
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
  // Custom inline formats (highlight / underline / kbd / sub / sup)
  '.cm-hl': {
    background: 'color-mix(in srgb, #facc15 55%, transparent)',
    borderRadius: '3px',
    padding: '0 2px',
  },
  '.cm-u': {
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  '.cm-kbd': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.85em',
    border: '1px solid var(--border)',
    borderBottomWidth: '2px',
    borderRadius: '4px',
    padding: '0 4px',
    background: 'color-mix(in srgb, var(--muted) 12%, transparent)',
  },
  '.cm-sub': {
    verticalAlign: 'sub',
    fontSize: '0.75em',
  },
  '.cm-sup': {
    verticalAlign: 'super',
    fontSize: '0.75em',
  },
  '.cm-wp-task': {
    // A compact custom checkbox (appearance:none) sized below the line height so
    // task lines keep the same spacing as normal lines — the native box was
    // taller than the line and widened it.
    appearance: 'none',
    WebkitAppearance: 'none',
    width: '0.9em',
    height: '0.9em',
    margin: '0 6px 0 0',
    verticalAlign: 'middle',
    border: '1.5px solid color-mix(in srgb, var(--muted) 70%, transparent)',
    borderRadius: '3px',
    background: 'transparent',
    cursor: 'pointer',
    position: 'relative',
    boxSizing: 'border-box',
  },
  '.cm-wp-task:checked': {
    background: 'var(--accent)',
    borderColor: 'var(--accent)',
  },
  '.cm-wp-task:checked::after': {
    content: '""',
    position: 'absolute',
    left: '0.26em',
    top: '0.08em',
    width: '0.2em',
    height: '0.42em',
    border: 'solid #fff',
    borderWidth: '0 0.12em 0.12em 0',
    transform: 'rotate(45deg)',
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
