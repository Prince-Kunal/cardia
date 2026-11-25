// The landing page's story, as a timeline. `u` runs in chapters: 0 at the top of the page, 1 when the
// second chapter reaches the top of the window, and so on. Everything the 3D scene does is a pure
// function of u (stateAt), so scrolling back plays it backwards and a test can check any moment.
//
// The procedure follows the usual ischaemia–reperfusion protocol and TTC staining by slice incubation
// (content/en/08-how-ttc-staining-works.md; Lindsey et al. 2018; Bøtker et al. 2018): the LAD is tied
// off, then released; hours later the heart is removed, rinsed, trimmed and chilled; it is cut across
// into slices from the apex to the base; the slices are bathed in 1% TTC at 37 °C, then fixed in
// formalin, weighed and scanned. Labs that perfuse TTC through the coronaries instead see the same
// colours.

export interface Chapter {
  id: string;
  eyebrow: string;
  title: string;
  body: string[];
  /** Extra facts, in the chapter card's margin. */
  facts?: { label: string; value: string }[];
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'hero',
    eyebrow: 'Cardia',
    title: 'Every heart keeps a record',
    body: ['Of every minute it went without blood. Cardia reads it, slice by slice, and shows you how.'],
  },
  {
    id: 'occlusion',
    eyebrow: '01 · Occlusion',
    title: 'An artery is tied off',
    body: [
      'In the lab, a fine suture closes the left anterior descending artery, the LAD, for a set time: often about half an hour.',
      'Downstream, the front wall of the left ventricle gets no oxygen. It turns dusky and stops squeezing.',
    ],
    facts: [
      { label: 'Artery', value: 'LAD' },
      { label: 'Territory', value: 'Front wall, septum, apex' },
    ],
  },
  {
    id: 'reperfusion',
    eyebrow: '02 · Reperfusion',
    title: 'Blood returns. The damage stays.',
    body: [
      'The suture is released and blood flows again. Hours later the heart looks whole and beats.',
      'But some of that muscle has died, and dead muscle looks almost exactly like living muscle.',
    ],
  },
  {
    id: 'excision',
    eyebrow: '03 · Excision',
    title: 'Removed, trimmed, chilled',
    body: [
      'The heart is removed and rinsed. The atria and the great vessels are trimmed away, leaving the ventricles.',
      'It is chilled until it is firm enough to cut cleanly.',
    ],
  },
  {
    id: 'slicing',
    eyebrow: '04 · Slicing',
    title: 'Cut across, apex to base',
    body: [
      'Blades in a slicer matrix cut it into slices 1 to 2 mm thick, across the long axis.',
      'Each slice shows the left ventricle as a thick ring, with the right ventricle as a thin crescent beside it.',
    ],
    facts: [
      { label: 'Slices', value: '6' },
      { label: 'Thickness', value: '1–2 mm' },
    ],
  },
  {
    id: 'staining',
    eyebrow: '05 · Staining',
    title: 'A stain only the living can use',
    body: [
      'The slices bathe in colourless 1% TTC at 37 °C. Enzymes in living cells turn it into formazan, a brick-red dye that stays inside them.',
      'Dead cells have lost those enzymes, so they stay pale. Formalin then fixes the colours.',
    ],
    facts: [
      { label: 'TTC', value: '1% in buffer' },
      { label: 'Bath', value: '37 °C · 15 min' },
    ],
  },
  {
    id: 'reading',
    eyebrow: '06 · Reading',
    title: 'Red is alive. Pale is dead.',
    body: [
      'The infarct follows the blocked artery’s territory: through the whole wall at its heart, only the inner layer at its edges.',
      'The infarct percentage is the pale area over all the muscle, slice by slice, each slice counted by its weight.',
    ],
  },
  {
    id: 'cells',
    eyebrow: '07 · Closer',
    title: 'One cell at a time',
    body: [
      'Each muscle cell either made formazan or it did not. Living cells are packed with red; dead ones have leaked their enzymes and lost their nuclei.',
      'The border is ragged because cells die one by one.',
    ],
  },
  {
    id: 'cardia',
    eyebrow: '08 · Cardia',
    title: 'Then Cardia reads it',
    body: [
      'A real slice from the study set. Cardia finds the tissue, removes holes, and judges every pixel, in about three seconds, on your own computer.',
      'Three methods side by side, because no single rule is ground truth yet.',
    ],
  },
  {
    id: 'doors',
    eyebrow: 'Begin',
    title: 'Two ways in',
    body: [],
  },
];

export const N = CHAPTERS.length;

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 0 → 1 as u goes from a to b, eased (smoothstep). */
export function seg(u: number, a: number, b: number): number {
  const t = clamp01((u - a) / (b - a));
  return t * t * (3 - 2 * t);
}
/** Up over [a, b], then down over [c, d]. */
export function hump(u: number, a: number, b: number, c: number, d: number): number {
  return seg(u, a, b) * (1 - seg(u, c, d));
}

export interface SceneState {
  /** How strongly the heart beats (0 once it is removed). */
  life: number;
  /** 0 → 1: the spin settles to show the LAD. */
  settle: number;
  ligature: number;
  tighten: number;
  block: number;
  ischaemia: number;
  flow: number;
  /** The atria and great vessels dissolving; the coronaries go a little earlier. */
  trim: number;
  coronaryTrim: number;
  /** 0 → 1: the heart lies down, apex to the left. */
  lie: number;
  frost: number;
  /** The blades: 0 above, 1 through the heart; `bladeShow` fades them. */
  blades: number;
  bladeShow: number;
  /** 0 → 1: the real heart dissolves as the blades pass through it, leaving the slices. */
  cut: number;
  separate: number;
  /** 0 → 1: the slices turn their apical faces to us and lay out in two rows. */
  face: number;
  bath: number;
  bathShow: number;
  stain: number;
  fix: number;
  /** 0 → 1: the camera comes to the middle slice; then closer, to the border. */
  zoom: number;
  closer: number;
  micro: number;
  microZoom: number;
  /** Labels: slice numbers, the parts of a slice, the cells. */
  sliceLabels: number;
  partLabels: number;
  /** The whole canvas fading out for the real scan. */
  fade: number;
}

export function stateAt(u: number): SceneState {
  return {
    life: 1 - seg(u, 2.95, 3.25),
    settle: seg(u, 0.55, 1.15),
    ligature: hump(u, 1.1, 1.3, 2.1, 2.35),
    tighten: seg(u, 1.25, 1.42),
    block: seg(u, 1.35, 1.45) * (1 - seg(u, 2.02, 2.2)),
    ischaemia: seg(u, 1.4, 1.85) * (1 - seg(u, 2.12, 2.6)),
    flow: 1 - seg(u, 3.0, 3.2),
    trim: seg(u, 3.18, 3.62),
    coronaryTrim: seg(u, 3.08, 3.4),
    lie: seg(u, 3.35, 3.85),
    frost: hump(u, 3.55, 3.95, 4.45, 4.75),
    blades: bladeDepth(u),
    bladeShow: hump(u, 3.95, 4.05, 4.42, 4.6),
    cut: seg(u, 4.16, 4.32),
    separate: seg(u, 4.3, 4.6),
    face: seg(u, 4.58, 4.98),
    bath: seg(u, 5.02, 5.25) * (1 - seg(u, 5.8, 5.98)),
    bathShow: hump(u, 4.98, 5.05, 5.9, 6.0),
    stain: seg(u, 5.18, 5.72),
    fix: seg(u, 5.72, 5.95),
    zoom: seg(u, 6.0, 6.55),
    closer: seg(u, 7.0, 7.4),
    micro: seg(u, 7.18, 7.42),
    microZoom: seg(u, 7.3, 7.95),
    sliceLabels: hump(u, 4.85, 4.98, 5.9, 6.05),
    partLabels: hump(u, 6.45, 6.6, 6.95, 7.08),
    fade: seg(u, 7.88, 8.1),
  };
}

/** Where the blades are: they come down through the heart, then go back up. */
export function bladeDepth(u: number): number {
  return seg(u, 4.02, 4.28) - seg(u, 4.34, 4.56);
}

/** The heartbeat: atria first (lub), then the ventricles, about 66 a minute. */
export function beat(time: number): { atria: number; ventricles: number } {
  const ph = (time / 0.9) % 1;
  const smooth = (a: number, b: number, x: number) => {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  return {
    atria: smooth(0, 0.06, ph) * (1 - smooth(0.08, 0.2, ph)),
    ventricles: smooth(0.14, 0.24, ph) * (1 - smooth(0.32, 0.55, ph)),
  };
}
