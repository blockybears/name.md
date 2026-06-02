/* eslint-disable react-refresh/only-export-components */
import { EditorContent, type Editor, useEditor } from '@tiptap/react'
import { useEffect, useRef } from 'react'
import {
  createMarkdownExtensions,
  handleMarkdownKeyDown,
  normalizeMarkdownInput,
  setEditorMarkdown,
  starterMarkdown,
} from './core'

type MarkdownEditorProps = {
  markdown: string
  resetKey: number
  onChange: (markdown: string) => void
  onEditorReady: (editor: Editor | null) => void
}

export function MarkdownEditor({ markdown, resetKey, onChange, onEditorReady }: MarkdownEditorProps) {
  const editorRef = useRef<Editor | null>(null)
  const editor = useEditor(
    {
      extensions: createMarkdownExtensions(),
      content: normalizeMarkdownInput(markdown),
      contentType: 'markdown',
      editorProps: {
        attributes: {
          class: 'markdown-surface',
          spellcheck: 'true',
        },
        handleKeyDown(_view, event) {
          return handleMarkdownKeyDown(editorRef.current, event)
        },
      },
      onUpdate({ editor }) {
        onChange(editor.getMarkdown())
      },
    },
    [],
  )

  useEffect(() => {
    editorRef.current = editor ?? null
    onEditorReady(editor ?? null)
    return () => {
      editorRef.current = null
      onEditorReady(null)
    }
  }, [editor, onEditorReady])

  useEffect(() => {
    if (!editor) {
      return
    }

    const nextMarkdown = normalizeMarkdownInput(markdown)
    if (editor.getMarkdown() !== nextMarkdown) {
      setEditorMarkdown(editor, nextMarkdown)
    }
  }, [editor, markdown, resetKey])

  return <EditorContent editor={editor} className="editor-host" />
}

export function getStarterMarkdown() {
  return starterMarkdown
}
