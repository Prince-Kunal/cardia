// One quiz, any type (PLAN.md §3e). Each answer is followed by a short explanation; answers are
// recorded, and wrong ones come back later for review.

import { type ReactNode, useId, useMemo, useState } from 'react';
import { HeartDiagram } from '../heart/HeartDiagram';
import { partName } from '../heart/parts';
import { DEFAULT_SCENE, type Quiz, plainText } from './lesson';
import { answerQuiz } from './progress';
import { blankRight, choiceRight, positionsRight, scrambled, shuffled } from './quizLogic';
import { Inlines } from './Rich';

const KIND: Record<Quiz['type'], string> = {
  'multiple-choice': 'Question',
  'true-false': 'True or false',
  match: 'Match them up',
  'fill-blank': 'Fill in the blank',
  'order-steps': 'Put the steps in order',
  'click-part': 'Find it on the heart',
  'label-diagram': 'Label the heart',
};

type Result = { correct: boolean } | null;

function Shell({
  quiz,
  result,
  children,
  onCheck,
  canCheck = true,
  onRetry,
}: {
  quiz: Quiz;
  result: Result;
  children: ReactNode;
  onCheck?: () => void;
  canCheck?: boolean;
  onRetry: () => void;
}) {
  const titleId = useId();
  return (
    <section className={`quiz ${result ? (result.correct ? 'is-right' : 'is-wrong') : ''}`} aria-labelledby={titleId}>
      <div className="quiz-kind" id={titleId}>
        {KIND[quiz.type]}
      </div>
      {quiz.prompt.length > 0 && (
        <p className="quiz-prompt">
          <Inlines content={quiz.prompt} />
        </p>
      )}
      {children}
      <div className="quiz-actions">
        {!result && onCheck && (
          <button type="button" className="button primary" onClick={onCheck} disabled={!canCheck}>
            Check
          </button>
        )}
        {result && !result.correct && (
          <button type="button" className="button" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
      {result && (
        <div className="quiz-feedback" role="status">
          <strong>{result.correct ? 'Right.' : 'Not quite.'}</strong>{' '}
          {quiz.explanation.length > 0 && <Inlines content={quiz.explanation} />}
          {!result.correct && <span className="fine"> It will come back in your review.</span>}
        </div>
      )}
    </section>
  );
}

function useResult(id: string) {
  const [result, setResult] = useState<Result>(null);
  const answer = (correct: boolean) => {
    answerQuiz(id, correct);
    setResult({ correct });
  };
  return { result, answer, reset: () => setResult(null) };
}

function MultipleChoice({ quiz }: { quiz: Extract<Quiz, { type: 'multiple-choice' }> }) {
  const { result, answer, reset } = useResult(quiz.id);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const name = useId();
  const correct = quiz.options.map((o) => o.correct);
  return (
    <Shell
      quiz={quiz}
      result={result}
      canCheck={chosen.size > 0}
      onCheck={() => answer(choiceRight(chosen, correct))}
      onRetry={() => {
        reset();
        setChosen(new Set());
      }}
    >
      {quiz.multiple && <p className="fine">Choose every answer that is right.</p>}
      <div className="quiz-options" role={quiz.multiple ? 'group' : 'radiogroup'}>
        {quiz.options.map((o, i) => {
          const mark = result ? (o.correct ? 'right' : chosen.has(i) ? 'wrong' : '') : '';
          return (
            <label key={i} className={`quiz-option ${mark}`}>
              <input
                type={quiz.multiple ? 'checkbox' : 'radio'}
                name={name}
                checked={chosen.has(i)}
                disabled={!!result}
                onChange={(e) => {
                  const next = quiz.multiple ? new Set(chosen) : new Set<number>();
                  if (e.target.checked) next.add(i);
                  else next.delete(i);
                  setChosen(next);
                }}
              />
              <span>
                <Inlines content={o.content} />
              </span>
            </label>
          );
        })}
      </div>
    </Shell>
  );
}

function TrueFalse({ quiz }: { quiz: Extract<Quiz, { type: 'true-false' }> }) {
  const { result, answer, reset } = useResult(quiz.id);
  const [picked, setPicked] = useState<boolean | null>(null);
  return (
    <Shell
      quiz={quiz}
      result={result}
      onRetry={() => {
        reset();
        setPicked(null);
      }}
    >
      <div className="row">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            className={`button quiz-tf ${result && picked === v ? (result.correct ? 'right' : 'wrong') : ''}`}
            aria-pressed={picked === v}
            disabled={!!result}
            onClick={() => {
              setPicked(v);
              answer(v === quiz.answer);
            }}
          >
            {v ? 'True' : 'False'}
          </button>
        ))}
      </div>
    </Shell>
  );
}

function Match({ quiz }: { quiz: Extract<Quiz, { type: 'match' }> }) {
  const { result, answer, reset } = useResult(quiz.id);
  const rights = useMemo(() => shuffled([...new Set(quiz.pairs.map((p) => p.right))], quiz.id), [quiz]);
  const [picked, setPicked] = useState<(string | undefined)[]>(() => quiz.pairs.map(() => undefined));
  const marks = result ? positionsRight(picked, quiz.pairs.map((p) => p.right)) : [];
  return (
    <Shell
      quiz={quiz}
      result={result}
      canCheck={picked.every((p) => p !== undefined)}
      onCheck={() => answer(positionsRight(picked, quiz.pairs.map((p) => p.right)).every(Boolean))}
      onRetry={() => {
        reset();
        setPicked(quiz.pairs.map(() => undefined));
      }}
    >
      <div className="quiz-match">
        {quiz.pairs.map((p, i) => (
          <label key={i} className={`quiz-match-row ${result ? (marks[i] ? 'right' : 'wrong') : ''}`}>
            <span className="quiz-match-left">
              <Inlines content={p.left} />
            </span>
            <select
              className="input"
              value={picked[i] ?? ''}
              disabled={!!result}
              aria-label={`Match for ${plainText(p.left)}`}
              onChange={(e) => setPicked(picked.map((x, j) => (j === i ? e.target.value || undefined : x)))}
            >
              <option value="">Choose…</option>
              {rights.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {result && !marks[i] && <span className="fine">→ {p.right}</span>}
          </label>
        ))}
      </div>
    </Shell>
  );
}

function FillBlank({ quiz }: { quiz: Extract<Quiz, { type: 'fill-blank' }> }) {
  const { result, answer, reset } = useResult(quiz.id);
  const blanks = quiz.segments.filter((s) => s.kind === 'blank');
  const [typed, setTyped] = useState<string[]>(() => blanks.map(() => ''));
  const rights = blanks.map((b, i) => blankRight(typed[i], b.answers));
  // Each segment's blank number (or -1 for text).
  const numbers = quiz.segments.map((s, i) => (s.kind === 'blank' ? quiz.segments.slice(0, i).filter((x) => x.kind === 'blank').length : -1));
  return (
    <Shell
      quiz={quiz}
      result={result}
      canCheck={typed.every((t) => t.trim() !== '')}
      onCheck={() => answer(rights.every(Boolean))}
      onRetry={() => {
        reset();
        setTyped(blanks.map(() => ''));
      }}
    >
      <p className="quiz-prompt quiz-fill">
        {quiz.segments.map((s, i) => {
          if (s.kind === 'text') return <Inlines key={i} content={s.content} />;
          const k = numbers[i];
          return (
            <span key={i} className="quiz-blank">
              <input
                className={`input small ${result ? (rights[k] ? 'right' : 'wrong') : ''}`}
                value={typed[k]}
                disabled={!!result}
                aria-label={`Blank ${k + 1}`}
                size={Math.max(8, ...s.answers.map((a) => a.length + 2))}
                onChange={(e) => setTyped(typed.map((t, j) => (j === k ? e.target.value : t)))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && typed.every((t) => t.trim() !== '') && !result) answer(rights.every(Boolean));
                }}
              />
              {result && !rights[k] && <span className="fine"> ({s.answers[0]})</span>}
            </span>
          );
        })}
      </p>
    </Shell>
  );
}

function OrderSteps({ quiz }: { quiz: Extract<Quiz, { type: 'order-steps' }> }) {
  const { result, answer, reset } = useResult(quiz.id);
  const start = useMemo(() => scrambled(quiz.steps.map((_, i) => i), quiz.id), [quiz]);
  const [order, setOrder] = useState<number[]>(start);
  const marks = positionsRight(order, quiz.steps.map((_, i) => i));
  const move = (at: number, by: -1 | 1) => {
    const next = [...order];
    [next[at], next[at + by]] = [next[at + by], next[at]];
    setOrder(next);
  };
  return (
    <Shell
      quiz={quiz}
      result={result}
      onCheck={() => answer(marks.every(Boolean))}
      onRetry={() => {
        reset();
        setOrder(start);
      }}
    >
      <ol className="quiz-order">
        {order.map((stepIndex, at) => (
          <li key={stepIndex} className={result ? (marks[at] ? 'right' : 'wrong') : ''}>
            <span className="grow">
              <Inlines content={quiz.steps[stepIndex]} />
            </span>
            {!result && (
              <span className="order-buttons">
                <button
                  type="button"
                  className="button ghost icon"
                  disabled={at === 0}
                  aria-label={`Move "${plainText(quiz.steps[stepIndex])}" up`}
                  onClick={() => move(at, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="button ghost icon"
                  disabled={at === order.length - 1}
                  aria-label={`Move "${plainText(quiz.steps[stepIndex])}" down`}
                  onClick={() => move(at, 1)}
                >
                  ↓
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
    </Shell>
  );
}

function ClickPart({ quiz, camera }: { quiz: Extract<Quiz, { type: 'click-part' }>; camera: string }) {
  const { result, answer, reset } = useResult(quiz.id);
  const [picked, setPicked] = useState<string | null>(null);
  const scene = { ...DEFAULT_SCENE, camera: quiz.camera ?? camera, labels: 'none' as const };
  const marks: Record<string, 'right' | 'wrong'> = {};
  if (result && picked) marks[picked] = result.correct ? 'right' : 'wrong';
  if (result && !result.correct) for (const t of quiz.targets) marks[t] = 'right';
  return (
    <Shell
      quiz={quiz}
      result={result}
      onRetry={() => {
        reset();
        setPicked(null);
      }}
    >
      <div className="quiz-diagram">
        <HeartDiagram
          scene={scene}
          marks={marks}
          onPartClick={
            result
              ? undefined
              : (id) => {
                  setPicked(id);
                  answer(quiz.targets.includes(id));
                }
          }
        />
      </div>
      {result && picked && (
        <p className="fine">
          You chose: {partName(picked)}
          {!result.correct && `. The answer: ${quiz.targets.map(partName).join(' or ')}.`}
        </p>
      )}
    </Shell>
  );
}

function LabelDiagram({ quiz, camera }: { quiz: Extract<Quiz, { type: 'label-diagram' }>; camera: string }) {
  const { result, answer, reset } = useResult(quiz.id);
  const choices = useMemo(() => shuffled(quiz.parts, quiz.id), [quiz]);
  const [picked, setPicked] = useState<(string | undefined)[]>(() => quiz.parts.map(() => undefined));
  const rights = positionsRight(picked, quiz.parts);
  const marks: Record<string, 'right' | 'wrong'> = {};
  if (result) quiz.parts.forEach((p, i) => (marks[p] = rights[i] ? 'right' : 'wrong'));
  const scene = { ...DEFAULT_SCENE, camera: quiz.camera ?? camera, labels: 'none' as const };
  return (
    <Shell
      quiz={quiz}
      result={result}
      canCheck={picked.every((p) => p !== undefined)}
      onCheck={() => answer(rights.every(Boolean))}
      onRetry={() => {
        reset();
        setPicked(quiz.parts.map(() => undefined));
      }}
    >
      <div className="quiz-diagram">
        <HeartDiagram scene={scene} pins={quiz.parts} marks={result ? marks : undefined} />
      </div>
      <div className="quiz-match">
        {quiz.parts.map((p, i) => (
          <label key={p} className={`quiz-match-row ${result ? (rights[i] ? 'right' : 'wrong') : ''}`}>
            <span className="quiz-pin" aria-hidden="true">
              {i + 1}
            </span>
            <span className="sr-only">Marker {i + 1}</span>
            <select
              className="input"
              value={picked[i] ?? ''}
              disabled={!!result}
              onChange={(e) => setPicked(picked.map((x, j) => (j === i ? e.target.value || undefined : x)))}
            >
              <option value="">Choose…</option>
              {choices.map((c) => (
                <option key={c} value={c}>
                  {partName(c)}
                </option>
              ))}
            </select>
            {result && !rights[i] && <span className="fine">→ {partName(p)}</span>}
          </label>
        ))}
      </div>
    </Shell>
  );
}

/** A quiz of any type. `camera` is the view of the step it sits in (for quizzes on the heart). */
export function QuizView({ quiz, camera = 'section' }: { quiz: Quiz; camera?: string }) {
  switch (quiz.type) {
    case 'multiple-choice':
      return <MultipleChoice quiz={quiz} />;
    case 'true-false':
      return <TrueFalse quiz={quiz} />;
    case 'match':
      return <Match quiz={quiz} />;
    case 'fill-blank':
      return <FillBlank quiz={quiz} />;
    case 'order-steps':
      return <OrderSteps quiz={quiz} />;
    case 'click-part':
      return <ClickPart quiz={quiz} camera={camera} />;
    case 'label-diagram':
      return <LabelDiagram quiz={quiz} camera={camera} />;
  }
}

