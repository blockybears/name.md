import { invoke } from '@tauri-apps/api/core'
import {
  deleteGitHubCachedFile,
  hashString,
  listGitHubCachedFiles,
  nowIso,
  readGitHubCachedFile,
  writeGitHubCachedFile,
} from './storage'
import {
  fileExtension,
  fileNameFromPath,
  joinLibraryPath,
  makeLibraryFileId,
  type CachedGitHubFile,
  type ConflictResolution,
  type GitHubAuthState,
  type GitHubDeviceFlowState,
  type GitHubRepo,
  type Library,
  type LibraryFile,
  type LibraryFileStatus,
  type LibraryProvider,
  type SyncResult,
} from './types'

const githubApiBase = 'https://api.github.com'
const githubUserAgent = 'NAME.md'

type GitHubContent = {
  name: string
  path: string
  type: 'file' | 'dir'
  sha: string
  content?: string
  encoding?: string
}

type GitHubUser = {
  login: string
  name?: string
  avatar_url?: string
}

type GitHubRepoResponse = {
  id: number
  name: string
  full_name: string
  private: boolean
  default_branch: string
  owner: { login: string }
}

let authGetter: () => GitHubAuthState | null = () => null

type NativeGitHubResponse = {
  status: number
  body: string
}

export function configureGitHubProvider(getAuth: () => GitHubAuthState | null) {
  authGetter = getAuth
}

function getAuthToken() {
  const token = authGetter()?.token
  if (!token) {
    throw new Error('Connect GitHub first')
  }
  return token
}

async function githubRequest<T>(path: string, init: RequestInit = {}, allowNotFound = false): Promise<T | null> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('X-GitHub-Api-Version', '2022-11-28')
  headers.set('User-Agent', githubUserAgent)

  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${getAuthToken()}`)
  }

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const headerPairs: Array<{ name: string; value: string }> = []
  headers.forEach((value, name) => headerPairs.push({ name, value }))

  const response = await invoke<NativeGitHubResponse>('github_http', {
    request: {
      method: init.method || 'GET',
      url: `${githubApiBase}${path}`,
      headers: headerPairs,
      body: typeof init.body === 'string' ? init.body : undefined,
    },
  })

  if (allowNotFound && response.status === 404) {
    return null
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`GitHub ${response.status}: ${response.body}`)
  }

  if (response.status === 204) {
    return null
  }

  return JSON.parse(response.body) as T
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function decodeBase64(value: string) {
  const binary = atob(value.replace(/\n/g, ''))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

function markdownFileFromGithub(library: Library, item: GitHubContent): LibraryFile {
  const path = item.path.startsWith(library.rootPath)
    ? item.path.slice(library.rootPath.length).replace(/^\/+/, '')
    : item.path
  const name = fileNameFromPath(path)
  const cached = readGitHubCachedFile(library.id, path)
  return {
    id: makeLibraryFileId(library.id, path, item.type === 'dir' ? 'folder' : 'file'),
    libraryId: library.id,
    path,
    name,
    type: item.type === 'dir' ? 'folder' : 'file',
    extension: item.type === 'file' ? fileExtension(name) : undefined,
    sha: item.sha,
    remoteHash: item.sha,
    localHash: cached?.localHash,
    status: cached?.status ?? 'synced',
    updatedAt: cached?.updatedAt,
  }
}

function fileFromCache(cached: CachedGitHubFile): LibraryFile {
  const name = fileNameFromPath(cached.path)
  return {
    id: makeLibraryFileId(cached.libraryId, cached.path, 'file'),
    libraryId: cached.libraryId,
    path: cached.path,
    name,
    type: 'file',
    extension: fileExtension(name),
    sha: cached.remoteSha,
    localHash: cached.localHash,
    remoteHash: cached.remoteSha,
    status: cached.status,
    updatedAt: cached.updatedAt,
  }
}

function folderFromPath(library: Library, path: string): LibraryFile {
  return {
    id: makeLibraryFileId(library.id, path, 'folder'),
    libraryId: library.id,
    path,
    name: fileNameFromPath(path),
    type: 'folder',
    status: 'dirty',
    updatedAt: nowIso(),
  }
}

function repoContentsPath(library: Library, path: string) {
  return joinLibraryPath(library.rootPath, path)
}

function apiRepoContentsUrl(library: Library, repoPath: string, includeRef = true) {
  if (!library.repoOwner || !library.repoName) {
    throw new Error('GitHub library is missing repository details')
  }

  const encodedPath = repoPath.split('/').map(encodeURIComponent).join('/')
  const query = includeRef && library.branch ? `?ref=${encodeURIComponent(library.branch)}` : ''
  return `/repos/${library.repoOwner}/${library.repoName}/contents/${encodedPath}${query}`
}

function apiContentsUrl(library: Library, path: string, includeRef = true) {
  return apiRepoContentsUrl(library, repoContentsPath(library, path), includeRef)
}

async function getRemoteContent(library: Library, path: string) {
  return githubRequest<GitHubContent>(apiContentsUrl(library, path), {}, true)
}

async function getRemoteRepoContent(library: Library, repoPath: string) {
  return githubRequest<GitHubContent>(apiRepoContentsUrl(library, repoPath), {}, true)
}

async function cacheContent(
  library: Library,
  path: string,
  content: string,
  sha?: string,
  status: LibraryFileStatus = 'synced',
) {
  const localHash = await hashString(content)
  const cached: CachedGitHubFile = {
    libraryId: library.id,
    path,
    content,
    baseSha: sha,
    remoteSha: sha,
    localHash,
    status,
    updatedAt: nowIso(),
  }
  writeGitHubCachedFile(cached)
  return cached
}

async function uploadCachedFile(library: Library, cached: CachedGitHubFile, forceSha?: string): Promise<SyncResult> {
  const remote = await getRemoteContent(library, cached.path)
  const remoteSha = remote?.sha
  const shaToUse = forceSha ?? remoteSha

  if (remoteSha && cached.baseSha && remoteSha !== cached.baseSha && !forceSha) {
    const remoteContent = remote?.content ? decodeBase64(remote.content) : ''
    const conflict: CachedGitHubFile = {
      ...cached,
      remoteSha,
      status: 'conflict',
      conflictRemoteContent: remoteContent,
      updatedAt: nowIso(),
    }
    writeGitHubCachedFile(conflict)
    return {
      status: 'conflict',
      file: fileFromCache(conflict),
      message: `${cached.path} has changed on GitHub`,
      conflictRemoteContent: remoteContent,
    }
  }

  if (remoteSha && !cached.baseSha && !forceSha) {
    const remoteContent = remote?.content ? decodeBase64(remote.content) : ''
    const conflict: CachedGitHubFile = {
      ...cached,
      remoteSha,
      status: 'conflict',
      conflictRemoteContent: remoteContent,
      updatedAt: nowIso(),
    }
    writeGitHubCachedFile(conflict)
    return {
      status: 'conflict',
      file: fileFromCache(conflict),
      message: `${cached.path} already exists on GitHub`,
      conflictRemoteContent: remoteContent,
    }
  }

  const body: Record<string, unknown> = {
    message: `Update ${cached.path}`,
    content: encodeBase64(cached.content),
    branch: library.branch || 'main',
  }

  if (shaToUse) {
    body.sha = shaToUse
  }

  const result = await githubRequest<{ content: GitHubContent }>(apiContentsUrl(library, cached.path, false), {
    method: 'PUT',
    body: JSON.stringify(body),
  })

  const nextSha = result?.content.sha ?? remoteSha
  const synced = await cacheContent(library, cached.path, cached.content, nextSha, 'synced')

  return {
    status: 'synced',
    file: fileFromCache(synced),
    message: `Synced ${cached.path}`,
  }
}

export async function startGitHubDeviceFlow(clientId: string): Promise<GitHubDeviceFlowState> {
  const response = await invoke<NativeGitHubResponse>('github_http', {
    request: {
      method: 'POST',
      url: 'https://github.com/login/device/code',
      headers: [
        { name: 'Accept', value: 'application/json' },
        { name: 'User-Agent', value: githubUserAgent },
        { name: 'Content-Type', value: 'application/x-www-form-urlencoded' },
      ],
      body: new URLSearchParams({
        client_id: clientId,
        scope: 'repo',
      }).toString(),
    },
  })

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`GitHub device auth failed: ${response.body}`)
  }

  const data = JSON.parse(response.body) as {
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval: number
  }

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresAt: Date.now() + data.expires_in * 1000,
    intervalSeconds: data.interval,
  }
}

export async function pollGitHubDeviceFlow(clientId: string, deviceCode: string): Promise<GitHubAuthState | null> {
  const response = await invoke<NativeGitHubResponse>('github_http', {
    request: {
      method: 'POST',
      url: 'https://github.com/login/oauth/access_token',
      headers: [
        { name: 'Accept', value: 'application/json' },
        { name: 'User-Agent', value: githubUserAgent },
        { name: 'Content-Type', value: 'application/x-www-form-urlencoded' },
      ],
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }).toString(),
    },
  })

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`GitHub token request failed: ${response.body}`)
  }

  const data = JSON.parse(response.body) as { access_token?: string; error?: string; error_description?: string }

  if (data.error === 'authorization_pending' || data.error === 'slow_down') {
    return null
  }

  if (data.error) {
    throw new Error(data.error_description || data.error)
  }

  if (!data.access_token) {
    return null
  }

  const user = await githubRequest<GitHubUser>('/user', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  })

  if (!user) {
    throw new Error('GitHub user lookup failed')
  }

  return {
    token: data.access_token,
    login: user.login,
    name: user.name,
    avatarUrl: user.avatar_url,
  }
}

export async function listGitHubRepos() {
  const repos = await githubRequest<GitHubRepoResponse[]>(
    '/user/repos?visibility=all&affiliation=owner,collaborator&sort=updated&per_page=100',
  )

  return (repos ?? []).map(mapGitHubRepo)
}

function mapGitHubRepo(repo: GitHubRepoResponse): GitHubRepo {
  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    private: repo.private,
    defaultBranch: repo.default_branch,
  }
}

export async function getGitHubRepo(owner: string, name: string) {
  const repo = await githubRequest<GitHubRepoResponse>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    {},
    true,
  )

  return repo ? mapGitHubRepo(repo) : null
}

export async function createGitHubRepo(name: string) {
  const repo = await githubRequest<GitHubRepoResponse>('/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name,
      private: true,
      auto_init: true,
    }),
  })

  if (!repo) {
    throw new Error('GitHub repository creation failed')
  }

  return mapGitHubRepo(repo)
}

export async function ensureGitHubRepoFile(library: Library, repoPath: string, content = '') {
  const normalizedPath = joinLibraryPath(repoPath)
  const remote = await getRemoteRepoContent(library, normalizedPath)

  if (remote?.sha) {
    return remote
  }

  const result = await githubRequest<{ content: GitHubContent }>(apiRepoContentsUrl(library, normalizedPath, false), {
    method: 'PUT',
    body: JSON.stringify({
      message: `Create ${normalizedPath}`,
      content: encodeBase64(content),
      branch: library.branch || 'main',
    }),
  })

  if (!result?.content) {
    throw new Error(`Failed to create ${normalizedPath}`)
  }

  return result.content
}

export async function createGitHubLibraryFile(library: Library, path: string, content: string) {
  const relativePath = joinLibraryPath(path)
  const remote = await getRemoteContent(library, relativePath)

  if (remote?.sha) {
    throw new Error(`${relativePath} already exists in the GitHub library`)
  }

  const result = await githubRequest<{ content: GitHubContent }>(apiContentsUrl(library, relativePath, false), {
    method: 'PUT',
    body: JSON.stringify({
      message: `Create ${relativePath}`,
      content: encodeBase64(content),
      branch: library.branch || 'main',
    }),
  })

  const sha = result?.content.sha
  const cached = await cacheContent(library, relativePath, content, sha, 'synced')
  return fileFromCache(cached)
}

export const githubLibraryProvider: LibraryProvider = {
  async listFiles(library, path) {
    const remote = await githubRequest<GitHubContent[]>(apiContentsUrl(library, path), {}, true)
    const files = Array.isArray(remote)
      ? remote
          .map((item) => markdownFileFromGithub(library, item))
          .filter((entry) => {
            if (entry.type === 'folder') {
              return true
            }
            return ['md', 'markdown', 'mdown', 'mkd', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(
              entry.extension ?? '',
            )
          })
      : []

    const currentPrefix = path ? `${path}/` : ''
    const cachedEntries = listGitHubCachedFiles(library.id)
      .filter((cached) => cached.path.startsWith(currentPrefix))
      .map((cached) => cached.path.slice(currentPrefix.length))
      .filter((relative) => relative && !relative.includes('/'))
      .map((relative) => {
        const cachedPath = joinLibraryPath(path, relative)
        const cached = readGitHubCachedFile(library.id, cachedPath)
        return cached ? fileFromCache(cached) : null
      })
      .filter((entry): entry is LibraryFile => Boolean(entry))

    const merged = new Map<string, LibraryFile>()
    for (const file of files) {
      merged.set(`${file.type}:${file.path}`, file)
    }
    for (const file of cachedEntries) {
      merged.set(`${file.type}:${file.path}`, file)
    }

    return Array.from(merged.values()).sort((first, second) => {
      if (first.type !== second.type) {
        return first.type === 'folder' ? -1 : 1
      }

      return first.name.localeCompare(second.name)
    })
  },

  async readFile(file, library) {
    const cached = readGitHubCachedFile(library.id, file.path)
    if (cached && (cached.status === 'dirty' || cached.status === 'pendingUpload' || cached.status === 'conflict')) {
      return cached.content
    }

    const remote = await getRemoteContent(library, file.path)
    if (!remote?.content) {
      throw new Error(`${file.path} was not found on GitHub`)
    }

    const content = decodeBase64(remote.content)
    await cacheContent(library, file.path, content, remote.sha, 'synced')
    return content
  },

  async writeFile(file, library, content) {
    const cached = readGitHubCachedFile(library.id, file.path)
    const localHash = await hashString(content)
    const next: CachedGitHubFile = {
      libraryId: library.id,
      path: file.path,
      content,
      baseSha: cached?.baseSha ?? file.sha,
      remoteSha: cached?.remoteSha ?? file.sha,
      localHash,
      status: 'dirty',
      updatedAt: nowIso(),
      conflictRemoteContent: cached?.conflictRemoteContent,
    }
    writeGitHubCachedFile(next)
    return fileFromCache(next)
  },

  async createFile(library, path, content = '') {
    const relativePath = joinLibraryPath(path)
    return createGitHubLibraryFile(library, relativePath, content)
  },

  async createFolder(library, path) {
    const relativePath = joinLibraryPath(path)
    await ensureGitHubRepoFile(library, repoContentsPath(library, joinLibraryPath(relativePath, '.keep')), '')
    return { ...folderFromPath(library, relativePath), status: 'synced' }
  },

  async rename(file, library, newName) {
    const parentPath = file.path.split('/').slice(0, -1).join('/')
    const nextPath = joinLibraryPath(parentPath, newName)
    return this.move ? this.move(file, library, nextPath) : file
  },

  async move(file, library, newPath) {
    const nextPath = joinLibraryPath(newPath)

    if (file.type === 'folder') {
      await ensureGitHubRepoFile(library, repoContentsPath(library, joinLibraryPath(nextPath, '.keep')), '')
      return { ...folderFromPath(library, nextPath), status: 'synced' }
    }

    const content = await this.readFile(file, library)
    const next = await createGitHubLibraryFile(library, nextPath, content)
    deleteGitHubCachedFile(library.id, file.path)

    const remote = await getRemoteContent(library, file.path)
    if (remote?.sha) {
      await githubRequest(apiContentsUrl(library, file.path, false), {
        method: 'DELETE',
        body: JSON.stringify({
          message: `Rename ${file.path} to ${nextPath}`,
          sha: remote.sha,
          branch: library.branch || 'main',
        }),
      })
    }

    return next
  },

  async delete(file, library) {
    deleteGitHubCachedFile(library.id, file.path)
    if (file.type === 'folder') {
      deleteGitHubCachedFile(library.id, joinLibraryPath(file.path, '.gitkeep'))
      return
    }

    const remote = await getRemoteContent(library, file.path)
    if (!remote?.sha) {
      return
    }

    await githubRequest(apiContentsUrl(library, file.path, false), {
      method: 'DELETE',
      body: JSON.stringify({
        message: `Delete ${file.path}`,
        sha: remote.sha,
        branch: library.branch || 'main',
      }),
    })
  },

  async refresh() {
    return
  },

  async sync(library, file) {
    const targets = file
      ? [readGitHubCachedFile(library.id, file.path)].filter((cached): cached is CachedGitHubFile => Boolean(cached))
      : listGitHubCachedFiles(library.id).filter((cached) => cached.status !== 'synced')

    const results: SyncResult[] = []

    if (file && targets.length === 0) {
      const cached = readGitHubCachedFile(library.id, file.path)
      const remote = await getRemoteContent(library, file.path)
      if (cached?.remoteSha && remote?.sha && cached.remoteSha !== remote.sha) {
        const changed = { ...cached, remoteSha: remote.sha, status: 'remoteChanged' as const, updatedAt: nowIso() }
        writeGitHubCachedFile(changed)
        return [{ status: 'remoteChanged', file: fileFromCache(changed), message: `${file.path} changed on GitHub` }]
      }
      return [{ status: 'synced', file: { ...file, status: 'synced' }, message: `${file.path} is synced` }]
    }

    for (const cached of targets) {
      writeGitHubCachedFile({ ...cached, status: 'pendingUpload', updatedAt: nowIso() })
      results.push(await uploadCachedFile(library, cached))
    }

    return results
  },

  async resolveConflict(library, file, resolution: ConflictResolution) {
    const cached = readGitHubCachedFile(library.id, file.path)
    if (!cached) {
      throw new Error('No cached conflict found')
    }

    if (resolution === 'keepRemote') {
      const remote = await getRemoteContent(library, file.path)
      if (!remote?.content) {
        throw new Error('Remote file is no longer available')
      }

      const next = await cacheContent(library, file.path, decodeBase64(remote.content), remote.sha, 'synced')
      return { status: 'synced', file: fileFromCache(next), message: `Kept remote ${file.path}` }
    }

    if (resolution === 'saveLocalAsCopy') {
      const stem = file.name.replace(/\.[^.]+$/, '')
      const extension = file.extension ? `.${file.extension}` : ''
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
      const parentPath = file.path.split('/').slice(0, -1).join('/')
      const copyPath = joinLibraryPath(parentPath, `${stem}-local-copy-${stamp}${extension}`)
      const copy = await cacheContent(library, copyPath, cached.content, undefined, 'dirty')
      return uploadCachedFile(library, copy)
    }

    const remote = await getRemoteContent(library, file.path)
    return uploadCachedFile(library, cached, remote?.sha)
  },
}
