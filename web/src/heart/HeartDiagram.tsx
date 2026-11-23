// The heart for Learn, as a 2D diagram: cut open from the front, the outside with the coronary
// arteries, and one short-axis slice like the lab's TTC slices. It reads the same scene state the 3D
// heart will (camera, highlighted and hidden parts, labels, animation, speed), so it is both the first
// version of the heart and the 2D fallback the plan asks for (PLAN.md §3f).
//
// Schematic, not to scale. Right and left are the heart's own, so its right side is on the left of the
// picture, as in every anatomy book.

import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import type { Scene } from '../learn/lesson';
import { type Anim, LOOPING, PART_NAMES, VIEW_NAMES, VIEW_PARTS, type View, partName, viewOf } from './parts';
import './heart.css';

// ---------------------------------------------------------------------------------------------
// Geometry, in heart coordinates (x 78–378, y 14–395). The heart is drawn OX to the right in a
// 640 × 440 picture, leaving columns for labels on both sides.

const OUTLINE =
  'M 120 118 C 92 135 78 190 92 245 C 106 300 170 360 250 395 C 300 360 336 300 334 235 C 332 175 318 130 292 112 C 262 92 230 100 205 110 C 180 100 145 102 120 118 Z';

const SECTION = {
  ra: 'M 104 165 C 104 138 126 124 150 126 C 172 129 184 146 182 170 C 180 196 164 210 142 210 C 120 210 104 192 104 165 Z',
  la: 'M 222 152 C 224 130 246 120 270 122 C 296 125 312 140 310 162 C 308 184 290 196 266 195 C 242 194 220 176 222 152 Z',
  rv: 'M 112 240 C 120 226 150 222 178 228 C 192 232 200 244 200 262 C 200 296 206 325 222 352 C 186 340 140 304 122 276 C 112 262 108 250 112 240 Z',
  lv: 'M 224 236 C 238 222 276 218 300 228 C 318 238 322 262 316 292 C 308 330 282 360 254 378 C 238 352 226 320 222 290 C 219 268 216 248 224 236 Z',
  septum:
    'M 200 240 C 201 290 206 325 224 354 L 246 372 C 236 348 226 320 222 290 C 219 268 218 250 224 236 C 216 232 206 234 200 240 Z',
  tricuspid: 'M 116 218 Q 130 232 145 219 Q 160 232 176 220',
  mitral: 'M 232 210 Q 248 224 264 211 Q 280 224 296 212',
  'pulmonary-valve': 'M 178 212 Q 188 221 198 212',
  'aortic-valve': 'M 212 214 Q 222 223 234 214',
  svc: 'M 124 14 L 126 140',
  ivc: 'M 100 392 C 100 330 104 262 122 205',
  aorta: 'M 224 224 C 220 180 200 132 204 90 C 208 54 250 38 282 50 C 308 60 318 86 318 134',
  trunk: 'M 188 226 C 186 192 168 152 172 114',
  trunkLeft: 'M 173 116 C 152 100 122 94 90 98',
  trunkRight: 'M 175 112 C 204 96 256 92 304 102',
  veins: ['M 376 134 L 306 146', 'M 378 178 L 308 170'],
};

// Blood's path through the heart, for the flow animation: oxygen-poor (right side) and oxygen-rich (left).
const FLOW = {
  poor: [
    'M 124 20 L 126 150 C 130 190 140 215 145 235 C 150 270 170 300 190 280 C 196 250 190 220 186 190 C 182 160 174 130 172 112 C 150 100 120 96 92 98',
    'M 100 390 C 100 330 104 262 122 205 C 135 225 145 240 160 270',
    'M 172 112 C 204 96 256 92 302 102',
  ],
  rich: [
    'M 372 136 L 300 150 C 270 160 262 190 265 230 C 270 280 280 320 262 340 C 245 320 232 280 226 240 C 222 200 204 140 204 92 C 208 54 250 38 282 50 C 308 60 318 86 318 134',
    'M 374 178 L 300 172 C 280 180 270 200 268 230',
  ],
};

const ANTERIOR = {
  rv: 'M 100 220 C 120 200 170 190 215 196 C 222 250 232 320 252 392 C 200 370 140 330 110 285 C 98 262 96 238 100 220 Z',
  lv: 'M 215 196 C 260 190 310 200 332 225 C 336 300 300 360 252 392 C 232 320 222 250 215 196 Z',
  ra: 'M 92 150 C 96 128 120 118 140 124 C 152 140 146 172 124 186 C 104 190 92 174 92 150 Z',
  la: 'M 266 150 C 272 132 298 128 314 140 C 320 158 306 172 286 174 C 272 172 262 162 266 150 Z',
  svc: 'M 132 14 L 134 132',
  aorta: 'M 190 176 C 182 132 176 100 186 76 C 198 46 250 34 284 46 C 310 56 320 84 320 134',
  trunk: 'M 222 204 C 222 166 232 132 250 104',
  trunkLeft: 'M 250 106 C 262 92 288 88 314 96',
  trunkRight: 'M 248 106 C 236 96 216 94 198 98',
  lad: 'M 236 168 C 230 210 222 262 236 322 C 242 352 248 374 252 392',
  ladDistal: 'M 230 214 C 222 262 236 322 236 322 C 242 352 248 374 252 392',
  lcx: 'M 240 166 C 272 170 306 182 330 214',
  rca: 'M 190 160 C 158 172 126 198 112 236 C 102 262 108 296 138 332',
  leftMain: 'M 200 158 C 214 160 228 164 240 166',
  ladTerritory: 'M 213 198 C 232 194 262 196 288 210 C 292 262 286 330 252 392 C 238 360 226 300 210 250 Z',
  ladCore: 'M 226 240 C 240 236 258 240 274 248 C 276 290 270 340 252 384 C 244 350 234 300 226 240 Z',
  lcxTerritory: 'M 290 212 C 310 214 326 222 332 232 C 336 280 318 330 290 360 C 284 320 290 262 290 212 Z',
  cuts: [360, 322, 284, 246],
};

const SLICE = {
  lvWall:
    'M 380 222 A 118 118 0 1 0 144 222 A 118 118 0 1 0 380 222 Z M 324 218 A 60 60 0 1 1 204 218 A 60 60 0 1 1 324 218 Z',
  lvCavity: 'M 324 218 A 60 60 0 1 1 204 218 A 60 60 0 1 1 324 218 Z',
  lvOuter: 'M 380 222 A 118 118 0 1 0 144 222 A 118 118 0 1 0 380 222 Z',
  rvWall:
    'M 194 125 C 140 104 84 150 84 222 C 84 294 140 340 194 319 L 179 305 C 140 316 102 278 102 222 C 102 166 140 128 179 139 Z',
  rvCavity: 'M 179 139 C 140 128 102 166 102 222 C 102 278 140 316 179 305 A 118 118 0 0 1 179 139 Z',
  rvOuter: 'M 194 125 C 140 104 84 150 84 222 C 84 294 140 340 194 319',
  septum: 'M 194.3 125.3 A 118 118 0 0 0 194.3 318.7 L 229.6 267.1 A 60 60 0 0 1 229.6 168.9 Z',
  // The front wall of the left ventricle, endocardium to epicardium (the LAD's territory in this slice).
  anterior: 'M 212 188 A 60 60 0 0 1 302.6 172 L 337.8 131.6 A 118 118 0 0 0 159.8 163 Z',
  inner: { cx: 264, cy: 218, r: 60 },
  outer: { cx: 262, cy: 222, r: 118 },
};

/** Each part's label: where it points (heart coordinates), which side of the picture, and its row. */
type LabelSpot = { at: [number, number]; side: 'l' | 'r'; y: number };
const LABELS: Record<View, Record<string, LabelSpot>> = {
  section: {
    svc: { at: [125, 50], side: 'l', y: 40 },
    'pulmonary-trunk': { at: [176, 128], side: 'l', y: 92 },
    ra: { at: [138, 168], side: 'l', y: 150 },
    tricuspid: { at: [130, 224], side: 'l', y: 198 },
    'pulmonary-valve': { at: [188, 214], side: 'l', y: 226 },
    rv: { at: [156, 276], side: 'l', y: 278 },
    ivc: { at: [101, 360], side: 'l', y: 372 },
    aorta: { at: [262, 42], side: 'r', y: 30 },
    'pulmonary-veins': { at: [350, 139], side: 'r', y: 108 },
    la: { at: [272, 158], side: 'r', y: 158 },
    mitral: { at: [282, 216], side: 'r', y: 204 },
    'aortic-valve': { at: [222, 216], side: 'r', y: 232 },
    lv: { at: [272, 290], side: 'r', y: 284 },
    septum: { at: [212, 310], side: 'r', y: 316 },
    myocardium: { at: [322, 300], side: 'r', y: 348 },
    apex: { at: [250, 392], side: 'r', y: 404 },
  },
  anterior: {
    svc: { at: [133, 50], side: 'l', y: 40 },
    ra: { at: [112, 160], side: 'l', y: 140 },
    base: { at: [150, 194], side: 'l', y: 192 },
    rca: { at: [110, 250], side: 'l', y: 240 },
    rv: { at: [160, 280], side: 'l', y: 288 },
    'rca-territory': { at: [150, 320], side: 'l', y: 336 },
    aorta: { at: [262, 40], side: 'r', y: 30 },
    'pulmonary-trunk': { at: [244, 130], side: 'r', y: 80 },
    la: { at: [296, 152], side: 'r', y: 130 },
    lcx: { at: [300, 180], side: 'r', y: 176 },
    lad: { at: [228, 262], side: 'r', y: 220 },
    'lad-territory': { at: [262, 290], side: 'r', y: 260 },
    'lv-anterior-wall': { at: [262, 290], side: 'r', y: 260 },
    'lcx-territory': { at: [312, 280], side: 'r', y: 298 },
    lv: { at: [296, 240], side: 'r', y: 334 },
    epicardium: { at: [331, 300], side: 'r', y: 368 },
    apex: { at: [252, 392], side: 'r', y: 404 },
  },
  slice: {
    rv: { at: [92, 222], side: 'l', y: 180 },
    'rv-cavity': { at: [130, 222], side: 'l', y: 236 },
    septum: { at: [186, 222], side: 'l', y: 292 },
    'lv-anterior-wall': { at: [262, 132], side: 'r', y: 60 },
    infarct: { at: [262, 150], side: 'r', y: 110 },
    epicardium: { at: [372, 180], side: 'r', y: 160 },
    'lv-cavity': { at: [264, 218], side: 'r', y: 206 },
    endocardium: { at: [318, 240], side: 'r', y: 246 },
    lv: { at: [362, 262], side: 'r', y: 290 },
    myocardium: { at: [330, 322], side: 'r', y: 336 },
  },
};

/** Parts with the same place as another part; "labels: all" leaves them out. */
const ALIASES = new Set(['lv-anterior-wall']);

/** The heart is drawn this far from the left edge, leaving room for labels on both sides. */
const OX = 150;
const WIDTH = 640;

// ---------------------------------------------------------------------------------------------
// Colours for the slice (TTC: living tissue turns brick red, dead tissue stays pale).

const UNSTAINED = [226, 205, 196];
const STAINED = [168, 50, 44];

function mix(a: number[], b: number[], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp = (t: number) => Math.min(1, Math.max(0, t));

function reducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return (
    document.documentElement.dataset.motion === 'reduced' ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}

/** 0 → 1 over the animation's length; the end at once with reduced motion. A new `key` plays it again. */
function useTimeline(active: boolean, seconds: number, key: string): number {
  const [state, setState] = useState({ key, t: 0 });
  const skip = !active || reducedMotion();
  useEffect(() => {
    if (skip) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = clamp((now - start) / (seconds * 1000));
      setState({ key, t });
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [skip, seconds, key]);
  if (skip) return 1;
  return state.key === key ? state.t : 0;
}

/** "Time since the artery was blocked" for the occlusion and wavefront animations: 0 min to 3 h. */
function clock(t: number): string {
  const minutes = Math.round(180 * t * t);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ''}`.trim();
}

/** A line under the picture saying what the animation shows, as it plays. */
function captionOf(view: View, anim: Anim | null, t: number): string | null {
  if (view === 'anterior') {
    if (anim === 'slicing') return 'Slices are cut across the ventricles, from the apex up to the base';
    if (anim === 'occlusion') return `Artery blocked for ${clock(t)}`;
    if (anim === 'reperfusion') return t < 0.25 ? 'Artery blocked' : 'Artery reopened: blood flows again';
  }
  if (view === 'slice') {
    if (anim === 'ttc') return t < 1 ? 'In warm TTC, living muscle turns red…' : 'Living muscle is red; dead muscle stays pale';
    if (anim === 'wavefront' || anim === 'occlusion') return `Artery blocked for ${clock(t)}: the dead zone grows outward`;
    if (anim === 'reperfusion') return 'Reopened in time: part of the wall is saved';
  }
  if (view === 'section' && anim === 'flow') return 'Blue: oxygen-poor blood. Red: oxygen-rich blood';
  return null;
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

export function HeartDiagram({ scene, onPartClick, pins, focus, marks, replay = 0 }: HeartDiagramProps) {
  const view = viewOf(scene.camera);
  const anim = (scene.anim as Anim | null) ?? null;
  const once = anim !== null && !LOOPING.includes(anim);
  const t = useTimeline(once, 6 / scene.speed, `${replay}|${view}|${anim}`);
  const hidden = new Set(scene.hide);
  const highlighted = new Set(scene.highlight);
  const interactive = !!onPartClick;
  const svgRef = useRef<SVGSVGElement>(null);

  const cls = (id: string, base = '') =>
    [
      base,
      'part',
      highlighted.has(id) ? 'hl' : '',
      focus === id ? 'focus' : '',
      marks?.[id] ? `mark-${marks[id]}` : '',
      interactive ? 'clickable' : '',
    ]
      .filter(Boolean)
      .join(' ');

  const part = (id: string, node: ReactNode) => {
    if (hidden.has(id)) return null;
    const handlers = interactive
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
      : {};
    return (
      <g key={id} className={cls(id)} data-part={id} {...handlers}>
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
      ref={svgRef}
      className={`heart-diagram view-${view} ${anim ? `anim-${anim}` : ''} ${scene.xray ? 'xray' : ''}`}
      viewBox={`0 0 ${WIDTH} 440`}
      role={interactive ? 'group' : 'img'}
      aria-label={label}
      style={{ ['--speed' as string]: String(scene.speed) }}
    >
      <defs>
        <filter id="heart-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id="heart-outline-clip">
          <path d={OUTLINE} />
        </clipPath>
      </defs>
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

/** Label text: the name without the bracketed abbreviation, which is long for the picture. */
function shortName(id: string): string {
  const name = partName(id);
  const abbr = /\(([A-Za-z]+)\)$/.exec(name);
  return abbr && abbr[1].toUpperCase() === abbr[1] ? abbr[1] : name.replace(/\s*\(.*\)$/, '');
}

function textWidth(id: string): number {
  return shortName(id).length * 7;
}

type PartFn = (id: string, node: ReactNode) => ReactNode;

function SectionView({ part, anim }: { part: PartFn; anim: Anim | null }) {
  return (
    <g className="heart">
      {part('myocardium', <path className="muscle" d={OUTLINE} />)}
      {part(
        'pulmonary-trunk',
        <>
          <path className="vessel poor" d={SECTION.trunkLeft} strokeWidth={16} />
          <path className="vessel poor" d={SECTION.trunkRight} strokeWidth={16} />
          <path className="vessel poor" d={SECTION.trunk} strokeWidth={22} />
        </>,
      )}
      {part('aorta', <path className="vessel rich" d={SECTION.aorta} strokeWidth={26} />)}
      {part('svc', <path className="vessel poor" d={SECTION.svc} strokeWidth={22} />)}
      {part('ivc', <path className="vessel poor" d={SECTION.ivc} strokeWidth={22} />)}
      {part(
        'pulmonary-veins',
        <>
          {SECTION.veins.map((d) => (
            <path key={d} className="vessel rich" d={d} strokeWidth={12} />
          ))}
        </>,
      )}
      <g className="beat-atria">
        {part('ra', <path className="chamber poor" d={SECTION.ra} />)}
        {part('la', <path className="chamber rich" d={SECTION.la} />)}
      </g>
      <g className="beat-ventricles">
        {part('rv', <path className="chamber poor" d={SECTION.rv} />)}
        {part('lv', <path className="chamber rich" d={SECTION.lv} />)}
        {part('septum', <path className="septum" d={SECTION.septum} />)}
      </g>
      {part('tricuspid', <path className="valve" d={SECTION.tricuspid} />)}
      {part('mitral', <path className="valve" d={SECTION.mitral} />)}
      {part('pulmonary-valve', <path className="valve" d={SECTION['pulmonary-valve']} />)}
      {part('aortic-valve', <path className="valve" d={SECTION['aortic-valve']} />)}
      {part('apex', <circle className="point" cx={250} cy={392} r={5} />)}
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

function AnteriorView({ part, anim, t, xray }: { part: PartFn; anim: Anim | null; t: number; xray: boolean }) {
  const occluded = anim === 'occlusion' || (anim === 'reperfusion' && t < 0.25);
  const paleRisk =
    anim === 'occlusion' ? clamp((t - 0.12) / 0.88) : anim === 'reperfusion' ? 1 - clamp((t - 0.25) / 0.6) : 0;
  const paleCore = anim === 'reperfusion' ? 1 : anim === 'occlusion' ? clamp((t - 0.12) / 0.88) : 0;
  return (
    <g className="heart">
      {part('svc', <path className="vessel poor" d={ANTERIOR.svc} strokeWidth={22} />)}
      {part('aorta', <path className="vessel rich" d={ANTERIOR.aorta} strokeWidth={28} />)}
      {part('epicardium', <path className="muscle outside" d={OUTLINE} />)}
      {xray && (
        <g className="xray-chambers" aria-hidden="true">
          {(['ra', 'la', 'rv', 'lv'] as const).map((id) => (
            <path key={id} className={`chamber ${id[0] === 'r' ? 'poor' : 'rich'}`} d={SECTION[id]} />
          ))}
        </g>
      )}
      <g className="beat-ventricles">
        {part('rv', <path className="surface" d={ANTERIOR.rv} />)}
        {part('lv', <path className="surface" d={ANTERIOR.lv} />)}
        {part('rca-territory', <path className="territory" d={ANTERIOR.rv} />)}
        {part('lcx-territory', <path className="territory" d={ANTERIOR.lcxTerritory} />)}
        {part('lad-territory', <path className="territory" d={ANTERIOR.ladTerritory} />)}
        {part('lv-anterior-wall', <path className="territory" d={ANTERIOR.ladTerritory} />)}
        {(anim === 'occlusion' || anim === 'reperfusion') && (
          <g aria-hidden="true">
            <path className="pale" d={ANTERIOR.ladTerritory} style={{ opacity: 0.88 * paleRisk }} />
            <path className="pale" d={ANTERIOR.ladCore} style={{ opacity: 0.92 * paleCore }} />
          </g>
        )}
      </g>
      {part('ra', <path className="auricle poor" d={ANTERIOR.ra} />)}
      {part('la', <path className="auricle rich" d={ANTERIOR.la} />)}
      {part(
        'pulmonary-trunk',
        <>
          <path className="vessel poor" d={ANTERIOR.trunkRight} strokeWidth={16} />
          <path className="vessel poor" d={ANTERIOR.trunkLeft} strokeWidth={16} />
          <path className="vessel poor" d={ANTERIOR.trunk} strokeWidth={24} />
        </>,
      )}
      <path className="coronary" d={ANTERIOR.leftMain} />
      {part('rca', <path className="coronary" d={ANTERIOR.rca} />)}
      {part('lcx', <path className="coronary" d={ANTERIOR.lcx} />)}
      {part(
        'lad',
        <>
          <path className="coronary" d={ANTERIOR.lad} />
          {occluded && <path className="coronary starved" d={ANTERIOR.ladDistal} />}
        </>,
      )}
      {(anim === 'coronary-flow' || anim === 'reperfusion') && !occluded && (
        <g className="flow" aria-hidden="true">
          {[ANTERIOR.leftMain, ANTERIOR.lad, ANTERIOR.lcx, ANTERIOR.rca].map((d) => (
            <path key={d} className="flow-path coronary-flow" d={d} />
          ))}
        </g>
      )}
      {occluded && <circle className="clot" cx={232} cy={204} r={7} aria-hidden="true" />}
      {part('apex', <circle className="point" cx={252} cy={392} r={5} />)}
      {part('base', <path className="base-line" d="M 100 202 C 150 190 270 188 332 222" />)}
      {anim === 'slicing' && (
        <g className="cuts" clipPath="url(#heart-outline-clip)" aria-hidden="true">
          {ANTERIOR.cuts.map((y, i) => (
            <line key={y} x1={60} x2={400} y1={y} y2={y - 8} style={{ opacity: t * 5 > i + 0.5 ? 1 : 0 }} />
          ))}
        </g>
      )}
    </g>
  );
}

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
  const living = mix(UNSTAINED, STAINED, stain);
  const showInfarct =
    !hidden.has('infarct') &&
    (stained || highlighted.has('infarct') || anim === 'wavefront' || anim === 'ttc' || anim === 'reperfusion' || anim === 'occlusion');
  // The dead zone grows from the inner wall outward (the wavefront); reperfusion stops it part way.
  const reach =
    anim === 'wavefront' || anim === 'occlusion'
      ? 62 + 58 * ease(t)
      : anim === 'reperfusion'
        ? 62 + 30 * ease(t)
        : 120;
  return (
    <g className="heart slice">
      <defs>
        <clipPath id="infarct-reach">
          <circle cx={SLICE.inner.cx} cy={SLICE.inner.cy} r={reach} />
        </clipPath>
      </defs>
      {part('rv-cavity', <path className="cavity" d={SLICE.rvCavity} />)}
      {part('lv-cavity', <path className="cavity" d={SLICE.lvCavity} />)}
      {part('rv', <path className="tissue" d={SLICE.rvWall} style={{ fill: living }} />)}
      {part('lv', <path className="tissue" d={SLICE.lvWall} fillRule="evenodd" style={{ fill: living }} />)}
      {part('myocardium', <path className="tissue-outline" d={SLICE.lvWall} fillRule="evenodd" />)}
      {part('septum', <path className="septum-slice" d={SLICE.septum} />)}
      {(anim === 'wavefront' || anim === 'occlusion' || anim === 'reperfusion') && (
        <path className="risk" d={SLICE.anterior} aria-hidden="true" />
      )}
      {showInfarct && part('infarct', <path className="dead" d={SLICE.anterior} clipPath="url(#infarct-reach)" />)}
      {part('lv-anterior-wall', <path className="region" d={SLICE.anterior} />)}
      {part('endocardium', <circle className="layer" cx={SLICE.inner.cx} cy={SLICE.inner.cy} r={SLICE.inner.r} />)}
      {part(
        'epicardium',
        <>
          <circle className="layer" cx={SLICE.outer.cx} cy={SLICE.outer.cy} r={SLICE.outer.r} />
          <path className="layer" d={SLICE.rvOuter} />
        </>,
      )}
      <text className="orient" x={262} y={92} textAnchor="middle" aria-hidden="true">
        front
      </text>
      <text className="orient" x={262} y={360} textAnchor="middle" aria-hidden="true">
        back
      </text>
    </g>
  );
}
