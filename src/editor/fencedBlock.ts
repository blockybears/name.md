import type { JSONContent, MarkdownToken } from '@tiptap/core'
import { memoizedBlockStart } from './markdownTokenizer'

type FencedToken = MarkdownToken & { code?: string }

/**
 * Markdown round-trip config for an atom block whose source is stored in a
 * fenced code block (```<lang> ... ```). Spread into a Node.create() config.
 * Keeps the source portable: anywhere that can't render the node still shows
 * a readable fenced code block (and GitHub renders ```mermaid natively).
 */
export function fencedBlockMarkdown(name: string, lang: string) {
  const fencePattern = new RegExp(`^\`\`\`[ \\t]*${lang}[ \\t]*\\n([\\s\\S]*?)\\n?\`\`\`[ \\t]*(?:\\n|$)`, 'i')
  // Precompiled once (was rebuilt on every call).
  const startPattern = new RegExp(`^\`\`\`[ \\t]*${lang}\\b`, 'im')

  return {
    markdownTokenizer: {
      name,
      level: 'block' as const,
      // Cheap reject (no bare fence at all) then the language-specific search;
      // memoized so it doesn't rescan the whole doc per paragraph.
      start: memoizedBlockStart((src: string) => (src.indexOf('```') === -1 ? -1 : src.search(startPattern))),
      tokenize(src: string) {
        const match = fencePattern.exec(src)
        if (!match) {
          return undefined
        }
        return {
          type: name,
          raw: match[0],
          code: match[1] ?? '',
        }
      },
    },

    parseMarkdown(token: MarkdownToken, helpers: { createNode: (type: string, attrs?: Record<string, unknown>) => JSONContent }) {
      return helpers.createNode(name, { code: (token as FencedToken).code ?? '' })
    },

    renderMarkdown(node: JSONContent) {
      const code = String(node.attrs?.code ?? '').replace(/\s+$/, '')
      return `\`\`\`${lang}\n${code}\n\`\`\``
    },
  }
}
