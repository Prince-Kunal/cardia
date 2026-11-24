---
module: 9
title: Traditional methods
summary: Tracing by hand, grey-level cut-offs, histology, and MRI in patients.
minutes: 12
tracks: [no-biology, student, researcher]
sources:
  - "Lindsey ML, Bolli R, Canty JM Jr, et al. Guidelines for experimental models of myocardial ischemia and infarction. Am J Physiol Heart Circ Physiol. 2018;314(4):H812–H838."
  - "Bøtker HE, Hausenloy D, Andreadou I, et al. Practical guidelines for rigor and reproducibility in preclinical and clinical studies on cardioprotection. Basic Res Cardiol. 2018;113(5):39."
  - "Schneider CA, Rasband WS, Eliceiri KW. NIH Image to ImageJ: 25 years of image analysis. Nat Methods. 2012;9(7):671–675."
  - "Kim RJ, Fieno DS, Parrish TB, et al. Relationship of MRI delayed contrast enhancement to irreversible injury, infarct age, and contractile function. Circulation. 1999;100(19):1992–2002."
  - "Fishbein MC, Meerbaum S, Rit J, et al. Early phase acute myocardial infarct size quantification: validation of the triphenyl tetrazolium chloride tissue enzyme staining technique. Am Heart J. 1981;101(5):593–600."
reviewed_by: ""
---

::scene{camera="ttc" highlight="infarct" labels="auto"}

## Before software like Cardia

TTC staining has been used to measure infarcts since the 1980s. The staining is the easy part. Turning a stained slice into a number has always been the slow part, and labs have done it in a few ways. Each is still in use somewhere.

## Weighing

The most direct way, met in module 8: cut the **[pale tissue](part:infarct)** away from the red with a fine blade and weigh both. This [gravimetric](term:gravimetric) method is the gold standard, but it is slow, takes skill, and leaves nothing to look at again.

::scene{camera="ttc" highlight="myocardium,lv-cavity,infarct" labels="auto"}

## Tracing by hand

The most common way: photograph or scan each slice, then trace the outline of the slice, the chamber and the pale area by hand on a computer, often in the free program ImageJ. This is **planimetry**, measuring areas on a flat picture.

Each slice's infarct is the pale area over the tissue area. The slices are then combined, each counted by its weight or its thickness.

Tracing keeps a picture anyone can check, but it is slow (many minutes a heart), and the border between red and pale is a judgement: two people often draw it in different places, and so does the same person on another day.

:::quiz{type="multiple-choice" id="m9-planimetry"}
What is planimetry?
- [ ] Weighing the pale and the red tissue
- [x] Tracing the slice and the pale area on a picture and measuring the areas
- [ ] Staining the heart through its arteries
> Planimetry measures areas on a flat picture, usually traced by hand.
:::

::scene{camera="ttc" labels="none"}

## Colour cut-offs

To save time, many labs let the computer pick the pale area: every pixel lighter, or less red, than a chosen value counts as dead. This is **thresholding**.

It is fast, but the right cut-off depends on the stain, the lighting and the scanner, so it often has to be re-chosen by eye for each batch, and shadows or uneven lighting can fool it. Cardia's [Method B](term:method-b) is a careful version of this idea: it corrects the lighting first, measures the red stain itself rather than brightness, so shadows don't change it, and reports the uncertain pixels as a range.

::scene{camera="short-axis" highlight="myocardium" labels="none"}

## Under the microscope

**Histology** cuts the tissue into sections thinner than a hair and stains them for the microscope. It shows what happened to individual cells, and it is the reference for infarcts that are days or weeks old, when TTC no longer tells dead from scar well. Stains such as Masson's trichrome colour the scar blue.

It is too slow to measure whole hearts routinely, and it was the reference used to show, in 1981, that TTC marks dead muscle correctly.

::scene{camera="section" highlight="lv" labels="auto"}

## In patients

Patients' hearts cannot be sliced, so infarcts are measured by imaging. The reference is **cardiac MRI** with a contrast agent: dead muscle and scar hold on to the contrast and show up bright on images taken some minutes after the injection (late gadolinium enhancement). Blood tests for troponin, a protein released by dying heart muscle, show that an infarct happened and roughly how big it is.

:::quiz{type="match" id="m9-methods"}
Match each method with where it is used.
- Weighing the pale tissue = The lab, as the gold standard
- Tracing on scans = The lab, most often
- Histology = Older infarcts, cell by cell
- Cardiac MRI = Patients
:::

::scene{camera="anterior" highlight="lad-territory"}

## Marking the area at risk

TTC shows dead and alive, but not which muscle had lost its blood supply. To mark that, the artery is tied again and a blue dye, **Evans blue**, is pushed through the heart just before it is taken out. Everything still reached by blood turns blue; the [area at risk](term:area-at-risk) stays unstained. After TTC, a slice has three colours: blue (never at risk), red (at risk but survived) and pale (dead).

:::quiz{type="true-false" answer="false" id="m9-ttc-risk"}
TTC on its own shows the area at risk.
> TTC shows only dead and alive. Labs mark the area at risk with a second dye, often Evans blue.
:::
