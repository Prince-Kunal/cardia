// The real hearts: scanned-and-sculpted models from Sketchfab (CC BY 4.0, credits in
// public/models/CREDITS.md and on the Help page), compressed for the web. Loaded once each and shared
// by the landing page and Learn; callers get their own clone.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { RealHeartKind } from './credits';

export { CREDITS, type RealHeartKind } from './credits';

const FILES: Record<RealHeartKind, string> = {
  realistic: '/models/heart-realistic.glb',
  interior: '/models/heart-interior.glb',
};

const cache = new Map<RealHeartKind, Promise<THREE.Mesh>>();

/** The model's mesh, with its transforms baked in (one mesh per model after compression). */
function load(kind: RealHeartKind): Promise<THREE.Mesh> {
  let p = cache.get(kind);
  if (!p) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    p = loader.loadAsync(FILES[kind]).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      let mesh: THREE.Mesh | null = null;
      gltf.scene.traverse((o) => {
        if (!mesh && o instanceof THREE.Mesh) mesh = o;
      });
      if (!mesh) throw new Error(`No mesh in ${FILES[kind]}`);
      const m = mesh as THREE.Mesh;
      // The compressed files store positions, normals and UVs as small integers; widen them to floats
      // before baking the scene's transforms in, or the integers would clip.
      const geometry = new THREE.BufferGeometry();
      for (const [name, a] of Object.entries(m.geometry.attributes)) {
        const out = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
        geometry.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
      }
      geometry.setIndex(m.geometry.getIndex());
      geometry.applyMatrix4(m.matrixWorld);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return new THREE.Mesh(geometry, m.material);
    });
    p.catch(() => cache.delete(kind));
    cache.set(kind, p);
  }
  return p;
}

/** A fresh mesh of the model (its geometry and textures are shared; its material is a copy). */
export async function loadRealHeart(kind: RealHeartKind): Promise<THREE.Mesh> {
  const base = await load(kind);
  const material = (Array.isArray(base.material) ? base.material[0] : base.material).clone();
  return new THREE.Mesh(base.geometry, material);
}
