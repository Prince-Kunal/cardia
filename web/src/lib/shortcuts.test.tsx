import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HelpScreen } from '../screens/HelpScreen';
import { useShortcuts } from './shortcuts';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function Keys() {
  useShortcuts();
  return <input aria-label="Search" />;
}

describe('keyboard shortcuts', () => {
  it('move between screens on a single key, but never while typing or with a modifier', () => {
    render(<Keys />);
    fireEvent.keyDown(window, { key: 'n' });
    expect(window.location.hash).toBe('#/import');
    fireEvent.keyDown(window, { key: '?' });
    expect(window.location.hash).toBe('#/help');
    fireEvent.keyDown(window, { key: 'l', ctrlKey: true });
    expect(window.location.hash).toBe('#/help');
    fireEvent.keyDown(screen.getByLabelText('Search'), { key: 'l' });
    expect(window.location.hash).toBe('#/help');
  });

  it('are listed on the Help page, which works without the engine', () => {
    render(<HelpScreen />);
    expect(screen.getByRole('heading', { name: 'Why was my slice flagged?' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeTruthy();
    expect(screen.getAllByText('New analysis').length).toBeGreaterThan(0);
    expect(screen.getByText(/A research tool for guinea pig hearts in the lab/)).toBeTruthy();
  });
});
