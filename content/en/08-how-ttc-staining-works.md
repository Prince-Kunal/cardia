---
module: 8
title: How TTC staining works
summary: Living cells turn TTC red; dead cells stay pale.
minutes: 10
tracks: [no-biology, student, researcher]
sources:
  - "Fishbein MC, Meerbaum S, Rit J, et al. Early phase acute myocardial infarct size quantification: validation of the triphenyl tetrazolium chloride tissue enzyme staining technique. Am Heart J. 1981;101(5):593–600."
  - "Lindsey ML, Bolli R, Canty JM Jr, et al. Guidelines for experimental models of myocardial ischemia and infarction. Am J Physiol Heart Circ Physiol. 2018;314(4):H812–H838."
  - "Bøtker HE, Hausenloy D, Andreadou I, et al. Practical guidelines for rigor and reproducibility in preclinical and clinical studies on cardioprotection. Basic Res Cardiol. 2018;113(5):39."
reviewed_by: ""
---

::scene{camera="short-axis" highlight="myocardium" labels="none"}

## Dead muscle looks alive

Heart muscle that died a few hours ago looks almost the same as living muscle to the eye. To measure an infarct, researchers need a way to make the difference obvious.

The most common way, used for decades, is a stain called **[TTC](term:ttc)**, short for 2,3,5-triphenyltetrazolium chloride.

::scene{camera="ttc" anim="ttc"}

## A stain only living cells can use

TTC is colourless. Living heart cells are full of enzymes called **[dehydrogenases](term:dehydrogenase)**. Together with their helper molecules, they hand electrons to TTC and turn it into **[formazan](term:formazan)**, a brick-red compound that stays inside the cell.

Dead cells have lost those enzymes and helpers: they leak out through the broken cell walls. In dead muscle TTC stays colourless, so the muscle stays pale, cream or white.

So in a stained slice: **red means alive, pale means dead.**

:::quiz{type="fill-blank" id="m8-formazan"}
Living cells turn colourless TTC into red [[formazan]].
:::

:::quiz{type="true-false" answer="false" id="m8-dead-red"}
TTC stains dead muscle red.
> It is the other way round: living muscle turns red, and dead muscle stays pale.
:::

## Timing matters

Dead cells lose their enzymes gradually. Muscle that died only a short time before staining may still hold enough enzyme to turn red, so the infarct would look smaller than it is. That is why protocols wait, usually at least a couple of hours after blood flow is restored, before the heart is stained.

::scene{camera="anterior" anim="slicing"}

## From heart to slices

A typical protocol:

1. The heart is removed and rinsed.
2. It is chilled or briefly frozen, so it is firm enough to cut cleanly.
3. It is cut across into thin slices, about 1 to 2 mm thick, from the [apex](term:apex) to the [base](term:base). These are [short-axis](term:short-axis) slices: each shows the left ventricle as a ring.

::scene{camera="ttc" anim="ttc"}

4. The slices are bathed in warm TTC solution (often 1% TTC in buffer at 37 °C) for 10 to 20 minutes.
5. They are fixed in formalin, which stops any further change and sharpens the contrast between red and pale.
6. Each slice is weighed, and the slices are scanned or photographed.

Some labs do it differently: they push TTC through the coronary arteries before slicing. The colours mean the same thing.

:::quiz{type="order-steps" id="m8-protocol"}
Put the protocol in order.
1. Remove and rinse the heart
2. Cut it across into thin slices, apex to base
3. Bathe the slices in warm TTC
4. Fix them in formalin
5. Weigh and scan each slice
:::

::scene{camera="ttc" highlight="infarct,lv-cavity" labels="auto"}

## Reading a stained slice

In a scanned slice there are three kinds of area:

- brick-red: living muscle;
- pale: the **[infarct](part:infarct)**, dead muscle;
- empty: the **[chamber](part:lv-cavity)** in the middle and any gaps, which are not tissue at all.

The infarct percentage of a slice is the pale area divided by all the muscle in the slice. To get the whole heart, the slices are combined, each one counted by its [weight](term:slice-weight), so a heavy slice counts more than a thin one. Doing this by hand is slow, and two people often draw the line between red and pale in different places. Module 10 shows how Cardia does it automatically.

::quiz{type="click-part" target="infarct" camera="ttc" id="m8-click-dead" prompt="Click the dead muscle in this stained slice."}

:::quiz{type="multiple-choice" id="m8-colours"}
In a TTC-stained slice, what does a pale, cream-coloured patch of muscle mean?
- [ ] Healthy muscle that took up a lot of stain
- [x] Muscle that has died
- [ ] A hole in the slice
> Only living cells can turn TTC red, so muscle that stays pale is dead.
:::

::scene{camera="ttc" highlight="infarct" labels="auto"}

## The gold standard: cut it out and weigh it

The most direct way to measure an infarct uses no pictures at all. After staining, someone cuts each slice apart with a fine blade, often under a magnifier: the **[pale, dead tissue](part:infarct)** goes on one side, the red, living tissue on the other. Both piles are weighed. Then:

infarct % = weight of the pale tissue ÷ weight of all the tissue × 100

This is the **[gravimetric](term:gravimetric)** method, from the Latin for weight. It is widely treated as the gold standard, because it measures the mass of dead muscle directly instead of working it out from areas in a picture.

It has costs. It is slow and takes a steady hand. Where red fades into pale, deciding where to cut is still a judgement. And the slices end up cut into pieces, so nothing is left to look at again.

Measuring areas on photographs or scans, by hand or with software like Cardia, keeps the slices' pictures for anyone to check, and when done carefully it usually agrees well with weighing. Showing that agreement is part of what an automatic method has to do.

:::quiz{type="true-false" answer="true" id="m8-gravimetric"}
In the gravimetric method, the pale and the red tissue are cut apart and each is weighed.
> Yes: the infarct percentage is the pale tissue's weight divided by the weight of all the tissue.
:::

:::quiz{type="multiple-choice" id="m8-gold-cost"}
Why do most labs measure areas on scans instead of weighing the tissue?
- [x] Weighing is slow, and the cut-up slices can't be looked at again
- [ ] Weighing is less accurate than any picture
- [ ] Stained tissue cannot be weighed
> Weighing measures dead mass directly, which is why it is the gold standard. Scans are faster and leave a record anyone can check.
:::

> TTC shows what is dead and what is alive. It does not show the [area at risk](term:area-at-risk), the whole territory that lost its blood supply. Some labs add a blue dye (Evans blue) for that.
