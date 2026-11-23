// Turn what the user dropped or picked (files, folders, ZIP archives) into a flat list of files.

import { unzipSync } from 'fflate';
import { ACCEPTED, baseName, extension } from './filenames';

const MIME: Record<string, string> = {
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function hidden(path: string): boolean {
  return path.split('/').some((part) => part.startsWith('.') || part === '__MACOSX');
}

/** The scans inside a ZIP archive (other files and macOS metadata are skipped). */
export async function unzipScans(zip: File): Promise<File[]> {
  const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()), {
    filter: (f) => !hidden(f.name) && ACCEPTED.includes(extension(f.name)),
  });
  return Object.entries(entries)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, data]) => new File([data.slice().buffer], baseName(path), { type: MIME[extension(path)] }));
}

async function expand(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) {
    if (extension(f.name) === '.zip') out.push(...(await unzipScans(f)));
    else if (!hidden(f.name)) out.push(f);
  }
  return out;
}

function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => (entry as FileSystemFileEntry).file((f) => resolve([f]), () => resolve([])));
  }
  if (!entry.isDirectory || entry.name.startsWith('.')) return Promise.resolve([]);
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  return new Promise((resolve) => {
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries(
        async (batch) => {
          if (batch.length === 0) {
            const nested = await Promise.all(all.map(readEntry));
            resolve(nested.flat());
          } else {
            all.push(...batch);
            next();
          }
        },
        () => resolve([]),
      );
    next();
  });
}

/** Files from a drop: folders are walked, ZIP archives opened. */
export async function filesFromDrop(data: DataTransfer): Promise<File[]> {
  const entries = [...data.items]
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.() ?? null);
  if (entries.length > 0 && entries.every((e) => e !== null)) {
    const nested = await Promise.all(entries.map((e) => readEntry(e as FileSystemEntry)));
    return expand(nested.flat());
  }
  return expand([...data.files]);
}

/** Files from a file or folder picker. */
export function filesFromInput(list: FileList | null): Promise<File[]> {
  return expand(list ? [...list] : []);
}
