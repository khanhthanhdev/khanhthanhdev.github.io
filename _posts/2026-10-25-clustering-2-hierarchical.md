---
layout: post
title: "clustering from scratch, part 2: hierarchical clustering"
date: 2026-10-25 00:00:01
description: merge the two closest clusters, again and again, and read every possible clustering off one tree; with single, complete, average and Ward linkage run live
tags: ml clustering unsupervised interactive
categories: explainer
series: clustering-from-scratch
part: 2
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
  - /assets/js/clustering/part2.js
  - /assets/js/clustering/cl-scrolly.js
  - /assets/js/clustering/cl-figures.js
---

{% include cl-series.liquid %}

[Part 1]({% post_url 2026-10-25-clustering-1-k-means %}) ended with three complaints about k-means: we had to choose k up front, the answer depended on a random start, and every cluster came out as a round blob.

**Hierarchical clustering** answers the first two. It has no random start: run it twice and you get the same answer. And it doesn't produce one clustering. It produces all of them at once, from "every point alone" to "everything together", nested inside each other as a tree. You choose k afterwards, by looking at the tree.

The idea fits in one sentence: **start with every point as its own cluster, and keep merging the two closest clusters until only one is left.** The interesting part is what "closest" means for two groups of points.

## The toy data

This time the figure starts with **24 points**, three blobs of 8, so you can follow every merge. The menu above the figure has bigger datasets too, including two new ones made for this part. _New points_ draws a fresh sample, and clicking the plot adds a point.

## Agglomerative clustering, step by step

<section class="tf-scrolly" data-cl-scene="part2" data-dataset="few" data-datasets="few blobs bridge stretched uneven moons">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="alone" data-title="Every point starts alone." markdown="1">
**Start with 24 clusters**, one point each. That's a perfectly valid clustering, just not a useful one.

On the right is the **dendrogram**, the tree we are about to grow. For now it's only its 24 leaves along the bottom, one per point. Each merge will add a ⊓ shape joining two branches. The height of the ⊓ records how far apart the two clusters were when they merged.

</div>

<div class="tf-step" data-step="closest" data-title="Find the closest pair." markdown="1">
**Step 1: measure the distance between every pair of points**, and find the smallest. With 24 points there are 24 × 23 / 2 = 276 pairs.

The closest pair is (6.8, 7.8) and (7.0, 7.8), only 0.17 apart. They merge into one cluster of two points. Now there are 23 clusters.

</div>

<div class="tf-step" data-step="merge" data-title="Merge, and repeat." markdown="1">
**Then do it again**: find the two closest clusters and merge them. The figure plays the first 8 merges. Each line on the plot joins the two closest points across a merge, and each new ⊓ in the dendrogram sits at the merge's height.

Early merges are short: points that sit right next to each other. Notice that the heights only go up. Each merge uses up the closest pair that's left, so the next one can't be closer. [Going deeper](#heights-go-up) makes that precise.

But "the two closest _clusters_" hides a question. Once a cluster has several points, how far is it from another cluster?

</div>

<div class="tf-step" data-step="linkage" data-title="How far apart are two groups?" markdown="1">
**This choice is called the linkage**, and there are four common answers. Here are two groups from part-way through, blue and red:

- **single**: the distance between the _closest_ pair of points, one from each group (the solid line): 1.11.
- **complete**: the distance between the _farthest_ pair (the dashed line): 2.15.
- **average**: the mean distance over all pairs across the groups: 1.59.
- **Ward**: how much the inertia from part 1 would grow if the two merged: 1.63.

Use the _linkage_ menu below the figure to switch. The figure shows the pair that linkage merges when four clusters are left, so each linkage picks a different pair.

</div>

<div class="tf-step" data-step="build" data-title="Merge all the way to one cluster." markdown="1">
**Now play all 23 merges.** Points keep the colour of the cluster they end up in once they stop being alone, so you can watch the blobs fill in.

Inside each blob, merges are short and quick. Merging two blobs takes a long jump. On the default points with single linkage, the last two merges happen at heights 2.97 and 3.05. Every merge before them is at most 1.11.

</div>

<div class="tf-step" data-step="tree" data-title="The tree holds every clustering." markdown="1">
**This is the finished dendrogram.** It records the entire history: which clusters merged, in what order, and how far apart they were.

The long vertical stretches are the important part. A long stretch means a cluster survived a long time before merging with anything: it's well separated from everything else. On the default points the biggest jump in height comes after merge 21, which leaves 3 clusters.

</div>

<div class="tf-step" data-step="cut" data-title="Cut the tree to choose k." markdown="1">
**To get k clusters, cut the tree with a horizontal line.** Every merge below the line stays. Every merge above it is undone. Each branch the line crosses is one cluster.

Move the slider, or keep scrolling, to try 1 to 8 clusters. Cutting where the branches are longest gives the most natural answer: here, 3.

Unlike k-means, changing k doesn't rerun anything. The 4-cluster answer is the 3-cluster answer with one cluster split in two. That's what **hierarchical** means.

</div>

<div class="tf-step" data-step="linkages" data-title="The linkage changes everything." markdown="1">
**On easy data, every linkage agrees.** Switch the dataset with the menu above the figure, and the linkage with the menu below it, to see where they part ways:

- **two moons**: single linkage gets both moons exactly right (100%), where k-means managed 64%. A chain of close neighbours can follow a curve.
- **bridged blobs**: the same chains hurt it here. A thin line of points connects the blobs, so single linkage merges them early and leaves one stray point as the second "cluster". This is called **chaining**.
- **stretched**: single linkage follows each long line (100%); complete linkage cuts across them (67%).

Complete and average linkage prefer compact clusters, which makes them closer to k-means.

</div>

<div class="tf-step" data-step="ward" data-title="Ward: k-means, one merge at a time." markdown="1">
**Ward linkage** merges the pair of clusters whose union raises the inertia the least. That's k-means' own score, so Ward is a greedy, step-by-step attempt at the k-means problem.

The merge costs add up: on the default points, the first 21 Ward merges cost 17.08 in total, and the 3 clusters left have an inertia of exactly 17.08. k-means finds the same answer here. On harder data Ward ends up a little worse (40.54 against 36.77 on _bridged blobs_), because it can never undo a merge.

That's why Ward's result is often used as the starting point for k-means.

</div>

  </div>
</section>

## The whole thing in one loop

Agglomerative clustering with a linkage $$D(A, B)$$ between clusters:

1. Start with $$n$$ clusters $$\{x_1\}, \dots, \{x_n\}$$.
2. Find the pair $$A \ne B$$ with the smallest $$D(A, B)$$.
3. Replace $$A$$ and $$B$$ by $$A \cup B$$, and record a merge at height $$D(A, B)$$.
4. Stop when one cluster is left. Otherwise go to 2.

The four linkages, for clusters $$A$$ and $$B$$ with means $$\mu_A$$ and $$\mu_B$$:

{: .tf-table}
| linkage | $$D(A, B)$$ | tends to give |
| -------- | ------------------------------------------------------------------ | -------------------------------------- |
| single | $$\min_{a \in A,\, b \in B} \lVert a - b \rVert$$ | long chains; follows any shape |
| complete | $$\max_{a \in A,\, b \in B} \lVert a - b \rVert$$ | compact clusters of similar diameter |
| average | $$\frac{1}{\lvert A \rvert \lvert B \rvert} \sum_{a, b} \lVert a - b \rVert$$ | between the two |
| Ward | $$\frac{\lvert A \rvert \lvert B \rvert}{\lvert A \rvert + \lvert B \rvert} \lVert \mu_A - \mu_B \rVert^2$$ | round clusters, like k-means |

## What's still missing

Hierarchical clustering solved two of part 1's complaints, but not the rest.

- **It's slow.** The plain algorithm keeps all $$n^2 / 2$$ pairwise distances in memory. That's fine for thousands of points and hopeless for millions.
- **Merges are final.** One bad early merge can never be undone.
- **Noise.** Every point ends up in some cluster, even a lone point far from everything. On _bridged blobs_ that's what broke single linkage.

Single linkage's success on the moons is a hint, though. It worked because it grows clusters through chains of close neighbours. Part 3, **DBSCAN**, keeps that idea, adds a rule that a cluster must be dense, and gets a proper notion of noise.

## Going deeper

### Why the heights only go up {#heights-go-up}

Say $$A$$ and $$B$$ were the closest pair of clusters, so they merged at height $$h = D(A, B)$$, and every other pair is at least $$h$$ apart. Is the new cluster $$A \cup B$$ also at least $$h$$ from every other cluster $$C$$?

- **single**: $$D(A \cup B, C) = \min\big(D(A, C), D(B, C)\big)$$. Both are at least $$h$$, so the minimum is too.
- **complete**: $$D(A \cup B, C) = \max\big(D(A, C), D(B, C)\big) \ge h$$, for the same reason.
- **average**: $$D(A \cup B, C) = \frac{\lvert A \rvert\, D(A, C) + \lvert B \rvert\, D(B, C)}{\lvert A \rvert + \lvert B \rvert}$$, a weighted average of two numbers at least $$h$$.

So the next merge can't happen below $$h$$, and the heights never decrease. Ward linkage has the same property, by a longer calculation.

Not every linkage is this well behaved. **Centroid linkage** measures the distance between the clusters' means. Take three points at the corners of an equilateral triangle with side 1. Two of them merge at height 1. Their mean is the midpoint of that side, which is only $$\sqrt{3}/2 \approx 0.87$$ from the third point. So the next merge is _lower_ than the one before it. That's called an **inversion**, and it makes the dendrogram impossible to cut cleanly.

### One update rule for every linkage

Recomputing $$D(A \cup B, C)$$ from all the points would be slow. [Lance and Williams (1967)](https://doi.org/10.1093/comjnl/9.4.373) noticed that every common linkage can be updated from the old cluster distances alone:

$$D(A \cup B, C) = \alpha_A D(A, C) + \alpha_B D(B, C) + \beta\, D(A, B) + \gamma\, \lvert D(A, C) - D(B, C) \rvert$$

with different coefficients for each linkage. For single linkage, $$\alpha_A = \alpha_B = \tfrac{1}{2}$$, $$\beta = 0$$ and $$\gamma = -\tfrac{1}{2}$$. Check it: $$\tfrac{1}{2}(x + y) - \tfrac{1}{2}\lvert x - y \rvert = \min(x, y)$$. Complete linkage is the same with $$\gamma = +\tfrac{1}{2}$$, which gives $$\max(x, y)$$. The figure above uses this rule: one update per remaining cluster per merge.

### Ward's cost is the growth in inertia

Part 1 showed that for a cluster with mean $$\bar{x}$$, moving the centre to any other point $$\mu$$ adds exactly $$m \lVert \bar{x} - \mu \rVert^2$$ to its inertia, where $$m$$ is its size. Now merge $$A$$ and $$B$$. The new mean is

$$\mu = \frac{\lvert A \rvert\, \mu_A + \lvert B \rvert\, \mu_B}{\lvert A \rvert + \lvert B \rvert}$$

Measured from the new mean, $$A$$'s points cost $$\lvert A \rvert \lVert \mu_A - \mu \rVert^2$$ more than before, and $$B$$'s cost $$\lvert B \rvert \lVert \mu_B - \mu \rVert^2$$ more. Write $$a = \lvert A \rvert$$, $$b = \lvert B \rvert$$ and $$\delta = \mu_A - \mu_B$$. Then $$\mu_A - \mu = \frac{b}{a + b}\,\delta$$ and $$\mu_B - \mu = -\frac{a}{a + b}\,\delta$$, so the total increase is

$$a \frac{b^2}{(a + b)^2} \lVert \delta \rVert^2 + b \frac{a^2}{(a + b)^2} \lVert \delta \rVert^2 = \frac{ab\,(a + b)}{(a + b)^2} \lVert \delta \rVert^2 = \frac{ab}{a + b} \lVert \mu_A - \mu_B \rVert^2$$

That's the Ward distance. Every point starts with inertia 0, and each merge adds its cost, so the inertia of the clusters left after any number of merges is the sum of the costs so far. That's the 17.08 = 17.08 in the last step.

Ward is still greedy. Each merge is the cheapest one available _now_, which is not always the cheapest path to k clusters. That's why it can end above the best k-means answer.

### Single linkage is a minimum spanning tree

A **spanning tree** connects all the points with $$n - 1$$ edges and no loops. The **minimum spanning tree** (MST) is the one with the smallest total edge length. Kruskal's algorithm builds it greedily: go through all pairs in order of distance, and keep an edge whenever it joins two pieces that aren't connected yet.

That's single linkage exactly. Two clusters' single-linkage distance is their closest pair, so "merge the two closest clusters" is "add the shortest edge that joins two pieces". The lines drawn on the plot during the merges are the edges of the MST ([Gower and Ross, 1969](https://doi.org/10.2307/2346439)).

So cutting the single-linkage tree into k clusters is the same as deleting the k − 1 longest edges of the MST. This is also why it chains: one short edge is all it takes to join two groups, however thin the bridge.

### The tree is a distance

The dendrogram defines a new distance between points: the **cophenetic distance** $$c(x, y)$$, the height at which $$x$$ and $$y$$ first end up in the same cluster. It satisfies a stronger rule than the triangle inequality:

$$c(x, z) \le \max\big(c(x, y),\, c(y, z)\big)$$

To see why, let $$h = \max(c(x, y), c(y, z))$$. At height $$h$$, $$x$$ is in the same cluster as $$y$$, and $$y$$ in the same cluster as $$z$$. So all three are in one cluster, and $$x$$ met $$z$$ at height $$h$$ or below. A distance with this property is called an **ultrametric**. Hierarchical clustering can be seen as replacing the real distances with the closest ultrametric, for some meaning of "closest" that depends on the linkage.

### How slow is it?

The plain loop above does, for each of its $$n - 1$$ merges, a search over up to $$n^2/2$$ pairs: $$O(n^3)$$ time, and $$O(n^2)$$ memory for the distances. Smarter versions do better. Single linkage can be done in $$O(n^2)$$ time and $$O(n)$$ memory ([Sibson, 1973](https://doi.org/10.1093/comjnl/16.1.30)), and [Müllner (2011)](https://arxiv.org/abs/1109.2378) describes fast algorithms for the others. But anything that looks at every pair is at least $$O(n^2)$$, which is about 5 × 10¹¹ distances for a million points.

### Top-down instead of bottom-up

Everything here was **agglomerative**: bottom-up, merging. The other direction, **divisive** clustering, starts with one cluster and keeps splitting it. One simple version is _bisecting k-means_: run k-means with k = 2 on the biggest cluster, and repeat. It's fast, since each split is a cheap k-means run, and it gives a tree too, but its splits are only as good as k-means is on each piece.

## Further reading

- J. Ward, [_Hierarchical Grouping to Optimize an Objective Function_](https://doi.org/10.1080/01621459.1963.10500845) (1963): the Ward criterion.
- G. Lance and W. Williams, [_A General Theory of Classificatory Sorting Strategies_](https://doi.org/10.1093/comjnl/9.4.373) (1967): the one update rule for all linkages.
- R. Sibson, [_SLINK: an optimally efficient algorithm for the single-link cluster method_](https://doi.org/10.1093/comjnl/16.1.30) (1973).
- D. Müllner, [_Modern hierarchical, agglomerative clustering algorithms_](https://arxiv.org/abs/1109.2378) (2011): fast algorithms for every linkage, and the basis of SciPy's implementation.
- SciPy, [`scipy.cluster.hierarchy.linkage`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.cluster.hierarchy.linkage.html): every linkage here, plus dendrogram plotting.

{% include cl-series.liquid %}
