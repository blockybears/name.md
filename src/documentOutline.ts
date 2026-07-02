import type { Editor } from '@tiptap/react'

export type OutlineHeading = { level: number; text: string; pos: number }

/** Collect the document's headings (level, text, position) in order. */
export function collectHeadings(editor: Editor | null): OutlineHeading[] {
  if (!editor) {
    return []
  }
  const headings: OutlineHeading[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const text = node.textContent.trim()
      headings.push({ level: Number(node.attrs.level) || 1, text: text || 'Untitled section', pos })
    }
    return true
  })
  return headings
}
