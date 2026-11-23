// The heart for Learn, as a 2D diagram: cut open from the front, the outside with the coronary
// arteries, and one short-axis slice like the lab's TTC slices. It reads the same scene state the 3D
// heart will (camera, highlighted and hidden parts, labels, animation, speed), so it is both the first
// version of the heart and the 2D fallback the plan asks for (PLAN.md §3f).
//
// Schematic, not to scale, but anatomical: the shapes are in geometry.ts. Right and left are the
// heart's own, so its right side is on the left of the picture, as in every anatomy book.

import { type KeyboardEvent, type ReactNode } from 'react';
import type { Scene } from '../learn/lesson';
import {
  ANTERIOR,
  FLOW,
  LABELS,
  OUTLINE,
  type Pt,
  SECTION,
  SLICE,
  type Vessel,
  infarctPath,
  pointAt,
  smooth,
  tube,
} from './geometry';
import { type Anim, LOOPING, PART_NAMES, VIEW_NAMES, VIEW_PARTS, partName, shortName, viewOf } from './parts';
import { captionOf, clamp, ease, reducedMotion, useTimeline } from './timeline';
import './heart.css';

/** Parts with the same place as another part; "labels: all" leaves them out. */
const ALIASES = new Set(['lv-anterior-wall']);

/** The heart is drawn this far from the left edge, leaving room for labels on both sides. */
const OX = 150;
const WIDTH = 640;

// ---------------------------------------------------------------------------------------------
// Colours for the slice (TTC: living tissue turns brick red, dead tissue stays pale).

const UNSTAINED = [222, 196, 186];
const STAINED = [164, 46, 40];

function mix(a: number[], b: number[], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

// ---------------------------------------------------------------------------------------------

export interface HeartDiagramProps {
  scene: Scene;
  /** Parts become buttons (click-part quizzes, exploring). */
  onPartClick?: (id: string) => void;
  /** Numbered markers on these parts (label-diagram quizzes); labels are hidden. */
  pins?: string[];
  /** A part to point at now (a part: link under the pointer). */
  focus?: string | null;
  /** Parts marked right or wrong after a quiz answer. */
  marks?: Record<string, 'right' | 'wrong'>;
  /** Change to play the scene's animation again. */
  replay?: number;
}

/** Draws one part. `layer` draws more of an already drawn part elsewhere in the stack (behind or in
 *  front of other parts): it highlights and answers clicks like the part, but is not a second button. */
type PartFn = (id: string, node: ReactNode, layer?: boolean) => ReactNode;

export function HeartDiagram({ scene, onPartClick, pins, focus, marks, replay = 0 }: HeartDiagramProps) {
  const view = viewOf(scene.camera);
  const anim = (scene.anim as Anim | null) ?? null;
  const once = anim !== null && !LOOPING.includes(anim);
  const t = useTimeline(once, 6 / scene.speed, `${replay}|${view}|${anim}`);
  const hidden = new Set(scene.hide);
  const highlighted = new Set(scene.highlight);
  const interactive = !!onPartClick;

  const cls = (id: string) =>
    [
      'part',
      highlighted.has(id) ? 'hl' : '',
      focus === id ? 'focus' : '',
      marks?.[id] ? `mark-${marks[id]}` : '',
      interactive ? 'clickable' : '',
    ]
      .filter(Boolean)
      .join(' ');

  const part: PartFn = (id, node, layer = false) => {
    if (hidden.has(id)) return null;
    const handlers =
      interactive && !layer
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-label': partName(id),
            onClick: () => onPartClick?.(id),
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPartClick?.(id);
              }
            },
          }
        : interactive
          ? { 'aria-hidden': true, onClick: () => onPartClick?.(id) }
          : {};
    return (
      <g key={layer ? `${id}-layer` : id} className={cls(id)} data-part={id} {...handlers}>
        {node}
      </g>
    );
  };

  // Which labels to draw.
  const available = VIEW_PARTS[view].filter((p) => !hidden.has(p) && LABELS[view][p]);
  let labelled: string[] =
    pins && pins.length
      ? []
      : scene.labels === 'all'
        ? available.filter((p) => !ALIASES.has(p) || highlighted.has(p))
        : scene.labels === 'none'
          ? []
          : scene.labels === 'auto'
            ? available.filter((p) => highlighted.has(p))
            : available.filter((p) => (scene.labels as string[]).includes(p));
  if (focus && available.includes(focus) && !labelled.includes(focus) && !pins?.length) labelled = [...labelled, focus];

  const caption = captionOf(view, anim, t);
  const described = scene.highlight.filter((p) => PART_NAMES[p]).map(partName);
  const label = `${VIEW_NAMES[view]}.${described.length ? ` Highlighted: ${described.join(', ')}.` : ''}${caption ? ` ${caption}.` : ''}`;

  return (
    <svg
      className={`heart-diagram view-${view} ${anim ? `anim-${anim}` : ''} ${scene.xray ? 'xray' : ''}`}
      viewBox={`0 0 ${WIDTH} 440`}
      role={interactive ? 'group' : 'img'}
      aria-label={label}
      style={{ ['--speed' as string]: String(scene.speed) }}
    >
      <Defs speed={scene.speed} still={reducedMotion()} />
      <g transform={`translate(${OX} 0)`}>
        {view === 'section' && <SectionView part={part} anim={anim} />}
        {view === 'anterior' && <AnteriorView part={part} anim={anim} t={t} xray={scene.xray} />}
        {view === 'slice' && (
          <SliceView part={part} anim={anim} t={t} highlighted={highlighted} hidden={hidden} stained={scene.camera === 'ttc'} />
        )}
      </g>
      {caption && (
        <text className="caption" x={WIDTH / 2} y={432} textAnchor="middle" aria-hidden="true">
          {caption}
        </text>
      )}

      {labelled.map((id) => {
        const l = LABELS[view][id];
        const x = l.side === 'l' ? 10 : WIDTH - 10;
        const end = l.side === 'l' ? x + textWidth(id) + 6 : x - textWidth(id) - 6;
        return (
          <g key={`label-${id}`} className={`label ${highlighted.has(id) || focus === id ? 'strong' : ''}`} aria-hidden="true">
            <path d={`M ${l.at[0] + OX} ${l.at[1]} L ${end} ${l.y - 4}`} />
            <circle cx={l.at[0] + OX} cy={l.at[1]} r={2.5} />
            <text x={x} y={l.y} textAnchor={l.side === 'l' ? 'start' : 'end'}>
              {shortName(id)}
            </text>
          </g>
        );
      })}

      {pins?.map((id, i) => {
        const l = LABELS[view][id];
        if (!l) return null;
        return (
          <g key={`pin-${id}`} className={`pin ${marks?.[id] ? `mark-${marks[id]}` : ''}`} aria-hidden="true">
            <circle cx={l.at[0] + OX} cy={l.at[1]} r={12} />
            <text x={l.at[0] + OX} y={l.at[1] + 4.5} textAnchor="middle">
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function textWidth(id: string): number {
  return shortName(id).length * 7;
}

// ---------------------------------------------------------------------------------------------
// Shared paints and filters. Every diagram on a page draws the same definitions under the same ids,
// so whichever the browser finds first is right.

/** An outline in one colour round whatever the filter is on, for highlights and quiz marks. With
 *  `pulse` (seconds) the outline breathes; the part itself never fades, so nothing under it shows. */
function OutlineFilter({ id, colour, width, pulse }: { id: string; colour: string; width: number; pulse?: number }) {
  return (
    <filter id={id} x="-25%" y="-25%" width="150%" height="150%">
      <feMorphology in="SourceAlpha" operator="dilate" radius={width} result="grown" />
      <feFlood style={{ floodColor: colour }}>
        {pulse && <animate attributeName="flood-opacity" values="1;0.4;1" dur={`${pulse}s`} repeatCount="indefinite" />}
      </feFlood>
      <feComposite in2="grown" operator="in" result="ring" />
      <feGaussianBlur in="ring" stdDeviation={width * 0.9} result="glow" />
      <feMerge>
        <feMergeNode in="glow" />
        <feMergeNode in="ring" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

function Defs({ speed, still }: { speed: number; still: boolean }) {
  return (
    <defs>
      <OutlineFilter id="ch-hl" colour="var(--h-hl)" width={2.2} pulse={still ? undefined : 1.6 / speed} />
      <OutlineFilter id="ch-focus" colour="var(--h-hl)" width={2.2} pulse={still ? undefined : 0.8} />
      <OutlineFilter id="ch-right" colour="var(--h-right)" width={2.2} />
      <OutlineFilter id="ch-wrong" colour="var(--h-wrong)" width={2.2} />
      <OutlineFilter id="ch-hover" colour="var(--focus, #a3213a)" width={1.6} />
      <filter id="ch-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      {/* Muscle fibres on a cut surface: stretched noise, multiplied in. */}
      <filter id="ch-fibres" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.09" numOctaves={3} seed={4} result="noise" />
        <feColorMatrix in="noise" type="matrix" values="0.5 0 0 0 0.66  0.5 0 0 0 0.66  0.5 0 0 0 0.66  0 0 0 0 1" result="shade" />
        <feBlend in="SourceGraphic" in2="shade" mode="multiply" result="textured" />
        <feComposite in="textured" in2="SourceGraphic" operator="in" />
      </filter>
      {/* A stained slice's mottling. */}
      <filter id="ch-mottle" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves={3} seed={11} result="noise" />
        <feColorMatrix in="noise" type="matrix" values="0.26 0 0 0 0.84  0.26 0 0 0 0.84  0.26 0 0 0 0.84  0 0 0 0 1" result="shade" />
        <feBlend in="SourceGraphic" in2="shade" mode="multiply" result="textured" />
        <feComposite in="textured" in2="SourceGraphic" operator="in" />
      </filter>
      <filter id="ch-soft" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.2" />
      </filter>
      {/* Gradients in heart coordinates, so neighbouring shapes share one light. */}
      <radialGradient id="ch-muscle" gradientUnits="userSpaceOnUse" cx="200" cy="220" r="210">
        <stop offset="0" stopColor="#d4746a" />
        <stop offset="0.7" stopColor="#bd5850" />
        <stop offset="1" stopColor="#9c3d37" />
      </radialGradient>
      <radialGradient id="ch-surface" gradientUnits="userSpaceOnUse" cx="196" cy="206" r="220">
        <stop offset="0" stopColor="#d97a6f" />
        <stop offset="0.6" stopColor="#c45f56" />
        <stop offset="1" stopColor="#9a3e38" />
      </radialGradient>
      <radialGradient id="ch-atrium" gradientUnits="userSpaceOnUse" cx="140" cy="160" r="120">
        <stop offset="0" stopColor="#b9707e" />
        <stop offset="1" stopColor="#8a4a5c" />
      </radialGradient>
      <radialGradient id="ch-auricle-left" cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" stopColor="#cf7570" />
        <stop offset="1" stopColor="#9b4644" />
      </radialGradient>
      {/* Light from the upper left on the outside: a soft sheen and darker edges. */}
      <radialGradient id="ch-shade" cx="0.4" cy="0.36" r="0.68">
        <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
        <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        <stop offset="0.8" stopColor="#4a120e" stopOpacity="0.08" />
        <stop offset="1" stopColor="#4a120e" stopOpacity="0.32" />
      </radialGradient>
      <radialGradient id="ch-poor" cx="0.5" cy="0.45" r="0.6">
        <stop offset="0" stopColor="#b6caef" />
        <stop offset="1" stopColor="#8ea6d8" />
      </radialGradient>
      <radialGradient id="ch-rich" cx="0.5" cy="0.45" r="0.6">
        <stop offset="0" stopColor="#f7bcb4" />
        <stop offset="1" stopColor="#e48c84" />
      </radialGradient>
      <clipPath id="ch-outline-clip">
        <path d={OUTLINE} />
      </clipPath>
    </defs>
  );
}

// ---------------------------------------------------------------------------------------------
// Vessels

/** A vessel cut open (the section): every wall first, then the blood, so branches join without seams. */
function OpenVessels({ vessels, kind }: { vessels: Vessel[]; kind: 'poor' | 'rich' }) {
  return (
    <>
      {vessels.map((v) => (
        <path key={`w${v.d}`} className={`vessel wall ${kind}`} d={v.d} strokeWidth={v.wall} />
      ))}
      {vessels.map((v) => (
        <path key={`l${v.d}`} className={`vessel lumen ${kind}`} d={v.d} strokeWidth={v.lumen} />
      ))}
    </>
  );
}

/** A vessel from outside: a dark edge, its body, and a light stripe where the light catches it. */
function OutsideVessels({ vessels, kind }: { vessels: Vessel[]; kind: 'poor' | 'rich' }) {
  return (
    <>
      {vessels.map((v) => (
        <path key={`e${v.d}`} className={`vessel edge ${kind}`} d={v.d} strokeWidth={v.wall + 3} />
      ))}
      {vessels.map((v) => (
        <path key={`b${v.d}`} className={`vessel body ${kind}`} d={v.d} strokeWidth={v.wall} />
      ))}
      {vessels.map((v) => (
        <path key={`s${v.d}`} className={`vessel shine ${kind}`} d={v.d} strokeWidth={v.wall * 0.3} transform="translate(-2 -1)" />
      ))}
    </>
  );
}

/** A coronary artery or vein: a tapered tube with a light line along it. */
function Coronary({ points, w0, w1, kind = 'artery' }: { points: Pt[]; w0: number; w1: number; kind?: 'artery' | 'vein' }) {
  return (
    <>
      <path className={`coronary ${kind}`} d={tube(points, w0, w1)} />
      <path className={`coronary-shine ${kind}`} d={smooth(points)} strokeWidth={Math.max(0.6, w1 * 0.35)} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Cut open from the front

function SectionView({ part, anim }: { part: PartFn; anim: Anim | null }) {
  return (
    <g className="heart">
      {part('aorta', <OpenVessels vessels={[SECTION.descendingAorta]} kind="rich" />, true)}
      {part('myocardium', <path className="muscle" d={OUTLINE} />)}
      <g className="detail" aria-hidden="true">
        {SECTION.grooves.map((g) => (
          <g key={g.fat}>
            <path className="fat" d={g.fat} />
            <circle className="cut-artery" cx={g.artery[0]} cy={g.artery[1]} r={4} />
            <circle className="cut-vein" cx={g.vein[0]} cy={g.vein[1]} r={3.2} />
          </g>
        ))}
      </g>
      <g className="beat-atria">
        {part('ra', <path className="chamber poor" d={SECTION.ra} />)}
        {part('la', <path className="chamber rich" d={SECTION.la} />)}
        <ellipse className="detail sinus" aria-hidden="true" {...SECTION.coronarySinus} />
      </g>
      <g className="beat-ventricles">
        {part('rv', <path className="chamber poor" d={SECTION.rv} />)}
        {part('lv', <path className="chamber rich" d={SECTION.lv} />)}
        {part('septum', <path className="muscle septum" d={SECTION.septum} />)}
        <g className="detail" aria-hidden="true">
          <path className="papillary" d={SECTION.moderator} />
          {SECTION.papillary.map((d) => (
            <path key={d} className="papillary" d={d} />
          ))}
          {SECTION.chordae.map((d) => (
            <path key={d} className="chorda" d={d} />
          ))}
        </g>
      </g>
      {part('pulmonary-trunk', <OpenVessels vessels={[SECTION.trunk, ...SECTION.trunkBranches]} kind="poor" />)}
      {part('svc', <OpenVessels vessels={[SECTION.svc]} kind="poor" />)}
      {part('ivc', <OpenVessels vessels={[SECTION.ivc]} kind="poor" />)}
      {part('aorta', <OpenVessels vessels={[SECTION.aorta, ...SECTION.aortaBranches]} kind="rich" />)}
      {part('pulmonary-veins', <OpenVessels vessels={SECTION.veins} kind="rich" />)}
      {(['tricuspid', 'mitral', 'pulmonary-valve', 'aortic-valve'] as const).map((id) =>
        part(
          id,
          <>
            {SECTION[id].map((d) => (
              <path key={d} className="valve" d={d} />
            ))}
          </>,
        ),
      )}
      {part('apex', <circle className="point" cx={SECTION.apex[0]} cy={SECTION.apex[1]} r={5} />)}
      {anim === 'flow' && (
        <g className="flow" aria-hidden="true">
          {FLOW.poor.map((d) => (
            <path key={d} className="flow-path poor" d={d} />
          ))}
          {FLOW.rich.map((d) => (
            <path key={d} className="flow-path rich" d={d} />
          ))}
        </g>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------------------------
// The outside, from the front

const LAD_BLOCK = 0.16;

function AnteriorView({ part, anim, t, xray }: { part: PartFn; anim: Anim | null; t: number; xray: boolean }) {
  const a = ANTERIOR.arteries;
  const occluded = anim === 'occlusion' || (anim === 'reperfusion' && t < 0.25);
  const paleRisk =
    anim === 'occlusion' ? clamp((t - 0.12) / 0.88) : anim === 'reperfusion' ? 1 - clamp((t - 0.25) / 0.6) : 0;
  const paleCore = anim === 'reperfusion' ? 1 : anim === 'occlusion' ? clamp((t - 0.12) / 0.88) : 0;
  const clot = pointAt(a.lad, LAD_BLOCK);
  return (
    <g className="heart">
      {part('svc', <OutsideVessels vessels={[ANTERIOR.svc]} kind="poor" />)}
      {part('pulmonary-trunk', <OutsideVessels vessels={[ANTERIOR.trunkBranches[1]]} kind="poor" />, true)}
      {part('aorta', <OutsideVessels vessels={[ANTERIOR.aorta, ...ANTERIOR.aortaBranches]} kind="rich" />)}
      {part('epicardium', <path className="muscle outside" d={OUTLINE} />)}
      {part('ra', <path className="surface atrium" d={ANTERIOR.ra} />)}
      <g className="beat-ventricles">
        {part('rv', <path className="surface" d={ANTERIOR.rv} />)}
        {part('lv', <path className="surface" d={ANTERIOR.lv} />)}
        <path className="detail shade" d={OUTLINE} aria-hidden="true" />
        {part('rca-territory', <path className="territory" d={ANTERIOR.rv} />)}
        {part('lcx-territory', <path className="territory" d={ANTERIOR.lcxTerritory} />)}
        {part('lad-territory', <path className="territory" d={ANTERIOR.ladTerritory} />)}
        {part('lv-anterior-wall', <path className="territory" d={ANTERIOR.ladTerritory} />)}
        {(anim === 'occlusion' || anim === 'reperfusion') && (
          <g aria-hidden="true">
            <path className="pale" d={ANTERIOR.ladTerritory} style={{ opacity: 0.85 * paleRisk }} />
            <path className="pale" d={ANTERIOR.ladCore} style={{ opacity: 0.92 * paleCore }} />
          </g>
        )}
      </g>
      {xray && (
        <g className="xray-chambers" aria-hidden="true">
          {(['ra', 'la', 'rv', 'lv'] as const).map((id) => (
            <path key={id} className={`chamber ${id[0] === 'r' ? 'poor' : 'rich'}`} d={SECTION[id]} />
          ))}
        </g>
      )}
      {/* The pulmonary trunk rises out of the right ventricle, in front of the aorta. */}
      {part('pulmonary-trunk', <OutsideVessels vessels={[ANTERIOR.trunk, ANTERIOR.trunkBranches[0]]} kind="poor" />)}
      {part('rv', <path className="surface conus" d={ANTERIOR.conus} />, true)}
      {part(
        'ra',
        <>
          <path className="auricle right" d={ANTERIOR.rightAuricle} />
          {ANTERIOR.auricleFolds.slice(0, 3).map((d) => (
            <path key={d} className="detail fold" d={d} />
          ))}
        </>,
        true,
      )}
      {part(
        'la',
        <>
          <path className="auricle left" d={ANTERIOR.leftAuricle} />
          {ANTERIOR.auricleFolds.slice(3).map((d) => (
            <path key={d} className="detail fold" d={d} />
          ))}
        </>,
      )}
      <g className="detail" aria-hidden="true">
        <g clipPath="url(#ch-outline-clip)">
          {ANTERIOR.fat.map((p) => (
            <path key={p.join()} className="groove-fat" d={smooth(p)} />
          ))}
        </g>
        {ANTERIOR.cardiacVeins.map((p, i) => (
          <Coronary key={p.join()} points={p} w0={i < 2 ? 3.4 : 2.4} w1={i < 2 ? 2.2 : 1.2} kind="vein" />
        ))}
        <Coronary points={a.leftMain} w0={6} w1={5.6} />
      </g>
      {part(
        'rca',
        <>
          <Coronary points={a.rca} w0={5.4} w1={4.4} />
          <Coronary points={a.acuteMarginal} w0={3.4} w1={1.5} />
          {a.rvBranches.map((p) => (
            <Coronary key={p.join()} points={p} w0={2.4} w1={1.1} />
          ))}
        </>,
      )}
      {part(
        'lcx',
        <>
          <Coronary points={a.lcx} w0={5} w1={3.8} />
          <Coronary points={a.marginal} w0={3.2} w1={1.5} />
        </>,
      )}
      {part(
        'lad',
        <>
          <Coronary points={a.lad} w0={5.6} w1={2.2} />
          {a.diagonals.map((p) => (
            <Coronary key={p.join()} points={p} w0={3.4} w1={1.4} />
          ))}
          {occluded && (
            <g className="starved">
              <path className="coronary" d={tube(a.lad, 5.6, 2.2, LAD_BLOCK + 0.02)} />
              {a.diagonals.map((p) => (
                <path key={p.join()} className="coronary" d={tube(p, 3.4, 1.4)} />
              ))}
            </g>
          )}
        </>,
      )}
      {(anim === 'coronary-flow' || anim === 'reperfusion') && !occluded && (
        <g className="flow" aria-hidden="true">
          {[a.leftMain, a.lad, a.lcx, a.rca, ...a.diagonals, a.marginal, a.acuteMarginal].map((p) => (
            <path key={p.join()} className="flow-path coronary-flow" d={smooth(p)} />
          ))}
        </g>
      )}
      {occluded && <circle className="clot" cx={clot[0]} cy={clot[1]} r={6.5} aria-hidden="true" />}
      {part('apex', <circle className="point" cx={ANTERIOR.apex[0]} cy={ANTERIOR.apex[1]} r={5} />)}
      {part('base', <path className="base-line" d={ANTERIOR.baseLine} />)}
      {anim === 'slicing' && (
        <g className="cuts" clipPath="url(#ch-outline-clip)" aria-hidden="true">
          {ANTERIOR.cuts.map((y, i) => (
            <line key={y} x1={60} x2={400} y1={y} y2={y - 10} style={{ opacity: t * 5 > i + 0.5 ? 1 : 0 }} />
          ))}
        </g>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------------------------
// One slice across the ventricles

function SliceView({
  part,
  anim,
  t,
  highlighted,
  hidden,
  stained,
}: {
  part: PartFn;
  anim: Anim | null;
  t: number;
  highlighted: Set<string>;
  hidden: Set<string>;
  /** A TTC-stained slice with an infarct (camera "ttc"). */
  stained: boolean;
}) {
  // TTC colours living muscle; before it acts, the slice is a dull pink-grey.
  const stain = anim === 'ttc' ? ease(t) : 1;
  const living = { fill: mix(UNSTAINED, STAINED, stain) };
  const showInfarct =
    !hidden.has('infarct') &&
    (stained || highlighted.has('infarct') || anim === 'wavefront' || anim === 'ttc' || anim === 'reperfusion' || anim === 'occlusion');
  // The dead zone grows from the inner wall outward (the wavefront); reperfusion stops it part way.
  const reach =
    anim === 'wavefront' || anim === 'occlusion' ? ease(t) : anim === 'reperfusion' ? 0.45 * ease(t) : 1;
  const wall = `${SLICE.lvOuter} ${SLICE.lvInner}`;
  return (
    <g className="heart slice">
      <g className="detail" aria-hidden="true">
        {SLICE.grooves.map((g) => (
          <path key={g.fat} className="fat" d={g.fat} />
        ))}
      </g>
      {part('rv', <path className="tissue" d={SLICE.rvBody} style={living} />)}
      {part('lv', <path className="tissue" d={wall} fillRule="evenodd" style={living} />)}
      {part('septum', <path className="tissue joined" d={SLICE.septum} style={living} />)}
      {part('myocardium', <path className="tissue-outline" d={wall} fillRule="evenodd" />)}
      {part('rv-cavity', <path className="cavity" d={SLICE.rvCavity} />)}
      {part('lv-cavity', <path className="cavity" d={SLICE.lvInner} />)}
      {part(
        'lv',
        <>
          {SLICE.papillary.map((m) => (
            <ellipse
              key={m.cx}
              className="tissue"
              cx={m.cx}
              cy={m.cy}
              rx={m.rx}
              ry={m.ry}
              transform={`rotate(${m.angle} ${m.cx} ${m.cy})`}
              style={living}
            />
          ))}
        </>,
        true,
      )}
      {(anim === 'wavefront' || anim === 'occlusion' || anim === 'reperfusion') && (
        <path className="risk" d={SLICE.frontWall} aria-hidden="true" />
      )}
      {showInfarct && part('infarct', <path className="dead" d={infarctPath(reach)} />)}
      {part('lv-anterior-wall', <path className="region" d={SLICE.frontWall} />)}
      <g className="detail" aria-hidden="true">
        {SLICE.grooves.map((g) => (
          <g key={g.fat}>
            <circle className="cut-artery" cx={g.artery[0]} cy={g.artery[1]} r={4.2} />
            <circle className="cut-vein" cx={g.vein[0]} cy={g.vein[1]} r={3.4} />
          </g>
        ))}
      </g>
      {part(
        'endocardium',
        <>
          <path className="layer" d={SLICE.lvInner} />
          <path className="layer" d={SLICE.rvCavity} />
        </>,
      )}
      {part(
        'epicardium',
        <>
          <path className="layer" d={SLICE.lvOuter} />
          <path className="layer" d={SLICE.rvOuter} />
        </>,
      )}
      <text className="orient" x={SLICE.center.x} y={80} textAnchor="middle" aria-hidden="true">
        front
      </text>
      <text className="orient" x={SLICE.center.x} y={372} textAnchor="middle" aria-hidden="true">
        back
      </text>
    </g>
  );
}
