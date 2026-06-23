import type { CachedGitHubFile, FileLink, GitHubAuthState, GitHubDeviceFlowState, Library, LibraryFile } from './types'

const librariesKey = 'name-md.libraries.v1'
const activeLibraryKey = 'name-md.active-library.v1'
const editorSessionKey = 'name-md.editor-session.v1'
const githubAuthKey = 'name-md.github-auth.v1'
const githubClientIdKey = 'name-md.github-client-id.v1'
const githubDeviceFlowKey = 'name-md.github-device-flow.v1'
const githubCacheKey = 'name-md.github-cache.v1'
const fileLinksKey = 'name-md.file-links.v1'

type CacheMap = Record<string, CachedGitHubFile>
type FileLinkMap = Record<string, FileLink>

export type EditorSessionState = {
  currentFile: LibraryFile | null
  hasOpenDocument: boolean
  markdown: string
  savedMarkdown: string
  updatedAt: string
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function loadLibraries() {
  return readJson<Library[]>(librariesKey, [])
}

export function saveLibraries(libraries: Library[]) {
  writeJson(librariesKey, libraries)
}

export function loadActiveLibraryId() {
  return localStorage.getItem(activeLibraryKey)
}

export function saveActiveLibraryId(id: string | null) {
  if (id) {
    localStorage.setItem(activeLibraryKey, id)
  } else {
    localStorage.removeItem(activeLibraryKey)
  }
}

export function loadEditorSession() {
  return readJson<EditorSessionState | null>(editorSessionKey, null)
}

export function saveEditorSession(session: EditorSessionState) {
  writeJson(editorSessionKey, session)
}

export function loadGitHubAuth() {
  return readJson<GitHubAuthState | null>(githubAuthKey, null)
}

export function saveGitHubAuth(auth: GitHubAuthState | null) {
  if (auth) {
    writeJson(githubAuthKey, auth)
  } else {
    localStorage.removeItem(githubAuthKey)
  }
}

export function loadGitHubClientId() {
  return localStorage.getItem(githubClientIdKey) || import.meta.env.VITE_GITHUB_CLIENT_ID || ''
}

export function saveGitHubClientId(clientId: string) {
  if (clientId.trim()) {
    localStorage.setItem(githubClientIdKey, clientId.trim())
  } else {
    localStorage.removeItem(githubClientIdKey)
  }
}

export function loadGitHubDeviceFlow() {
  const flow = readJson<GitHubDeviceFlowState | null>(githubDeviceFlowKey, null)

  if (flow && flow.expiresAt <= Date.now()) {
    localStorage.removeItem(githubDeviceFlowKey)
    return null
  }

  return flow
}

export function saveGitHubDeviceFlow(flow: GitHubDeviceFlowState | null) {
  if (flow) {
    writeJson(githubDeviceFlowKey, flow)
  } else {
    localStorage.removeItem(githubDeviceFlowKey)
  }
}

function cacheId(libraryId: string, path: string) {
  return `${libraryId}:${path}`
}

function loadCacheMap() {
  return readJson<CacheMap>(githubCacheKey, {})
}

function saveCacheMap(cache: CacheMap) {
  writeJson(githubCacheKey, cache)
}

export function readGitHubCachedFile(libraryId: string, path: string) {
  return loadCacheMap()[cacheId(libraryId, path)]
}

export function writeGitHubCachedFile(file: CachedGitHubFile) {
  const cache = loadCacheMap()
  cache[cacheId(file.libraryId, file.path)] = file
  saveCacheMap(cache)
}

export function deleteGitHubCachedFile(libraryId: string, path: string) {
  const cache = loadCacheMap()
  delete cache[cacheId(libraryId, path)]
  saveCacheMap(cache)
}

export function listGitHubCachedFiles(libraryId: string) {
  return Object.values(loadCacheMap()).filter((file) => file.libraryId === libraryId)
}

function fileLinkId(repoLibraryId: string, repoPath: string) {
  return `${repoLibraryId}:${repoPath}`
}

function loadFileLinkMap() {
  return readJson<FileLinkMap>(fileLinksKey, {})
}

function saveFileLinkMap(links: FileLinkMap) {
  writeJson(fileLinksKey, links)
}

export function getFileLink(repoLibraryId: string, repoPath: string) {
  return loadFileLinkMap()[fileLinkId(repoLibraryId, repoPath)]
}

export function setFileLink(link: FileLink) {
  const links = loadFileLinkMap()
  links[fileLinkId(link.repoLibraryId, link.repoPath)] = link
  saveFileLinkMap(links)
}

export function deleteFileLink(repoLibraryId: string, repoPath: string) {
  const links = loadFileLinkMap()
  delete links[fileLinkId(repoLibraryId, repoPath)]
  saveFileLinkMap(links)
}

export function listFileLinks(repoLibraryId: string) {
  return Object.values(loadFileLinkMap()).filter((link) => link.repoLibraryId === repoLibraryId)
}

export async function hashString(value: string) {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function nowIso() {
  return new Date().toISOString()
}
