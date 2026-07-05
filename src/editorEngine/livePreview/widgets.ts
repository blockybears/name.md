import { WidgetType, type EditorView } from '@codemirror/view'

/** Rendered inline image (`![alt](url)`) shown off the active line. */
export class ImageWidget extends WidgetType {
  readonly url: string
  readonly alt: string
  constructor(url: string, alt: string) {
    super()
    this.url = url
    this.alt = alt
  }
  eq(other: ImageWidget) {
    return other.url === this.url && other.alt === this.alt
  }
  toDOM() {
    const img = document.createElement('img')
    img.className = 'cm-wp-img'
    img.src = this.url
    img.alt = this.alt
    return img
  }
  get estimatedHeight() {
    return 140
  }
  ignoreEvent() {
    return false
  }
}

/** Rendered horizontal rule (`---`) shown off the active line. */
export class HrWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const hr = document.createElement('hr')
    hr.className = 'cm-wp-hr'
    return hr
  }
}

/** Pretty bullet glyph replacing a `-`/`*`/`+` list marker off the active line. */
export class BulletWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-wp-bullet'
    span.textContent = '•'
    return span
  }
}

/** Interactive task-list checkbox that toggles the `[ ]`/`[x]` marker in source. */
export class TaskCheckboxWidget extends WidgetType {
  readonly checked: boolean
  readonly from: number
  readonly to: number
  constructor(checked: boolean, from: number, to: number) {
    super()
    this.checked = checked
    this.from = from
    this.to = to
  }
  eq(other: TaskCheckboxWidget) {
    return other.checked === this.checked && other.from === this.from && other.to === this.to
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-wp-task'
    box.checked = this.checked
    box.addEventListener('mousedown', (event) => {
      event.preventDefault()
      view.dispatch({ changes: { from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]' } })
    })
    return box
  }
  ignoreEvent() {
    return true
  }
}

/** Rendered plain GFM table (`| a | b |`) shown off the active line; editing the
 *  table reveals its pipe source. Rich cells / sizing come with the advanced
 *  table block (phase 4). */
export class TableWidget extends WidgetType {
  readonly src: string
  constructor(src: string) {
    super()
    this.src = src
  }
  eq(other: TableWidget) {
    return other.src === this.src
  }
  toDOM() {
    const lines = this.src.split('\n').filter((line) => line.trim().startsWith('|'))
    const splitCells = (line: string) =>
      line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
    const table = document.createElement('table')
    table.className = 'cm-wp-table'
    lines.forEach((line, index) => {
      if (index === 1 && /^\s*\|?[\s:|-]+\|?\s*$/.test(line)) return // delimiter row
      const tr = document.createElement('tr')
      splitCells(line).forEach((cell) => {
        const el = document.createElement(index === 0 ? 'th' : 'td')
        el.textContent = cell
        tr.appendChild(el)
      })
      table.appendChild(tr)
    })
    return table
  }
  get estimatedHeight() {
    return 120
  }
}
