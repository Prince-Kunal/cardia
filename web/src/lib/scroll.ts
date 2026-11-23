// Page scrolling: Lenis smooth scrolling (PLAN.md §11a, A1), and the jumps the app makes itself.
// Lenis is off under reduced motion, whether the computer asks for it or Settings does
// (data-motion="reduced" on <html>), and then the page scrolls natively. Boxes that scroll on their own
// (a wide table, the slice strip, a text area) keep their own scrolling, and Ctrl + wheel (the layer
// viewer's zoom) is left alone. Mark anything else that takes the wheel with data-lenis-prevent.

import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

let lenis: Lenis | null = null;

function reducedMotion(): boolean {
  return (
    document.documentElement.dataset.motion === 'reduced' ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}

function sync() {
  const wanted = !reducedMotion();
  if (wanted && !lenis) lenis = new Lenis({ autoRaf: true, allowNestedScroll: true, lerp: 0.14 });
  else if (!wanted && lenis) {
    lenis.destroy();
    lenis = null;
  }
}

/** The fixed header's height, so a jump never hides its target under it. */
function headerOffset(): number {
  return (document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0) + 16;
}

/** Scroll the page to the top or to an element: at once, or smoothly unless motion is reduced. */
export function scrollPageTo(target: number | HTMLElement, { smooth = false } = {}): void {
  const offset = typeof target === 'number' ? 0 : -headerOffset();
  if (lenis) {
    lenis.scrollTo(target, { offset, immediate: !smooth, force: true });
    return;
  }
  const top = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY + offset;
  window.scrollTo({ top, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
}

let forward = false;

/** True once after the user followed a link inside the app (not Back or Forward): a new page starts at the top. */
export function takeForwardNavigation(): boolean {
  const was = forward;
  forward = false;
  return was;
}

/** Called by navigate(): moving on from code counts as following a link. */
export function markForwardNavigation(): void {
  forward = true;
}

/** Start smooth scrolling and keep it in step with reduced motion. Returns a function that stops it all. */
export function startScrolling(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  sync();
  const query = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  query?.addEventListener('change', sync);
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  // A plain click on an in-app link (one its own handler did not cancel) is a forward navigation.
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = e.target instanceof Element ? e.target.closest('a[href^="#/"]') : null;
    if (link && !link.hasAttribute('target')) forward = true;
  };
  window.addEventListener('click', onClick);
  return () => {
    query?.removeEventListener('change', sync);
    observer.disconnect();
    window.removeEventListener('click', onClick);
    lenis?.destroy();
    lenis = null;
  };
}
