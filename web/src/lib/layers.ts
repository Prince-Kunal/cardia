// How image layers are shown (PLAN.md §1j: colour-blind-safe overlay colours).

import type { Layer } from '../api/types.gen';

/** Overlay colours: no red/green pairs, so they stay apart for colour-blind eyes. */
export const LAYER_COLOUR: Partial<Record<Layer, string>> = {
  tissue: '#19a7a7',
  holes_removed: '#d6337f',
  holes_uncertain: '#8e44ad',
  filled: '#3b82f6',
  a_dead: '#f2c14e',
  a_unsure: '#7cc4f2',
  b_dead: '#2bb3e0',
  b_borderline: '#9be0f5',
};
