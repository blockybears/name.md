import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface PropMenuProps {
  /** Content of the trigger button (icon and/or swatch). */
  trigger: ReactNode
  title: string
  active?: boolean
  children: ReactNode
}

/**
 * A toolbar-style button that opens a small popover above it (the properties
 * bar sits at the bottom, so menus expand upward). Closes on outside click.
 */
export function PropMenu({ trigger, title, active, children }: PropMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="sketch-propmenu" ref={ref}>
      <button
        type="button"
        className="sketch-propmenu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-pressed={active}
        title={title}
        aria-label={title}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open && <div className="sketch-propmenu-panel" role="menu">{children}</div>}
    </div>
  )
}

export function PropMenuRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sketch-propmenu-row">
      <span className="sketch-prop-label">{label}</span>
      {children}
    </div>
  )
}
