// Small things for people who use Cardia every day. None of them changes a number, takes the keyboard
// or gets in the way, and reduced motion keeps them still. They are not in Help on purpose; the team's
// list is in PLAN.md §1j.
//
// This file sets words on <html data-egg="…">; the CSS (looks/notebook.css, and index.css for both
// looks) does the rest:
// - "pig", typed anywhere outside a field: a guinea pig, the study's species, trots along the header's
//   trace (components/Cavia.tsx). The words avoid the single-key shortcuts (l, n, c, r, ?).
// - 29 September, World Heart Day: the mark beats once and the trace runs in stain red all day.
// CSS only, in the lab notebook look: the mark is drawn unstained and stains like a TTC slice when the
// pointer rests on it; selected text takes the stain; every page ends on a notebook's witness line.

const WORDS: Record<string, { egg: string; ms: number }> = {
  pig: { egg: 'pig', ms: 6000 },
};
const LONGEST = Math.max(...Object.keys(WORDS).map((w) => w.length));

function add(egg: string): void {
  const root = document.documentElement;
  const eggs = new Set((root.dataset.egg ?? '').split(' ').filter(Boolean));
  eggs.add(egg);
  root.dataset.egg = [...eggs].join(' ');
}

function remove(egg: string): void {
  const root = document.documentElement;
  const eggs = new Set((root.dataset.egg ?? '').split(' ').filter(Boolean));
  eggs.delete(egg);
  if (eggs.size) root.dataset.egg = [...eggs].join(' ');
  else delete root.dataset.egg;
}

/** Show an egg for a while; showing it again restarts it. */
export function hatch(egg: string, ms: number): void {
  remove(egg);
  void document.documentElement.offsetWidth; // restart the CSS animation
  add(egg);
  window.setTimeout(() => remove(egg), ms);
}

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

export function isHeartDay(now = new Date()): boolean {
  return now.getMonth() === 8 && now.getDate() === 29;
}

let typed = '';

/** Listen for the typed words, and mark the days; once, at startup. */
export function startEggs(now = new Date()): () => void {
  if (isHeartDay(now)) add('heart-day');
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1 || typing(e.target)) {
      typed = '';
      return;
    }
    typed = (typed + e.key.toLowerCase()).slice(-LONGEST);
    for (const [word, { egg, ms }] of Object.entries(WORDS)) {
      if (typed.endsWith(word)) {
        typed = '';
        hatch(egg, ms);
      }
    }
  };
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('keydown', onKey);
    typed = '';
  };
}
