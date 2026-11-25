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

## 5b. Method B: DBSCAN + random forest

[Method B](term:method-b) works exactly like Method A when it runs: the same 22 numbers per pixel go into a random forest, which gives a probability that the pixel is dead. Dead and unsure mean the same as for Method A.

Only the forest's teacher is different. Instead of K-Means, **[DBSCAN](term:dbscan)** sorted the pixels for training. K-Means always makes the number of groups it is asked for; DBSCAN looks for dense crowds of similar colours and leaves the stragglers out. The palest crowd taught the forest "dead", the reddest "alive".

DBSCAN needs a few settings, such as how close two colours must be to count as neighbours. They were chosen by trying many combinations and keeping the one whose groups matched a simple grey-level reference best on the study hearts. Like Method A's, the forest was trained once and never learns from your scans.

Because Methods A and B read the same numbers and differ only in their teacher, Cardia shows them **side by side** to compare.

:::quiz{type="multiple-choice" id="m10-teacher"}
What is the difference between Method A and Method B?
- [ ] Method B reads different numbers from each pixel
- [x] The same forest recipe, taught by different clustering: K-Means for A, DBSCAN for B
- [ ] Method B learns from your scans while you use it
> Both forests read the same 22 numbers per pixel. Only the clustering that labelled their training pixels differs.
:::

## 5c. Method C: the stain ratio, no machine learning

[Method C](term:method-c) learns nothing from the photos. It asks one question of every pixel: **does it hold less than half the red stain of living muscle?**

The red stain absorbs green light and lets red light through. So Method C compares how much green and how much red comes back from each pixel: the more stain, the less green. A shadow dims every colour alike, so it leaves that comparison, and Method C's answer, unchanged.

Two reference colours were taken once from the study scans: fully stained muscle and unstained tissue. A pixel holding less than half the stain, and leaning towards the cream of unstained tissue, counts as dead. Pixels holding between 40% and 60% of the stain are [borderline](term:borderline-tissue): not clearly dead, not clearly alive.

Method C's [range](term:range) runs from the same rule at 40% of the stain to the rule at 60%. Because it is a fixed colour rule rather than a trained model, Cardia shows it apart from the two machine-learning methods.

::scene{camera="ttc" highlight="infarct"}

## Why three numbers?

The three methods draw the line between dead and alive in different places. Method A learned it from the colour groups K-Means found, Method B from the groups DBSCAN found; Method C puts it at half the stain of living muscle. On the same heart they can differ by tens of [percentage points](term:percentage-points), most where there is a lot of pale pink tissue.

Nobody knows yet which is closer to the truth: that needs careful tracings by experts, which the team has asked for. Until then Cardia shows **all three**: Methods A and B side by side, Method C apart, leading with the one chosen in Settings (Method A unless you change it), and shows Method C's range.

> Known limits. Methods A and B read the control hearts higher than Method C and the references do, and shadows on the slice can change their answers, so Cardia warns about shadows. DBSCAN's settings were chosen to match a simple grey-level reference, so Method B leans towards that reference's view. Method C counts pale tissue that is not muscle (valves, fat) as dead, so it reads control hearts a few points high.

:::quiz{type="multiple-choice" id="m10-two"}
Why does Cardia show three results for every heart?
- [ ] One for each chamber of the heart
- [x] The methods can disagree, and until experts' tracings show which is closer, all three are shown
- [ ] One is a quick estimate and the others are the final answer
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
