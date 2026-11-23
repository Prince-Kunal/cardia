// The lesson's heart: the 3D heart where WebGL works and the learner wants it, otherwise the 2D
// diagram (PLAN.md §3f: "fall back to 2D diagrams"). The 2D diagram also shows while the 3D code
// loads, and takes over if the 3D heart fails.

import { Component, type ReactNode, Suspense, lazy } from 'react';
import { HeartDiagram, type HeartDiagramProps } from '../heart/HeartDiagram';
import { type HeartMode, webglAvailable } from './mode';

const Heart3D = lazy(() => import('./Heart3D'));

class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function HeartView({ mode, ...props }: HeartDiagramProps & { mode: HeartMode }) {
  const flat = <HeartDiagram {...props} />;
  if (mode === '2d' || !webglAvailable()) return flat;
  return (
    <Fallback fallback={flat}>
      <Suspense fallback={flat}>
        <Heart3D scene={props.scene} focus={props.focus} replay={props.replay} onPartClick={props.onPartClick} />
      </Suspense>
    </Fallback>
  );
}
