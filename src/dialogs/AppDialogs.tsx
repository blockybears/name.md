import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  defaultDialogTitle,
  type ActiveAppDialogRequest,
  type AppDialogRequest,
  type DialogResult,
} from './types'

type AppDialogHostProps = {
  dialog: ActiveAppDialogRequest | null
  onResolve: (value: DialogResult) => void
}

type ActiveDialogProps = {
  dialog: ActiveAppDialogRequest
  onResolve: (value: DialogResult) => void
}

function normalizeFolder(value: string) {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/')
}

function joinPath(...parts: string[]) {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

function uniqueFolders(folders: string[]) {
  return Array.from(new Set(['', ...folders.map(normalizeFolder)])).sort((left, right) => {
    if (!left) {
      return -1
    }

    if (!right) {
      return 1
    }

    return left.localeCompare(right)
  })
}

function cancelResult(dialog: AppDialogRequest): DialogResult {
  if (dialog.kind === 'confirmation') {
    return false
  }

  if (dialog.kind === 'message') {
    return undefined
  }

  return null
}

function ActiveDialog({ dialog, onResolve }: ActiveDialogProps) {
  const [textValue, setTextValue] = useState(() => (dialog.kind === 'text' ? dialog.defaultValue ?? '' : ''))
  const [folderValue, setFolderValue] = useState(() =>
    dialog.kind === 'destinationFolder' ? normalizeFolder(dialog.defaultValue ?? '') : '',
  )
  const [newFolderValue, setNewFolderValue] = useState('')
  const [customFolders, setCustomFolders] = useState<string[]>([])
  const firstInputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)
  const firstChoiceRef = useRef<HTMLButtonElement | null>(null)
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null)
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)

  const folderOptions = useMemo(() => {
    if (dialog.kind !== 'destinationFolder') {
      return ['']
    }

    return uniqueFolders([...dialog.folders, ...customFolders])
  }, [customFolders, dialog])

  const uploadPath = useMemo(() => {
    if (dialog.kind !== 'destinationFolder') {
      return ''
    }

    return joinPath(dialog.docsRoot, folderValue, dialog.fileName)
  }, [dialog, folderValue])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (dialog.kind === 'text' || dialog.kind === 'destinationFolder') {
        firstInputRef.current?.focus()
        return
      }

      if (dialog.kind === 'choice') {
        firstChoiceRef.current?.focus()
        return
      }

      if (dialog.kind === 'confirmation' && dialog.danger) {
        cancelButtonRef.current?.focus()
        return
      }

      primaryButtonRef.current?.focus()
    }, 0)

    return () => window.clearTimeout(handle)
  }, [dialog])

  const close = () => onResolve(cancelResult(dialog))

  const addCustomFolder = () => {
    const normalized = normalizeFolder(newFolderValue)
    if (!normalized) {
      return
    }

    setCustomFolders((current) => [...current, normalized])
    setFolderValue(normalized)
    setNewFolderValue('')
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (dialog.kind === 'message') {
      onResolve(undefined)
      return
    }

    if (dialog.kind === 'confirmation') {
      onResolve(true)
      return
    }

    if (dialog.kind === 'text') {
      onResolve(textValue)
      return
    }

    if (dialog.kind === 'choice') {
      return
    }

    onResolve(normalizeFolder(folderValue))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()

    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  const handleNewFolderKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || !newFolderValue.trim()) {
      return
    }

    event.preventDefault()
    addCustomFolder()
  }

  return (
    <div className="app-dialog-layer" onMouseDown={close} onKeyDown={handleKeyDown}>
      <form
        className={`app-dialog ${dialog.kind === 'destinationFolder' ? 'app-dialog-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-description"
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="app-dialog-header">
          <span className="app-dialog-title" id="app-dialog-title">
            {dialog.title ?? defaultDialogTitle}
          </span>
        </header>

        <section className="app-dialog-body" id="app-dialog-description">
          {dialog.kind === 'destinationFolder' ? (
            <>
              <h2>{dialog.heading}</h2>
              <p>{dialog.message}</p>
              <label className="dialog-field">
                <span>Folder</span>
                <select
                  ref={(node) => {
                    firstInputRef.current = node
                  }}
                  value={folderValue}
                  onChange={(event) => setFolderValue(event.target.value)}
                >
                  {folderOptions.map((folder) => (
                    <option key={folder || 'root'} value={folder}>
                      /{dialog.docsRoot}{folder ? `/${folder}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div className="new-folder-row">
                <input
                  aria-label="New folder under docs"
                  placeholder="New folder"
                  value={newFolderValue}
                  onChange={(event) => setNewFolderValue(event.target.value)}
                  onKeyDown={handleNewFolderKeyDown}
                />
                <button type="button" onClick={addCustomFolder} disabled={!newFolderValue.trim()}>
                  New Folder
                </button>
              </div>
              <div className="upload-preview">
                <span>File will be uploaded to</span>
                <strong>{uploadPath}</strong>
              </div>
            </>
          ) : dialog.kind === 'choice' ? (
            <>
              {dialog.heading && <h2>{dialog.heading}</h2>}
              <p>{dialog.message}</p>
              <div className="choice-list">
                {dialog.choices.map((choice, index) => (
                  <button
                    key={choice.value}
                    ref={(node) => {
                      if (index === 0) {
                        firstChoiceRef.current = node
                      }
                    }}
                    type="button"
                    className="choice-button"
                    onClick={() => onResolve(choice.value)}
                  >
                    <span>{choice.label}</span>
                    {choice.description && <small>{choice.description}</small>}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {dialog.kind === 'text' ? (
                <label className="dialog-field">
                  <span>{dialog.label}</span>
                  {dialog.message && <small>{dialog.message}</small>}
                  <input
                    ref={(node) => {
                      firstInputRef.current = node
                    }}
                    value={textValue}
                    onChange={(event) => setTextValue(event.target.value)}
                  />
                </label>
              ) : (
                <p>{dialog.message}</p>
              )}
            </>
          )}
        </section>

        <footer className="app-dialog-actions">
          {dialog.kind !== 'message' && (
            <button ref={cancelButtonRef} type="button" onClick={close}>
              {dialog.cancelLabel ?? 'Cancel'}
            </button>
          )}
          {dialog.kind !== 'choice' && (
            <button
              ref={primaryButtonRef}
              type="submit"
              className={dialog.kind === 'confirmation' && dialog.danger ? 'danger-action' : 'primary-action'}
            >
              {dialog.kind === 'message' ? dialog.okLabel ?? 'OK' : dialog.confirmLabel ?? 'OK'}
            </button>
          )}
        </footer>
      </form>
    </div>
  )
}

export function AppDialogHost({ dialog, onResolve }: AppDialogHostProps) {
  if (!dialog) {
    return null
  }

  return <ActiveDialog key={dialog.requestId} dialog={dialog} onResolve={onResolve} />
}
