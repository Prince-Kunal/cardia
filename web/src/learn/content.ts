// Lessons and the glossary, bundled from content/<lang>/ at build time so Learn works offline.
// English is the source language; other languages fall back to it per lesson until translated.

import { type Lesson, parseLesson } from './lesson';

export interface GlossaryEntry {
  title: string;
  short: string;
  /** The module that explains it. */
  lesson?: number;
}
export type Glossary = Record<string, GlossaryEntry>;

const LESSON_FILES = import.meta.glob('../../../content/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const GLOSSARY_FILES = import.meta.glob('../../../content/*/glossary.json', {
  import: 'default',
  eager: true,
}) as Record<string, Glossary>;

function langOf(path: string): string {
  return path.split('/').at(-2) ?? 'en';
}

/** Every lesson file, parsed, by language and module. */
export function loadLessons(files: Record<string, string> = LESSON_FILES): Record<string, Map<number, Lesson & { file: string }>> {
  const out: Record<string, Map<number, Lesson & { file: string }>> = {};
  for (const [path, source] of Object.entries(files)) {
    const name = path.split('/').at(-1) ?? path;
    const prefix = /^(\d+)-/.exec(name);
    if (!prefix) continue;
    const lesson = parseLesson(source, Number(prefix[1]));
    (out[langOf(path)] ??= new Map()).set(lesson.meta.module, { ...lesson, file: path.replace(/^(\.\.\/)+/, '') });
  }
  return out;
}

const LESSONS = loadLessons();

/** The lesson for a module in a language, else in English; undefined until it is written. */
export function lessonFor(module: number, lang = 'en'): Lesson | undefined {
  return LESSONS[lang]?.get(module) ?? LESSONS.en?.get(module);
}

export function allLessons(lang = 'en'): Lesson[] {
  const merged = new Map(LESSONS.en ?? []);
  for (const [m, l] of LESSONS[lang] ?? []) merged.set(m, l);
  return [...merged.values()].sort((a, b) => a.meta.module - b.meta.module);
}

export function glossary(lang = 'en'): Glossary {
  const en = Object.entries(GLOSSARY_FILES).find(([p]) => langOf(p) === 'en')?.[1] ?? {};
  const local = Object.entries(GLOSSARY_FILES).find(([p]) => langOf(p) === lang)?.[1] ?? {};
  return { ...en, ...local };
}

/** For the content checks: the raw files. */
export const RAW = { lessons: LESSON_FILES, glossaries: GLOSSARY_FILES };
