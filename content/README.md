# Learn content

Lessons, glossary and quiz banks for Cardia's Learn section (PLAN.md §3, §4). These are plain Markdown and JSON files, so biology reviewers can edit them without touching code. Owner: Melove; everyone writes.

## Layout

```
content/
  en/                      English is the source language
    01-heart-from-zero.md  one file per module, numbered as in PLAN.md §3a
    03-where-the-blood-goes.md
    ...
    glossary.json          term id -> { title, short, lesson }
  hi/                      one folder per language, same file names
```

v1 modules: **1** (the heart, from zero), **3** (where the blood goes), **5** (what a heart attack is), **8** (how TTC staining works) and **10** (how our app does it).

## Lesson file

Each lesson starts with front matter, then Markdown with a few directives:

```markdown
---
module: 5
title: What a heart attack is
tracks: [no-biology, student]
sources:
  - "Reference cited for this lesson"
reviewed_by: ""            # filled in at expert sign-off; unreviewed lessons are not released
---

::scene{camera="anterior" highlight="lad,lv-anterior-wall" anim="occlusion" speed=0.5}

The **[left anterior descending artery](term:lad)** feeds the front wall
of the **[left ventricle](part:lv)**. When it is blocked…

::quiz{type="click-part" target="lad" prompt="Tap the artery that was blocked."}
```

* `::scene{…}` sets the 3D view for the paragraphs that follow it: camera, highlighted or hidden parts, transparency, labels, animation and speed.
* `[text](part:<id>)` pulses that part of the 3D heart. `[text](term:<id>)` opens its glossary card.
* `::quiz{type=…}` types: `multiple-choice`, `true-false`, `match`, `fill-blank`, `order-steps`, `label-diagram`, `click-part`, `spot-dead-tissue`.
* Part ids are the mesh names of the 3D model (milestone 6). Use the names in PLAN.md §3f until the model exists.

## Rules

* Every module is reviewed by a GVSU faculty member (or a cardiology/physiology teacher) before release, and its sources are cited.
* "Spot the dead tissue" answers come only from expert tracings or clear-cut examples, never from the app's own output (PLAN.md §2h).
* Translations: the scientific term goes first in the target language, with the English term in brackets on first use. A native speaker checks medical text; machine translation alone is not enough.
* No GVSU slice images go into this folder until the team agrees what may be published (PLAN.md §13).
