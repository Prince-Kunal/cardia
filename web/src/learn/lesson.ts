// The lesson format (content/README.md): front matter, then Markdown with a few directives.
//
//   ::scene{camera="section" highlight="lv,rv" anim="heartbeat"}   starts a lesson step and sets the heart view
//   :::quiz{type="multiple-choice" id="m1-chambers"}               a quiz, closed by a line with only :::
//   ::quiz{type="click-part" target="lv" prompt="Tap the left ventricle."}   a one-line quiz
//   [text](term:id)  opens a glossary card;  [text](part:id)  points at a part of the heart
//
// The Markdown is a small subset: ## and ### headings, paragraphs, - and 1. lists, > notes, **bold**,
// *italic*, `code` and links. Anything the parser can't use becomes a warning, and the content test
// fails on warnings, so a broken lesson never reaches learners.

export type Track = 'no-biology' | 'student' | 'researcher';
export const TRACKS: Track[] = ['no-biology', 'student', 'researcher'];

export interface LessonMeta {
  module: number;
  title: string;
  summary: string;
  minutes: number | null;
  tracks: Track[];
  sources: string[];
  /** Who checked the lesson for accuracy; empty until expert sign-off (unreviewed lessons are drafts). */
  reviewed_by: string;
}

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'term'; id: string; children: Inline[] }
  | { kind: 'part'; id: string; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] };

/** How the heart is shown for a step. The 2D diagram reads it now; the 3D heart will read the same. */
export interface Scene {
  camera: string;
  highlight: string[];
  hide: string[];
  /** 'auto' labels the highlighted parts; a list labels just those parts. */
  labels: 'auto' | 'all' | 'none' | string[];
  anim: string | null;
  speed: number;
  xray: boolean;
}

interface QuizBase {
  id: string;
  prompt: Inline[];
  explanation: Inline[];
}

export type Quiz =
  | (QuizBase & { type: 'multiple-choice'; options: { content: Inline[]; correct: boolean }[]; multiple: boolean })
  | (QuizBase & { type: 'true-false'; answer: boolean })
  | (QuizBase & { type: 'match'; pairs: { left: Inline[]; right: string }[] })
  | (QuizBase & { type: 'fill-blank'; segments: ({ kind: 'text'; content: Inline[] } | { kind: 'blank'; answers: string[] })[] })
  | (QuizBase & { type: 'order-steps'; steps: Inline[][] })
  | (QuizBase & { type: 'click-part'; targets: string[]; camera: string | null })
  | (QuizBase & { type: 'label-diagram'; parts: string[]; camera: string | null });

export type QuizType = Quiz['type'];
export const QUIZ_TYPES: QuizType[] = [
  'multiple-choice',
  'true-false',
  'match',
  'fill-blank',
  'order-steps',
  'click-part',
  'label-diagram',
];

export type Block =
  | { kind: 'heading'; level: 2 | 3; content: Inline[] }
  | { kind: 'paragraph'; content: Inline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: Inline[][] }
  | { kind: 'note'; content: Inline[] }
  | { kind: 'quiz'; quiz: Quiz };

export interface Step {
  scene: Scene;
  blocks: Block[];
  /** The step's first heading, for the step list. */
  title: string | null;
}

export interface Lesson {
  meta: LessonMeta;
  steps: Step[];
  warnings: string[];
}

export const DEFAULT_SCENE: Scene = {
  camera: 'section',
  highlight: [],
  hide: [],
  labels: 'auto',
  anim: null,
  speed: 1,
  xray: false,
};

// ---------------------------------------------------------------------------------------------
// Front matter: `key: value`, `key: [a, b]`, and `key:` followed by `  - item` lines.

/** A value: quoted (anything after the closing quote, like a comment, is dropped) or bare (up to a # comment). */
function scalar(raw: string): string {
  const v = raw.trim();
  const quote = v[0];
  if (quote === '"' || quote === "'") {
    const end = v.indexOf(quote, 1);
    if (end > 0) return v.slice(1, end);
  }
  const hash = v.search(/\s#/);
  return (hash >= 0 ? v.slice(0, hash) : v).trim();
}

export function parseFrontMatter(text: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  let listKey: string | null = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      (out[listKey] as string[]).push(scalar(item[1]));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, rest] = kv;
    const value = scalar(rest);
    if (rest.trim() === '' || rest.trim().startsWith('#')) {
      out[key] = [];
      listKey = key;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      out[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => scalar(s))
        .filter(Boolean);
      listKey = null;
    } else {
      out[key] = value;
      listKey = null;
    }
  }
  // A key followed by no list items is an empty string, not an empty list.
  for (const [k, v] of Object.entries(out)) if (Array.isArray(v) && v.length === 0 && k !== 'sources' && k !== 'tracks') out[k] = '';
  return out;
}

// ---------------------------------------------------------------------------------------------
// Inline Markdown.

/** Where the closing marker is, skipping escaped characters; -1 if there is none (or nothing inside). */
function closing(src: string, from: number, marker: string): number {
  for (let j = from; j < src.length; j++) {
    if (src[j] === '\\') {
      j += 1;
      continue;
    }
    if (src.startsWith(marker, j)) return j > from ? j : -1;
  }
  return -1;
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ kind: 'text', text });
    text = '';
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\' && i + 1 < src.length) {
      text += src[i + 1];
      i += 2;
      continue;
    }
    if (c === '`') {
      const end = closing(src, i + 1, '`');
      if (end > 0) {
        flush();
        out.push({ kind: 'code', text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (src.startsWith('**', i)) {
      const end = closing(src, i + 2, '**');
      if (end > 0) {
        flush();
        out.push({ kind: 'strong', children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if ((c === '*' || c === '_') && src[i + 1] !== ' ' && (i === 0 || !/\w/.test(src[i - 1]))) {
      const end = closing(src, i + 1, c);
      if (end > 0 && src[end - 1] !== ' ') {
        flush();
        out.push({ kind: 'em', children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (c === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(src.slice(i));
      if (m) {
        flush();
        const [whole, label, href] = m;
        const children = parseInline(label);
        if (href.startsWith('term:')) out.push({ kind: 'term', id: href.slice(5), children });
        else if (href.startsWith('part:')) out.push({ kind: 'part', id: href.slice(5), children });
        else out.push({ kind: 'link', href, children });
        i += whole.length;
        continue;
      }
    }
    text += c;
    i += 1;
  }
  flush();
  return out;
}

/** Plain text of inline content (for ids, titles and accessible names). */
export function plainText(content: Inline[]): string {
  return content.map((n) => ('text' in n ? n.text : plainText(n.children))).join('');
}

// ---------------------------------------------------------------------------------------------
// Directives.

export function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+))|([\w-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[5]) out[m[5]] = 'true';
    else out[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function sceneOf(attrs: Record<string, string>): Scene {
  const labels = attrs.labels;
  const speed = Number(attrs.speed);
  return {
    camera: attrs.camera || DEFAULT_SCENE.camera,
    highlight: list(attrs.highlight),
    hide: list(attrs.hide),
    labels: !labels || labels === 'auto' ? 'auto' : labels === 'all' || labels === 'none' ? labels : list(labels),
    anim: attrs.anim || null,
    speed: Number.isFinite(speed) && speed > 0 ? speed : 1,
    xray: attrs.xray === 'true',
  };
}

const OPTION = /^[-*]\s+\[( |x|X)\]\s+(.*)$/;
const ORDERED = /^\d+[.)]\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;

function parseQuiz(attrs: Record<string, string>, body: string[], id: string, warn: (m: string) => void): Quiz | null {
  const type = attrs.type as QuizType;
  if (!QUIZ_TYPES.includes(type)) {
    warn(`quiz ${id}: unknown type "${attrs.type ?? ''}"`);
    return null;
  }
  const promptLines: string[] = [];
  const explanation: string[] = [];
  const options: { content: Inline[]; correct: boolean }[] = [];
  const pairs: { left: Inline[]; right: string }[] = [];
  const steps: Inline[][] = [];
  for (const raw of body) {
    const line = raw.trim();
    if (!line) continue;
    let m: RegExpExecArray | null;
    if (line.startsWith('>')) explanation.push(line.replace(/^>\s?/, ''));
    else if (type === 'multiple-choice' && (m = OPTION.exec(line))) options.push({ content: parseInline(m[2]), correct: m[1] !== ' ' });
    else if (type === 'match' && (m = BULLET.exec(line)) && m[1].includes(' = ')) {
      const at = m[1].indexOf(' = ');
      pairs.push({ left: parseInline(m[1].slice(0, at).trim()), right: m[1].slice(at + 3).trim() });
    } else if (type === 'order-steps' && (m = ORDERED.exec(line))) steps.push(parseInline(m[1]));
    else promptLines.push(line);
  }
  const promptText = promptLines.join(' ') || attrs.prompt || '';
  const base = { id, prompt: parseInline(promptText), explanation: parseInline(explanation.join(' ')) };
  if (!promptText && type !== 'fill-blank') warn(`quiz ${id}: no question`);

  switch (type) {
    case 'multiple-choice': {
      const right = options.filter((o) => o.correct).length;
      if (options.length < 2) warn(`quiz ${id}: needs at least two options`);
      if (right === 0) warn(`quiz ${id}: no option is marked [x]`);
      return { ...base, type, options, multiple: right > 1 };
    }
    case 'true-false':
      if (attrs.answer !== 'true' && attrs.answer !== 'false') warn(`quiz ${id}: answer must be "true" or "false"`);
      return { ...base, type, answer: attrs.answer === 'true' };
    case 'match':
      if (pairs.length < 2) warn(`quiz ${id}: needs at least two "- left = right" pairs`);
      return { ...base, type, pairs };
    case 'fill-blank': {
      const segments: Extract<Quiz, { type: 'fill-blank' }>['segments'] = [];
      const re = /\[\[([^\]]+)\]\]/g;
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(promptText))) {
        if (m.index > last) segments.push({ kind: 'text', content: parseInline(promptText.slice(last, m.index)) });
        segments.push({ kind: 'blank', answers: m[1].split('|').map((a) => a.trim()).filter(Boolean) });
        last = m.index + m[0].length;
      }
      if (last < promptText.length) segments.push({ kind: 'text', content: parseInline(promptText.slice(last)) });
      if (!segments.some((s) => s.kind === 'blank')) warn(`quiz ${id}: no [[blank]] in the sentence`);
      return { ...base, prompt: [], type, segments };
    }
    case 'order-steps':
      if (steps.length < 3) warn(`quiz ${id}: needs at least three numbered steps`);
      return { ...base, type, steps };
    case 'click-part':
      if (list(attrs.target).length === 0) warn(`quiz ${id}: no target part`);
      return { ...base, type, targets: list(attrs.target), camera: attrs.camera || null };
    case 'label-diagram':
      if (list(attrs.parts).length < 2) warn(`quiz ${id}: needs at least two parts`);
      return { ...base, type, parts: list(attrs.parts), camera: attrs.camera || null };
  }
}

// ---------------------------------------------------------------------------------------------
// The whole lesson.

export function parseLesson(source: string, fallbackModule = 0): Lesson {
  const warnings: string[] = [];
  const text = source.replace(/\r\n?/g, '\n');
  let body = text;
  let fm: Record<string, string | string[]> = {};
  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---', 4);
    if (end > 0) {
      fm = parseFrontMatter(text.slice(4, end));
      body = text.slice(text.indexOf('\n', end + 1) + 1);
    } else warnings.push('front matter is not closed with ---');
  }

  const module = Number(fm.module ?? fallbackModule);
  const tracks = (Array.isArray(fm.tracks) ? fm.tracks : list(String(fm.tracks ?? ''))) as Track[];
  for (const t of tracks) if (!TRACKS.includes(t)) warnings.push(`unknown track "${t}"`);
  const minutes = Number(fm.minutes);
  const meta: LessonMeta = {
    module: Number.isFinite(module) ? module : fallbackModule,
    title: String(fm.title ?? ''),
    summary: String(fm.summary ?? ''),
    minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
    tracks: tracks.filter((t) => TRACKS.includes(t)),
    sources: Array.isArray(fm.sources) ? fm.sources : fm.sources ? [String(fm.sources)] : [],
    reviewed_by: String(fm.reviewed_by ?? ''),
  };
  if (!meta.title) warnings.push('no title in the front matter');

  const steps: Step[] = [];
  let step: Step = { scene: { ...DEFAULT_SCENE }, blocks: [], title: null };
  let paragraph: string[] = [];
  let items: string[] = [];
  let ordered = false;
  let start = 1;
  let note: string[] = [];
  let quizCount = 0;
  const ids = new Set<string>();

  const flush = () => {
    if (paragraph.length) step.blocks.push({ kind: 'paragraph', content: parseInline(paragraph.join(' ')) });
    if (items.length) step.blocks.push({ kind: 'list', ordered, start, items: items.map(parseInline) });
    if (note.length) step.blocks.push({ kind: 'note', content: parseInline(note.join(' ')) });
    paragraph = [];
    items = [];
    note = [];
  };
  const quizId = (attrs: Record<string, string>) => {
    quizCount += 1;
    const id = attrs.id || `m${meta.module}-q${quizCount}`;
    if (ids.has(id)) warnings.push(`quiz id "${id}" is used twice`);
    ids.add(id);
    return id;
  };
  const addQuiz = (attrs: Record<string, string>, lines: string[]) => {
    const id = quizId(attrs);
    const quiz = parseQuiz(attrs, lines, id, (m) => warnings.push(m));
    if (quiz) step.blocks.push({ kind: 'quiz', quiz });
  };

  const lines = body.split('\n');
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const trimmed = line.trim();
    let m: RegExpExecArray | null;

    if ((m = /^::scene\{(.*)\}\s*$/.exec(trimmed))) {
      flush();
      if (step.blocks.length > 0) steps.push(step);
      step = { scene: sceneOf(parseAttrs(m[1])), blocks: [], title: null };
      continue;
    }
    if ((m = /^:::quiz\{(.*)\}\s*$/.exec(trimmed))) {
      flush();
      const inner: string[] = [];
      let closed = false;
      for (n += 1; n < lines.length; n++) {
        if (lines[n].trim() === ':::') {
          closed = true;
          break;
        }
        inner.push(lines[n]);
      }
      if (!closed) warnings.push('a :::quiz is not closed with :::');
      addQuiz(parseAttrs(m[1]), inner);
      continue;
    }
    if ((m = /^::quiz\{(.*)\}\s*$/.exec(trimmed))) {
      flush();
      addQuiz(parseAttrs(m[1]), []);
      continue;
    }
    if (trimmed.startsWith('::')) {
      warnings.push(`unknown directive: ${trimmed.slice(0, 40)}`);
      continue;
    }
    if (!trimmed) {
      flush();
      continue;
    }
    if ((m = /^(#{2,3})\s+(.*)$/.exec(trimmed))) {
      flush();
      const content = parseInline(m[2]);
      step.blocks.push({ kind: 'heading', level: m[1].length as 2 | 3, content });
      step.title ??= plainText(content);
      continue;
    }
    if (/^#\s/.test(trimmed)) {
      warnings.push('use ## or ### for headings; the lesson title comes from the front matter');
      continue;
    }
    if (trimmed.startsWith('>')) {
      if (paragraph.length || items.length) flush();
      note.push(trimmed.replace(/^>\s?/, ''));
      continue;
    }
    const bullet = BULLET.exec(trimmed);
    const numbered = ORDERED.exec(trimmed);
    if (bullet || numbered) {
      if (paragraph.length || note.length || (items.length && ordered !== !!numbered)) flush();
      if (items.length === 0) start = numbered ? Number(/^\d+/.exec(trimmed)?.[0] ?? 1) : 1;
      ordered = !!numbered;
      items.push((numbered ?? bullet)![1]);
      continue;
    }
    if (items.length && /^\s{2,}/.test(line)) {
      items[items.length - 1] += ` ${trimmed}`;
      continue;
    }
    if (items.length || note.length) flush();
    paragraph.push(trimmed);
  }
  flush();
  if (step.blocks.length > 0 || steps.length === 0) steps.push(step);

  return { meta, steps, warnings };
}

/** Every quiz in a lesson, in order. */
export function quizzesOf(lesson: Lesson): Quiz[] {
  return lesson.steps.flatMap((s) => s.blocks.flatMap((b) => (b.kind === 'quiz' ? [b.quiz] : [])));
}

/** Every term: and part: id a lesson links to (for the content checks). */
export function linksOf(lesson: Lesson): { terms: string[]; parts: string[] } {
  const terms = new Set<string>();
  const parts = new Set<string>();
  const walk = (content: Inline[]) => {
    for (const n of content) {
      if (n.kind === 'term') terms.add(n.id);
      if (n.kind === 'part') parts.add(n.id);
      if ('children' in n) walk(n.children);
    }
  };
  for (const s of lesson.steps) {
    for (const b of s.blocks) {
      if (b.kind === 'paragraph' || b.kind === 'note' || b.kind === 'heading') walk(b.content);
      else if (b.kind === 'list') b.items.forEach(walk);
      else if (b.kind === 'quiz') {
        walk(b.quiz.prompt);
        walk(b.quiz.explanation);
      }
    }
  }
  return { terms: [...terms], parts: [...parts] };
}
