// Cardia's mark: a short-axis slice of the heart drawn in pixels, the way Cardia sees it. A ring of
// living muscle (brick red) round the cavity, with the infarct (ivory) in the lateral wall: through
// the whole wall at its middle, only the inner layer at its edges. Every cell is a pixel judged.

import type { CSSProperties } from 'react';

/** The 13 × 13 grid: r = living, i = infarct, . = nothing (the cavity and the paper). */
const MARK_GRID = [
  '....rrrrr....',
  '..rrrrrrrrr..',
  '.rrrrrrrrrrr.',
  '.rrrr...rrri.',
  'rrrr.....riii',
  'rrr.......iii',
  'rrr.......iii',
  'rrr.......iii',
  'rrrr.....iiii',
  '.rrrr...rrii.',
  '.rrrrrrrrrrr.',
  '..rrrrrrrrr..',
  '....rrrrr....',
];

const CELLS = MARK_GRID.flatMap((row, y) =>
  [...row].flatMap((k, x) => (k === '.' ? [] : [{ x, y, k, d: Math.hypot(x - 6, y - 6) }])),
);

export function BrandMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 13 13" width={size} height={size} className={`brand-mark ${className}`} aria-hidden="true">
      {CELLS.map((c) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x + 0.07}
          y={c.y + 0.07}
          width={0.86}
          height={0.86}
          rx={0.13}
          fill={c.k === 'r' ? 'var(--mark-red, #b34234)' : 'var(--mark-ivory, #e7d4c0)'}
          style={{ '--d': c.d.toFixed(2) } as CSSProperties}
        />
      ))}
    </svg>
  );
}
