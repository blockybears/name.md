import { useRef, useState } from 'react'
import { Icon } from './Icon'
import { useIsMobile } from './useIsMobile'

const HOLD_MS = 700

/**
 * The read-mode padlock. On desktop a click unlocks to edit; on mobile it must
 * be held (with a filling ring + haptic) so a stray tap while scrolling notes
 * never unlocks the sketch.
 */
export function LockButton({ onUnlock }: { onUnlock: () => void }) {
  const mobile = useIsMobile()
  const [holding, setHolding] = useState(false)
  const timer = useRef<number | null>(null)

  const cancel = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    setHolding(false)
  }
  const start = () => {
    if (!mobile) {
      return
    }
    setHolding(true)
    timer.current = window.setTimeout(() => {
      timer.current = null
      setHolding(false)
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(18)
      }
      onUnlock()
    }, HOLD_MS)
  }

  return (
    <button
      type="button"
      className={`sketch-lock-toggle ${holding ? 'is-holding' : ''}`}
      aria-label="Unlock (edit mode)"
      title={mobile ? 'Hold to unlock' : 'Unlock to edit'}
      onClick={() => {
        if (!mobile) {
          onUnlock()
        }
      }}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
    >
      <Icon name="lock" />
      {holding && <span className="sketch-lock-ring" />}
    </button>
  )
}
