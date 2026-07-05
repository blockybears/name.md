import { RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { TableWidget } from './widgets'
import { ReactBlockWidget } from '../blocks/reactWidget'
import { getBlockRenderer } from '../blocks/registry'

// CodeMirror forbids block decorations from view plugins, so block widgets live
// in a state field. A tiny watcher plugin rebuilds them for the current viewport
// (bounded work on huge docs) and pushes them in via an effect.

const setBlocks = StateEffect.define<DecorationSet>()

const blockField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes)
    for (const effect of tr.effects) if (effect.is(setBlocks)) value = effect.value
    return value
  },
  provide: (field) => EditorView.decorations.from(field),
})

function rangeActive(state: EditorView['state'], from: number, to: number): boolean {
  return state.selection.ranges.some((range) => range.to >= from && range.from <= to)
}

function buildBlocks(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const { state } = view
  // Single contiguous viewport, not gapped visibleRanges (see codeBlocks.ts).
  const { from, to } = view.viewport
  {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name === 'Table') {
          const first = state.doc.lineAt(node.from)
          const last = state.doc.lineAt(node.to)
          // Show pipe source while the cursor is inside the table.
          if (!rangeActive(state, first.from, last.to)) {
            builder.add(
              first.from,
              last.to,
              Decoration.replace({ block: true, widget: new TableWidget(state.sliceDoc(first.from, last.to), first.from) }),
            )
          }
          return false
        }

        if (node.name === 'FencedCode') {
          const first = state.doc.lineAt(node.from)
          const info = first.text.replace(/^`+/, '').trim()
          const renderer = getBlockRenderer(info)
          if (renderer) {
            const last = state.doc.lineAt(node.to)
            if (!rangeActive(state, first.from, last.to)) {
              // Body = the lines between the opening and closing fences.
              const bodyStart = state.doc.line(first.number + 1)
              const bodyEnd = last.number - 1 >= bodyStart.number ? state.doc.line(last.number - 1) : null
              const body = bodyEnd ? state.sliceDoc(bodyStart.from, bodyEnd.to) : ''
              builder.add(
                first.from,
                last.to,
                Decoration.replace({
                  block: true,
                  widget: new ReactBlockWidget(info, body, first.from, last.to, renderer),
                }),
              )
            }
          }
          return false
        }

        return true
      },
    })
  }
  return builder.finish()
}

const blockWatcher = ViewPlugin.fromClass(
  class {
    destroyed = false
    constructor(view: EditorView) {
      this.push(view)
    }
    update(update: ViewUpdate) {
      // Rebuild on edits, scroll, parser progress, and caret moves — but NOT on
      // range-selection changes (a drag), so blocks don't churn mid-selection.
      const caretMove = update.selectionSet && update.state.selection.main.empty
      if (
        update.docChanged ||
        update.viewportChanged ||
        caretMove ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.push(update.view)
      }
    }
    push(view: EditorView) {
      const decorations = buildBlocks(view)
      // A plugin can't dispatch during its own update; defer to a microtask. The
      // resulting transaction sets no doc/selection/viewport flag, so no loop.
      Promise.resolve().then(() => {
        if (!this.destroyed) view.dispatch({ effects: setBlocks.of(decorations) })
      })
    }
    destroy() {
      this.destroyed = true
    }
  },
)

export const livePreviewBlocks: Extension = [blockField, blockWatcher]
