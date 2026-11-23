// Checking quiz answers, kept apart from drawing them so it can be tested on its own.

/** A stable shuffle: the same quiz always shows its choices in the same mixed order. */
export function shuffled<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Shuffled, but never left in the right order (for "put the steps in order"). */
export function scrambled<T>(items: T[], seed: string): T[] {
  const out = shuffled(items, seed);
  if (out.length > 1 && out.every((x, i) => x === items[i])) out.push(out.shift() as T);
  return out;
}

/** How a typed answer is compared: case, accents, extra spaces and end punctuation don't matter. */
export function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s"'“”‘’.,;:!?()-]+|[\s"'“”‘’.,;:!?()-]+$/g, '');
}

export function blankRight(typed: string, answers: string[]): boolean {
  const t = normalise(typed);
  return t !== '' && answers.some((a) => normalise(a) === t);
}

/** Multiple choice: exactly the right options chosen. */
export function choiceRight(chosen: Set<number>, correct: boolean[]): boolean {
  return correct.every((c, i) => c === chosen.has(i));
}

/** Order, match and label quizzes: which positions are right. */
export function positionsRight<T>(given: (T | undefined)[], expected: T[]): boolean[] {
  return expected.map((e, i) => given[i] === e);
}
