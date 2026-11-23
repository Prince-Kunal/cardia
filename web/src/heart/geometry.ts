// The heart's shapes, in heart coordinates (x about 78–378, y 12–395; the diagram shifts them right to
// leave room for labels). Schematic but anatomical: walls with real thickness (the left ventricle's
// about three times the right's), valves with leaflets, chordae and papillary muscles, great vessels
// with their branches, coronary arteries that taper and branch, and a slice like the lab's TTC slices.
// Right and left are the heart's own, so its right side is on the left of the picture.

export type Pt = readonly [number, number];
type View = 'section' | 'anterior' | 'slice';

const r1 = (v: number) => Math.round(v * 10) / 10;

/** A smooth path through the points (Catmull-Rom as cubic Béziers). */
export function smooth(points: readonly Pt[], closed = false): string {
  const n = points.length;
  const at = (i: number) => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  let d = `M ${r1(points[0][0])} ${r1(points[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d +=
      ` C ${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)}` +
      ` ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return closed ? `${d} Z` : d;
}

/** Points along the same curve as smooth(points), closely spaced. */
export function sample(points: readonly Pt[], perSegment = 14): Pt[] {
  const n = points.length;
  const at = (i: number) => points[Math.max(0, Math.min(n - 1, i))];
  const out: Pt[] = [];
  for (let i = 0; i < n - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment;
      const u = 1 - t;
      out.push([
        u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
        u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1],
      ]);
    }
  }
  out.push(points[n - 1]);
  return out;
}

/** The point a fraction of the way along the curve. */
export function pointAt(points: readonly Pt[], frac: number): Pt {
  const pts = sample(points);
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const goal = len[len.length - 1] * frac;
  const i = Math.max(1, len.findIndex((l) => l >= goal));
  const k = (goal - len[i - 1]) / (len[i] - len[i - 1] || 1);
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
}

/** The outline of a tube along the curve, its width going from w0 to w1, drawn between fractions
 *  `from` and `to` of its length (for a blocked artery's starved end). Ends are rounded. */
export function tube(points: readonly Pt[], w0: number, w1: number, from = 0, to = 1): string {
  const pts = sample(points);
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = len[len.length - 1];
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const s = len[i] / total;
    if (s < from - 1e-6 || s > to + 1e-6) continue;
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const m = Math.hypot(dx, dy) || 1;
    const h = (w0 + (w1 - w0) * s) / 2;
    left.push([pts[i][0] - (dy / m) * h, pts[i][1] + (dx / m) * h]);
    right.push([pts[i][0] + (dy / m) * h, pts[i][1] - (dx / m) * h]);
  }
  if (left.length < 2) return '';
  const end = (w0 + (w1 - w0) * to) / 4;
  const start = (w0 + (w1 - w0) * from) / 4;
  const line = (p: Pt[]) => p.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(' L ');
  const r = right.reverse();
  return `M ${line(left)} A ${r1(end * 2)} ${r1(end * 2)} 0 0 0 ${r1(r[0][0])} ${r1(r[0][1])} L ${line(r)} A ${r1(start * 2)} ${r1(start * 2)} 0 0 0 ${r1(left[0][0])} ${r1(left[0][1])} Z`;
}

/** A point at angle a (radians; 0 is right, positive is down) and radius r around (cx, cy). */
const polarPt = (cx: number, cy: number, a: number, r: number): Pt => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];

/** A closed smooth outline from a radius that changes with the angle. */
function polarPath(cx: number, cy: number, radius: (a: number) => number, steps = 96): string {
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push(polarPt(cx, cy, a, radius(a)));
  }
  return smooth(pts, true);
}

/** The difference between two angles, -π to π. */
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const bump = (a: number, at: number, width: number) => Math.exp(-((angleDiff(a, at) / width) ** 2));

// ---------------------------------------------------------------------------------------------
// The heart's outline, shared by the section and the outside view (and the clip for cutting lines).

export const OUTLINE =
  'M 114 126 C 98 134 88 158 88 186 C 88 214 96 236 108 252 C 128 296 176 344 236 376 C 248 383 258 389 266 393 ' +
  'C 292 380 320 344 334 298 C 344 262 346 222 336 190 C 330 168 324 146 316 130 C 296 118 270 116 248 120 ' +
  'C 220 112 170 110 142 118 C 132 120 122 122 114 126 Z';

export const APEX: Pt = [266, 392];

/** A vessel as a tube: the centre line, wall and lumen widths (section) or outside width (anterior). */
export type Vessel = { d: string; wall: number; lumen: number };
const vessel = (points: Pt[], wall: number, lumen: number): Vessel => ({ d: smooth(points), wall, lumen });

// ---------------------------------------------------------------------------------------------
// Cut open from the front (a coronal section through all four chambers).

export const SECTION = {
  ra: 'M 122 134 C 108 144 99 164 99 188 C 99 208 104 222 112 236 L 178 236 C 180 214 180 184 176 162 C 172 144 160 134 146 132 C 136 131 128 131 122 134 Z',
  la: 'M 254 136 C 270 126 298 126 312 136 C 322 146 324 170 322 190 C 321 200 318 208 314 216 L 252 216 C 250 196 248 170 250 152 C 251 146 252 140 254 136 Z',
  rv: 'M 110 234 C 110 262 120 292 142 318 C 166 342 198 358 230 364 C 222 344 212 314 208 286 C 205 264 205 248 208 232 C 210 214 212 196 211 180 L 185 180 C 184 198 182 216 180 234 Z',
  lv: 'M 215 207 C 216 240 224 282 240 320 C 248 342 256 358 264 370 C 282 358 298 330 306 296 C 312 268 314 240 314 214 L 252 214 L 246 207 Z',
  septum:
    'M 211 212 C 209 234 206 256 208 286 C 212 314 222 344 232 366 C 244 372 254 372 262 371 C 252 352 244 334 238 316 C 226 284 218 248 215 210 Z',
  // Valves: two leaflets of each atrioventricular valve hang into the ventricle on chordae; the
  // semilunar valves are cups at the root of each artery.
  tricuspid: [
    'M 112 235 C 115 249 123 262 134 268 C 132 256 129 244 127 236 Z',
    'M 178 235 C 177 250 171 263 160 270 C 158 258 159 245 162 236 Z',
  ],
  mitral: [
    'M 253 215 C 256 232 262 248 271 257 C 268 242 265 228 263 215 Z',
    'M 313 215 C 311 229 305 241 296 249 C 296 236 298 225 302 215 Z',
  ],
  'pulmonary-valve': ['M 186 180 C 186 189 195 190 198 178 Z', 'M 210 180 C 210 189 201 190 198 178 Z'],
  'aortic-valve': ['M 216 205 C 216 214 227 215 230 203 Z', 'M 245 205 C 245 214 234 215 230 203 Z'],
  // Papillary muscles (tapered: base on the wall, tip in the cavity), the chordae to the leaflets, and
  // the right ventricle's moderator band.
  papillary: [
    tube([[315, 322], [305, 310], [297, 299]], 19, 8),
    tube([[263, 362], [267, 342], [271, 322]], 19, 8),
    tube([[124, 314], [136, 298], [146, 286]], 13, 5),
  ],
  moderator: tube([[208, 300], [176, 306], [140, 310]], 7, 6),
  chordae: [
    'M 271 257 L 297 299',
    'M 271 257 L 271 322',
    'M 296 249 L 297 299',
    'M 266 250 L 271 322',
    'M 134 268 L 146 286',
    'M 160 270 L 146 286',
    'M 160 270 L 176 300',
  ],
  coronarySinus: { cx: 130, cy: 224, rx: 6, ry: 3.5 },
  // Fat in the grooves between atria and ventricles, with the coronary arteries cut across.
  grooves: [
    { fat: 'M 334 196 C 340 190 350 194 352 202 C 352 212 344 218 338 214 C 332 210 330 202 334 196 Z', artery: [343, 203], vein: [338, 211] },
  ],
  svc: vessel([[127, 10], [127, 80], [128, 136]], 26, 18),
  ivc: vessel([[92, 396], [90, 340], [93, 290], [101, 256], [113, 232]], 26, 18),
  aorta: vessel([[230, 207], [230, 170], [229, 130], [232, 92], [246, 60], [272, 46], [298, 52], [314, 74], [318, 104], [318, 120]], 32, 23),
  aortaBranches: [
    vessel([[244, 62], [238, 36], [232, 10]], 13, 8),
    vessel([[266, 50], [266, 28], [266, 10]], 12, 7),
    vessel([[288, 52], [294, 30], [298, 10]], 12, 7),
  ],
  // The descending aorta runs down behind the heart; it shows only beside it.
  descendingAorta: vessel([[318, 104], [327, 150], [335, 220], [339, 300], [340, 396]], 30, 21),
  trunk: vessel([[198, 182], [197, 150], [196, 112]], 28, 20),
  trunkBranches: [vessel([[196, 114], [174, 104], [136, 98], [96, 100], [80, 102]], 18, 12), vessel([[196, 114], [222, 104], [262, 96], [300, 98]], 18, 12)],
  veins: [vessel([[378, 148], [342, 150], [314, 156]], 14, 9), vessel([[378, 186], [344, 184], [314, 182]], 14, 9)],
  apex: APEX,
};

// Blood's path through the heart, for the flow animation: oxygen-poor (right side) and oxygen-rich (left).
export const FLOW = {
  poor: [
    smooth([[127, 14], [128, 120], [134, 170], [140, 214], [146, 250], [156, 292], [180, 326], [204, 318], [206, 280], [202, 238], [198, 196], [197, 150], [196, 116], [172, 104], [130, 98], [84, 102]]),
    smooth([[100, 392], [99, 340], [104, 286], [114, 246], [128, 220], [142, 200]]),
    smooth([[196, 116], [222, 104], [262, 96], [298, 98]]),
  ],
  rich: [
    smooth([[376, 148], [318, 156], [292, 168], [282, 200], [284, 240], [288, 290], [272, 338], [254, 322], [240, 282], [232, 240], [230, 200], [229, 130], [232, 92], [246, 60], [272, 46], [298, 52], [314, 74], [318, 104]]),
    smooth([[376, 186], [318, 182], [298, 196], [286, 226]]),
  ],
};

// ---------------------------------------------------------------------------------------------
// The outside, from the front: the right ventricle makes most of the front, the left ventricle a strip
// on the right of the picture down to the apex, the right atrium and its auricle on the left, the left
// auricle peeking out beside the pulmonary trunk. Coronary arteries run in fat-filled grooves.

const LAD: Pt[] = [[246, 172], [242, 200], [237, 240], [236, 280], [242, 320], [252, 356], [260, 378], [266, 391]];
const LCX: Pt[] = [[246, 172], [266, 177], [292, 183], [318, 193], [337, 206]];
const RCA: Pt[] = [[198, 158], [180, 168], [160, 182], [138, 202], [120, 226], [108, 250]];

export const ANTERIOR = {
  ra: 'M 114 126 C 98 134 88 158 88 186 C 88 214 96 236 108 252 C 116 232 132 210 150 192 C 168 176 186 160 200 150 C 196 136 186 126 172 120 C 152 116 130 118 114 126 Z',
  rv: 'M 200 150 C 186 160 168 176 150 192 C 132 210 116 232 108 252 C 128 296 176 344 236 376 C 246 382 256 388 263 391 C 252 360 241 320 236 280 C 233 240 236 204 244 174 C 232 160 220 152 200 150 Z',
  lv: 'M 244 174 C 236 204 233 240 236 280 C 241 320 252 360 263 391 C 264 392 265 393 266 393 C 292 380 320 344 334 298 C 344 262 346 222 336 190 C 318 182 296 176 270 172 C 258 170 250 171 244 174 Z',
  rightAuricle: smooth([[150, 152], [152, 138], [162, 126], [176, 118], [192, 113], [208, 110], [221, 112], [215, 121], [208, 130], [200, 139], [189, 147], [176, 154], [162, 157]], true),
  leftAuricle: smooth([[328, 170], [330, 154], [322, 140], [306, 131], [287, 128], [268, 132], [252, 140], [246, 148], [258, 153], [272, 158], [290, 166], [310, 172]], true),
  // Small folds on the auricles' edges.
  auricleFolds: ['M 170 126 Q 176 134 172 144', 'M 186 118 Q 192 128 188 138', 'M 202 114 Q 206 122 200 132', 'M 266 136 Q 272 144 268 152', 'M 284 132 Q 290 144 286 158', 'M 304 134 Q 310 148 304 162'],
  // The top of the right ventricle (the conus), which the pulmonary trunk rises out of.
  conus: smooth([[198, 170], [200, 156], [208, 147], [220, 144], [232, 147], [240, 156], [240, 168], [228, 175], [212, 175]], true),
  svc: vessel([[132, 10], [133, 70], [134, 132]], 26, 0),
  aorta: vessel([[196, 152], [194, 120], [193, 94], [204, 64], [232, 48], [266, 43], [296, 51], [314, 73], [318, 104], [318, 124]], 30, 0),
  aortaBranches: [vessel([[212, 58], [204, 32], [200, 10]], 13, 0), vessel([[240, 46], [242, 26], [242, 10]], 12, 0), vessel([[266, 44], [276, 24], [282, 10]], 12, 0)],
  trunk: vessel([[219, 160], [220, 130], [225, 106]], 28, 0),
  trunkBranches: [vessel([[224, 106], [250, 92], [284, 86], [300, 88]], 17, 0), vessel([[224, 106], [208, 100], [196, 99]], 17, 0)],
  // Coronary arteries: centre lines, so the flow animation can run along them and a blocked artery's
  // far end can turn grey.
  arteries: {
    leftMain: [[232, 166], [240, 170], [246, 172]] as Pt[],
    lad: LAD,
    diagonals: [
      [[240, 214], [262, 226], [290, 244], [312, 262]],
      [[237, 268], [258, 284], [282, 304], [300, 326]],
    ] as Pt[][],
    lcx: LCX,
    marginal: [[330, 201], [337, 228], [339, 262], [334, 296]] as Pt[],
    rca: RCA,
    acuteMarginal: [[110, 248], [130, 286], [160, 318], [196, 346], [226, 364]] as Pt[],
    rvBranches: [
      [[150, 192], [166, 216], [180, 244]],
      [[126, 218], [146, 246], [160, 274]],
      [[198, 160], [206, 168], [214, 178]],
    ] as Pt[][],
  },
  // Cardiac veins beside the arteries (blue, thinner).
  cardiacVeins: [
    [[253, 176], [249, 204], [244, 244], [243, 284], [249, 320], [258, 354]],
    [[253, 176], [272, 182], [298, 189], [322, 199], [338, 211]],
    [[134, 212], [150, 236], [162, 262]],
    [[160, 188], [174, 212], [186, 236]],
  ] as Pt[][],
  // Fat along the grooves.
  fat: [
    [[202, 152], [172, 172], [140, 200], [116, 232], [106, 256]],
    [[246, 168], [240, 210], [236, 262], [240, 306]],
    [[246, 170], [282, 178], [318, 190], [340, 204]],
    [[108, 252], [140, 300], [180, 336], [222, 360]],
  ] as Pt[][],
  ladTerritory:
    'M 222 178 C 223 222 219 270 228 320 C 236 352 250 378 266 393 C 292 380 312 350 322 310 C 316 272 308 238 300 207 C 280 192 260 182 240 175 C 233 175 227 176 222 178 Z',
  ladCore: 'M 236 238 C 238 280 245 330 262 386 C 282 370 298 344 306 314 C 300 290 290 266 280 246 C 266 239 251 237 236 238 Z',
  lcxTerritory: 'M 300 207 C 308 238 316 272 322 310 C 336 280 346 238 336 190 C 324 196 312 202 300 207 Z',
  baseLine: smooth([[100, 242], [150, 192], [200, 154], [262, 172], [338, 202]]),
  cuts: [368, 334, 298, 260],
  apex: APEX,
};

// ---------------------------------------------------------------------------------------------
// One slice across the ventricles, seen like the lab's slices: the front of the heart at the top, the
// right ventricle on the left. The walls' inner edges are ridged (trabeculae), the left ventricle has
// its two papillary muscles, and fat with the cut coronary vessels sits in the grooves front and back.

const C = { x: 262, y: 222 };
/** The left ventricle's outer edge (epicardium). */
const lvOuterR = (a: number) => 112 + 3 * Math.sin(2 * a + 0.4) + 1.4 * Math.sin(5 * a + 1.1) + 0.5 * Math.sin(9 * a);
/** Papillary muscles, front-lateral (upper right) and back-septal (lower left). */
export const PAPILLARY = [-0.62, 2.3];
/** The left ventricle's cavity edge (endocardium), ridged, with the papillary muscles bulging in. */
const lvInnerR = (a: number) =>
  53 +
  1.6 * Math.sin(3 * a) +
  0.9 * Math.sin(13 * a + 0.7) +
  0.6 * Math.sin(19 * a + 2) -
  5 * bump(a, PAPILLARY[0], 0.3) -
  4 * bump(a, PAPILLARY[1], 0.32);
/** Where the right ventricle meets the left, at the front and at the back. */
const JOIN = { front: -2.05, back: 2.15 };

const lvOuterPt = (a: number) => polarPt(C.x, C.y, a, lvOuterR(a));
const lvInnerPt = (a: number) => polarPt(C.x, C.y, a, lvInnerR(a));

/** Points along the left ventricle's outer edge from angle a to b (going the short or the long way). */
function lvArc(a: number, b: number, steps = 40, inner = false): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = a + ((b - a) * i) / steps;
    pts.push(inner ? lvInnerPt(t) : lvOuterPt(t));
  }
  return pts;
}

const RV_FREE_WALL: Pt[] = [lvOuterPt(JOIN.front), [160, 102], [112, 124], [86, 174], [82, 230], [96, 284], [134, 324], [176, 334], lvOuterPt(JOIN.back)];

/** The right ventricle's cavity: inside its free wall (11 thick, ridged), against the septum. */
function rvCavity(): string {
  const wall = sample(RV_FREE_WALL, 10).slice(3, -3);
  const inner: Pt[] = wall.map((p, i) => {
    const a = wall[Math.max(0, i - 1)];
    const b = wall[Math.min(wall.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const m = Math.hypot(dx, dy) || 1;
    const depth = 11 + 0.9 * Math.sin(i * 1.7) + 0.6 * Math.sin(i * 3.1 + 1);
    // The wall runs from the front junction round the left to the back one; inward is (dy, -dx).
    return [p[0] + (dy / m) * depth, p[1] - (dx / m) * depth];
  });
  // Back up along the septum's right-ventricle side, from the back junction round the left to the front.
  const septal = lvArc(JOIN.back + 0.1, JOIN.front + Math.PI * 2 - 0.1, 30);
  return smooth([...inner, ...septal], true);
}

/** Fat lying along the outer surface over a junction, thickest in the groove, with its artery and vein. */
function groove(at: number) {
  const steps = 16;
  const base: Pt[] = [];
  const top: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const a = at - 0.3 + 0.6 * u;
    const r = lvOuterR(a);
    base.push(polarPt(C.x, C.y, a, r - 2));
    top.push(polarPt(C.x, C.y, a, r + 2 + 13 * Math.sin(Math.PI * u) ** 0.8));
  }
  return {
    fat: smooth([...base, ...top.reverse()], true),
    artery: polarPt(C.x, C.y, at - 0.05, lvOuterR(at) + 8),
    vein: polarPt(C.x, C.y, at + 0.08, lvOuterR(at) + 7),
  };
}

/** The septum runs between the two junctions, round the left of the left ventricle. */
const SEPTUM_SPAN = [JOIN.back + 0.04, JOIN.front + Math.PI * 2 - 0.04] as const;

/** The infarct: dead muscle in the front wall, growing from the inner edge outward as `reach` goes from
 *  0 to 1 (the wavefront). It is deepest in the middle of the artery's territory and only inner at the
 *  sides, with a ragged edge like a real stained slice. */
export function infarctPath(reach: number): string {
  const from = -2.45;
  const to = -0.8;
  const steps = 44;
  const inner: Pt[] = [];
  const outer: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const a = from + (to - from) * u;
    const ri = lvInnerR(a) - 1;
    const ro = lvOuterR(a);
    const profile = 0.3 + 0.7 * Math.sin(Math.PI * u) ** 0.7;
    const ragged = 0.045 * Math.sin(a * 23 + 1.3) + 0.025 * Math.sin(a * 41 + 0.4);
    const depth = Math.max(0.04, Math.min(0.97, Math.min(profile, reach) + ragged * Math.min(1, reach * 2)));
    inner.push(polarPt(C.x, C.y, a, ri));
    outer.push(polarPt(C.x, C.y, a, ri + (ro - ri) * depth));
  }
  return smooth([...inner, ...outer.reverse()], true);
}

/** The front wall, full thickness: the artery's territory, the area at risk when it is blocked. */
function frontWall(): string {
  const from = -2.45;
  const to = -0.8;
  return smooth([...lvArc(from, to, 30, true), ...lvArc(from, to, 30).reverse()], true);
}

export const SLICE = {
  center: C,
  lvOuter: polarPath(C.x, C.y, lvOuterR),
  lvInner: polarPath(C.x, C.y, lvInnerR, 160),
  rvBody: smooth([...sample(RV_FREE_WALL, 8), ...lvArc(JOIN.back, JOIN.front + Math.PI * 2, 30).slice(1, -1)], true),
  rvOuter: smooth(RV_FREE_WALL),
  rvCavity: rvCavity(),
  // The papillary muscles cut across: two round masses in the cavity against the wall.
  papillary: PAPILLARY.map((a, i) => {
    const [x, y] = polarPt(C.x, C.y, a, lvInnerR(a) - 8);
    return { cx: r1(x), cy: r1(y), rx: i ? 12 : 14, ry: i ? 15 : 17, angle: r1((a * 180) / Math.PI) };
  }),
  septum: smooth([...lvArc(...SEPTUM_SPAN, 30), ...lvArc(...SEPTUM_SPAN, 30, true).reverse()], true),
  frontWall: frontWall(),
  // Fat in the grooves where the ventricles meet, with the cut artery and vein in each.
  grooves: [groove(JOIN.front), groove(JOIN.back)],
};

// ---------------------------------------------------------------------------------------------
// Labels: where each part's label points (heart coordinates), which side of the picture, and its row.

export type LabelSpot = { at: Pt; side: 'l' | 'r'; y: number };

const sliceAt = (a: number, frac: number): Pt => {
  const ri = lvInnerR(a);
  return polarPt(C.x, C.y, a, ri + (lvOuterR(a) - ri) * frac);
};

export const LABELS: Record<View, Record<string, LabelSpot>> = {
  section: {
    svc: { at: [127, 56], side: 'l', y: 40 },
    'pulmonary-trunk': { at: [150, 99], side: 'l', y: 86 },
    ra: { at: [134, 178], side: 'l', y: 146 },
    tricuspid: { at: [124, 252], side: 'l', y: 196 },
    'pulmonary-valve': { at: [198, 182], side: 'l', y: 226 },
    rv: { at: [168, 318], side: 'l', y: 274 },
    ivc: { at: [100, 362], side: 'l', y: 372 },
    aorta: { at: [272, 46], side: 'r', y: 30 },
    'pulmonary-veins': { at: [352, 150], side: 'r', y: 104 },
    la: { at: [286, 172], side: 'r', y: 156 },
    mitral: { at: [304, 234], side: 'r', y: 202 },
    'aortic-valve': { at: [230, 207], side: 'r', y: 232 },
    lv: { at: [292, 262], side: 'r', y: 266 },
    septum: { at: [226, 304], side: 'r', y: 304 },
    myocardium: { at: [322, 300], side: 'r', y: 344 },
    apex: { at: APEX, side: 'r', y: 404 },
  },
  anterior: {
    svc: { at: [133, 60], side: 'l', y: 40 },
    ra: { at: [108, 176], side: 'l', y: 140 },
    base: { at: [150, 192], side: 'l', y: 190 },
    rca: { at: [128, 216], side: 'l', y: 240 },
    rv: { at: [178, 282], side: 'l', y: 288 },
    'rca-territory': { at: [160, 316], side: 'l', y: 336 },
    aorta: { at: [266, 43], side: 'r', y: 30 },
    'pulmonary-trunk': { at: [218, 126], side: 'r', y: 78 },
    la: { at: [300, 150], side: 'r', y: 128 },
    lcx: { at: [306, 188], side: 'r', y: 170 },
    lad: { at: [237, 250], side: 'r', y: 214 },
    'lad-territory': { at: [272, 300], side: 'r', y: 254 },
    'lv-anterior-wall': { at: [272, 300], side: 'r', y: 254 },
    'lcx-territory': { at: [324, 262], side: 'r', y: 294 },
    lv: { at: [300, 336], side: 'r', y: 330 },
    epicardium: { at: [334, 298], side: 'r', y: 366 },
    apex: { at: APEX, side: 'r', y: 404 },
  },
  slice: {
    rv: { at: [88, 214], side: 'l', y: 176 },
    'rv-cavity': { at: [124, 228], side: 'l', y: 232 },
    septum: { at: sliceAt(Math.PI, 0.5), side: 'l', y: 288 },
    'lv-anterior-wall': { at: sliceAt(-1.62, 0.8), side: 'r', y: 56 },
    infarct: { at: sliceAt(-1.62, 0.3), side: 'r', y: 104 },
    epicardium: { at: lvOuterPt(-0.3), side: 'r', y: 156 },
    'lv-cavity': { at: [C.x + 6, C.y + 6], side: 'r', y: 204 },
    endocardium: { at: lvInnerPt(0.3), side: 'r', y: 244 },
    lv: { at: sliceAt(0.6, 0.55), side: 'r', y: 290 },
    myocardium: { at: sliceAt(1.15, 0.5), side: 'r', y: 336 },
  },
};
