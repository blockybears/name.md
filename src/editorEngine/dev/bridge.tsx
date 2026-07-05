/* eslint-disable react-refresh/only-export-components -- dev-only harness entry */
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CmMarkdownEditor } from '../CmMarkdownEditor'
import { registerBlock } from '../blocks/registry'
import { replaceBlock, type ReactBlockRenderArgs } from '../blocks/reactWidget'

// De-risk harness for the React-in-CM6 widget bridge. Registers an interactive
// ```demo block and verifies: it mounts, is interactive, writes state back to
// the document (so it survives scroll-away/return), and unmounts cleanly.

let mountCount = 0

function Demo({ view, pos, source }: ReactBlockRenderArgs) {
  const initial = (() => {
    try {
      return Number(JSON.parse(source).count) || 0
    } catch {
      return 0
    }
  })()
  const [count, setCount] = useState(initial)
  useEffect(() => {
    mountCount++
  }, [])

  const bump = () => {
    const next = count + 1
    setCount(next)
    replaceBlock(view, pos, '```demo\n' + JSON.stringify({ count: next }) + '\n```')
  }

  return (
    <div className="demo-block">
      <strong>Interactive React block</strong> — count: <span className="demo-count">{count}</span>{' '}
      <button className="demo-bump" onMouseDown={(e) => { e.preventDefault(); bump() }}>+1</button>
    </div>
  )
}

registerBlock('demo', (args) => <Demo {...args} />)

function generate(): string {
  const parts: string[] = []
  for (let i = 1; i <= 40; i++) {
    parts.push(`# Section ${i}`, '')
    for (let p = 0; p < 6; p++) parts.push(`Paragraph ${p} of section ${i} with some filler text to create scroll distance.`, '')
    parts.push('```demo', JSON.stringify({ count: i * 10 }), '```', '')
  }
  return parts.join('\n')
}

declare global {
  interface Window {
    __bridge?: {
      blocks: () => number
      counts: () => number[]
      mountCount: () => number
      docHasCount: (n: number) => boolean
    }
  }
}

const docRef = { value: generate() }
function Harness() {
  const [doc, setDoc] = useState(docRef.value)
  return (
    <CmMarkdownEditor
      value={doc}
      onChange={(next) => {
        docRef.value = next
        setDoc(next)
      }}
    />
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)

window.__bridge = {
  blocks: () => document.querySelectorAll('.demo-block').length,
  counts: () => Array.from(document.querySelectorAll('.demo-count')).map((el) => Number(el.textContent)),
  mountCount: () => mountCount,
  docHasCount: (n: number) => docRef.value.includes(`{"count":${n}}`),
}
