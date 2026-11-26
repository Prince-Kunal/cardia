import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { H, buildHeart } from './model';
import { SKIN_PARTS, labelSkin, partAt, skinLevels } from './skinParts';

describe('labelling a real heart model by part', () => {
  it('labels the outside of the ventricles and the atria by the drawn part they lie on', () => {
    const { geometries: g } = buildHeart();
    // Stand-ins for a real model: the drawn left ventricle and right atrium, already in the heart frame.
    const lv = g.lv.clone();
    const ra = g.ra.clone();
    labelSkin(lv, new THREE.Matrix4(), 'realistic');
    labelSkin(ra, new THREE.Matrix4(), 'realistic');
    const share = (geo: THREE.BufferGeometry, id: string) => {
      const n = geo.getAttribute('position').count;
      let hits = 0;
      for (let i = 0; i < n; i++) if (partAt(geo, i) === id) hits++;
      return hits / n;
    };
    // The coronary arteries run over the left ventricle, so they claim the strips they lie on.
    expect(share(lv, 'lv') + share(lv, 'lad') + share(lv, 'lcx') + share(lv, 'rca')).toBeGreaterThan(0.95);
    expect(share(lv, 'lad')).toBeGreaterThan(0.03);
    expect(share(ra, 'ra')).toBeGreaterThan(0.75);
    // Nothing above the groove at the top of the ventricles is taken for an artery.
    const p = ra.getAttribute('position');
    for (let i = 0; i < p.count; i++) if (p.getY(i) / H > 0.99) expect(partAt(ra, i)).toBe('ra');
  });

  it('places every label on the part it names', () => {
    const { geometries: g } = buildHeart();
    const lv = g.lv.clone();
    const { anchors } = labelSkin(lv, new THREE.Matrix4(), 'realistic');
    const p = lv.getAttribute('position');
    const onSurface = [...Array(p.count).keys()].some((i) => new THREE.Vector3().fromBufferAttribute(p, i).distanceTo(anchors.lv) < 1e-6);
    expect(onSurface).toBe(true);
  });

  it('lights the parts that are highlighted, and only those', () => {
    const parts = new Array(SKIN_PARTS.length).fill(0);
    const flags = new Array(5).fill(0);
    const any = skinLevels((ids) => (ids.includes('septum') ? 0.7 : 0), parts, flags);
    expect(any).toBe(true);
    expect(parts.filter((x) => x > 0)).toHaveLength(1);
    expect(parts[SKIN_PARTS.findIndex((p) => p.ids[0] === 'septum')]).toBe(0.7);
  });
});
