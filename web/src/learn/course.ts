// The course (PLAN.md §3a): twelve modules, three tracks. A module with a lesson file in content/<lang>/
// can be taken; the others show as "coming later". A lesson's own front matter can change its tracks.

import type { Track } from './lesson';

export interface ModuleInfo {
  module: number;
  title: string;
  summary: string;
  /** Basics a student may already know (the Student track marks them optional). */
  basics: boolean;
  tracks: Track[];
}

const ALL: Track[] = ['no-biology', 'student', 'researcher'];
const BIOLOGY: Track[] = ['no-biology', 'student'];

export const COURSE: ModuleInfo[] = [
  { module: 1, title: 'The heart, from zero', summary: 'Chambers, valves and walls, and why the left side is thicker.', basics: true, tracks: BIOLOGY },
  { module: 2, title: 'How the heart pumps', summary: 'Atria then ventricles, valves opening and closing: one heartbeat.', basics: true, tracks: BIOLOGY },
  { module: 3, title: 'Where the blood goes', summary: 'Body, right heart, lungs, left heart, body: the two circuits.', basics: false, tracks: BIOLOGY },
  { module: 4, title: 'Feeding the heart itself', summary: 'The coronary arteries and the part of the heart each one feeds.', basics: false, tracks: BIOLOGY },
  { module: 5, title: 'What a heart attack is', summary: 'A blocked artery, no oxygen, dying muscle. Time is muscle.', basics: false, tracks: BIOLOGY },
  { module: 6, title: 'Reopening the artery', summary: 'Reperfusion saves tissue, and adds an injury of its own.', basics: false, tracks: BIOLOGY },
  { module: 7, title: 'Why measure infarct size', summary: 'The main outcome when testing treatments that protect the heart.', basics: false, tracks: ALL },
  { module: 8, title: 'How TTC staining works', summary: 'Living cells turn TTC red; dead cells stay pale.', basics: false, tracks: ALL },
  { module: 9, title: 'Traditional methods', summary: 'Tracing by hand, grey-level cut-offs, histology, and MRI in patients.', basics: false, tracks: ALL },
  { module: 10, title: 'How our app does it', summary: "Every step of Cardia's analysis, its two methods, and its limits.", basics: false, tracks: ALL },
  { module: 11, title: 'Good research practice', summary: 'Blinding, reproducibility, and the 3Rs.', basics: false, tracks: ALL },
  { module: 12, title: 'Bonus for CS students', summary: 'Pixels, colour spaces, morphology and random forests, hands on.', basics: false, tracks: ['student'] },
];

export const TRACK_INFO: Record<Track, { name: string; description: string }> = {
  'no-biology': {
    name: 'No biology',
    description: 'Start from zero. Every module, in the simplest words.',
  },
  student: {
    name: 'Student',
    description: 'For students who know some biology: skip the basics you already know.',
  },
  researcher: {
    name: 'Researcher',
    description: 'Infarct size, TTC, the methods and good practice (modules 7 to 11).',
  },
};

/** The modules on a track, in course order. The Researcher track is modules 7–11. */
export function modulesFor(track: Track): ModuleInfo[] {
  if (track === 'researcher') return COURSE.filter((m) => m.module >= 7 && m.module <= 11);
  if (track === 'student') return COURSE;
  return COURSE.filter((m) => m.tracks.includes('no-biology'));
}
