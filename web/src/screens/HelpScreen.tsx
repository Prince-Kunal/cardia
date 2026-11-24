// About and Help (PLAN.md §1g, §11a item 7): what Cardia is, how to use it, why a slice is flagged,
// questions people ask, shortcuts, what's new, how to cite it, and the credits and licences. Works
// without the engine, like Learn.

import { useContext, useState } from 'react';
import { href } from '../lib/router';
import { SHORTCUTS } from '../lib/shortcuts';
import { startTour } from '../lib/tour';
import { useTitle } from '../lib/hooks';
import { AppContext } from '../state';

const FLAGS: { flag: string; title: string; means: string; todo: string }[] = [
  {
    flag: 'many_unsure',
    title: 'Method A is unsure about more than 15% of the tissue',
    means:
      'For many pixels the random forest gave a probability between 0.35 and 0.65: neither clearly dead nor clearly alive. Pale-pink tissue, uneven staining, shadows and blur cause it.',
    todo: 'Look at the slice’s probability heatmap. If shadows or glare cover the slice, rescan it flat and evenly lit. Compare with Method B before relying on the number.',
  },
  {
    flag: 'uncertain_holes',
    title: 'Some dark areas may be holes; they were kept as tissue',
    means:
      'The hole scorer could not decide whether a dark patch inside the slice is a real hole (the chamber, a tear) or a shadow or crease. Unsure patches stay as tissue, and Method B’s range widens to cover both answers.',
    todo: 'Open the “Uncertain holes” layer. If a patch is clearly a hole or clearly tissue, the range tells you how much it can move the result.',
  },
  {
    flag: 'unvalidated_input',
    title: 'Not a TIFF scan',
    means:
      'Every setting in Cardia was chosen on TIFF scans. PNG and JPG files are analysed the same way, but JPG compression changes colours a little, and nobody has checked how much that moves the result.',
    todo: 'Scan as TIFF where you can. For a JPG, treat the result as approximate.',
  },
  {
    flag: 'no_weight',
    title: 'No slice weight',
    means:
      'Without a weight Cardia cannot give the dead mass in mg, and the heart’s percentage weights slices by tissue area instead of by weight.',
    todo: 'Type the weight on the heart’s page, or name the scan like 206IS89mg.tif so the weight is read from the name.',
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Why does every heart have two results?',
    a: 'Cardia measures with two methods, Method A (K-Means + random forest) and Method B (the stain ratio: tissue holding less than half the red stain of living muscle). They draw the line between dead and alive in different places and can differ by tens of percentage points. Until expert tracings show which is closer to the truth, reports show both, leading with the one chosen in Settings. Learn module 10 explains both.',
  },
  {
    q: 'My hand tracing gives a different number. Which is right?',
    a: 'Neither is certain. Hand tracing differs between people and between days; Cardia gives the same number for the same scan every time, but its methods have known limits. The gravimetric method (cutting out and weighing the pale tissue) is the gold standard; Learn module 9 compares the methods.',
  },
  {
    q: 'What do “unsure” and “borderline” mean?',
    a: 'Unsure (Method A): the random forest’s probability is between 0.35 and 0.65. Borderline (Method B): tissue holding between 40% and 60% of the red stain of living muscle, not clearly dead or alive. Method B’s range runs from the same rule at 40% of the stain to the rule at 60%.',
  },
  {
    q: 'Does my data leave this computer?',
    a: 'Not unless you turn on cloud sync and sign in. The engine runs on this computer and listens only to it. With sync on, the library goes to your workspace; original scans go only if the workspace opts in.',
  },
  {
    q: 'How do I move my library to another computer?',
    a: 'Settings → Backup and restore: download a backup on one computer and restore it on the other. Restoring adds hearts and never overwrites. With cloud sync, signing in on both computers does it for you.',
  },
  {
    q: 'Which files can I analyse?',
    a: 'TIFF scans of TTC-stained short-axis slices, one slice per file, ideally named like 206IS89mg.tif (heart 206, 89 mg). PNG and JPG work but are marked as unvalidated.',
  },
  {
    q: 'Can Cardia be used for patients?',
    a: 'No. It is a research tool for TTC-stained guinea pig heart slices. It does not diagnose anyone.',
  },
];

const NEW: { version: string; items: string[] }[] = [
  {
    version: 'Engine API 0.6.0',
    items: ['A walkthrough of one real analysis on a demo heart from the study set: start it here or from an empty library.'],
  },
  {
    version: 'Engine API 0.5.0',
    items: [
      'Cloud sync: your library and Learn progress on every computer you sign in on, and lab workspaces (off until the lab’s cloud project is set up).',
      'This Help page, with keyboard shortcuts.',
    ],
  },
  {
    version: 'Engine API 0.4.0',
    items: [
      'Backup and restore of the whole library as one file.',
      'Each heart’s report places it among the study hearts measured the same way.',
      'Learn: all twelve modules (drafts), the gravimetric gold standard, and the heart in 3D with a switch to the redrawn 2D diagram.',
    ],
  },
  {
    version: 'Engine API 0.3.0',
    items: ['Slice and heart reports, CSV and ZIP export, the Methods paragraph, and printing the report as a PDF.'],
  },
];

export function HelpScreen() {
  useTitle('Help');
  const app = useContext(AppContext);
  const pipeline = app?.info.pipeline_version;
  const api = app?.info.api_version;
  const [year] = useState(() => new Date().getFullYear());
  return (
    <div className="stack loose help">
      <div className="page-head">
        <div>
          <h1>About and help</h1>
          <p className="subtitle">
            Cardia measures dead tissue (the infarct) in scans of TTC-stained guinea pig heart slices, with two methods side by
            side, and teaches the science behind it in Learn.
          </p>
        </div>
      </div>
      <p className="note warn">
        A research tool for guinea pig hearts in the lab. It does not diagnose anyone, and its results are not medical advice.
      </p>

      <nav className="card" aria-label="On this page">
        <ul className="help-toc">
          {[
            ['start', 'Getting started'],
            ['flags', 'Why was my slice flagged?'],
            ['faq', 'Questions'],
            ['shortcuts', 'Keyboard shortcuts'],
            ['new', 'What’s new'],
            ['cite', 'How to cite Cardia'],
            ['credits', 'Credits and licences'],
          ].map(([id, label]) => (
            <li key={id}>
              <a href="#/help" onClick={(e) => (e.preventDefault(), document.getElementById(id)?.scrollIntoView({ block: 'start' }))}>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section id="start" className="card stack" aria-labelledby="start-title">
        <h2 id="start-title">Getting started</h2>
        <div className="note info row between">
          <span>
            <strong>The walkthrough</strong> takes you through one real analysis on a demo heart from the study set: import,
            processing, the report, a slice’s layers and export. Two or three minutes.
          </span>
          {app ? (
            <button type="button" className="button primary small" onClick={startTour}>
              Start the walkthrough
            </button>
          ) : (
            <span className="fine">It needs the engine running.</span>
          )}
        </div>
        <ol className="help-steps">
          <li>
            <strong>Start the engine</strong> on this computer and open the link it prints. The analysis runs here; scans never
            leave the computer.
          </li>
          <li>
            <strong>
              <a href={href({ name: 'import' })}>New analysis</a>
            </strong>
            : drop the scans of one or more hearts, apex to base. Names like <code>206IS89mg.tif</code> give the heart and the
            weight; type what a name lacks.
          </li>
          <li>
            <strong>Wait a few seconds a slice</strong> (about 3 s each on a 4-core laptop, several at once). Each finished
            slice is filed into its heart.
          </li>
          <li>
            <strong>Read the heart’s report</strong>: both methods, the apex-to-base strip, quality, context against the study
            hearts, and the Methods paragraph for your paper. Open any slice to see its layers.
          </li>
          <li>
            <strong>Export</strong>: print or save as PDF, a CSV per slice or per heart, or everything as a ZIP with checksums.
          </li>
        </ol>
        <p className="muted">
          New to hearts or to TTC? <a href={href({ name: 'learn' })}>Learn</a> goes from no biology at all to how Cardia measures.
        </p>
      </section>

      <section id="flags" className="card stack" aria-labelledby="flags-title">
        <h2 id="flags-title">Why was my slice flagged?</h2>
        <p className="muted">A flag lowers the slice’s confidence. It never changes the numbers; it tells you how far to trust them.</p>
        <dl className="help-flags">
          {FLAGS.map((f) => (
            <div key={f.flag}>
              <dt>{f.title}</dt>
              <dd>
                <p>{f.means}</p>
                <p>
                  <strong>What to do:</strong> {f.todo}
                </p>
              </dd>
            </div>
          ))}
        </dl>
        <p className="fine">
          Confidence is high with no reasons, medium with one and low with two or more (a proposal until the team agrees the rule).
        </p>
      </section>

      <section id="faq" className="card stack" aria-labelledby="faq-title">
        <h2 id="faq-title">Questions</h2>
        {FAQ.map((f) => (
          <div key={f.q} className="stack tight">
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}
      </section>

      <section id="shortcuts" className="card stack" aria-labelledby="shortcuts-title">
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <p className="muted">Single keys, anywhere except while typing in a field.</p>
        <table className="table compact">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys}>
                <th scope="row">
                  <kbd>{s.keys}</kbd>
                </th>
                <td>{s.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section id="new" className="card stack" aria-labelledby="new-title">
        <h2 id="new-title">What’s new</h2>
        {NEW.map((n) => (
          <div key={n.version} className="stack tight">
            <h3>{n.version}</h3>
            <ul className="help-list">
              {n.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
        {api && (
          <p className="fine">
            The engine here runs API {api} and analysis pipeline {pipeline}.
          </p>
        )}
      </section>

      <section id="cite" className="card stack" aria-labelledby="cite-title">
        <h2 id="cite-title">How to cite Cardia</h2>
        <p>
          Give the pipeline version and model files you used: every heart’s report has a Methods paragraph with both, ready to
          paste. Until the team publishes a paper, cite the software as:
        </p>
        <p className="methods-text">
          Kunal P, Gupta M, Verma K. Cardia: automated infarct measurement in TTC-stained heart slices, analysis pipeline{' '}
          {pipeline ?? '(version)'}. Software, {year}.
        </p>
      </section>

      <section id="credits" className="card stack" aria-labelledby="credits-title">
        <h2 id="credits-title">Credits and licences</h2>
        <p>
          Made by Prince Kunal, Melove Gupta and Krrish Verma, with the GVSU lab whose TTC-stained guinea pig slices it was built
          and checked on.
        </p>
        <p className="muted">
          The heart in Learn, in 3D and 2D, was drawn in code by the team: no third-party model. The lessons cite their sources
          and are drafts until a cardiology or physiology teacher has reviewed them.
        </p>
        <h3>Open-source software</h3>
        <ul className="help-list">
          <li>App: React (MIT), three.js (MIT), React Three Fiber (MIT), Lenis (MIT), fflate (MIT), Vite (MIT).</li>
          <li>
            Engine: FastAPI (MIT), Uvicorn (BSD-3-Clause), NumPy, SciPy, pandas, scikit-learn, scikit-image and joblib
            (BSD-3-Clause), OpenCV (Apache-2.0), Pillow (MIT-CMU), python-multipart (Apache-2.0).
          </li>
        </ul>
      </section>
    </div>
  );
}
