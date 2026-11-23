import { describe, expect, it } from 'vitest';
import { baseName, checkFiles, extension, groupByHeart, parseSliceName, stem, typedWeight } from './filenames';

const file = (name: string, body = name) => new File([body], name);

describe('slice file names', () => {
  it('reads the heart ID and weight from names like 206IS89mg.tif', () => {
    expect(parseSliceName('206IS89mg.tif')).toEqual({ heartId: '206', weightMg: 89, matched: true });
    expect(parseSliceName('scans/109IS151.5mg_2.TIFF')).toEqual({ heartId: '109', weightMg: 151.5, matched: true });
    expect(parseSliceName('206is89MG.tif').matched).toBe(true);
  });

  it('falls back to the name without its extension', () => {
    expect(parseSliceName('slice one.png')).toEqual({ heartId: 'slice one', weightMg: null, matched: false });
  });

  it('splits names and extensions on either kind of slash', () => {
    expect(baseName('a/b\\c.TIF')).toBe('c.TIF');
    expect(extension('a/b/C.TiF')).toBe('.tif');
    expect(extension('.hidden')).toBe('');
    expect(stem('dir/206IS89mg.tif')).toBe('206IS89mg');
  });
});

describe('checkFiles', () => {
  it('sorts files into TIFF, unvalidated, unsupported and duplicates', () => {
    const files = [file('206IS89mg.tif'), file('206IS90mg.png'), file('notes.txt'), file('copy.tif')];
    const checked = checkFiles(files, ['aaa', 'bbb', undefined, 'aaa']);
    expect(checked.map((c) => c.check)).toEqual(['ok', 'unvalidated', 'unsupported', 'duplicate']);
    expect(checked[3].duplicateOf).toBe('206IS89mg.tif');
  });

  it('groups the files that will be analysed by heart, in first-seen order', () => {
    const files = [file('311IS1mg.tif'), file('206IS2mg.tif'), file('x.txt'), file('311IS3mg.tif')];
    const groups = groupByHeart(checkFiles(files), (c) => c.parsed.heartId);
    expect(groups.map((g) => [g.heartId, g.slices.length])).toEqual([
      ['311', 2],
      ['206', 1],
    ]);
  });
});

describe('typedWeight', () => {
  it('reads positive numbers, with a comma or a point', () => {
    expect(typedWeight('89')).toBe(89);
    expect(typedWeight(' 89,5 ')).toBe(89.5);
  });

  it('is undefined for an empty box and NaN for anything else', () => {
    expect(typedWeight(undefined)).toBeUndefined();
    expect(typedWeight('  ')).toBeUndefined();
    expect(typedWeight('0')).toBeNaN();
    expect(typedWeight('-3')).toBeNaN();
    expect(typedWeight('heavy')).toBeNaN();
  });
});
