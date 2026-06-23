import { Node, mergeAttributes } from '@tiptap/core'
import { fencedBlockMarkdown } from './fencedBlock'

type MermaidModule = {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, code: string) => Promise<{ svg: string }>
}

let mermaidPromise: Promise<MermaidModule> | null = null
let mermaidIdCounter = 0

function detectMermaidTheme() {
  const explicit = document.documentElement.getAttribute('data-theme')
  if (explicit === 'dark') {
    return 'dark'
  }
  if (explicit === 'light' || explicit === 'warm') {
    return 'default'
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'default'
}

async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default as unknown as MermaidModule
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: detectMermaidTheme() })
      return mermaid
    })
  }
  return mermaidPromise
}

/**
 * Mermaid diagram block. The source lives in a ```mermaid fence (so it renders
 * on GitHub too); in-app it shows the rendered SVG with an inline source editor
 * and live preview. Mermaid is loaded lazily so it stays out of the main bundle.
 */
export const MermaidDiagram = Node.create({
  name: 'mermaidDiagram',

  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      code: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-mermaid') ?? element.textContent ?? '',
        renderHTML: (attributes: { code?: string }) => ({ 'data-mermaid': attributes.code ?? '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-mermaid]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ class: 'mermaid-block' }, HTMLAttributes)]
  },

  ...fencedBlockMarkdown('mermaidDiagram', 'mermaid'),

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div')
      dom.className = 'mermaid-block'

      const toolbar = document.createElement('div')
      toolbar.className = 'mermaid-toolbar'
      toolbar.contentEditable = 'false'
      const editButton = document.createElement('button')
      editButton.type = 'button'
      editButton.className = 'mermaid-edit-toggle'
      toolbar.appendChild(editButton)

      const preview = document.createElement('div')
      preview.className = 'mermaid-preview'

      const editorWrap = document.createElement('div')
      editorWrap.className = 'mermaid-editor'
      const textarea = document.createElement('textarea')
      textarea.className = 'mermaid-source'
      textarea.spellcheck = false
      textarea.value = node.attrs.code ?? ''
      editorWrap.appendChild(textarea)

      dom.appendChild(toolbar)
      dom.appendChild(preview)
      dom.appendChild(editorWrap)

      let currentCode = String(node.attrs.code ?? '')
      let editing = false
      let renderToken = 0
      let debounce = 0

      const renderPreview = async (code: string) => {
        const trimmed = code.trim()
        const token = ++renderToken
        if (!trimmed) {
          preview.innerHTML = '<div class="mermaid-placeholder">Empty diagram — edit to add Mermaid syntax.</div>'
          return
        }
        try {
          const mermaid = await getMermaid()
          const { svg } = await mermaid.render(`mermaid-${(mermaidIdCounter += 1)}`, trimmed)
          if (token === renderToken) {
            preview.innerHTML = svg
          }
        } catch (error) {
          if (token === renderToken) {
            preview.textContent = `Mermaid error: ${(error as Error)?.message ?? String(error)}`
            preview.classList.add('mermaid-error')
            return
          }
        }
        preview.classList.remove('mermaid-error')
      }

      const commit = (code: string) => {
        if (typeof getPos !== 'function') {
          return
        }
        const pos = getPos()
        if (pos == null) {
          return
        }
        const current = editor.state.doc.nodeAt(pos)
        if (!current || current.attrs.code === code) {
          return
        }
        editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, code }))
      }

      const setEditing = (next: boolean) => {
        editing = next
        dom.classList.toggle('is-editing', next)
        editButton.textContent = next ? 'Done' : 'Edit'
        if (next) {
          textarea.focus()
        } else {
          commit(textarea.value)
        }
      }

      textarea.addEventListener('input', () => {
        currentCode = textarea.value
        window.clearTimeout(debounce)
        debounce = window.setTimeout(() => void renderPreview(currentCode), 300)
      })
      textarea.addEventListener('blur', () => commit(textarea.value))
      editButton.addEventListener('click', () => setEditing(!editing))

      void renderPreview(currentCode)
      if (!currentCode.trim()) {
        setEditing(true)
      }

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'mermaidDiagram') {
            return false
          }
          const nextCode = String(updated.attrs.code ?? '')
          if (nextCode !== currentCode && !editing) {
            currentCode = nextCode
            textarea.value = nextCode
            void renderPreview(nextCode)
          }
          return true
        },
        stopEvent(event) {
          const target = event.target as globalThis.Node | null
          return target ? toolbar.contains(target) || editorWrap.contains(target) : false
        },
        ignoreMutation() {
          return true
        },
      }
    }
  },
})
