/**
 * Headless markdown round-trip harness for the editor extensions.
 * Run with: node_modules/.bin/tsx scripts/roundtrip.mts
 *
 * Not part of the build — used to verify that markdown survives a
 * parse -> ProseMirror -> serialize cycle without a browser.
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })

function define(name: string, value: unknown) {
  try {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  } catch {
    // Some globals are read-only getters in Node; skip those we can't override.
  }
}

const w = dom.window as unknown as Record<string, unknown>
for (const name of ['window', 'document', 'navigator', 'DOMParser', 'XMLSerializer', 'Node', 'Element', 'HTMLElement', 'getComputedStyle']) {
  define(name, name === 'window' ? dom.window : w[name])
}

// ProseMirror touches a few layout APIs that jsdom stubs incompletely.
const proto = dom.window.HTMLElement.prototype as unknown as Record<string, unknown>
if (!proto.getClientRects) {
  proto.getClientRects = () => [] as unknown as DOMRectList
}
if (!proto.getBoundingClientRect) {
  proto.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 }) as DOMRect
}

// React node views (json-flow) lazily import a module that pulls in a CSS file,
// which the bare tsx/node runtime can't load. That rejection is irrelevant to
// the markdown round-trip (which only reads node attrs), so swallow it here.
process.on('unhandledRejection', () => {})

const { Editor } = await import('@tiptap/core')
const { createMarkdownExtensions, normalizeMarkdownInput } = await import('../src/editor/core.ts')
const { buildJsonFlow } = await import('../src/editor/jsonFlowLayout.ts')

function roundtrip(markdown: string) {
  const editor = new Editor({
    extensions: createMarkdownExtensions(),
    content: normalizeMarkdownInput(markdown),
    // @ts-expect-error contentType is provided by @tiptap/markdown
    contentType: 'markdown',
  })
  const out = (editor as unknown as { getMarkdown: () => string }).getMarkdown()
  editor.destroy()
  return out
}

const cases: Array<{ name: string; md: string; expect: (out: string) => boolean }> = [
  {
    name: 'collapsible (open)',
    md: '<details open>\n<summary>Click me</summary>\n\nHello **world**\n\n- a\n- b\n\n</details>',
    expect: (out) =>
      /<details open>/.test(out) &&
      /<summary>Click me<\/summary>/.test(out) &&
      /Hello \*\*world\*\*/.test(out) &&
      /[-*] a/.test(out),
  },
  {
    name: 'collapsible (closed)',
    md: '<details>\n<summary>Closed</summary>\n\nJust text.\n\n</details>',
    expect: (out) => /<details>/.test(out) && /<summary>Closed<\/summary>/.test(out) && /Just text\./.test(out),
  },
  {
    name: 'plain markdown still works',
    md: '# Title\n\nA paragraph with **bold** and *italic*.\n',
    expect: (out) => /# Title/.test(out) && /\*\*bold\*\*/.test(out),
  },
  {
    name: 'callout (note)',
    md: '> [!NOTE]\n> Remember to **save**.',
    expect: (out) => /> \[!NOTE\]/.test(out) && /save/.test(out),
  },
  {
    name: 'callout (warning)',
    md: '> [!WARNING]\n> Be careful here.',
    expect: (out) => /> \[!WARNING\]/.test(out) && /careful/.test(out),
  },
  {
    name: 'underline mark',
    md: 'This is <u>underlined</u> text.',
    expect: (out) => /<u>underlined<\/u>/.test(out),
  },
  {
    name: 'kbd mark',
    md: 'Press <kbd>Ctrl</kbd> to win.',
    expect: (out) => /<kbd>Ctrl<\/kbd>/.test(out),
  },
  {
    name: 'blockquote is not mistaken for a callout',
    md: '> just a quote\n',
    expect: (out) => /^> just a quote/m.test(out) && !/\[!/.test(out),
  },
  {
    name: 'mermaid diagram fence',
    md: '```mermaid\nflowchart TD\n  A --> B\n```',
    expect: (out) => /```mermaid/.test(out) && /flowchart TD/.test(out) && /A --> B/.test(out),
  },
  {
    name: 'ordinary code fence is left alone',
    md: '```js\nconst x = 1\n```',
    expect: (out) => /```js/.test(out) && /const x = 1/.test(out) && !/mermaid/.test(out),
  },
  {
    name: 'json-flow fence',
    md: '```json-flow\n{ "a": 1, "b": [2, 3] }\n```',
    expect: (out) => /```json-flow/.test(out) && /"a": 1/.test(out),
  },
  {
    name: 'excalidraw fence',
    md: '```excalidraw\n{"type":"excalidraw","version":2,"elements":[],"appState":{}}\n```',
    expect: (out) => /```excalidraw/.test(out) && /"type":"excalidraw"/.test(out),
  },
  {
    name: 'sketch fence',
    md: '```sketch\n{"version":1,"elements":[{"type":"rectangle","x":0,"y":0,"width":10,"height":10}]}\n```',
    expect: (out) => /```sketch/.test(out) && /"elements"/.test(out) && /rectangle/.test(out),
  },
]

// Pure layout checks (no DOM) for the JSON -> graph conversion.
function checkLayout() {
  let ok = true
  const graph = buildJsonFlow('{ "name": "x", "items": [1, 2] }')
  // root + name + items + 2 array entries = 5 nodes; edges = nodes - 1
  if (graph.nodes.length !== 5) {
    console.log(`FAIL  json layout node count (got ${graph.nodes.length}, want 5)`)
    ok = false
  } else if (graph.edges.length !== 4) {
    console.log(`FAIL  json layout edge count (got ${graph.edges.length}, want 4)`)
    ok = false
  } else {
    console.log('PASS  json layout node/edge counts')
  }

  const bad = buildJsonFlow('{ not valid json')
  if (!bad.error) {
    console.log('FAIL  invalid json should report an error')
    ok = false
  } else {
    console.log('PASS  invalid json reports an error')
  }
  return ok
}

let failures = 0
for (const test of cases) {
  let out = ''
  let ok = false
  try {
    out = roundtrip(test.md)
    ok = test.expect(out)
  } catch (error) {
    out = `THREW: ${(error as Error).message}`
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${test.name}`)
  if (!ok) {
    failures += 1
    console.log('  --- input ---\n' + test.md.replace(/^/gm, '  '))
    console.log('  --- output ---\n' + out.replace(/^/gm, '  '))
  }
}

const layoutOk = checkLayout()

console.log(`\n${cases.length - failures}/${cases.length} round-trip cases passed`)
process.exit(failures || !layoutOk ? 1 : 0)
