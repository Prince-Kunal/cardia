import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, setLook, startLook } from './look';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.look;
});

describe('the look', () => {
  it('is the Living Stain until a browser chooses otherwise', () => {
    expect(DEFAULT_LOOK).toBe('stain');
    startLook();
    expect(document.documentElement.dataset.look).toBe('stain');
  });

  it('keeps the choice in this browser and puts it on the page', () => {
    setLook('notebook');
    expect(document.documentElement.dataset.look).toBe('notebook');
    expect(localStorage.getItem('cardia.look')).toBe('notebook');
    delete document.documentElement.dataset.look;
    startLook(); // the next visit
    expect(document.documentElement.dataset.look).toBe('notebook');
  });

  it('ignores a stored value it does not know', () => {
    localStorage.setItem('cardia.look', 'neon');
    startLook();
    expect(document.documentElement.dataset.look).toBe(DEFAULT_LOOK);
  });
});
