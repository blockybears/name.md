# Path A — name.md editor engine on CodeMirror 6

## Why

The current editor (TipTap → ProseMirror → contenteditable) renders the **entire**
document into the DOM and re-derives whole-document state per edit. That is the root
cause of the large-file pain: a 1MB file is tens of thousands of live DOM nodes, and
5MB is unusable. This is structural to ProseMirror, not a bug we can keep shaving.

We validated (two throwaway spikes, since deleted) that **CodeMirror 6** solves it:

| Metric (5MB markdown) | CM6 spike |
| --- | --- |
| Mount | 8–19 ms |
| DOM nodes rendered | 77–200 (viewport only — virtualized) |
| Typing latency | 1–2 ms |
| Reading scroll | ~60fps (median 16.6ms, p95 18ms) |

The second spike also proved the **live-preview WYSIWYG layer** works on CM6 at 5MB:
markdown markers hide off the active line and reveal on edit, and images/tables render
inline as widgets — all while holding the perf above. This is the Obsidian model.

## Goal

Replace the ProseMirror editing surface with **our own markdown editor engine built on
CM6's virtualized text/input core**, while keeping everything the user already has:

- The UI/UX: toolbar, library explorer, document map, themes, save/GitHub sync — all
  unchanged; they just drive a new surface.
- Content features: headings, lists, task lists, tables, images, code, links,
  blockquotes, footnotes, definition lists, **callouts**, **collapsibles**, and the
  custom fenced blocks (**sketch**, mermaid, excalidraw, json-flow).
- Lossless markdown round-trip.

...and gain: fast large files, native mobile/IME input, and far less third-party
surface (drop `@tiptap/*` + `prosemirror-*`).

## Core architecture decisions

1. **The markdown text IS the model.** No separate ProseMirror-style document JSON. CM6
   holds the raw markdown string as the single source of truth. This makes save trivial
   (it's already markdown), makes round-trip lossless *by construction*, and removes the
   entire markdown⇄doc serialization layer (`src/editor/core.ts` table renderers, the
   custom tokenizers, the `@tiptap/markdown` marked pipeline, and our O(n²) patches all
   go away).
2. **Live preview = decorations over the viewport.** Two layers, exactly as the spike:
   - *Inline* (a `ViewPlugin`, viewport-bounded): hide markers off the active line, style
     text (heading sizes, bold, italic, code, strike, links), prettify list bullets,
     render inline images.
   - *Block* (a `StateField` fed by a viewport-watcher `ViewPlugin`, because CM6 forbids
     block decorations from plugins): tables, horizontal rules, fenced code, and our
     custom fenced blocks.
3. **Custom blocks reuse existing React components.** A `WidgetType` mounts a React root
   in `toDOM()` and unmounts it in `destroy()`, rendering `SketchView`, callouts, etc.
   from the fence body. Editing enters source mode (reveal the fence) or opens the
   block's existing editor. The React-root-in-widget lifecycle is the main technical
   risk — validated first thing in Phase 4.
4. **Toolbar actions become CM6 commands.** Each action dispatches a transaction that
   inserts/wraps markdown (bold = wrap selection in `**`, H2 = ensure `## ` line prefix,
   etc.). Far simpler than ProseMirror commands.
5. **Adapter boundary.** `App.tsx` currently binds tightly to the TipTap `editor`
   (`isActive`, `getAttributes`, `chain`, `state`, `view`). Introduce a thin
   `EditorController` interface (active-marks query, run-command, get/set markdown,
   headings-for-doc-map, focus/scroll-to-pos) so `App.tsx` talks to an abstraction and
   the surface underneath can swap. Implement it for CM6; the old TipTap path can back it
   during transition.

## Module layout

Keep it app-local (unlike the standalone `@namemd/sketch` package — this engine is
coupled to the app's toolbar/library):

```
src/editorEngine/
  setup.ts            buildExtensions({ onChange, theme }) — assembles CM6 extensions
  theme.ts            CM6 theme + HighlightStyle mapped to existing CSS vars (index.css)
  livePreview/
    inline.ts         ViewPlugin: marker hiding / reveal-on-active-line / text styling
    blocks.ts         StateField + watcher: tables, hr, fenced code, custom fences
    widgets/          WidgetType classes (table, image, hr, code, react-bridge)
    reactWidget.ts    WidgetType that mounts/unmounts a React root
  commands.ts         toolbar/keyboard commands (bold, heading, list, link, insert-block…)
  outline.ts          headings from the CM6 syntax tree (replaces documentOutline.ts)
  markdown.ts         GFM + custom-fence markdown dialect config (@lezer/markdown)
  CmMarkdownEditor.tsx  React wrapper component (value/onChange, imperative controller)
  controller.ts       EditorController interface + CM6 implementation
  index.ts            public exports
  dev/                standalone harness (html + entry) for isolated development
```

## Phases (each independently demoable + committable, like the sketch engine)

- **Phase 1 — Foundation.** Add CM6 deps. Build the module skeleton: markdown language,
  line wrapping, history, undo/redo, a theme mapped to our CSS vars, and the
  `CmMarkdownEditor` React component (`value`/`onChange`). Standalone dev harness + a
  Playwright perf test asserting the 5MB thresholds, and a markdown round-trip check.
  *Milestone: engine runs standalone, edits/saves markdown losslessly, hits perf targets.*
- **Phase 2 — Live-preview inline.** Port the spike's marker hiding + reveal-on-active-line
  + text styling; prettify bullets/numbers; links; inline images; theme-aware.
  *Milestone: prose reads like the current WYSIWYG.*
- **Phase 3 — Block widgets (standard markdown).** Block-decoration infrastructure
  (`StateField` + viewport watcher). Plain **GFM tables** rendered read-styled with
  edit-as-source on focus; fenced code as an editable styled block; interactive
  task-list checkboxes. Footnotes / definition lists deferred (were custom nodes).
  *Milestone: standard markdown renders WYSIWYG; block infra ready for phase 4.*
- **Phase 4 — Custom block widgets + advanced tables.** The React-in-widget bridge
  (validate lifecycle first). The **advanced table** block (see Tables below) — the
  must-have: tab between cells, column resize, rich cells, custom width/height. Then
  render sketch / mermaid / excalidraw / json-flow / callout / collapsible from their
  fences using the **existing** components; click-to-edit opens their editors.
  *Milestone: parity with current custom blocks + advanced tables.*
- **Phase 5 — Commands, toolbar, doc map, shortcuts.** Reimplement every toolbar action
  as a CM6 command; wire keyboard shortcuts and markdown input rules; rebuild the document
  map on the CM6 syntax tree; implement the `EditorController` fully.
  *Milestone: toolbar + doc map fully functional on CM6.*
- **Phase 6 — Cutover & cleanup.** Integrate into `App.tsx` behind a flag; port the
  round-trip harness; add the 5MB perf test as a permanent gate. Flip CM6 to default,
  then remove `@tiptap/*` + `prosemirror-*` + `src/editor/*` (and the tokenizer patches).
  Update README/changelog, bump version.
  *Milestone: TipTap gone; app ships on the new engine.*

## Status (as of the parity pass)

The CM6 engine is wired into the app behind a **statusbar "Editor: Beta (CM6)"
toggle** and has reached functional parity for day-to-day use. Done:

- Foundation, theme, live-preview (phases 1–3). **Full-time WYSIWYG**: markers
  are always hidden, formatting is toolbar-driven (no active-line source reveal);
  selection is stable; dark-mode selection fixed.
- Inline formats: bold, italic, strike, **underline, highlight, kbd, sub/sup**,
  inline code.
- Blocks: headings, bullet/numbered/task lists, blockquote, code block, rule,
  images.
- **Tables**: GFM tables render as an editable WYSIWYG grid (tab, add/del
  row+col) writing back pipe markdown; the **advanced ```table** adds column
  resize + row height + rich cells.
- **Custom blocks**: `sketch` (the drawing engine, inline canvas),
  `mermaid`/`excalidraw`/`json-flow` (edit/preview), callouts (`> [!NOTE]`),
  footnotes, definition lists, collapsibles (`<details>`, always-expanded).
- Toolbar + **document map** driven through a shared `FormatController` (both
  desktop and mobile bars); **active-state highlighting**; **link editing** via
  the toolbar (source is hidden).
- Perf preserved: 5MB opens in ~30ms, ~60fps scroll, ~300 DOM nodes.

**Remaining:**
- **Phase 6 cutover** (make Beta the default, remove `@tiptap/*` + `prosemirror-*`
  + `src/editor/*`) — deferred pending sign-off; the toggle keeps Classic as the
  safety net until then.
- Polish: collapse toggle for `<details>`; button active-state for the custom
  inline formats (highlight/underline/…); GFM table column widths (needs the
  advanced table).

## Tables (must-have; decided)

Two coexisting kinds:

1. **Plain GFM tables** (`| a | b |`) — kept for portability. Rendered read-styled;
   editing reveals the pipe source. A one-click **"upgrade to advanced table"** converts
   the selection into the advanced form.
2. **Advanced table** — a custom fenced block that survives round-trip as text but holds
   what markdown can't: rich cells (bullet lists, multiple blocks), and **persisted
   column widths / row heights**. It is a React widget (phase 4) that is a mini table
   editor: **Tab / Shift+Tab between cells**, **drag-to-resize columns**, add/remove
   rows & columns.

   ```table
   {"cols":[{"w":180},{"w":90}],
    "rows":[{"h":40,"cells":[{"blocks":["- a","- b"]},{"text":"9"}]}]}
   ```

Non-negotiable: never regress **tab-between-cells** or **column resize** (the previous
TipTap editor had these). Plain simple tables stay portable; power is opt-in.

## Verification (every phase)

- `tsc -b`, `eslint .`, `npm run build` green.
- Playwright perf test on a generated 5MB doc: mount < 500ms, typing < 4ms median,
  reading-scroll p95 < 30ms. Becomes a permanent regression gate.
- Markdown round-trip: parse → render → serialize equals input (adapt
  `scripts/roundtrip.mts`; the new engine's round-trip is text-identity, much stronger).
- Desktop `tauri:dev` and Android smoke test before cutover.

## Risks / notes

- **React-root-in-widget lifecycle** (Phase 4) is the real unknown — mounting/unmounting
  roots as widgets scroll in and out. De-risk with a focused test before porting all
  custom blocks.
- **Lezer-markdown vs marked differences** — a few constructs may parse differently than
  today. The round-trip harness catches these; because our model is now the raw text,
  most "round-trip" bugs become non-issues (we never rewrite the text on load).
- **Table/complex-block editing UX** — start with edit-as-source-on-focus (simplest,
  lossless); inline cell editing/column-resize can come later.
- **Back-compat** — existing `.md` docs are just markdown; they open unchanged. The
  custom fenced blocks keep their existing fence syntax, so old sketch/mermaid/etc.
  documents render as before.
- Naming: `src/editorEngine/` for now; can extract to a `packages/editor` workspace later
  if we want isolated tests, but it is app-coupled so app-local is fine to start.
