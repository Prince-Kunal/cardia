---
module: 11
title: Good research practice
summary: Blinding, reproducibility, and the 3Rs.
minutes: 10
tracks: [no-biology, student, researcher]
sources:
  - "Percie du Sert N, Hurst V, Ahluwalia A, et al. The ARRIVE guidelines 2.0: updated guidelines for reporting animal research. PLoS Biol. 2020;18(7):e3000410."
  - "Russell WMS, Burch RL. The Principles of Humane Experimental Technique. Methuen, London, 1959."
  - "Bøtker HE, Hausenloy D, Andreadou I, et al. Practical guidelines for rigor and reproducibility in preclinical and clinical studies on cardioprotection. Basic Res Cardiol. 2018;113(5):39."
  - "Lindsey ML, Bolli R, Canty JM Jr, et al. Guidelines for experimental models of myocardial ischemia and infarction. Am J Physiol Heart Circ Physiol. 2018;314(4):H812–H838."
reviewed_by: ""
---

::scene{camera="ttc" labels="none"}

## Measuring fairly

An infarct study compares groups, for example hearts that got a new drug and hearts that did not. A difference of a few percentage points can decide whether a treatment goes forward. So the measurement must not lean, even a little, towards the answer the researchers hope for.

Three habits protect against that: deciding in advance, assigning groups by chance, and measuring blind.

## Decide in advance

Before the first heart, write down what will be measured, how, how many animals each group needs and why, and which hearts would be left out and for what reason, for example a heart that stopped early. Deciding afterwards makes it too easy to choose the analysis that gives the nicest result.

::scene{camera="ttc" highlight="infarct" labels="none"}

## Randomise and blind

Each animal's group should be decided by chance, not by whoever is doing the experiment that day. And the person measuring the infarct should not know which group a heart belongs to: they are **[blinded](term:blinding)**.

Cardia measures every heart the same way, but people still choose things: which scans belong to a heart, the slice weights, which slices to leave out. Those choices should be made blind too, for example by giving hearts codes instead of group names until the measuring is done.

:::quiz{type="true-false" answer="true" id="m11-blind"}
The person measuring infarct size should not know which group each heart belongs to.
> That is blinding. It stops hopes about the result from nudging the measurement.
:::

::scene{camera="ttc" highlight="infarct"}

## Make it reproducible

Someone else should be able to get the same number from the same scans. That needs:

- the original scans, kept unchanged: never edit or "clean up" an image before measuring;
- the exact method and its settings;
- the version of the software that measured them.

Cardia keeps the original scans with a fingerprint of each file (a SHA-256 hash), records the pipeline version and the model files it used, and writes a Methods paragraph from them. Exported results carry the same details.

:::quiz{type="multiple-choice" id="m11-repro"}
Which of these helps someone else reproduce your infarct measurements?
- [x] Keeping the original scans unchanged, with the software version used
- [ ] Brightening the scans so the pale areas show better before measuring
- [ ] Keeping only the final percentages
> Others need the same input, the same method and the same version. Editing the scans first changes the input.
:::

::scene{camera="anterior" anim="slicing"}

## The 3Rs

Research with animals follows the **[3Rs](term:three-rs)**, set out in 1959:

- **Replace**: use methods without animals where they can answer the question;
- **Reduce**: use as few animals as give a reliable answer;
- **Refine**: lessen pain and distress, through care, anaesthesia and humane end points.

Better measurement serves Reduce directly: the less noise in the infarct measurement, the fewer hearts are needed to see a real effect (module 7).

:::quiz{type="match" id="m11-3rs"}
Match each R with what it means.
- Replace = Answer the question without animals where possible
- Reduce = Use as few animals as give a reliable answer
- Refine = Lessen pain and distress
:::

::scene{camera="section" labels="none"}

## Report everything

Reporting guidelines such as **ARRIVE 2.0** list what a paper should say about animal experiments: species, sex, numbers per group, how groups were assigned, blinding, every animal left out and why, and the statistics. Many journals require them. A study reported this fully can be checked, repeated and combined with others.
