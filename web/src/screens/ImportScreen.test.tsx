import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, heart, renderInApp } from '../test/fakeApp';
import { ImportScreen } from './ImportScreen';

afterEach(cleanup);

function pick(container: HTMLElement, files: File[]) {
  const input = container.querySelector('input[type=file][accept]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
}

describe('ImportScreen', () => {
  it('groups scans by heart, flags what it skips, and sends what the user typed', async () => {
    const createJob = vi.fn().mockResolvedValue({ job_id: 'job1' });
    const client = fakeClient({ createJob, listHearts: vi.fn().mockResolvedValue([heart('206')]) });
    const { container } = renderInApp(<ImportScreen />, client);

    pick(container, [
      new File(['one'], '206IS89mg.tif'),
      new File(['two'], '206IS90mg.tif'),
      new File(['one'], 'copy of 206IS89mg.tif'),
      new File(['png'], 'unnamed.png'),
      new File(['txt'], 'notes.txt'),
    ]);

    await screen.findByRole('heading', { name: 'Heart 206' });
    // Duplicates are found by content once the files are hashed.
    expect(await screen.findByText('Same image as 206IS89mg.tif')).toBeTruthy();
    expect(screen.getByText('Adds to heart 206 in the library')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Heart unnamed' })).toBeTruthy();
    expect(screen.getByText('Not a scan type Cardia reads')).toBeTruthy();
    expect(screen.getByText('Not TIFF: unvalidated')).toBeTruthy();

    // The PNG's name has no heart ID or weight, so those are typed.
    fireEvent.change(screen.getByLabelText('Heart ID for unnamed.png'), { target: { value: '206' } });
    const weight = screen.getByLabelText('Weight in mg for unnamed.png');
    fireEvent.change(weight, { target: { value: 'abc' } });
    const analyse = screen.getByRole('button', { name: 'Analyse 3 slices' }) as HTMLButtonElement;
    expect(analyse.disabled).toBe(true);
    fireEvent.change(weight, { target: { value: '81,5' } });
    expect(analyse.disabled).toBe(false);
    expect(screen.queryByRole('heading', { name: 'Heart unnamed' })).toBeNull();

    fireEvent.click(analyse);
    await waitFor(() => expect(createJob).toHaveBeenCalledOnce());
    const [files, meta] = createJob.mock.calls[0];
    expect((files as File[]).map((f) => f.name)).toEqual(['206IS89mg.tif', '206IS90mg.tif', 'unnamed.png']);
    expect(meta).toEqual([{}, {}, { heart_id: '206', weight_mg: 81.5 }]);
    await waitFor(() => expect(window.location.hash).toBe('#/jobs/job1'));
  });

  it('sends no meta when the file names say everything', async () => {
    const createJob = vi.fn().mockResolvedValue({ job_id: 'job2' });
    const { container } = renderInApp(<ImportScreen />, fakeClient({ createJob }));
    pick(container, [new File(['a'], '311IS120mg.tif')]);
    fireEvent.click(await screen.findByRole('button', { name: 'Analyse 1 slice' }));
    await waitFor(() => expect(createJob).toHaveBeenCalledWith([expect.any(File)], undefined));
  });
});
