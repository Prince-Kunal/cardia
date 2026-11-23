// The 3D heart v1: a stylised heart modelled in code (PLAN.md §11a item 3, §13 item 8), with the
// part ids of PLAN.md §3f so the same lesson scenes drive it as drive the 2D diagram. A model from
// Z-Anatomy, NIH 3D or a paid source can replace it later, keeping the ids.
//
// Model space: y runs up the long axis, from the apex (y = 0) to the base (y = H). Round the axis,
// the angle a is 0 at the left ventricle's lateral wall (+x, the patient's left), π/2 at the front
// (+z) and π at the patient's right (-x). The right ventricle wraps round the front and right of the
// left ventricle, from the front groove (where the LAD runs) to the back groove. Pure geometry: no
// WebGL needed, so it can be tested.

import * as THREE from 'three';

export const H = 2;
const DEG = Math.PI / 180;
/** The right ventricle spans these angles: the front (anterior) groove to the back (posterior) one. */
export const RV_FROM = 60 * DEG;
export const RV_TO = 240 * DEG;
export const RV_WALL = 0.07;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** An angle's place in the right ventricle's span, 0 → 1, or -1 outside it. */
function rvSpan(a: number): number {
  const d = (((a - RV_FROM) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return d <= RV_TO - RV_FROM ? d / (RV_TO - RV_FROM) : -1;
}

/** The left ventricle's outer radius: a rounded bullet, closed at the apex, a little narrower at the base. */
export function lvOuter(t: number, a: number): number {
  const u = Math.min(t / 0.8, 1);
  return 0.78 * Math.pow(1 - (1 - u) ** 2, 0.55) * (1 - 0.1 * smoothstep(0.8, 1, t)) * (1 + 0.04 * Math.cos(2 * a));
}
/** The left ventricle's cavity: a thick wall (about three times the right's), closing near the apex. */
export function lvInner(t: number, a: number): number {
  return Math.max(0, lvOuter(t, a) - 0.25 - 0.04 * t);
}
/** How far the right ventricle stands out from the left one. */
export function rvBulge(t: number, a: number): number {
  const u = rvSpan(a);
  if (u < 0) return 0;
  return 0.5 * smoothstep(0.06, 0.5, t) * (1 - 0.1 * smoothstep(0.85, 1, t)) * Math.sin(Math.PI * u) ** 0.75;
}
/** The outer surface of both ventricles. */
export const epicardium = (t: number, a: number) => lvOuter(t, a) + rvBulge(t, a);

export const at = (a: number, r: number, y: number) => new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
/** A point on the outer surface, lifted a little off it. */
export const onSurface = (a: number, t: number, lift = 0) => at(a, epicardium(t, a) + lift, t * H);

// ---------------------------------------------------------------------------------------------
// Builders

/** A surface over angles and heights: radius(t, a) round the axis. */
export function patch(
  t0: number,
  t1: number,
  span: (t: number) => [number, number],
  radius: (t: number, a: number) => number,
  { nA = 64, nT = 40, inward = false } = {},
): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= nT; i++) {
    const t = t0 + ((t1 - t0) * i) / nT;
    const [a0, a1] = span(t);
    for (let j = 0; j <= nA; j++) {
      const a = a0 + ((a1 - a0) * j) / nA;
      const p = at(a, radius(t, a), t * H);
      pos.push(p.x, p.y, p.z);
    }
  }
  const row = nA + 1;
  for (let i = 0; i < nT; i++) {
    for (let j = 0; j < nA; j++) {
      const a = i * row + j;
      const b = a + row;
      // Angles grow from +x towards +z; seen from outside, (a, b, a+1) runs counter-clockwise.
      if (inward) idx.push(a, a + 1, b, b, a + 1, b + 1);
      else idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A tube along a curve, its radius going from r0 to r1. */
export function taperedTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, segments = 48, radial = 10): THREE.BufferGeometry {
  const g = new THREE.TubeGeometry(curve, segments, 1, radial, false);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const c = curve.getPointAt(u);
    const r = r0 + (r1 - r0) * u;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.setXYZ(k, c.x + (p.getX(k) - c.x) * r, c.y + (p.getY(k) - c.y) * r, c.z + (p.getZ(k) - c.z) * r);
    }
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

const curve = (pts: number[][]) => new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
/** A curve over the outer surface, through (angle in degrees, height t) points. */
const surfaceCurve = (pts: number[][], lift = 0.022) =>
  new THREE.CatmullRomCurve3(pts.map(([d, t]) => onSurface(d * DEG, t, lift)), false, 'centripetal');

/** A flat region in a cross-section, between an inner and an outer radius over a span of angles. */
function band(
  span: [number, number],
  inner: (a: number) => number,
  outer: (a: number) => number,
  n = 64,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= n; j++) {
    const a = span[0] + ((span[1] - span[0]) * j) / n;
    const pi = at(a, inner(a), 0);
    const po = at(a, outer(a), 0);
    pos.push(pi.x, 0, pi.z, po.x, 0, po.z);
  }
  for (let j = 0; j < n; j++) {
    const k = j * 2;
    // Facing -y (towards the apex, where the slice is seen from).
    idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------------
// The whole heart

const full = (): [number, number] => [0, Math.PI * 2];
const lvSpan = (): [number, number] => [RV_TO, RV_FROM + Math.PI * 2];
const rvSpanAngles = (): [number, number] => [RV_FROM, RV_TO];

/** Where the great vessels and atria sit. */
const ROOT = {
  aortic: new THREE.Vector3(-0.05, 2.0, 0.12),
  pulmonary: new THREE.Vector3(-0.06, 2.22, 0.66),
  tricuspid: new THREE.Vector3(-0.68, 2.0, 0.2),
  mitral: new THREE.Vector3(0.24, 2.0, -0.18),
};

export function buildHeart() {
  const curves = {
    aorta: curve([
      [-0.05, 1.85, 0.12],
      [-0.12, 2.5, 0.16],
      [-0.08, 2.95, 0.05],
      [0.2, 3.12, -0.12],
      [0.5, 2.95, -0.38],
      [0.58, 2.4, -0.6],
      [0.58, 1.4, -0.72],
    ]),
    aortaBranches: [
      [[-0.02, 3.0, 0.02], [-0.12, 3.35, 0.05], [-0.2, 3.7, 0.08]],
      [[0.18, 3.1, -0.1], [0.2, 3.4, -0.1], [0.22, 3.7, -0.1]],
      [[0.38, 3.04, -0.26], [0.5, 3.35, -0.28], [0.6, 3.68, -0.3]],
    ].map(curve),
    // From the top of the right ventricle at the front, up and back, dividing under the arch.
    trunk: curve([
      [-0.12, 1.85, 0.75],
      [-0.02, 2.4, 0.62],
      [0.12, 2.78, 0.3],
    ]),
    trunkBranches: [
      curve([[0.12, 2.78, 0.3], [0.5, 2.8, 0.1], [0.95, 2.72, -0.02]]),
      curve([[0.12, 2.78, 0.3], [-0.08, 2.7, -0.32], [-0.9, 2.65, -0.4]]),
    ],
    svc: curve([[-0.78, 3.5, -0.05], [-0.74, 3.0, -0.02], [-0.7, 2.5, 0.0]]),
    ivc: curve([[-0.66, 0.9, -0.42], [-0.68, 1.4, -0.3], [-0.7, 1.9, -0.16]]),
    veins: [
      curve([[1.2, 2.32, -0.5], [0.85, 2.3, -0.48], [0.5, 2.28, -0.46]]),
      curve([[1.2, 2.06, -0.56], [0.85, 2.06, -0.52], [0.5, 2.06, -0.5]]),
      curve([[-0.5, 2.36, -0.82], [-0.2, 2.34, -0.72], [0.05, 2.32, -0.62]]),
      curve([[-0.5, 2.1, -0.86], [-0.2, 2.08, -0.76], [0.05, 2.07, -0.66]]),
    ],
    // Coronary arteries over the surface, as (degrees round the axis, height) points.
    lad: surfaceCurve([[64, 0.97], [60, 0.85], [57, 0.7], [56, 0.5], [58, 0.3], [70, 0.14], [110, 0.05], [150, 0.02]]),
    diagonals: [
      surfaceCurve([[58, 0.8], [44, 0.7], [30, 0.58], [20, 0.46]]),
      surfaceCurve([[56, 0.58], [42, 0.47], [30, 0.36], [22, 0.27]]),
    ],
    leftMain: curve([[0.0, 2.0, 0.25], [0.2, 1.98, 0.5], [0.35, 1.94, 0.72]]),
    lcx: surfaceCurve([[64, 0.97], [40, 0.965], [15, 0.96], [-15, 0.955], [-45, 0.95], [-80, 0.95]]),
    marginal: surfaceCurve([[5, 0.96], [0, 0.8], [-4, 0.62], [-6, 0.45]]),
    rca: surfaceCurve([[100, 0.985], [130, 0.975], [160, 0.965], [190, 0.955], [220, 0.95], [238, 0.94]]),
    acuteMarginal: surfaceCurve([[165, 0.96], [168, 0.75], [172, 0.55], [176, 0.38]]),
    pda: surfaceCurve([[238, 0.94], [240, 0.75], [242, 0.5], [240, 0.3]]),
  };

  const geometries = {
    lv: patch(0, 1, lvSpan, epicardium, { nA: 48 }),
    rv: patch(0, 1, rvSpanAngles, epicardium, { nA: 64 }),
    septum: patch(0.06, 1, rvSpanAngles, (t, a) => lvOuter(t, a) + 0.004, { nA: 48 }),
    lvCavity: patch(0.04, 1, full, lvInner, { nA: 48, nT: 32 }),
    rvCavity: patch(0.12, 1, () => [RV_FROM + 0.12, RV_TO - 0.12], (t, a) => lvOuter(t, a) + Math.max(0.01, rvBulge(t, a) - RV_WALL), {
      nA: 48,
      nT: 32,
    }),
    // A cap over the top of the ventricles (under the atria and valves).
    base: new THREE.CircleGeometry(0.95, 40).rotateX(-Math.PI / 2).translate(-0.18, H * 0.995, 0.1),
    // The base, where the atria meet the ventricles: a ring along that groove, shown when highlighted.
    baseRing: new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(Array.from({ length: 48 }, (_, i) => onSurface((i / 48) * Math.PI * 2, 0.965, 0.02)), true),
      96,
      0.035,
      8,
      true,
    ),
    ra: new THREE.SphereGeometry(1, 32, 20).scale(0.5, 0.42, 0.46).translate(-0.7, 2.18, 0.02),
    la: new THREE.SphereGeometry(1, 32, 20).scale(0.48, 0.36, 0.42).translate(0.3, 2.18, -0.42),
    raCavity: new THREE.SphereGeometry(1, 24, 16).scale(0.42, 0.34, 0.38).translate(-0.7, 2.18, 0.02),
    laCavity: new THREE.SphereGeometry(1, 24, 16).scale(0.4, 0.29, 0.34).translate(0.3, 2.18, -0.42),
    // The auricles: ear-like pouches on the front of each atrium.
    rightAuricle: new THREE.SphereGeometry(1, 24, 14).scale(0.36, 0.16, 0.2).rotateZ(-0.45).rotateY(-0.5).translate(-0.4, 2.36, 0.42),
    leftAuricle: new THREE.SphereGeometry(1, 24, 14).scale(0.32, 0.14, 0.18).rotateZ(0.35).rotateY(0.7).translate(0.56, 2.18, 0.2),
    valves: {
      tricuspid: new THREE.TorusGeometry(0.2, 0.035, 8, 32).rotateX(Math.PI / 2).translate(ROOT.tricuspid.x, ROOT.tricuspid.y, ROOT.tricuspid.z),
      mitral: new THREE.TorusGeometry(0.19, 0.035, 8, 32).rotateX(Math.PI / 2).translate(ROOT.mitral.x, ROOT.mitral.y, ROOT.mitral.z),
      'aortic-valve': new THREE.TorusGeometry(0.15, 0.03, 8, 28).rotateX(Math.PI / 2).translate(ROOT.aortic.x, ROOT.aortic.y, ROOT.aortic.z),
      'pulmonary-valve': new THREE.TorusGeometry(0.14, 0.03, 8, 28).rotateX(Math.PI / 2.6).translate(ROOT.pulmonary.x, ROOT.pulmonary.y, ROOT.pulmonary.z),
    },
    aorta: [new THREE.TubeGeometry(curves.aorta, 64, 0.17, 16), ...curves.aortaBranches.map((c) => new THREE.TubeGeometry(c, 16, 0.065, 10))],
    trunk: [new THREE.TubeGeometry(curves.trunk, 24, 0.16, 16), ...curves.trunkBranches.map((c) => new THREE.TubeGeometry(c, 24, 0.105, 12))],
    svc: new THREE.TubeGeometry(curves.svc, 20, 0.13, 14),
    ivc: new THREE.TubeGeometry(curves.ivc, 20, 0.14, 14),
    veins: curves.veins.map((c) => new THREE.TubeGeometry(c, 12, 0.07, 10)),
    lad: [taperedTube(curves.lad, 0.034, 0.012), ...curves.diagonals.map((c) => taperedTube(c, 0.022, 0.009, 24, 8))],
    lcx: [taperedTube(curves.lcx, 0.03, 0.02), taperedTube(curves.marginal, 0.02, 0.009, 24, 8)],
    rca: [taperedTube(curves.rca, 0.032, 0.024), taperedTube(curves.acuteMarginal, 0.02, 0.009, 24, 8), taperedTube(curves.pda, 0.022, 0.01, 24, 8)],
    leftMain: taperedTube(curves.leftMain, 0.036, 0.034, 12, 10),
    // Territories: thin layers just over the surface, coloured when they matter.
    ladTerritory: patch(0, 0.95, (t) => {
      const w = 34 * DEG + 150 * DEG * (1 - smoothstep(0, 0.24, t));
      return [62 * DEG - w, 62 * DEG + w * 0.55];
    }, (t, a) => epicardium(t, a) + 0.008),
    lcxTerritory: patch(0.22, 0.95, () => [-85 * DEG, 22 * DEG], (t, a) => epicardium(t, a) + 0.008),
    rcaTerritory: patch(0.16, 0.95, () => [RV_FROM + 0.1, RV_TO + 0.25], (t, a) => epicardium(t, a) + 0.008),
  };

  return { curves, geometries };
}

/** The LAD's far part, from the point where a clot blocks it (for the occlusion animation). */
export const LAD_BLOCK = 0.12;

// ---------------------------------------------------------------------------------------------
// One slice across the ventricles, flat in the x–z plane, seen from the apex (like the lab's slices,
// with the front at the top and the right ventricle on the left).

export const SLICE_T = 0.5;
const sOuter = (a: number) => lvOuter(SLICE_T, a);
const sInner = (a: number) => lvInner(SLICE_T, a);
const sRvOuter = (a: number) => epicardium(SLICE_T, a);
const sRvInner = (a: number) => sOuter(a) + Math.max(0.004, rvBulge(SLICE_T, a) - RV_WALL);
/** The infarct's span: the LAD's territory in this slice, the front wall and the front of the septum. */
export const INFARCT_SPAN: [number, number] = [32 * DEG, 118 * DEG];

export function buildSlice() {
  const lvSpanS: [number, number] = [RV_TO, RV_FROM + Math.PI * 2];
  const septumSpan: [number, number] = [RV_FROM, RV_TO];
  const rvSpanS: [number, number] = [RV_FROM + 0.04, RV_TO - 0.04];
  // The papillary muscles cut across: round masses against the inner wall.
  const papillary = [38 * DEG, 252 * DEG].map((a, i) => {
    const c = at(a, sInner(a) - 0.035, 0);
    return new THREE.CircleGeometry(i ? 0.075 : 0.09, 24).rotateX(Math.PI / 2).translate(c.x, 0.001, c.z);
  });
  return {
    lvWall: band(lvSpanS, sInner, sOuter),
    septum: band(septumSpan, sInner, sOuter),
    rvWall: band(rvSpanS, (a) => Math.max(sOuter(a), sRvOuter(a) - RV_WALL), sRvOuter),
    lvCavity: band([0, Math.PI * 2], () => 0, sInner),
    rvCavity: band(rvSpanS, sOuter, sRvInner),
    frontWall: band(INFARCT_SPAN, sInner, sOuter),
    // The front wall's outline: the area at risk while the artery is blocked.
    riskOutline: new THREE.BufferGeometry().setFromPoints([
      ...Array.from({ length: 33 }, (_, j) => {
        const a = INFARCT_SPAN[0] + ((INFARCT_SPAN[1] - INFARCT_SPAN[0]) * j) / 32;
        return at(a, sInner(a), -0.004);
      }),
      ...Array.from({ length: 33 }, (_, j) => {
        const a = INFARCT_SPAN[1] - ((INFARCT_SPAN[1] - INFARCT_SPAN[0]) * j) / 32;
        return at(a, sOuter(a), -0.004);
      }),
    ]),
    papillary,
    // The inner and outer layers as thin bands, so they show when highlighted.
    endocardium: band([0, Math.PI * 2], sInner, (a) => sInner(a) + 0.035, 96),
    epicardium: band([0, Math.PI * 2], (a) => sRvOuter(a) - 0.035, sRvOuter, 96),
    // The slab's edge, so the slice has some thickness when turned.
    rim: patch(SLICE_T - 0.03, SLICE_T + 0.03, full, epicardium, { nA: 96, nT: 1 }).translate(0, -SLICE_T * H, 0),
  };
}

/** The dead zone in the slice: from the inner wall outward, `reach` 0 → 1 (the wavefront), deepest in
 *  the middle of the territory and only inner at its sides. */
export function infarctGeometry(reach: number): THREE.BufferGeometry {
  const [from, to] = INFARCT_SPAN;
  return band(
    [from, to],
    (a) => sInner(a) - 0.002,
    (a) => {
      const u = (a - from) / (to - from);
      const profile = 0.3 + 0.7 * Math.sin(Math.PI * u) ** 0.7;
      const ragged = 0.05 * Math.sin(a * 23 + 1.3) + 0.03 * Math.sin(a * 41 + 0.4);
      const depth = Math.max(0.04, Math.min(0.96, Math.min(profile, reach) + ragged * Math.min(1, reach * 2)));
      return sInner(a) + (sOuter(a) - sInner(a)) * depth;
    },
    48,
  ).translate(0, -0.002, 0);
}

// ---------------------------------------------------------------------------------------------
// Slabs for the slicing animation: the ventricles cut into slices from the apex to the base.

export const SLAB_CUTS = [0.12, 0.3, 0.48, 0.66, 0.84, 0.97];

/** One slab between heights t0 and t1: its outer surface, both cavities' walls, and its cut faces. */
export function slabGeometry(t0: number, t1: number): THREE.BufferGeometry {
  const parts = [
    patch(t0, t1, full, epicardium, { nA: 64, nT: 6 }),
    patch(t0, t1, full, (t, a) => Math.max(0.001, lvInner(t, a)), { nA: 48, nT: 4, inward: true }),
    patch(t0, t1, () => [RV_FROM + 0.1, RV_TO - 0.1], (t, a) => lvOuter(t, a) + Math.max(0.004, rvBulge(t, a) - RV_WALL), {
      nA: 40,
      nT: 4,
      inward: true,
    }),
  ];
  for (const t of [t0, t1]) {
    const lv = band([0, Math.PI * 2], (a) => lvInner(t, a), (a) => lvOuter(t, a), 64);
    const rv = band([RV_FROM + 0.04, RV_TO - 0.04], (a) => Math.max(lvOuter(t, a), epicardium(t, a) - RV_WALL), (a) => epicardium(t, a), 48);
    for (const g of [lv, rv]) {
      // Both cut faces use the same triangles; slabs are drawn from both sides.
      g.translate(0, t * H, 0);
      parts.push(g);
    }
  }
  return mergeGeometries(parts);
}

/** Joins indexed geometries with positions only (and recomputes normals). */
export function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    const index = g.getIndex();
    if (index) for (let i = 0; i < index.count; i++) idx.push(index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(i + base);
    base += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

// ---------------------------------------------------------------------------------------------
// Where labels point, in model space (whole heart) and in the slice's plane.

export const LABEL_AT: Record<string, THREE.Vector3> = {
  lv: onSurface(-10 * DEG, 0.55, 0.02),
  rv: onSurface(120 * DEG, 0.5, 0.02),
  ra: new THREE.Vector3(-1.1, 2.2, 0.15),
  la: new THREE.Vector3(0.75, 2.22, 0.22),
  septum: at(150 * DEG, lvOuter(0.55, 150 * DEG), 0.55 * H),
  tricuspid: ROOT.tricuspid.clone(),
  mitral: ROOT.mitral.clone(),
  'aortic-valve': ROOT.aortic.clone(),
  'pulmonary-valve': ROOT.pulmonary.clone(),
  aorta: new THREE.Vector3(0.2, 3.25, -0.1),
  'pulmonary-trunk': new THREE.Vector3(-0.02, 2.45, 0.64),
  svc: new THREE.Vector3(-0.78, 3.2, -0.04),
  ivc: new THREE.Vector3(-0.68, 1.2, -0.36),
  'pulmonary-veins': new THREE.Vector3(1.05, 2.3, -0.5),
  lad: onSurface(57 * DEG, 0.55, 0.04),
  lcx: onSurface(10 * DEG, 0.96, 0.04),
  rca: onSurface(150 * DEG, 0.965, 0.04),
  'lad-territory': onSurface(40 * DEG, 0.4, 0.02),
  'lv-anterior-wall': onSurface(40 * DEG, 0.4, 0.02),
  'lcx-territory': onSurface(-40 * DEG, 0.6, 0.02),
  'rca-territory': onSurface(140 * DEG, 0.35, 0.02),
  apex: new THREE.Vector3(0, 0, 0),
  base: onSurface(110 * DEG, 0.97, 0.03),
  myocardium: onSurface(-30 * DEG, 0.3, 0.02),
  epicardium: onSurface(10 * DEG, 0.25, 0.02),
};

const sliceMid = (a: number, frac: number) => at(a, sInner(a) + (sOuter(a) - sInner(a)) * frac, 0);
export const SLICE_LABEL_AT: Record<string, THREE.Vector3> = {
  lv: sliceMid(-30 * DEG, 0.5),
  rv: at(150 * DEG, sRvOuter(150 * DEG) - RV_WALL / 2, 0),
  septum: sliceMid(180 * DEG, 0.5),
  'lv-cavity': new THREE.Vector3(0.05, 0, -0.05),
  'rv-cavity': at(150 * DEG, (sOuter(150 * DEG) + sRvInner(150 * DEG)) / 2, 0),
  endocardium: at(-20 * DEG, sInner(-20 * DEG), 0),
  epicardium: at(-50 * DEG, sOuter(-50 * DEG), 0),
  myocardium: sliceMid(-80 * DEG, 0.5),
  infarct: sliceMid(75 * DEG, 0.3),
  'lv-anterior-wall': sliceMid(75 * DEG, 0.75),
};
