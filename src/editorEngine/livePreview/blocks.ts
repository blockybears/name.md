import { RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { TableWidget } from './widgets'

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
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'Table') return true
        const first = state.doc.lineAt(node.from)
        const last = state.doc.lineAt(node.to)
        // Show pipe source while the cursor is inside the table.
        if (!rangeActive(state, first.from, last.to)) {
          builder.add(
            first.from,
            last.to,
            Decoration.replace({ block: true, widget: new TableWidget(state.sliceDoc(first.from, last.to)) }),
          )
        }
        return false
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
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
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
