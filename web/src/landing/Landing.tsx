// The landing page (#/): one heart's story, from the lab bench to Cardia's number, told by scrolling.
// The 3D scene sits fixed behind the text; each chapter is a section of the page, and how far the
// page has scrolled through the chapters (`u`, in chapters) drives the scene (story.ts). The finale
// is a real slice from the study set with the engine's real result. Works without the engine, and
// without WebGL (the text and the real slice still tell the story).

import { type CSSProperties, Suspense, lazy, useEffect, useRef, useState } from 'react';
import { BrandMark } from '../components/BrandMark';
import { webglAvailable } from '../heart3d/mode';
import { reducedMotion } from '../heart/timeline';
import { useTitle } from '../lib/hooks';
import { scrollPageTo } from '../lib/scroll';
import type { LabelRefs } from './world';
import { CHAPTERS, N, clamp01 } from './story';
import './landing.css';

const LandingScene = lazy(() => import('./LandingScene'));

/** The real slice in the finale: heart 210, slice IS109, as the engine measured it (reference/golden). */
const FINALE = {
  slice: '210-IS109',
  methods: [
    { id: 'a', name: 'Method A', detail: 'K-Means + RF', value: 31.2 },
    { id: 'b', name: 'Method B', detail: 'DBSCAN + RF', value: 36.8 },
    { id: 'c', name: 'Method C', detail: 'Stain ratio', value: 7.8 },
  ],
};

const SLICE_NAMES = ['1 · apex', '2', '3', '4', '5', '6 · base'];
const PART_LABELS: { id: string; text: string; tone: 'living' | 'dead' | 'plain' }[] = [
  { id: 'living', text: 'Living muscle', tone: 'living' },
  { id: 'infarct', text: 'Infarct', tone: 'dead' },
  { id: 'lv', text: 'Left ventricle cavity', tone: 'plain' },
  { id: 'rv', text: 'Right ventricle', tone: 'plain' },
  { id: 'septum', text: 'Septum', tone: 'plain' },
];

function useReduced(): boolean {
  const [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(reducedMotion());
    mq?.addEventListener?.('change', update);
    return () => mq?.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

export function Landing() {
  useTitle('');
  const reduced = useReduced();
  const [gl] = useState(webglAvailable);
  const root = useRef<HTMLDivElement>(null);
  const sections = useRef<(HTMLElement | null)[]>([]);
  const counters = useRef<(HTMLElement | null)[]>([]);
  const progress = useRef(0);
  const labels = useRef<LabelRefs>({ slices: [], parts: {} });
  const labelLayer = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  // Every frame: how far through each chapter the page is, as --c on the chapter and u for the scene.
  useEffect(() => {
    let raf = 0;
    let last = -1;
    // In development, ?u=4.5&still holds the scene at that moment without scrolling (to check it by eye).
    const params = new URLSearchParams(window.location.search);
    const still = import.meta.env.DEV && params.has('still') ? Number(params.get('u')) : null;
    // What was last written, so a frame only touches the styles that changed.
    const written = new Map<HTMLElement, string>();
    const write = (el: HTMLElement | null, name: string, value: string) => {
      if (!el) return;
      const key = `${name}:${value}`;
      if (written.get(el) === key) return;
      el.style.setProperty(name, value);
      written.set(el, key);
    };
    const writtenC = new Map<HTMLElement, string>();
    const tick = () => {
      // Read every position first, then write: interleaving them would force a layout per chapter.
      const vh = window.innerHeight;
      const rects = sections.current.map((el) => (el ? el.getBoundingClientRect() : null));
      let u = 0;
      let c8 = 0;
      const out: [HTMLElement, string, string][] = [];
      rects.forEach((r, i) => {
        const el = sections.current[i];
        if (!r || !el) return;
        const c = clamp01(-r.top / r.height);
        if (i === 8) c8 = c;
        // How far the chapter has risen into the window: 0 with its top at the bottom edge, 1 at the top.
        const e = clamp01(1 - r.top / vh);
        const cs = c.toFixed(3);
        if (writtenC.get(el) !== cs) {
          writtenC.set(el, cs);
          out.push([el, '--c', cs]);
        }
        out.push([el, '--e', e.toFixed(3)]);
        if (r.top <= 1) u = i + c;
      });
      if (still !== null) u = still;
      progress.current = u;
      for (const [el, name, value] of out) {
        if (name === '--c') el.style.setProperty(name, value);
        else write(el, name, value);
      }
      const us = u.toFixed(3);
      write(labelLayer.current, '--u', us);
      write(rail.current, '--u', us);
      // The finale's numbers count up as the scan is read.
      const f = clamp01((c8 - 0.32) / 0.3);
      counters.current.forEach((el, i) => {
        const text = (FINALE.methods[i].value * (1 - (1 - f) ** 3)).toFixed(1);
        if (el && el.textContent !== text) el.textContent = text;
      });
      const now = Math.min(N - 1, Math.floor(u + 0.15));
      if (now !== last) {
        last = now;
        setActive(now);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ?u=4.5 opens the page at that point of the story (for checking a moment by eye).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const want = Number(params.get('u'));
    if (!want || params.has('still')) return;
    const i = Math.min(N - 1, Math.floor(want));
    const el = sections.current[i];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY + (want - i) * el.offsetHeight;
    requestAnimationFrame(() => scrollPageTo(top));
  }, []);

  const goTo = (i: number) => {
    const el = sections.current[i];
    if (el) scrollPageTo(el.getBoundingClientRect().top + window.scrollY + 2, { smooth: true });
  };

  const setSection = (i: number) => (el: HTMLElement | null) => {
    sections.current[i] = el;
  };

  return (
    <div className={`landing${gl ? '' : ' no-gl'}`} ref={root}>
      <a className="skip" href="#story">
        Skip to content
      </a>
      <header className="landing-nav">
        <a className="brand" href="#/" aria-label="Cardia, home">
          <BrandMark size={32} />
          Cardia
        </a>
        <nav className="landing-links" aria-label="Main">
          <a href="#/learn" className="nav-link">
            Learn
          </a>
          <a href="#/help" className="nav-link">
            Help
          </a>
          <a href="#/library" className="button primary small">
            Open the lab
          </a>
        </nav>
      </header>

      <div className="landing-stage" aria-hidden="true">
        {gl && (
          <Suspense fallback={null}>
            <LandingScene progress={progress} labels={labels} reduced={reduced} />
          </Suspense>
        )}
        <div className="landing-vignette" />
        <div className="landing-labels" ref={labelLayer}>
          {SLICE_NAMES.map((name, i) => (
            <span
              key={name}
              className="slice-label"
              ref={(el) => {
                labels.current.slices[i] = el;
              }}
            >
              {name}
            </span>
          ))}
          {PART_LABELS.map((p) => (
            <span
              key={p.id}
              className={`part-label ${p.tone}`}
              ref={(el) => {
                labels.current.parts[p.id] = el;
              }}
            >
              <i />
              {p.text}
            </span>
          ))}
          <span className="micro-label dead">
            <i />
            Dead cells: no enzymes, no formazan, no nucleus
          </span>
          <span className="micro-label living">
            <i />
            Living cells: packed with red formazan
          </span>
        </div>
      </div>

      <nav className="landing-rail" aria-label="Chapters" ref={rail}>
        <span className="rail-fill" />
        {CHAPTERS.map((ch, i) => (
          <button
            key={ch.id}
            type="button"
            className="rail-dot"
            aria-current={active === i ? 'step' : undefined}
            aria-label={`${ch.eyebrow.replace(/^\d+ · /, '')}: ${ch.title}`}
            onClick={() => goTo(i)}
          >
            <span className="rail-tip">{ch.eyebrow.replace(/^\d+ · /, '')}</span>
          </button>
        ))}
      </nav>

      <main id="story" className="landing-story">
        {CHAPTERS.map((ch, i) => {
          if (ch.id === 'hero')
            return (
              <section key={ch.id} ref={setSection(i)} className="chapter hero" aria-labelledby="hero-title">
                <div className="hero-copy">
                  <span className="eyebrow">TTC infarct analysis · and a course</span>
                  <h1 id="hero-title" className="hero-title">
                    Every heart keeps a <em>record</em>
                  </h1>
                  <p className="hero-lede">{ch.body[0]}</p>
                  <div className="row">
                    <a href="#/library" className="button primary">
                      Open the lab
                    </a>
                    <a href="#/learn" className="button">
                      Start learning
                    </a>
                  </div>
                </div>
                <button type="button" className="scroll-cue" onClick={() => goTo(1)}>
                  <span>Follow one heart</span>
                  <i />
                </button>
              </section>
            );
          if (ch.id === 'cardia')
            return (
              <section key={ch.id} ref={setSection(i)} className="chapter finale" aria-labelledby={`ch-${ch.id}`}>
                <div className="finale-panel">
                  <div className="chapter-card">
                    <span className="eyebrow">{ch.eyebrow}</span>
                    <h2 id={`ch-${ch.id}`}>{ch.title}</h2>
                    {ch.body.map((b) => (
                      <p key={b}>{b}</p>
                    ))}
                    <dl className="finale-methods">
                      {FINALE.methods.map((m, k) => (
                        <div key={m.id} className={`finale-method ${m.id}`}>
                          <dt>
                            {m.name} <span>{m.detail}</span>
                          </dt>
                          <dd>
                            <span
                              ref={(el) => {
                                counters.current[k] = el;
                              }}
                            >
                              {m.value.toFixed(1)}
                            </span>
                            %
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <figure className="scan" aria-label={`Slice ${FINALE.slice} from the study set, with Method A's infarct outlined`}>
                    <img src="/landing/210IS109.jpg" alt="" />
                    <div className="scan-mask scan-dead" />
                    <div className="scan-mask scan-dead-edge" />
                    <div className="scan-mask scan-outline" />
                    <div className="scan-line" />
                    <figcaption>
                      <span>Slice {FINALE.slice}</span>
                      <span>Method A · infarct in blue</span>
                    </figcaption>
                  </figure>
                </div>
              </section>
            );
          if (ch.id === 'doors')
            return (
              <section key={ch.id} ref={setSection(i)} className="chapter doors" aria-labelledby="ch-doors">
                <div className="doors-head">
                  <span className="eyebrow">Begin</span>
                  <h2 id="ch-doors">
                    Two ways <em>in</em>
                  </h2>
                </div>
                <div className="door-grid">
                  <a className="door lab" href="#/library">
                    <span className="door-art" aria-hidden="true">
                      {[0.55, 0.75, 0.9, 1, 1, 0.95].map((s, k) => (
                        <i key={k} style={{ '--s': s, '--k': k } as CSSProperties} />
                      ))}
                    </span>
                    <span className="eyebrow">The lab</span>
                    <strong>Analyse your slices</strong>
                    <span className="door-text">
                      Drop in scanned TTC slices. Three methods measure every one, on this computer, with reports you can export and print.
                    </span>
                    <span className="door-go">Open the lab →</span>
                  </a>
                  <a className="door course" href="#/learn">
                    <span className="door-art" aria-hidden="true">
                      <svg viewBox="0 0 220 120">
                        <path d="M10 100 C 50 100, 40 30, 90 40 S 140 100, 170 60 S 200 20, 212 18" />
                        {[
                          [10, 100],
                          [62, 52],
                          [110, 62],
                          [160, 70],
                          [212, 18],
                        ].map(([x, y], k) => (
                          <circle key={k} cx={x} cy={y} r={k === 4 ? 9 : 7} />
                        ))}
                      </svg>
                    </span>
                    <span className="eyebrow">The course</span>
                    <strong>Learn how it works</strong>
                    <span className="door-text">
                      Twelve short lessons from “what is a heart” to random forests, with a 3D heart, quizzes, streaks and XP.
                    </span>
                    <span className="door-go">Start learning →</span>
                  </a>
                </div>
                <footer className="landing-foot">
                  <span>
                    <BrandMark size={20} /> Cardia
                  </span>
                  <span>Analysis runs on this computer. Nothing leaves it unless you turn on sync.</span>
                  <span>
                    Heart model: “<a href="https://sketchfab.com/3d-models/realistic-human-heart-3f8072336ce94d18b3d0d055a1ece089">Realistic Human Heart</a>”
                    by neshallads, <a href="http://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>
                  </span>
                  <a href="#/help">Help & credits</a>
                </footer>
              </section>
            );
          return (
            <section key={ch.id} ref={setSection(i)} className={`chapter ch-${ch.id}`} aria-labelledby={`ch-${ch.id}`}>
              <div className="chapter-card">
                <span className="eyebrow">{ch.eyebrow}</span>
                <h2 id={`ch-${ch.id}`}>{ch.title}</h2>
                {ch.body.map((b) => (
                  <p key={b}>{b}</p>
                ))}
                {ch.facts && (
                  <dl className="chapter-facts">
                    {ch.facts.map((f) => (
                      <div key={f.label}>
                        <dt>{f.label}</dt>
                        <dd>{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
