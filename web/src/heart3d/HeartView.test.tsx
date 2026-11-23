import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENE } from '../learn/lesson';
import { HeartView } from './HeartView';
import { webglAvailable } from './mode';

describe('HeartView', () => {
  it('falls back to the 2D diagram without WebGL', () => {
    expect(webglAvailable()).toBe(false);
    const { container } = render(<HeartView scene={{ ...DEFAULT_SCENE, highlight: ['lv'] }} mode="3d" />);
    expect(container.querySelector('svg.heart-diagram')).not.toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
  });
});
