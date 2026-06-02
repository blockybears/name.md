import {
  createDirectory,
  deletePath,
  listDirectory,
  readTextPath,
  renamePath,
  writeTextPath,
} from './localFiles'
import {
  fileExtension,
  fileNameFromPath,
  joinLibraryPath,
  makeLibraryFileId,
  type Library,
  type LibraryFile,
  type LibraryProvider,
  type SyncResult,
} from './types'

function normalizeNative(path: string) {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function joinNativePath(rootPath: string, relativePath: string) {
  if (!relativePath) {
    return rootPath
  }

  const separator = rootPath.includes('\\') ? '\\' : '/'
  return `${rootPath.replace(/[\\/]+$/, '')}${separator}${relativePath.replace(/[\\/]+/g, separator)}`
}

function relativeFromRoot(rootPath: string, absolutePath: string) {
  const root = normalizeNative(rootPath)
  const absolute = normalizeNative(absolutePath)

  if (absolute === root) {
    return ''
  }

  if (absolute.startsWith(`${root}/`)) {
    return absolute.slice(root.length + 1)
  }

  return absolute
}

function localFileFromPath(library: Library, relativePath: string, type: LibraryFile['type']): LibraryFile {
  const name = fileNameFromPath(relativePath) || library.displayName
  return {
    id: makeLibraryFileId(library.id, relativePath, type),
    libraryId: library.id,
    path: relativePath,
    name,
    type,
    extension: type === 'file' ? fileExtension(name) : undefined,
    status: 'synced',
  }
}

export function createDirectLocalFile(path: string): LibraryFile {
  const name = fileNameFromPath(path)
  return {
    id: makeLibraryFileId('local-direct', path, 'file'),
    libraryId: 'local-direct',
    path,
    name,
    type: 'file',
    extension: fileExtension(name),
    status: 'synced',
  }
}

export const directLocalLibrary: Library = {
  id: 'local-direct',
  provider: 'local',
  name: 'Local files',
  displayName: 'Local files',
  rootPath: '',
  syncMode: 'manual',
}

export const localLibraryProvider: LibraryProvider = {
  async listFiles(library, path) {
    const nativePath = joinNativePath(library.rootPath, path)
    const entries = await listDirectory(nativePath)

    return entries
      .map((entry) => {
        const relativePath = relativeFromRoot(library.rootPath, entry.path)
        return localFileFromPath(library, relativePath, entry.isDir ? 'folder' : 'file')
      })
      .filter((entry) => {
        if (entry.type === 'folder') {
          return true
        }

        return ['md', 'markdown', 'mdown', 'mkd', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(
          entry.extension ?? '',
        )
      })
      .sort((first, second) => {
        if (first.type !== second.type) {
          return first.type === 'folder' ? -1 : 1
        }

        return first.name.localeCompare(second.name)
      })
  },

  readFile(file, library) {
    return readTextPath(library.id === directLocalLibrary.id ? file.path : joinNativePath(library.rootPath, file.path))
  },

  async writeFile(file, library, content) {
    await writeTextPath(library.id === directLocalLibrary.id ? file.path : joinNativePath(library.rootPath, file.path), content)
    return { ...file, status: 'synced', updatedAt: new Date().toISOString() }
  },

  async createFile(library, path, content = '') {
    const relativePath = joinLibraryPath(path)
    await writeTextPath(joinNativePath(library.rootPath, relativePath), content)
    return localFileFromPath(library, relativePath, 'file')
  },

  async createFolder(library, path) {
    const relativePath = joinLibraryPath(path)
    await createDirectory(joinNativePath(library.rootPath, relativePath))
    return localFileFromPath(library, relativePath, 'folder')
  },

  async rename(file, library, newName) {
    const parentPath = file.path.split('/').slice(0, -1).join('/')
    const nextPath = joinLibraryPath(parentPath, newName)
    return this.move ? this.move(file, library, nextPath) : file
  },

  async move(file, library, newPath) {
    const nextPath = joinLibraryPath(newPath)
    await renamePath(joinNativePath(library.rootPath, file.path), joinNativePath(library.rootPath, nextPath))
    return {
      ...file,
      id: makeLibraryFileId(library.id, nextPath, file.type),
      path: nextPath,
      name: fileNameFromPath(nextPath),
      extension: file.type === 'file' ? fileExtension(fileNameFromPath(nextPath)) : undefined,
      updatedAt: new Date().toISOString(),
    }
  },

  async delete(file, library) {
    await deletePath(joinNativePath(library.rootPath, file.path))
  },

  async refresh() {
    return
  },

  async sync(_library, file) {
    const results: SyncResult[] = []
    if (file) {
      results.push({ status: 'synced', file: { ...file, status: 'synced' }, message: 'Local file is saved on disk' })
    }
    return results
  },
}
