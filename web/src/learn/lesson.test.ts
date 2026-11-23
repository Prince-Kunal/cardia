import { describe, expect, it } from 'vitest';
import { linksOf, parseAttrs, parseFrontMatter, parseInline, parseLesson, plainText, quizzesOf } from './lesson';

describe('front matter', () => {
  it('reads values, inline lists, item lists, quotes and comments', () => {
    const fm = parseFrontMatter(
      [
        'module: 5',
        'title: What a heart attack is',
        'tracks: [no-biology, student]',
        'sources:',
        '  - "Reimer KA et al. Circulation. 1977"',
        '  - Thygesen K et al. 2018',
        'reviewed_by: ""            # filled in at expert sign-off',
      ].join('\n'),
    );
    expect(fm).toEqual({
      module: '5',
      title: 'What a heart attack is',
      tracks: ['no-biology', 'student'],
      sources: ['Reimer KA et al. Circulation. 1977', 'Thygesen K et al. 2018'],
      reviewed_by: '',
    });
  });
});

describe('inline Markdown', () => {
  it('reads bold, italic, code, and term, part and web links', () => {
    const nodes = parseInline('The **[left ventricle](part:lv)** is *thick*; see [TTC](term:ttc), `a*` and [docs](https://x.org).');
    expect(nodes.map((n) => n.kind)).toEqual(['text', 'strong', 'text', 'em', 'text', 'term', 'text', 'code', 'text', 'link', 'text']);
    expect(nodes[1]).toEqual({ kind: 'strong', children: [{ kind: 'part', id: 'lv', children: [{ kind: 'text', text: 'left ventricle' }] }] });
    expect(plainText(nodes)).toBe('The left ventricle is thick; see TTC, a* and docs.');
  });

  it('leaves stray markers as text', () => {
    expect(plainText(parseInline('a * b and 2*3 and snake_case_name and \\*literal\\*'))).toBe(
      'a * b and 2*3 and snake_case_name and *literal*',
    );
  });
});

describe('directive attributes', () => {
  it('reads quoted, bare and flag attributes', () => {
    expect(parseAttrs('camera="anterior" highlight="lad,lv" speed=0.5 xray')).toEqual({
      camera: 'anterior',
      highlight: 'lad,lv',
      speed: '0.5',
      xray: 'true',
    });
  });
});

const LESSON = `---
module: 5
title: What a heart attack is
summary: A blocked artery starves the muscle.
minutes: 8
tracks: [no-biology, student]
sources:
  - "A source"
reviewed_by: ""
---

Before any scene.

::scene{camera="anterior" highlight="lad,lv" anim="occlusion" speed=0.5}

## A blocked artery

The **[LAD](part:lad)** feeds the front wall of the [left ventricle](term:lv).
When it is blocked…

- no oxygen
- cells stop

> Time is muscle.

:::quiz{type="multiple-choice" id="m5-where"}
Where does dying start?
- [x] The inner wall
- [ ] The outer wall
> It starts where blood supply is poorest.
:::

::scene{camera="short-axis"}

1. Block
2. Wait

::quiz{type="click-part" target="lad" prompt="Tap the artery that was blocked."}

:::quiz{type="true-false" answer="false"}
TTC stains dead tissue red.
:::

:::quiz{type="match"}
Match each chamber.
- Left ventricle = pumps to the body
- Right ventricle = pumps to the lungs
:::

:::quiz{type="fill-blank"}
Living cells turn TTC into red [[formazan|formazans]].
:::

:::quiz{type="order-steps"}
Put the protocol in order.
1. Excise
2. Slice
3. Stain
:::

::quiz{type="label-diagram" parts="ra,la,rv,lv" prompt="Label the chambers."}
`;

describe('parseLesson', () => {
  const lesson = parseLesson(LESSON);

  it('reads the front matter', () => {
    expect(lesson.warnings).toEqual([]);
    expect(lesson.meta).toEqual({
      module: 5,
      title: 'What a heart attack is',
      summary: 'A blocked artery starves the muscle.',
      minutes: 8,
      tracks: ['no-biology', 'student'],
      sources: ['A source'],
      reviewed_by: '',
    });
  });

  it('starts a step at each scene, with the default view before the first', () => {
    expect(lesson.steps).toHaveLength(3);
    expect(lesson.steps[0].scene.camera).toBe('section');
    expect(lesson.steps[1].scene).toEqual({
      camera: 'anterior',
      highlight: ['lad', 'lv'],
      hide: [],
      labels: 'auto',
      anim: 'occlusion',
      speed: 0.5,
      xray: false,
    });
    expect(lesson.steps[1].title).toBe('A blocked artery');
    expect(lesson.steps[1].blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'list', 'note', 'quiz']);
    expect(lesson.steps[2].blocks[0]).toMatchObject({ kind: 'list', ordered: true, start: 1 });
    expect(parseLesson('4. Fix\n5. Weigh').steps[0].blocks[0]).toMatchObject({ kind: 'list', ordered: true, start: 4 });
  });

  it('reads every quiz type', () => {
    const quizzes = quizzesOf(lesson);
    expect(quizzes.map((q) => [q.id, q.type])).toEqual([
      ['m5-where', 'multiple-choice'],
      ['m5-q2', 'click-part'],
      ['m5-q3', 'true-false'],
      ['m5-q4', 'match'],
      ['m5-q5', 'fill-blank'],
      ['m5-q6', 'order-steps'],
      ['m5-q7', 'label-diagram'],
    ]);
    const [mc, click, tf, match, fill, order, label] = quizzes;
    expect(mc.type === 'multiple-choice' && mc.options.map((o) => o.correct)).toEqual([true, false]);
    expect(plainText(mc.explanation)).toBe('It starts where blood supply is poorest.');
    expect(click.type === 'click-part' && click.targets).toEqual(['lad']);
    expect(plainText(click.prompt)).toBe('Tap the artery that was blocked.');
    expect(tf.type === 'true-false' && tf.answer).toBe(false);
    expect(match.type === 'match' && match.pairs.map((p) => p.right)).toEqual(['pumps to the body', 'pumps to the lungs']);
    expect(fill.type === 'fill-blank' && fill.segments.filter((s) => s.kind === 'blank')).toEqual([
      { kind: 'blank', answers: ['formazan', 'formazans'] },
    ]);
    expect(order.type === 'order-steps' && order.steps.map(plainText)).toEqual(['Excise', 'Slice', 'Stain']);
    expect(label.type === 'label-diagram' && label.parts).toEqual(['ra', 'la', 'rv', 'lv']);
  });

  it('collects the terms and parts a lesson links to', () => {
    expect(linksOf(lesson)).toEqual({ terms: ['lv'], parts: ['lad'] });
  });

  it('warns about mistakes instead of failing', () => {
    const bad = parseLesson(
      [
        '---',
        'title: Bad',
        'tracks: [everyone]',
        '---',
        '# Title',
        '::video{src="x"}',
        ':::quiz{type="multiple-choice" id="a"}',
        'Pick one',
        '- [ ] only',
        ':::',
        ':::quiz{type="essay" id="a"}',
        ':::',
        ':::quiz{type="true-false"}',
        'Unclosed',
      ].join('\n'),
    );
    expect(bad.warnings).toEqual([
      'unknown track "everyone"',
      'use ## or ### for headings; the lesson title comes from the front matter',
      'unknown directive: ::video{src="x"}',
      'quiz a: needs at least two options',
      'quiz a: no option is marked [x]',
      'quiz id "a" is used twice',
      'quiz a: unknown type "essay"',
      'a :::quiz is not closed with :::',
      'quiz m0-q3: answer must be "true" or "false"',
    ]);
  });
});
