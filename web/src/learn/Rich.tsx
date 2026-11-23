// Lesson text: inline Markdown, blocks, glossary cards (term: links) and part: links that point at the
// heart. Quizzes are drawn by QuizView; LessonPlayer passes it in so this file stays about text.

import { type ReactNode, useContext } from 'react';
import type { Block, Inline } from './lesson';
import { LinksContext } from './links';

function TermLink({ id, children }: { id: string; children: ReactNode }) {
  const links = useContext(LinksContext);
  if (!links?.termExists(id)) return <>{children}</>;
  return (
    <button type="button" className="term-link" onClick={(e) => links.openTerm(id, e.currentTarget)} aria-haspopup="dialog">
      {children}
    </button>
  );
}

function PartLink({ id, children }: { id: string; children: ReactNode }) {
  const links = useContext(LinksContext);
  if (!links?.pointAt) return <strong className="part-name">{children}</strong>;
  const point = links.pointAt;
  return (
    <button
      type="button"
      className="part-link"
      onMouseEnter={() => point(id)}
      onMouseLeave={() => point(null)}
      onFocus={() => point(id)}
      onBlur={() => point(null)}
      onClick={() => point(id)}
      title="Show it on the heart"
    >
      {children}
    </button>
  );
}

export function Inlines({ content }: { content: Inline[] }) {
  return (
    <>
      {content.map((n, i) => {
        switch (n.kind) {
          case 'text':
            return n.text;
          case 'code':
            return <code key={i}>{n.text}</code>;
          case 'strong':
            return (
              <strong key={i}>
                <Inlines content={n.children} />
              </strong>
            );
          case 'em':
            return (
              <em key={i}>
                <Inlines content={n.children} />
              </em>
            );
          case 'term':
            return (
              <TermLink key={i} id={n.id}>
                <Inlines content={n.children} />
              </TermLink>
            );
          case 'part':
            return (
              <PartLink key={i} id={n.id}>
                <Inlines content={n.children} />
              </PartLink>
            );
          case 'link':
            return (
              <a key={i} href={n.href} target="_blank" rel="noreferrer">
                <Inlines content={n.children} />
              </a>
            );
        }
      })}
    </>
  );
}

export function Blocks({ blocks, quiz }: { blocks: Block[]; quiz: (b: Extract<Block, { kind: 'quiz' }>) => ReactNode }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'heading':
            return b.level === 2 ? (
              <h2 key={i} className="lesson-heading">
                <Inlines content={b.content} />
              </h2>
            ) : (
              <h3 key={i} className="lesson-subheading">
                <Inlines content={b.content} />
              </h3>
            );
          case 'paragraph':
            return (
              <p key={i}>
                <Inlines content={b.content} />
              </p>
            );
          case 'list': {
            const items = b.items.map((item, j) => (
              <li key={j}>
                <Inlines content={item} />
              </li>
            ));
            return b.ordered ? (
              <ol key={i} start={b.start}>
                {items}
              </ol>
            ) : (
              <ul key={i}>{items}</ul>
            );
          }
          case 'note':
            return (
              <aside key={i} className="lesson-note">
                <Inlines content={b.content} />
              </aside>
            );
          case 'quiz':
            return <div key={b.quiz.id}>{quiz(b)}</div>;
        }
      })}
    </>
  );
}
