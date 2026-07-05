/* eslint-disable react-refresh/only-export-components -- dev-only harness entry */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CmMarkdownEditor } from '../CmMarkdownEditor'

// Harness for the advanced ```table block (setup.ts registers it).

const initialTable = {
  cols: [{ w: 200 }, { w: 120 }, { w: 260 }],
  rows: [
    { header: true, cells: [{ text: 'Task' }, { text: 'Qty' }, { text: 'Notes' }] },
    { cells: [{ text: 'Design' }, { text: '3' }, { text: '- wireframes\n- review' }] },
    { cells: [{ text: 'Build' }, { text: '8' }, { text: 'core engine' }] },
  ],
}

const doc = [
  '# Advanced table harness',
  '',
  'Some intro text above the table.',
  '',
  '```table',
  JSON.stringify(initialTable),
  '```',
  '',
  'Some text below the table.',
  '',
].join('\n')

const docRef = { value: doc }

declare global {
  interface Window {
    __table?: {
      cells: () => string[]
      colWidths: () => number[]
      docSource: () => string
    }
  }
}

function Harness() {
  const [value, setValue] = useState(doc)
  return (
    <CmMarkdownEditor
      value={value}
      onChange={(next) => {
        docRef.value = next
        setValue(next)
      }}
    />
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)

window.__table = {
  cells: () => Array.from(document.querySelectorAll('.adv-cell')).map((el) => (el as HTMLElement).innerText),
  colWidths: () => Array.from(document.querySelectorAll('.adv-table col')).slice(1).map((c) => parseInt((c as HTMLElement).style.width) || 0),
  docSource: () => docRef.value,
}
