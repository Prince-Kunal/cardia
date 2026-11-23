---
module: 12
title: Bonus for CS students
summary: Pixels, colour spaces, morphology and random forests, hands on.
minutes: 15
tracks: [student]
sources:
  - "Gonzalez RC, Woods RE. Digital Image Processing, 4th edition. Pearson, New York, 2018."
  - "CIE 015:2018. Colorimetry, 4th edition. Commission Internationale de l'Eclairage, Vienna, 2018."
  - "MacQueen J. Some methods for classification and analysis of multivariate observations. Proceedings of the 5th Berkeley Symposium on Mathematical Statistics and Probability. 1967;1:281–297."
  - "Breiman L. Random forests. Machine Learning. 2001;45(1):5–32."
  - "Dice LR. Measures of the amount of ecologic association between species. Ecology. 1945;26(3):297–302."
  - "Bland JM, Altman DG. Statistical methods for assessing agreement between two methods of clinical measurement. Lancet. 1986;1(8476):307–310."
reviewed_by: ""
---

::scene{camera="ttc" labels="none"}

## A slice is a grid of numbers

A scan is a grid of pixels, and each pixel is three numbers: how much red, green and blue light the scanner saw, from 0 to 255 in an 8-bit image. A slice scanned at 600 [dpi](term:dpi) has 600 pixels per inch, so each pixel is about 0.042 mm wide and covers about 0.0018 mm². Counting pixels times that area gives areas in mm².

Everything Cardia does is arithmetic on those grids. This module walks through the main ideas, so you can read the engine's code (`engine/ttc_pipeline/`) and know what each step is for.

:::quiz{type="fill-blank" id="m12-dpi"}
At 600 dpi, one inch of slice is [[600]] pixels wide.
:::

::scene{camera="ttc" highlight="infarct" labels="none"}

## Colour spaces

RGB is how a scanner sees, not how people judge colour. Living, stained muscle and pale, dead muscle differ mostly in **how red** they are, and in RGB that difference is spread across all three channels and mixed up with brightness.

**[CIE L\*a\*b\*](term:lab-colour)** separates them: L\* is lightness, [a\*](term:a-star) runs from green to red, b\* from blue to yellow. In Lab, "how red is this pixel?" is one number, a\*, nearly independent of how brightly the slice was lit. That is why Cardia's [Method B](term:method-b) is a cut on a\*, and why [Method A](term:method-a) uses Lab among its features.

:::quiz{type="multiple-choice" id="m12-lab"}
Why does Cardia convert pixels from RGB to Lab?
- [x] In Lab, redness is one number (a\*), largely separate from brightness
- [ ] Lab files are smaller
- [ ] Scanners only produce Lab
> TTC changes how red the muscle is. Lab puts redness on its own axis, a\*.
:::

::scene{camera="ttc" highlight="myocardium,lv-cavity" labels="auto"}

## Masks and morphology

A **mask** is a grid of true and false, one per pixel: "is this tissue?". Cardia builds the [tissue mask](term:tissue-mask) from how colourful each pixel is ([chroma](term:chroma)), then cleans it with **morphology**, operations that grow or shrink the true areas with a small round brush:

- **erosion** shrinks them, and removes specks smaller than the brush;
- **dilation** grows them, and closes gaps narrower than the brush;
- an **opening** (erode, then dilate) removes specks and keeps the big shapes;
- a **closing** (dilate, then erode) fills small gaps, such as glare, and keeps the outline;
- **filling holes** turns every enclosed false area true; Cardia must then cut the real holes, the **[chambers](part:lv-cavity)**, back out.

:::quiz{type="match" id="m12-morph"}
Match each operation with what it does to a mask.
- Erosion = Shrinks shapes; removes small specks
- Dilation = Grows shapes; closes narrow gaps
- Opening = Removes specks, keeps the big shapes
- Closing = Fills small gaps, keeps the outline
:::

::scene{camera="ttc" labels="none"}

## Clustering: K-Means

**[K-Means](term:k-means)** sorts points into k groups without being told the answers. Start with k guesses for the group centres. Then repeat: give each point to its nearest centre, and move each centre to the average of its points, until nothing changes.

On tissue pixels in Lab, with k = 3, the groups come out roughly as red (alive), pink (in between) and cream (dead). Cardia used this once, before the app was built, to label pixels for training.

:::quiz{type="order-steps" id="m12-kmeans"}
Put one run of K-Means in order.
1. Choose k starting centres
2. Give each point to its nearest centre
3. Move each centre to the average of its points
4. Repeat until no point changes group
:::

::scene{camera="ttc" highlight="infarct,myocardium" labels="auto"}

## A forest of decision trees

A **decision tree** asks a series of yes-or-no questions about a pixel ("is a\* below 15?", "is the area around it textured?") and ends at an answer. One deep tree learns its training pixels too well, noise included.

A **[random forest](term:random-forest)** grows many trees, each on a random sample of the training pixels and allowed only a random few features at each question, and lets them vote. The share of trees voting "dead" is the probability. Averaging many slightly different trees cancels much of their noise.

Method A's forest looks at 22 numbers per pixel: colour, colour averaged over neighbourhoods of four sizes, texture, edge strength and distance from the slice's edge.

:::quiz{type="true-false" answer="false" id="m12-forest"}
A random forest is one large decision tree trained on all the data.
> It is many trees, each trained on a random sample of the data and features, voting together.
:::

::scene{camera="ttc" highlight="infarct"}

## Checking against the truth

To know whether a method is right, compare it with expert tracings, pixel by pixel and number by number:

- the **Dice score** compares two masks: twice their overlap divided by their total size, from 0 (no overlap) to 1 (identical);
- a **Bland–Altman plot** compares two methods' numbers: for every heart it plots the difference against the average, showing any bias and how far apart the methods can be.

Correlation alone is not enough: two methods can correlate perfectly while one always reads 10 points higher. That is why Cardia's reports and tests compare its numbers with reference measurements directly.

:::quiz{type="fill-blank" id="m12-dice"}
Two identical masks have a Dice score of [[1|1.0|one]].
:::
