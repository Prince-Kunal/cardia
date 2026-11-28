import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EngineError } from '../api/client';
import { useRoute } from '../lib/router';
import { endTour, goToStep, startTour, tourSeen, tourState, useTourOffer } from '../lib/tour';
import { HelpScreen } from '../screens/HelpScreen';
import { ImportScreen } from '../screens/ImportScreen';
import { fakeClient, renderInApp } from '../test/fakeApp';
import { Tour } from './Tour';

afterEach(() => {
  cleanup();
  act(endTour);
  window.location.hash = '';
  localStorage.clear();
});

/** The card with the real router, and the Import screen when the route is there. */
function App() {
  const route = useRoute();
  return (
    <>
      {route.name === 'import' && <ImportScreen />}
      {route.name === 'heart' && <section data-tour="numbers">numbers</section>}
      <Tour route={route} />
    </>
  );
}

const SCANS = ['206IS112mg.tif', '206IS127mg.tif', '206IS153mg.tif', '206IS89mg.tif'];

describe('the walkthrough', () => {
  it('starts from Help, loads the demo heart into the Import screen, and waits for Analyse', async () => {
    const demoScans = vi.fn().mockResolvedValue(SCANS.map((n) => new File([n], n, { type: 'image/tiff' })));
    // StrictMode, as in the app: the Import screen mounts twice, and the scans must reach the one that stays.
    renderInApp(
      <StrictMode>
        <HelpScreen />
        <App />
      </StrictMode>,
      fakeClient({ demoScans }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start the walkthrough' }));
    expect(await screen.findByRole('heading', { name: 'One heart, start to finish' })).toBeTruthy();
    expect(screen.getByText((_, el) => el?.textContent === 'Walkthrough · step 1 of 9')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Load the demo heart' }));
    expect(await screen.findByRole('heading', { name: 'Check the scans' })).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe('#/import'));
    expect(await screen.findByRole('heading', { name: 'Heart 206' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Analyse 4 slices' })).toBeTruthy();
    // This step waits for Analyse: no Next.
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('moves on when the app reaches the next screen, and jumps ahead when you get there first', async () => {
    window.location.hash = '#/import';
    act(() => goToStep('import'));
    renderInApp(<App />, fakeClient());
    expect(screen.getByRole('heading', { name: 'Check the scans' })).toBeTruthy();

    act(() => void (window.location.hash = '#/jobs/abc'));
    expect(await screen.findByRole('heading', { name: 'The analysis runs here' })).toBeTruthy();
    act(() => void (window.location.hash = '#/hearts/k1'));
    expect(await screen.findByRole('heading', { name: 'Three methods, three numbers' })).toBeTruthy();
    expect(document.querySelector('[data-tour="numbers"]')?.classList.contains('tour-target')).toBe(true);

    // Opening a slice early skips to the layers step; going back to the heart moves on to export.
    act(() => void (window.location.hash = '#/hearts/k1/slices/s1'));
    expect(await screen.findByRole('heading', { name: 'See what each method saw' })).toBeTruthy();
    act(() => void (window.location.hash = '#/hearts/k1'));
    expect(await screen.findByRole('heading', { name: 'Export' })).toBeTruthy();

    // Elsewhere, the card offers the way back.
    act(() => void (window.location.hash = '#/settings'));
    expect(await screen.findByText(/This step is on another screen/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go back to it' }).getAttribute('href')).toBe('#/hearts/k1');

    act(() => void (window.location.hash = '#/hearts/k1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'That’s the whole path' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(tourState()).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Walkthrough' })).toBeNull();
  });

  it('works without a demo heart, with your own scans', async () => {
    const demoScans = vi.fn().mockRejectedValue(new EngineError(404, 'No such demo heart in this build.'));
    act(startTour);
    renderInApp(<App />, fakeClient({ demoScans }));
    fireEvent.click(screen.getByRole('button', { name: 'Load the demo heart' }));
    expect(await screen.findByText(/built without the study scans/)).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe('#/import'));
  });

  it('keeps its place across a reload, folds away, and End stops it', () => {
    act(() => goToStep('report', '#/hearts/k1'));
    expect(JSON.parse(sessionStorage.getItem('cardia.tour') ?? 'null')).toMatchObject({ step: 4, where: '#/hearts/k1' });
    renderInApp(<App />, fakeClient());
    // Hide folds the card to its title and buttons, for a small screen.
    const text = screen.getByText(/The strip shows every slice/);
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(text.closest('[hidden]')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Apex to base, quality, context' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(text.closest('[hidden]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    expect(sessionStorage.getItem('cardia.tour')).toBeNull();
  });
});

/** The frame's part of it: the first-visit offer (as Layout calls it) and the card. */
function Frame({ connected = true }: { connected?: boolean }) {
  const route = useRoute();
  useTourOffer(route.name, connected);
  return <Tour route={route} />;
}

describe('the walkthrough on a first visit', () => {
  it('opens by itself the first time the lab opens, and never again', async () => {
    window.location.hash = '#/library';
    const first = renderInApp(<Frame />, fakeClient());
    const heading = await screen.findByRole('heading', { name: 'One heart, start to finish' });
    expect(screen.getByText(/This opens once\. Later, start it from Help/)).toBeTruthy();
    // Nobody asked for it, so it leaves the keyboard alone, and declining says "Not now".
    expect(document.activeElement).not.toBe(heading);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(tourState()).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Walkthrough' })).toBeNull();
    first.unmount();

    // The next visit: a new tab, the same browser.
    sessionStorage.clear();
    expect(tourSeen()).toBe(true);
    renderInApp(<Frame />, fakeClient());
    expect(screen.queryByRole('complementary', { name: 'Walkthrough' })).toBeNull();
  });

  it('waits for the lab and the engine: not in Learn, not in Help, not while disconnected', async () => {
    window.location.hash = '#/learn';
    const view = renderInApp(<Frame />, fakeClient());
    act(() => void (window.location.hash = '#/help'));
    expect(screen.queryByRole('complementary', { name: 'Walkthrough' })).toBeNull();
    view.unmount();

    window.location.hash = '#/library';
    renderInApp(<Frame connected={false} />, fakeClient()).unmount();
    expect(tourSeen()).toBe(false);

    renderInApp(<Frame />, fakeClient());
    expect(await screen.findByRole('heading', { name: 'One heart, start to finish' })).toBeTruthy();
  });

  it('counts a walkthrough started from Help as seen', () => {
    act(startTour);
    act(endTour);
    window.location.hash = '#/hearts/k1';
    renderInApp(<Frame />, fakeClient());
    expect(screen.queryByRole('complementary', { name: 'Walkthrough' })).toBeNull();
  });

  it('started by hand, it takes the keyboard and offers End', async () => {
    act(startTour);
    renderInApp(<Frame />, fakeClient());
    const heading = await screen.findByRole('heading', { name: 'One heart, start to finish' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByRole('button', { name: 'End' })).toBeTruthy();
    expect(screen.queryByText(/This opens once/)).toBeNull();
  });
});
