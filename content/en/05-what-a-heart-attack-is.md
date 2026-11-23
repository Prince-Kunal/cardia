---
module: 5
title: What a heart attack is
summary: A blocked artery, no oxygen, dying muscle. Time is muscle.
minutes: 12
tracks: [no-biology, student]
sources:
  - "Thygesen K, Alpert JS, Jaffe AS, et al. Fourth Universal Definition of Myocardial Infarction (2018). Circulation. 2018;138(20):e618–e651."
  - "Reimer KA, Lowe JE, Rasmussen MM, Jennings RB. The wavefront phenomenon of ischemic cell death. 1. Myocardial infarct size vs duration of coronary occlusion in dogs. Circulation. 1977;56(5):786–794."
  - "Betts JG, Young KA, Wise JA, et al. Anatomy and Physiology 2e, chapter 19. OpenStax, Houston, 2022."
reviewed_by: ""
---

::scene{camera="anterior" highlight="rca,lad,lcx" anim="coronary-flow"}

## The heart feeds itself too

Heart muscle never rests, so it needs a constant supply of oxygen. It cannot take that oxygen from the blood rushing through its chambers. Instead, it has its own arteries running over its surface: the **[coronary arteries](term:coronary-arteries)**.

They branch off the aorta just above the aortic valve:

- the **[right coronary artery](part:rca)** (RCA) feeds mostly the right ventricle and the back of the heart;
- the left coronary artery splits into the **[left anterior descending artery](part:lad)** (LAD), which runs down the front, and the **[left circumflex artery](part:lcx)** (LCx), which wraps around the left side.

::scene{camera="anterior" highlight="lad-territory"}

## Each artery has its own patch

Each coronary artery feeds its own patch of muscle, called its [territory](term:territory). The LAD feeds the **[front wall of the left ventricle](part:lad-territory)**, much of the septum and the apex. Because its territory is so large, a blocked LAD causes some of the largest heart attacks.

::quiz{type="click-part" target="lad" camera="anterior" id="m5-click-lad" prompt="Click the LAD."}

::scene{camera="anterior" highlight="lad" anim="occlusion"}

## A blocked artery

A heart attack starts when a coronary artery is blocked, most often by a blood clot that forms on a fatty bump (a plaque) in the artery wall.

Beyond the block, blood stops. The muscle in that territory gets no oxygen. This is called **[ischemia](term:ischemia)**.

Within about a minute, the starved muscle stops squeezing. At this stage it is still alive, and it recovers if blood comes back soon.

::scene{camera="short-axis" highlight="infarct" anim="wavefront"}

## Time is muscle

If the artery stays blocked, muscle cells start to die after about 20 minutes. Dead heart muscle is called an **[infarct](term:infarct)**, and a heart attack is, in medical words, a **[myocardial infarction](term:myocardial-infarction)**.

The dying does not happen everywhere at once. It starts in the **inner** part of the wall, next to the chamber, where the blood supply is most fragile. Over the next few hours it spreads outward toward the outer wall: the [wavefront](term:wavefront).

That is why doctors say **"time is muscle"**: the sooner blood flow returns, the more muscle is saved. Reopening the artery is called [reperfusion](term:reperfusion).

:::quiz{type="multiple-choice" id="m5-where"}
Where in the wall does muscle start to die when an artery is blocked?
- [x] The inner part, next to the chamber
- [ ] The outer surface, next to the artery
- [ ] Everywhere at the same moment
> Death starts in the inner wall (the subendocardium) and spreads outward over hours: the wavefront.
:::

:::quiz{type="true-false" answer="false" id="m5-hours-tf"}
Heart muscle can go without blood flow for several hours and still recover completely.
> Cells start to die after about 20 minutes without blood flow, and the dead zone grows with every hour.
:::

::scene{camera="ttc" highlight="infarct"}

## In the lab

Researchers study heart attacks to find treatments that make the infarct smaller. In experiments they control the blockage: blood flow to the heart, or to one artery, is stopped for a set time and then restored.

Afterwards the heart is cut into slices and stained, and the question is always the same: **how much of the muscle died?** That amount is the [infarct size](term:infarct-size), and measuring it is what Cardia does. Module 8 shows how the dead muscle is made visible.

:::quiz{type="order-steps" id="m5-order"}
Put these in order.
1. A clot blocks a coronary artery
2. The muscle beyond it gets no oxygen (ischemia)
3. The muscle stops squeezing
4. After about 20 minutes, cells start to die
5. The dead zone spreads outward over hours
:::
