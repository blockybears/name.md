import { Mark, Node, mergeAttributes, type MarkdownToken } from '@tiptap/core'
import { memoizedBlockStart } from './markdownTokenizer'

type MarkdownTokenWithChildren = MarkdownToken & Record<string, unknown>

/**
 * Inline mark delimited by a literal HTML tag pair (e.g. <u>..</u>, <kbd>..</kbd>).
 * These have no native markdown delimiter, so the tag itself is the syntax. The
 * tag names must also be added to the HTML passthrough allowlist so they survive
 * the unsafe-HTML escaping pass.
 */
function createHtmlTagMark(name: string, tag: string, keyboardShortcut?: string) {
  // Precompiled once per mark (was rebuilt on every tokenizer call).
  const openPattern = new RegExp(`<${tag}>`, 'i')
  const pairPattern = new RegExp(`^<${tag}>([\\s\\S]*?)</${tag}>`, 'i')
  return Mark.create({
    name,

    parseHTML() {
      return [{ tag }]
    },

    renderHTML({ HTMLAttributes }) {
      return [tag, mergeAttributes(HTMLAttributes), 0]
    },

    addKeyboardShortcuts() {
      if (!keyboardShortcut) {
        return {}
      }
      return {
        [keyboardShortcut]: () => this.editor.commands.toggleMark(name),
      }
    },

    parseMarkdown(token, helpers) {
      return helpers.applyMark(name, helpers.parseInline(token.tokens ?? []))
    },

    renderMarkdown(node, helpers) {
      return `<${tag}>${helpers.renderChildren(node)}</${tag}>`
    },

    markdownTokenizer: {
      name,
      level: 'inline',
      start(src: string) {
        return src.search(openPattern)
      },
      tokenize(src: string, _tokens: MarkdownToken[], lexer) {
        const match = pairPattern.exec(src)
        if (!match) {
          return undefined
        }
        return {
          type: name,
          raw: match[0],
          tokens: lexer.inlineTokens(match[1]) as MarkdownTokenWithChildren[],
        }
      },
    },
  })
}

export const Underline = createHtmlTagMark('underline', 'u', 'Mod-u')
export const KeyboardKey = createHtmlTagMark('keyboardKey', 'kbd')

export const calloutTypes = ['note', 'tip', 'important', 'warning', 'caution'] as const
export type CalloutType = (typeof calloutTypes)[number]

const calloutLabels: Record<CalloutType, string> = {
  note: 'ℹ️ Note',
  tip: '💡 Tip',
  important: '❗ Important',
  warning: '⚠️ Warning',
  caution: '🛑 Caution',
}

function normalizeCalloutType(value: unknown): CalloutType {
  const candidate = String(value ?? '').toLowerCase()
  return (calloutTypes as readonly string[]).includes(candidate) ? (candidate as CalloutType) : 'note'
}

type CalloutToken = MarkdownTokenWithChildren & {
  calloutType?: string
  blockTokens?: MarkdownToken[]
}

/**
 * Admonition / callout block using GitHub's alert syntax:
 *
 *   > [!NOTE]
 *   > Body text.
 *
 * Because it serializes back to that syntax, GitHub renders it as a styled
 * alert too. A node view exposes a type picker for WYSIWYG editing.
 */
export const Callout = Node.create({
  name: 'callout',

  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      calloutType: {
        default: 'note',
        parseHTML: (element: HTMLElement) => normalizeCalloutType(element.getAttribute('data-callout')),
        renderHTML: (attributes: { calloutType?: string }) => ({
          'data-callout': normalizeCalloutType(attributes.calloutType),
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ class: 'callout' }, HTMLAttributes), 0]
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div')
      dom.className = 'callout'
      dom.dataset.callout = normalizeCalloutType(node.attrs.calloutType)

      const header = document.createElement('div')
      header.className = 'callout-header'
      header.contentEditable = 'false'

      const select = document.createElement('select')
      select.className = 'callout-type'
      for (const type of calloutTypes) {
        const option = document.createElement('option')
        option.value = type
        option.textContent = calloutLabels[type]
        select.appendChild(option)
      }
      select.value = normalizeCalloutType(node.attrs.calloutType)
      select.addEventListener('change', () => {
        if (typeof getPos !== 'function') {
          return
        }
        const pos = getPos()
        if (pos == null) {
          return
        }
        const current = editor.state.doc.nodeAt(pos)
        if (!current) {
          return
        }
        editor.view.dispatch(
          editor.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, calloutType: select.value }),
        )
      })
      header.appendChild(select)

      const content = document.createElement('div')
      content.className = 'callout-body'

      dom.appendChild(header)
      dom.appendChild(content)

      return {
        dom,
        contentDOM: content,
        update(updated) {
          if (updated.type.name !== 'callout') {
            return false
          }
          const type = normalizeCalloutType(updated.attrs.calloutType)
          dom.dataset.callout = type
          select.value = type
          return true
        },
      }
    }
  },

  markdownTokenizer: {
    name: 'callout',
    level: 'block',
    start: memoizedBlockStart((src: string) => src.search(/^>[ \t]*\[!\w+\]/im)),
    tokenize(src: string, _tokens: MarkdownToken[], lexer) {
      const firstLine = /^>[ \t]*\[!(\w+)\][ \t]*(.*)(?:\n|$)/.exec(src)
      if (!firstLine) {
        return undefined
      }

      const calloutType = firstLine[1].toLowerCase()
      if (!(calloutTypes as readonly string[]).includes(calloutType)) {
        return undefined
      }

      const lines = src.split('\n')
      const bodyLines: string[] = []
      const trailing = firstLine[2]?.trim()
      if (trailing) {
        bodyLines.push(trailing)
      }

      let cursor = 1
      while (cursor < lines.length && /^>/.test(lines[cursor])) {
        bodyLines.push(lines[cursor].replace(/^>[ \t]?/, ''))
        cursor += 1
      }

      const bodyText = bodyLines.join('\n').trim()

      return {
        type: 'callout',
        raw: lines.slice(0, cursor).join('\n'),
        calloutType,
        blockTokens: bodyText ? lexer.blockTokens(bodyText) : [],
      }
    },
  },

  parseMarkdown(token, helpers) {
    const calloutToken = token as CalloutToken
    const blockTokens = calloutToken.blockTokens ?? []
    const body = blockTokens.length ? helpers.parseChildren(blockTokens) : [helpers.createNode('paragraph')]

    return helpers.createNode('callout', { calloutType: normalizeCalloutType(calloutToken.calloutType) }, body)
  },

  renderMarkdown(node, helpers) {
    const type = normalizeCalloutType(node.attrs?.calloutType).toUpperCase()
    const body = helpers.renderChildren(node.content ?? [], '\n\n').trim()
    const quoted = body
      .split('\n')
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n')

    return `> [!${type}]\n${quoted}`
  },
})
