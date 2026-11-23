---
module: 10
title: How our app does it
summary: Every step of Cardia's analysis, its two methods, and its limits.
minutes: 15
tracks: [no-biology, student, researcher]
sources:
  - "Cardia project plan (PLAN.md in the Cardia repository), section 2: the analysis pipeline, the Phase 0 scorecard and the known limits."
  - "CIE 015:2018. Colorimetry, 4th edition. Commission Internationale de l'Eclairage, Vienna, 2018."
  - "Breiman L. Random forests. Machine Learning. 2001;45(1):5–32."
  - "MacQueen J. Some methods for classification and analysis of multivariate observations. Proceedings of the 5th Berkeley Symposium on Mathematical Statistics and Probability. 1967;1:281–297."
reviewed_by: ""
---

::scene{camera="ttc" highlight="infarct"}

## From scans to a number

Cardia takes the scans of a heart's TTC-stained slices and works out how much of each slice, and of the whole heart, is dead. Nobody traces anything and nobody has to confirm the result: the same scan always gives the same number.

Every slice goes through the same steps:

1. read the scan;
2. even out the lighting;
3. find the tissue;
4. find the holes;
5. decide, pixel by pixel, what is dead and what is alive, in two different ways;
6. add the slices up into the whole heart.

:::quiz{type="true-false" answer="false" id="m10-trace"}
Cardia asks you to trace the dead area on each slice before it calculates.
> Cardia is fully automatic. Where it is unsure, it flags the slice and widens the reported range instead of asking.
:::

::scene{camera="ttc" labels="none"}

## 1. Reading the scan

The lab scans its slices as **[TIFF](term:tiff)** files, which keep every pixel exactly as the scanner saw it. PNG and JPG work too, but they are marked as unvalidated, because every setting in Cardia was chosen on TIFF scans.

A file name like `206IS89mg.tif` tells Cardia the heart (206) and the [slice weight](term:slice-weight) (89 mg). The scan's [DPI](term:dpi) turns pixel counts into areas in mm².

## 2. Evening out the lighting

A scanner or lamp never lights the page perfectly evenly: one corner is often a little darker. That could make healthy tissue in the dark corner look different from healthy tissue in the bright one.

So Cardia first finds the paper around the slice, fits a smooth surface to how bright the paper is across the page, and divides it out. Afterwards the paper is the same white everywhere. This is the [lighting correction](term:lighting-correction).

::scene{camera="ttc" highlight="myocardium,lv-cavity,rv-cavity" labels="auto"}

## 3. Finding the tissue

Paper is white or grey; stained tissue is colourful, either red or cream. Cardia measures how colourful each pixel is (its [chroma](term:chroma)) and keeps the colourful pixels as tissue. Then it removes specks of dust, cuts off any ruler touching the slice, and fills small gaps such as glare. The result is the [tissue mask](term:tissue-mask).

## 4. Finding the holes

The **[chamber](part:lv-cavity)** in the middle of a slice, and the **[right ventricle's chamber](part:rv-cavity)** beside it, are holes, not tissue. They must not count as dead or alive.

Dark patches inside the slice can be real holes or just shadows and creases. A small trained model, the hole scorer, decides. When it is unsure, the patch is kept as tissue, and the uncertainty widens the range.

> A known limit: the hole scorer learned from only 10 hand-marked holes. In testing it found 5 of 10 holes it had not seen and wrongly removed 2 creases. More marked holes will improve it.

::scene{camera="ttc" highlight="infarct,lv" labels="auto"}

## Colour as numbers

To compare colours, Cardia converts each pixel to **[Lab colour](term:lab-colour)**. Lab describes a colour with three numbers:

- **L\*** is lightness, from black to white;
- **[a\*](term:a-star)** goes from green to red;
- **b\*** goes from blue to yellow.

TTC-stained living muscle is strongly red, so its a\* is high. Pale dead muscle has a low a\*.

:::quiz{type="multiple-choice" id="m10-astar"}
What does a\* measure?
- [ ] How light or dark a pixel is
- [x] How red (or green) a pixel is
- [ ] How yellow (or blue) a pixel is
> a\* runs from green to red. Living, stained muscle has a high a\*; pale dead muscle a low one.
:::

## 5a. Method A: K-Means + random forest

[Method A](term:method-a) looks at 22 numbers for every tissue pixel: its colour, the average colour around it at four different sizes, how textured it is, how sharp the edges near it are, and how far it is from the edge of the slice.

A **[random forest](term:random-forest)**, many small decision trees that vote, turns those 22 numbers into a probability that the pixel is dead. At 0.5 or more, the pixel counts as dead. Pixels between 0.35 and 0.65 are [unsure](term:unsure-tissue); if more than 15% of a slice is unsure, Cardia flags it.

The forest was trained once, before the app was built, on pixels that **[K-Means](term:k-means)** had sorted into red, pink and cream groups. The app only uses the saved forest; it never learns from your scans.

## 5b. Method B: the a\* cut

[Method B](term:method-b) is simpler. It smooths the redness a\* and calls a pixel dead when a\* is below **11.75**. Pixels between 11.75 and 18.60 are [borderline](term:borderline-tissue): not clearly dead, not clearly alive.

Method B's [range](term:range) runs from "only the clearly dead pixels" to "the dead and the borderline pixels".

::scene{camera="ttc" highlight="infarct"}

## Why two numbers?

Before Cardia, the two methods were each checked against a different set of reference measurements made in the lab, and each agrees best with its own. On the same heart they can differ by 6 to 40 [percentage points](term:percentage-points).

Nobody knows yet which is closer to the truth: that needs careful tracings by experts, which the team has asked for. Until then Cardia shows **both methods side by side**, leading with the one chosen in Settings, and shows Method B's range.

> Known limits of Method A: it reads some hearts higher than Method B and the references do, and shadows on the slice can change its answer, so Cardia warns about shadows.

:::quiz{type="multiple-choice" id="m10-two"}
Why does Cardia show two results for every heart?
- [ ] One is for the left ventricle, the other for the right
- [x] The two methods can disagree, and until experts' tracings show which is closer, both are shown
- [ ] One is a quick estimate and the other the final answer
> Each method agrees best with a different set of reference measurements. Expert tracings will decide between them.
:::

::scene{camera="anterior" anim="slicing"}

## 6. The whole heart

A slice's infarct is its dead area divided by its tissue area. For the whole heart, Cardia combines the slices, weighting each one by its weight, so a heavy slice counts more than a light one. The [dead mass](term:dead-mass) is the dead percentage times the weight, added up.

If a slice weight is missing, Cardia weights the slices by tissue area instead, and says so in the report.

:::quiz{type="fill-blank" id="m10-weight"}
A heart's infarct percentage is the slices' percentages, each weighted by the slice's [[weight|mass|slice weight]].
:::

:::quiz{type="order-steps" id="m10-order"}
Put Cardia's steps in order.
1. Read the scan, the heart ID and the weight
2. Even out the lighting
3. Find the tissue
4. Find the holes
5. Decide dead or alive for every pixel
6. Combine the slices into the heart
:::

## What Cardia is, and isn't

Cardia is a research tool for measuring infarcts in TTC-stained guinea pig hearts. It does not diagnose anyone. Its numbers are only as good as the references it was checked against, and those were people's measurements, not ground truth. Every report records the exact versions and model files used, so a result can always be reproduced.
