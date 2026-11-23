// Slice file names and the checks the Import screen makes before anything is sent (PLAN.md §1a).
// The pattern is the engine's (ttc_pipeline/read.py, parse_name), so both read a name the same way.

const NAME_INFO = /(\d{3})IS([\d.]+)mg/i;
export const ACCEPTED = ['.tif', '.tiff', '.png', '.jpg', '.jpeg'];
const TIFF = ['.tif', '.tiff'];

export interface ParsedName {
  /** Heart ID from the name, or the name without its extension when it doesn't follow the pattern. */
  heartId: string;
  weightMg: number | null;
  /** The name followed the `206IS89mg` pattern. */
  matched: boolean;
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function extension(name: string): string {
  const base = baseName(name);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

export function stem(name: string): string {
  const base = baseName(name);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

export function parseSliceName(name: string): ParsedName {
  const m = NAME_INFO.exec(baseName(name));
  if (!m) return { heartId: stem(name), weightMg: null, matched: false };
  const weight = Number(m[2]);
  return { heartId: m[1], weightMg: Number.isFinite(weight) && m[2] !== '.' ? weight : null, matched: true };
}

export type FileCheck = 'ok' | 'unvalidated' | 'unsupported' | 'duplicate';

export interface Candidate {
  /** Position in the list the user dropped. */
  index: number;
  file: File;
  name: string;
  parsed: ParsedName;
  check: FileCheck;
  /** For duplicates: the file with the same content. */
  duplicateOf?: string;
  sha256?: string;
}

/** Sort dropped files into candidates: unsupported types, non-TIFF (analysed but flagged), duplicates by content. */
export function checkFiles(files: File[], hashes: (string | undefined)[] = []): Candidate[] {
  const seen = new Map<string, string>();
  return files.map((file, index) => {
    const name = baseName(file.name);
    const ext = extension(name);
    const sha256 = hashes[index];
    let check: FileCheck = !ACCEPTED.includes(ext) ? 'unsupported' : TIFF.includes(ext) ? 'ok' : 'unvalidated';
    let duplicateOf: string | undefined;
    if (check !== 'unsupported' && sha256) {
      const first = seen.get(sha256);
      if (first !== undefined) {
        check = 'duplicate';
        duplicateOf = first;
      } else {
        seen.set(sha256, name);
      }
    }
    return { index, file, name, parsed: parseSliceName(name), check, duplicateOf, sha256 };
  });
}

export interface HeartGroup {
  heartId: string;
  slices: Candidate[];
}

/** Group the files that will be analysed by heart ID, in the order the hearts first appear. */
export function groupByHeart(candidates: Candidate[], heartIdOf: (c: Candidate) => string): HeartGroup[] {
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (c.check === 'unsupported' || c.check === 'duplicate') continue;
    const id = heartIdOf(c);
    groups.set(id, [...(groups.get(id) ?? []), c]);
  }
  return [...groups].map(([heartId, slices]) => ({ heartId, slices }));
}

export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
