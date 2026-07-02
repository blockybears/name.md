import { X } from 'lucide-react'
import type { OutlineHeading } from './documentOutline'

type DocumentMapProps = {
  headings: OutlineHeading[]
  onSelect: (pos: number) => void
  onClose: () => void
}

/** A document outline (headings) side panel. Stays open until closed or a
 *  heading is chosen — mirrors the library drawer. */
export function DocumentMap({ headings, onSelect, onClose }: DocumentMapProps) {
  const minLevel = headings.reduce((min, heading) => Math.min(min, heading.level), 6)

  return (
    <aside className="doc-map" role="navigation" aria-label="Document map">
      <div className="doc-map-header">
        <span>Document map</span>
        <button type="button" className="icon-button" aria-label="Close document map" title="Close" onClick={onClose}>
          <X aria-hidden="true" size={16} />
        </button>
      </div>
      {headings.length === 0 ? (
        <div className="doc-map-empty">No headings in this document yet.</div>
      ) : (
        <nav className="doc-map-list">
          {headings.map((heading, index) => (
            <button
              key={`${heading.pos}-${index}`}
              type="button"
              className="doc-map-item"
              data-level={heading.level}
              style={{ paddingInlineStart: `${(heading.level - minLevel) * 14 + 12}px` }}
              onClick={() => onSelect(heading.pos)}
            >
              {heading.text}
            </button>
          ))}
        </nav>
      )}
    </aside>
  )
}
