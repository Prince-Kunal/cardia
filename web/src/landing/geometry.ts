// Geometry for the landing page's heart: the ventricles as a stack of short-axis slabs (so the same
// meshes are the whole heart, then the slices), and the parts that are trimmed away before slicing.
// Built on the parametric heart of heart3d/model.ts (same radii, same axes: y runs from the apex,
// y = 0, to the base, y = H). Every vertex carries `aKind`: 0 the outer surface (epicardium), 0.5 a
// cavity wall (endocardium), 1 a cut face; the tissue shader paints each differently.

import * as THREE from 'three';
import { H, RV_FROM, RV_TO, at, lvInner, lvOuter, rvBulge } from '../heart3d/model';

/** The landing heart's right ventricle is slimmer than the lesson model's, with a thicker wall, so a
 *  slice shows it as the crescent seen on the bench rather than a wide loop. */
const RV_SCALE = 0.72;
const RV_WALL = 0.1;
export const epicardium = (t: number, a: number) => lvOuter(t, a) + RV_SCALE * rvBulge(t, a);
/** A point on this heart's outer surface (degrees round the axis, height 0 → 1), lifted a little. */
export const onEpicardium = (deg: number, t: number, lift = 0.016) => at((deg * Math.PI) / 180, epicardium(t, (deg * Math.PI) / 180) + lift, t * H);
/** Cut faces stop just short of the outer surface, so no seam shows where slices meet. */
const RECESS = 0.004;

/** Where the slicer's blades cut, as heights 0 (apex) → 1 (base). Six slices; above the last cut is
 *  the base with the atria and great vessels, which is trimmed away first. */
export const CUTS = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9];
export const SLICES = CUTS.length - 1;
export const TRIM_FROM = CUTS[CUTS.length - 1];

type Part = { pos: number[]; nor: number[]; idx: number[]; kind: number };

/** A surface over heights t0..t1 and an angle span, at radius(t, a); normals point outward, or into
 *  the cavity when `inward`. */
function surface(
  t0: number,
  t1: number,
  span: [number, number],
  radius: (t: number, a: number) => number,
  kind: number,
  { nA = 96, nT = 8, inward = false } = {},
): Part {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= nT; i++) {
    const t = t0 + ((t1 - t0) * i) / nT;
    for (let j = 0; j <= nA; j++) {
      const a = span[0] + ((span[1] - span[0]) * j) / nA;
      const p = at(a, radius(t, a), t * H);
      pos.push(p.x, p.y, p.z);
    }
  }
  const row = nA + 1;
  for (let i = 0; i < nT; i++) {
    for (let j = 0; j < nA; j++) {
      const a = i * row + j;
      const b = a + row;
      if (inward) idx.push(a, a + 1, b, b, a + 1, b + 1);
      else idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // Normals from the surface's own shape (finite differences), not from the grid, so neighbouring
  // slices agree exactly where they meet and the whole heart shades as one.
  const nor: number[] = [];
  const e = 1e-3;
  const P = (t: number, a: number) => at(a, radius(Math.min(1, Math.max(0, t)), a), Math.min(1, Math.max(0, t)) * H);
  for (let i = 0; i <= nT; i++) {
    const t = t0 + ((t1 - t0) * i) / nT;
    for (let j = 0; j <= nA; j++) {
      const a = span[0] + ((span[1] - span[0]) * j) / nA;
      const da = P(t, a + e).sub(P(t, a - e));
      const dt = P(t + e, a).sub(P(t - e, a));
      const n = new THREE.Vector3().crossVectors(da, dt);
      if (n.lengthSq() < 1e-14) n.set(0, -1, 0);
      n.normalize();
      // Outward means away from the axis (or down, at the apex); cavity walls face the other way.
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).dot(n) + (t < 0.02 ? -n.y : 0) >= 0;
      if (out === inward) n.negate();
      nor.push(n.x, n.y, n.z);
    }
  }
  return { pos, nor, idx, kind };
}

/** A flat cut face at height t between an inner and an outer radius over an angle span, facing down
 *  (towards the apex) or up. */
function face(t: number, span: [number, number], inner: (a: number) => number, outer: (a: number) => number, down: boolean, n = 120): Part {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const y = t * H;
  for (let j = 0; j <= n; j++) {
    const a = span[0] + ((span[1] - span[0]) * j) / n;
    const pi = at(a, inner(a), y);
    const po = at(a, outer(a), y);
    pos.push(pi.x, y, pi.z, po.x, y, po.z);
    nor.push(0, down ? -1 : 1, 0, 0, down ? -1 : 1, 0);
  }
  for (let j = 0; j < n; j++) {
    const k = j * 2;
    // (inner j, inner j+1, outer j) winds towards +y; flip it for a face that looks down.
    if (down) idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    else idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  return { pos, nor, idx, kind: 1 };
}

function merge(parts: Part[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const kind: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const p of parts) {
    pos.push(...p.pos);
    nor.push(...p.nor);
    const count = p.pos.length / 3;
    for (let i = 0; i < count; i++) kind.push(p.kind);
    for (const i of p.idx) idx.push(i + base);
    base += count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const FULL: [number, number] = [0, Math.PI * 2];
const RV_IN: [number, number] = [RV_FROM + 0.1, RV_TO - 0.1];
const RV_CUT: [number, number] = [RV_FROM + 0.04, RV_TO - 0.04];
const rvInner = (t: number, a: number) => lvOuter(t, a) + Math.max(0.004, RV_SCALE * rvBulge(t, a) - RV_WALL);

/** One slab of the ventricles between heights t0 and t1, with cut faces where asked. `rvScale` 1 gives
 *  the lesson model's wide right ventricle (heart3d/model.ts) instead of the landing's slim one. */
export function slab(t0: number, t1: number, { bottom = true, top = true, rvScale = RV_SCALE, rvWall = RV_WALL } = {}): THREE.BufferGeometry {
  const epicardium = (t: number, a: number) => lvOuter(t, a) + rvScale * rvBulge(t, a);
  const rvInner = (t: number, a: number) => lvOuter(t, a) + Math.max(0.004, rvScale * rvBulge(t, a) - rvWall);
  const RV_WALL = rvWall;
  const nT = Math.max(3, Math.round((t1 - t0) * 48));
  const parts: Part[] = [
    surface(t0, t1, FULL, epicardium, 0, { nA: 128, nT }),
    surface(t0, t1, FULL, (t, a) => Math.max(0.001, lvInner(t, a)), 0.5, { nA: 72, nT, inward: true }),
    surface(t0, t1, RV_IN, rvInner, 0.5, { nA: 56, nT, inward: true }),
    // The septum seen from the right ventricle.
    surface(t0, t1, RV_IN, (t, a) => lvOuter(t, a) + 0.002, 0.5, { nA: 56, nT }),
  ];
  for (const [t, down, wanted] of [
    [t0, true, bottom],
    [t1, false, top],
  ] as const) {
    if (!wanted) continue;
    parts.push(face(t, FULL, (a) => lvInner(t, a) + RECESS, (a) => Math.min(lvOuter(t, a), epicardium(t, a) - RECESS), down));
    parts.push(face(t, RV_CUT, (a) => Math.max(lvOuter(t, a), epicardium(t, a) - RV_WALL), (a) => epicardium(t, a) - RECESS, down, 72));
  }
  return merge(parts);
}

/** The slices, apex first, and the point each one turns about (the middle of its cut face area). */
export function buildSlabs() {
  return CUTS.slice(0, -1).map((t0, i) => {
    const t1 = CUTS[i + 1];
    const geometry = slab(t0, t1, { bottom: i > 0, top: true });
    const tm = (t0 + t1) / 2;
    // The slab's centre: shifted towards the right ventricle, which bulges on that side.
    const centre = new THREE.Vector3(-0.1 * Math.min(1, tm * 2), tm * H, 0.06 * Math.min(1, tm * 2));
    return { geometry, t0, t1, centre };
  });
}

/** The base of the ventricles above the last cut, trimmed away with the atria. */
export function buildBase(): THREE.BufferGeometry {
  return slab(TRIM_FROM, 1, { bottom: true, top: false });
}

/** A point in the middle of the wall, on a slice's apical face: for labels and the camera. */
export function wallPoint(t: number, angleDeg: number, depth = 0.5): THREE.Vector3 {
  const a = (angleDeg * Math.PI) / 180;
  const ri = lvInner(t, a);
  const ro = lvOuter(t, a);
  return at(a, ri + (ro - ri) * depth, t * H);
}

/** The middle of a cavity on a slice's apical face. */
export function cavityPoint(t: number, which: 'lv' | 'rv'): THREE.Vector3 {
  if (which === 'lv') return new THREE.Vector3(0, t * H, 0);
  const a = (150 * Math.PI) / 180;
  return at(a, (lvOuter(t, a) + rvInner(t, a)) / 2, t * H);
}

/** A point on the right ventricle's free wall. */
export function rvWallPoint(t: number, angleDeg = 150): THREE.Vector3 {
  const a = (angleDeg * Math.PI) / 180;
  return at(a, epicardium(t, a) - RV_WALL / 2, t * H);
}
