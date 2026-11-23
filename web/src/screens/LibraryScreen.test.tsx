import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, heart, renderInApp } from '../test/fakeApp';
import { LibraryScreen } from './LibraryScreen';

afterEach(cleanup);

describe('LibraryScreen', () => {
  it('lists hearts with the headline method first and only the ranges that are shown', async () => {
    const hearts = [heart('206', { group: 'treatment', tags: ['pilot'], favourite: true }), heart('311')];
    renderInApp(<LibraryScreen />, fakeClient({ listHearts: vi.fn().mockResolvedValue(hearts) }), { headline_method: 'b' });

    const table = await screen.findByRole('table');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent);
    expect(headers.indexOf('Method B dead')).toBeLessThan(headers.indexOf('Method A dead'));
    expect(within(table).getByText('Heart 206')).toBeTruthy();
    expect(within(table).getAllByText('20.0%')).toHaveLength(2);
    // Method B's range is shown; Method A's is not (PLAN.md §2g).
    expect(within(table).getAllByText('17.0–23.0%')).toHaveLength(2);
    expect(within(table).queryByText('28.0–32.0%')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove heart 206 from favourites' })).toBeTruthy();
    expect(screen.getByText('2 hearts analysed on this computer.')).toBeTruthy();
  });

  it('invites a first analysis when the library is empty', async () => {
    renderInApp(<LibraryScreen />, fakeClient());
    expect(await screen.findByRole('heading', { name: 'No hearts yet' })).toBeTruthy();
  });
});
