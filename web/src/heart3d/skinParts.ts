// Which part of the heart each point of a real model is (realHeart.ts), so that lessons highlight,
// point at and label the real model's own surface, in its own shape. The drawn model (model.ts) knows
// where every part is; each vertex of the real model takes the part it is nearest to, once, when the
// model loads. Thin parts (coronary arteries, valves) and surface regions (territories, the base,
// the apex) are claimed only close by, measured round the heart's axis for those that lie on the
// surface, so they follow the real surface even where it stands off the drawn one.
//
// Everything here works in the heart frame of model.ts: apex at y = 0, base at y = H, front towards +z.

import * as THREE from 'three';
import { H, LABEL_AT, RV_WALL, buildHeart, epicardium, lvInner, lvOuter, rvBulge } from './model';

type Geos = ReturnType<typeof buildHeart>['geometries'];
type Skin = 'realistic' | 'interior';

interface PartDef {
  ids: string[];
  geo: (g: Geos) => THREE.BufferGeometry[];
  /** Which skins the part is on (the outside, the inside, or both). */
  on: Skin[];
  /** Claimed only within this distance (thin parts); measured round the axis when `surface`. */
  near?: number;
  surface?: boolean;
}

const BOTH: Skin[] = ['realistic', 'interior'];

/** Parts a vertex belongs to (one each). Their order is the index in the shader's level array. */
export const SKIN_PARTS: PartDef[] = [
  { ids: ['lv', 'myocardium', 'epicardium'], geo: (g) => [g.lv], on: BOTH },
  { ids: ['rv', 'myocardium', 'epicardium'], geo: (g) => [g.rv], on: BOTH },
  { ids: ['septum', 'myocardium'], geo: (g) => [g.septum], on: ['interior'] },
  { ids: ['lv', 'lv-cavity'], geo: (g) => [g.lvCavity], on: ['interior'] },
  { ids: ['rv', 'rv-cavity'], geo: (g) => [g.rvCavity], on: ['interior'] },
  { ids: ['ra'], geo: (g) => [g.ra, g.rightAuricle, g.raCavity], on: BOTH },
  { ids: ['la'], geo: (g) => [g.la, g.leftAuricle, g.laCavity], on: BOTH },
  { ids: ['aorta'], geo: (g) => g.aorta, on: BOTH },
  { ids: ['pulmonary-trunk'], geo: (g) => g.trunk, on: BOTH },
  { ids: ['svc'], geo: (g) => [g.svc], on: BOTH },
  { ids: ['ivc'], geo: (g) => [g.ivc], on: BOTH },
  { ids: ['pulmonary-veins'], geo: (g) => g.veins, on: BOTH },
  { ids: ['lad'], geo: (g) => g.lad, on: ['realistic'], near: 0.075, surface: true },
  { ids: ['lcx'], geo: (g) => g.lcx, on: ['realistic'], near: 0.075, surface: true },
  { ids: ['rca'], geo: (g) => g.rca, on: ['realistic'], near: 0.075, surface: true },
  { ids: ['left-main'], geo: (g) => [g.leftMain], on: ['realistic'], near: 0.09 },
  { ids: ['tricuspid'], geo: (g) => [g.valves.tricuspid], on: ['interior'], near: 0.16 },
  { ids: ['mitral'], geo: (g) => [g.valves.mitral], on: ['interior'], near: 0.16 },
  { ids: ['aortic-valve'], geo: (g) => [g.valves['aortic-valve']], on: ['interior'], near: 0.14 },
  { ids: ['pulmonary-valve'], geo: (g) => [g.valves['pulmonary-valve']], on: ['interior'], near: 0.14 },
];

/** Regions a vertex can be in as well as its part (bits of `aFlags`). */
export const SKIN_FLAGS: PartDef[] = [
  { ids: ['lad-territory', 'lv-anterior-wall'], geo: (g) => [g.ladTerritory], on: ['realistic'], near: 0.07, surface: true },
  { ids: ['lcx-territory'], geo: (g) => [g.lcxTerritory], on: ['realistic'], near: 0.07, surface: true },
  { ids: ['rca-territory'], geo: (g) => [g.rcaTerritory], on: ['realistic'], near: 0.07, surface: true },
  { ids: ['base'], geo: (g) => [g.baseRing], on: BOTH, near: 0.1, surface: true },
  { ids: ['apex'], geo: () => [], on: BOTH },
];

/** The shader's level arrays are this long. */
export const MAX_PARTS = 24;
export const MAX_FLAGS = 8;

/** Points of a set of geometries, in the heart frame. */
function points(geos: THREE.BufferGeometry[]): number[] {
  const out: number[] = [];
  for (const g of geos) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) out.push(p.getX(i), p.getY(i), p.getZ(i));
  }
  return out;
}

/** A grid of points for nearest-neighbour search; values are the points' labels. */
class Grid {
  private cells = new Map<string, number[]>();
  private size: number;
  constructor(size: number) {
    this.size = size;
  }
  private key(x: number, y: number, z: number) {
    return `${Math.floor(x / this.size)},${Math.floor(y / this.size)},${Math.floor(z / this.size)}`;
  }
  add(x: number, y: number, z: number, label: number) {
    const k = this.key(x, y, z);
    let c = this.cells.get(k);
    if (!c) this.cells.set(k, (c = []));
    c.push(x, y, z, label);
  }
  /** The label of the nearest point within `reach` cells, and its squared distance. */
  nearest(x: number, y: number, z: number, reach = 2): [number, number] {
    const cx = Math.floor(x / this.size);
    const cy = Math.floor(y / this.size);
    const cz = Math.floor(z / this.size);
    let best = -1;
    let bestD = Infinity;
    for (let r = 1; r <= reach && best < 0; r++)
      for (let i = -r; i <= r; i++)
        for (let j = -r; j <= r; j++)
          for (let k = -r; k <= r; k++) {
            const c = this.cells.get(`${cx + i},${cy + j},${cz + k}`);
            if (!c) continue;
            for (let n = 0; n < c.length; n += 4) {
              const d = (c[n] - x) ** 2 + (c[n + 1] - y) ** 2 + (c[n + 2] - z) ** 2;
              if (d < bestD) {
                bestD = d;
                best = c[n + 3];
              }
            }
          }
    return [best, bestD];
  }
}

/** Round the axis: angle (as arc length at a typical radius) and height, so a point on the real
 *  surface matches a drawn surface point above or below it whatever their radii. */
function cyl(x: number, y: number, z: number): [number, number] {
  return [Math.atan2(z, x) * 0.8, y];
}
function cylDist2(a: [number, number], b: [number, number]): number {
  let da = a[0] - b[0];
  const turn = Math.PI * 2 * 0.8;
  da = ((((da + turn / 2) % turn) + turn) % turn) - turn / 2;
  return da * da + (a[1] - b[1]) ** 2;
}

export interface SkinLabels {
  /** Where each part's label sits on the real surface (heart frame). */
  anchors: Record<string, THREE.Vector3>;
}

/** Label every vertex of a real model (geometry in its own space, `align` into the heart frame):
 *  adds `aPart` (part index + 1, 0 for none) and `aFlags` (region bits). Done once per geometry. */
export function labelSkin(geometry: THREE.BufferGeometry, align: THREE.Matrix4, skin: Skin): SkinLabels {
  const cached = geometry.userData.skinLabels as SkinLabels | undefined;
  if (cached) return cached;
  const { geometries: g } = buildHeart();
  const pos = geometry.getAttribute('position');
  const n = pos.count;
  const hp = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(align);
    hp[i * 3] = v.x;
    hp[i * 3 + 1] = v.y;
    hp[i * 3 + 2] = v.z;
  }

  // Broad parts: nearest wins.
  const grid = new Grid(0.12);
  SKIN_PARTS.forEach((part, index) => {
    if (part.near !== undefined || !part.on.includes(skin)) return;
    const p = points(part.geo(g));
    for (let i = 0; i < p.length; i += 3) grid.add(p[i], p[i + 1], p[i + 2], index);
  });
  const partOf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [best] = grid.nearest(hp[i * 3], hp[i * 3 + 1], hp[i * 3 + 2], 3);
    partOf[i] = best + 1;
  }

  // Inside the cut-open heart, the ventricles by where a point is round the axis: the left cavity, its
  // wall (the septum where the right ventricle lies beside it), the right cavity, the right wall. More
  // faithful than the nearest drawn sheet for a cut face and the walls seen inside.
  if (skin === 'interior') {
    const idx = (ids0: string, ids1?: string) => SKIN_PARTS.findIndex((p) => p.ids[0] === ids0 && (!ids1 || p.ids[1] === ids1)) + 1;
    const LV = idx('lv', 'myocardium');
    const RV = idx('rv', 'myocardium');
    const SEPTUM = idx('septum');
    const LVC = idx('lv', 'lv-cavity');
    const RVC = idx('rv', 'rv-cavity');
    const ventricular = new Set([LV, RV, SEPTUM, LVC, RVC]);
    for (let i = 0; i < n; i++) {
      const x = hp[i * 3];
      const y = hp[i * 3 + 1];
      const z = hp[i * 3 + 2];
      const t = y / H;
      if (t < 0 || t > 0.93 || !ventricular.has(partOf[i])) continue;
      const a = Math.atan2(z, x);
      const r = Math.hypot(x, z);
      const inner = lvInner(t, a);
      const outer = lvOuter(t, a);
      const besideRv = rvBulge(t, a) > 0.02;
      if (r < inner * 0.92) partOf[i] = LVC;
      else if (r < outer + 0.03) partOf[i] = besideRv ? SEPTUM : LV;
      else if (besideRv && r < epicardium(t, a) - RV_WALL) partOf[i] = RVC;
      else partOf[i] = besideRv ? RV : LV;
    }
  }

  // Thin parts claim what lies close to them.
  const claim = (part: PartDef, apply: (i: number) => void) => {
    if (!part.on.includes(skin)) return;
    const p = points(part.geo(g));
    const near2 = (part.near ?? 0) ** 2;
    if (part.surface) {
      const samples: [number, number][] = [];
      for (let i = 0; i < p.length; i += 3) samples.push(cyl(p[i], p[i + 1], p[i + 2]));
      const local = new Grid(0.1);
      samples.forEach(([a, y], k) => local.add(a, y, 0, k));
      for (let i = 0; i < n; i++) {
        // Only points on the ventricles' surface, up to the groove at their top: an atrium bulging out
        // over the groove is not the artery running beneath it.
        const t = hp[i * 3 + 1] / H;
        const r = Math.hypot(hp[i * 3], hp[i * 3 + 2]);
        if (t > 0.985 || r > epicardium(Math.min(1, Math.max(0, t)), Math.atan2(hp[i * 3 + 2], hp[i * 3])) + 0.16) continue;
        const c = cyl(hp[i * 3], hp[i * 3 + 1], hp[i * 3 + 2]);
        // Seam: also try the angle a full turn away.
        let [k, d] = local.nearest(c[0], c[1], 0, 1);
        if (k < 0 || d > near2) {
          const other = c[0] > 0 ? c[0] - Math.PI * 2 * 0.8 : c[0] + Math.PI * 2 * 0.8;
          [k, d] = local.nearest(other, c[1], 0, 1);
        }
        if (k >= 0 && cylDist2(c, samples[k]) <= near2) apply(i);
      }
      return;
    }
    const local = new Grid(Math.max(0.05, part.near ?? 0.1));
    for (let i = 0; i < p.length; i += 3) local.add(p[i], p[i + 1], p[i + 2], 0);
    for (let i = 0; i < n; i++) {
      const [k, d] = local.nearest(hp[i * 3], hp[i * 3 + 1], hp[i * 3 + 2], 1);
      if (k >= 0 && d <= near2) apply(i);
    }
  };
  SKIN_PARTS.forEach((part, index) => {
    if (part.near !== undefined) claim(part, (i) => (partOf[i] = index + 1));
  });

  const flags = new Float32Array(n);
  SKIN_FLAGS.forEach((flag, bit) => {
    if (!flag.on.includes(skin)) return;
    if (flag.ids[0] === 'apex') {
      for (let i = 0; i < n; i++) if (hp[i * 3 + 1] < 0.12 * H) flags[i] += 2 ** bit;
      return;
    }
    claim(flag, (i) => (flags[i] += 2 ** bit));
  });

  geometry.setAttribute('aPart', new THREE.BufferAttribute(partOf, 1));
  geometry.setAttribute('aFlags', new THREE.BufferAttribute(flags, 1));

  // Labels: on each part's front-facing side (the side the lesson views show), at the vertex nearest
  // that side's middle, so a label always sits on its highlighted region.
  const anchors: Record<string, THREE.Vector3> = {};
  for (const [id, at] of Object.entries(LABEL_AT)) {
    const partIdx = SKIN_PARTS.map((p, k) => (p.ids.includes(id) ? k + 1 : -1)).filter((k) => k > 0);
    const flagBit = SKIN_FLAGS.findIndex((f) => f.ids.includes(id));
    const members: number[] = [];
    let zMax = -Infinity;
    for (let i = 0; i < n; i++) {
      const inPart = partIdx.includes(partOf[i]) || (flagBit >= 0 && Math.floor(flags[i] / 2 ** flagBit) % 2 === 1);
      if (!inPart) continue;
      members.push(i);
      zMax = Math.max(zMax, hp[i * 3 + 2]);
    }
    if (members.length === 0) {
      anchors[id] = at.clone();
      continue;
    }
    const front = members.filter((i) => hp[i * 3 + 2] >= zMax - 0.3);
    let cx = 0;
    let cy = 0;
    for (const i of front) {
      cx += hp[i * 3];
      cy += hp[i * 3 + 1];
    }
    cx /= front.length;
    cy /= front.length;
    let best = front[0];
    let bestD = Infinity;
    for (const i of front) {
      const d = (hp[i * 3] - cx) ** 2 + (hp[i * 3 + 1] - cy) ** 2 - 0.05 * hp[i * 3 + 2];
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    anchors[id] = new THREE.Vector3(hp[best * 3], hp[best * 3 + 1], hp[best * 3 + 2]);
  }

  const labels = { anchors };
  geometry.userData.skinLabels = labels;
  return labels;
}

/** The part a vertex of a labelled real model belongs to (its first id), or null. */
export function partAt(geometry: THREE.BufferGeometry, vertex: number): string | null {
  const a = geometry.getAttribute('aPart');
  if (!a) return null;
  const k = Math.round(a.getX(vertex)) - 1;
  return k >= 0 ? SKIN_PARTS[k].ids[0] : null;
}

/** How strongly each part and region shows, given what is highlighted and pointed at. */
export function skinLevels(level: (ids: string[]) => number, parts: number[], flags: number[]): boolean {
  let any = false;
  SKIN_PARTS.forEach((p, k) => {
    parts[k] = level(p.ids);
    if (parts[k]) any = true;
  });
  SKIN_FLAGS.forEach((f, k) => {
    flags[k] = level(f.ids);
    if (flags[k]) any = true;
  });
  return any;
}
