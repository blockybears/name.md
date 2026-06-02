import { invoke } from '@tauri-apps/api/core'

export type NativeDirectoryEntry = {
  path: string
  name: string
  isDir: boolean
  extension?: string
}

export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function isUriPath(path: string) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(path)
}

export async function readTextPath(path: string) {
  if (!isUriPath(path)) {
    return invoke<string>('read_text_file', { path })
  }

  const payload = await invoke<ArrayBuffer | number[]>('plugin:fs|read_text_file', {
    path,
    options: {},
  })
  const bytes = payload instanceof ArrayBuffer ? new Uint8Array(payload) : Uint8Array.from(payload)

  return new TextDecoder('utf-8').decode(bytes)
}

export async function writeTextPath(path: string, content: string) {
  if (!isUriPath(path)) {
    await invoke('write_text_file', { path, content })
    return
  }

  await invoke('plugin:fs|write_text_file', new TextEncoder().encode(content), {
    headers: {
      path: encodeURIComponent(path),
      options: JSON.stringify({}),
    },
  })
}

export async function listDirectory(path: string) {
  return invoke<NativeDirectoryEntry[]>('list_directory', { path })
}

export async function createDirectory(path: string) {
  return invoke('create_directory', { path })
}

export async function renamePath(from: string, to: string) {
  return invoke('rename_path', { from, to })
}

export async function deletePath(path: string) {
  return invoke('delete_path', { path })
}
