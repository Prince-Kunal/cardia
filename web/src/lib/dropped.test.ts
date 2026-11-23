import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { filesFromInput, unzipScans } from './dropped';

const bytes = (s: string) => new TextEncoder().encode(s);

function zipFile(entries: Record<string, string>): File {
  const data = zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, bytes(v)])));
  return new File([data.slice().buffer], 'scans.zip', { type: 'application/zip' });
}

describe('dropped files', () => {
  it('takes only the scans out of a ZIP, sorted, without folders or macOS metadata', async () => {
    const zip = zipFile({
      'heart 206/206IS89mg.tif': 'a',
      'heart 206/206IS80mg.TIFF': 'b',
      '__MACOSX/heart 206/._206IS89mg.tif': 'junk',
      'heart 206/.DS_Store': 'junk',
      'heart 206/readme.txt': 'text',
      'other/slice.png': 'c',
    });
    const files = await unzipScans(zip);
    expect(files.map((f) => f.name)).toEqual(['206IS80mg.TIFF', '206IS89mg.tif', 'slice.png']);
    expect(files[2].type).toBe('image/png');
    expect(await files[1].text()).toBe('a');
  });

  it('opens ZIPs picked with the file picker and keeps other files as they are', async () => {
    const list = [zipFile({ 'a.tif': 'a' }), new File(['b'], 'b.tif'), new File(['c'], '.hidden.tif')];
    const files = await filesFromInput(list as unknown as FileList);
    expect(files.map((f) => f.name)).toEqual(['a.tif', 'b.tif']);
  });
});
