import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CmMarkdownEditor } from '../CmMarkdownEditor'

// Standalone development + perf harness for the editor engine. Not part of the
// app build — loaded directly at /src/editorEngine/dev/harness.html during dev.

function generateMarkdown(targetBytes: number): string {
  const words = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore dolore magna aliqua enim minim veniam quis nostrud exercitation'.split(' ')
  const w = (i: number) => words[i % words.length]
  const svg = (label: string) =>
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='560' height='120'><rect width='560' height='120' rx='10' fill='%23dbeafe'/><text x='24' y='66' font-family='sans-serif' font-size='22' fill='%231e3a8a'>${label}</text></svg>`,
    )
  const parts: string[] = []
  let bytes = 0
  let n = 0
  while (bytes < targetBytes) {
    n++
    const para = Array.from({ length: 42 }, (_, i) => w(n * 7 + i)).join(' ')
    const block = [
      `# Section ${n}: ${w(n)} ${w(n + 2)}`, '',
      `## A ${w(n + 1)} subsection`, '',
      `${para}. This has **${w(n)} bold text** and *${w(n + 1)} italic* and \`inline code\` and a [link to ${w(n + 3)}](https://example.com/${n}).`, '',
      `- First point about ${w(n)}`,
      `- Second point about ${w(n + 2)}`, '',
      '> A blockquote that adds texture to the document flow.', '',
      `- [x] Done task for ${w(n)}`,
      `- [ ] Pending task for ${w(n + 1)}`, '',
      ...(n % 6 === 0
        ? [
            `![Figure ${n}](${svg('Figure ' + n)})`, '',
            `| Task | Owner | Status |`,
            `| --- | --- | --- |`,
            `| ${w(n)} build | Alpha | Active |`,
            `| ${w(n + 1)} ship | Beta | Done |`, '',
            '```js',
            `function demo${n}() { return ${n} * 2 }`,
            '```', '',
            '---', '',
          ]
        : []),
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
