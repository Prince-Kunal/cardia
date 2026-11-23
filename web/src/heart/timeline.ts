// The heart's timeline, shared by the 2D diagram and the 3D heart: one-off animations run from 0 to 1,
// reduced motion skips to the end, and a line under the picture says what is happening.

import { useEffect, useState } from 'react';
import type { Anim, View } from './parts';

export const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const clamp = (t: number) => Math.min(1, Math.max(0, t));

export function reducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return (
    document.documentElement.dataset.motion === 'reduced' ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}

/** 0 → 1 over the animation's length; the end at once with reduced motion. A new `key` plays it again. */
export function useTimeline(active: boolean, seconds: number, key: string): number {
  const [state, setState] = useState({ key, t: 0 });
  const skip = !active || reducedMotion();
  useEffect(() => {
    if (skip) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = clamp((now - start) / (seconds * 1000));
      setState({ key, t });
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [skip, seconds, key]);
  if (skip) return 1;
  return state.key === key ? state.t : 0;
}

/** "Time since the artery was blocked" for the occlusion and wavefront animations: 0 min to 3 h. */
export function clock(t: number): string {
  const minutes = Math.round(180 * t * t);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ''}`.trim();
}

/** A line under the picture saying what the animation shows, as it plays. */
export function captionOf(view: View, anim: Anim | null, t: number): string | null {
  if (view === 'anterior') {
    if (anim === 'slicing') return 'Slices are cut across the ventricles, from the apex up to the base';
    if (anim === 'occlusion') return `Artery blocked for ${clock(t)}`;
    if (anim === 'reperfusion') return t < 0.25 ? 'Artery blocked' : 'Artery reopened: blood flows again';
  }
  if (view === 'slice') {
    if (anim === 'ttc') return t < 1 ? 'In warm TTC, living muscle turns red…' : 'Living muscle is red; dead muscle stays pale';
    if (anim === 'wavefront' || anim === 'occlusion') return `Artery blocked for ${clock(t)}: the dead zone grows outward`;
    if (anim === 'reperfusion') return 'Reopened in time: part of the wall is saved';
  }
  if (view === 'section' && anim === 'flow') return 'Blue: oxygen-poor blood. Red: oxygen-rich blood';
  return null;
}
