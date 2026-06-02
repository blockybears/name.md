import {
  ChevronLeft,
  Cloud,
  File,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCw,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  compactSaveSyncStateLabel,
  saveSyncStateFromFileStatus,
  saveSyncStateLabel,
  type SaveSyncState,
} from './saveSyncStatus'
import { isMarkdownFile, type GitHubRepo, type Library, type LibraryFile } from './types'

type ExplorerMode = 'drawer' | 'screen'
type LibraryDrawerMode = 'explorer' | 'advanced'

type LibraryExplorerProps = {
  activeLibrary: Library | null
  clientId: string
  defaultRepoName: string
  files: LibraryFile[]
  folderPath: string
  githubConnected: boolean
  githubLogin?: string
  libraries: Library[]
  loading?: boolean
  mode: ExplorerMode
  repos: GitHubRepo[]
  syncing?: boolean
  onAddLocalLibrary: () => void
  onBackFolder: () => void
  onChangeClientId: (clientId: string) => void
  onClose?: () => void
  onConnectGitHub: () => void
  onCreateFile: () => void
  onCreateFolder: () => void
  onCreateGitHubLibrary: (repo: GitHubRepo, branch: string, rootPath: string, assetsPath: string) => void
  onCreateGitHubRepo: (name: string) => Promise<GitHubRepo | null>
  onDelete: (file: LibraryFile) => void
  onDisconnectGitHub: () => void
  onEnsureDefaultGitHubLibrary: () => void
  onMove: (file: LibraryFile) => void
  onNewLocalDraft?: () => void
  onOpenLocalFile: () => void
  onOpenFile: (file: LibraryFile) => void
  onOpenFolder: (file: LibraryFile) => void
  onRefresh: () => void
  onRename: (file: LibraryFile) => void
  onSelectLibrary: (libraryId: string) => void
  onSync: () => void
}

export function SaveSyncIndicator({
  compact = false,
  provider,
  state,
}: {
  compact?: boolean
  provider?: Library['provider']
  state: SaveSyncState
}) {
  const label = compact ? compactSaveSyncStateLabel(state, provider) : saveSyncStateLabel(state, provider)
  const fullLabel = saveSyncStateLabel(state, provider)

  return (
    <span
      className={compact ? `save-sync-indicator save-sync-compact state-${state}` : `save-sync-indicator state-${state}`}
      title={fullLabel}
      aria-label={fullLabel}
    >
      <span className="status-light" aria-hidden="true" />
      <span className="save-sync-label">{label}</span>
    </span>
  )
}

export function SyncStatusBadge({ status }: { status: LibraryFile['status'] }) {
  return <SaveSyncIndicator state={saveSyncStateFromFileStatus(status)} compact />
}

export function LibraryExplorer({
  activeLibrary,
  clientId,
  defaultRepoName,
  files,
  folderPath,
  githubConnected,
  githubLogin,
  libraries,
  loading = false,
  mode,
  repos,
  syncing = false,
  onAddLocalLibrary,
  onBackFolder,
  onChangeClientId,
  onClose,
  onConnectGitHub,
  onCreateFile,
  onCreateFolder,
  onCreateGitHubLibrary,
  onCreateGitHubRepo,
  onDelete,
  onDisconnectGitHub,
  onEnsureDefaultGitHubLibrary,
  onMove,
  onNewLocalDraft,
  onOpenLocalFile,
  onOpenFile,
  onOpenFolder,
  onRefresh,
  onRename,
  onSelectLibrary,
  onSync,
}: LibraryExplorerProps) {
  const [drawerMode, setDrawerMode] = useState<LibraryDrawerMode>('explorer')
  const [repoId, setRepoId] = useState('')
  const [newRepoName, setNewRepoName] = useState(defaultRepoName)
  const [branch, setBranch] = useState('main')
  const [rootPath, setRootPath] = useState('docs')
  const [assetsPath, setAssetsPath] = useState('assets')
  const [creatingRepo, setCreatingRepo] = useState(false)

  const selectedRepo = useMemo(() => repos.find((repo) => String(repo.id) === repoId) ?? repos[0], [repoId, repos])
  const activeGitHubLibrary = activeLibrary?.provider === 'github' ? activeLibrary : libraries.find((library) => library.provider === 'github')
  const hasMultipleLibraries = libraries.length > 1
  const activeLibraryLabel = activeLibrary?.provider === 'github'
    ? `${activeLibrary.repoOwner}/${activeLibrary.repoName}/${activeLibrary.rootPath}`
    : activeLibrary?.displayName

  const createRepo = async () => {
    if (!newRepoName.trim()) {
      return
    }

    setCreatingRepo(true)
    try {
      const repo = await onCreateGitHubRepo(newRepoName.trim())
      if (repo) {
        setRepoId(String(repo.id))
        setBranch(repo.defaultBranch || 'main')
      }
    } finally {
      setCreatingRepo(false)
    }
  }

  const addGitHubLibrary = () => {
    if (!selectedRepo) {
      return
    }

    onCreateGitHubLibrary(selectedRepo, branch || selectedRepo.defaultBranch || 'main', rootPath || 'docs', assetsPath || 'assets')
    setDrawerMode('explorer')
  }

  const useDefaultGitHubLibrary = () => {
    onEnsureDefaultGitHubLibrary()
    setDrawerMode('explorer')
  }

  const disconnectGitHub = () => {
    onDisconnectGitHub()
    setDrawerMode('explorer')
  }

  if (drawerMode === 'advanced') {
    return (
      <aside
        className={mode === 'screen' ? 'library-explorer library-screen library-advanced-mode' : 'library-explorer library-advanced-mode'}
        aria-label="Advanced Library Settings"
      >
        <div className="library-header">
          <button type="button" className="advanced-back-button" onClick={() => setDrawerMode('explorer')}>
            <ChevronLeft size={16} />
            Back to Library
          </button>
          {onClose && (
            <button type="button" className="icon-button" aria-label="Close library" title="Close library" onClick={onClose}>
              <X size={17} />
            </button>
          )}
        </div>

        <section className="advanced-settings-view">
          <div className="library-section-title">
            <span>Advanced Settings</span>
          </div>

          <div className="advanced-settings">
            <div className="advanced-settings-heading">GitHub</div>
            <div className="github-summary">
              <span>Account</span>
              <strong>{githubConnected ? githubLogin || 'Connected' : 'Not connected'}</strong>
            </div>

            <label>
              OAuth Client ID
              <input
                value={clientId}
                placeholder="GitHub OAuth app client ID"
                onChange={(event) => onChangeClientId(event.target.value)}
              />
            </label>

            {!githubConnected && (
              <>
                <button type="button" onClick={onConnectGitHub} disabled={!clientId.trim()}>
                  <GitBranch size={15} />
                  Connect GitHub
                </button>
                {!clientId.trim() && <div className="empty-library">Enter a GitHub OAuth client ID before connecting.</div>}
              </>
            )}

            {githubConnected && (
              <>
                <div className="library-action-row">
                  <button type="button" onClick={useDefaultGitHubLibrary}>
                    <GitBranch size={15} />
                    Use default library
                  </button>
                  <button type="button" onClick={disconnectGitHub}>
                    Disconnect
                  </button>
                </div>
                <div className="library-action-row">
                  <button type="button" onClick={onAddLocalLibrary}>
                    <Folder size={15} />
                    Local folder
                  </button>
                  <button type="button" onClick={onOpenLocalFile}>
                    <File size={15} />
                    Open file
                  </button>
                </div>
                <label>
                  Repository
                  <select
                    value={selectedRepo ? String(selectedRepo.id) : ''}
                    onChange={(event) => {
                      setRepoId(event.target.value)
                      const repo = repos.find((item) => String(item.id) === event.target.value)
                      if (repo) {
                        setBranch(repo.defaultBranch || 'main')
                      }
                    }}
                  >
                    {repos.map((repo) => (
                      <option key={repo.id} value={repo.id}>
                        {repo.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="library-action-row">
                  <input value={newRepoName} onChange={(event) => setNewRepoName(event.target.value)} />
                  <button type="button" onClick={createRepo} disabled={creatingRepo}>
                    {creatingRepo ? <Loader2 size={15} className="spin" /> : <GitBranch size={15} />}
                    Create private repo
                  </button>
                </div>
                <label>
                  Branch
                  <span className="input-with-icon">
                    <GitBranch size={14} />
                    <input value={branch} onChange={(event) => setBranch(event.target.value)} />
                  </span>
                </label>
                <label>
                  Root folder
                  <input value={rootPath} onChange={(event) => setRootPath(event.target.value)} />
                </label>
                <label>
                  Assets folder
                  <input value={assetsPath} onChange={(event) => setAssetsPath(event.target.value)} />
                </label>
                <button type="button" onClick={addGitHubLibrary} disabled={!selectedRepo}>
                  Open custom GitHub library
                </button>
              </>
            )}
          </div>
        </section>
      </aside>
    )
  }

  return (
    <aside className={mode === 'screen' ? 'library-explorer library-screen' : 'library-explorer'} aria-label="Library">
      <div className="library-header">
        <div>
          <strong>Library</strong>
          <span>{activeLibraryLabel || 'No library selected'}</span>
        </div>
        {onClose && (
          <button type="button" className="icon-button" aria-label="Close library" title="Close library" onClick={onClose}>
            <X size={17} />
          </button>
        )}
      </div>

      <section className="library-toolbar-section">
        {hasMultipleLibraries ? (
          <label className="compact-library-selector">
            Active library
            <select value={activeLibrary?.id ?? ''} onChange={(event) => onSelectLibrary(event.target.value)}>
              <option value="" disabled>
                Select library
              </option>
              {libraries.map((library) => (
                <option key={library.id} value={library.id}>
                  {library.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="compact-library-label">{activeLibraryLabel || 'No library selected'}</div>
        )}
        <div className="library-primary-actions">
          {mode === 'screen' && onNewLocalDraft && (
            <button type="button" onClick={onNewLocalDraft}>
              <FilePlus size={15} />
              Draft
            </button>
          )}
          <button type="button" onClick={onCreateFile} disabled={!activeLibrary}>
            <FilePlus size={15} />
            File
          </button>
          <button type="button" onClick={onCreateFolder} disabled={!activeLibrary}>
            <FolderPlus size={15} />
            Folder
          </button>
          <button type="button" onClick={onSync} disabled={!activeLibrary || syncing}>
            {syncing ? <Loader2 size={15} className="spin" /> : <RotateCw size={15} />}
            Sync
          </button>
          <button type="button" onClick={onRefresh} disabled={!activeLibrary || loading}>
            {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
            Refresh
          </button>
        </div>
      </section>

      <section className="library-section file-explorer-section">
        <div className="library-section-title">
          <span>Files</span>
        </div>
        <div className="library-path">
          <button type="button" className="icon-button" title="Up" onClick={onBackFolder} disabled={!folderPath}>
            <ChevronLeft size={15} />
          </button>
          <span>/{folderPath || activeLibrary?.rootPath || ''}</span>
        </div>
        <div className="file-list">
          {loading && <div className="empty-library">Loading files...</div>}
          {!loading && files.length === 0 && <div className="empty-library">No files in this folder</div>}
          {!loading &&
            files.map((file) => (
              <div key={file.id} className="file-row">
                <button
                  type="button"
                  className="file-open-button"
                  disabled={file.type === 'file' && !isMarkdownFile(file)}
                  onClick={() => (file.type === 'folder' ? onOpenFolder(file) : onOpenFile(file))}
                >
                  {file.type === 'folder' ? <Folder size={16} /> : <File size={16} />}
                  <span>{file.name}</span>
                </button>
                {file.status !== 'synced' && <SyncStatusBadge status={file.status} />}
                <div className="file-row-actions">
                  <button type="button" className="icon-button" title="Rename" onClick={() => onRename(file)}>
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title="Move"
                    disabled={file.type === 'folder'}
                    onClick={() => onMove(file)}
                  >
                    <FolderOpen size={14} />
                  </button>
                  <button type="button" className="icon-button danger" title="Delete" onClick={() => onDelete(file)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
        </div>
      </section>

      <section className="library-footer">
        {!githubConnected && (
          <>
            <button type="button" onClick={onConnectGitHub} disabled={!clientId.trim()}>
              <GitBranch size={15} />
              Connect GitHub
            </button>
            {!clientId.trim() && <div className="empty-library">Add the GitHub OAuth client ID in Advanced Settings.</div>}
          </>
        )}
        {githubConnected && (
          <>
            <div className="github-footer-summary">
              <Cloud size={15} />
              <span>{activeGitHubLibrary ? `${activeGitHubLibrary.repoOwner}/${activeGitHubLibrary.repoName} · ${activeGitHubLibrary.branch || 'main'} · /${activeGitHubLibrary.rootPath}` : `GitHub: ${githubLogin}`}</span>
              <SaveSyncIndicator state={syncing ? 'syncing' : 'saved_synced'} compact />
              <button type="button" className="compact-sync-button" onClick={onSync} disabled={syncing || !activeGitHubLibrary}>
                {syncing ? <Loader2 size={14} className="spin" /> : <RotateCw size={14} />}
              </button>
            </div>
          </>
        )}
        <button type="button" className="advanced-toggle" onClick={() => setDrawerMode('advanced')}>
          <Settings size={15} />
          Advanced Settings
        </button>
      </section>
    </aside>
  )
}
