import { githubLibraryProvider } from './githubProvider'
import { localLibraryProvider } from './localProvider'
import type { Library, LibraryProvider } from './types'

export function getLibraryProvider(library: Library): LibraryProvider {
  return library.provider === 'github' ? githubLibraryProvider : localLibraryProvider
}
