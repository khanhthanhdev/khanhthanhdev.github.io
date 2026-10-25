---
layout: post
title: "clustering from scratch, part 1: k-means"
date: 2026-10-25 00:00:00
description: a scroll-through, step-by-step walk through Lloyd's algorithm and k-means++, with every distance drawn and every number computed on the points you see
tags: ml clustering unsupervised interactive
categories: explainer
series: clustering-from-scratch
part: 1
series_description: a four-part, scroll-through tour of the classic clustering algorithms (k-means, hierarchical clustering, DBSCAN and Gaussian mixtures), run live on points you can change, with every step drawn and every number real
math: true
toc:
  beginning: true
css:
  - /assets/css/screen-works.css
  - /assets/css/transformer.css
  - /assets/css/clustering.css
js:
  - /assets/js/clustering/cl-core.js
  - /assets/js/transformer/tf-view.js
  - /assets/js/clustering/cl-view.js
  - /assets/js/clustering/part1.js
  - /assets/js/clustering/cl-scrolly.js
  - /assets/js/clustering/cl-figures.js
---

{% include cl-series.liquid %}

Give someone a scatter of dots and ask them to circle the groups. Most people can do it in a second. **Clustering** is the problem of getting a computer to do the same: split a set of points into groups, when nobody has told it what the groups are or even how many there are.

That last part is what makes it hard. In classification, every training point comes with the right answer. In clustering there is no answer key. An algorithm has to decide for itself what "a group" means, and each algorithm in this series decides differently.

This series builds four classic algorithms, one per part. Every figure runs the real algorithm in your browser on the points it shows, and every number you see is computed, not drawn by hand. This first part covers the oldest and most widely used: **k-means**.

## The toy data

The main figure starts with **60 points** in a 10 × 10 square, drawn from three round blobs of 20 points each. The algorithm is never told which blob a point came from. We only use that at the very end, to check its answer.

Above the figure you can:

- switch to another dataset (_big and small_, _stretched_, _two moons_),
- press _new points_ to draw a fresh sample,
- click anywhere in the plot to add a point of your own.

Every step below reruns on whatever data is on screen. Scroll slowly: inside each step, scrolling also plays the step.

## k-means, step by step

<section class="tf-scrolly" data-cl-scene="part1" data-dataset="blobs">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="points" data-title="Points, and nothing else." markdown="1">
**Here is the input**: 60 points, each just a pair of numbers (_x_, _y_). There are no labels and no colours.

Your eye probably finds three groups straight away. k-means needs one thing from us before it can start: **k**, the number of clusters to look for. Here k = 3. We will come back to the question of how to pick k at the end.

Each cluster will be summarised by one point, its **centre**. Finding good centres is the whole job.

</div>

<div class="tf-step" data-step="start" data-title="Start: pick k points at random." markdown="1">
**We have to start somewhere.** The simplest choice, used since the 1960s, is to pick k of the data points at random and call them the centres. (It's often called the _Forgy_ start.)

This start is not a good one. Two of the three centres landed in the same blob at the top right, and the bottom blob got none. Keep an eye on whether the algorithm recovers.

The button below the figure, _new start_, picks another random start.

</div>

<div class="tf-step" data-step="assign" data-title="Assign: each point joins its nearest centre." markdown="1">
**Step 1 of every round: assign.** For each point, measure the straight-line distance to every centre, and give the point the colour of the nearest one.

The figure walks through the points one at a time. The dashed lines are the distances; the solid one is the winner. The first point, at (2.7, 8.5), is 4.11 from c1, 1.89 from c2 and 4.87 from c3, so it joins c2.

Once every point is done, the tinted regions show each centre's territory: every spot in a region is closer to that centre than to any other. The borders between them are straight lines. [Going deeper](#straight-borders) says why.

</div>

<div class="tf-step" data-step="update" data-title="Update: each centre moves to its points' mean." markdown="1">
**Step 2: update.** Each centre now moves to the **mean** of the points that chose it: the average of their _x_ values and the average of their _y_ values.

The lines show how far each centre travels. The bottom blob has no centre of its own, so its points split between c1 and c2, far above them, and both get dragged down towards it.

Why the mean, and not, say, the median? Because the mean is exactly the spot that makes the squared distances to the cluster's points as small as possible. [The proof](#why-the-mean) is three lines.

</div>

<div class="tf-step" data-step="repeat" data-title="Repeat the two steps." markdown="1">
**Then we do it again.** New centres mean some points now have a different nearest centre, so we reassign, then move the centres again, and so on.

The chart on the right tracks the **inertia**: the sum, over all points, of the squared distance from each point to its own centre. It is the score k-means is trying to make small.

Watch the chart as you scroll. The inertia goes down at every single step, both after an _assign_ (a1, a2, …) and after an _update_ (u1, u2, …). It never goes up. That's not luck; [it can't](#always-stops).

</div>

<div class="tf-step" data-step="done" data-title="Stop when nothing changes." markdown="1">
**When an assign step changes no colours, we're done.** The centres would move to the same means as last time, so nothing will ever change again.

On these points it takes 5 rounds. The inertia fell from 665.51 after the first assignment to 84.54.

And the algorithm did recover from its bad start: c1, which began in the top-right blob next to c3, worked its way down to the empty bottom blob over three rounds.

</div>

<div class="tf-step" data-step="local" data-title="Not every start ends well." markdown="1">
**Here is a different random start** on the same points. It also converges, but to a worse answer: one blob split in two, and two blobs sharing one centre.

Each step still lowered the inertia. The trouble is that the algorithm only ever looks for a small improvement nearby. Once no single reassignment helps, it stops, even if a much better answer exists elsewhere. That's a **local minimum**.

On the default points, 13 of 100 random starts get stuck like this. The usual fix is to run k-means several times from different starts and keep the run with the lowest inertia.

</div>

<div class="tf-step" data-step="plusplus" data-title="k-means++: spread the starts out." markdown="1">
**A smarter start fixes most of this.** **k-means++** ([Arthur and Vassilvitskii, 2007](https://dl.acm.org/doi/10.5555/1283383.1283494)) picks the first centre at random, then picks each next one with probability proportional to **D(x)²**: the squared distance from a point to its nearest centre so far.

In the figure, each point's size shows its chance of being picked. Points close to an existing centre shrink to almost nothing. Points far from every centre are the likely picks, so the starts tend to land in different blobs.

On the default points, k-means++ gets stuck in 1 of 100 starts, against 13 for plain random starts. It's the default in scikit-learn and most other libraries.

</div>

<div class="tf-step" data-step="choosek" data-title="How many clusters?" markdown="1">
**We told k-means k = 3.** What if we hadn't known? Move the slider (or keep scrolling) to try every k from 1 to 8.

The top chart is the inertia of the best run for each k. It always falls as k grows, because more centres can always sit closer to the points. With k = 60, every point would be its own centre and the inertia would be 0. So "lowest inertia" can't choose k.

Look for the **elbow** instead: the k after which adding a centre stops helping much. Here inertia drops from 595 to 296 to 85, then only to 71.

The lower chart is the **silhouette**, which asks whether each point sits closer to its own cluster than to the next nearest one. It peaks at 0.67, at k = 3. [Going deeper](#silhouette) has the formula.

</div>

<div class="tf-step" data-step="limits" data-title="Where k-means goes wrong." markdown="1">
**Now switch the dataset** with the menu above the figure.

On _three blobs_, k-means agrees with the true groups on 100% of pairs of points. Try the others:

- **big and small**: k-means splits the big blob and lumps the small ones together, because it prefers clusters of similar size (90% of pairs).
- **stretched**: three long, thin groups get cut across, because k-means wants round clusters (78%).
- **two moons**: two curved groups get sliced down the middle by a straight line (64%).

Each failure comes from the same place: k-means describes a cluster by a single centre, so every cluster is a convex, roundish blob. The next three parts each drop part of that assumption.

</div>

  </div>
</section>

## The whole thing in one line

k-means looks for k centres $$\mu_1, \dots, \mu_k$$ and an assignment $$c_i$$ of every point $$x_i$$ to one of them that make the **inertia** small:

$$J = \sum_{i=1}^{n} \lVert x_i - \mu_{c_i} \rVert^2$$

Lloyd's algorithm makes it small by fixing one half of the unknowns and solving for the other half, over and over:

1. **Assign.** Keep the centres fixed, and give each point its nearest one: $$c_i = \arg\min_j \lVert x_i - \mu_j \rVert^2$$.
2. **Update.** Keep the assignment fixed, and move each centre to the mean of its points: $$\mu_j = \frac{1}{\lvert C_j \rvert} \sum_{i \in C_j} x_i$$.
3. **Stop** when step 1 changes nothing.

Stuart Lloyd described it at Bell Labs in 1957 as a way to compress signals, though it was only published in 1982. James MacQueen gave it the name _k-means_ in 1967.

Each round costs very little. With $$n$$ points in $$d$$ dimensions:

{: .tf-table}
| step | work | in our toy |
| ------------ | ------------------------------------- | -------------------- |
| assign | $$n \cdot k$$ distances, $$d$$ terms each | 60 × 3 = 180 distances |
| update | one pass over the points | 60 additions |
| one round | about $$n\,k\,d$$ | about 360 |

That's why k-means is still the first thing people try on millions of points.

## What's still missing

Three things should bother you.

- **We had to choose k.** The elbow and the silhouette help, but they are rules of thumb run after the fact.
- **The answer depends on the start.** Restarts and k-means++ make bad answers rare, not impossible.
- **Every cluster is a round blob.** Clusters of very different sizes, stretched clusters and curved clusters all come out wrong.

Part 2, **hierarchical clustering**, doesn't need k up front: it builds every possible number of clusters at once, as a tree. It has no random start, either.

## Going deeper

The steps above show _what_ k-means does. This section is about _why_. Each question stands on its own, so skip to the ones you care about.

### Why the mean? {#why-the-mean}

Take one cluster with points $$x_1, \dots, x_m$$, and look for the single point $$\mu$$ that makes the sum of squared distances smallest:

$$f(\mu) = \sum_{i=1}^{m} \lVert x_i - \mu \rVert^2$$

$$f$$ is a bowl (a sum of squares), so its lowest point is where its gradient is zero. The gradient of $$\lVert x_i - \mu \rVert^2$$ with respect to $$\mu$$ is $$-2(x_i - \mu)$$, so

$$\nabla f(\mu) = -2 \sum_{i=1}^{m} (x_i - \mu) = -2\Big(\sum_{i=1}^m x_i - m\,\mu\Big) = 0 \quad\Rightarrow\quad \mu = \frac{1}{m} \sum_{i=1}^{m} x_i$$

the mean. There is a neater way to see it, which also says how much worse any other point is. Add and subtract the mean $$\bar{x}$$ inside each term:

$$\sum_i \lVert x_i - \mu \rVert^2 = \sum_i \lVert (x_i - \bar{x}) + (\bar{x} - \mu) \rVert^2 = \sum_i \lVert x_i - \bar{x} \rVert^2 + m\,\lVert \bar{x} - \mu \rVert^2$$

The cross term $$2(\bar{x} - \mu) \cdot \sum_i (x_i - \bar{x})$$ vanishes, because the points' offsets from their mean add up to zero. So putting the centre anywhere other than the mean costs exactly $$m$$ times the squared distance from the mean.

Try it on six numbers on a line. Drag the slider to move the centre: the cost is a parabola, and its lowest point is the mean.

<figure class="tf-figure" data-cl-figure="mean">
  <noscript><p class="tf-noscript">This figure needs JavaScript. For the numbers 1, 2, 2.5, 4, 7 and 8.5, the sum of squared distances is smallest at their mean, 4.17.</p></noscript>
</figure>

Squared distance is what makes the answer the mean. If you used plain distance, $$\sum_i \lVert x_i - \mu \rVert$$, the best single point would be the **median** instead (on a line), and the algorithm would be **k-medians**. It is less thrown by outliers, but the update step is harder to compute in more than one dimension.

### Why the borders are straight lines {#straight-borders}

When is a point $$x$$ exactly as far from centre $$a$$ as from centre $$b$$? Write out both squared distances:

$$\lVert x - a \rVert^2 = \lVert x - b \rVert^2$$

$$\lVert x \rVert^2 - 2\,a \cdot x + \lVert a \rVert^2 = \lVert x \rVert^2 - 2\,b \cdot x + \lVert b \rVert^2$$

The $$\lVert x \rVert^2$$ cancels, and what's left is

$$2\,(b - a) \cdot x = \lVert b \rVert^2 - \lVert a \rVert^2$$

That's a straight line (in more dimensions, a flat plane), at right angles to the segment from $$a$$ to $$b$$ and through its midpoint. Each centre's territory is what's left after cutting the plane with one such line for each other centre. These regions are called **Voronoi cells**, and a region cut out by straight lines is always **convex**: the segment between any two points inside it stays inside.

That is the root of the failures in the last step. A curved moon isn't convex, so no k-means cluster can be shaped like one.

### Why it always stops {#always-stops}

Each half of a round can only lower the inertia $$J$$, or leave it alone:

- **Assign.** Each point moves to its nearest centre, so its own term $$\lVert x_i - \mu_{c_i} \rVert^2$$ can only shrink.
- **Update.** Each centre moves to its cluster's mean, which by [the result above](#why-the-mean) is the best spot for that cluster.

So $$J$$ never goes up. And there are only finitely many ways to split $$n$$ points into $$k$$ groups (fewer than $$k^n$$). Every round either lowers $$J$$, and so reaches an assignment it can never return to, or changes nothing and stops. So the algorithm must stop after finitely many rounds.

"Finitely many" can still be a lot. [Vattani (2011)](https://doi.org/10.1007/s00454-011-9340-1) built point sets in the plane on which Lloyd's algorithm needs exponentially many rounds. In practice it almost always stops in a few dozen, as on our points.

The stopping point is a **local minimum**: no single step improves it. Finding the best answer of all, the **global minimum**, is much harder. It is NP-hard even for k = 2 ([Aloise et al., 2009](https://doi.org/10.1007/s10994-009-5103-0)), and even in the plane ([Mahajan et al., 2012](https://doi.org/10.1016/j.tcs.2010.05.034)). So every practical method settles for good local minima.

### How often do starts get stuck? {#starts}

Below, k-means runs 200 times on the default points from plain random starts, and 200 times from k-means++ starts. Each bar counts how many runs ended at that inertia.

<figure class="tf-figure" data-cl-figure="starts">
  <noscript><p class="tf-noscript">This figure needs JavaScript. Most runs from either start reach the best inertia, 84.54; random starts get stuck far more often.</p></noscript>
</figure>

Arthur and Vassilvitskii proved that k-means++ is good in expectation, before Lloyd's algorithm even runs. Write $$J_{opt}$$ for the best inertia possible. Then the inertia of the k-means++ start alone satisfies

$$\mathbb{E}[J] \le 8\,(\ln k + 2)\, J_{opt}$$

For k = 3 that bound is about 25 times the best: loose, but it holds for _every_ dataset, while a plain random start can be arbitrarily bad. The intuition is the D² weighting. A blob with no centre yet is far from every centre, so its points carry most of the probability. Lloyd's rounds then only improve on the start.

### Inertia as a sum over pairs

There's a second way to write a cluster's inertia, without any centre at all. For a cluster $$C$$ with mean $$\bar{x}$$:

$$\sum_{i \in C} \lVert x_i - \bar{x} \rVert^2 = \frac{1}{2\,\lvert C \rvert} \sum_{i \in C} \sum_{j \in C} \lVert x_i - x_j \rVert^2$$

To check it, expand $$\lVert x_i - x_j \rVert^2 = \lVert (x_i - \bar{x}) - (x_j - \bar{x}) \rVert^2$$ and sum over both $$i$$ and $$j$$. The cross terms vanish for the same reason as before, and each of the two square terms gives $$\lvert C \rvert$$ times the inertia.

So k-means is really asking for groups whose members are close _to each other_, on average, measured with squared distance. Part 2 will build clusters directly from distances between pairs of points.

### More clusters always lower the inertia

Take the best clustering with $$k$$ centres, and add a $$(k+1)$$-th centre on top of any data point. Run one assign step. No point gets further from its centre, since it can only switch to the new one if that is closer, and the point under the new centre now costs 0. So the best inertia with $$k + 1$$ centres is never higher than with $$k$$, and strictly lower unless every point already sits on its centre.

That's why inertia alone can't pick k. Every rule for choosing k has to trade inertia against the number of clusters somehow.

### The silhouette {#silhouette}

For one point $$i$$, let

- $$a(i)$$ be its mean distance to the other points in its own cluster,
- $$b(i)$$ be its mean distance to the points of the nearest _other_ cluster.

Its silhouette ([Rousseeuw, 1987](<https://doi.org/10.1016/0377-0427(87)90125-7>)) is

$$s(i) = \frac{b(i) - a(i)}{\max\big(a(i),\, b(i)\big)}$$

which lies between −1 and 1. Near 1, the point is much closer to its own cluster than to any other. Near 0, it sits on a border. Negative, it's probably in the wrong cluster. The score of a whole clustering is the mean of $$s(i)$$ over all points.

Unlike inertia, the silhouette doesn't simply improve with k: split a real blob in two, and its points find the other half as close as their own, so $$b(i)$$ drops towards $$a(i)$$. That's why it peaked at the true k = 3 here. It's still a heuristic: it favours round, well-separated clusters, which is exactly what k-means produces anyway.

### Scale changes the answer

k-means only sees distances, so the units of each coordinate matter. Measure height in millimetres and weight in kilograms, and height differences will dominate every distance; switch to metres and weight will. The clusters change with the units.

The usual fix is to **standardise** each feature first (subtract its mean, divide by its standard deviation), so each one counts about equally. That's a choice, not a law: if one feature really matters more, leaving it bigger is a way of saying so.

### k-means is a special case of a mixture model

Suppose each cluster is a round Gaussian blob, all with the same small spread $$\sigma$$, and each point is drawn from one blob. Then the log-likelihood of a point under blob $$j$$ is, up to a constant,

$$\log p(x \mid j) = -\frac{\lVert x - \mu_j \rVert^2}{2\sigma^2}$$

Picking the most likely blob for each point is picking the nearest centre, and fitting each blob's mean to its points is the update step. Part 4 drops the "same, round, and hard choice" parts of that story, and gets **Gaussian mixtures** and the **EM algorithm**, which reduces to k-means as $$\sigma \to 0$$.

### Making it faster

On big datasets the assign step is the cost: $$n \cdot k$$ distances per round. Two common speed-ups:

- **Skip distances you don't need.** If a point is very close to its centre, and that centre is far from every other centre, the point can't switch. Elkan (_Using the triangle inequality to accelerate k-means_, 2003) uses the triangle inequality to skip most distance computations without changing the answer.
- **Use a sample.** **Mini-batch k-means** ([Sculley, 2010](https://doi.org/10.1145/1772690.1772862)) updates the centres from a small random batch of points each round. It gives slightly worse answers, much faster.

## Further reading

- S. Lloyd, [_Least squares quantization in PCM_](https://doi.org/10.1109/TIT.1982.1056489) (1982, written in 1957): the original algorithm.
- D. Arthur and S. Vassilvitskii, [_k-means++: The Advantages of Careful Seeding_](https://dl.acm.org/doi/10.5555/1283383.1283494) (2007): the D² start and its guarantee.
- P. Rousseeuw, [_Silhouettes: a graphical aid to the interpretation and validation of cluster analysis_](<https://doi.org/10.1016/0377-0427(87)90125-7>) (1987).
- scikit-learn, [_Clustering_](https://scikit-learn.org/stable/modules/clustering.html): a side-by-side comparison of many clustering algorithms on toy datasets like these.
- Chris Piech, [_K Means_](https://stanford.edu/~cpiech/cs221/handouts/kmeans.html): short Stanford CS221 notes covering the same ground.

{% include cl-series.liquid %}
