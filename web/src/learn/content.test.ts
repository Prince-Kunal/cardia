// Checks every lesson in content/ the way a reviewer would want them checked before learners see them.

import { describe, expect, it } from 'vitest';
import { ANIMS, PART_NAMES, VIEW_PARTS, viewOf } from '../heart/parts';
import { RAW, glossary, loadLessons } from './content';
import { COURSE } from './course';
import { type Inline, linksOf, plainText, quizzesOf } from './lesson';

const lessons = loadLessons();
const en = [...(lessons.en?.values() ?? [])];
const terms = glossary('en');

function texts(content: Inline[]): string[] {
  return [plainText(content)];
}

describe('Learn content', () => {
  it('has the v1 modules in English', () => {
    expect(en.map((l) => l.meta.module).sort((a, b) => a - b)).toEqual(expect.arrayContaining([1, 3, 5, 8, 10]));
  });

  for (const lesson of en) {
    describe(lesson.file, () => {
      it('parses without warnings', () => {
        expect(lesson.warnings).toEqual([]);
      });

      it('matches its file name and the course', () => {
        const prefix = Number(/\/(\d+)-[^/]+\.md$/.exec(lesson.file)?.[1]);
        expect(lesson.meta.module).toBe(prefix);
        expect(COURSE.some((m) => m.module === lesson.meta.module)).toBe(true);
        expect(lesson.meta.title).not.toBe('');
        expect(lesson.meta.tracks.length).toBeGreaterThan(0);
      });

      it('cites its sources and says whether it was reviewed', () => {
        expect(lesson.meta.sources.length).toBeGreaterThan(0);
        expect(RAW.lessons[`../../../${lesson.file}`]).toMatch(/^reviewed_by:/m);
      });

      it('links only to glossary terms that exist', () => {
        const missing = linksOf(lesson).terms.filter((t) => !(t in terms));
        expect(missing).toEqual([]);
      });

      it('points only at parts the heart has, in a view that shows them', () => {
        const problems: string[] = [];
        for (const [i, step] of lesson.steps.entries()) {
          const view = viewOf(step.scene.camera);
          const shown = VIEW_PARTS[view];
          const labels = Array.isArray(step.scene.labels) ? step.scene.labels : [];
          for (const p of [...step.scene.highlight, ...step.scene.hide, ...labels]) {
            if (!(p in PART_NAMES)) problems.push(`step ${i + 1}: unknown part "${p}"`);
            else if (!shown.includes(p)) problems.push(`step ${i + 1}: "${p}" is not in the ${view} view`);
          }
          if (step.scene.anim && !(ANIMS as readonly string[]).includes(step.scene.anim))
            problems.push(`step ${i + 1}: unknown animation "${step.scene.anim}"`);
          // part: links in a step point at the heart shown beside it.
          const stepParts = linksOf({ ...lesson, steps: [step] }).parts;
          for (const p of stepParts) {
            if (!(p in PART_NAMES)) problems.push(`step ${i + 1}: link to unknown part "${p}"`);
            else if (!shown.includes(p)) problems.push(`step ${i + 1}: link to "${p}", which the ${view} view doesn't show`);
          }
          for (const b of step.blocks) {
            if (b.kind !== 'quiz') continue;
            const q = b.quiz;
            const quizView = VIEW_PARTS[viewOf(('camera' in q && q.camera) || step.scene.camera)];
            const wanted = q.type === 'click-part' ? q.targets : q.type === 'label-diagram' ? q.parts : [];
            for (const p of wanted) if (!quizView.includes(p)) problems.push(`quiz ${q.id}: "${p}" is not in its view`);
          }
        }
        expect(problems).toEqual([]);
      });

      it('has no stray Markdown in its text', () => {
        const all: string[] = [];
        for (const step of lesson.steps) {
          for (const b of step.blocks) {
            if (b.kind === 'paragraph' || b.kind === 'note' || b.kind === 'heading') all.push(...texts(b.content));
            if (b.kind === 'list') all.push(...b.items.flatMap(texts));
          }
        }
        for (const q of quizzesOf(lesson)) all.push(plainText(q.prompt), plainText(q.explanation));
        expect(all.filter((t) => /\*\*|\]\(|::/.test(t))).toEqual([]);
      });
    });
  }

  it('has a complete glossary whose lesson links go to real modules', () => {
    for (const [id, e] of Object.entries(terms)) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
      expect(e.title, id).not.toBe('');
      expect(e.short.length, id).toBeGreaterThan(20);
      if (e.lesson !== undefined) expect(COURSE.some((m) => m.module === e.lesson), id).toBe(true);
    }
  });

  it('gives every quiz a unique id across the course', () => {
    const ids = en.flatMap((l) => quizzesOf(l).map((q) => q.id));
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });
});
