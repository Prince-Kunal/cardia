// The engine's pulse: an ECG trace drawn along the header's bottom edge. It beats calmly while the
// engine is connected, quickens while slices are being analysed (lib/pulse.ts), and flatlines when
// there is no engine. Decorative: the state is also said in words wherever it matters.

import { usePulse } from '../lib/pulse';

const W = 1200;
const MID = 9;

/** One PQRST complex every `period` units across the width. */
function ecgPath(period = 300): string {
  let d = `M0 ${MID}`;
  for (let x0 = 0; x0 < W; x0 += period) {
    d +=
      ` H${x0 + 40}` +
      ` Q${x0 + 50} ${MID - 3.2} ${x0 + 60} ${MID}` + // P
      ` H${x0 + 82}` +
      ` L${x0 + 86} ${MID + 1.6}` + // Q
      ` L${x0 + 92} ${MID - 8.6}` + // R
      ` L${x0 + 98} ${MID + 4.6}` + // S
      ` L${x0 + 102} ${MID}` +
      ` H${x0 + 128}` +
      ` Q${x0 + 147} ${MID - 5} ${x0 + 166} ${MID}` + // T
      ` H${x0 + period}`;
  }
  return d;
}

const BEAT = ecgPath();
const FLAT = `M0 ${MID} H${W}`;

export function VitalLine({ state }: { state?: 'beating' | 'busy' | 'flat' }) {
  const busy = usePulse();
  const s = state ?? (busy ? 'busy' : 'beating');
  const d = s === 'flat' ? FLAT : BEAT;
  return (
    <div className="vital" data-state={s} aria-hidden="true">
      <svg viewBox={`0 0 ${W} 14`} preserveAspectRatio="none">
        <path className="vital-base" d={d} pathLength={W} fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path className="vital-tail" d={d} pathLength={W} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <path className="vital-head" d={d} pathLength={W} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      </svg>
    </div>
  );
}
