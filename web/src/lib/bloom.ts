// The stain bloom on buttons: the hover colour spreads from where the pointer entered, like TTC turning
// red where it meets a living cell. One delegated listener sets --mx and --my on the button under the
// pointer; the CSS (.button::before in index.css) does the rest, and reduced motion stops it there.

const SELECTOR = '.button, .bloom';

export function startBloom(): void {
  const place = (e: PointerEvent) => {
    const target = (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
    if (!target) return;
    const r = target.getBoundingClientRect();
    target.style.setProperty('--mx', `${e.clientX - r.left}px`);
    target.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  document.addEventListener('pointerover', place, { passive: true });
  document.addEventListener('pointerdown', place, { passive: true });
}
