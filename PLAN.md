# PLAN: Cardia, a TTC infarct analyzer with cloud sync and a Learn section

*Last updated 2026-11-20, revision 2: the app is named **Cardia** (repo `github.com/Prince-Kunal/cardia`). It is built **as a web app first** and becomes a desktop app once a Windows machine is available. This plan replaces the 2026-11-18 offline mobile plan. Who does what: [CONTRIBUTING.md](CONTRIBUTING.md).*

**Goal:** a polished app with two halves. It runs first as a web app on the user's computer (a browser UI plus a local Python engine) and later ships as a desktop app for Windows and macOS.

1. **Analyze.** The user drops in scanned TTC heart slices. The app automatically produces:
   * the infarct % and dead mass of each slice, and of the whole heart when several slices are imported;
   * what is in each slice;
   * what the result means for the heart.

   Two methods run on every slice until the team picks one (§2): **Method A "K-Means + RF"** (the notebook) and **Method B "a\* cut"** (the earlier repo method). Analysis always runs on the computer. Reports are stored locally and, if the user signs in, synced to the cloud so the same library is available on every computer and can be shared with the lab.
2. **Learn.** A course for someone with no biology background, built around an animated, interactive 3D heart. It covers what the heart is, what an infarct is, why we measure it, how TTC staining works, the traditional methods, and what our method does. It includes quizzes along the way, in many languages.

---

## 0. Decisions so far

| # | Decision | Why |
|---|---|---|
| D1 | **The main input is scanned TIFF files.** PNG and JPG are accepted, as in the notebook, but carry an "unvalidated input" badge. The phone camera and the printable capture mat are **dropped**. | The app now runs on a computer only (no phone), and every setting in the pipeline was chosen on scans. |
| D2 | **No human in the loop** for analysis. The app never asks anyone to confirm, edit, trace or sign off on a result. | Automation is the whole point. Where the app is unsure, it **flags the slice and widens the reported range** instead of asking. |
| D3 | **Offline-first app with optional cloud sync.** Analysis, the library and export work with no network, both as the local web app and later as the desktop app. Sync adds backup, multiple computers, lab sharing and Learn progress. | Lab computers may be offline, and unpublished data stays local unless the user turns sync on. |
| D4 | **Two methods side by side until the team chooses** (§2). Both share the notebook's lighting correction, tissue mask and **our hole scorer (one shared hole-model file)**. Only the dead/alive step differs: **Method A "K-Means + RF"** (`GVSU_Infarct_Pipeline_main.ipynb`) and **Method B "a\* cut"** (`ttc/pipeline.py`). The friend's colour mask, SAM 2.1 and DINOv3 are not shipped. | They were scored against different references and disagree most on low-infarct hearts. Running both on every slice gives the comparison needed to choose, ideally against expert tracings (Ref-2). In the notebook's tests, DINOv3 or SAM changed Dice by at most about 0.005 and need a GPU. |
| D5 | **Frozen models.** The random forest, the hole model and Method B's cut-offs are fixed once, outside the app, and shipped as versioned files (`models/`, with a manifest of SHA-256 hashes). The app never retrains on user data. | The same input must always give the same number, and every report must name the exact model used. |
| D6 | **No Claude in the final tool.** Human labels may be used for one-time training only (hole marks, future expert tracings). | Rule set by the project. |
| D7 | **Design for the whole slice now, and leave room for LV-only % and area at risk.** | The lab protocol (LV vs whole slice, Evans blue) is not known yet. |
| D8 | **Web first, desktop later.** UI: React + TypeScript (Vite, pnpm) in the browser. Engine: the notebook's and `ttc/` code as a Python package behind a **local FastAPI server on 127.0.0.1**, so scans never leave the computer. Desktop phase: Electron wraps the same UI and launches the same engine (frozen with PyInstaller). No C++ port. | No Windows machine yet, and a web app needs no installers, signing or Windows setup. The engine *is* the reference code. Because the UI talks to the engine over HTTP from day one, the desktop step only changes packaging. Electron then gives the same Chromium/WebGL on every OS for the 3D heart (Tauri is the alternative; see §13). |
| D9 | **A Learn section with an interactive 3D heart**, aimed at students and people with no biology knowledge. | Explains the science and the method to new lab members, students and reviewers. |
| D10 | **Multilingual UI and Learn content** (major Indian and world languages). Exported scientific text (the Methods paragraph) defaults to English. | Reach learners in their own language; papers are written in English. |

### What changed from the 2026-11-18 plan

| Area | Before | Now |
|---|---|---|
| Platform | iOS + Android (React Native / Expo) | Local web app first (browser + local engine), then Windows + macOS desktop (Electron); Linux optional |
| Engine | C++17 port of the Python, golden parity gate | The Python pipeline itself, served by a local API (desktop: packaged as a sidecar) |
| Boundary | Friend's colour mask (+ optional SAM 2.1) | Notebook tissue mask: chroma cut set from the paper, speck removal, ruler-bridge cut, hole filling |
| Dead / alive | a\* cuts 11.75 (conservative) / 18.66 (liberal) | **Both**: Method A random forest on 22 pixel features (dead = p ≥ 0.5) and Method B a\* cuts, until the team chooses |
| Holes | Logistic scorer, 3 measures (not yet saved as a file) | Our logistic scorer, saved as one shared hole-model file; Phase 0 picks the better of the repo and notebook versions |
| Camera | Capture mat, auto-shutter | Dropped |
| Storage | Fully offline | Offline-first + optional cloud sync with accounts and lab workspaces |
| New | — | Learn section with a 3D heart, quizzes, many languages, About/Help with a walkthrough |

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
- ★ Image viewer: turn layers on and off (tissue outline, holes removed, holes filled in, Method A dead map, **Method A probability heat map**, Method B dead map, Method B borderline), zoom and pan, before/after slider (original vs lighting-corrected), and an **A vs B slider** that shows where the two methods disagree.
- ★ A one-line plain-language summary, e.g. *"24% of tissue is dead (range 21–27%). 1 hole removed. Image quality: good."*
- ★ Confidence badge (high / medium / low) with the reasons: unsure pixels > 15% (Method A), the methods disagree ◇, uncertain holes, non-TIFF input, missing weight.
- ◆ Shadow / uneven-light warning on the tissue (Method A is sensitive to shadows; §2h). Phase 0 candidate.
- *Later* ◆ Depth of the infarct in the wall (inner wall only vs full thickness).
- *Later* ◆ Patchiness: number of dead patches and the largest patch.
- *Later* ◆ Stain-quality check: warns when a slice looks under-stained.
- *Later* ◆ Position around the ring and LV-only % (needs automatic RV detection).

### 1d. Heart report: what it says about the heart
- ★ Headline infarct % (slice-weight weighted) from the headline method chosen in Settings, its range (§2g), dead mass in mg, and confidence.
- ★ **Method comparison panel:** Method A and Method B side by side for the heart and for every slice, each with its range, plus the "methods disagree" flag ◇.
- ★ Apex → base strip: slice thumbnails with a bar each, showing where the damage is concentrated.
- ★ Context, never a diagnosis: comparison with the study set **measured by the same method and pipeline version**. Later also against the lab's own groups. The report states that this is a research tool for guinea pig hearts.
- ★ Quality summary: area vs weight agreement, missing weights, flagged slices, slices skipped and why.
- ★ An auto-written Methods paragraph for the headline method (and a second for the other method if it is reported): pipeline and model versions, model hashes, training or calibration set (8 hearts, 30 slices), how holes and unsure tissue were treated. English by default.
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
- ★ Glossary: every term in Learn and in the reports (TTC, infarct, a\*, unsure tissue…) opens a short card that links to its lesson.

### 1h. About and Help
- ★ About: what the app does, who made it (team + GVSU credits), how to cite it, a research-use-only disclaimer, and open-source and 3D-model licences.
- ★ How to use it: a guided **walkthrough** on the bundled demo heart (import → processing → heart report → layers → export), replayable from Help.
- ★ "Why was my slice flagged?": each QC flag links to a plain explanation and how to fix it (rescan, add the weight, even lighting, blue/green background).
- ★ FAQ, keyboard shortcuts, and "What's new" (lists pipeline version changes).
- ★ "About the method" page: version, settings, what was validated, known limits (§2h).

### 1i. Languages (details in §4)
- ★ UI, Learn, glossary and 3D labels translated. Language picker in Settings; the system language is the default.
- ★ The report language is chosen separately from the app language.

### 1j. Polish and trust
- ★ Onboarding with a demo heart from the study set (bundled, so it works offline).
- ★ Dark mode, colour-blind-safe overlay colours, keyboard navigation, screen-reader labels, reduced-motion setting.
- *Desktop phase* Signed installers and automatic updates.

### 1k. Proposed extras (◇, for the team to accept or reject)
- ◇ Probability sandbox (Learn only): drag the dead/alive cut-off on the demo slice and watch the infarct % change. It shows why a range is reported and has no effect on real reports.
- ◇ Lab protocol timer for TTC incubation and fixation, with notifications.
- ◇ In-app scanning guide: resolution, flat lid, even light, blue/green background or backlight.
- ◇ Export overlays as ImageJ ROIs so labs can check outlines in their usual tool.
- ◇ "Report a problem" bundle: logs plus the flagged slice packed into a ZIP to email.

---

## 2. Analysis pipelines (per slice, fully automatic)

Until the team chooses one (§13), the app runs **two methods on every slice** and shows both. They share every step except the dead/alive decision:

```
read → lighting correction → tissue mask → holes (one shared hole-model file) ─┬─ Method A "K-Means + RF": 22 pixel features → random forest
                                                                              └─ Method B "a* cut": smoothed redness a* below a cut-off
```

Sources: `GVSU_Infarct_Pipeline_main.ipynb` (Parts D, E, G, L, O) for the shared steps and Method A; `ttc/pipeline.py` + `ttc/infarct.py` for Method B. Phase 0 (§8) moves both into the package `ttc_pipeline/` **without changing behaviour**. Function names below are the original ones.

Fixed settings (`CFG`): `seed=42`, `paper_target_linear=0.88`, `hole_small_frac=0.002`, `hole_dark_dL=10`, `holes={v_frac:145/245, g_r:0.5, b_g:0.95, dark_L:32, min_px:150, lr_C:0.3, score_cut:0.8}`, `dead_threshold=0.5`; Method B cuts `11.75` / `18.66`.

### 2a. Read
- RGB image (`PIL ... .convert("RGB")`); heart ID and weight from the file name; DPI from TIFF tags (for mm² only, not used by either method).

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
- **What it is:** our own hole finder, as a candidate net plus a logistic-regression scorer. It started in `ttc/hole_regions.py` (2026-11-18) and was reworked in the notebook: flatness added, minimum size 150 px instead of 200, measurements scaled to the paper. It is **not** the friend's or GVSU's hole finder. It is also **not** the web app's chamber-opening / lumen / edge-bay rules, which the old measurement pipeline used.
- **Candidates** inside the filled outline: *darker paper* (brightest channel < 59% of the paper's, G/R > 0.5, B/G < 0.95) or L\* < 32; opening r=2, closing r=3, fill, ≥ 150 px.
- **Measures:** `edge_vs_inside`, `contrast`, `thickness`, `flatness`.
- **Decision:**
  - score ≥ 0.8 → hole (removed from tissue);
  - 0.5 ≤ score < 0.8 → **uncertain** (feeds the range, §2g) ◇;
  - below 0.5 → tissue.
- **Held-out results:** each heart is scored by a model trained on the other 7, against the 10 hand-marked holes.

  | Version | Holes found | False holes |
  |---|---|---|
  | Notebook (4 measures, 150 px) | 5 of 10 | 4 |
  | Repo `ttc/hole_regions.py` (3 measures, 200 px, 6-px edge margin; `compare_hole_methods.py`) | 6 of 10 | 2 |

  The two were scored with slightly different matching rules. Phase 0 scores both on the same labels with the same rules, and the better one becomes the shared hole file.
- **The hole file** (Phase 0 creates it; the notebook currently keeps the model only in memory):
  - `models/holes/hole_model.joblib`: the fitted scaler + logistic regression.
  - `models/holes/hole_model.json`:
    - feature names in order;
    - cut-off 0.8 and the uncertain band 0.5–0.8;
    - candidate settings (`CFG["holes"]`);
    - SHA-256 of the training labels;
    - scikit-learn version, model version, and SHA-256 of the `.joblib`.
  - Trained by `train_hole_model.py` from `annotations/holes/hand_marked_holes.json`, which holds the 10 outlines now inline in notebook Step 21. Later labels are added to the same file.
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
- **Files:** `models/kmeans_rf/final_model_K_Means_RF.joblib` + `.json` (feature names, cut 0.5, scikit-learn version, SHA-256).

### 2f. Method B: a\* cut
- a = Lab a\* (redness), Gaussian-blurred σ 1.5 (`smoothed_a`).
- **Main (conservative):** dead = a < 11.75. Calibrated leave-one-heart-out on the time-control hearts against Ref-YHS.
- **Liberal:** a < 18.66, the label-free valley of a 2-component GMM on pooled a\* from all slices. It gives the top of the range.
- No model file; the two cut-offs and how they were derived are stored in `models/a_cut/a_cut.json`.
- **Re-calibration on the shared front end (Phase 0):**
  - The cuts were set on the old front end: `ttc/segment.py` white balance + GrabCut outline + lumen exclusion.
  - The notebook's lighting correction scales colour differently, so a\* values shift.
  - Phase 0 re-derives both cuts on the shared front end with the same recipe (leave-one-heart-out on the time-control hearts vs YHS; GMM valley).
  - If the re-calibrated method is more than 2.9 pp from YHS (the old 2.4 + 0.5), Method B keeps its original front end and still uses the shared hole file.

### 2g. Numbers per slice and per heart
| | Method A | Method B |
|---|---|---|
| Slice infarct % | dead px ÷ tissue px (p ≥ 0.5) | dead px ÷ tissue px (a < 11.75) |
| Unsure / borderline tissue | 0.35 < p < 0.65; > 15% flags the slice | 11.75 ≤ a < 18.66 |
| Range low end | p ≥ 0.65, uncertain holes counted as holes ◇ | a < 11.75, uncertain holes counted as holes |
| Range high end | p ≥ 0.35, uncertain holes counted as tissue ◇ | a < 18.66, uncertain holes counted as tissue |

- Dead mass = % × slice weight. Heart % = slice percentages weighted by slice weight (by tissue area if weights are missing, with a flag).
- **Headline method:** chosen in Settings (default: Method A ◇). The other method is always shown beside it.
- **"Methods disagree" flag** ◇: raised when A and B differ by more than 10 pp on a heart. It needs no human input and shows where to look first.
- QC: area vs weight, implied thickness, edge contact, unsure share, holes removed, non-TIFF input, shadow warning ◆.

### 2h. Evidence and known limits

| Check | Method A (K-Means + RF, notebook) | Method B (a\* cut, `evaluate_final.py`) |
|---|---|---|
| Time-control slices vs Ref-YHS (11 slices, hearts 109/119/129), MAE | 21.8 pp, always higher | **2.4 pp** (leave-one-heart-out; its cut was tuned on these hearts) |
| Infarct % of the 4 time-control hearts (expected ≈ 0–5) | 6.9–33.8 | 0.9–4.8 |
| Dead-area overlap with Ref-1 (Dice) | **0.912** (ROC AUC 0.963) | not measured |
| Heart infarct % vs Ref-1 / vs Ref-0, MAE | 3.7 pp / 7.6 pp | not measured |
| High-infarct hearts 206–210 vs Ref-1 | close (80.5 vs 79.5 … 52.8 vs 56.1) | not measured |
| Outline area vs slice weight, mean within-heart r | not reported | 0.95 (old outline) |
| Rotate + flip + 8% darker | not tested | 0.4 pp shift |
| Mild shadow (75% light) on the tissue | 41.8% of the dead tissue under it reads as alive | not tested |
| Time per slice | about 1 s, CPU only | under 1 s for the a\* step |

**Known limits. These must appear on the About-the-method page:**
1. **Method A reads the time-control hearts high:** 22.5, 6.9, 24.2 and 33.8%, against YHS 1.5, 3.0 and 4.4% for 109, 119 and 129. It was chosen for agreeing with Ref-1, which itself reads these hearts at 8.7–26.7%.
2. **Method B's good YHS score is partly by design** (cut tuned on those hearts). The notebook's a\* threshold chosen automatically (Otsu) is 15.7 pp from YHS. The conservative cut may miss pale-pink infarct; the liberal cut over-calls the pale rim by about 8 pp on time controls.
3. **Pale rim (Method A):** the outermost band reads about 15 points more dead than the interior (Ref-1 itself shows about 12).
4. **Shadows (Method A):** see the table. Method B has not been shadow-tested yet.
5. **The two methods were scored against different references.** Phase 0 puts both through the same scorecard (§8).
6. **No ground truth.** Ref-0 and Ref-1 come from the professor's grayscale rule; YHS covers only 3 hearts. Nothing checks missed infarct on the high-infarct hearts. Expert tracings (Ref-2) will decide between the methods.
7. **Small data.** 8 hearts from 2 photo batches; the hole model learned from 10 holes.

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
| 8 | How TTC staining works | Living cells' enzymes turn colourless TTC into red formazan; dead cells cannot, so they stay pale. Protocol: excise → slice → stain → fix → scan | Heart sliced apex → base; TTC reaches the tissue (§3c); live tissue turns red |
| 9 | Traditional methods | Manual tracing in ImageJ, grayscale cut-offs, histology; in patients, cardiac MRI, SPECT, troponin. Slow, subjective, people disagree | Side by side: a slice traced by hand vs a cut-off |
| 10 | How our app does it | Lighting correction, tissue mask, holes, colour in Lab, the two ways of deciding dead vs alive (random forest and a\* cut), why a range, validation and limits | A real study slice runs through the pipeline step by step, each step drawn on the slice |
| 11 | Good research practice | Blinding, reproducibility, the 3Rs (consistent measurement can mean fewer animals) | — |
| 12 | Bonus for CS students | Pixels, DPI, colour spaces, morphology, connected components, random forests | Interactive image-processing demos |

- **Tracks:** *No biology* (all modules, simplest wording), *Student* (skips basics with a placement quiz), *Researcher* (modules 7–11).
- **v1 scope:** modules 1, 3, 5, 8 and 10. The others follow (§11).
- **Species note:** the 3D model is a generic mammalian (human-based) heart. Lessons say that the lab uses guinea pig hearts, which share the four-chamber layout.

### 3b. Lesson format and the "see what we are talking about" link
- Lessons are Markdown files with small directives. Biology collaborators can write and review them without touching code. One folder per language.

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
- **Model source** (decision in §13):
  - **Z-Anatomy:** CC BY-SA 4.0, built on BodyParts3D, which is CC BY-SA 2.1 Japan.
  - **NIH 3D:** some heart models are public domain; licences vary per model.
  - **A paid royalty-free model.**
  - Whatever we use must have the structures as **separate, named meshes**, or be split in Blender: LA, RA, LV, RV, septum, four valves, aorta, pulmonary trunk, venae cavae, pulmonary veins, LAD, LCx, RCA, and endo- and epicardial layers.
  - With a CC BY-SA model, our modified model must be shared under the same licence, and attribution goes on the About page.
- **Pipeline:** Blender (clean-up, splitting, morph targets, territory masks) → glTF/GLB with Draco compression, bundled with the app so Learn works offline.
- **Rendering:** Three.js through React Three Fiber (+ drei helpers), in the browser now and in the Electron window later. Flow particles in a custom shader.
- **Labels** come from translation strings, never baked into textures, so they translate (§4).
- **Performance:** target 60 fps, minimum 30 fps on a laptop with integrated graphics. Use lower-detail meshes on weak GPUs. If WebGL is not available, fall back to pre-rendered video and 2D diagrams.
- **Accessibility:** every 3D step also has a text description and a 2D image.
- **Accuracy:** a GVSU faculty member (or a cardiology/physiology teacher) reviews every module and animation before release. Sources are cited per lesson.

---

## 4. Languages

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
| Data policy | Agree with GVSU what lab data may leave the lab computer, and in which storage region, **before** sync is turned on for lab workspaces. |

---

## 6. Architecture

```
┌──────── Browser now, Electron window later · web/: React + TypeScript (Vite, pnpm) ────────┐
│ Analyze: import · library · reports · export (CSV, ZIP; PDF from a print stylesheet)       │
│ Learn: lesson player · quizzes · glossary · 3D heart (Three.js / React Three Fiber, GLB)    │
│ About & Help · walkthrough · settings · i18next          lessons: content/<lang>/*.md      │
└───────────────┬────────────────────────────────────────────────────────────────────────────┘
                │ HTTP on 127.0.0.1, OpenAPI contract: analyses, jobs + progress, results JSON, layer PNGs
┌───────────────▼────────────────────────────────────────────────────────────────────────────┐
│ engine/: Python 3.14.4 (uv)                                                                 │
│   cardia_api/ = FastAPI: job queue (worker pool, progress, cancel) · library (SQLite +      │
│                 files in the app data folder) · watch folder · export · sync ──► Supabase   │
│   ttc_pipeline/ = shared: lighting · tissue mask · holes (hole_model file) · QC            │
│     method_a/ = notebook features + RF predict   method_b/ = smoothed a* + cuts           │
│   models/ = kmeans_rf/*.joblib · holes/hole_model.joblib · a_cut/a_cut.json · manifest.json │
└────────────────────────────────────────────────────────────────────────────────────────────┘
Desktop phase: Electron loads the same web/ build and starts the same engine (PyInstaller) as a sidecar.
```

- **Why web first:** there is no Windows machine yet, and a local web app needs no installers, signing or OS-specific setup. The UI talks to the engine over HTTP from day one, so the desktop step changes packaging, not code.
- **Local only:** the engine server binds to 127.0.0.1, accepts requests only from the Cardia UI's origin, and requires a token created at each launch. Other web pages on the same computer therefore cannot reach it, and scans never leave the machine. A hosted online version would upload lab scans to a server. That needs the GVSU data agreement (§5) and is not planned.
- **Why no C++ port:** Python runs locally (and ships inside the desktop app later), so the engine is the validated code itself. This removes the old 3-week port and its drift risk.
- **Model files:** everything the engine loads lives in `models/` and is listed in `models/manifest.json` (file, version, SHA-256, scikit-learn version). The engine refuses to run if a hash does not match. Reports quote the manifest.
- **Pin everything:** the notebook ran on Python 3.14.4, NumPy 2.5.5 and OpenCV 5.1.0. These are pinned in `engine/uv.lock`, along with the exact scikit-learn version the models were saved with (joblib files only load reliably with that version). ◇ *Later:* export the forest to ONNX to drop the scikit-learn runtime.
- **Jobs:** slices run in a worker pool in the engine, with progress and cancel; the UI never blocks.
- **PDF:** the report page has a print stylesheet. The web app saves it through the browser's "Save as PDF", and the desktop app uses Electron's `printToPDF` on the same page.
- **Packaging (desktop phase):** Windows installer (signed), macOS app (signed and notarised, Apple Silicon + Intel), optional Linux AppImage. Auto-update with `electron-updater`. Python + OpenCV + scikit-learn is large, so measure the app size then.
- **The research repo's `webapp/`** stays as a research and demo tool. It is not the product.

---

## 7. Keeping the app identical to the reference code

- **Golden set:** the 30 study slices → `tests/golden/per_slice.csv` plus masks (tissue, holes removed, Method A dead, Method B dead and borderline). Method A comes from the notebook and Method B from `ttc/` (after its Phase 0 re-calibration). It includes both methods' infarct % and ranges, unsure %, holes removed % and QC flags.
- **Release gate:** on the reference OS, the engine matches exactly (same code, same models). Across operating systems, every slice must be within **0.1 pp** with **IoU ≥ 0.99** on every mask, and the QC flags must be identical. CI runs this on macOS and Linux for every change, and adds Windows in the desktop phase.
- Any intended change bumps the pipeline version, regenerates the golden set from the notebook first, and is listed in "What's new".
- **Determinism:** the flat-field sampling (seed 0), K-Means (seed 42) and the forest (random_state 42) are seeded, Method B is a fixed rule, and inference uses only the frozen files in `models/`. The same file twice must give bit-identical results.

---

## 8. Phase 0: lock both methods and score them the same way (gate, before app code)

Pass rules marked ◇ are proposals; the team fixes them **before running**.

| Task | Pass rule |
|---|---|
| Move notebook Parts D, E, G, L, O and `ttc/pipeline.py` + `ttc/infarct.py` into `ttc_pipeline/` | Method A reproduces the notebook's 30 per-slice numbers exactly; Method B on its original front end reproduces `measure.py` exactly |
| **Hole file:** move the 10 hand-marked outlines to `annotations/holes/hand_marked_holes.json`; score the repo and notebook versions of our hole scorer on the same labels with the same matching rules; write `train_hole_model.py`; save `models/holes/hole_model.joblib` + `.json` | The version with more holes found wins, provided false holes ≤ 3 ◇ and no slice loses > 1% of its tissue wrongly; a tie goes to fewer false holes |
| **Method B on the shared front end:** re-derive the 11.75 / 18.66 cuts with the same recipe (leave-one-heart-out on time-control hearts vs YHS; GMM valley) | Time-control slices vs YHS ≤ 2.9 pp; otherwise Method B keeps its original front end (§2f) |
| **One scorecard for both:** add Method B to the notebook's comparison (Parts J–M) next to Method A | Both methods get every check: Ref-0, Ref-1, Ref-YHS, Dice, heart and slice MAE, rim, shadow test, rotate + flip + darker, area vs weight. Results go into the README table |
| Same file twice | Bit-identical |
| Robustness: rotate + flip + 8% darker | Shift ≤ 1.0 pp ◇ |
| **Method A on time-control hearts** (limit 1): try the rim fix and a probability cut calibrated on the time-control hearts (leave-one-heart-out) | Heart MAE vs YHS ≤ 5 pp ◇ (now about 18.7), while Dice vs Ref-1 drops by < 0.01. If nothing passes, Method A ships as is, with the limit stated |
| **Shadow steadiness** (limit 4), for both methods: shade-trained and shade-proof variants, or a shadow detector | Mild-shadow flip < 5% without losing > 0.01 Dice; otherwise ship the shadow warning |
| Range definitions (§2g), for both methods | The range contains Ref-YHS on the time-control hearts and is ≤ 10 pp wide on ≥ 80% of slices ◇ |
| "Methods disagree" threshold (§2g) | Set from the A–B differences on the 30 study slices ◇ |
| Outline area vs slice weight, mean within-heart r | ≥ 0.95 ◇ (same bar as before) |
| Golden set and README table | Written, with every threshold change and its reason |

**In parallel (one-time, training only, allowed by D6):**
- label more hole candidates, aiming for several hundred, add them to `hand_marked_holes.json`, and retrain the hole file;
- ask GVSU for expert ImageJ tracings of 1–2 slices per heart. These become **Ref-2**: the first real accuracy check and **the main input for choosing between Method A and Method B** (§13).

---

## 9. Screens

1. **Home / Library:** recent hearts, search and filters, sync status, a "New analysis" button, and a switch between **Analyze** and **Learn**.
2. **Import:** drop zone, watch-folder setting, a list of detected hearts and slices with auto-filled IDs and weights (editable only where missing), input-check warnings.
3. **Processing:** per-slice progress, running in the background.
4. **Heart report:** headline %, range, mass, confidence, **Method A vs B panel**, apex → base strip, context, quality summary, Methods paragraph, export.
5. **Slice report:** layer viewer (both methods' dead maps, the probability map, an A vs B slider), composition per method, one-line summary, confidence reasons.
6. **Export:** PDF / CSV / ZIP.
7. **Learn home:** course map, tracks, progress, badges, continue button.
8. **Lesson player:** 3D viewport beside the lesson text, step navigation, inline quizzes.
9. **Glossary.**
10. **About & Help:** walkthrough, flag explanations, FAQ, what's new, how to cite, licences.
11. **Settings:** language (app and report), units, theme, **headline method (A or B)**, method info, backup / restore.
12. **Account & workspaces:** sign in, workspaces and members, devices, sync settings (images on/off).

---

## 10. Testing

| Layer | Test |
|---|---|
| Method (Python) | Phase 0 checks (§8); golden set generation |
| Engine package | pytest per step against the notebook's and `ttc/` intermediate masks; both methods' golden parity on macOS + Linux, Windows in the desktop phase (§7); the engine refuses a model file whose hash is wrong; robustness; API contract tests (OpenAPI schema, local-only access) |
| App | Vitest + React Testing Library (filename parser, report formatting, library queries); Playwright in the browser (later Electron): import demo heart → report → toggle layers → export PDF; open lesson → 3D step → quiz |
| Sync | Offline edits then reconnect; the same heart edited on two computers; delete and restore; interrupted large upload resumes; workspace permissions (a viewer cannot edit) |
| 3D | Frame rate on an integrated-GPU laptop; no-WebGL fallback; every lesson's scene states load; reduced motion |
| Languages | Pseudo-localisation, RTL screenshots, string overflow, CSV decimal check in every locale |
| Content | Expert review sign-off per module; quiz answers checked |
| Devices | Web phase: Apple Silicon Mac, an older Intel Mac, Chrome + Safari + Firefox; airplane mode end to end. Desktop phase adds a Windows 10/11 laptop with integrated graphics |

---

## 11. Milestones

| # | Milestone | Output | Owner | Est. |
|---|---|---|---|---|
| 0 | Phase 0 gate for both methods (+ hole labelling, tracings request) | `ttc_pipeline/` with Methods A and B, `models/` (hole file, RF, a\* cuts, manifest), one scorecard, golden set, README table | Prince (shared steps, holes, B, scorecard) + Melove (A, golden set) | 2–2.5 wk |
| 1 | Engine API | Local FastAPI server: jobs with progress, results JSON + layer PNGs, local-only access; **OpenAPI contract published in week 1** so the web app can be built on mock data; golden parity in CI (macOS + Linux) | Prince | 1 wk |
| 2 | Web shell | Screens 1, 2, 3, 11; library (SQLite in the engine); watch folder; speed measured | Krrish | 2 wk |
| 3 | Reports and export | Screens 4, 5, 6; PDF, CSV, ZIP; backup / restore | Krrish (screens) + Melove (export, Methods paragraph) | 1.5 wk |
| 4 | Cloud sync | Screen 12; accounts, workspaces, sync engine, image opt-in | Prince | 2 wk |
| 5 | Learn engine | Screens 7, 8, 9; lesson format, quizzes, progress | Melove | 1.5 wk |
| 6 | 3D heart | Model prepared and split, scene-state sync, heartbeat, flow, coronaries, occlusion, slicing, TTC animations | Krrish | 3 wk |
| 7 | Learn content v1 | Modules 1, 3, 5, 8, 10 written, reviewed, quizzes (in parallel with 5–6) | Melove leads, all write | 2 wk |
| 8 | Languages wave 1 | i18n framework, English + Hindi, RTL support ready | Krrish | 1 wk |
| 9 | Polish | Walkthrough, About & Help, dark mode, accessibility | Krrish + Prince | 1 wk |
| 10 | Pilot (web app) | 2–3 lab users + 5–10 student learners | all | 1 wk |
| 11 | Desktop | Electron wrapper around the same UI and engine; PyInstaller engine for Windows + macOS; Windows parity in CI; signing; auto-update | Prince | 1.5–2 wk, once a Windows machine is available |
| later | Remaining modules and languages, study dashboard, ◆ analyses, re-analyse diff, scanner acquisition, 3D stack view, ONNX engine | | | |

About 18–20 weeks if done one after another, but three people working in parallel need much less. Milestones 2, 5, 6 and 7 do not depend on Phase 0 and can start now. Ownership and workflow: [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 12. Risks

- **Method A reads time-control hearts high** (§2h, limit 1). Method B is shown beside it, and the "methods disagree" flag marks these hearts.
- **Two numbers can confuse users.** Clear labels ("Method A: K-Means + RF", "Method B: a\* cut"), one headline method, and the Learn module 10 explanation. Once the team chooses, the other method moves to a hidden "compare" setting or is removed.
- **Shadows flip verdicts** (limit 4, Method A; Method B untested). Scanner input helps but does not remove fold shadows. Mitigations: Phase 0 variants, the shadow warning, the scanning guide.
- **Model files and library versions.** joblib models break across scikit-learn versions. Pin, hash and test them in CI.
- **References are not ground truth; small data.** Never report "accuracy vs GVSU". Get expert tracings (Ref-2) and spot-check new batches.
- **Hole model learned from 10 holes.** It finds 5–6 of 10 held out, depending on the version. Both methods depend on it. Mitigations: more labels, the range, and scanning on a blue/green background.
- **3D content accuracy and licences.** Expert review per module; check every asset's licence; ShareAlike obligations for CC BY-SA models.
- **3D performance on weak laptops.** Lower-detail meshes and a video/2D fallback.
- **Translation quality of medical text.** Native-speaker review; English term kept in brackets.
- **Cloud privacy and cost.** Unpublished lab data: the GVSU agreement first, images opt-in, row-level security. Image storage grows over time; watch usage.
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
7. **Languages in wave 1** beyond English and Hindi.
8. **3D model source:** Z-Anatomy (CC BY-SA), NIH 3D (licence per model), or a paid model?
9. **Which method to move forward with, A or B, and how to decide.** Proposed rule ◇: when Ref-2 tracings arrive, pick the method with the better Dice and heart MAE against Ref-2, with the YHS time-control check as a tie-breaker. Until then both run.
10. **Default headline method** while both run: A (current default ◇) or B?
11. **Which ◇ proposals to accept** (§1k, §1f, §3e, §4 rollout, §8 pass rules).
12. **Public repo and derived files:** `cardia` is public. May the frozen models and golden masks (derived from GVSU scans) be committed, or does the repo become private? Until decided they are shared through the team Drive (CONTRIBUTING.md).
