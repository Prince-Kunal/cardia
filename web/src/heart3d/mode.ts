// 3D or 2D: whether the browser can draw WebGL, and the learner's choice (kept in this browser).

import { useState } from 'react';

export type HeartMode = '2d' | '3d';

let webgl: boolean | undefined;
/** Whether this browser can draw WebGL (checked once). */
export function webglAvailable(): boolean {
  if (webgl === undefined) {
    try {
      const canvas = document.createElement('canvas');
      webgl = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

const KEY = 'cardia.heart.mode';

/** The learner's choice of 3D or 2D, remembered in this browser (3D by default where it works). */
export function useHeartMode(): [HeartMode, (mode: HeartMode) => void] {
  const [mode, setMode] = useState<HeartMode>(() => {
    if (!webglAvailable()) return '2d';
    try {
      return localStorage.getItem(KEY) === '2d' ? '2d' : '3d';
    } catch {
      return '3d';
    }
  });
  return [
    mode,
    (next) => {
      setMode(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // Not remembered; the choice still holds on this page.
      }
    },
  ];
}
