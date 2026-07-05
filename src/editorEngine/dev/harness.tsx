import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CmMarkdownEditor } from '../CmMarkdownEditor'

// Standalone development + perf harness for the editor engine. Not part of the
// app build — loaded directly at /src/editorEngine/dev/harness.html during dev.

function generateMarkdown(targetBytes: number): string {
  const words = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore dolore magna aliqua enim minim veniam quis nostrud exercitation'.split(' ')
  const w = (i: number) => words[i % words.length]
  const parts: string[] = []
  let bytes = 0
  let n = 0
  while (bytes < targetBytes) {
    n++
    const para = Array.from({ length: 42 }, (_, i) => w(n * 7 + i)).join(' ')
    const block = [
      `# Section ${n}: ${w(n)} ${w(n + 2)}`, '',
      `## A ${w(n + 1)} subsection`, '',
      `${para}. This has **${w(n)} bold text** and *${w(n + 1)} italic* and \`inline code\`.`, '',
      `- First point about ${w(n)}`,
      `- Second point about ${w(n + 2)}`, '',
      '> A blockquote that adds texture to the document flow.', '',
      `${para}.`, '',
    ].join('\n')
    parts.push(block)
    bytes += block.length + 1
  }
  return parts.join('\n')
}

const size = Number(new URLSearchParams(location.search).get('mb') ?? '5')
const doc = generateMarkdown(size * 1024 * 1024)

declare global {
  interface Window {
    __harness?: { bytes: number; mountMs: number; domNodes: () => number }
  }
}

const t0 = performance.now()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CmMarkdownEditor value={doc} onChange={() => {}} />
  </StrictMode>,
)

requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    window.__harness = {
      bytes: new TextEncoder().encode(doc).length,
      mountMs: performance.now() - t0,
      domNodes: () => document.querySelectorAll('.cm-content *').length,
    }
  }),
)
