import { useCallback, useMemo, useRef, useState } from 'react'
import {
  defaultDialogTitle,
  type ActiveAppDialogRequest,
  type AppDialogRequest,
  type AppDialogs,
  type DialogResult,
} from './types'

export function useAppDialogs() {
  const [dialog, setDialog] = useState<ActiveAppDialogRequest | null>(null)
  const resolverRef = useRef<((value: DialogResult) => void) | null>(null)
  const requestIdRef = useRef(0)

  const openDialog = useCallback((request: AppDialogRequest) => {
    return new Promise<DialogResult>((resolve) => {
      resolverRef.current?.(null)
      resolverRef.current = resolve
      requestIdRef.current += 1
      setDialog({ ...request, requestId: requestIdRef.current } as ActiveAppDialogRequest)
    })
  }, [])

  const resolveDialog = useCallback((value: DialogResult) => {
    const resolver = resolverRef.current
    resolverRef.current = null
    setDialog(null)
    resolver?.(value)
  }, [])

  const dialogs = useMemo<AppDialogs>(
    () => ({
      async choose(options) {
        const result = await openDialog({
          kind: 'choice',
          title: defaultDialogTitle,
          cancelLabel: 'Cancel',
          ...options,
        })
        return typeof result === 'string' ? result : null
      },
      async showMessage(options) {
        await openDialog({ kind: 'message', title: defaultDialogTitle, okLabel: 'OK', ...options })
      },
      async requestConfirmation(options) {
        const result = await openDialog({
          kind: 'confirmation',
          title: defaultDialogTitle,
          cancelLabel: 'Cancel',
          confirmLabel: 'OK',
          ...options,
        })
        return result === true
      },
      async requestText(options) {
        const result = await openDialog({
          kind: 'text',
          title: defaultDialogTitle,
          cancelLabel: 'Cancel',
          confirmLabel: 'OK',
          defaultValue: '',
          ...options,
        })
        return typeof result === 'string' ? result : null
      },
      async selectDestinationFolder(options) {
        const result = await openDialog({
          kind: 'destinationFolder',
          title: defaultDialogTitle,
          cancelLabel: 'Cancel',
          confirmLabel: 'Add to Library',
          defaultValue: '',
          ...options,
        })
        return typeof result === 'string' ? result : null
      },
    }),
    [openDialog],
  )

  return { dialog, dialogs, resolveDialog }
}
