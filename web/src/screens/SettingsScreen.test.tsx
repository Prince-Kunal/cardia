import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeClient, renderInApp } from '../test/fakeApp';
import { SettingsScreen } from './SettingsScreen';

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.look;
});

describe('Settings, Look', () => {
  it('switches the style of the whole app, in this browser only', () => {
    renderInApp(<SettingsScreen />, fakeClient());
    const notebook = screen.getByRole('radio', { name: /Lab notebook/ }) as HTMLInputElement;
    const stain = screen.getByRole('radio', { name: /Living Stain/ }) as HTMLInputElement;
    expect(stain.checked).toBe(true);

    fireEvent.click(notebook);
    expect(notebook.checked).toBe(true);
    expect(document.documentElement.dataset.look).toBe('notebook');
    expect(localStorage.getItem('cardia.look')).toBe('notebook');
  });
});
