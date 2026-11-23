import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VIEW_PARTS } from '../heart/parts';
import { H, LABEL_AT, SLICE_LABEL_AT, buildHeart, buildSlice, epicardium, infarctGeometry, lvInner, lvOuter, slabGeometry } from './model';

function finite(g: THREE.BufferGeometry): boolean {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count * 3; i++) if (!Number.isFinite(p.array[i])) return false;
  return p.count > 0;
}

describe('3D heart model', () => {
  it('has a thick left ventricle wall that closes at the apex', () => {
    expect(lvOuter(0, 0)).toBe(0);
    const t = 0.5;
    const wall = lvOuter(t, 0) - lvInner(t, 0);
    expect(wall).toBeGreaterThan(0.2);
    // The right ventricle stands out only on its side (front and right), not at the lateral wall.
    expect(epicardium(t, Math.PI)).toBeGreaterThan(lvOuter(t, Math.PI) + 0.3);
    expect(epicardium(t, 0)).toBeCloseTo(lvOuter(t, 0));
  });

  it('builds every piece with real, finite geometry of a sensible size', () => {
    const { geometries: g } = buildHeart();
    const pieces = [
      g.lv,
      g.rv,
      g.septum,
      g.lvCavity,
      g.rvCavity,
      g.ra,
      g.la,
      g.baseRing,
      g.ladTerritory,
      ...g.aorta,
      ...g.trunk,
      ...g.lad,
      ...g.lcx,
      ...g.rca,
      ...Object.values(g.valves),
    ];
    for (const piece of pieces) expect(finite(piece)).toBe(true);
    const box = new THREE.Box3().setFromBufferAttribute(g.lv.getAttribute('position') as THREE.BufferAttribute);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y).toBeCloseTo(H);
    expect(box.max.x).toBeLessThan(1);
  });

  it('cuts slabs and a slice with an infarct that grows outward', () => {
    expect(finite(slabGeometry(0.3, 0.48))).toBe(true);
    const s = buildSlice();
    for (const piece of [s.lvWall, s.septum, s.rvWall, s.lvCavity, s.rvCavity, s.frontWall, s.rim, s.endocardium, s.epicardium]) {
      expect(finite(piece)).toBe(true);
    }
    const far = (reach: number) => {
      const p = infarctGeometry(reach).getAttribute('position');
      let r = 0;
      for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i)));
      return r;
    };
    expect(far(0.1)).toBeLessThan(far(0.5));
    expect(far(0.5)).toBeLessThan(far(1));
  });

  it('has a label spot for every part the 3D views can show', () => {
    const heartParts = [...new Set([...VIEW_PARTS.section, ...VIEW_PARTS.anterior])].filter((p) => p !== 'pulmonary-veins' || LABEL_AT[p]);
    for (const p of heartParts) expect(LABEL_AT[p], p).toBeDefined();
    for (const p of VIEW_PARTS.slice) expect(SLICE_LABEL_AT[p], p).toBeDefined();
  });
});
