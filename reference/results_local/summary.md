## Recommended method: **K-Means + RF**

**What it does, in plain words.** It first evens out the lighting of the photo and finds the heart tissue. It then sorts a sample of pixel colours from all hearts into three groups (red, pink and cream) with K-Means, and keeps only the clearly red and clearly cream pixels as worked examples. A random forest — 150 small decision trees that vote — learns from those examples which combinations of colour, neighbourhood colour, texture and position mean *dead* or *alive*, and then labels every pixel of a new photo. No one has to click, draw or choose a threshold.

### How well it performs

* **Pixels labelled like the reference (accuracy):** 91.0%, i.e. about 91 out of every 100 tissue pixels.
* **When it says *dead*, it agrees with the reference (precision):** 89.7% of the time.
* **Of the pixels the reference calls dead, it finds (recall):** 92.9%.
* **Overlap of the dead areas (Dice):** 0.912, where 1 means identical outlines.
* **Ranking quality (ROC AUC):** 0.963, on a scale where 0.5 is a coin toss and 1 is perfect.
* **Training vs testing accuracy:** 89.6% on the hearts it learned from and 90.3% on hearts it never saw (gap -0.7 points): no sign of overfitting.
* **The number the lab needs (heart infarct %):** on average 3.7 points from Ref-1 and 7.6 points from the professor's own values; it reads 2.5 points higher than Ref-1 on average; 18.7 points from the second lab file (Ref-YHS) on the hearts that have it.
* **Under a soft shadow:** at 75% light 41.8% of its dead tissue reads as alive and 0.0% of its alive tissue as dead (not steady, Step 52).
* All of these come from hearts the model had **never seen** while training.

### How much better it is than the alternatives

* **Against the professor's grayscale rule:** overall, the heart infarct % error drops from 14.9 to 3.7 points (75% smaller) and the overlap of the dead areas rises from Dice 0.785 to 0.912.
    * **Where the gain comes from:** on the high-infarct hearts (batch A: 206, 207, 208, 210), her rule counts paper, grid lines and shadows and misses very pale dead tissue; the average slice error falls from 25.4 to 5.6 points.
    * **Where it does not:** on the low-infarct hearts (batch B: 108, 109, 119, 129), her rule is closer than the recommended method (4.6 vs 10.2 points). This is partly built in — Ref-1 uses her own cut-off — and the recommended method reads 6.2 points higher there. The second lab file (Ref-YHS, next point) is the only independent check on these hearts.
    * **How certain:** over the 30 slices the smaller error is statistically significant (Wilcoxon p = 0.006); resampling whole hearts, the result is not yet conclusive with only 8 hearts.
* **Against the second lab file (Ref-YHS, hearts 109, 119, 129):** the recommended method is on average 18.7 points from it and reads 18.7 points higher; the professor's grayscale rule is 9.9 points off. The closest method here is DBSCAN only (5.1 points). These hearts have small infarcts, so a method that calls pale-pink tissue dead reads them too high; this file covers only these hearts, so it is a check, not the deciding score.
* **Against K-Means clustering alone (no random forest):** Dice +0.032 and heart % error 0.6 points larger; statistical test on the outlines: recommended is better.
* **Against GMM + RF:** Dice +0.010 and heart % error 1.1 points smaller; statistical test on the outlines: recommended is better.
* **Against DBSCAN + RF:** Dice +0.170 and heart % error 12.1 points smaller; statistical test on the outlines: recommended is better.
* **Against Tuned DBSCAN + RF:** Dice +0.048 and heart % error 1.2 points smaller; statistical test on the outlines: recommended is better.
* **Against Stain line:** Dice +0.074 and heart % error 4.7 points smaller; statistical test on the outlines: not tested.
* **Against Stain line + RF:** Dice +0.102 and heart % error 3.1 points smaller; statistical test on the outlines: recommended is better.
* **Against Stain line + RF (shade-proof):** Dice +0.075 and heart % error 4.1 points smaller; statistical test on the outlines: not tested.
* **Against K-Means + RF (shade-proof):** Dice +0.114 and heart % error 2.8 points smaller; statistical test on the outlines: recommended is better.
* **Against K-Means + RF (shade-trained):** Dice +0.024 and heart % error 4.2 points smaller; statistical test on the outlines: recommended is better.
* **Against K-Means + RF + rim fix:** Dice +0.002 and the same heart % error; statistical test on the outlines: too small to matter.
* **Against DBSCAN + RF (grid + random search):** Dice +0.127 and heart % error 8.2 points smaller; statistical test on the outlines: recommended is better.
* **Against the same method plus AI (DINOv3 and/or SAM 2):** adding the AI changes the overlap by -0.004 to -0.000 Dice, below the 0.01 that would matter in practice, while needing a GPU and two large AI models.
* **An honest caveat:** K-Means only comes closer to Ref-1 on the heart % alone (by up to 0.6 points), without a better outline. A heart % can come out close even when the outline is wrong, because over-counted and under-counted areas cancel out; the outline overlap (Dice) is the stricter test, so it decides the recommendation.

| alternative | its Dice | recommended's Dice advantage | its heart error (points) | recommended's heart-error reduction (points) | statistical test (by heart) | in plain words |
|---|---|---|---|---|---|---|
| Professor rule (as given) | 0.785 | +0.128 | 14.9 | +11.2 | no detectable effect | better outline, closer heart % |
| Colour threshold (Otsu on a*) | 0.777 | +0.136 | 5.6 | +1.9 | recommended is better | better outline, closer heart % |
| K-Means only | 0.881 | +0.032 | 3.1 | -0.6 | recommended is better | better outline, similar heart % |
| GMM + RF | 0.903 | +0.010 | 4.8 | +1.1 | recommended is better | same outline, closer heart % |
| DBSCAN + RF | 0.742 | +0.170 | 15.8 | +12.1 | recommended is better | better outline, closer heart % |
| Tuned DBSCAN + RF | 0.864 | +0.048 | 4.9 | +1.2 | recommended is better | better outline, closer heart % |
| Stain line | 0.839 | +0.074 | 8.4 | +4.7 | not tested | better outline, closer heart % |
| Stain line + RF | 0.810 | +0.102 | 6.8 | +3.1 | recommended is better | better outline, closer heart % |
| Stain line + RF (shade-proof) | 0.838 | +0.075 | 7.9 | +4.1 | not tested | better outline, closer heart % |
| K-Means + RF (shade-proof) | 0.799 | +0.114 | 6.5 | +2.8 | recommended is better | better outline, closer heart % |
| K-Means + RF (shade-trained) | 0.889 | +0.024 | 7.9 | +4.2 | recommended is better | better outline, closer heart % |
| K-Means + RF + rim fix | 0.911 | +0.002 | 3.7 | -0.0 | too small to matter | same outline, similar heart % |
| DBSCAN + RF (grid + random search) | 0.786 | +0.127 | 11.9 | +8.2 | recommended is better | better outline, closer heart % |
| K-Means + RF + DINOv3 | 0.908 | +0.004 | 3.6 | -0.2 | too small to matter | same outline, similar heart % |
| K-Means + RF + SAM | 0.912 | +0.001 | 3.7 | -0.1 | no detectable effect | same outline, similar heart % |
| K-Means + RF + DINOv3 + SAM | 0.912 | +0.000 | 3.5 | -0.2 | no detectable effect | same outline, similar heart % |

*Statistical test* = the Step 64 check on the outline overlap, resampling whole hearts. *No detectable effect* means its 95% range still includes zero: with only 8 hearts, even a large average difference can be uncertain when a method works well on some hearts and badly on others.

### Why the lab should use it

1. **Accurate:** tied for the best outline overlap of all methods tested, measured on hearts it never saw.
1. **Not overfitted:** its testing accuracy (90.3%) is as good as its training accuracy (89.6%), so it learned general rules rather than memorising the 8 hearts.
1. **Fixes where the current method fails:** on the high-infarct hearts (batch A: 206, 207, 208, 210) its slice error is 4.5× smaller than the professor's grayscale rule (5.6 vs 25.4 points), because it ignores grid lines, shadows and paper and keeps very pale dead tissue.
1. **Simple to run:** no AI models and no GPU; the AI add-ons did not make it more accurate.
1. **Fully automatic and fast:** a new photo takes about 1 s on an ordinary computer, with no clicking, tracing or thresholds to choose.
1. **Robust to photo conditions:** the lighting correction and the colour-based tissue mask remove the effect of exposure, paper tint, grid lines and the shadow beside the slice. A soft shadow *on* the tissue is still a limitation: under a mild one, 42% of the dead tissue in it reads as alive (Step 52), so photos should be taken with even light.
1. **Explainable:** it relies mostly on Lab L* (lightness) (67% of its decisions), because living red tissue is darker than pale cream dead tissue — the same difference a person sees in the photo.

### What it cannot claim yet

* These scores measure **agreement** with Ref-1 and with the professor's values, not true accuracy: no expert has traced the dead tissue yet.
* The training examples come from colour, so the AI models had nothing new to learn; they need hand-traced examples for a fair test.
* Real holes are found by a small model trained on only 10 hand-marked holes (Step 22): held-out, it finds 5 of them and wrongly removes 4 creases (the largest area removed from any slice is 1.7% of it).
* On the low-infarct hearts (batch B: 108, 109, 119, 129) it reads 6.2 points higher than Ref-1 on average; hand tracing will show whether it or the grayscale cut-off is closer to the truth there.
* 8 hearts from two photo batches is a small sample; new batches should be spot-checked.
