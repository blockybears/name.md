export type LibraryProviderType = 'local' | 'github'

export type LibraryFileStatus =
  | 'synced'
  | 'dirty'
  | 'pendingUpload'
  | 'remoteChanged'
  | 'conflict'

export type Library = {
  id: string
  provider: LibraryProviderType
  name: string
  displayName: string
  rootPath: string
  repoOwner?: string
  repoName?: string
  branch?: string
  assetsPath?: string
  accountLogin?: string
  syncMode?: 'manual'
  lastSyncAt?: string
}

export type LibraryFile = {
  id: string
  libraryId: string
  path: string
  name: string
  type: 'file' | 'folder'
  extension?: string
  sha?: string
  localHash?: string
  remoteHash?: string
  status: LibraryFileStatus
  updatedAt?: string
}

export type ConflictResolution = 'keepLocal' | 'keepRemote' | 'saveLocalAsCopy'

export type SyncResult = {
  status: LibraryFileStatus
  file?: LibraryFile
  message: string
  conflictRemoteContent?: string
}

export interface LibraryProvider {
  listFiles(library: Library, path: string): Promise<LibraryFile[]>
  readFile(file: LibraryFile, library: Library): Promise<string>
  writeFile(file: LibraryFile, library: Library, content: string): Promise<LibraryFile>
  createFile(library: Library, path: string, content?: string): Promise<LibraryFile>
  createFolder(library: Library, path: string): Promise<LibraryFile>
  rename(file: LibraryFile, library: Library, newName: string): Promise<LibraryFile>
  move?(file: LibraryFile, library: Library, newPath: string): Promise<LibraryFile>
  delete(file: LibraryFile, library: Library): Promise<void>
  refresh?(library: Library): Promise<void>
  sync?(library: Library, file?: LibraryFile): Promise<SyncResult[]>
  resolveConflict?(
    library: Library,
    file: LibraryFile,
    resolution: ConflictResolution,
  ): Promise<SyncResult>
}

export type GitHubAuthState = {
  token: string
  login: string
  name?: string
  avatarUrl?: string
}

export type GitHubRepo = {
  id: number
  name: string
  fullName: string
  owner: string
  private: boolean
  defaultBranch: string
}

export type GitHubDeviceFlowState = {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresAt: number
  intervalSeconds: number
}

export type CachedGitHubFile = {
  libraryId: string
  path: string
  content: string
  baseSha?: string
  remoteSha?: string
  localHash: string
  status: LibraryFileStatus
  updatedAt: string
  conflictRemoteContent?: string
}

export function joinLibraryPath(...parts: Array<string | undefined | null>) {
  return parts
    .filter((part): part is string => Boolean(part))
    .join('/')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

export function fileNameFromPath(path: string) {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'Untitled.md'
}

export function fileExtension(name: string) {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : undefined
}

export function isMarkdownFile(file: LibraryFile) {
  return file.type === 'file' && ['md', 'markdown', 'mdown', 'mkd', 'txt'].includes(file.extension ?? '')
}

export function makeLibraryFileId(libraryId: string, path: string, type: LibraryFile['type']) {
  return `${libraryId}:${type}:${path}`
}
