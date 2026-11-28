// The walkthrough's card (lib/tour.ts). It follows you between screens, says what to look at, outlines
// that part of the screen, and moves on when you do what it says. It never blocks the screen: everything
// stays clickable, and End stops it at any step.

import { type RefObject, useContext, useEffect, useRef, useState } from 'react';
import { EngineError } from '../api/client';
import { type Route, href, navigate } from '../lib/router';
import { scrollPageTo } from '../lib/scroll';
import { TOUR, endTour, goToStep, nextStep, previousStep, rememberWhere, stageFiles, useTour } from '../lib/tour';
import { AppContext } from '../state';

/** The part of a box that another covers, 0 to 1. */
function covered(target: DOMRect, card: { left: number; top: number; width: number; height: number }): number {
  const x = Math.max(0, Math.min(target.right, card.left + card.width) - Math.max(target.left, card.left));
  const y = Math.max(0, Math.min(target.bottom, card.top + card.height) - Math.max(target.top, card.top));
  return target.width * target.height > 0 ? (x * y) / (target.width * target.height) : 0;
}

/** Put the card in the bottom corner, or the top one when that covers less of what it points at. */
function place(card: HTMLElement, target: Element | null) {
  const c = card.getBoundingClientRect();
  const margin = 16;
  const header = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
  const bottom = { left: c.left, top: window.innerHeight - margin - c.height, width: c.width, height: c.height };
  const top = { ...bottom, top: header + margin };
  const t = target?.getBoundingClientRect();
  const up = !!t && covered(t, top) < covered(t, bottom);
  card.dataset.place = up ? 'top' : 'bottom';
  card.style.top = up ? `${top.top}px` : '';
}

/** Outline the first of the step's targets that is on the screen, scroll it into view once, and keep the
 * card out of its way. */
function useHighlight(targets: string[] | undefined, active: boolean, card: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let shown: Element | null = null;
    let shownAt = 0;
    let scrolledAt = 0;
    const find = () => {
      const el = active ? (targets?.map((t) => document.querySelector(`[data-tour="${t}"]`)).find((e) => e) ?? null) : null;
      if (el !== shown) {
        shown?.classList.remove('tour-target');
        shown = el;
        if (el instanceof HTMLElement) {
          el.classList.add('tour-target');
          scrollPageTo(el, { smooth: true });
          shownAt = scrolledAt = Date.now();
        }
      } else if (el instanceof HTMLElement && Date.now() - shownAt < 4000 && Date.now() - scrolledAt > 900) {
        // The page can grow under a scroll as its images and data arrive; for a few seconds, try again
        // if the target ended up out of sight. After that, scrolling is yours.
        const r = el.getBoundingClientRect();
        if (r.top > window.innerHeight - 80 || r.bottom < 80) {
          scrollPageTo(el, { smooth: true });
          scrolledAt = Date.now();
        }
      }
      if (card.current) place(card.current, shown);
    };
    find();
    // Targets appear as data loads (a finished job's "Open heart" button) and move as the page scrolls.
    const timer = window.setInterval(find, 300);
    return () => {
      window.clearInterval(timer);
      shown?.classList.remove('tour-target');
    };
  }, [targets, active, card]);
}

export function Tour({ route }: { route: Route }) {
  const app = useContext(AppContext);
  const tour = useTour();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  // Folded down to its title and buttons, for a small screen; it stays folded from step to step.
  const [folded, setFolded] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const card = useRef<HTMLElement>(null);
  const step = tour ? TOUR[tour.step] : undefined;
  const here = !!step && (step.on.length === 0 || step.on.includes(route.name));

  // Move on when the app reaches the next screen, whichever way you got there.
  useEffect(() => {
    if (!tour || !step) return;
    if (step.advanceOn === route.name) return nextStep();
    if (here) return rememberWhere(window.location.hash);
    if (step.waits) return;
    const later = TOUR.findIndex((s, i) => i > tour.step && s.on.includes(route.name));
    if (later >= 0) goToStep(TOUR[later].id);
  }, [route.name, tour, step, here]);

  // Starting the walkthrough puts the keyboard on its card. When the app offers it on a first visit,
  // nobody asked for it, so the keyboard stays where it is (the status line below still announces it).
  const starting = tour?.step === 0 && !tour.offered;
  useEffect(() => {
    if (starting) heading.current?.focus();
  }, [starting]);

  useHighlight(step?.target, here, card);

  if (!tour || !step || !app) return null;
  const n = tour.step + 1;
  const last = n === TOUR.length;
  // The first-visit offer: a card nobody asked for says how to decline it and where it waits.
  const offer = step.id === 'welcome' && !!tour.offered;

  async function loadDemo() {
    if (!app) return;
    setLoading(true);
    setError(undefined);
    try {
      stageFiles(await app.client.demoScans());
      goToStep('import', href({ name: 'import' }));
    } catch (e) {
      if (!(e instanceof EngineError && e.status === 404)) {
        setError(`Could not load the demo heart: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      goToStep('import', href({ name: 'import' }), { noDemo: true });
    } finally {
      setLoading(false);
    }
    navigate({ name: 'import' });
  }

  function next() {
    if (step?.id === 'slices') {
      const first = document.querySelector<HTMLAnchorElement>('[data-tour="slices"] a[href*="/slices/"]');
      if (first) return first.click();
    }
    if (step?.id === 'layers') {
      // Back to the heart's report, where the next step is.
      if (route.name === 'slice' && route.heart) return navigate({ name: 'heart', key: route.heart });
      return window.history.back();
    }
    nextStep();
  }

  const body = step.id === 'import' && tour.noDemo ? NO_DEMO : step.body;

  return (
    <aside ref={card} className="tour-card no-print" aria-label="Walkthrough" data-place="bottom">
      <div className="tour-head">
        <span className="fine">
          <span className="tour-name">Walkthrough · </span>step {n} of {TOUR.length}
        </span>
        <div className="tour-head-actions">
          <button
            type="button"
            className="button ghost small"
            aria-expanded={!folded}
            aria-controls="tour-body"
            onClick={() => setFolded((f) => !f)}
          >
            {folded ? 'Show' : 'Hide'}
          </button>
          <button type="button" className="button ghost small" onClick={endTour}>
            {offer ? 'Not now' : 'End'}
          </button>
        </div>
      </div>
      <div className="tour-progress" aria-hidden="true">
        <span style={{ width: `${(100 * n) / TOUR.length}%` }} />
      </div>
      <h2 id="tour-title" ref={heading} tabIndex={-1}>
        {step.title}
      </h2>
      <div id="tour-body" hidden={folded}>
        <p>{body}</p>
        {offer && <p className="fine">New here? This opens once. Later, start it from Help whenever you like.</p>}
      </div>
      {!here && (
        <p className="note info">
          This step is on another screen.{' '}
          {tour.where && (
            <a href={tour.where} className="tour-back-link">
              Go back to it
            </a>
          )}
        </p>
      )}
      {error && <p className="note error">{error}</p>}
      <div className="row">
        {tour.step > 0 && !last && (
          <button type="button" className="button small" onClick={previousStep}>
            Back
          </button>
        )}
        {step.id === 'welcome' ? (
          <button type="button" className="button primary small" disabled={loading} onClick={() => void loadDemo()}>
            {loading ? 'Loading the scans…' : 'Load the demo heart'}
          </button>
        ) : last ? (
          <button type="button" className="button primary small" onClick={endTour}>
            Finish
          </button>
        ) : (
          !step.waits &&
          here && (
            <button type="button" className="button primary small" onClick={next}>
              Next
            </button>
          )
        )}
      </div>
      <p className="sr-only" role="status">
        Walkthrough step {n} of {TOUR.length}: {step.title}
      </p>
    </aside>
  );
}

const NO_DEMO =
  'This engine was built without the study scans, so there is no demo heart. Drop scans of your own here to follow along, then press Analyse.';
