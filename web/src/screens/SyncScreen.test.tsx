import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SyncStatus } from '../api/types.gen';
import { fakeClient, renderInApp } from '../test/fakeApp';
import { SyncScreen } from './SyncScreen';

afterEach(cleanup);

const OFF: SyncStatus = {
  state: 'not_configured',
  backend: null,
  email: null,
  workspace: null,
  workspaces: [],
  read_only: false,
  pending: 0,
  last_sync_at: null,
  error: null,
  devices: [],
};
const PERSONAL = { id: 'w1', name: 'Personal', kind: 'personal' as const, role: 'owner' as const, upload_images: false };
const LAB = { id: 'w2', name: 'Lab', kind: 'lab' as const, role: 'viewer' as const, upload_images: true };
const ON: SyncStatus = {
  ...OFF,
  state: 'synced',
  backend: 'supabase',
  email: 'me@example.org',
  workspace: PERSONAL,
  workspaces: [PERSONAL, LAB],
  pending: 2,
  last_sync_at: '2026-11-24T08:00:00Z',
  devices: [{ id: 'd1', name: 'Lab iMac', app_version: '0.5.0', last_seen_at: '2026-11-24T08:00:00Z', this_device: true }],
};

describe('SyncScreen', () => {
  it('explains how to set sync up when the engine has no cloud', async () => {
    renderInApp(<SyncScreen />, fakeClient({ syncStatus: vi.fn().mockResolvedValue(OFF) }));
    expect(await screen.findByRole('heading', { name: 'Not set up on this computer' })).toBeTruthy();
    expect(screen.getByText('CARDIA_SUPABASE_URL')).toBeTruthy();
    expect(screen.getByText('--fake-cloud')).toBeTruthy();
  });

  it('signs in with what was typed', async () => {
    const syncSignIn = vi.fn().mockResolvedValue(ON);
    renderInApp(<SyncScreen />, fakeClient({ syncStatus: vi.fn().mockResolvedValue({ ...OFF, state: 'signed_out', backend: 'supabase' }), syncSignIn }));
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: ' me@example.org ' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret pass' } });
    fireEvent.click(screen.getByLabelText("I'm new: make an account"));
    fireEvent.click(screen.getByRole('button', { name: 'Make account and sign in' }));
    await vi.waitFor(() => expect(syncSignIn).toHaveBeenCalledWith('me@example.org', 'secret pass', true));
  });

  it('shows the workspace, what is still to send, and the computers, and switches workspace', async () => {
    const syncChooseWorkspace = vi.fn().mockResolvedValue({ ...ON, workspace: LAB, read_only: true });
    renderInApp(<SyncScreen />, fakeClient({ syncStatus: vi.fn().mockResolvedValue(ON), syncChooseWorkspace }));
    expect(await screen.findByRole('heading', { name: 'Signed in as me@example.org' })).toBeTruthy();
    expect(screen.getByText(/2 changes on this computer still to send/)).toBeTruthy();
    expect(screen.getByText('Lab iMac (this computer)')).toBeTruthy();
    expect(screen.getByText(/Lab · you are a viewer · original scans are uploaded too/)).toBeTruthy();
    expect(screen.getByText('Just you')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('radio')[1]);
    await vi.waitFor(() => expect(syncChooseWorkspace).toHaveBeenCalledWith('w2'));
  });
});
