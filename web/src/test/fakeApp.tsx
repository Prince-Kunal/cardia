// A connected app around a screen, with a fake engine client, for screen tests.

import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import type { EngineClient } from '../api/client';
import type { AppSettings, EngineInfo, Heart, HeartSummary } from '../api/types.gen';
import { AppContext, type AppState } from '../state';

export const INFO: EngineInfo = {
  api_version: '0.2.0',
  pipeline_version: 'mock',
  mock: true,
  models_manifest_sha256: null,
  models: [],
  methods: [
    { key: 'a', name: 'Method A: K-Means + RF', dead_rule: 'p ≥ 0.5', unsure_rule: 'unsure: 0.35 < p < 0.65', range_shown: false },
    { key: 'b', name: 'Method B: stain ratio', dead_rule: 'stain log(R/G) < 0.309 and tint < 35.5°', unsure_rule: 'borderline: between 40% and 60% of the living stain', range_shown: true },
  ],
  layers: [],
  accepted_extensions: ['.tif', '.tiff', '.png', '.jpg', '.jpeg'],
  max_upload_mb: 200,
  workers: 2,
};

export const SETTINGS: AppSettings = {
  headline_method: 'a',
  theme: 'system',
  language: 'en',
  report_language: 'en',
  reduced_motion: false,
  watch_folder: null,
  watch_enabled: false,
};

export function summary(a: number, b: number, extra: Partial<HeartSummary> = {}): HeartSummary {
  return {
    heart_id: '206',
    slice_ids: [],
    weighting: 'slice_weight',
    total_weight_mg: 300,
    flags: [],
    pipeline_version: 'mock',
    models_manifest_sha256: null,
    mock: true,
    method_a: { dead_pct: a, dead_mg: a * 3, unsure_pct: 1, range: { low_pct: a - 2, high_pct: a + 2, shown: false } },
    method_b: { dead_pct: b, dead_mg: b * 3, borderline_pct: 2, range: { low_pct: b - 3, high_pct: b + 3, shown: true } },
    ...extra,
  };
}

export function heart(label: string, extra: Partial<Heart> = {}): Heart {
  return {
    label,
    group: null,
    ischemia_min: null,
    reperfusion_min: null,
    experiment_date: null,
    operator: null,
    heart_weight_mg: null,
    notes: null,
    tags: [],
    favourite: false,
    heart_key: `key-${label}`,
    created_at: '2026-11-23T10:00:00Z',
    updated_at: '2026-11-23T10:00:00Z',
    deleted_at: null,
    purge_after: null,
    slices: [],
    summary: summary(30, 20),
    ...extra,
  };
}

/** A fake client: every method is a mock; pass the ones a test needs. */
export function fakeClient(methods: Partial<Record<keyof EngineClient, unknown>> = {}): EngineClient {
  return {
    connection: { url: 'http://127.0.0.1:8765', token: 't' },
    listHearts: vi.fn().mockResolvedValue([]),
    listJobs: vi.fn().mockResolvedValue([]),
    watchStatus: vi.fn().mockResolvedValue({ state: 'off', folder: null, last_scan_at: null, files_imported: 0, last_job_id: null }),
    ...methods,
  } as unknown as EngineClient;
}

export function renderInApp(ui: ReactNode, client: EngineClient, settings: Partial<AppSettings> = {}) {
  const state: AppState = {
    client,
    info: INFO,
    settings: { ...SETTINGS, ...settings },
    saveSettings: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  };
  return render(<AppContext.Provider value={state}>{ui}</AppContext.Provider>);
}
