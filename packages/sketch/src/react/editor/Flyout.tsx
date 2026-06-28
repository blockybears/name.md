import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { useIsMobile } from './useIsMobile'

export interface FlyoutProps {
  /** Trigger button content (icon, swatch …). */
  trigger: ReactNode
  /** Accessible name + bottom-sheet/popover heading. */
  title: string
  /** Highlight the trigger (e.g. the active tool). */
  active?: boolean
  /** Render the trigger as a primary tool button (blue-filled when active). */
  tool?: boolean
  className?: string
  /** Content; receives a `close` callback so options can dismiss the menu. */
  children: ReactNode | ((close: () => void) => ReactNode)
}

/**
 * Responsive menu: a compact popover on desktop, a bottom sheet on mobile.
 * Closes on outside click (desktop) or backdrop tap (mobile).
 */
export function Flyout({ trigger, title, active, tool, className, children }: FlyoutProps) {
  const [open, setOpen] = useState(false)
  const mobile = useIsMobile()
  const ref = useRef<HTMLDivElement | null>(null)
  const close = () => setOpen(false)

  useEffect(() => {
    if (!open || mobile) {
      return
    }
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, mobile])

  const body = typeof children === 'function' ? children(close) : children

  return (
    <div className={`sketch-flyout ${className ?? ''}`} ref={ref}>
      <button
        type="button"
        className={tool ? 'sketch-tool-btn' : 'sketch-flyout-trigger'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-pressed={active}
        title={title}
        aria-label={title}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open &&
        (mobile
          ? createPortal(
              <div className="sketch-sheet-root">
                <div className="sketch-sheet-backdrop" onPointerDown={close} />
                <div className="sketch-sheet" role="menu">
                  <div className="sketch-sheet-head">
                    <span>{title}</span>
                    <button type="button" className="sketch-icon-btn" aria-label="Close" onClick={close}>
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                  <div className="sketch-sheet-body">{body}</div>
                </div>
              </div>,
              document.body,
            )
          : (
              <div className="sketch-flyout-pop" role="menu">
                {body}
              </div>
            ))}
    </div>
  )
}

/** A second-level panel inside a flyout: a back header + content. */
export function FlyoutSub({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <>
      <button type="button" className="sketch-flyout-back" onClick={onBack}>
        <Icon name="chevron-down" size={16} /> {title}
      </button>
      {children}
    </>
  )
}

/** A tappable row in a flyout that drills into a sub-panel (shows a value at right). */
export function FlyoutRow({ label, value, onClick }: { label: string; value?: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="sketch-flyout-row" onClick={onClick}>
      <span className="sketch-flyout-row-label">{label}</span>
      <span className="sketch-flyout-row-value">{value}</span>
      <Icon name="chevron-down" size={15} className="sketch-flyout-row-chevron" />
    </button>
  )
}
