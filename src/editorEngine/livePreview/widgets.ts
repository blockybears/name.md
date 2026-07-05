import { WidgetType } from '@codemirror/view'

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
