# Learn content

Lessons, glossary and quizzes for Cardia's Learn section (PLAN.md §3, §4). These are plain Markdown and JSON files, so biology reviewers can edit them without touching code. The web app bundles them at build time, so Learn works offline. Owner: Melove; everyone writes.

## Layout

```
content/
  en/                           English is the source language
    01-heart-from-zero.md       one file per module, numbered as in PLAN.md §3a
    03-where-the-blood-goes.md
    05-what-a-heart-attack-is.md
    08-how-ttc-staining-works.md
    10-how-our-app-does-it.md
    glossary.json               term id -> { title, short, lesson }
  hi/                           one folder per language, same file names (languages milestone)
```

v1 modules: **1** (the heart, from zero), **3** (where the blood goes), **5** (what a heart attack is), **8** (how TTC staining works) and **10** (how our app does it). All five are **drafts** (`reviewed_by: ""`): the app shows them with a "not yet expert-reviewed" badge until a GVSU faculty member signs them off. A module without a file shows as "coming later" on the course map.

A translated lesson replaces the English one for that language; untranslated lessons and glossary terms fall back to English.

## Checking your changes

```bash
cd web && pnpm test        # includes content.test.ts, which checks every lesson
cd web && pnpm dev         # then open http://localhost:5173/#/learn/<module>
```

`content.test.ts` fails, and so does CI, if a lesson has a parse warning, links to a glossary term that doesn't exist, points at a part the heart doesn't have (or that the step's view doesn't show), uses an unknown animation, has no sources, or reuses a quiz id. Learn needs no engine: the connect screen has an "Open the Learn course" link.

## Lesson file

```markdown
---
module: 5
title: What a heart attack is
summary: A blocked artery, no oxygen, dying muscle. Time is muscle.
minutes: 12
tracks: [no-biology, student]
sources:
  - "Reference cited for this lesson"
reviewed_by: ""            # filled in at expert sign-off; unreviewed lessons show as drafts
---

::scene{camera="anterior" highlight="lad,lad-territory" anim="occlusion" speed=0.5}

## A blocked artery

The **[left anterior descending artery](part:lad)** feeds the front wall
of the left ventricle. When it is blocked, the muscle gets no oxygen: [ischemia](term:ischemia).

::quiz{type="click-part" target="lad" camera="anterior" prompt="Click the artery that was blocked."}
```

Front matter: `module`, `title`, `summary` (one line on the course map), `minutes`, `tracks` (`no-biology`, `student`, `researcher`), `sources` (a list), `reviewed_by`.

**Markdown** is a small subset: `##` and `###` headings (the title comes from the front matter, so no `#`), paragraphs, `-` and `1.` lists (a list may start at any number), `> notes`, `**bold**`, `*italic*`, `` `code` `` and links. Write a literal asterisk as `\*`, as in `a\*`.

**Links:**

* `[text](term:<id>)` opens the glossary card for a term in `glossary.json`.
* `[text](part:<id>)` points at that part of the heart beside the lesson (it glows while the pointer is on the link).
* Ordinary `https://` links open in a new tab.

### Steps and the heart: `::scene{…}`

Each `::scene{…}` line starts a new **step** of the lesson and sets the heart for it. Text before the first scene is a step with the default view. A step's first `##` heading is its name in the step list.

| Attribute | Values |
|---|---|
| `camera` | `section` (cut open from the front; default), `anterior` (outside, with the coronary arteries), `short-axis` (one healthy slice across the ventricles), `ttc` (a TTC-stained slice with an infarct) |
| `highlight` | Part ids, comma-separated: they glow and are labelled |
| `labels` | `auto` (the highlighted parts; default), `all`, `none`, or a list of part ids |
| `hide` | Part ids to leave out |
| `anim` | `heartbeat`, `flow` (blood through the chambers), `coronary-flow`, `occlusion` (LAD blocked, territory turns pale), `reperfusion`, `slicing` (apex to base), `ttc` (a slice taking up the stain), `wavefront` (the dead zone growing outward) |
| `speed` | `0.5` is half speed; default 1 |
| `xray` | On the outside view, shows the chambers through the wall |

**Part ids** (the 3D model's mesh names will match, PLAN.md §3f):

| View | Parts |
|---|---|
| `section` | `ra`, `la`, `rv`, `lv`, `septum`, `tricuspid`, `mitral`, `pulmonary-valve`, `aortic-valve`, `aorta`, `pulmonary-trunk`, `svc`, `ivc`, `pulmonary-veins`, `apex`, `myocardium` |
| `anterior` | `ra`, `la`, `rv`, `lv`, `aorta`, `pulmonary-trunk`, `svc`, `lad`, `lcx`, `rca`, `lad-territory`, `lcx-territory`, `rca-territory`, `lv-anterior-wall`, `apex`, `base`, `epicardium` |
| `short-axis`, `ttc` | `lv`, `rv`, `septum`, `lv-cavity`, `rv-cavity`, `endocardium`, `epicardium`, `myocardium`, `infarct`, `lv-anterior-wall` |

The heart is a 2D diagram for now, schematic and not to scale; it is also the 2D fallback the 3D heart (milestone 6) keeps. Scenes written for it will drive the 3D heart unchanged.

### Quizzes

A one-line quiz is `::quiz{…}`; a quiz with a body is `:::quiz{…}`, the body, then a line with only `:::`. Give every quiz an `id` (unique across the course): progress and review are kept by id. In a body, a line starting with `>` is the explanation shown after the answer; other lines are the question.

| `type` | How to write it |
|---|---|
| `multiple-choice` | Options as `- [x] right` / `- [ ] wrong`. Mark several `[x]` for "choose every right answer" |
| `true-false` | `answer="true"` or `answer="false"`; the statement is the body |
| `match` | Pairs as `- left = right` |
| `fill-blank` | The sentence, with each blank as `[[answer]]` or `[[answer|also accepted]]`. Case, accents and end punctuation don't matter |
| `order-steps` | The steps as `1.`, `2.`, … **in the right order**; the app shuffles them |
| `click-part` | `target="lad"` (several ids accepted, comma-separated), optional `camera`; the question in `prompt="…"` or the body |
| `label-diagram` | `parts="ra,la,rv,lv"` get numbered markers to name; optional `camera` |

```markdown
:::quiz{type="multiple-choice" id="m5-where"}
Where in the wall does muscle start to die when an artery is blocked?
- [x] The inner part, next to the chamber
- [ ] The outer surface
> Death starts in the inner wall and spreads outward over hours.
:::
```

A wrong answer comes back in the learner's **Review**, then again after 1, 3 and 7 days while it keeps being answered right. `spot-dead-tissue` (PLAN.md §3e) waits for expert tracings: its answers must never come from the app's own output.

## Glossary

`glossary.json` maps a term id (lowercase, hyphens) to `title`, `short` (one or two plain sentences) and `lesson` (the module that explains it). Every `term:` link must have an entry. The same file serves the glossary page and the cards in lessons; reports will link to it too.

## Rules

* Every module is reviewed by a GVSU faculty member (or a cardiology/physiology teacher) before release, and its sources are cited. Put the reviewer's name in `reviewed_by` at sign-off.
* "Spot the dead tissue" answers come only from expert tracings or clear-cut examples, never from the app's own output (PLAN.md §2h).
* Translations: the scientific term goes first in the target language, with the English term in brackets on first use. A native speaker checks medical text; machine translation alone is not enough.
* No GVSU slice images go into this folder until the team agrees what may be published (PLAN.md §13).
