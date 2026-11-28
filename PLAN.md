# PLAN: Cardia, a TTC infarct analyzer with cloud sync and a Learn section

*Last updated 2026-11-28: the app is named **Cardia** (repo `github.com/cardia-gvsu/cardia`). It is built **as a web app first**, has a public demo at <https://139-84-209-207.sslip.io> (D14), and becomes a desktop app once a Windows machine is available. This plan replaced the 2026-11-18 offline mobile plan. Who does what: [CONTRIBUTING.md](CONTRIBUTING.md).*

**Goal:** a polished app with two halves. It runs first as a web app on the user's computer (a browser UI plus a local Python engine) and later ships as a desktop app for Windows and macOS. The same app also runs online as a public demo (D14).

1. **Analyze.** The user drops in scanned TTC heart slices. The app automatically produces:
   * the infarct % and dead mass of each slice, and of the whole heart when several slices are imported;
   * what is in each slice;
   * what the result means for the heart.

   Three methods run on every slice (§2, D13): **Method A "K-Means + RF"** (the notebook; the default headline) and **Method B "DBSCAN + RF"** (§2j, the DBSCAN notebook), shown side by side, and **Method C "stain ratio"** (§2i, a colour rule with no machine learning), shown apart. Analysis runs on the user's computer (on the public demo, on its server). Reports are stored locally and, if the user signs in, synced to the cloud so the same library is available on every computer and can be shared with the lab.
2. **Learn.** A course for someone with no biology background, built around an animated, interactive 3D heart. It covers what the heart is, what an infarct is, why we measure it, how TTC staining works, the traditional methods, and what our method does. It includes quizzes along the way. English only (languages dropped 2026-11-23, D10).

---

## 0. Decisions so far

| # | Decision | Why |
|---|---|---|
| D1 | **The main input is scanned TIFF files.** PNG and JPG are accepted, as in the notebook, but carry an "unvalidated input" badge. The phone camera and the printable capture mat are **dropped**. | The app now runs on a computer only (no phone), and every setting in the pipeline was chosen on scans. |
| D2 | **No human in the loop** for analysis. The app never asks anyone to confirm, edit, trace or sign off on a result. | Automation is the whole point. Where the app is unsure, it **flags the slice and widens the reported range** instead of asking. |
| D3 | **Offline-first app with optional cloud sync.** Analysis, the library and export work with no network, both as the local web app and later as the desktop app. Sync adds backup, multiple computers, lab sharing and Learn progress. | Lab computers may be offline, and unpublished data stays local unless the user turns sync on. |
| D4 | *Superseded by D12 and D13: the a\* cut is retired, and the methods are now A "K-Means + RF", B "DBSCAN + RF" and C "stain ratio".* **Two methods side by side until the team chooses** (§2). Both share the notebook's lighting correction, tissue mask and **our hole scorer (one shared hole-model file)**. Only the dead/alive step differs: **Method A "K-Means + RF"** (`GVSU_Infarct_Pipeline_main.ipynb`) and **Method B "a\* cut"** (`ttc/pipeline.py`). The friend's colour mask, SAM 2.1 and DINOv3 are not shipped. | They were scored against different references and disagree most on low-infarct hearts. Running both on every slice gives the comparison needed to choose, ideally against expert tracings (Ref-2). In the notebook's tests, DINOv3 or SAM changed Dice by at most about 0.005 and need a GPU. |
| D5 | **Frozen models.** The random forests of Methods A and B, the hole model and Method C's cut file are fixed once, outside the app, and shipped as versioned files (`models/`, with a manifest of SHA-256 hashes). The app never retrains on user data. | The same input must always give the same number, and every report must name the exact model used. |
| D6 | **No Claude in the final tool.** Human labels may be used for one-time training only (hole marks, future expert tracings). | Rule set by the project. |
| D7 | **Design for the whole slice now, and leave room for LV-only % and area at risk.** | The lab protocol (LV vs whole slice, Evans blue) is not known yet. |
| D8 | **Web first, desktop later.** UI: React + TypeScript (Vite, pnpm) in the browser. Engine: the notebook's and `ttc/` code as a Python package behind a **local FastAPI server on 127.0.0.1**, so scans never leave the computer (the public demo runs the same server behind HTTPS, D14). Desktop phase: Electron wraps the same UI and launches the same engine (frozen with PyInstaller). No C++ port. | No Windows machine yet, and a web app needs no installers, signing or Windows setup. The engine *is* the reference code. Because the UI talks to the engine over HTTP from day one, the desktop step only changes packaging. Electron then gives the same Chromium/WebGL on every OS for the 3D heart (Tauri is the alternative; see §13). |
| D9 | **A Learn section with an interactive 3D heart**, aimed at students and people with no biology knowledge. | Explains the science and the method to new lab members, students and reviewers. |
| D10 | **English only (decided 2026-11-23).** The multilingual UI and Learn content are dropped from the plan; §4 is kept only for reference. | Effort goes to the analysis, the reports, Learn and the 3D heart instead. |
| D11 | *Superseded by D12.* Method C "stain hue" was the default headline method (2026-11-24, pipeline 0.4.0), with A and B beside it. | A over-called the control hearts, B (a\* cut) missed unstained tissue on the infarct hearts. |
| D12 | *Partly superseded by D13 (the stain ratio is now Method C and A is the default).* **Two methods: A and the new Method B "stain ratio", the default (2026-11-24, pipeline 0.5.0).** The a\* cut (old Method B, D4, D5) and Method C are retired; their code, cut files and parity tests are removed (git history keeps them). Results stored by pipeline 0.3.0 or 0.4.0 still open, with Method A only. | On review, C still missed infarct: pale-pink and mottled tissue around the cream core, which keeps part of the stain. B counts tissue holding less than half the red stain of living muscle (§2i): it reads the infarct hearts between C and A, follows the cream and mottled regions by eye, and does not move under shadows. Its cost: 0.5–11% on the control hearts (YHS: 1–6%), from pale non-muscle tissue and pale patches. No reference or label sets any of its numbers. |
| D13 | **Three methods (2026-11-25, pipeline 0.6.0, API 0.8.0).** Method A "K-Means + RF" (default headline) and Method B "DBSCAN + RF", from `GVSU_Infarct_Pipeline_dbscan_search.ipynb` ("Tuned DBSCAN + RF", §2j), are compared side by side; the stain ratio becomes Method C and is shown apart as a colour rule with no machine learning. Results stored by pipeline 0.5.x show their stain ratio as Method C and no Method B; a headline saved before API 0.8.0 falls back to A. | Asked for by the team: compare the two clustering teachers (K-Means vs DBSCAN) on the same forest recipe, and keep the non-ML colour rule visible but distinct. The DBSCAN variant chosen was the notebook's best (held-out Dice 0.864 there, 0.862 here). |
| D14 | **A public demo online (2026-11-26, PR #23).** The same web app and engine run on a Vultr server at <https://139-84-209-207.sslip.io>, behind Caddy (HTTPS on a free sslip.io name), and redeploy on every push to `main` (`deploy/`, `.github/workflows/deploy.yml`). The engine runs with `--public`: it still listens on 127.0.0.1 only, the UI is served from the same address, there is no per-launch token, every visitor shares one library (anyone can see, add and delete hearts), and the watch folder, backup and restore are off. The local app is unchanged. | GVSU shared its lab data with us to use as we like, including deploying it (confirmed 2026-11-28; the data is private but not secret), so a hosted version needs no data agreement. A link lets the lab, reviewers and students try Cardia without installing anything. Accounts (Phase B item 1) would give each visitor their own library. |
| D15 | **Real 3D heart models (2026-11-26, PR #22).** Learn and the landing page show two Sketchfab models under CC BY 4.0: "Realistic Human Heart" by neshallads (the outside) and "Human Heart Internal Structure 3D Model" by Haiqa Arif (the inside: chambers, valves, septum). They are compressed for the web and kept in `web/public/models/`, with credits in `CREDITS.md`, beside the 3D view and on the Help page. The heart modelled in code stays underneath, unseen, with the §3f part ids, so labels, hover and click-the-part quizzes work as before; a highlighted part glows over the real model in its shape. | Settles §13 item 8. CC BY 4.0 asks only for credit (no ShareAlike, unlike Z-Anatomy), and the models look like a real heart, which the coded one did not. |

### What changed from the 2026-11-18 plan

| Area | Before | Now |
|---|---|---|
| Platform | iOS + Android (React Native / Expo) | Local web app first (browser + local engine), then Windows + macOS desktop (Electron); Linux optional |
| Engine | C++17 port of the Python, golden parity gate | The Python pipeline itself, served by a local API (desktop: packaged as a sidecar) |
| Boundary | Friend's colour mask (+ optional SAM 2.1) | Notebook tissue mask: chroma cut set from the paper, speck removal, ruler-bridge cut, hole filling |
| Dead / alive | a\* cuts 11.75 (conservative) / 18.66 (liberal) | **Three methods** (D13): Method A "K-Means + RF" and Method B "DBSCAN + RF", two random forests on 22 pixel features (dead = p ≥ 0.5), side by side; Method C "stain ratio", a colour rule, apart. Until the team chooses |
| Holes | Logistic scorer, 3 measures (not yet saved as a file) | Our logistic scorer, saved as one shared hole-model file; Phase 0 picks the better of the repo and notebook versions |
| Camera | Capture mat, auto-shutter | Dropped |
| Storage | Fully offline | Offline-first + optional cloud sync with accounts and lab workspaces; a public demo online (D14) |
| New | — | Learn section with a 3D heart, quizzes, About/Help with a walkthrough; a landing page |

---

## 1. What the app has

★ = v1. *Later* = after v1. ◆ = needs new image analysis, tested in Python first (as the hole finder was) before it may appear in a report. ◇ = proposed, not yet agreed by the team.

### 1a. Getting images in
- ★ Drag and drop files, a folder or a ZIP onto the window, or use a file picker (File → Open in the desktop app).
- ★ **Watch folder:** the app imports new scans automatically as the scanner saves them into a chosen folder. The local engine does the watching, so this works in the web app too.
- ★ Details read automatically: heart ID and slice weight from names like `206IS89mg.tif` (regex `(\d{3})IS([\d.]+)mg`), DPI (scale for mm²) from the TIFF tags. The user types something only when it is missing.
- ★ Automatic input checks, reported and never asked about: unsupported or unreadable file, no slice found (tissue < 1% of the image), missing DPI, duplicate slice (same SHA-256), a slice that does not fit its heart (area vs weight), tissue cut off at the image edge, non-TIFF input.
- *Later* Scan directly from a flatbed scanner (TWAIN/WIA on Windows, ImageCaptureCore on macOS).
- *Later* ◆ Several slices in one scan, split automatically and ordered apex → base.

### 1b. Experiment details (optional)
- ★ Heart ID, group (control / treatment / …), ischemia and reperfusion times, date, operator, slice weights, heart weight.
- *Later* Templates for repeated protocols.

### 1c. Slice report: what is in the slice
- ★ Composition, in % of tissue and mm², **for each method**: alive, dead, unsure / borderline; plus the shared holes removed, holes filled in as tissue and gaps left out.
- ★ Image viewer: turn layers on and off (tissue outline, holes removed, uncertain holes, holes filled in; Methods A and B: dead map, unsure tissue, **probability heat map**; Method C: dead map, borderline, missing stain), zoom and pan, before/after slider (original vs lighting-corrected), and an **A vs B slider** that shows where the two methods disagree.
- ★ A one-line plain-language summary, e.g. *"24% of tissue is dead (range 21–27%). 1 hole removed. Image quality: good."*
- ★ Confidence badge (high / medium / low) with the reasons: unsure pixels > 15% (Method A), uncertain holes, non-TIFF input, missing weight. No "methods disagree" reason (§2g).
- ◆ Shadow / uneven-light warning on the tissue (Method A is sensitive to shadows; §2h). Phase 0 candidate.
- *Later* ◆ Depth of the infarct in the wall (inner wall only vs full thickness).
- *Later* ◆ Patchiness: number of dead patches and the largest patch.
- *Later* ◆ Stain-quality check: warns when a slice looks under-stained.
- *Later* ◆ Position around the ring and LV-only % (needs automatic RV detection).

### 1d. Heart report: what it says about the heart
- ★ Headline infarct % (slice-weight weighted) from the headline method chosen in Settings, its range (§2g), dead mass in mg, and confidence.
- ★ **Method comparison panel:** Methods A and B side by side for the heart and for every slice, and Method C apart (D13); only Method C's range is shown, and there is no "methods disagree" flag (§2g).
- ★ Apex → base strip: slice thumbnails with a bar each, showing where the damage is concentrated.
- ★ Context, never a diagnosis: comparison with the study set **measured by the same method and pipeline version**. Later also against the lab's own groups. The report states that this is a research tool for guinea pig hearts.
- ★ Quality summary: area vs weight agreement, missing weights, flagged slices, slices skipped and why.
- ★ An auto-written Methods paragraph for each method, the headline method first: pipeline and model versions, model hashes, training or calibration set (8 hearts, 30 slices), how holes and unsure tissue were treated. English by default.
- *Later* 3D stack view: slice outlines stacked into a rotatable heart with dead tissue coloured. It reuses the Learn 3D engine (§3).

### 1e. Library, export and sync
- ★ Every analysis is saved locally: search, filter by heart, group, date or tag, plus favourites, delete and a 30-day trash.
- ★ Export as a download (a save dialog in the desktop app): **PDF report**, **CSV** (per slice and per heart), and a **ZIP bundle** (original images, overlay PNGs, JSON results, settings).
- ★ Every report records the app version, pipeline version, the SHA-256 of each model file, the settings, and the SHA-256 of each input image.
- ★ Backup and restore of the whole library as one file (works without an account).
- ★ **Cloud sync** (§5): sign in, and the library, results and Learn progress follow you to every computer. Lab workspaces are shared with the team.
- *Later* Re-analyse old hearts with a newer pipeline version and show what changed.

### 1f. Study features (*later*)
- A study dashboard: compare groups (mean ± SD, box plot, n), and export to Prism / Excel.
- Text notes attached to a heart.
- ◇ Blinded mode: group labels are hidden until someone unblinds the study in the dashboard.
- ◇ Sample-size helper using the spread of the lab's own past results (shown with a "rough estimate" caveat).

### 1g. Learn (new, details in §3)
- ★ A course from zero biology to "how this app measures an infarct": short lessons, each paired with the 3D heart.
- ★ **Interactive, animated 3D heart**: the part being discussed is highlighted as you read. Animations show the heartbeat, blood flow, the coronary blood supply, a blocked artery and the dying muscle, and how TTC reaches and stains the tissue.
- ★ Quizzes along the way: multiple choice, true/false, match the following, fill in the blank, put the steps in order, label the diagram, and click the part on the 3D heart.
- ★ Tracks: *No biology*, *Student*, *Researcher*. Progress, streaks and badges, synced when signed in.
- ★ **Learn as a game** (2026-11-26): the course is a path of units, with XP, a daily goal, streaks, hearts and a combo inside a lesson, synthesized sounds, and Tetra, the TTC-drop mascot.
- ★ Glossary: every term in Learn and in the reports (TTC, infarct, a\*, unsure tissue…) opens a short card that links to its lesson.

### 1h. About and Help
- ★ About: what the app does, who made it (team + GVSU credits), how to cite it, a research-use-only disclaimer, and open-source and 3D-model licences.
- ★ How to use it: a guided **walkthrough** on the bundled demo heart (import → processing → heart report → layers → export). It opens by itself the first time a browser opens the lab (2026-11-28; once per browser, remembered in localStorage), and is replayable from Help.
- ★ "Why was my slice flagged?": each QC flag links to a plain explanation and how to fix it (rescan, add the weight, even lighting, blue/green background).
- ★ FAQ, keyboard shortcuts, and "What's new" (lists pipeline version changes).
- ★ "About the method" page: version, settings, what was validated, known limits (§2h).

### 1i. Languages: dropped (2026-11-23, D10)
- The app, Learn and reports are English only. No language picker.

### 1j. Polish and trust
- ★ A landing page (2026-11-26): one heart's story told by scrolling in 3D, from a blocked artery to slicing, TTC staining and the microscope, ending on a real study slice with its Method A dead map.
- ★ Onboarding with a demo heart from the study set (bundled, so it works offline).
- ★ Dark mode, colour-blind-safe overlay colours, keyboard navigation, screen-reader labels, reduced-motion setting.
- ★ One design system, "The Living Stain" (2026-11-26): colours sampled from the study's scans, a darkroom dark theme, bundled fonts.
- ★ **Two looks, chosen in Settings > Look > Style (2026-11-28).** "Living Stain" stays the default for now (one line, `DEFAULT_LOOK` in `web/src/lib/look.ts`). "Lab notebook" is calm for everyday work: quiet paper with a faint dot grid, white pages and hairlines, Source Serif 4 headings, IBM Plex Sans for the interface and its numbers, graphite controls, and colour kept for what it means (the three methods, the stain, warnings). The landing page follows the look: in the lab notebook its 3D story plays on paper (or in a dark room in dark mode), with the bath drawn as a tint and the microscope's eyepiece set on the page. The look is kept per browser (localStorage), so it needs no engine and each visitor of the public demo keeps their own. Code: `web/src/looks/notebook.css`, the end of `web/src/landing/landing.css`, `paintStage` in `web/src/landing/world.ts`.
- ★ **Easter eggs, for people who use Cardia every day** (2026-11-28; not in Help on purpose; `web/src/lib/eggs.ts`, `web/src/looks/eggs.css`). None changes a number or takes the keyboard, and reduced motion keeps them still.
  - In the lab notebook look the logo is an unstained slice; rest the pointer on it and it stains like TTC, pixel by pixel from the cavity outwards, leaving the infarct pale.
  - Type "pig" anywhere outside a field: a guinea pig, the study's species, trots along the header's trace.
  - On World Heart Day (29 September) the logo is stained and beats once, and the trace runs in stain red.
  - In the lab notebook look every page ends on a notebook's witness line ("Recorded <date> · Witnessed ____").
- *Desktop phase* Signed installers and automatic updates.

### 1k. Proposed extras (◇, for the team to accept or reject)
- ◇ Probability sandbox (Learn only): drag the dead/alive cut-off on the demo slice and watch the infarct % change. It shows why a range is reported and has no effect on real reports.
- ◇ Lab protocol timer for TTC incubation and fixation, with notifications.
- ◇ In-app scanning guide: resolution, flat lid, even light, blue/green background or backlight.
- ◇ Export overlays as ImageJ ROIs so labs can check outlines in their usual tool.
- ◇ "Report a problem" bundle: logs plus the flagged slice packed into a ZIP to email.

---

## 2. Analysis pipelines (per slice, fully automatic)

The app runs **three methods on every slice** (D13) and shows all three. They share every step except the dead/alive decision:

```
read → lighting correction → tissue mask → holes (one shared hole-model file) ─┬─ Method A "K-Means + RF": 22 pixel features → random forest (§2e)
                                                                              ├─ Method B "DBSCAN + RF": the same features → a second forest (§2j)
                                                                              └─ Method C "stain ratio": less than half the living stain (§2i)
```

(Until 2026-11-24 Method B was the "a\* cut" of the research repo, on its own GrabCut front end; §2a–§2h describe Phase 0 with it. D12 retired it. From 2026-11-24 to 2026-11-25 Method B was the stain ratio, which is Method C since D13.)

Sources: `GVSU_Infarct_Pipeline_main.ipynb` (Parts D, E, G, L, O) for the shared steps and Method A; `GVSU_Infarct_Pipeline_dbscan_search.ipynb` for Method B; Method C was designed here (§2i). Phase 0 (§8) moved the shared steps and the first methods into the package `ttc_pipeline/` **without changing behaviour**. Function names below are the original ones.

Fixed settings (`CFG`): `seed=42`, `paper_target_linear=0.88`, `hole_small_frac=0.002`, `hole_dark_dL=10`, `holes={v_max:145, g_r:0.5, b_g:0.95, dark_L:32, min_px:200, edge_margin_px:6, lr_C:0.3, score_cut:0.8, uncertain_from:0.5}` (§2d; the notebook used v_frac 145/245 and min_px 150), `dead_threshold=0.5` (Methods A and B). Method C's cuts are in its model file (§2i).

### 2a. Read
- RGB image (`PIL ... .convert("RGB")`); heart ID and weight from the file name; DPI from TIFF tags (for mm² only, not used by any method).

### 2b. Lighting correction (`find_paper`, `flat_field`), shared
| Step | Notes |
|---|---|
| Rough tissue | Paper colour = median a\*b\* of the low-chroma half of a 12-px border band. Tissue = Lab a\*b\* distance from it, 5×5 blur, > 8, opening r=2, largest components (≥ 15% of the biggest). |
| Paper mask | Everything outside a 20-px dilation of the rough tissue, minus the darkest 35% by L\* (grid lines, shadows). |
| Flat field | In linear light, for each channel fit a 2nd-order surface (1, x, y, x², y², xy) to ≤ 50,000 paper pixels (fixed seed 0), divide by it, set paper to 0.88. |
| Effect on the 30 study photos | Paper L\* 76.4–100 → 95.0–95.4. Paper colour cast (chroma) 6.4 → 1.7. |

### 2c. Tissue mask (`tissue_mask`), shared
| Step | Notes |
|---|---|
| Chroma | √(a\*² + b\*²), 5×5 Gaussian blur. |
| Threshold | max(99th percentile of paper chroma + 2, 5.5), measured per photo. |
| Remove specks | Opening r=2, keep the largest components. |
| Cut ruler bridges | Body = opening r=5; keep the mask within 6 px of the body; closing r=2. |
| Fill holes | An enclosed hole is filled as tissue if it is < 0.2% of the slice or no more than 10 L\* darker than the paper (pale dead tissue, glare). Large dark holes stay out. |

### 2d. Holes: our hole scorer, shared, saved as a file
- **What it is:** our own hole finder, as a candidate net plus a logistic-regression scorer. It started in `ttc/hole_regions.py` (2026-11-18) and was reworked in the notebook (flatness added, minimum size 150 px instead of 200, measurements scaled to the paper). Phase 0 chose the **repo version** for the shared hole file (below). It is **not** the friend's or GVSU's hole finder. It is also **not** the web app's chamber-opening / lumen / edge-bay rules, which the old measurement pipeline used.
- **Candidates** inside the filled outline and more than 6 px from its edge: *darker paper* (brightest channel V < 145 on the lighting-corrected photo, G/R > 0.5, B/G < 0.95) or L\* < 32; opening r=2, closing r=3, fill, ≥ 200 px.
- **Measures:** `edge_vs_inside` (sharp wall, flat floor), `contrast` (darker than the tissue around it), `thickness`.
- **Decision:**
  - score ≥ 0.8 → hole (removed from tissue);
  - 0.5 ≤ score < 0.8 → **uncertain** (feeds the range, §2g) ◇;
  - below 0.5 → tissue.
- **Phase 0 result (2026-11-20).** Both versions were run on the shared front end and scored against the same 10 hand-marked holes with the same rule (a candidate is a hole if it overlaps a hand-marked one by ≥ 30% of the smaller), each heart scored by a model trained on the other 7 (`engine/training/compare_hole_versions.py`):

  | Version | Holes found | False holes | Slices wrong (of 30) | Most tissue lost wrongly on one slice |
  |---|---|---|---|---|
  | Notebook (4 measures, 150 px) | 5 of 10 | 4 | 6 | 1.43% |
  | Notebook (3 measures, 150 px) | 5 of 10 | 5 | 6 | 4.33% |
  | **Repo (3 measures, 200 px, 6-px edge margin): shipped** | **5 of 10** | **2** | **4** | **1.47%** |

  Neither passes the §8 rule (≤ 3 false holes and no slice losing > 1% wrongly). The team chose the repo version: same holes found, half the false holes. Its one breach is a known limit: on 109IS151 a crease is removed as a hole (1.47% of the slice) while the real hole there is missed. More hole labels (§8, in parallel) are the fix. Choosing it changes Method A's tissue masks on the hole slices compared with the notebook, so the golden set uses this hole file. The notebook's version stays in `engine/training/notebook_holes.py`, where its held-out decisions reproduce the notebook's saved masks on all 30 slices.
- **The hole file** (model version 1.0.0):
  - `engine/models/holes/hole_model.joblib` (in git): the fitted scaler + logistic regression.
  - `engine/models/holes/hole_model.json` (in git): feature names in order; cut-off 0.8 and the uncertain band from 0.5; candidate settings (`CFG["holes"]`); SHA-256 of the training labels; the held-out results above; scikit-learn version, model version, and SHA-256 of the `.joblib`.
  - `engine/models/manifest.json` (in git) lists both with their SHA-256. The engine refuses a file that is missing, unlisted or changed, or that was saved with another scikit-learn version or other candidate settings.
  - Trained by `engine/training/train_hole_model.py` from `engine/annotations/holes/hand_marked_holes.json` (the 10 outlines from notebook Step 21, in git). Training is deterministic: the same labels and data give a byte-identical `.joblib`. Later labels are added to the same file, with a new model version.
  - The app only loads the file; it never retrains.

### 2e. Method A: K-Means + RF
- **Pixel features** (`pixel_features`), 22 per tissue pixel:
  - L\*, a\*, b\*, HSV saturation and value, red and green share of RGB;
  - L\*, a\*, b\* averaged over tissue-only neighbourhoods at σ = 1, 2, 4, 8 (`masked_blur`, so paper never bleeds into the edge);
  - lightness texture (σ 3), edge strength (Sobel on L\* blurred σ 1.5), distance from the slice edge ÷ √(tissue area).
  - Position in the photo is deliberately not used.
- **In the app:** the frozen random forest gives every tissue pixel a probability of dead, p. Dead = p ≥ 0.5. K-Means is **not** run in the app.
- **One-time training (outside the app, `train_final`):**
  - K-Means (k = 3) on pooled (L\*, a\*, b\* at σ 1), 3,000 pixels per slice from all 30 slices, seed 42.
  - Centres (L\*, a\*, b\*): (49.8, 32.2, 19.9) red → alive; (66.8, 21.8, 18.1) pink → no label; (83.7, 7.2, 17.5) cream → dead. Group names are chosen by paleness = L\* − 1.5·a\*.
  - A pixel is labelled only if it is clearly closer to one centre (distance ratio < 0.8).
  - 2,000 pixels per class per slice → random forest: 150 trees, min_samples_leaf 10, max_features sqrt, class_weight balanced_subsample, random_state 42.
- **Files (model 1.0.0):** `engine/models/kmeans_rf/kmeans_rf.joblib` is the forest from the notebook's `final_model_K_Means_RF.joblib` (SHA-256 0b29fbe7…), exported unchanged by `engine/training/export_method_a.py` (in git). The export is byte-reproducible: unused padding bytes in the tree nodes are zeroed and strings interned, which otherwise made two exports of the same forest differ. `kmeans_rf.json` (in git) holds the feature names, cut 0.5, the source file's hash, the K-Means centres, scikit-learn version and SHA-256. The engine loads it through the manifest check and predicts with one thread, so p is bit-identical between runs.
- **Port check (Phase 0, 2026-11-20):**
  - The notebook's file is read only through a guarded loader: known SHA-256, and only numpy / scikit-learn / scipy / joblib classes (the notebook's own `KMeansLabeller` gets a stand-in). A file that tries to run code is refused.
  - **Exact:** the engine's forest predicts exactly as the notebook's. On the notebook's front end and hole model it gives exactly what the notebook printed with its final model: 108IS132 13.56% (134,940 tissue px), 109IS104 7.72%, 207IS110 86.71% (tissue px, holes removed and unsure share also equal).
  - **Close, not exact:** retraining with the ported recipe (`engine/training/method_a.py`) moves the K-Means centres by up to 3·10⁻⁴ and the held-out per-slice % by 0.13 pp on average (at most 0.55 pp) from the notebook's. K-Means adds float32 numbers in an order that depends on the CPU and thread count, and the notebook's held-out run shared its random generator across five labellers in an order that changed between Python processes. This is why the shipped forest is the notebook's file, not a retrain; our retrains run K-Means on one thread so they repeat exactly on one machine.
  - In the app, Method A reads the shared front end, whose holes now come from the shipped hole model (§2d), so on hole slices its numbers differ from the notebook's.

### 2f. Method B (retired 2026-11-24, D12): a\* cut
- **Front end: its own** (`ttc/segment.py`: white balance, chroma + GrabCut outline, lumen excluded), with the real holes from the shared hole model removed. Phase 0 tried the shared front end and it failed the rule below.
- a = CIELAB a\* (redness) of the white-balanced photo, Gaussian-blurred σ 1.5 (`smoothed_a`).
- **Main (conservative):** dead = a < **11.75**. The cut whose slice infarct % is closest to Ref-YHS on the time-control slices; held out by heart it is **2.41 pp** from YHS.
- **Liberal:** a < **18.60**, the label-free valley of a 2-component GMM on pooled a\* from all slices. It gives the top of the range.
- The two cut-offs, how they were derived and the Phase 0 evidence were in `engine/models/a_cut/a_cut.json` (model 1.0.0; removed with the method in D12, git history keeps it).
- **Phase 0 result (2026-11-20)** (`engine/training/calibrate_method_b.py`). The same recipe (grid 4–22 step 0.25 vs YHS, held out by heart; GMM valley) on three versions of the input:

  | Input | Conservative | Liberal | Held-out cuts 109 / 119 / 129 | Time-control slices vs YHS |
  |---|---|---|---|---|
  | Research repo's own run, reproduced exactly | 11.75 | 18.66 | 11.75 / 12.0 / 9.25 | 2.38 pp |
  | Shared front end (lighting correction, shared holes) | 5.5 | 17.94 | 5.25 / 7.75 / 5.5 | **3.80 pp ✗** |
  | **Own front end, GrabCut seeded per slice, shared holes removed: shipped** | **11.75** | **18.60** | 11.5 / 12.0 / 9.25 | **2.41 pp ✓** |

  - The shared front end fails the 2.9 pp rule (the old 2.4 + 0.5): its lighting correction lowers tissue a\*, most on the under-exposed 119IS80 (18.8% vs YHS 4.2%). So Method B keeps its own front end, as decided in advance.
  - **GrabCut is now seeded for every slice.** It draws on OpenCV's process-wide random generator, so in the research repo a slice's outline depended on the slices measured before it in the same run (one slice measured twice in a row: 209,932 then 210,087 px; in reverse order 29 of 30 slices moved, by up to 0.05 pp). Seeding makes the same file give the same result every time (§7). It moved the liberal cut from 18.66 to 18.60.
  - The port is exact: run as the repo ran it, it reproduces `measure.py` (tissue areas and both %) and `evaluate_final.py` (cuts, per-slice values) on all 30 slices.
  - Removing the shared holes changes no time-control slice, so the cuts are the same with or without them.

### 2g. Numbers per slice and per heart
| | Methods A and B (random forests) | Method C (stain ratio) |
|---|---|---|
| Slice infarct % | dead px ÷ tissue px (p ≥ 0.5) | dead px ÷ tissue px (below half the living stain, leaning cream) |
| Unsure / borderline tissue | 0.35 < p < 0.65; > 15% flags the slice (A) | between the 40% and 60% rules |
| Range low end | p ≥ 0.65, uncertain holes counted as holes (computed, **not shown** for now) | the 40% rule, uncertain holes counted as holes |
| Range high end | p ≥ 0.35, uncertain holes counted as tissue (computed, **not shown** for now) | the 60% rule, uncertain holes counted as tissue |

- Dead mass = % × slice weight. Heart % = slice percentages weighted by slice weight (by tissue area if weights are missing, with a flag).
- **Headline method:** chosen in Settings (default: Method A ◇). All three are always shown: A and B side by side, C apart.
- **Ranges (decided 2026-11-23, carried through D12 and D13):** no method's range passed the Phase 0 rule (§8). The app shows **only the range of the colour rule**, which is now Method C. The ranges of Methods A and B are computed (and kept in the golden set) but not shown. Ranges are revisited once the app is built, together with the method improvements the team is working on (§13 item 13).
- **No "methods disagree" flag (decided 2026-11-23).** In Phase 0, A and the a\* cut differed on almost every heart (6–40 pp; median slice difference 25 pp), so a 10 pp flag would have fired on 7 of 8 hearts; the three current methods still span 7–29 pp per heart (held out, README table). The report shows the methods side by side instead, and Learn module 10 and the About page explain why they differ.
- QC: area vs weight, implied thickness, edge contact, unsure share, holes removed, non-TIFF input, shadow warning ◆.

### 2i. Method C: stain ratio (2026-11-24 as Method B, pipeline 0.5.0; Method C since 0.6.0, D13)

* **Question per pixel:** does it hold less than half the red stain of living muscle? Dead = yes, and its colour leans cream (`ttc_pipeline/method_c.py`).
* **Measures:** the shared paper flat field kept in linear light, unclipped (`flat_field_linear`; the 8-bit corrected image clips the red channel of under-exposed scans, 53% of 119IS80's tissue); each channel averaged over tissue-only neighbourhoods (σ 2 px) and turned into optical density OD = −log10(light / paper). Stain s = OD_G − OD_R (formazan absorbs green, hardly any red); tint θ = atan2(s, OD_B − OD_R) (unstained tissue absorbs blue). A shadow adds the same OD to every channel, so neither moves.
* **Slice edge:** the outer edge of every slice reads pale whatever its state (thinner tissue, paper showing through). Pixels within 17 px of the outline take the colour of the nearest pixel further in; 17 px is where the pale edge has recovered 90% of the way to each slice's plateau (median over 29 slices).
* **Cuts, label-free** (`training/calibrate_method_c.py`, `models/stain_ratio/stain_ratio.json`, model 1.0.0): reference colours = median OD of clearly unstained pixels (s below the unstained peak of s) and of clearly stained pixels (s above that peak + 4 sd). Tissue holding a fraction f of the living stain has OD = unstained + f × (stained − unstained) (Beer–Lambert). f = 0.5 gives the dead cut (s 0.309, θ 35.5°); f = 0.4 and 0.6 the range and the borderline band. Leave-one-heart-out: s 0.305–0.318, θ 35.1–36.1°.
* **Rejected while designing** (each on the 30 slices): a\* with a hue gate (the "stain hue" method: missed pale-pink and mottled infarct); s alone (counts whitish-pink pale tissue, about as common on control hearts as on infarct hearts); a lightness term (blurs the cream/red split, and shadows move it); valleys of s or θ (shallow; moved with the hearts or pixels used); half-unstained by area (linear-light mixing: ≈ the stain hue's numbers, but pale-pink tissue is weakly stained throughout, not specks); a classifier of control-heart vs infarct-heart colours (learned heart-to-heart colour differences: 95–99% dead on infarct hearts); counting pale pixels next to cream (under 3 points).
* **Evidence** (scorecard, held out, `reference/phase0/`): time-control hearts 6.6 / 0.5 / 10.7 / 8.8% (YHS 1.5 / 3.0 / 4.4 for 109 / 119 / 129: heart MAE 4.3 pp, slice MAE 5.6 pp); infarct hearts 66.5 / 66.6 / 59.4 / 30.1% (A 81.2 / 81.4 / 64.6 / 52.0, Ref-1 79.5 / 78.7 / 64.4 / 56.1); Dice vs Ref-1 0.746 (a\* cut 0.562); edge ring −0.5 points; shadow flips 0.1–0.6% at 75% and 55% light; rotate + flip + 8% darker 0.19 (1.91) pp. `tests/test_method_c.py` checks the rule on synthetic colours at known stain fractions, shadows, the edge fill, that the frozen file is what the recipe gives, and the YHS record.
* **Known limits:** on the control hearts, pale non-muscle tissue (valves, fat, the base) and pale patches count as dead (119: 10.7%, 129: 8.8%; YHS 3.0 and 4.4); on the infarct hearts, nothing checks the line at half the living stain, since expert tracings cannot be obtained; the range (40–60% of the stain) is 9 pp wide at the median slice and contains YHS on 1 of 11 slices.

### 2j. Method B: DBSCAN + RF (2026-11-25, pipeline 0.6.0)

* **Source:** `GVSU_Infarct_Pipeline_dbscan_search.ipynb`, "Tuned DBSCAN + RF" (Steps 36–37, `fit_model` Step 48). The notebook also has an untuned DBSCAN + RF (held-out Dice 0.742) and a grid + randomized search variant (0.786; no usable settings in 3 of 8 rounds); the team chose the tuned one (2026-11-25).
* **At run time** it is Method A's recipe: the same 22 pixel features into a frozen random forest (150 trees, min 10 per leaf), dead = p ≥ 0.5, unsure 0.35 < p < 0.65 (`ttc_pipeline/method_b.py`, `models/dbscan_rf/`, model 1.0.0). Only the training labels differ.
* **Training** (`training/method_b.py`, port of `DBSCANTuned` and `tune_dbscan`; `training/export_method_b.py`): pooled pixel colours (3,000 per slice, 15,000 fitted). Stage 1 scores every colour scale (σ 1, 2, 4) × eps (1st–35th percentile of k-neighbour distances) × min points (5–40) × groups (extremes, split, thirds) × matching (nearest dense member, group centre) by DBSCAN's own Dice against Ref-1, averaged per heart; stage 2 trains a small forest for the 4 best per matching and every example rule, and scores the cut-offs 0.15–0.5. Palest dense group (L\* − 1.5 a\*) = dead, reddest = alive. On all 8 hearts it picks the notebook's settings (σ 1, eps 2nd percentile = 1.705, 40 min points, extremes, group centre, margin 0.6, cut-off 0.5); stage-1 scores match the notebook's saved run to 2·10⁻⁵, stage-2 to 0.004. Then 2,000 labelled pixels per class per slice train the forest on all 8 hearts, on the notebook's tissue masks.
* **Evidence** (scorecard, each heart held out with settings tuned on the other 7): Dice vs Ref-1 0.862 (A 0.913, C 0.746); heart MAE vs Ref-1 5.2 pp, vs YHS 17.7 pp; time-control hearts 19.4 / 7.5 / 16.7 / 37.7%; infarct hearts 80.1 / 72.5 / 51.8 / 49.8%; edge ring 22.6 points; shadow flips 29% / 43% of dead pixels at 75% / 55% light; rotate + flip + 8% darker 0.25 (0.56) pp.
* **Known limits:** the winning settings change from fold to fold, and the shipped forest (tuned on all 8) reads 11.2 pp above its held-out versions on average, above Method A on every heart (time-control 28.0 / 14.3 / 33.8 / 41.2%); its settings are chosen to agree with Ref-1, so it is not an independent check of that reference; shadows move it as they move A. The held-out tuning for heart 207 picks 40 min points where the notebook picked 25 (a near tie in stage 2).

### 2h. Evidence and known limits

*Historical: the Method B column below is the retired a\* cut. The scorecard now scores the three current methods (README table); their limits are in §2e and below for A, §2j for B and §2i for C.*

Phase 0 scorecard (2026-11-23, `engine/training/scorecard.py`): both methods as the engine runs them, every number held out (A: each heart scored by a forest trained on the other 7; B: each time-control heart with the cut chosen on the other two). Full table in the README.

| Check | Method A (K-Means + RF) | Method B (a\* cut) |
|---|---|---|
| Time-control slices vs Ref-YHS (11 slices, hearts 109/119/129), MAE | 22.2 pp, always higher | **2.4 pp** |
| Heart infarct % vs Ref-YHS / Ref-1 / Ref-0, MAE | 19.0 / **4.0** / **7.7** pp | **2.1** / 24.5 / 20.5 pp |
| Infarct % of the 4 time-control hearts 108/109/119/129 (expected ≈ 0–5) | 21.4 / 6.7 / 24.9 / 34.2 | 3.5 / 0.8 / 5.1 / 0.9 |
| High-infarct hearts 206/207/208/210 (Ref-1: 79.5 / 78.7 / 64.4 / 56.1) | 81.2 / 81.4 / 64.6 / 52.0 | 47.8 / 44.8 / 35.2 / 11.9 |
| Dead-area overlap with Ref-1 (Dice; ROC AUC) | **0.913** (0.963) | 0.562 (0.837) |
| Edge ring: dead share within 3 px minus 4–10 px in (Ref-1: 12.1) | 15.3 points | 12.9 points |
| Mild / strong shadow (75% / 55% light): verdicts that flip under it | 40.9% / 65.5% of dead read alive | **3.2%** / 6.6% of alive read dead |
| Rotate + flip + 8% darker, mean (max) shift | 0.26 (0.62) pp | 0.37 (1.29) pp |
| Outline area vs slice weight, mean within-heart r. *Done: A 0.930 (limit 8), B 0.950.* | 0.930 | 0.950 |
| Same file twice. *Done: bit-identical for both methods (tests).* | bit-identical | bit-identical |
| Time per slice | about 1 s, CPU only | about 1 s (GrabCut outline) |

**Known limits. These must appear on the About-the-method page:**
1. **Method A reads the time-control hearts high:** 21.4, 6.7, 24.9 and 34.2% (held out), against YHS 1.5, 3.0 and 4.4% for 109, 119 and 129. It was chosen for agreeing with Ref-1, which itself reads these hearts at 8.6–26.7%. Phase 0 tried the rim fix (18.5 pp from YHS) and a probability cut calibrated on the time-control hearts (8.1 pp, but Dice vs Ref-1 drops by 0.078); neither passed, so Method A ships as is.
2. **Method B's good YHS score is partly by design** (cut tuned on those hearts). The notebook's a\* threshold chosen automatically (Otsu) is 15.7 pp from YHS. The conservative cut may miss pale-pink infarct; the liberal cut over-calls the pale rim by about 8 pp on time controls.
3. **Pale rim (Method A):** the outermost band reads about 15 points more dead than the interior (Ref-1 itself shows about 12).
4. **Shadows (Method A):** under a mild shadow 40.9% of the dead tissue reads as alive. The notebook's shade-trained (17.3%, Dice −0.024) and shade-proof (0.3%, Dice −0.114) variants both fail the Phase 0 rule, so the app shows a shadow warning ◆ instead. Method B is steady (3.2% flip at 75% light).
5. **The two methods follow different references.** On the same scorecard, A agrees with the professor-based Ref-0 and Ref-1 and B agrees with YHS. On the high-infarct hearts B reads 20–40 pp below Ref-1 (heart 210: 11.9 vs 56.1%), which fits limit 2 (the conservative cut misses pale-pink infarct).
6. **No ground truth.** Ref-0 and Ref-1 come from the professor's grayscale rule; YHS covers only 3 hearts. Nothing checks missed infarct on the high-infarct hearts. Expert tracings (Ref-2) will decide between the methods.
7. **Small data.** 8 hearts from 2 photo batches; the hole model learned from 10 holes.
8. **Method A's outline vs slice weight:** mean within-heart r 0.930, below the 0.95 bar (heart 206: 0.73). Method B's outline reaches 0.950.
9. **Ranges are not validated.** Method A's range never contained YHS on the time-control slices (0 of 11); Method B's contained it on 6 of 11 but is often wide (median 15.8 pp). Only Method B's is shown (§2g).

---

## 3. Learn section and the 3D heart

### 3a. The course

| # | Module | Covers | 3D scenes |
|---|---|---|---|
| 1 | The heart, from zero | Chambers, valves, walls, LV vs RV, why the LV wall is thicker | Rotate the heart, chambers highlighted one by one, x-ray mode |
| 2 | How the heart pumps | Atria then ventricles, valves opening and closing, the beat cycle | Heartbeat animation with a speed slider, valves animated |
| 3 | Where the blood goes | Body → right heart → lungs → left heart → body | Blue and red flow particles through the chambers and great vessels |
| 4 | Feeding the heart itself | Coronary arteries (LAD, LCx, RCA), which region each supplies, flow mostly between beats | Coronaries isolated; tap an artery to light up its territory |
| 5 | What a heart attack is | A blocked artery → no oxygen (ischemia) → muscle dies (infarct); "time is muscle"; death spreads from the inner wall outward | Occlusion animation; the territory pales over time |
| 6 | Reopening the artery | Reperfusion saves tissue but adds its own injury; why researchers study this | Flow returns; part of the territory recovers, the rest stays dead |
| 7 | Why measure infarct size | The main outcome in preclinical studies testing heart-protecting treatments; area at risk vs infarct | Area-at-risk overlay (Evans blue idea) |
| 8 | How TTC staining works | Living cells' enzymes turn colourless TTC into red formazan; dead cells cannot, so they stay pale. Protocol: excise → slice → stain → fix → scan. The gold standard: after TTC, the pale (dead) tissue is cut away from the red (living) tissue and both are weighed; infarct % = dead weight ÷ total weight | Heart sliced apex → base; TTC reaches the tissue (§3c); live tissue turns red |
| 9 | Traditional methods | The gold standard (TTC, then dissecting and weighing the dead and living tissue); manual tracing in ImageJ (planimetry), grayscale cut-offs, histology; in patients, cardiac MRI, SPECT, troponin. Slow, destructive or subjective, and people disagree | Side by side: a slice traced by hand vs a cut-off |
| 10 | How our app does it | Lighting correction, tissue mask, holes, colour in Lab, the three ways of deciding dead vs alive (random forests taught by K-Means and by DBSCAN, and the stain ratio), why a range, validation and limits | A real study slice runs through the pipeline step by step, each step drawn on the slice |
| 11 | Good research practice | Blinding, reproducibility, the 3Rs (consistent measurement can mean fewer animals) | — |
| 12 | Bonus for CS students | Pixels, DPI, colour spaces, morphology, connected components, random forests | Interactive image-processing demos |

- **Tracks:** *No biology* (all modules, simplest wording), *Student* (skips basics with a placement quiz), *Researcher* (modules 7–11).
- **v1 scope:** modules 1, 3, 5, 8 and 10. All 12 modules are drafted with quizzes (2026-11-23) and wait for GVSU review (§11).
- **Species note:** the 3D models are human hearts (D15). Lessons say that the lab uses guinea pig hearts, which share the four-chamber layout.

### 3b. Lesson format and the "see what we are talking about" link
- Lessons are Markdown files with small directives. Biology collaborators can write and review them without touching code. English only, in `content/en/` (D10).

```markdown
::scene{camera="anterior" highlight="lad,lv-anterior-wall" anim="occlusion" speed=0.5}

The **[left anterior descending artery](term:lad)** feeds the front wall
of the **[left ventricle](part:lv)**. When it is blocked…

::quiz{type="click-part" target="lad" prompt="Tap the artery that was blocked."}
```

- Each lesson step stores a **scene state**: camera position, highlighted and hidden parts, transparency, labels, animation clip and speed. Moving to the next paragraph moves the 3D view smoothly to that state.
- `part:` links pulse the matching mesh when tapped or hovered; `term:` links open the glossary card.
- Learners can always take over the camera (rotate, zoom, pan), then press "Back to lesson view".

### 3c. Animations
| Animation | How |
|---|---|
| Heartbeat | Morph targets (shape keys) in Blender: atria contract, then ventricles; valve leaflets open and close in sync. Speed slider. |
| Systemic and pulmonary flow | Particles moving along spline paths through chambers and vessels, blue (oxygen-poor) and red (oxygen-rich), timed with the beat. |
| Coronary supply | Particles enter the coronaries mainly between beats; each artery's territory is a vertex-colour or texture mask. |
| Occlusion and infarct | A clot appears in the chosen artery; downstream flow stops; the territory fades from red to pale over a timeline, inner wall first. |
| Reperfusion | Flow resumes; part of the territory recovers, the core stays pale. |
| Slicing | The heart is cut into short-axis slices apex → base, matching the lab's slices and the report's apex → base strip. |
| **How TTC reaches the tissue** | Two variants, picked once the lab protocol is known (§13): (a) slices bathed in warm TTC, with the stain diffusing in from the cut faces; (b) TTC perfused through the coronary arteries before slicing. Living tissue turns brick-red, dead tissue stays cream. |
| Area at risk (if the lab uses it) | Evans blue perfused with the artery closed: perfused tissue turns blue, the area at risk stays unstained. |

### 3d. Interactions
- Rotate, zoom, pan; preset views (anterior, posterior, short axis, long axis).
- Click a part: name, one-line description, "learn more" link.
- **X-ray / transparency mode** to see the chambers through the wall, and an **exploded view**.
- **Virtual slicer:** drag a cutting plane along the long axis to see the short-axis ring, the same view as a TTC slice.
- Layers: myocardium, valves, coronaries, great vessels, labels.
- Play / pause / speed for every animation; reduced-motion setting.

### 3e. Quizzes
- Multiple choice, true/false, match the following, fill in the blank, put the steps in order (e.g. the TTC protocol), label the 2D diagram.
- **3D:** click the named part; "which artery supplies this region?"; drag labels onto the 3D heart.
- **Spot the dead tissue** on real slices. Answers come only from expert tracings or clear-cut examples, never from the app's own output (§2h).
- Each answer is followed by a short explanation; questions answered wrongly come back later (spaced review).
- ◇ Pass mark per module, badges, and a completion certificate (PDF).

### 3f. 3D assets and tech
- **Model source (decided 2026-11-26, D15):** two Sketchfab models under **CC BY 4.0**: "Realistic Human Heart" by neshallads (the outside) and "Human Heart Internal Structure 3D Model" by Haiqa Arif (the inside). CC BY 4.0 asks only for credit: it is in `web/public/models/CREDITS.md`, beside the 3D view and on the Help page.
  - Also considered: **Z-Anatomy** (CC BY-SA 4.0, built on BodyParts3D, CC BY-SA 2.1 Japan; ShareAlike would bind our changes), **NIH 3D** (licences vary per model), a **paid** model, and the v1 heart modelled in code (2026-11-23).
  - The real models are not split into named meshes. The coded heart stays underneath, unseen, with every part named: LA, RA, LV, RV, septum, four valves, aorta, pulmonary trunk, venae cavae, pulmonary veins, LAD, LCx, RCA, and endo- and epicardial layers. Labels, hover and click-the-part quizzes use it, and a highlighted part glows over the real model in its shape (`web/src/heart3d/skinParts.ts`).
- **Pipeline:** glTF-Transform 4.5.1 (WebP textures at 2048 px, meshopt geometry; the inside model simplified to 100,000 triangles) → GLB in `web/public/models/`, bundled with the app so Learn works offline. Otherwise the models are unchanged.
- **Rendering:** Three.js through React Three Fiber (+ drei helpers), in the browser now and in the Electron window later. Flow particles in a custom shader.
- **Labels** are text drawn by the app, never baked into textures.
- **Performance:** target 60 fps, minimum 30 fps on a laptop with integrated graphics. Use lower-detail meshes on weak GPUs. If WebGL is not available, fall back to pre-rendered video and 2D diagrams.
- **Accessibility:** every 3D step also has a text description and a 2D image.
- **Accuracy:** a GVSU faculty member (or a cardiology/physiology teacher) reviews every module and animation before release. Sources are cited per lesson.

---

## 4. Languages (dropped 2026-11-23, D10; kept for reference)

- **Indian languages:** Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Kannada, Malayalam, Urdu, Odia, Punjabi.
- **World languages:** English, Mandarin Chinese (Simplified), Spanish, French, Arabic, Portuguese, Russian, German, Japanese, Korean, Indonesian.
- ◇ **Rollout:** wave 1 English + Hindi; wave 2 the other Indian languages; wave 3 the world languages. Learn content and glossary first, then the UI.

| Topic | Approach |
|---|---|
| Framework | `i18next` + `react-i18next`; English is the source; one JSON file per language for the UI; Markdown folders per language for lessons |
| Fonts | Noto families for Indic, Arabic and CJK scripts, bundled (offline) |
| Right-to-left | Arabic and Urdu: mirrored layout via CSS logical properties and `dir="rtl"` |
| Numbers and dates | `Intl` formatting in the UI. **CSV always uses `.` decimals**, so exports never break in other locales |
| Scientific terms | Translated term + English in brackets on first use, e.g. "इन्फार्क्ट (infarct)" |
| Reports | Report language chosen separately; the Methods paragraph defaults to English |
| Quality | Medical text checked by a native-speaking reviewer, not machine translation alone; pseudo-localisation and string-length checks in CI |

---

## 5. Cloud sync

| Topic | Plan |
|---|---|
| Model | **Offline-first.** Local SQLite is the source of truth; changes queue and sync when online. The app works fully when signed out. |
| What syncs | Hearts, slices, experiment details, results JSON, overlay PNGs, PDFs, tags and notes, settings, Learn progress |
| Original images | Opt-in per workspace (they are the largest files). Stored by SHA-256, so duplicates upload once and integrity is checked |
| Accounts | Email + Google / Microsoft sign-in (university accounts); optional 2FA |
| Workspaces | *Personal* and *Lab* workspaces; roles owner / editor / viewer; invite by email |
| Conflicts | Analyses are **immutable**: re-analysing creates a new linked version. Experiment details use per-field last-writer-wins with an edit history. Deletes become tombstones with a 30-day trash. |
| Status | Sync indicator (synced / syncing / offline / error) and a per-device list |
| Backend ◇ | **Supabase** (Postgres + Auth + Storage + row-level security per workspace). Alternatives: Firebase, or a university-hosted server (§13). |
| Security | TLS in transit, provider encryption at rest, row-level security per workspace, signed URLs for files. Local library optionally protected by the OS keychain. |
| Data policy | GVSU shared its lab data with us to use as we like, in the cloud and on the public demo included (confirmed 2026-11-28). It is private but not secret, so no data agreement is needed before sync is turned on for lab workspaces. |

---

## 6. Architecture

```
┌──────── Browser now, Electron window later · web/: React + TypeScript (Vite, pnpm) ────────┐
│ Analyze: import · library · reports · export (CSV, ZIP; PDF from a print stylesheet)       │
│ Learn: lesson player · quizzes · glossary · 3D heart (Three.js / React Three Fiber, GLB)    │
│ About & Help · walkthrough · settings                     lessons: content/en/*.md          │
└───────────────┬────────────────────────────────────────────────────────────────────────────┘
                │ HTTP on 127.0.0.1, OpenAPI contract: analyses, jobs + progress, results JSON, layer PNGs
┌───────────────▼────────────────────────────────────────────────────────────────────────────┐
│ engine/: Python 3.14.4 (uv)                                                                 │
│   cardia_api/ = FastAPI: job queue (worker pool, progress, cancel) · library (SQLite +      │
│                 files in the app data folder) · watch folder · export · sync ──► Supabase   │
│   ttc_pipeline/ = shared: lighting · tissue mask · holes (hole_model file) · QC            │
│     method_a.py, method_b.py = 22 pixel features + RF predict   method_c.py = stain ratio  │
│   models/ = kmeans_rf/ · dbscan_rf/ · stain_ratio/ · holes/ · manifest.json                │
└────────────────────────────────────────────────────────────────────────────────────────────┘
Desktop phase: Electron loads the same web/ build and starts the same engine (PyInstaller) as a sidecar.
Public demo (D14): Caddy (HTTPS) → the same engine with --public on a Vultr server, serving the web/ build at /.
```

- **Why web first:** there is no Windows machine yet, and a local web app needs no installers, signing or OS-specific setup. The UI talks to the engine over HTTP from day one, so the desktop step changes packaging, not code.
- **Local by default:** on a user's computer the engine server binds to 127.0.0.1, accepts requests only from the Cardia UI's origin, and requires a token created at each launch. Other web pages on the same computer therefore cannot reach it, and scans never leave the machine.
- **Public demo (D14):** the same engine runs with `--public` behind Caddy on a Vultr server (`deploy/`). It still listens on 127.0.0.1 only; the UI is served from the same address, so the token is dropped and only same-origin pages may call it. Every visitor shares one library, and the watch folder, backup and restore are off. GVSU allows its data on a server (§5). `.github/workflows/deploy.yml` builds the web app with `VITE_CARDIA_PUBLIC=1` and redeploys on every push to `main`.
- **Why no C++ port:** Python runs locally (and ships inside the desktop app later), so the engine is the validated code itself. This removes the old 3-week port and its drift risk.
- **Model files:** everything the engine loads lives in `models/` and is listed in `models/manifest.json` (file, version, SHA-256, scikit-learn version). The engine refuses to run if a hash does not match. Reports quote the manifest.
- **Pin everything:** the notebook ran on Python 3.14.4, NumPy 2.5.5 and OpenCV 5.1.0. These are pinned in `engine/uv.lock`, along with the exact scikit-learn version the models were saved with (joblib files only load reliably with that version). ◇ *Later:* export the forest to ONNX to drop the scikit-learn runtime.
- **Jobs:** slices run in a worker pool in the engine, with progress and cancel; the UI never blocks.
- **PDF:** the report page has a print stylesheet. The web app saves it through the browser's "Save as PDF", and the desktop app uses Electron's `printToPDF` on the same page.
- **Packaging (desktop phase):** Windows installer (signed), macOS app (signed and notarised, Apple Silicon + Intel), optional Linux AppImage. Auto-update with `electron-updater`. Python + OpenCV + scikit-learn is large, so measure the app size then.
- **The research repo's `webapp/`** stays as a research and demo tool. It is not the product.

---

## 7. Keeping the app identical to the reference code

- **Golden set:** the 30 study slices → `reference/golden/per_slice.csv` plus masks (tissue, holes removed, Method A dead, Method B dead, Method C dead and borderline), hashed in `engine/tests/golden/golden.sha256`. It includes every method's infarct % and range, unsure or borderline %, holes removed % and QC flags, with the pipeline version and the models manifest's SHA-256 (pipeline 0.6.0).
- **Release gate:** on the reference OS, the engine matches exactly (same code, same models). Across operating systems, every slice must be within **0.1 pp** with **IoU ≥ 0.99** on every mask, and the QC flags must be identical. CI runs this on macOS and Linux for every change, and adds Windows in the desktop phase.
- Any intended change bumps the pipeline version, regenerates the golden set from the notebook first, and is listed in "What's new".
- **Determinism:** the flat-field sampling (seed 0), K-Means (seed 42) and the forests (random_state 42) are seeded, Method C is a fixed rule, and inference uses only the frozen files in `models/`. The same file twice must give bit-identical results.

---

## 8. Phase 0: lock both methods and score them the same way (gate, before app code)

*Historical: Phase 0 was done on 2026-11-23, and "Method B" in this section is the retired a\* cut (D12, D13).*

Pass rules marked ◇ are proposals; the team fixes them **before running**.

| Task | Pass rule |
|---|---|
| Move notebook Parts D, E, G, L, O and `ttc/pipeline.py` + `ttc/infarct.py` into `ttc_pipeline/`. *Done 2026-11-20: shared steps and Method B exact; Method A's frozen forest exact, its retraining within 0.55 pp (§2e, §2f).* | Method A reproduces the notebook's 30 per-slice numbers exactly; Method B on its original front end reproduces `measure.py` exactly |
| **Hole file:** move the 10 hand-marked outlines to `annotations/holes/hand_marked_holes.json`; score the repo and notebook versions of our hole scorer on the same labels with the same matching rules; write `train_hole_model.py`; save `models/holes/hole_model.joblib` + `.json`. *Done 2026-11-20: neither version passed; the team chose the repo version (§2d).* | The version with more holes found wins, provided false holes ≤ 3 ◇ and no slice loses > 1% of its tissue wrongly; a tie goes to fewer false holes |
| **Method B on the shared front end:** re-derive the 11.75 / 18.66 cuts with the same recipe (leave-one-heart-out on time-control hearts vs YHS; GMM valley). *Done 2026-11-20: 3.80 pp, failed; Method B keeps its own front end, cuts 11.75 / 18.60 (§2f).* | Time-control slices vs YHS ≤ 2.9 pp; otherwise Method B keeps its original front end (§2f) |
| **One scorecard for both:** add Method B to the notebook's comparison (Parts J–M) next to Method A. *Done 2026-11-23 (`engine/training/scorecard.py`, README table).* | Both methods get every check: Ref-0, Ref-1, Ref-YHS, Dice, heart and slice MAE, rim, shadow test, rotate + flip + darker, area vs weight. Results go into the README table |
| Same file twice | Bit-identical |
| Robustness: rotate + flip + 8% darker. *Done: mean shift A 0.26 pp, B 0.37 pp (B's worst slice 1.29).* | Shift ≤ 1.0 pp ◇ |
| **Method A on time-control hearts** (limit 1): try the rim fix and a probability cut calibrated on the time-control hearts (leave-one-heart-out). *Done: nothing passed (rim fix 18.5 pp; calibrated cut 8.1 pp with Dice −0.078); ships as is.* | Heart MAE vs YHS ≤ 5 pp ◇ (now about 18.7), while Dice vs Ref-1 drops by < 0.01. If nothing passes, Method A ships as is, with the limit stated |
| **Shadow steadiness** (limit 4), for both methods: shade-trained and shade-proof variants, or a shadow detector. *Done: B passes (3.2%); A and its variants fail, so A gets the shadow warning.* | Mild-shadow flip < 5% without losing > 0.01 Dice; otherwise ship the shadow warning |
| Range definitions (§2g), for both methods. *Done: both fail; show B's range only for now, revisit after the app is built (§2g).* | The range contains Ref-YHS on the time-control hearts and is ≤ 10 pp wide on ≥ 80% of slices ◇ |
| "Methods disagree" threshold (§2g). *Done: no flag; A and B shown side by side (§2g).* | Set from the A–B differences on the 30 study slices ◇ |
| Outline area vs slice weight, mean within-heart r | ≥ 0.95 ◇ (same bar as before) |
| Golden set and README table. *Done 2026-11-23: `reference/golden/` (in git), hashes in `engine/tests/golden/golden.sha256`, `test_golden.py`.* | Written, with every threshold change and its reason |

**In parallel (one-time, training only, allowed by D6):**
- label more hole candidates, aiming for several hundred, add them to `hand_marked_holes.json`, and retrain the hole file;
- ask GVSU for expert ImageJ tracings of 1–2 slices per heart. These become **Ref-2**: the first real accuracy check and **the main input for choosing between Method A and Method B** (§13).

---

## 9. Screens

0. **Landing** (`#/`, 2026-11-26): one heart's story told by scrolling in 3D (§1j), with the way into Analyze and Learn.
1. **Home / Library:** recent hearts, search and filters, sync status, a "New analysis" button, and a switch between **Analyze** and **Learn**.
2. **Import:** drop zone, watch-folder setting, a list of detected hearts and slices with auto-filled IDs and weights (editable only where missing), input-check warnings.
3. **Processing:** per-slice progress, running in the background.
4. **Heart report:** headline %, range, mass, confidence, **methods panel** (A and B side by side, C apart), apex → base strip, context, quality summary, Methods paragraphs, export.
5. **Slice report:** layer viewer (every method's dead map, the probability maps, an A vs B slider), composition per method, one-line summary, confidence reasons.
6. **Export:** PDF / CSV / ZIP.
7. **Learn home:** course map as a path of units, tracks, XP, daily goal, streak, hearts, badges, continue button.
8. **Lesson player:** 3D viewport beside the lesson text, step navigation, inline quizzes.
9. **Glossary.**
10. **About & Help:** walkthrough, flag explanations, FAQ, what's new, how to cite, licences.
11. **Settings:** units, theme, **headline method (A, B or C)**, method info, backup / restore.
12. **Account & workspaces:** sign in, workspaces and members, devices, sync settings (images on/off).

---

## 10. Testing

| Layer | Test |
|---|---|
| Method (Python) | Phase 0 checks (§8); golden set generation |
| Engine package | pytest per step against the notebook's intermediate masks; every method's golden parity on macOS + Linux, Windows in the desktop phase (§7); the engine refuses a model file whose hash is wrong; robustness; API contract tests (OpenAPI schema, local-only access, public mode in `test_public.py`) |
| App | Vitest + React Testing Library (filename parser, report formatting, library queries); Playwright in the browser (later Electron): import demo heart → report → toggle layers → export PDF; open lesson → 3D step → quiz |
| Sync | Offline edits then reconnect; the same heart edited on two computers; delete and restore; interrupted large upload resumes; workspace permissions (a viewer cannot edit) |
| 3D | Frame rate on an integrated-GPU laptop; no-WebGL fallback; every lesson's scene states load; reduced motion |
| Content | Expert review sign-off per module; quiz answers checked |
| Devices | Web phase: Apple Silicon Mac, an older Intel Mac, Chrome + Safari + Firefox; airplane mode end to end. Desktop phase adds a Windows 10/11 laptop with integrated graphics |

---

## 11. Milestones

| # | Milestone | Output | Owner | Est. |
|---|---|---|---|---|
| 0 | Phase 0 gate for both methods (+ hole labelling, tracings request) | `ttc_pipeline/` with Methods A and B, `models/` (hole file, RF, a\* cuts, manifest), one scorecard, golden set, README table | Prince (shared steps, holes, B, scorecard) + Melove (A, golden set) | 2–2.5 wk |
| 1 | Engine API | Local FastAPI server: jobs with progress, results JSON + layer PNGs, local-only access; **OpenAPI contract published in week 1** so the web app can be built on mock data; golden parity in CI (macOS + Linux). *2026-11-23: contract 0.1.0 (`engine/cardia_api/openapi.json`), server, `--mock` mode; the API reproduces the golden set exactly; with the data in git, CI runs the golden tests on macOS and Linux (§13 item 14)* | Prince | 1 wk |
| 2 | Web shell | Screens 1, 2, 3, 11; library (SQLite in the engine); watch folder; speed measured. *2026-11-23: library, settings and watch folder in the engine (API 0.2.0); Library, Import, Processing, Heart and Settings screens; light and dark themes; Vitest suite and a web CI workflow; checked end to end against `--mock`. 2026-11-24: speed measured with the real engine on the 30 study slices (21.6 MB of TIFF, one upload): 32 s in all with 3 workers on a 4-core machine, 3.0 s a slice (1.1–4.8 s), about 56 slices a minute, and every heart's numbers identical to the golden set* | Krrish | 2 wk |
| 3 | Reports and export | Screens 4, 5, 6; PDF, CSV, ZIP; backup / restore. *2026-11-23: slice report (layer viewer with zoom, before/after and A vs B, composition per method, summary, confidence with reasons), heart report (apex → base strip, quality summary, Methods paragraph), CSV per slice and per heart, ZIP bundle with a SHA-256 manifest, PDF by printing the report (API 0.3.0). Then backup / restore of the whole library as one ZIP (restoring adds, never overwrites) and the report's context against the study set, shown only for hearts measured with the same pipeline version and model files (API 0.4.0). Milestone 3 is done* | Krrish (screens) + Melove (export, Methods paragraph) | 1.5 wk |
| 4 | Cloud sync | Screen 12; accounts, workspaces, sync engine, image opt-in. *2026-11-24: built without accounts. Supabase schema with row-level security per workspace, per-field merging of heart details, immutable results and tombstones (`cloud/`); the engine's outbox and background sync, email sign-in, workspaces and roles, devices, Learn progress, scans opt-in per workspace (API 0.5.0); the Cloud sync screen and header badge. Off until the engine has `CARDIA_SUPABASE_URL` and `CARDIA_SUPABASE_ANON_KEY` (Phase B item 1); `--fake-cloud` and the tests use an in-memory cloud with the same rules. Later: Google / Microsoft sign-in, settings sync, resuming large uploads* | Prince | 2 wk |
| 5 | Learn engine | Screens 7, 8, 9; lesson format, quizzes, progress. *2026-11-23: lesson format parser, course map with tracks, lesson player, seven quiz types (all but spot-the-dead-tissue, which waits for expert tracings), glossary, spaced review, badges; progress kept in the browser until milestone 4; works without the engine. 2026-11-26: Learn as a game (§1g): a path of units, XP, daily goal, streaks, hearts, combo, Tetra the mascot* | Melove | 1.5 wk |
| 6 | 3D heart | Model prepared and split, scene-state sync, heartbeat, flow, coronaries, occlusion, slicing, TTC animations. *2026-11-23: a 2D diagram (cut open, outside, short-axis slice) reads the lessons' scenes with the same part ids and animations; it is the 2D fallback. Then the 3D heart v1, modelled in code with the §3f part ids and driven by the same scenes. 2026-11-26: the real models (D15) are the visible skin, highlights glow over them in each part's shape, and the landing page tells one heart's story in 3D* | Krrish | 3 wk |
| 7 | Learn content v1 | Modules 1, 3, 5, 8, 10 written, reviewed, quizzes (in parallel with 5–6). *2026-11-23: English drafts of all five with quizzes, sources and a 50-term glossary, then drafts of modules 2, 4, 6, 7, 9, 11 and 12 and the gravimetric gold standard in module 8; module 10 covers the three methods since 2026-11-25; awaiting GVSU review* | Melove leads, all write | 2 wk |
| 8 | ~~Languages wave 1~~ | Dropped (2026-11-23, D10) | — | — |
| 9 | Polish | Walkthrough, About & Help, dark mode, accessibility. *2026-11-24: Help, shortcuts, the walkthrough on the demo heart, and an automated accessibility audit with its fixes; a screen-reader pass waits for the pilot. 2026-11-26: the "Living Stain" redesign (§1j), new logo and the header's engine pulse* | Krrish + Prince | 1 wk |
| 9a | Public demo | D14: the engine's `--public` mode, a Vultr server with Caddy, redeploy on every push to `main`. *Done 2026-11-26 (PR #23): <https://139-84-209-207.sslip.io>* | Melove | done |
| 10 | Pilot (web app) | 2–3 lab users + 5–10 student learners | all | 1 wk |
| 11 | Desktop | Electron wrapper around the same UI and engine; PyInstaller engine for Windows + macOS; Windows parity in CI; signing; auto-update | Prince | 1.5–2 wk, once a Windows machine is available |
| later | Study dashboard, ◆ analyses, re-analyse diff, scanner acquisition, 3D stack view, ONNX engine | | | |

About 18–20 weeks if done one after another, but three people working in parallel need much less. As of 2026-11-28, milestones 0–6, 9 and 9a are done (milestone 4 without accounts), milestone 7 is drafted and waits for GVSU review, 8 is dropped, and 10 and 11 wait on Phase B. Ownership and workflow: [CONTRIBUTING.md](CONTRIBUTING.md).

### 11a. What's left (updated 2026-11-28)

Phase A is done; only Phase B is left. Phase A needed nothing from anyone outside the code; Phase B waits on data, decisions, accounts or Prince's laptop. ◇ marks a default chosen to keep moving, open to the team.

**Phase A: done**

1. **Frontend design pass.** Install the `design-taste-frontend` skill (read before use) and apply it across Analyze and Learn; smooth scrolling with Lenis (off with reduced motion); remove the language picker (D10). *Done 2026-11-23 (PR #12); redesigned as "The Living Stain" on 2026-11-26 (PR #22).*
2. **Better heart pictures.** Redraw the 2D diagrams (cut open, outside, slice) with anatomical shapes and shading; they stay the 2D fallback. *Done 2026-11-23 (PR #13).*
3. **3D heart v1 (milestone 6).** Three.js + React Three Fiber; a stylised heart modelled in code ◇ (§13 item 8) with the §3f part ids, driven by the same lesson scenes: highlight, labels, x-ray, slicing, heartbeat, flow, coronaries, occlusion, TTC. Falls back to the 2D diagram without WebGL. *Done 2026-11-23 (PR #14); the real models (D15) cover it since 2026-11-26 (PRs #22, #24).*
4. **Learn content.** Add the gravimetric gold standard to module 8; draft modules 2, 4, 6, 7, 9, 11 and 12 with quizzes and sources (drafts until reviewed, B3). *Done 2026-11-23 (PR #15).*
5. **Milestone 3, the rest.** Backup and restore of the whole library as one file; a heart's context against the study set measured by the same pipeline version (§1d). *Done 2026-11-23 (PR #16).*
6. **Cloud sync (milestone 4), built and tested without accounts.** Supabase ◇ (§13 item 2): database schema with row-level security, the engine's sync queue (SQLite stays the source of truth), sign-in and workspaces screen, sync status, Learn progress sync, images opt-in. Off until the environment variables exist (B1); tested against a fake backend. *Done 2026-11-24 (PR #17).*
7. **Polish (milestone 9).** About & Help, the walkthrough on a demo heart from the study set, "why was my slice flagged?", FAQ, keyboard shortcuts, what's new, an accessibility pass. *2026-11-24: the Help page (getting started, why a slice is flagged, questions, shortcuts, what's new, how to cite, credits and licences) and single-key shortcuts are done. 2026-11-24: the walkthrough is done: heart 206 from the study set is served by the engine (API 0.6.0, `GET /demo`), and a card leads through import, processing, the report, a slice's layers and export, started from Help or an empty library. Accessibility audit: axe-core (WCAG 2.2 A/AA and best practice) is clean on 15 screens in light and dark; every Tab stop on 11 screens shows a focus ring. Fixed on the way: lesson step dots were 12 px targets (now 24 px), a badge inside a button had 1.2:1 contrast, and the date field had no focus ring. Not yet done: a screen-reader pass (VoiceOver, NVDA) and a check at 200% zoom on a real machine; they go with the pilot (Phase B5).*
8. **Speed.** Measure the real engine on the 30 study slices (milestone 2's last item). *Done 2026-11-24: 3.0 s a slice, 56 slices a minute with 3 workers (milestone 2 row).*

**Phase B: needs data, people or Prince's laptop**

1. **Cloud accounts.** A Supabase project and its environment variables from Krrish or Melove; then turn sync on and test it live. GVSU allows its data in the cloud (§5). With accounts, the public demo can give each visitor their own library instead of one shared one (D14).
2. **Reviews.** Krrish and Melove review the merged PRs (#7, #8, #10 and later); a GVSU faculty member reviews every lesson and fills in `reviewed_by`.
3. **Decisions.** The confidence rule and the area–weight bar (milestone 3 ◇), the default headline method (§13 item 10), the lab protocol for the TTC animation (item 5).
4. **Data.** Expert tracings (Ref-2) to choose between Methods A, B and C and revisit the ranges (§13 items 9, 13); more hole labels to retrain the hole model.
5. **Pilot** with 2–3 lab users and 5–10 students (milestone 10).
6. **Desktop app** once a Windows machine is available (milestone 11).

---

## 12. Risks

- **Methods A and B read time-control hearts high** (§2h limit 1, §2j). Method C, shown apart, reads them closest to YHS. There is no "methods disagree" flag (§2g); the methods are shown side by side.
- **Three numbers can confuse users.** Clear labels ("Method A: K-Means + RF", "Method B: DBSCAN + RF", "Method C: stain ratio"), one headline method, C shown apart as a colour rule, and the Learn module 10 explanation. Once the team chooses, the other methods move to a hidden "compare" setting or are removed.
- **Shadows flip verdicts** (Methods A and B: 41% and 29% of dead pixels under a mild shadow; Method C steady at 0.14%). Scanner input helps but does not remove fold shadows. Mitigations: Phase 0 variants, the shadow warning, the scanning guide.
- **Model files and library versions.** joblib models break across scikit-learn versions. Pin, hash and test them in CI.
- **References are not ground truth; small data.** Never report "accuracy vs GVSU". Get expert tracings (Ref-2) and spot-check new batches.
- **Hole model learned from 10 holes.** It finds 5 of 10 held out and calls 2 creases holes; on one slice that removes 1.47% of the tissue (§2d). All three methods depend on it. Mitigations: more labels, the range, and scanning on a blue/green background.
- **3D content accuracy and licences.** Expert review per module; check every asset's licence; credit the CC BY 4.0 models wherever they are shown (D15).
- **3D performance on weak laptops.** Lower-detail meshes and a video/2D fallback.
- **Cloud and demo cost and misuse.** GVSU allows its data online (§5), so the risks are cost and misuse. Image storage grows over time (images opt-in, row-level security; watch usage). The public demo has one shared library that anyone with the link can fill or empty until it has accounts (D14).
- **Scope.** Learn + 3D + sync roughly double the app. Ship the Learn v1 modules first; analysis features take priority if time runs short.
- **App size.** A bundled Python + OpenCV + scikit-learn adds a large download; ONNX later can shrink it.

---

## 13. Open decisions

1. **Electron or Tauri?** Deferred to the desktop phase (milestone 11). The default is Electron (same Chromium on every OS, which is safer for WebGL). Tauri is much smaller but uses each OS's own webview.
2. **Sync backend:** Supabase (default), Firebase, or a university-hosted server?
3. **Who uses it:** our team, GVSU staff, other labs? Is Learn open to any student, perhaps free and without an account?
4. **Original images in the cloud:** off by default (current plan) or on?
5. **Lab protocol:** whole slice vs LV only; Evans blue (area at risk); TTC by slice incubation or coronary perfusion. This decides the TTC animation (§3c).
6. **Platforms for the pilot:** the web app on macOS (decided 2026-11-20). Which browsers count as supported, and whether lab Windows PCs join through the web app before the desktop phase?
7. ~~Languages in wave 1~~: dropped (2026-11-23, D10).
8. ~~3D model source~~: decided 2026-11-26 (D15): two Sketchfab models under CC BY 4.0, over the heart modelled in code, which keeps the §3f part ids.
9. **Which method to move forward with, A, B or C, and how to decide.** Proposed rule ◇: when Ref-2 tracings arrive, pick the method with the best Dice and heart MAE against Ref-2, with the YHS time-control check as a tie-breaker. Until then all three run.
10. **Default headline method** while all three run: A (current default ◇), B or C?
11. **Which ◇ proposals to accept** (§1k, §1f, §3e, §4 rollout, §8 pass rules).
12. **Public repo and derived files: decided 2026-11-23, they are committed.** The study scans and `.out` files (already public in the research repo), the frozen models, the hand-marked hole outlines, the notebook's saved masks and results, and the golden set are in git. GVSU shared the data with us to use as we like, including deploying it (confirmed 2026-11-28): it is private but not secret. Left out: the notebook itself (22 MB) and its caches. Cloud sync follows §5.
13. **Ranges, the high readings of Methods A and B on time-control hearts, and the choice of method: revisit once the app is built** (decided 2026-11-23). Teammates are working on method improvements; the best-performing approach is then implemented. Until then the app shows A and B side by side, C apart, and only C's range.
14. **Golden parity in CI: decided 2026-11-23.** With the data in git (item 12), CI runs every parity and golden test on macOS and Linux. The research repo checkout for the a\* cut's parity test was dropped with that method (D12).
