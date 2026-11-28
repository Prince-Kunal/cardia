// The landing page's 3D scene (loaded on its own, so the rest of the app never carries three.js for
// it). The world itself is built and moved by plain functions (world.ts); this component owns its
// life: it builds it once the canvas exists, keeps it sized, steps it every frame, and frees it.

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { type MutableRefObject, useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { type LabelRefs, type World, createWorld, disposeWorld, paintStage, resizeWorld, stepWorld } from './world';

export type { LabelRefs };

interface Props {
  /** Where the story is, in chapters (story.ts). Read every frame. */
  progress: MutableRefObject<number>;
  labels: MutableRefObject<LabelRefs>;
  reduced: boolean;
  /** The colour of the room: dark for the Living Stain, paper or dark for the lab notebook. */
  stage: string;
}

function Stage({ progress, labels, reduced, stage }: Props) {
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
    if (world.current) resizeWorld(world.current, width, height);
  }, [world, width, height]);

  // After the world is built (the effect above runs first), and whenever the look or theme changes.
  useEffect(() => {
    if (world.current) paintStage(world.current, stage);
  }, [world, stage, gl, scene, camera]);

  useFrame((_, dt) => {
    if (world.current) stepWorld(world.current, { target: progress.current, dt, reduced, labels: labels.current });
  }, 1);

  return null;
}

export default function LandingScene(props: Props) {
  return (
    <Canvas
      className="landing-canvas"
      dpr={[1, 1.5]}
      camera={{ fov: 34, near: 0.02, far: 80, position: [0, 0.35, 6.8] }}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      aria-hidden="true"
    >
      <Stage {...props} />
    </Canvas>
  );
}
