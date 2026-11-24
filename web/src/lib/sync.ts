// Cloud sync's states in words and badge tones (the Cloud sync screen and the header badge).

import type { SyncStatus } from '../api/types.gen';

export const SYNC_LABEL: Record<SyncStatus['state'], string> = {
  not_configured: 'Not set up',
  signed_out: 'Signed out',
  syncing: 'Syncing…',
  synced: 'Synced',
  offline: 'Offline',
  error: 'Sync problem',
};

export const SYNC_TONE: Record<SyncStatus['state'], string> = {
  not_configured: '',
  signed_out: '',
  syncing: 'info',
  synced: 'ok',
  offline: 'warn',
  error: 'error',
};

/** Signed in: the states in which the header shows a badge. */
export const signedIn = (s: SyncStatus | undefined): s is SyncStatus => !!s && s.state !== 'not_configured' && s.state !== 'signed_out';
