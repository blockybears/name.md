import type { Library, LibraryFile } from './types'

export type SaveSyncState =
  | 'unsaved_unsynced'
  | 'saved_unsynced'
  | 'saved_synced'
  | 'syncing'
  | 'conflict'
  | 'offline'
  | 'sync_failed'

export function saveSyncStateLabel(state: SaveSyncState, provider?: Library['provider']) {
  switch (state) {
    case 'unsaved_unsynced':
      return 'Unsaved changes'
    case 'saved_unsynced':
      return 'Saved locally · Unsynced'
    case 'saved_synced':
      return provider === 'local' ? 'Saved locally' : 'Synced'
    case 'syncing':
      return 'Syncing...'
    case 'conflict':
      return 'Conflict'
    case 'offline':
      return 'Offline'
    case 'sync_failed':
      return 'Sync failed'
  }
}

export function compactSaveSyncStateLabel(state: SaveSyncState, provider?: Library['provider']) {
  switch (state) {
    case 'unsaved_unsynced':
      return 'Unsaved'
    case 'saved_unsynced':
      return 'Unsynced'
    case 'saved_synced':
      return provider === 'local' ? 'Saved' : 'Synced'
    case 'syncing':
      return 'Syncing'
    case 'conflict':
      return 'Conflict'
    case 'offline':
      return 'Offline'
    case 'sync_failed':
      return 'Failed'
  }
}

export function saveSyncStateFromFileStatus(status: LibraryFile['status']): SaveSyncState {
  switch (status) {
    case 'synced':
      return 'saved_synced'
    case 'dirty':
    case 'pendingUpload':
    case 'remoteChanged':
      return 'saved_unsynced'
    case 'conflict':
      return 'conflict'
  }
}
