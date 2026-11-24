// The walkthrough (PLAN.md §1h, §1j): one real analysis of the demo heart, from import to export. A card
// follows you from screen to screen; each step points at one part of the screen and moves on by itself
// when you do what it says (or with Next). Start or replay it from Help, or from an empty library.
//
// The state lives here, outside React, so the card, the Import screen and the Help page share it, and in
// sessionStorage, so a reload keeps your place.

import { useSyncExternalStore } from 'react';
import type { Route } from './router';

export type TourStepId = 'welcome' | 'import' | 'processing' | 'numbers' | 'report' | 'slices' | 'layers' | 'export' | 'done';

export interface TourStep {
  id: TourStepId;
  title: string;
  body: string;
  /** The screens the step belongs to; elsewhere the card offers the way back. Empty: any screen. */
  on: Route['name'][];
  /** What the step points at on its screen: the first element marked data-tour="…" that is there. */
  target?: string[];
  /** Moves on by itself when the app reaches this screen. */
  advanceOn?: Route['name'];
  /** True when the step waits for you to do something; the card then has no Next. */
  waits?: boolean;
}

export const TOUR: TourStep[] = [
  {
    id: 'welcome',
    title: 'One heart, start to finish',
    body: 'You will analyse heart 206 from the study set: four real TTC-stained slices of a guinea pig heart with an infarct. Import them, watch them analysed, read the report, look at one slice’s layers and export. It takes two or three minutes, and the heart stays in your library afterwards.',
    on: [],
  },
  {
    id: 'import',
    title: 'Check the scans',
    body: 'The four scans are in. Each name, like 206IS89mg.tif, gives the heart (206) and the slice’s weight (89 mg). Cardia checks every file here before anything is analysed. Press Analyse 4 slices.',
    on: ['import'],
    target: ['analyse'],
    advanceOn: 'job',
    waits: true,
  },
  {
    id: 'processing',
    title: 'The analysis runs here',
    body: 'Each slice goes through both methods on this computer, a few seconds each and several at once. You could leave this page and it would keep running. When it is finished, press Open heart.',
    on: ['job'],
    target: ['filed', 'progress'],
    advanceOn: 'heart',
    waits: true,
  },
  {
    id: 'numbers',
    title: 'Two methods, side by side',
    body: 'Method A (K-Means + random forest) and Method B (an a* cut) each give the dead tissue as a % of the heart, with a range. They can disagree a lot, as on heart 206. Each was checked against different reference measurements, so until expert tracings settle which is closer, Cardia shows both. Learn module 10 explains why.',
    on: ['heart'],
    target: ['numbers'],
  },
  {
    id: 'report',
    title: 'Apex to base, quality, context',
    body: 'The strip shows every slice from apex to base with both methods’ %. Further down, Quality lists anything that lowers confidence, and Context places this heart among the eight study hearts.',
    on: ['heart'],
    target: ['strip'],
  },
  {
    id: 'slices',
    title: 'Open a slice',
    body: 'Every slice has its own report. Open one by its file name in the Slices table, or press Next to open the first.',
    on: ['heart'],
    target: ['slices'],
    advanceOn: 'slice',
  },
  {
    id: 'layers',
    title: 'See what each method saw',
    body: 'Turn layers on and off over the scan: the tissue outline, the holes, and the dead tissue each method found. The heatmap shows Method A’s probability of dead for every pixel. Zoom in, or compare two views side by side with the divider.',
    on: ['slice'],
    target: ['layers'],
  },
  {
    id: 'export',
    title: 'Export',
    body: 'Print the report or save it as a PDF, download a CSV per slice or per heart, or everything as a ZIP with checksums. The Methods paragraph just above is ready to paste into a paper.',
    on: ['heart'],
    target: ['export'],
  },
  {
    id: 'done',
    title: 'That’s the whole path',
    body: 'Replay this walkthrough from Help at any time. The heart stays in your library; move it to the trash from its page if you don’t want it there.',
    on: [],
  },
];

export interface TourState {
  step: number;
  /** The address of the screen the current step was shown on, for the way back. */
  where?: string;
  /** The engine has no demo heart (a build without the study scans): you bring your own scans. */
  noDemo?: boolean;
}

const KEY = 'cardia.tour';
const listeners = new Set<() => void>();
let state: TourState | null = read();
let staged: File[] | null = null;
let stagedListener: ((files: File[]) => void) | null = null;

function read(): TourState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as TourState) : null;
    return parsed && Number.isInteger(parsed.step) && parsed.step >= 0 && parsed.step < TOUR.length ? parsed : null;
  } catch {
    return null;
  }
}

function set(next: TourState | null): void {
  state = next;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Private windows can refuse storage; the walkthrough still works until a reload.
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The walkthrough's state, or null when it is not running. */
export function useTour(): TourState | null {
  return useSyncExternalStore(subscribe, () => state);
}

export function tourState(): TourState | null {
  return state;
}

export function startTour(): void {
  set({ step: 0 });
}

export function endTour(): void {
  staged = null;
  set(null);
}

/** Go to a step by its id, remembering where it is shown. */
export function goToStep(id: TourStepId, where = window.location.hash, extra: Pick<TourState, 'noDemo'> = {}): void {
  const step = TOUR.findIndex((s) => s.id === id);
  if (step >= 0) set({ ...state, ...extra, step, where });
}

export function nextStep(where = window.location.hash): void {
  if (!state) return;
  if (state.step + 1 >= TOUR.length) endTour();
  else set({ ...state, step: state.step + 1, where });
}

export function previousStep(): void {
  if (state && state.step > 0) set({ ...state, step: state.step - 1 });
}

/** The current step is on the screen at this address: the card's way back leads here. */
export function rememberWhere(where: string): void {
  if (state && state.where !== where) set({ ...state, where });
}

/** Hand files to the Import screen: at once if it is listening, else when it next opens. */
export function stageFiles(files: File[]): void {
  if (stagedListener) stagedListener(files);
  else staged = files;
}

/** The Import screen listens for staged files while it is open; files staged before it opened arrive first. */
export function onStagedFiles(listener: (files: File[]) => void): () => void {
  stagedListener = listener;
  // Hand them over only to a listener still there a moment later: React's StrictMode mounts the screen,
  // unmounts it and mounts it again, and the files must reach the second.
  if (staged)
    queueMicrotask(() => {
      if (stagedListener !== listener || !staged) return;
      const files = staged;
      staged = null;
      listener(files);
    });
  return () => {
    if (stagedListener === listener) stagedListener = null;
  };
}
