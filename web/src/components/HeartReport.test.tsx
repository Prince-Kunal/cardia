import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EngineError } from '../api/client';
import type { StudySet } from '../api/types.gen';
import { fakeClient, heart, renderInApp, summary } from '../test/fakeApp';
import { Context } from './HeartReport';

afterEach(cleanup);

const STUDY: StudySet = {
  pipeline_version: '0.3.0',
  models_manifest_sha256: 'abc123',
  hearts: [10, 20, 30, 40].map((v, i) => ({
    heart_id: String(100 + i),
    slices: 4,
    total_weight_mg: 400,
    method_a_dead_pct: v,
    method_b_dead_pct: v / 2,
    method_c_dead_pct: v / 4,
  })),
};

const measured = (a: number, b: number) =>
  heart('206', { summary: summary(a, b, { pipeline_version: '0.3.0', models_manifest_sha256: 'abc123', mock: false }, b / 2) });

describe('Context', () => {
  it('places a heart measured like the study set among the study hearts, headline method first', async () => {
    renderInApp(<Context heart={measured(35, 6)} />, fakeClient({ studySet: vi.fn().mockResolvedValue(STUDY) }), {
      headline_method: 'b',
    });
    expect(await screen.findByText('This heart 6.0%: higher than 1 of 4 study hearts (median 12.5%).')).toBeTruthy();
    expect(screen.getByText('This heart 35.0%: higher than 3 of 4 study hearts (median 25.0%).')).toBeTruthy();
    const rows = document.querySelectorAll('.context-row');
    expect(rows[0].textContent).toContain('Method B');
    expect(rows[1].textContent).toContain('Method A');
    expect(rows[2].textContent).toContain('Method C');
    expect(screen.getAllByRole('img', { name: /^Study heart 100/ })).toHaveLength(3);
    fireEvent.click(screen.getByText('The study hearts as a table'));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(5);
  });

  it('compares a heart that is one of the study hearts with the others only', async () => {
    const self = { ...measured(30, 15), label: '102' };
    renderInApp(<Context heart={self} />, fakeClient({ studySet: vi.fn().mockResolvedValue(STUDY) }));
    expect(await screen.findByText(/This heart is one of them/)).toBeTruthy();
    expect(screen.getByText('This heart 30.0%: higher than 2 of 3 study hearts (median 20.0%).')).toBeTruthy();
    expect(screen.queryAllByRole('img', { name: /^Study heart 102/ })).toHaveLength(0);
  });

  it('does not compare hearts measured another way, and says why', async () => {
    renderInApp(<Context heart={heart('206')} />, fakeClient({ studySet: vi.fn().mockResolvedValue(STUDY) }));
    expect(await screen.findByText(/this heart has demo \(--mock\) results/)).toBeTruthy();
    expect(document.querySelector('.context-row')).toBeNull();
  });

  it('shows nothing when the engine has no study set', async () => {
    const studySet = vi.fn().mockRejectedValue(new EngineError(404, 'No such study set in this build.'));
    const { container } = renderInApp(<Context heart={measured(35, 5)} />, fakeClient({ studySet }));
    await vi.waitFor(() => expect(studySet).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe('');
  });
});
