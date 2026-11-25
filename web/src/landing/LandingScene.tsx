// The landing page's 3D scene (loaded on its own, so the rest of the app never carries three.js for
// it). The world itself is built and moved by plain functions (world.ts); this component owns its
// life: it builds it once the canvas exists, keeps it sized, steps it every frame, and frees it.

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { type MutableRefObject, useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { type LabelRefs, type World, createWorld, disposeWorld, resizeWorld, stepWorld } from './world';

export type { LabelRefs };

interface Props {
  /** Where the story is, in chapters (story.ts). Read every frame. */
  progress: MutableRefObject<number>;
  labels: MutableRefObject<LabelRefs>;
  reduced: boolean;
}

function Stage({ progress, labels, reduced }: Props) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const world = useRef<World | null>(null);

  useEffect(() => {
    const w = createWorld(gl, scene, camera as THREE.PerspectiveCamera);
    world.current = w;
    return () => {
      world.current = null;
      disposeWorld(w);
    };
  }, [gl, scene, camera]);

  useEffect(() => {
    if (world.current) resizeWorld(world.current, width, height, gl.getPixelRatio());
  }, [world, width, height, gl]);

  useFrame((_, dt) => {
    if (world.current) stepWorld(world.current, { target: progress.current, dt, reduced, labels: labels.current });
  }, 1);

  return null;
}

export default function LandingScene(props: Props) {
  return (
    <Canvas
      className="landing-canvas"
      dpr={[1, 1.75]}
      camera={{ fov: 34, near: 0.02, far: 80, position: [0, 0.35, 6.8] }}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
      aria-hidden="true"
    >
      <Stage {...props} />
    </Canvas>
  );
}
