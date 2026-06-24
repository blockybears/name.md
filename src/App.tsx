import { hide as hideApp, onBackButtonPress } from '@tauri-apps/api/app'
import { open, save } from '@tauri-apps/plugin-dialog'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronsDownUp,
  Cloud,
  Code,
  Code2,
  Columns3,
  EllipsisVertical,
  FileText,
  FilePlus,
  FolderOpen,
  Hash,
  Heading,
  Highlighter,
  Image,
  Info,
  Italic,
  Keyboard,
  Library as LibraryIcon,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  ListTree,
  Minus,
  Moon,
  Network,
  NotebookTabs,
  PenTool,
  Share2,
  Pilcrow,
  Quote,
  Redo2,
  RefreshCw,
  RotateCw,
  Rows3,
  Save,
  SaveAll,
  Settings,
  Strikethrough,
  Subscript,
  Sun,
  Superscript,
  Table2,
  Trash2,
  Type as TypeIcon,
  Underline,
  Undo2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react'
import type { Editor } from '@tiptap/react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from 'react'
import './App.css'
import { AppDialogHost } from './dialogs/AppDialogs'
import { useAppDialogs } from './dialogs/useAppDialogs'
import { getStarterMarkdown, MarkdownEditor } from './editor/MarkdownEditor'
import { normalizeHeadingId, sanitizeFootnoteLabel } from './editor/extendedMarkdown'
import {
  configureGitHubProvider,
  createGitHubLibraryFile,
  createGitHubRepo,
  ensureGitHubRepoFile,
  getGitHubRepo,
  listGitHubRepos,
  pollGitHubDeviceFlow,
  startGitHubDeviceFlow,
} from './library/githubProvider'
import {
  LibraryExplorer,
  SaveSyncIndicator,
} from './library/LibraryExplorer'
import { createDirectLocalFile, directLocalLibrary } from './library/localProvider'
import { getStartupFilePaths, isTauriRuntime, isUriPath, readTextPath, writeTextPath } from './library/localFiles'
import { getLibraryProvider } from './library/providers'
import { saveSyncStateFromFileStatus, type SaveSyncState } from './library/saveSyncStatus'
import {
  deleteFileLink,
  getFileLink,
  listFileLinks,
  loadActiveLibraryId,
  loadEditorSession,
  loadGitHubAuth,
  loadGitHubClientId,
  loadGitHubDeviceFlow,
  loadLibraries,
  nowIso,
  saveActiveLibraryId,
  saveEditorSession,
  saveGitHubAuth,
  saveGitHubClientId,
  saveGitHubDeviceFlow,
  saveLibraries,
  setFileLink,
} from './library/storage'
import {
  fileNameFromPath,
  joinLibraryPath,
  type ConflictResolution,
  type GitHubAuthState,
  type GitHubDeviceFlowState,
  type GitHubRepo,
  type Library,
  type LibraryFile,
} from './library/types'
import { openExternalUrl } from './shell/openExternal'

type ThemeMode = 'light' | 'warm' | 'dark'
type WidthMode = 'full' | 'comfortable' | 'page'
type ToolbarMenuId = 'heading' | 'format' | 'block' | 'list' | 'table' | 'misc' | 'more'

const widthModeLabels: Record<WidthMode, string> = {
  full: 'Full width',
  comfortable: 'Comfortable',
  page: 'Page',
}

const defaultFileName = 'Untitled.md'
const themeStorageKey = 'theme-mode'
const widthStorageKey = 'width-mode'
const zoomStorageKey = 'zoom-level'
const minimumZoom = 50
const maximumZoom = 200
const zoomStep = 10
const defaultGitHubRepoName = 'name.md-files'
const defaultGitHubBranch = 'main'
const defaultGitHubDocsRoot = 'docs'
const defaultGitHubAssetsRoot = 'assets'
const defaultGitHubKeepFiles = ['docs/.keep', 'assets/images/.keep']

type IconButtonProps = {
  active?: boolean
  disabled?: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}

type ToolbarDropdownProps = {
  active?: boolean
  children: ReactNode
  disabled?: boolean
  icon: LucideIcon
  id: ToolbarMenuId
  label: string
  menuClassName?: string
  openMenu: ToolbarMenuId | null
  setOpenMenu: Dispatch<SetStateAction<ToolbarMenuId | null>>
}

type ToolbarMenuItemProps = {
  active?: boolean
  disabled?: boolean
  icon?: LucideIcon
  label: string
  onClick: () => void
  prefix?: string
}

function IconButton({ active = false, disabled = false, icon: Icon, label, onClick }: IconButtonProps) {
  return (
    <button
      type="button"
      className={active ? 'icon-button active' : 'icon-button'}
      aria-label={label}
      aria-pressed={active || undefined}
      data-tooltip={label}
      disabled={disabled}
      title={label}
      onClick={onClick}
    >
      <Icon aria-hidden="true" size={17} strokeWidth={2.1} />
    </button>
  )
}

function ToolbarDropdown({
  active = false,
  children,
  disabled = false,
  icon: Icon,
  id,
  label,
  menuClassName = '',
  openMenu,
  setOpenMenu,
}: ToolbarDropdownProps) {
  const openMenuActive = openMenu === id

  return (
    <div className="toolbar-menu-control">
      <button
        type="button"
        className={active ? 'toolbar-menu-button active' : 'toolbar-menu-button'}
        aria-haspopup="menu"
        aria-expanded={openMenuActive}
        aria-label={label}
        data-tooltip={label}
        disabled={disabled}
        title={label}
        onClick={() => setOpenMenu(openMenuActive ? null : id)}
      >
        <Icon aria-hidden="true" size={17} strokeWidth={2.1} />
        <ChevronDown aria-hidden="true" size={13} strokeWidth={2.2} />
      </button>
      {openMenuActive && (
        <div className={menuClassName ? `toolbar-menu ${menuClassName}` : 'toolbar-menu'} role="menu">
          {children}
        </div>
      )}
    </div>
  )
}

function ToolbarMenuItem({
  active = false,
  disabled = false,
  icon: Icon,
  label,
  onClick,
  prefix,
}: ToolbarMenuItemProps) {
  return (
    <button
      type="button"
      role={active ? 'menuitemradio' : 'menuitem'}
      aria-checked={active || undefined}
      className={active ? 'active' : ''}
      disabled={disabled}
      onClick={onClick}
    >
      {Icon && <Icon aria-hidden="true" size={15} />}
      {prefix && <span aria-hidden="true">{prefix}</span>}
      {label}
    </button>
  )
}

function normalizeMarkdown(markdown: string) {
  return markdown.endsWith('\n') ? markdown : `${markdown}\n`
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function getSystemTheme(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialTheme(): ThemeMode {
  const storedTheme = localStorage.getItem(themeStorageKey)

  if (storedTheme === 'light' || storedTheme === 'warm' || storedTheme === 'dark') {
    return storedTheme
  }

  return getSystemTheme()
}

function getInitialWidthMode(): WidthMode {
  const storedWidth = localStorage.getItem(widthStorageKey)

  if (storedWidth === 'full' || storedWidth === 'comfortable' || storedWidth === 'page') {
    return storedWidth
  }

  return 'full'
}

function clampZoom(value: number) {
  return Math.min(maximumZoom, Math.max(minimumZoom, value))
}

function getInitialZoom() {
  const storedZoom = Number(localStorage.getItem(zoomStorageKey))

  if (Number.isFinite(storedZoom)) {
    return clampZoom(storedZoom)
  }

  return 100
}

function getInitialEditorSession() {
  const storedSession = loadEditorSession()

  if (storedSession?.hasOpenDocument && typeof storedSession.markdown === 'string') {
    return storedSession
  }

  const starter = getStarterMarkdown()
  return {
    currentFile: null,
    hasOpenDocument: true,
    markdown: starter,
    savedMarkdown: starter,
    updatedAt: new Date().toISOString(),
  }
}

function getNextTheme(theme: ThemeMode): ThemeMode {
  if (theme === 'light') {
    return 'warm'
  }

  if (theme === 'warm') {
    return 'dark'
  }

  return 'light'
}

function ThemeIcon({ theme }: { theme: ThemeMode }) {
  if (theme === 'warm') {
    return <Cloud aria-hidden="true" size={17} />
  }

  if (theme === 'dark') {
    return <Moon aria-hidden="true" size={17} />
  }

  return <Sun aria-hidden="true" size={17} />
}

function fileDisplayName(file: LibraryFile | null) {
  return file?.name || defaultFileName
}

function libraryForFile(file: LibraryFile | null, libraries: Library[]) {
  if (!file) {
    return null
  }

  if (file.libraryId === directLocalLibrary.id) {
    return directLocalLibrary
  }

  return libraries.find((library) => library.id === file.libraryId) ?? null
}

function providerDisplayName(library: Library | null) {
  if (!library) {
    return 'local'
  }

  return library.provider === 'github' ? 'GitHub' : 'local'
}

function getSaveSyncState({
  dirty,
  file,
  syncing,
}: {
  dirty: boolean
  file: LibraryFile | null
  syncing: boolean
}): SaveSyncState {
  if (file?.status === 'conflict') {
    return 'conflict'
  }

  if (syncing) {
    return 'syncing'
  }

  if (dirty) {
    return 'unsaved_unsynced'
  }

  if (file) {
    return saveSyncStateFromFileStatus(file.status)
  }

  return 'unsaved_unsynced'
}

function createLocalLibrary(rootPath: string): Library {
  return {
    id: `local:${rootPath}`,
    provider: 'local',
    name: fileNameFromPath(rootPath),
    displayName: fileNameFromPath(rootPath),
    rootPath,
    syncMode: 'manual',
  }
}

function createGitHubLibrary(repo: GitHubRepo, branch: string, rootPath: string, assetsPath: string, login?: string): Library {
  const normalizedRoot = joinLibraryPath(rootPath)
  return {
    id: `github:${repo.owner}/${repo.name}:${branch}:${normalizedRoot}`,
    provider: 'github',
    name: repo.name,
    displayName: `${repo.fullName}/${normalizedRoot}`,
    rootPath: normalizedRoot,
    repoOwner: repo.owner,
    repoName: repo.name,
    branch,
    assetsPath: joinLibraryPath(assetsPath),
    accountLogin: login,
    syncMode: 'manual',
  }
}

function createDefaultGitHubLibrary(repo: GitHubRepo, login?: string) {
  return createGitHubLibrary(
    repo,
    defaultGitHubBranch,
    defaultGitHubDocsRoot,
    defaultGitHubAssetsRoot,
    login,
  )
}

function parentFolder(path: string) {
  return path.split('/').filter(Boolean).slice(0, -1).join('/')
}

function knownLibraryFolders(currentFolder: string, files: LibraryFile[]) {
  const folders = new Set([''])
  if (currentFolder) {
    folders.add(currentFolder)
  }

  for (const file of files) {
    if (file.type === 'folder') {
      folders.add(file.path)
    }
  }

  return Array.from(folders)
}

function relativeAssetImagePath(file: LibraryFile | null, library: Library | null) {
  if (!file || !library || library.provider !== 'github' || !library.assetsPath) {
    return ''
  }

  const depthFromRepoRoot = 1 + parentFolder(file.path).split('/').filter(Boolean).length
  return `${'../'.repeat(depthFromRepoRoot)}${joinLibraryPath(library.assetsPath, 'images')}/`
}

function formatDeviceFlowTimeRemaining(expiresAt: number) {
  const remainingSeconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

type GitHubDeviceSignInModalProps = {
  flow: GitHubDeviceFlowState
  polling: boolean
  onCancel: () => void
  onOpenBrowser: () => void
  onPollNow: () => void
}

function GitHubDeviceSignInModal({
  flow,
  polling,
  onCancel,
  onOpenBrowser,
  onPollNow,
}: GitHubDeviceSignInModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null)
  const [now, setNow] = useState(Date.now)
  const expired = now >= flow.expiresAt

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }

    if (event.key === 'Enter' && !expired) {
      event.preventDefault()
      onPollNow()
    }
  }

  return (
    <div className="app-dialog-layer github-device-layer" onKeyDown={handleKeyDown}>
      <section
        ref={dialogRef}
        className="app-dialog app-dialog-wide github-device-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-device-title"
        tabIndex={-1}
      >
        <header className="app-dialog-header">
          <span className="app-dialog-title">NAME.md</span>
        </header>
        <section className="app-dialog-body">
          <div className="github-device-copy">
            <h2 id="github-device-title">Connect GitHub</h2>
            <p>Use the code below in GitHub’s verification page. This screen will stay open while NAME.md waits for authorization.</p>
          </div>

          <div className="github-device-code" aria-label={`GitHub device code ${flow.userCode}`}>
            {flow.userCode}
          </div>

          <div className="github-device-details">
            <span>Verification page</span>
            <strong>{flow.verificationUri}</strong>
            <span>Expires in</span>
            <strong>{expired ? 'expired' : formatDeviceFlowTimeRemaining(flow.expiresAt)}</strong>
          </div>

          {expired && <p className="github-device-warning">This sign-in code expired. Cancel and connect GitHub again.</p>}
        </section>
        <footer className="app-dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onOpenBrowser} disabled={expired}>
            Open Browser
          </button>
          <button type="button" className="primary-action" onClick={onPollNow} disabled={expired || polling}>
            {polling ? 'Checking...' : 'Check Now'}
          </button>
        </footer>
      </section>
    </div>
  )
}

function useIsMobileViewport() {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 780px)').matches)

  useEffect(() => {
    const query = window.matchMedia('(max-width: 780px)')
    const update = () => setMobile(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return mobile
}

function App() {
  const initialEditorSession = useMemo(getInitialEditorSession, [])
  const [markdown, setMarkdown] = useState(() => initialEditorSession.markdown)
  const [savedMarkdown, setSavedMarkdown] = useState(() => initialEditorSession.savedMarkdown)
  const [currentFile, setCurrentFile] = useState<LibraryFile | null>(() => initialEditorSession.currentFile)
  const [hasOpenDocument, setHasOpenDocument] = useState(() => initialEditorSession.hasOpenDocument)
  const [resetKey, setResetKey] = useState(0)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [status, setStatus] = useState('Ready')
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [widthMode, setWidthMode] = useState<WidthMode>(getInitialWidthMode)
  const [zoom, setZoom] = useState(getInitialZoom)
  const [openToolbarMenu, setOpenToolbarMenu] = useState<ToolbarMenuId | null>(null)
  const [mobileFormatbarOpen, setMobileFormatbarOpen] = useState(false)
  const [libraries, setLibraries] = useState<Library[]>(loadLibraries)
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(loadActiveLibraryId)
  const [libraryFiles, setLibraryFiles] = useState<LibraryFile[]>([])
  const [libraryFolderPath, setLibraryFolderPath] = useState('')
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryDrawerOpen, setLibraryDrawerOpen] = useState(false)
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false)
  const [githubAuth, setGithubAuth] = useState<GitHubAuthState | null>(loadGitHubAuth)
  const [githubClientId, setGithubClientId] = useState(loadGitHubClientId)
  const [githubDeviceFlow, setGithubDeviceFlow] = useState<GitHubDeviceFlowState | null>(loadGitHubDeviceFlow)
  const [githubDevicePolling, setGithubDevicePolling] = useState(false)
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([])
  const [syncing, setSyncing] = useState(false)
  const [fileLinksTick, setFileLinksTick] = useState(0)
  const ensuringDefaultGitHubRef = useRef(false)
  const startupFileLoadedRef = useRef(false)
  const lastDevicePollAtRef = useRef(0)
  const { dialog, dialogs, resolveDialog } = useAppDialogs()

  const mobile = useIsMobileViewport()
  const dirty = markdown !== savedMarkdown
  const currentLibrary = libraryForFile(currentFile, libraries)
  const activeLibrary = libraries.find((library) => library.id === activeLibraryId) ?? libraries[0] ?? null
  const linkedLocalPaths = useMemo(() => {
    // fileLinksTick is read here so the memo recomputes after links change in localStorage.
    void fileLinksTick
    if (!activeLibrary || activeLibrary.provider !== 'github') {
      return {} as Record<string, string>
    }
    const map: Record<string, string> = {}
    for (const link of listFileLinks(activeLibrary.id)) {
      map[link.repoPath] = link.localPath
    }
    return map
  }, [activeLibrary, fileLinksTick])
  const defaultGitHubLibrary = libraries.find(
    (library) =>
      library.provider === 'github' &&
      library.repoName === defaultGitHubRepoName &&
      library.branch === defaultGitHubBranch &&
      library.rootPath === defaultGitHubDocsRoot,
  )
  const tableActive = Boolean(editor?.isActive('table'))
  const activeHeadingLevel = editor?.isActive('heading') ? editor.getAttributes('heading').level : null

  useEffect(() => {
    configureGitHubProvider(() => githubAuth)
  }, [githubAuth])

  useEffect(() => {
    saveLibraries(libraries)
  }, [libraries])

  useEffect(() => {
    saveActiveLibraryId(activeLibrary?.id ?? null)
  }, [activeLibrary?.id])

  useEffect(() => {
    saveEditorSession({
      currentFile,
      hasOpenDocument,
      markdown,
      savedMarkdown,
      updatedAt: new Date().toISOString(),
    })
  }, [currentFile, hasOpenDocument, markdown, savedMarkdown])

  useEffect(() => {
    saveGitHubAuth(githubAuth)
  }, [githubAuth])

  useEffect(() => {
    saveGitHubClientId(githubClientId)
  }, [githubClientId])

  useEffect(() => {
    document.title = `${dirty ? '*' : ''}${fileDisplayName(currentFile)} - NAME.md`
  }, [dirty, currentFile])

  useEffect(() => {
    localStorage.setItem(themeStorageKey, theme)
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])

  useEffect(() => {
    localStorage.setItem(widthStorageKey, widthMode)
  }, [widthMode])

  useEffect(() => {
    localStorage.setItem(zoomStorageKey, String(zoom))
  }, [zoom])

  useEffect(() => {
    if (!openToolbarMenu) {
      return
    }

    const closeFloatingMenus = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('.toolbar-menu-control')) {
        return
      }

      setOpenToolbarMenu(null)
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenToolbarMenu(null)
      }
    }

    document.addEventListener('mousedown', closeFloatingMenus)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeFloatingMenus)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openToolbarMenu])

  useEffect(() => {
    if (!libraryDrawerOpen) {
      return
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLibraryDrawerOpen(false)
      }
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [libraryDrawerOpen])

  useEffect(() => {
    if (!isTauriRuntime()) {
      return
    }

    let disposed = false
    let listener: { unregister: () => Promise<void> } | null = null

    void onBackButtonPress(({ canGoBack }) => {
      if (mobile && mobileLibraryOpen && hasOpenDocument) {
        setMobileLibraryOpen(false)
        return
      }

      if (openToolbarMenu) {
        setOpenToolbarMenu(null)
        return
      }

      if (mobile && mobileFormatbarOpen) {
        setMobileFormatbarOpen(false)
        return
      }

      if (canGoBack) {
        window.history.back()
        return
      }

      void hideApp()
    })
      .then((registered) => {
        if (disposed) {
          void registered.unregister()
          return
        }

        listener = registered
      })
      .catch((error) => setStatus(`Android back handler failed: ${formatError(error)}`))

    return () => {
      disposed = true
      void listener?.unregister()
    }
  }, [hasOpenDocument, mobile, mobileFormatbarOpen, mobileLibraryOpen, openToolbarMenu])

  const refreshLibrary = useCallback(async (library = activeLibrary, path = libraryFolderPath) => {
    if (!library) {
      setLibraryFiles([])
      return
    }

    if (library.provider === 'github' && !githubAuth) {
      setStatus('Connect GitHub before listing this library')
      return
    }

    setLibraryLoading(true)
    try {
      const files = await getLibraryProvider(library).listFiles(library, path)
      setLibraryFiles(files)
    } catch (error) {
      setStatus(`Library refresh failed: ${formatError(error)}`)
    } finally {
      setLibraryLoading(false)
    }
  }, [activeLibrary, githubAuth, libraryFolderPath])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshLibrary()
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [refreshLibrary])

  useEffect(() => {
    if (!githubAuth) {
      return
    }

    let cancelled = false
    void listGitHubRepos()
      .then((repos) => {
        if (!cancelled) {
          setGithubRepos(repos)
        }
      })
      .catch((error) => setStatus(`GitHub repo list failed: ${formatError(error)}`))

    return () => {
      cancelled = true
    }
  }, [githubAuth])

  const setDocument = useCallback((content: string, file: LibraryFile | null, markClean = true) => {
    setMarkdown(content)
    if (markClean) {
      setSavedMarkdown(content)
    }
    setCurrentFile(file)
    setHasOpenDocument(true)
    setResetKey((key) => key + 1)
  }, [])

  const saveLibraryFile = useCallback(async (file: LibraryFile, library: Library, content: string) => {
    const output = normalizeMarkdown(content)
    const provider = getLibraryProvider(library)
    const savedFile = await provider.writeFile(file, library, output)
    setMarkdown(output)
    setSavedMarkdown(output)
    setCurrentFile(savedFile)
    if (library.provider === 'github') {
      setStatus(`${savedFile.name} saved locally. Sync pending.`)
    } else {
      setStatus(`Saved ${savedFile.name}`)
    }
    await refreshLibrary(library, libraryFolderPath)
    return savedFile
  }, [libraryFolderPath, refreshLibrary])

  const openDirectFile = useCallback(async (path: string) => {
    const content = await readTextPath(path)
    const file = createDirectLocalFile(path)
    setDocument(content, file)
    setStatus(`Opened ${file.name}`)
    setMobileLibraryOpen(false)
  }, [setDocument])

  useEffect(() => {
    if (!isTauriRuntime() || startupFileLoadedRef.current) {
      return
    }

    startupFileLoadedRef.current = true
    void getStartupFilePaths()
      .then((paths) => {
        const path = paths[0]
        if (!path) {
          return
        }

        return openDirectFile(path)
      })
      .catch((error) => setStatus(`Startup file open failed: ${formatError(error)}`))
  }, [openDirectFile])

  useEffect(() => {
    if (!currentFile || !currentLibrary || currentLibrary.provider !== 'github' || !dirty) {
      return
    }

    const handle = window.setTimeout(() => {
      void saveLibraryFile(currentFile, currentLibrary, markdown).catch((error) => {
        setStatus(`Autosave failed: ${formatError(error)}`)
      })
    }, 1200)

    return () => window.clearTimeout(handle)
  }, [currentFile, currentLibrary, dirty, markdown, saveLibraryFile])

  const handleNew = useCallback(() => {
    setDocument('# Untitled\n\n', null)
    setStatus('New file')
    editor?.commands.focus('end')
    if (mobile) {
      setMobileLibraryOpen(false)
    }
  }, [editor, mobile, setDocument])

  const handleOpen = useCallback(async () => {
    if (!isTauriRuntime()) {
      setStatus('Open is available in the Tauri app')
      return
    }

    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] }],
      })

      if (typeof selected !== 'string') {
        return
      }

      await openDirectFile(selected)
    } catch (error) {
      setStatus(`Open failed: ${formatError(error)}`)
    }
  }, [openDirectFile])

  const handleSaveAs = useCallback(async () => {
    if (!isTauriRuntime()) {
      setStatus('Save is available in the Tauri app')
      return
    }

    try {
      const target = await save({
        defaultPath: currentFile && currentFile.libraryId === directLocalLibrary.id && !isUriPath(currentFile.path)
          ? currentFile.path
          : fileDisplayName(currentFile),
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })

      if (!target) {
        return
      }

      const output = normalizeMarkdown(markdown)
      await writeTextPath(target, output)
      const file = createDirectLocalFile(target)
      setMarkdown(output)
      setSavedMarkdown(output)
      setCurrentFile(file)
      setStatus(`Saved ${file.name}`)
    } catch (error) {
      setStatus(`Save failed: ${formatError(error)}`)
    }
  }, [currentFile, markdown])

  const handleSave = useCallback(async () => {
    if (!currentFile || !currentLibrary) {
      await handleSaveAs()
      return
    }

    try {
      await saveLibraryFile(currentFile, currentLibrary, markdown)
    } catch (error) {
      setStatus(`Save failed: ${formatError(error)}`)
    }
  }, [currentFile, currentLibrary, handleSaveAs, markdown, saveLibraryFile])

  const handleOpenLibraryFile = useCallback(async (file: LibraryFile) => {
    const library = libraries.find((item) => item.id === file.libraryId)
    if (!library) {
      setStatus('Library not found')
      return
    }

    try {
      const content = await getLibraryProvider(library).readFile(file, library)
      setDocument(content, file)
      setStatus(`Opened ${file.name}`)
      setLibraryDrawerOpen(false)
      setMobileLibraryOpen(false)
    } catch (error) {
      setStatus(`Open failed: ${formatError(error)}`)
    }
  }, [libraries, setDocument])

  const handleAddLocalLibrary = useCallback(async () => {
    if (!isTauriRuntime()) {
      setStatus('Local libraries are available in the Tauri app')
      return
    }

    try {
      const selected = await open({ directory: true, multiple: false })
      if (typeof selected !== 'string') {
        return
      }

      const library = createLocalLibrary(selected)
      setLibraries((current) => {
        const withoutDuplicate = current.filter((item) => item.id !== library.id)
        return [...withoutDuplicate, library]
      })
      setActiveLibraryId(library.id)
      setLibraryFolderPath('')
      setStatus(`Added local library ${library.displayName}`)
    } catch (error) {
      setStatus(`Local library failed: ${formatError(error)}`)
    }
  }, [])

  const handleSelectLibrary = useCallback((libraryId: string) => {
    setActiveLibraryId(libraryId)
    setLibraryFolderPath('')
  }, [])

  const handleCreateFile = useCallback(async () => {
    if (!activeLibrary) {
      return
    }

    const name = (await dialogs.requestText({
      title: 'NAME.md',
      label: 'File name',
      defaultValue: 'Untitled.md',
      confirmLabel: 'Create',
    }))?.trim()
    if (!name) {
      return
    }

    try {
      const file = await getLibraryProvider(activeLibrary).createFile(
        activeLibrary,
        joinLibraryPath(libraryFolderPath, name),
        '# Untitled\n\n',
      )
      await refreshLibrary(activeLibrary, libraryFolderPath)
      await handleOpenLibraryFile(file)
    } catch (error) {
      setStatus(`Create file failed: ${formatError(error)}`)
    }
  }, [activeLibrary, dialogs, handleOpenLibraryFile, libraryFolderPath, refreshLibrary])

  const handleCreateFolder = useCallback(async () => {
    if (!activeLibrary) {
      return
    }

    const name = (await dialogs.requestText({
      title: 'NAME.md',
      label: 'Folder name',
      defaultValue: '',
      confirmLabel: 'Create',
    }))?.trim()
    if (!name) {
      return
    }

    try {
      await getLibraryProvider(activeLibrary).createFolder(activeLibrary, joinLibraryPath(libraryFolderPath, name))
      await refreshLibrary(activeLibrary, libraryFolderPath)
      setStatus(`Created folder ${name}`)
    } catch (error) {
      setStatus(`Create folder failed: ${formatError(error)}`)
    }
  }, [activeLibrary, dialogs, libraryFolderPath, refreshLibrary])

  const handleRenameLibraryFile = useCallback(async (file: LibraryFile) => {
    const library = libraries.find((item) => item.id === file.libraryId)
    if (!library) {
      return
    }

    const nextName = (await dialogs.requestText({
      title: 'NAME.md',
      label: 'New name',
      defaultValue: file.name,
      confirmLabel: 'Rename',
    }))?.trim()
    if (!nextName || nextName === file.name) {
      return
    }

    try {
      const renamed = await getLibraryProvider(library).rename(file, library, nextName)
      if (currentFile?.id === file.id) {
        setCurrentFile(renamed)
      }
      await refreshLibrary(library, libraryFolderPath)
      setStatus(`Renamed to ${renamed.name}`)
    } catch (error) {
      setStatus(`Rename failed: ${formatError(error)}`)
    }
  }, [currentFile?.id, dialogs, libraries, libraryFolderPath, refreshLibrary])

  const handleMoveLibraryFile = useCallback(async (file: LibraryFile) => {
    if (file.type === 'folder') {
      setStatus('Folder moves are not implemented yet')
      return
    }

    const library = libraries.find((item) => item.id === file.libraryId)
    if (!library) {
      return
    }

    const destinationFolder = await dialogs.requestText({
      title: 'NAME.md',
      label: 'Move to folder',
      message: 'Use a folder path under the active library root. Leave blank for the root folder.',
      defaultValue: parentFolder(file.path),
      confirmLabel: 'Move',
    })
    if (destinationFolder === null) {
      return
    }

    const nextPath = joinLibraryPath(destinationFolder.trim(), file.name)
    if (!nextPath || nextPath === file.path) {
      return
    }

    try {
      const provider = getLibraryProvider(library)
      const moved = provider.move
        ? await provider.move(file, library, nextPath)
        : await provider.rename(file, library, nextPath)

      if (currentFile?.id === file.id) {
        setCurrentFile(moved)
      }
      await refreshLibrary(library, libraryFolderPath)
      setStatus(`Moved to ${moved.path}`)
    } catch (error) {
      setStatus(`Move failed: ${formatError(error)}`)
    }
  }, [currentFile?.id, dialogs, libraries, libraryFolderPath, refreshLibrary])

  const handleDeleteLibraryFile = useCallback(async (file: LibraryFile) => {
    const library = libraries.find((item) => item.id === file.libraryId)
    if (!library) {
      return
    }

    const confirmed = await dialogs.requestConfirmation({
      title: 'NAME.md',
      message: `Delete ${file.name}?`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      danger: true,
    })
    if (!confirmed) {
      return
    }

    try {
      await getLibraryProvider(library).delete(file, library)
      if (currentFile?.id === file.id) {
        setDocument('# Untitled\n\n', null)
      }
      await refreshLibrary(library, libraryFolderPath)
      setStatus(`Deleted ${file.name}`)
    } catch (error) {
      setStatus(`Delete failed: ${formatError(error)}`)
    }
  }, [currentFile?.id, dialogs, libraries, libraryFolderPath, refreshLibrary, setDocument])

  const handleSync = useCallback(async () => {
    const library = currentLibrary ?? activeLibrary
    if (!library) {
      setStatus('No library selected')
      return
    }

    if (dirty && currentFile && currentLibrary) {
      await handleSave()
    }

    setSyncing(true)
    try {
      const results = await getLibraryProvider(library).sync?.(library, currentFile ?? undefined)
      const last = results?.at(-1)
      if (last?.file) {
        setCurrentFile(last.file)
      }
      if (library.provider === 'github') {
        setLibraries((current) =>
          current.map((item) => (item.id === library.id ? { ...item, lastSyncAt: new Date().toISOString() } : item)),
        )
      }
      await refreshLibrary(library, libraryFolderPath)
      setStatus(last?.message ?? 'Sync complete')
    } catch (error) {
      setStatus(`Sync failed: ${formatError(error)}`)
    } finally {
      setSyncing(false)
    }
  }, [activeLibrary, currentFile, currentLibrary, dirty, handleSave, libraryFolderPath, refreshLibrary])

  const handlePushFromLocal = useCallback(async (file: LibraryFile) => {
    const library = activeLibrary
    if (!library || library.provider !== 'github') {
      setStatus('Linking a local file requires a GitHub library')
      return
    }
    if (file.type !== 'file') {
      return
    }

    // Remember the pairing the first time so future pushes skip the picker.
    let link = getFileLink(library.id, file.path)
    if (!link) {
      const selected = await open({ multiple: false, title: `Choose a local file to push into ${file.name}` })
      if (typeof selected !== 'string') {
        return
      }
      link = { repoLibraryId: library.id, repoPath: file.path, localPath: selected, updatedAt: nowIso() }
      setFileLink(link)
      setFileLinksTick((tick) => tick + 1)
    }

    setSyncing(true)
    try {
      const content = await readTextPath(link.localPath)
      const provider = getLibraryProvider(library)
      await provider.writeFile(file, library, content)
      const results = await provider.sync?.(library, file)
      const last = results?.at(-1)
      if (last?.file) {
        const synced = last.file
        setCurrentFile((current) =>
          current && current.libraryId === library.id && current.path === file.path ? synced : current,
        )
      }
      await refreshLibrary(library, libraryFolderPath)
      if (last?.status === 'conflict') {
        setStatus(last.message)
      } else {
        setStatus(`Pushed ${link.localPath} → ${file.path}`)
      }
    } catch (error) {
      setStatus(`Push from local failed: ${formatError(error)}`)
    } finally {
      setSyncing(false)
    }
  }, [activeLibrary, libraryFolderPath, refreshLibrary])

  const handleUnlinkLocal = useCallback((file: LibraryFile) => {
    const library = activeLibrary
    if (!library || library.provider !== 'github') {
      return
    }
    deleteFileLink(library.id, file.path)
    setFileLinksTick((tick) => tick + 1)
    setStatus(`Unlinked local source for ${file.path}`)
  }, [activeLibrary])

  const handleResolveConflict = useCallback(async (resolution: ConflictResolution) => {
    if (!currentFile || !currentLibrary || currentLibrary.provider !== 'github') {
      return
    }

    try {
      const result = await getLibraryProvider(currentLibrary).resolveConflict?.(currentLibrary, currentFile, resolution)
      if (!result?.file) {
        return
      }

      if (resolution === 'keepRemote') {
        const content = await getLibraryProvider(currentLibrary).readFile(result.file, currentLibrary)
        setDocument(content, result.file)
      } else {
        setCurrentFile(result.file)
        setSavedMarkdown(markdown)
      }
      await refreshLibrary(currentLibrary, libraryFolderPath)
      setStatus(result.message)
    } catch (error) {
      setStatus(`Conflict action failed: ${formatError(error)}`)
    }
  }, [currentFile, currentLibrary, libraryFolderPath, markdown, refreshLibrary, setDocument])

  const setStoredGitHubDeviceFlow = useCallback((flow: GitHubDeviceFlowState | null) => {
    setGithubDeviceFlow(flow)
    saveGitHubDeviceFlow(flow)
  }, [])

  const handleOpenGitHubVerification = useCallback(async (flow = githubDeviceFlow) => {
    if (!flow) {
      return
    }

    try {
      await openExternalUrl(flow.verificationUri)
      setStatus(`GitHub sign-in opened in browser. Enter code ${flow.userCode}.`)
    } catch (error) {
      setStatus(`Could not open external browser: ${formatError(error)}`)
    }
  }, [githubDeviceFlow])

  const handleCancelGitHubSignIn = useCallback(() => {
    setStoredGitHubDeviceFlow(null)
    setGithubDevicePolling(false)
    setStatus('GitHub sign-in cancelled')
  }, [setStoredGitHubDeviceFlow])

  const handleStartGitHub = useCallback(async () => {
    try {
      const flow = await startGitHubDeviceFlow(githubClientId.trim())
      setStoredGitHubDeviceFlow(flow)
      setStatus(`GitHub sign-in started. Enter code ${flow.userCode}.`)
      await handleOpenGitHubVerification(flow)
    } catch (error) {
      setStatus(`GitHub sign-in failed: ${formatError(error)}`)
    }
  }, [githubClientId, handleOpenGitHubVerification, setStoredGitHubDeviceFlow])

  const ensureDefaultGitHubLibrary = useCallback(async (auth = githubAuth) => {
    if (!auth) {
      setStatus('Connect GitHub first')
      return null
    }

    if (ensuringDefaultGitHubRef.current) {
      return defaultGitHubLibrary ?? null
    }

    ensuringDefaultGitHubRef.current = true
    configureGitHubProvider(() => auth)
    setStatus(`Preparing ${defaultGitHubRepoName}`)

    try {
      let repo = await getGitHubRepo(auth.login, defaultGitHubRepoName)

      if (!repo) {
        repo = await createGitHubRepo(defaultGitHubRepoName)
      }

      const library = createDefaultGitHubLibrary(repo, auth.login)
      setGithubRepos((current) => [repo, ...current.filter((item) => item.id !== repo.id)])
      setLibraries((current) => [...current.filter((item) => item.id !== library.id), library])
      setActiveLibraryId(library.id)
      setLibraryFolderPath('')

      for (const keepFile of defaultGitHubKeepFiles) {
        await ensureGitHubRepoFile(library, keepFile, '')
      }

      setStatus(`GitHub library ready: ${library.displayName}`)
      return library
    } catch (error) {
      setStatus(`GitHub library setup failed: ${formatError(error)}`)
      return null
    } finally {
      ensuringDefaultGitHubRef.current = false
    }
  }, [defaultGitHubLibrary, githubAuth])

  const handlePollGitHub = useCallback(async () => {
    if (!githubDeviceFlow) {
      return
    }

    if (githubDeviceFlow.expiresAt <= Date.now()) {
      setStoredGitHubDeviceFlow(null)
      setStatus('GitHub sign-in expired')
      return
    }

    if (githubDevicePolling) {
      return
    }

    setGithubDevicePolling(true)
    lastDevicePollAtRef.current = Date.now()
    try {
      const result = await pollGitHubDeviceFlow(githubClientId.trim(), githubDeviceFlow.deviceCode)

      if (result.kind === 'slowDown') {
        // GitHub asked us to back off — add 5s to the interval so the next
        // scheduled poll honors the new rate instead of staying throttled.
        setStoredGitHubDeviceFlow({
          ...githubDeviceFlow,
          intervalSeconds: githubDeviceFlow.intervalSeconds + 5,
        })
        setStatus('Waiting for GitHub authorization')
        return
      }

      if (result.kind === 'pending') {
        setStatus('Waiting for GitHub authorization')
        return
      }

      const { auth } = result
      setGithubAuth(auth)
      setStoredGitHubDeviceFlow(null)
      setStatus(`Connected GitHub as ${auth.login}`)
      await ensureDefaultGitHubLibrary(auth)
    } catch (error) {
      const message = formatError(error)
      if (/device_flow_disabled/i.test(message)) {
        setStoredGitHubDeviceFlow(null)
        setStatus('Enable Device Flow for this OAuth app in GitHub Developer settings, then try again.')
      } else if (/expired|access_denied|incorrect_device_code|unsupported_grant_type|incorrect_client_credentials/i.test(message)) {
        setStoredGitHubDeviceFlow(null)
        setStatus(`GitHub sign-in failed: ${message}`)
      } else {
        setStatus(`GitHub sign-in failed: ${message}`)
      }
    } finally {
      setGithubDevicePolling(false)
    }
  }, [
    ensureDefaultGitHubLibrary,
    githubClientId,
    githubDeviceFlow,
    githubDevicePolling,
    setStoredGitHubDeviceFlow,
  ])

  useEffect(() => {
    if (!githubAuth || defaultGitHubLibrary) {
      return
    }

    const timeout = window.setTimeout(() => {
      void ensureDefaultGitHubLibrary(githubAuth)
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [defaultGitHubLibrary, ensureDefaultGitHubLibrary, githubAuth])

  useEffect(() => {
    if (!githubDeviceFlow) {
      return
    }

    const timeout = window.setTimeout(() => {
      void handlePollGitHub()
    }, Math.max(1, githubDeviceFlow.intervalSeconds) * 1000)

    return () => window.clearTimeout(timeout)
  }, [githubDeviceFlow, handlePollGitHub])

  useEffect(() => {
    if (!githubDeviceFlow) {
      return
    }

    // Re-poll when the window regains focus (e.g. returning from the browser
    // after entering the code), but never faster than the device-flow interval
    // or GitHub will throttle us with slow_down and the token never arrives.
    const pollIfDue = () => {
      if (document.visibilityState !== 'visible') {
        return
      }
      const minGap = Math.max(1, githubDeviceFlow.intervalSeconds) * 1000
      if (Date.now() - lastDevicePollAtRef.current < minGap) {
        return
      }
      void handlePollGitHub()
    }

    const resumePolling = pollIfDue
    const handleVisibilityChange = pollIfDue

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', resumePolling)
    window.addEventListener('pageshow', resumePolling)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', resumePolling)
      window.removeEventListener('pageshow', resumePolling)
    }
  }, [githubDeviceFlow, handlePollGitHub])

  const handleCreateGitHubDocument = useCallback(async () => {
    const library = defaultGitHubLibrary ?? await ensureDefaultGitHubLibrary()
    if (!library) {
      return
    }

    const rawName = (await dialogs.requestText({
      title: 'NAME.md',
      label: 'File name',
      defaultValue: 'Untitled.md',
      confirmLabel: 'Next',
    }))?.trim()
    if (!rawName) {
      return
    }

    const fileName = rawName.toLowerCase().endsWith('.md') ? rawName : `${rawName}.md`
    const destinationFolder = await dialogs.selectDestinationFolder({
      title: 'NAME.md',
      heading: 'New GitHub Document',
      message: 'Select destination folder under /docs',
      docsRoot: defaultGitHubDocsRoot,
      fileName,
      folders: knownLibraryFolders(libraryFolderPath, libraryFiles),
      defaultValue: libraryFolderPath,
      confirmLabel: 'Create',
      cancelLabel: 'Cancel',
    })
    if (destinationFolder === null) {
      return
    }

    const destinationPath = joinLibraryPath(destinationFolder, fileName)

    try {
      const file = await createGitHubLibraryFile(library, destinationPath, '# Untitled\n\n')
      setActiveLibraryId(library.id)
      setLibraryFolderPath(parentFolder(destinationPath))
      await refreshLibrary(library, parentFolder(destinationPath))
      await handleOpenLibraryFile(file)
      setStatus(`Created ${file.name} in GitHub library`)
    } catch (error) {
      setStatus(`Create GitHub document failed: ${formatError(error)}`)
    }
  }, [
    defaultGitHubLibrary,
    dialogs,
    ensureDefaultGitHubLibrary,
    handleOpenLibraryFile,
    libraryFiles,
    libraryFolderPath,
    refreshLibrary,
  ])

  const handleNewDocument = useCallback(async () => {
    if (!mobile) {
      handleNew()
      return
    }

    const choice = await dialogs.choose({
      title: 'NAME.md',
      heading: 'New document',
      message: 'Choose where to create it.',
      cancelLabel: 'Cancel',
      choices: [
        {
          label: 'New Local Draft',
          value: 'local',
          description: 'Create an untitled local-only document. You can add it to GitHub later.',
        },
        {
          label: 'New GitHub Document',
          value: 'github',
          description: 'Create a Markdown file in your GitHub library.',
        },
      ],
    })

    if (choice === 'local') {
      handleNew()
      return
    }

    if (choice === 'github') {
      await handleCreateGitHubDocument()
    }
  }, [dialogs, handleCreateGitHubDocument, handleNew, mobile])

  const handleImportCurrentFileToGitHub = useCallback(async () => {
    if (currentFile && currentFile.libraryId !== directLocalLibrary.id) {
      setStatus('This document is already in a library')
      return
    }

    const library = defaultGitHubLibrary ?? await ensureDefaultGitHubLibrary()
    if (!library) {
      return
    }

    const sourceName = currentFile?.name ?? defaultFileName
    const fileName = sourceName.toLowerCase().endsWith('.md') ? sourceName : `${sourceName}.md`
    const destinationFolder = await dialogs.selectDestinationFolder({
      title: 'NAME.md',
      heading: 'Add to GitHub Library',
      message: 'Select destination folder under /docs',
      docsRoot: defaultGitHubDocsRoot,
      fileName,
      folders: knownLibraryFolders(libraryFolderPath, libraryFiles),
      defaultValue: libraryFolderPath,
      confirmLabel: 'Add to Library',
      cancelLabel: 'Cancel',
    })
    if (destinationFolder === null) {
      return
    }

    const destinationPath = joinLibraryPath(destinationFolder, fileName)

    try {
      const output = normalizeMarkdown(markdown)
      const importedFile = await createGitHubLibraryFile(library, destinationPath, output)
      setDocument(output, importedFile)
      setSavedMarkdown(output)
      setActiveLibraryId(library.id)
      setLibraryFolderPath(parentFolder(destinationPath))
      await refreshLibrary(library, parentFolder(destinationPath))
      setStatus(`Imported ${importedFile.path} to GitHub library`)
    } catch (error) {
      setStatus(`Import failed: ${formatError(error)}`)
    }
  }, [
    currentFile,
    defaultGitHubLibrary,
    dialogs,
    ensureDefaultGitHubLibrary,
    libraryFiles,
    libraryFolderPath,
    markdown,
    refreshLibrary,
    setDocument,
  ])

  const handleDisconnectGitHub = useCallback(() => {
    setGithubAuth(null)
    setStoredGitHubDeviceFlow(null)
    setGithubDevicePolling(false)
    setGithubRepos([])
    setStatus('Disconnected GitHub')
  }, [setStoredGitHubDeviceFlow])

  const handleCreateGitHubRepo = useCallback(async (name: string) => {
    try {
      const repo = await createGitHubRepo(name)
      setGithubRepos((current) => [repo, ...current.filter((item) => item.id !== repo.id)])
      setStatus(`Created private repo ${repo.fullName}`)
      return repo
    } catch (error) {
      setStatus(`Create repo failed: ${formatError(error)}`)
      return null
    }
  }, [])

  const handleCreateGitHubLibrary = useCallback((repo: GitHubRepo, branch: string, rootPath: string, assetsPath: string) => {
    const library = createGitHubLibrary(repo, branch, rootPath, assetsPath, githubAuth?.login)
    setLibraries((current) => [...current.filter((item) => item.id !== library.id), library])
    setActiveLibraryId(library.id)
    setLibraryFolderPath('')
    setStatus(`Opened GitHub library ${library.displayName}`)
  }, [githubAuth?.login])

  const insertLink = useCallback(async () => {
    if (!editor) {
      return
    }

    const href = (await dialogs.requestText({
      title: 'NAME.md',
      label: 'Link URL',
      confirmLabel: 'Insert',
    }))?.trim()
    if (!href) {
      return
    }

    if (editor.state.selection.empty) {
      const text = await dialogs.requestText({
        title: 'NAME.md',
        label: 'Link text',
        defaultValue: href,
        confirmLabel: 'Next',
      })
      if (!text?.trim()) {
        return
      }

      const title = (await dialogs.requestText({
        title: 'NAME.md',
        label: 'Link title (optional)',
        defaultValue: '',
        confirmLabel: 'Insert',
      }))?.trim()

      editor.chain().focus().insertContent({
        type: 'text',
        text: text.trim(),
        marks: [{ type: 'link', attrs: { href, title: title || null } }],
      }).run()
      return
    }

    const title = (await dialogs.requestText({
      title: 'NAME.md',
      label: 'Link title (optional)',
      defaultValue: editor.getAttributes('link').title ?? '',
      confirmLabel: 'Apply',
    }))?.trim()

    editor.chain().focus().extendMarkRange('link').setLink({ href, title: title || null }).run()
  }, [dialogs, editor])

  const insertImage = useCallback(async () => {
    if (tableActive) {
      setStatus('Images are disabled inside Markdown tables')
      return
    }

    const defaultPath = relativeAssetImagePath(currentFile, currentLibrary)
    const src = (await dialogs.requestText({
      title: 'NAME.md',
      label: 'Image URL or relative path',
      defaultValue: defaultPath,
      confirmLabel: 'Next',
    }))?.trim()
    if (src) {
      const alt = await dialogs.requestText({
        title: 'NAME.md',
        label: 'Alt text',
        defaultValue: '',
        confirmLabel: 'Next',
      }) ?? ''
      const title = await dialogs.requestText({
        title: 'NAME.md',
        label: 'Image title (optional)',
        defaultValue: '',
        confirmLabel: 'Insert',
      }) ?? ''
      editor?.chain().focus().setImage({ src, alt, title: title.trim() || undefined }).run()
    }
  }, [currentFile, currentLibrary, dialogs, editor, tableActive])

  const setParagraph = useCallback(() => {
    editor?.chain().focus().setParagraph().run()
    setOpenToolbarMenu(null)
  }, [editor])

  const toggleHeading = useCallback((level: 1 | 2 | 3 | 4 | 5 | 6) => {
    editor?.chain().focus().toggleHeading({ level }).run()
    setOpenToolbarMenu(null)
  }, [editor])

  const setHeadingId = useCallback(async () => {
    if (!editor) {
      return
    }

    if (!editor.isActive('heading')) {
      setStatus('Place the cursor in a heading before setting an ID')
      return
    }

    const current = editor.getAttributes('heading').id ?? ''
    const value = await dialogs.requestText({
      title: 'NAME.md',
      label: 'Heading ID',
      defaultValue: current,
      confirmLabel: 'Apply',
    })

    if (value === null) {
      return
    }

    const id = normalizeHeadingId(value)

    if (value.trim() && !id) {
      setStatus('Heading IDs must start with a letter and use letters, numbers, -, _, :, or .')
      return
    }

    editor.chain().focus().updateAttributes('heading', { id }).run()
    setStatus(id ? `Heading ID set to ${id}` : 'Heading ID removed')
  }, [dialogs, editor])

  const insertFootnote = useCallback(async () => {
    if (!editor) {
      return
    }

    const label = sanitizeFootnoteLabel(await dialogs.requestText({
      title: 'NAME.md',
      label: 'Footnote label',
      defaultValue: '1',
      confirmLabel: 'Next',
    }))

    if (!label) {
      return
    }

    const note = await dialogs.requestText({
      title: 'NAME.md',
      label: 'Footnote text',
      defaultValue: '',
      confirmLabel: 'Insert',
    })

    editor.chain().focus().insertContent({
      type: 'footnoteReference',
      attrs: { label },
    }).run()

    if (note !== null) {
      editor.chain().focus('end').insertContent(`\n\n[^${label}]: ${note}`, { contentType: 'markdown' }).run()
    }
  }, [dialogs, editor])

  const insertDefinitionList = useCallback(async () => {
    if (!editor || tableActive) {
      return
    }

    const term = await dialogs.requestText({
      title: 'NAME.md',
      label: 'Term',
      confirmLabel: 'Next',
    })
    if (!term?.trim()) {
      return
    }

    const definition = await dialogs.requestText({
      title: 'NAME.md',
      label: 'Definition',
      confirmLabel: 'Insert',
    })
    if (!definition?.trim()) {
      return
    }

    editor.chain().focus().insertContent(`${term.trim()}\n: ${definition.trim()}`, { contentType: 'markdown' }).run()
  }, [dialogs, editor, tableActive])

  const insertCollapsible = useCallback(() => {
    if (!editor || tableActive) {
      return
    }

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'details',
        attrs: { open: true },
        content: [
          { type: 'detailsSummary', content: [{ type: 'text', text: 'Summary' }] },
          { type: 'detailsContent', content: [{ type: 'paragraph' }] },
        ],
      })
      .run()
  }, [editor, tableActive])

  const insertCallout = useCallback(() => {
    if (!editor || tableActive) {
      return
    }

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'callout',
        attrs: { calloutType: 'note' },
        content: [{ type: 'paragraph' }],
      })
      .run()
  }, [editor, tableActive])

  const insertMermaid = useCallback(() => {
    if (!editor || tableActive) {
      return
    }

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'mermaidDiagram',
        attrs: { code: 'flowchart TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Do thing]\n  B -->|No| D[Skip]' },
      })
      .run()
  }, [editor, tableActive])

  const insertJsonFlow = useCallback(() => {
    if (!editor || tableActive) {
      return
    }

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'jsonFlow',
        attrs: {
          code: JSON.stringify({ name: 'example', items: [1, 2, 3], nested: { ok: true } }, null, 2),
        },
      })
      .run()
  }, [editor, tableActive])

  const insertSketch = useCallback(() => {
    if (!editor || tableActive) {
      return
    }

    editor.chain().focus().insertContent({ type: 'sketchDrawing', attrs: { code: '' } }).run()
  }, [editor, tableActive])

  const runToolbarAction = useCallback((action: () => unknown) => {
    void action()
    setOpenToolbarMenu(null)
  }, [])

  const updateZoom = useCallback((nextZoom: number) => {
    setZoom(clampZoom(nextZoom))
  }, [])

  const zoomIn = useCallback(() => updateZoom(zoom + zoomStep), [updateZoom, zoom])
  const zoomOut = useCallback(() => updateZoom(zoom - zoomStep), [updateZoom, zoom])
  const resetZoom = useCallback(() => updateZoom(100), [updateZoom])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 's') {
        event.preventDefault()
        if (event.shiftKey) {
          void handleSaveAs()
        } else {
          void handleSave()
        }
        return
      }

      if (key === 'o' && !event.shiftKey) {
        event.preventDefault()
        void handleOpen()
        return
      }

      if (key === 'n' && !event.shiftKey) {
        event.preventDefault()
        void handleNewDocument()
        return
      }

      if (key === 'k' && !event.shiftKey) {
        event.preventDefault()
        void insertLink()
        return
      }

      if (event.key === '=' || event.key === '+') {
        event.preventDefault()
        zoomIn()
        return
      }

      if (event.key === '-') {
        event.preventDefault()
        zoomOut()
        return
      }

      if (event.key === '0') {
        event.preventDefault()
        resetZoom()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [handleNewDocument, handleOpen, handleSave, handleSaveAs, insertLink, resetZoom, zoomIn, zoomOut])

  const editorClass = useMemo(() => `editor-frame width-${widthMode}`, [widthMode])
  const editorStyle = useMemo(
    () =>
      ({
        '--editor-zoom': String(zoom / 100),
        '--editor-font-size': `${15 * (zoom / 100)}px`,
        '--editor-padding': `${28 * (zoom / 100)}px`,
        '--editor-mobile-padding': `${18 * (zoom / 100)}px`,
        '--editor-table-cell-min': `${120 * (zoom / 100)}px`,
      }) as CSSProperties,
    [zoom],
  )
  const nextTheme = getNextTheme(theme)
  const currentProvider = providerDisplayName(currentLibrary)
  const currentSaveSyncState = getSaveSyncState({ dirty, file: currentFile, syncing })
  const showMobileLibrary = mobile && mobileLibraryOpen
  const dialogHost = <AppDialogHost dialog={dialog} onResolve={resolveDialog} />
  const githubSignInModal = githubDeviceFlow ? (
    <GitHubDeviceSignInModal
      flow={githubDeviceFlow}
      polling={githubDevicePolling}
      onCancel={handleCancelGitHubSignIn}
      onOpenBrowser={() => void handleOpenGitHubVerification()}
      onPollNow={() => void handlePollGitHub()}
    />
  ) : null

  const explorer = (
    <LibraryExplorer
      activeLibrary={activeLibrary}
      clientId={githubClientId}
      defaultRepoName={defaultGitHubRepoName}
      files={libraryFiles}
      folderPath={libraryFolderPath}
      githubConnected={Boolean(githubAuth)}
      githubLogin={githubAuth?.login}
      libraries={libraries}
      loading={libraryLoading}
      mode={showMobileLibrary ? 'screen' : 'drawer'}
      repos={githubRepos}
      syncing={syncing}
      onAddLocalLibrary={handleAddLocalLibrary}
      onBackFolder={() => setLibraryFolderPath(parentFolder(libraryFolderPath))}
      onChangeClientId={setGithubClientId}
      onClose={showMobileLibrary ? (hasOpenDocument ? () => setMobileLibraryOpen(false) : undefined) : () => setLibraryDrawerOpen(false)}
      onConnectGitHub={handleStartGitHub}
      onCreateFile={handleCreateFile}
      onCreateFolder={handleCreateFolder}
      onCreateGitHubLibrary={handleCreateGitHubLibrary}
      onCreateGitHubRepo={handleCreateGitHubRepo}
      onDelete={handleDeleteLibraryFile}
      onDisconnectGitHub={handleDisconnectGitHub}
      onEnsureDefaultGitHubLibrary={() => void ensureDefaultGitHubLibrary()}
      onMove={handleMoveLibraryFile}
      onNewLocalDraft={handleNew}
      onOpenLocalFile={handleOpen}
      onOpenFile={handleOpenLibraryFile}
      onOpenFolder={(file) => setLibraryFolderPath(file.path)}
      onRefresh={() => void refreshLibrary()}
      onPushFromLocal={handlePushFromLocal}
      onRename={handleRenameLibraryFile}
      onSelectLibrary={handleSelectLibrary}
      onSync={handleSync}
      onUnlinkLocal={handleUnlinkLocal}
      linkedLocalPaths={linkedLocalPaths}
    />
  )

  if (showMobileLibrary) {
    return (
      <main className="app-shell mobile-library-shell">
        {explorer}
        {githubSignInModal}
        {dialogHost}
      </main>
    )
  }

  return (
    <main className="app-shell">
      {libraryDrawerOpen && (
        <div className="library-drawer-layer" onMouseDown={() => setLibraryDrawerOpen(false)}>
          <div onMouseDown={(event) => event.stopPropagation()}>{explorer}</div>
        </div>
      )}

      <header className="topbar">
        <div className="file-group">
          {mobile && (
            <button type="button" className="mobile-library-button" onClick={() => setMobileLibraryOpen(true)}>
              <LibraryIcon aria-hidden="true" size={16} />
              <span>Library</span>
            </button>
          )}
          {!mobile && (
            <>
              <IconButton icon={LibraryIcon} label="Library" onClick={() => setLibraryDrawerOpen(true)} />
              <IconButton icon={FilePlus} label="New file (Ctrl+N)" onClick={() => void handleNewDocument()} />
              <IconButton icon={FolderOpen} label="Open Markdown file (Ctrl+O)" onClick={handleOpen} />
              <IconButton icon={Save} label="Save locally (Ctrl+S)" onClick={handleSave} />
              <IconButton icon={SaveAll} label="Save as (Ctrl+Shift+S)" onClick={handleSaveAs} />
              {githubAuth && (!currentFile || currentFile.libraryId === directLocalLibrary.id) && (
                <IconButton icon={LibraryIcon} label="Add Current File to GitHub Library" onClick={handleImportCurrentFileToGitHub} />
              )}
              <IconButton icon={RotateCw} label="Sync" disabled={syncing} onClick={handleSync} />
            </>
          )}
        </div>

        <div className="document-title">
          <strong>{fileDisplayName(currentFile)}</strong>
          <SaveSyncIndicator state={currentSaveSyncState} provider={currentLibrary?.provider ?? 'local'} compact={mobile} />
        </div>

        <div className="settings-group">
          {!mobile && (
            <>
              <fieldset className="segmented-control" aria-label="Editor width">
                <legend>Width</legend>
                {Object.entries(widthModeLabels).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={widthMode === value ? 'active' : ''}
                    aria-pressed={widthMode === value}
                    onClick={() => setWidthMode(value as WidthMode)}
                  >
                    {label}
                  </button>
                ))}
              </fieldset>
              <div className="zoom-control" aria-label="Zoom controls">
                <IconButton icon={ZoomOut} label="Zoom out" onClick={zoomOut} disabled={zoom <= minimumZoom} />
                <button
                  type="button"
                  className="zoom-value"
                  aria-label="Reset zoom to 100%"
                  data-tooltip="Reset zoom to 100%"
                  title="Reset zoom to 100%"
                  onClick={resetZoom}
                >
                  {zoom}%
                </button>
                <IconButton icon={ZoomIn} label="Zoom in" onClick={zoomIn} disabled={zoom >= maximumZoom} />
              </div>
              <button
                type="button"
                className="icon-button theme-toggle"
                aria-label={`Switch to ${nextTheme} mode`}
                data-tooltip={`Switch to ${nextTheme} mode`}
                title={`Switch to ${nextTheme} mode`}
                onClick={() => setTheme(nextTheme)}
              >
                <ThemeIcon theme={nextTheme} />
              </button>
            </>
          )}
          {mobile && (
            <>
              <IconButton
                icon={TypeIcon}
                label={mobileFormatbarOpen ? 'Hide formatting toolbar' : 'Show formatting toolbar'}
                active={mobileFormatbarOpen}
                onClick={() => setMobileFormatbarOpen((open) => !open)}
              />
              <ToolbarDropdown
                id="more"
                icon={EllipsisVertical}
                label="More"
                openMenu={openToolbarMenu}
                setOpenMenu={setOpenToolbarMenu}
                menuClassName="toolbar-menu-wide mobile-more-menu"
              >
                <ToolbarMenuItem icon={FileText} label="New Local Draft" onClick={() => runToolbarAction(handleNew)} />
                <ToolbarMenuItem icon={FilePlus} label="New GitHub Document" onClick={() => runToolbarAction(() => void handleCreateGitHubDocument())} />
                <ToolbarMenuItem icon={FolderOpen} label="Open file" onClick={() => runToolbarAction(() => void handleOpen())} />
                <ToolbarMenuItem icon={Save} label="Save" onClick={() => runToolbarAction(() => void handleSave())} />
                <ToolbarMenuItem icon={SaveAll} label="Save as" onClick={() => runToolbarAction(() => void handleSaveAs())} />
                {githubAuth && (!currentFile || currentFile.libraryId === directLocalLibrary.id) && (
                  <ToolbarMenuItem icon={LibraryIcon} label="Add Current File to GitHub Library" onClick={() => runToolbarAction(() => void handleImportCurrentFileToGitHub())} />
                )}
                <ToolbarMenuItem icon={RotateCw} label="Sync" disabled={syncing} onClick={() => runToolbarAction(() => void handleSync())} />
                <ToolbarMenuItem icon={RefreshCw} label="Refresh library" onClick={() => runToolbarAction(() => void refreshLibrary())} />
                <ToolbarMenuItem icon={ZoomOut} label="Zoom out" disabled={zoom <= minimumZoom} onClick={() => runToolbarAction(zoomOut)} />
                <ToolbarMenuItem label="Reset zoom" prefix={`${zoom}%`} onClick={() => runToolbarAction(resetZoom)} />
                <ToolbarMenuItem icon={ZoomIn} label="Zoom in" disabled={zoom >= maximumZoom} onClick={() => runToolbarAction(zoomIn)} />
                {Object.entries(widthModeLabels).map(([value, label]) => (
                  <ToolbarMenuItem
                    key={value}
                    label={label}
                    active={widthMode === value}
                    onClick={() => runToolbarAction(() => setWidthMode(value as WidthMode))}
                  />
                ))}
                <ToolbarMenuItem icon={Cloud} label={`Switch to ${nextTheme} mode`} onClick={() => runToolbarAction(() => setTheme(nextTheme))} />
                <ToolbarMenuItem icon={Settings} label="Library settings" onClick={() => runToolbarAction(() => setMobileLibraryOpen(true))} />
              </ToolbarDropdown>
            </>
          )}
        </div>
      </header>

      {!mobile && (
        <nav className="formatbar desktop-formatbar" aria-label="Formatting controls">
          <IconButton icon={Undo2} label="Undo" onClick={() => editor?.chain().focus().undo().run()} />
          <IconButton icon={Redo2} label="Redo" onClick={() => editor?.chain().focus().redo().run()} />
          <span className="toolbar-separator" aria-hidden="true" />
          <ToolbarDropdown
            id="heading"
            icon={Heading}
            label="Heading styles"
            active={editor?.isActive('heading')}
            disabled={tableActive}
            openMenu={openToolbarMenu}
            setOpenMenu={setOpenToolbarMenu}
          >
            <ToolbarMenuItem icon={Pilcrow} label="Paragraph" active={editor?.isActive('paragraph')} onClick={setParagraph} />
            {[1, 2, 3, 4, 5, 6].map((level) => (
              <ToolbarMenuItem
                key={level}
                prefix={`H${level}`}
                label={`Heading ${level}`}
                active={activeHeadingLevel === level}
                onClick={() => toggleHeading(level as 1 | 2 | 3 | 4 | 5 | 6)}
              />
            ))}
            <ToolbarMenuItem
              icon={Hash}
              label="Set heading ID"
              disabled={!editor?.isActive('heading')}
              onClick={() => runToolbarAction(setHeadingId)}
            />
          </ToolbarDropdown>
          <IconButton icon={Bold} label="Bold" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} />
          <IconButton icon={Italic} label="Italic" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} />
          <IconButton icon={Strikethrough} label="Strikethrough" active={editor?.isActive('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()} />
          <IconButton icon={Underline} label="Underline" active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleMark('underline').run()} />
          <IconButton icon={Highlighter} label="Highlight" active={editor?.isActive('highlight')} onClick={() => editor?.chain().focus().toggleMark('highlight').run()} />
          <IconButton icon={Subscript} label="Subscript" active={editor?.isActive('subscript')} onClick={() => editor?.chain().focus().toggleMark('subscript').run()} />
          <IconButton icon={Superscript} label="Superscript" active={editor?.isActive('superscript')} onClick={() => editor?.chain().focus().toggleMark('superscript').run()} />
          <IconButton icon={Keyboard} label="Keyboard key" active={editor?.isActive('keyboardKey')} onClick={() => editor?.chain().focus().toggleMark('keyboardKey').run()} />
          <span className="toolbar-separator" aria-hidden="true" />
          <IconButton icon={Code} label="Inline code" active={editor?.isActive('code')} onClick={() => editor?.chain().focus().toggleCode().run()} />
          <IconButton icon={Code2} label="Code block" disabled={tableActive} active={editor?.isActive('codeBlock')} onClick={() => editor?.chain().focus().toggleCodeBlock().run()} />
          <IconButton icon={Quote} label="Blockquote" disabled={tableActive} active={editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()} />
          <span className="toolbar-separator" aria-hidden="true" />
          <IconButton icon={List} label="Bullet list" disabled={tableActive} active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
          <IconButton icon={ListOrdered} label="Numbered list" disabled={tableActive} active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
          <IconButton icon={ListChecks} label="Task list" disabled={tableActive} active={editor?.isActive('taskList')} onClick={() => editor?.chain().focus().toggleTaskList().run()} />
          <span className="toolbar-separator" aria-hidden="true" />
          <IconButton icon={Link2} label="Insert link" onClick={insertLink} />
          <IconButton icon={Image} label="Insert image" disabled={tableActive} onClick={insertImage} />
          <IconButton icon={Minus} label="Horizontal rule" disabled={tableActive} onClick={() => editor?.chain().focus().setHorizontalRule().run()} />
          <IconButton icon={Table2} label="Insert table" disabled={tableActive} onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
          <IconButton icon={Trash2} label="Delete table" disabled={!tableActive} onClick={() => editor?.chain().focus().deleteTable().run()} />
          <ToolbarDropdown
            id="misc"
            icon={NotebookTabs}
            label="Extras"
            openMenu={openToolbarMenu}
            setOpenMenu={setOpenToolbarMenu}
            menuClassName="toolbar-menu-wide"
          >
            <ToolbarMenuItem icon={NotebookTabs} label="Insert footnote" onClick={() => runToolbarAction(insertFootnote)} />
            <ToolbarMenuItem icon={ListTree} label="Insert definition list" disabled={tableActive} onClick={() => runToolbarAction(insertDefinitionList)} />
            <ToolbarMenuItem icon={ChevronsDownUp} label="Insert collapsible section" disabled={tableActive} onClick={() => runToolbarAction(insertCollapsible)} />
            <ToolbarMenuItem icon={Info} label="Insert callout" disabled={tableActive} onClick={() => runToolbarAction(insertCallout)} />
            <ToolbarMenuItem icon={Network} label="Insert Mermaid diagram" disabled={tableActive} onClick={() => runToolbarAction(insertMermaid)} />
            <ToolbarMenuItem icon={Share2} label="Insert JSON flow graph" disabled={tableActive} onClick={() => runToolbarAction(insertJsonFlow)} />
            <ToolbarMenuItem icon={PenTool} label="Insert drawing / diagram" disabled={tableActive} onClick={() => runToolbarAction(insertSketch)} />
          </ToolbarDropdown>
        </nav>
      )}

      {mobile && mobileFormatbarOpen && (
        <nav className="formatbar compact-formatbar" aria-label="Formatting controls">
          <IconButton icon={Undo2} label="Undo" onClick={() => editor?.chain().focus().undo().run()} />
          <IconButton icon={Redo2} label="Redo" onClick={() => editor?.chain().focus().redo().run()} />
          <span className="toolbar-separator" aria-hidden="true" />
          <ToolbarDropdown
            id="heading"
            icon={Heading}
            label="Heading styles"
            active={editor?.isActive('heading')}
            disabled={tableActive}
            openMenu={openToolbarMenu}
            setOpenMenu={setOpenToolbarMenu}
          >
            <ToolbarMenuItem icon={Pilcrow} label="Paragraph" active={editor?.isActive('paragraph')} onClick={setParagraph} />
            {[1, 2, 3, 4, 5, 6].map((level) => (
              <ToolbarMenuItem
                key={level}
                prefix={`H${level}`}
                label={`Heading ${level}`}
                active={activeHeadingLevel === level}
                onClick={() => toggleHeading(level as 1 | 2 | 3 | 4 | 5 | 6)}
              />
            ))}
            <ToolbarMenuItem
              icon={Hash}
              label="Set heading ID"
              disabled={!editor?.isActive('heading')}
              onClick={() => runToolbarAction(setHeadingId)}
            />
          </ToolbarDropdown>
          <ToolbarDropdown
            id="format"
            icon={Bold}
            label="Text format"
            active={
              editor?.isActive('bold') ||
              editor?.isActive('italic') ||
              editor?.isActive('strike') ||
              editor?.isActive('highlight') ||
              editor?.isActive('subscript') ||
              editor?.isActive('superscript')
            }
            openMenu={openToolbarMenu}
            setOpenMenu={setOpenToolbarMenu}
          >
            <ToolbarMenuItem icon={Bold} label="Bold" active={editor?.isActive('bold')} onClick={() => runToolbarAction(() => editor?.chain().focus().toggleBold().run())} />
            <ToolbarMenuItem icon={Italic} label="Italic" active={editor?.isActive('italic')} onClick={() => runToolbarAction(() => editor?.chain().focus().toggleItalic().run())} />
            <ToolbarMenuItem icon={Strikethrough} label="Strikethrough" active={editor?.isActive('strike')} onClick={() => runToolbarAction(() => editor?.chain().focus().toggleStrike().run())} />
            <ToolbarMenuItem icon={Underline} label="Underline" active={editor?.isActive('underline')} onClick={() => runToolbarAction(() => editor?.chain().focus().toggleMark('underline').run())} />
            <ToolbarMenuItem icon={Highlighter} label="Highlight" active={editor?.isActive('highlight')} onClick={() => runToolbarAction(() => editor?.chain().focus().toggleMark('highlight').run())} />
            <ToolbarMenuItem icon={Subscript} label="Subscript" active={editor?.isActive('subscript')} onClick={() => runToolbarAction(() => editor?.chain().focus().toggleMark('subscript').run())} />
            <ToolbarMenuItem icon={Superscript} label="Superscript" active={editor?.isActive('superscript')} onClick={() => runToolbarAction(() => editor?.chain().focus().toggleMark('superscript').run())} />
            <ToolbarMenuItem icon={Keyboard} label="Keyboard key" active={editor?.isActive('keyboardKey')} onClick={() => runToolbarAction(() => editor?.chain().focus().toggleMark('keyboardKey').run())} />
          </ToolbarDropdown>
          <ToolbarDropdown
            id="block"
            icon={Code2}
            label="Code and blocks"
            active={editor?.isActive('code') || editor?.isActive('codeBlock') || editor?.isActive('blockquote')}
            openMenu={openToolbarMenu}
            setOpenMenu={setOpenToolbarMenu}
          >
            <ToolbarMenuItem icon={Code} label="Inline code" active={editor?.isActive('code')} onClick={() => runToolbarAction(() => editor?.chain().focus().toggleCode().run())} />
            <ToolbarMenuItem icon={Code2} label="Code block" disabled={tableActive} active={editor?.isActive('codeBlock')} onClick={() => runToolbarAction(() => editor?.chain().focus().toggleCodeBlock().run())} />
            <ToolbarMenuItem icon={Quote} label="Blockquote" disabled={tableActive} active={editor?.isActive('blockquote')} onClick={() => runToolbarAction(() => editor?.chain().focus().toggleBlockquote().run())} />
          </ToolbarDropdown>
          <ToolbarDropdown
            id="list"
            icon={List}
            label="Lists"
            disabled={tableActive}
            active={editor?.isActive('bulletList') || editor?.isActive('orderedList') || editor?.isActive('taskList')}
            openMenu={openToolbarMenu}
            setOpenMenu={setOpenToolbarMenu}
          >
            <ToolbarMenuItem icon={List} label="Bullet list" active={editor?.isActive('bulletList')} onClick={() => runToolbarAction(() => editor?.chain().focus().toggleBulletList().run())} />
            <ToolbarMenuItem icon={ListOrdered} label="Numbered list" active={editor?.isActive('orderedList')} onClick={() => runToolbarAction(() => editor?.chain().focus().toggleOrderedList().run())} />
            <ToolbarMenuItem icon={ListChecks} label="Task list" active={editor?.isActive('taskList')} onClick={() => runToolbarAction(() => editor?.chain().focus().toggleTaskList().run())} />
          </ToolbarDropdown>
          <ToolbarDropdown id="table" icon={Table2} label="Table" active={tableActive} openMenu={openToolbarMenu} setOpenMenu={setOpenToolbarMenu}>
            <ToolbarMenuItem icon={Table2} label="Insert table" disabled={tableActive} onClick={() => runToolbarAction(() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())} />
            <ToolbarMenuItem icon={Trash2} label="Delete table" disabled={!tableActive} onClick={() => runToolbarAction(() => editor?.chain().focus().deleteTable().run())} />
          </ToolbarDropdown>
          <ToolbarDropdown id="misc" icon={NotebookTabs} label="Insert and extras" openMenu={openToolbarMenu} setOpenMenu={setOpenToolbarMenu} menuClassName="toolbar-menu-wide">
            <ToolbarMenuItem icon={Minus} label="Horizontal rule" disabled={tableActive} onClick={() => runToolbarAction(() => editor?.chain().focus().setHorizontalRule().run())} />
            <ToolbarMenuItem icon={NotebookTabs} label="Insert footnote" onClick={() => runToolbarAction(insertFootnote)} />
            <ToolbarMenuItem icon={ListTree} label="Insert definition list" disabled={tableActive} onClick={() => runToolbarAction(insertDefinitionList)} />
            <ToolbarMenuItem icon={ChevronsDownUp} label="Insert collapsible section" disabled={tableActive} onClick={() => runToolbarAction(insertCollapsible)} />
            <ToolbarMenuItem icon={Info} label="Insert callout" disabled={tableActive} onClick={() => runToolbarAction(insertCallout)} />
            <ToolbarMenuItem icon={Network} label="Insert Mermaid diagram" disabled={tableActive} onClick={() => runToolbarAction(insertMermaid)} />
            <ToolbarMenuItem icon={Share2} label="Insert JSON flow graph" disabled={tableActive} onClick={() => runToolbarAction(insertJsonFlow)} />
            <ToolbarMenuItem icon={PenTool} label="Insert drawing / diagram" disabled={tableActive} onClick={() => runToolbarAction(insertSketch)} />
            <ToolbarMenuItem icon={Link2} label="Insert link" onClick={() => runToolbarAction(insertLink)} />
            <ToolbarMenuItem icon={Image} label="Insert image" disabled={tableActive} onClick={() => runToolbarAction(insertImage)} />
          </ToolbarDropdown>
        </nav>
      )}

      {tableActive && (
        <nav className="tablebar" aria-label="Table controls">
          <span>Table</span>
          <IconButton icon={Rows3} label="Add row before" onClick={() => editor?.chain().focus().addRowBefore().run()} />
          <IconButton icon={Rows3} label="Add row after" onClick={() => editor?.chain().focus().addRowAfter().run()} />
          <IconButton icon={Trash2} label="Delete row" onClick={() => editor?.chain().focus().deleteRow().run()} />
          <span className="toolbar-separator" aria-hidden="true" />
          <IconButton icon={Columns3} label="Add column before" onClick={() => editor?.chain().focus().addColumnBefore().run()} />
          <IconButton icon={Columns3} label="Add column after" onClick={() => editor?.chain().focus().addColumnAfter().run()} />
          <IconButton icon={Trash2} label="Delete column" onClick={() => editor?.chain().focus().deleteColumn().run()} />
          <span className="toolbar-separator" aria-hidden="true" />
          <IconButton icon={AlignLeft} label="Align left" onClick={() => editor?.chain().focus().setCellAttribute('align', 'left').run()} />
          <IconButton icon={AlignCenter} label="Align center" onClick={() => editor?.chain().focus().setCellAttribute('align', 'center').run()} />
          <IconButton icon={AlignRight} label="Align right" onClick={() => editor?.chain().focus().setCellAttribute('align', 'right').run()} />
        </nav>
      )}

      {currentFile?.status === 'conflict' && (
        <section className="conflict-panel">
          <strong>Remote conflict</strong>
          <span>{currentFile.name} changed on GitHub after your local copy was opened.</span>
          <button type="button" onClick={() => void handleResolveConflict('keepLocal')}>Keep Local</button>
          <button type="button" onClick={() => void handleResolveConflict('keepRemote')}>Keep Remote</button>
          <button type="button" onClick={() => void handleResolveConflict('saveLocalAsCopy')}>Save Local as Copy</button>
        </section>
      )}

      <section className={editorClass} style={editorStyle}>
        <MarkdownEditor markdown={markdown} resetKey={resetKey} onChange={setMarkdown} onEditorReady={setEditor} />
      </section>

      <footer className="statusbar">
        <span className="status-main">
          {fileDisplayName(currentFile)} · {currentProvider} · <SaveSyncIndicator state={currentSaveSyncState} provider={currentLibrary?.provider ?? 'local'} />
        </span>
        <span>{status} · {zoom}% zoom</span>
      </footer>
      {githubSignInModal}
      {dialogHost}
    </main>
  )
}

export default App
