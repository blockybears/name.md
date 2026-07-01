import { Node, mergeAttributes, type MarkdownToken } from '@tiptap/core'
import { memoizedBlockStart } from './markdownTokenizer'

type MarkdownTokenWithChildren = MarkdownToken & Record<string, unknown>

type DetailsToken = MarkdownTokenWithChildren & {
  open?: boolean
  summaryTokens?: MarkdownToken[]
  blockTokens?: MarkdownToken[]
}

const detailsOpenAttr = /(?:^|\s)open(?:\s|=|$)/i

/**
 * Collapsible section backed by a native <details>/<summary> pair. The markup
 * round-trips to HTML so it also renders on GitHub. Editing relies on the
 * browser's native disclosure widget; the open/closed state is synced back to
 * the node attributes by the node view so it persists to markdown.
 */
export const Details = Node.create({
  name: 'details',

  group: 'block',
  content: 'detailsSummary detailsContent',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element: HTMLElement) => element.hasAttribute('open'),
        renderHTML: (attributes: { open?: boolean }) => (attributes.open ? { open: '' } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'details' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['details', mergeAttributes({ class: 'collapsible' }, HTMLAttributes), 0]
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('details')
      dom.className = 'collapsible'
      dom.open = node.attrs.open !== false

      const syncOpen = () => {
        if (typeof getPos !== 'function') {
          return
        }
        const pos = getPos()
        if (pos == null) {
          return
        }
        const current = editor.state.doc.nodeAt(pos)
        if (!current || current.attrs.open === dom.open) {
          return
        }
        editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, open: dom.open }))
      }

      dom.addEventListener('toggle', syncOpen)

      return {
        dom,
        contentDOM: dom,
        update(updated) {
          if (updated.type.name !== 'details') {
            return false
          }
          if (typeof updated.attrs.open === 'boolean' && dom.open !== updated.attrs.open) {
            dom.open = updated.attrs.open
          }
          return true
        },
        // The native <details> element flips the `open` attribute itself; let it
        // do so without ProseMirror trying to redraw the node from a mutation.
        ignoreMutation(mutation) {
          return mutation.type === 'attributes' && mutation.attributeName === 'open'
        },
      }
    }
  },

  markdownTokenizer: {
    name: 'details',
    level: 'block',
    start: memoizedBlockStart((src: string) => src.search(/<details[\s>]/i)),
    tokenize(src: string, _tokens: MarkdownToken[], lexer) {
      const match = /^<details([^>]*)>([\s\S]*?)<\/details>[^\S\n]*(?:\n|$)/i.exec(src)
      if (!match) {
        return undefined
      }

      const open = detailsOpenAttr.test(match[1] ?? '')
      let inner = match[2] ?? ''
      let summary = ''

      const summaryMatch = /<summary>([\s\S]*?)<\/summary>/i.exec(inner)
      if (summaryMatch) {
        summary = summaryMatch[1].trim()
        inner = inner.slice(0, summaryMatch.index) + inner.slice(summaryMatch.index + summaryMatch[0].length)
      }

      inner = inner.replace(/^\s+|\s+$/g, '')

      return {
        type: 'details',
        raw: match[0],
        open,
        summaryTokens: lexer.inlineTokens(summary),
        blockTokens: inner ? lexer.blockTokens(inner) : [],
      }
    },
  },

  parseMarkdown(token, helpers) {
    const detailsToken = token as DetailsToken
    const summary = helpers.createNode(
      'detailsSummary',
      undefined,
      helpers.parseInline(detailsToken.summaryTokens ?? []),
    )
    const blockTokens = detailsToken.blockTokens ?? []
    const body = blockTokens.length ? helpers.parseChildren(blockTokens) : [helpers.createNode('paragraph')]
    const content = helpers.createNode('detailsContent', undefined, body)

    return helpers.createNode('details', { open: detailsToken.open ?? true }, [summary, content])
  },

  renderMarkdown(node, helpers) {
    const children = node.content ?? []
    const summaryNode = children.find((child) => child.type === 'detailsSummary')
    const contentNode = children.find((child) => child.type === 'detailsContent')
    const summary = helpers.renderChildren(summaryNode?.content ?? []).trim() || 'Details'
    const body = helpers.renderChildren(contentNode?.content ?? [], '\n\n').trim()
    const openAttr = node.attrs?.open === false ? '' : ' open'

    return `<details${openAttr}>\n<summary>${summary}</summary>\n\n${body}\n\n</details>`
  },
})

export const DetailsSummary = Node.create({
  name: 'detailsSummary',

  content: 'inline*',
  defining: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'summary' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['summary', mergeAttributes({ class: 'collapsible-summary' }, HTMLAttributes), 0]
  },

  renderMarkdown(node, helpers) {
    return helpers.renderChildren(node.content ?? [])
  },
})

export const DetailsContent = Node.create({
  name: 'detailsContent',

  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-details-content]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-details-content': '', class: 'collapsible-content' }, HTMLAttributes), 0]
  },

  renderMarkdown(node, helpers) {
    return helpers.renderChildren(node.content ?? [], '\n\n')
  },
})
