import {
  Mark,
  Node,
  markInputRule,
  markPasteRule,
  mergeAttributes,
  textblockTypeInputRule,
  type MarkdownLexerConfiguration,
  type MarkdownToken,
} from '@tiptap/core'

type MarkdownTokenWithChildren = MarkdownToken & Record<string, unknown>

type DefinitionListItemToken = {
  term: string
  termTokens: MarkdownTokenWithChildren[]
  descriptions: Array<{
    text: string
    tokens: MarkdownTokenWithChildren[]
  }>
}

const headingIdPattern = /\s*\{#([A-Za-z][\w:.-]*)\}\s*$/
const htmlTagPattern = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+[^<>\n]*)?\/?>/g
const htmlCommentPattern = /<!--[\s\S]*?-->|<!--/g

function createDelimitedInlineMark(name: string, delimiter: string, pattern: RegExp) {
  return {
    name,
    level: 'inline' as const,
    start: (src: string) => src.indexOf(delimiter),
    tokenize(src: string, _tokens: MarkdownToken[], lexer: MarkdownLexerConfiguration) {
      const match = pattern.exec(src)

      if (!match?.[0] || match[1] === undefined) {
        return undefined
      }

      return {
        type: name,
        raw: match[0],
        tokens: lexer.inlineTokens(match[1]) as MarkdownTokenWithChildren[],
      }
    },
  }
}

function createSimpleMark(
  name: string,
  tag: string,
  markdownDelimiter: string,
  inputRegex: RegExp,
  pasteRegex: RegExp,
  tokenizerPattern: RegExp,
) {
  return Mark.create({
    name,

    parseHTML() {
      return [{ tag }]
    },

    renderHTML({ HTMLAttributes }) {
      return [tag, mergeAttributes(HTMLAttributes), 0]
    },

    parseMarkdown(token, helpers) {
      return helpers.applyMark(name, helpers.parseInline(token.tokens ?? []))
    },

    renderMarkdown(node, helpers) {
      return `${markdownDelimiter}${helpers.renderChildren(node)}${markdownDelimiter}`
    },

    addInputRules() {
      return [
        markInputRule({
          find: inputRegex,
          type: this.type,
        }),
      ]
    },

    addPasteRules() {
      return [
        markPasteRule({
          find: pasteRegex,
          type: this.type,
        }),
      ]
    },

    markdownTokenizer: createDelimitedInlineMark(
      name,
      markdownDelimiter,
      tokenizerPattern,
    ),
  })
}

export const Highlight = createSimpleMark(
  'highlight',
  'mark',
  '==',
  /(?:^|\s)(==(?!\s+==)([^=]+)==)$/,
  /(?:^|\s)(==(?!\s+==)([^=]+)==)/g,
  /^==(?!\s+==)([^=\n]+?)==/,
)

export const Subscript = createSimpleMark(
  'subscript',
  'sub',
  '~',
  /(?:^|\s)(~(?!~)([^~\n]+)~(?!~))$/,
  /(?:^|\s)(~(?!~)([^~\n]+)~(?!~))/g,
  /^~(?!~)([^~\n]+?)~(?!~)/,
)

export const Superscript = createSimpleMark(
  'superscript',
  'sup',
  '^',
  /(?:^|\s)(\^([^^\n]+)\^)$/,
  /(?:^|\s)(\^([^^\n]+)\^)/g,
  /^\^([^^\n]+?)\^/,
)

export const MarkdownHeading = Node.create({
  name: 'heading',

  addOptions() {
    return {
      levels: [1, 2, 3, 4, 5, 6],
      HTMLAttributes: {},
    }
  },

  content: 'inline*',
  group: 'block',
  defining: true,

  addAttributes() {
    return {
      level: {
        default: 1,
        rendered: false,
      },
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('id'),
        renderHTML: (attributes: { id?: string | null }) => (attributes.id ? { id: attributes.id } : {}),
      },
    }
  },

  parseHTML() {
    return this.options.levels.map((level: number) => ({
      tag: `h${level}`,
      attrs: { level },
    }))
  },

  renderHTML({ node, HTMLAttributes }) {
    const hasLevel = this.options.levels.includes(node.attrs.level)
    const level = hasLevel ? node.attrs.level : this.options.levels[0]

    return [`h${level}`, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  parseMarkdown(token, helpers) {
    const clonedTokens = cloneTokens((token as MarkdownTokenWithChildren).tokens ?? [])
    const id = stripTrailingHeadingId(clonedTokens)

    return helpers.createNode(
      'heading',
      { level: (token as MarkdownTokenWithChildren).depth || 1, id },
      helpers.parseInline(clonedTokens),
    )
  },

  renderMarkdown(node, helpers) {
    const level = node.attrs?.level ? Number(node.attrs.level) : 1
    const headingChars = '#'.repeat(Math.min(6, Math.max(1, level)))
    const id = normalizeHeadingId(node.attrs?.id) ? ` {#${node.attrs?.id}}` : ''

    return `${headingChars} ${helpers.renderChildren(node.content ?? [])}${id}`
  },

  addCommands() {
    return {
      setHeading:
        (attributes: { level: number; id?: string | null }) =>
        ({ commands }) => {
          if (!this.options.levels.includes(attributes.level)) {
            return false
          }

          return commands.setNode(this.name, attributes)
        },
      toggleHeading:
        (attributes: { level: number; id?: string | null }) =>
        ({ commands }) => {
          if (!this.options.levels.includes(attributes.level)) {
            return false
          }

          return commands.toggleNode(this.name, 'paragraph', attributes)
        },
    }
  },

  addKeyboardShortcuts() {
    return this.options.levels.reduce<Record<string, () => boolean>>(
      (items, level: number) => ({
        ...items,
        [`Mod-Alt-${level}`]: () => this.editor.commands.toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }),
      }),
      {},
    )
  },

  addInputRules() {
    return this.options.levels.map((level: number) => (
      textblockTypeInputRule({
        find: new RegExp(`^(#{${Math.min(...this.options.levels)},${level}})\\s$`),
        type: this.type,
        getAttributes: { level },
      })
    ))
  },
})

export const FootnoteReference = Node.create({
  name: 'footnoteReference',

  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      label: {
        default: '',
        parseHTML: (element: HTMLElement) => element.dataset.label ?? element.textContent?.replace(/^\[\^|\]$/g, '') ?? '',
        renderHTML: (attributes: { label?: string }) => ({ 'data-label': attributes.label ?? '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'sup[data-footnote-ref]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = sanitizeFootnoteLabel(node.attrs.label) || '1'

    return [
      'sup',
      mergeAttributes(HTMLAttributes, {
        'data-footnote-ref': '',
        class: 'footnote-ref',
      }),
      `[^${label}]`,
    ]
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode('footnoteReference', { label: sanitizeFootnoteLabel((token as MarkdownTokenWithChildren).label) })
  },

  renderMarkdown(node) {
    const label = sanitizeFootnoteLabel(node.attrs?.label) || '1'

    return `[^${label}]`
  },

  markdownTokenizer: {
    name: 'footnoteReference',
    level: 'inline',
    start: (src: string) => src.indexOf('[^'),
    tokenize(src: string) {
      const match = /^\[\^([^\]\n]+)\]/.exec(src)

      if (!match) {
        return undefined
      }

      return {
        type: 'footnoteReference',
        raw: match[0],
        label: sanitizeFootnoteLabel(match[1]),
      }
    },
  },
})

export const FootnoteDefinition = Node.create({
  name: 'footnoteDefinition',

  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      label: {
        default: '',
        parseHTML: (element: HTMLElement) => element.dataset.label ?? '',
        renderHTML: (attributes: { label?: string }) => ({ 'data-label': attributes.label ?? '' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'section[data-footnote-definition]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = sanitizeFootnoteLabel(node.attrs.label) || '1'

    return [
      'section',
      mergeAttributes(HTMLAttributes, {
        'data-footnote-definition': '',
        class: 'footnote-definition',
      }),
      ['span', { class: 'footnote-definition-label', contenteditable: 'false' }, `[^${label}]:`],
      ['span', { class: 'footnote-definition-body' }, 0],
    ]
  },

  parseMarkdown(token, helpers) {
    const footnoteToken = token as MarkdownTokenWithChildren

    return helpers.createNode(
      'footnoteDefinition',
      { label: sanitizeFootnoteLabel(footnoteToken.label) },
      helpers.parseInline(footnoteToken.tokens ?? []),
    )
  },

  renderMarkdown(node, helpers) {
    const label = sanitizeFootnoteLabel(node.attrs?.label) || '1'
    const content = helpers.renderChildren(node.content ?? [])

    return `[^${label}]: ${content}`
  },

  markdownTokenizer: {
    name: 'footnoteDefinition',
    level: 'block',
    start: (src: string) => src.search(/^\[\^[^\]\n]+\]:/m),
    tokenize(src: string, _tokens: MarkdownToken[], lexer: MarkdownLexerConfiguration) {
      const match = /^\[\^([^\]\n]+)\]:[ \t]*(.*)(?:\n|$)/.exec(src)

      if (!match) {
        return undefined
      }

      const rawLines = [match[0].replace(/\n$/, '')]
      const contentLines = [match[2] ?? '']
      const remainingLines = src.slice(match[0].length).split('\n')

      for (const line of remainingLines) {
        if (/^(?: {2,}|\t)/.test(line)) {
          rawLines.push(line)
          contentLines.push(line.trim())
        } else {
          break
        }
      }

      const raw = rawLines.join('\n')
      const text = contentLines.join('\n').trim()

      return {
        type: 'footnoteDefinition',
        raw,
        label: sanitizeFootnoteLabel(match[1]),
        tokens: lexer.inlineTokens(text) as MarkdownTokenWithChildren[],
      }
    },
  },
})

export const DefinitionList = Node.create({
  name: 'definitionList',

  group: 'block',
  content: '(definitionTerm definitionDescription+)+',

  parseHTML() {
    return [{ tag: 'dl' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['dl', mergeAttributes(HTMLAttributes), 0]
  },

  parseMarkdown(token, helpers) {
    const definitionToken = token as MarkdownTokenWithChildren
    const content = ((definitionToken.items ?? []) as DefinitionListItemToken[]).flatMap((item: DefinitionListItemToken) => {
      return [
        helpers.createNode('definitionTerm', undefined, helpers.parseInline(item.termTokens)),
        ...item.descriptions.map((description: DefinitionListItemToken['descriptions'][number]) => (
          helpers.createNode('definitionDescription', undefined, helpers.parseInline(description.tokens))
        )),
      ]
    })

    return helpers.createNode('definitionList', undefined, content)
  },

  renderMarkdown(node, helpers) {
    return helpers.renderChildren(node.content ?? [], '\n')
  },

  markdownTokenizer: {
    name: 'definitionList',
    level: 'block',
    start: (src: string) => {
      const match = src.match(/^[^\s:\n][^\n]*\n:[ \t]+/m)

      return match?.index ?? -1
    },
    tokenize(src: string, _tokens: MarkdownToken[], lexer: MarkdownLexerConfiguration) {
      const lines = src.split('\n')
      const items: DefinitionListItemToken[] = []
      let cursor = 0

      while (cursor < lines.length) {
        const term = lines[cursor]?.trim()
        const firstDescriptionLine = lines[cursor + 1]

        if (!term || term.startsWith(':') || !firstDescriptionLine || !/^:[ \t]+/.test(firstDescriptionLine)) {
          break
        }

        cursor += 1
        const descriptions: DefinitionListItemToken['descriptions'] = []

        while (cursor < lines.length && /^:[ \t]+/.test(lines[cursor])) {
          const text = lines[cursor].replace(/^:[ \t]+/, '').trim()
          descriptions.push({
            text,
            tokens: lexer.inlineTokens(text) as MarkdownTokenWithChildren[],
          })
          cursor += 1
        }

        items.push({
          term,
          termTokens: lexer.inlineTokens(term) as MarkdownTokenWithChildren[],
          descriptions,
        })

        if (!lines[cursor] || !lines[cursor + 1] || !/^:[ \t]+/.test(lines[cursor + 1])) {
          break
        }
      }

      if (items.length === 0) {
        return undefined
      }

      return {
        type: 'definitionList',
        raw: lines.slice(0, cursor).join('\n'),
        items,
      }
    },
  },
})

export const DefinitionTerm = Node.create({
  name: 'definitionTerm',

  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'dt' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['dt', mergeAttributes(HTMLAttributes), 0]
  },

  renderMarkdown(node, helpers) {
    return helpers.renderChildren(node.content ?? [])
  },
})

export const DefinitionDescription = Node.create({
  name: 'definitionDescription',

  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'dd' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['dd', mergeAttributes(HTMLAttributes), 0]
  },

  renderMarkdown(node, helpers) {
    return `: ${helpers.renderChildren(node.content ?? [])}`
  },
})

export function sanitizeFootnoteLabel(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeHeadingId(value: unknown) {
  const id = String(value ?? '').trim()

  if (!id) {
    return null
  }

  return /^[A-Za-z][\w:.-]*$/.test(id) ? id : null
}

export function escapeUnsafeHtml(markdown: string) {
  let activeFence: string | null = null

  return markdown
    .split('\n')
    .map((line) => {
      const fence = line.match(/^ {0,3}(`{3,}|~{3,})/)

      if (fence) {
        const marker = fence[1][0]

        if (!activeFence) {
          activeFence = marker
        } else if (activeFence === marker) {
          activeFence = null
        }

        return line
      }

      if (activeFence) {
        return line
      }

      return escapeUnsafeHtmlInLine(line)
    })
    .join('\n')
}

function escapeUnsafeHtmlInLine(line: string) {
  return line
    .split(/(`+[^`]*?`+)/g)
    .map((part) => {
      if (part.startsWith('`')) {
        return part
      }

      return part
        .replace(htmlCommentPattern, (html) => escapeHtml(html))
        .replace(htmlTagPattern, (tag) => (/^<br\s*\/?>$/i.test(tag) ? tag : escapeHtml(tag)))
    })
    .join('')
}

function cloneTokens(tokens: MarkdownTokenWithChildren[]): MarkdownTokenWithChildren[] {
  return tokens.map((token) => ({
    ...token,
    tokens: token.tokens ? cloneTokens(token.tokens) : undefined,
  }))
}

function stripTrailingHeadingId(tokens: MarkdownTokenWithChildren[]): string | null {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index]

    if (token.tokens?.length) {
      const id = stripTrailingHeadingId(token.tokens)

      if (id) {
        return id
      }
    }

    const text = token.text ?? token.raw
    if (typeof text !== 'string') {
      continue
    }

    const match = text.match(headingIdPattern)
    if (!match) {
      continue
    }

    const nextText = text.slice(0, match.index).trimEnd()
    token.text = nextText
    token.raw = nextText

    if (!nextText) {
      tokens.splice(index, 1)
    }

    return match[1]
  }

  return null
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
