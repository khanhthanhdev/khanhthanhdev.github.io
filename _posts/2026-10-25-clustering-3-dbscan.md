---
layout: post
title: "clustering from scratch, part 3: DBSCAN and density"
date: 2026-10-25 00:00:02
description: clusters as crowded regions, grown point by point from core points, with a real notion of noise; DBSCAN run live, with ε and minPts on sliders
tags: ml clustering unsupervised interactive
categories: explainer
series: clustering-from-scratch
part: 3
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
  - /assets/js/clustering/part3.js
  - /assets/js/clustering/cl-scrolly.js
---

{% include cl-series.liquid %}

[Part 1]({% post_url 2026-10-25-clustering-1-k-means %}) and [part 2]({% post_url 2026-10-25-clustering-2-hierarchical %}) both put _every_ point in some cluster. Real data is rarely that tidy. Sensors glitch, people mistype, and some points simply don't belong to any group. Forcing them into a cluster drags that cluster's centre, or, as with single linkage, glues two clusters together through a thin bridge.

**DBSCAN** ([Ester et al., 1996](https://cdn.aaai.org/KDD/1996/KDD96-037.pdf)) takes a different view of what a cluster is: **a region where points are crowded together**, separated from other such regions by emptier space. Points in empty space aren't forced anywhere. They are labelled **noise**.

The name stands for _Density-Based Spatial Clustering of Applications with Noise_. It needs two numbers from us instead of k:

- **ε** (epsilon), a radius: how near counts as "nearby",
- **minPts**, a count: how many points within ε make a spot "crowded".

It never asks how many clusters there are. That comes out of the data.

## The toy data

The figure starts with three blobs of 20 points, plus **14 points scattered at random** over the whole square. Those 14 belong to no group. The menu has the earlier datasets and two new ones: a blob inside a ring, and a dense blob next to a sparse one. The sliders under the figure set ε and minPts, and every step reruns on the spot.

## DBSCAN, step by step

<section class="tf-scrolly" data-cl-scene="part3" data-dataset="noisy" data-datasets="noisy moons rings density blobs stretched bridge">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="noise" data-title="Some points belong nowhere." markdown="1">
**74 points**: three blobs, and 14 points scattered at random over the square. Those 14 aren't a cluster, and they aren't part of any blob.

k-means would hand each of them to the nearest centre, pulling the centres off towards them. DBSCAN will leave most of them out.

</div>

<div class="tf-step" data-step="eps" data-title="Count the neighbours within ε." markdown="1">
**Draw a circle of radius ε around a point** and count the points inside it, the point itself included. With the defaults, ε = 1 and minPts = 5.

The figure tries three points as you scroll:

- (2.7, 8.3), inside the top-left blob, has 5 points in its circle. That's at least minPts, so it is a **core point**: it sits somewhere crowded.
- (3.6, 5.9), at the edge of a blob, has only 3.
- (3.9, 8.7), out in the open, has 2.

The last two are not core points. We'll see in a moment that they end up very differently.

</div>

<div class="tf-step" data-step="core" data-title="Core points are the crowded ones." markdown="1">
**Do this for every point.** The ringed points are the core points, each drawn with its ε-circle. Here 52 of the 74 points are core.

Together the circles map out the dense regions. Where circles overlap, those core points are in the same dense region. Most scattered points have no circle: there's nothing near them.

</div>

<div class="tf-step" data-step="grow" data-title="Grow a cluster through its core points." markdown="1">
**Now build clusters.** Take any core point that isn't in a cluster yet, and start a new cluster with it. Then:

- every point within ε of it joins the cluster,
- each new point that is also **core** does the same, passing the cluster on to its own neighbours,
- a new point that is **not** core joins, but passes nothing on.

When the cluster stops growing, start the next one from another unused core point. The lines show who brought whom into each cluster. It's a flood fill: the cluster spreads as far as the crowd goes, and stops where the crowd thins out.

</div>

<div class="tf-step" data-step="border" data-title="Border points: in, but at the edge." markdown="1">
**Some points joined without being core.** They are within ε of a core point but don't have minPts neighbours themselves. These are **border points**: the thin edge of a cluster. Here there are 8.

Border points matter because of the rule above: they can't pass a cluster on. That's what stops a cluster from leaking out along a sparse trail of points, the way single linkage did across the bridge in part 2.

</div>

<div class="tf-step" data-step="result" data-title="Everything else is noise." markdown="1">
**Every point that is neither core nor within ε of a core is noise**, drawn hollow. It belongs to no cluster.

With the defaults: 3 clusters, 52 core points, 8 border points and 14 noise points. 10 of the 14 scattered points are among the noise. The other 4 happened to land close enough to a blob to join it, which is fair: from the data alone, nothing marks them as different.

Nobody told DBSCAN there were three clusters. The count came from the density.

</div>

<div class="tf-step" data-step="shapes" data-title="Any shape at all." markdown="1">
**Now switch the dataset.** A cluster is anything that's connected through crowded space, so its shape doesn't matter:

- **two moons**: both moons found, 97% agreement with the true groups, against 64% for k-means. Two points are left as noise; ε = 1.2 gets all of them.
- **ring around a blob**: the blob and the ring come out as two clusters, 100%. k-means can't do this at all (50%): the ring's centre is in the middle of the blob.

DBSCAN keeps single linkage's ability to follow chains of neighbours, but it only follows chains through crowded points.

</div>

<div class="tf-step" data-step="kdist" data-title="Choosing ε." markdown="1">
**The price is choosing ε and minPts.** Try the sliders. Small ε turns most points into noise. Large ε merges everything into one cluster.

A common guide is the **k-distance plot** on the right. For each point, find the distance to its minPts-th nearest point (counting itself), and sort these from largest to smallest. Points inside clusters have small values; noise points have large ones. Look for the **knee** where the curve flattens, and set ε near it.

The dashed line is the current ε. The 22 points above it can't be core points.

</div>

<div class="tf-step" data-step="density" data-title="One ε can't fit every density." markdown="1">
**Pick _dense and sparse_ from the menu.** One tight blob of 30 points, one loose blob of 30.

- With ε = 0.5, the dense blob is found but 23 of the sparse blob's 30 points are noise.
- With ε = 1, the sparse blob comes out as two pieces, and one of them is glued onto the dense blob.
- From ε = 1.3 up, the two blobs merge into a single cluster.

There's no ε that gets both right, because DBSCAN uses one density threshold for the whole dataset. Here k-means does better (93%). Fixing this is what OPTICS and HDBSCAN are for. [Going deeper](#varying-density) has the idea.

</div>

  </div>
</section>

## The whole thing in a few definitions

For a point $$p$$, write $$N_\varepsilon(p) = \{\, q : \lVert p - q \rVert \le \varepsilon \,\}$$ for its **ε-neighbourhood**, which includes $$p$$ itself.

- $$p$$ is a **core point** if $$\lvert N_\varepsilon(p) \rvert \ge \text{minPts}$$.
- $$q$$ is **directly reachable** from $$p$$ if $$p$$ is core and $$q \in N_\varepsilon(p)$$.
- $$q$$ is **reachable** from $$p$$ if there's a chain $$p = p_1, p_2, \dots, p_m = q$$ where each step is directly reachable. All but the last point of the chain must be core.
- A **cluster** is a core point together with everything reachable from it.
- A **noise point** is one that isn't reachable from any core point.

Reachability isn't symmetric: a border point is reachable from a core point, but nothing is reachable from a border point. So the paper also defines two points as **connected** if both are reachable from some common core point, and a cluster is exactly a maximal set of connected points.

## What's still missing

- **ε and minPts.** They are easier to reason about than k, but they still have to be chosen, and one pair has to fit the whole dataset.
- **Different densities.** The last step showed DBSCAN can't handle clusters that are crowded to different degrees.
- **High dimensions.** In many dimensions, distances between random points all become similar, so a radius ε stops separating "near" from "far".

None of the three methods so far says _how sure_ it is about a point. A point halfway between two blobs gets a hard yes or no. Part 4, **Gaussian mixtures**, gives every point a probability of belonging to each cluster, and fits clusters that can be stretched and tilted.

## Going deeper

### Clusters are connected pieces of a graph

Join every pair of _core_ points that are within ε of each other. That gives a graph on the core points. The clusters' core points are exactly the **connected components** of this graph: two core points are in the same cluster when a chain of core points, each within ε of the next, links them. That's the definition of reachability, restricted to core points.

Then each border point is attached to a component it is within ε of, and the points left over are noise. So DBSCAN is "find the connected components" plus a rule for the edges. That's also why it doesn't matter which core point a cluster grows from: the component is the same.

### DBSCAN generalises single linkage

Set minPts = 2. Then a point is core as soon as it has one other point within ε. The core graph joins any two points within ε, and its components are the clusters you get by cutting the [single-linkage tree]({% post_url 2026-10-25-clustering-2-hierarchical %}) at height ε. The only difference is that single linkage would call an isolated point a cluster of one, where DBSCAN calls it noise.

Raising minPts is what stops the chaining. A bridge one point wide has points with only two or three neighbours each, so they aren't core, and the cluster can't flow across. Try _bridged blobs_ with ε = 1: at minPts = 2 the two blobs come out as one cluster of 32, and at minPts = 5 as two clusters of 16 and 15.

### Border points depend on the order

The core points and the noise points don't depend on the order DBSCAN visits points in. Border points can. A border point within ε of core points from _two_ clusters joins whichever cluster reaches it first. That's rare and only affects points on the edge, but it means DBSCAN isn't perfectly deterministic. A variant called **DBSCAN\*** sidesteps it by treating all border points as noise.

### Choosing minPts

The original paper suggests minPts = 4 for 2-D data, and a common rule is minPts = 2 × the number of dimensions. Larger values make the method more robust to noise and give smoother clusters, at the cost of losing small clusters entirely. [Schubert et al. (2017)](https://doi.org/10.1145/3068335) revisit these choices and give practical advice for setting both parameters.

The k-distance plot works because of how the two kinds of points behave. Inside a cluster, the distance to the minPts-th neighbour is roughly the spacing between points, which is small and about the same for every point. For noise, it's the distance across empty space, which is large. Sorted, the noise points form the steep start of the curve, and the cluster points the long flat tail. The knee is where one group ends.

### How fast is it?

The work is in the neighbourhood queries: for each point, find everything within ε. Done naively, that's $$n$$ distances per query and $$O(n^2)$$ overall, which is what this page does. With a spatial index (a grid, or a tree like a k-d tree), each query only looks at nearby points. When ε is small compared with the spread of the data, that's much faster in practice. The original paper claimed $$O(n \log n)$$ on average, but in the worst case, when ε is so large that every point neighbours every other, nothing beats $$O(n^2)$$.

### Handling different densities {#varying-density}

DBSCAN draws one horizontal cut through the data's density: above the threshold set by ε and minPts is cluster, below is noise. Two ideas fix the single cut.

**OPTICS** ([Ankerst et al., 1999](https://doi.org/10.1145/304181.304187)) records, for each point, the smallest ε at which it would become reachable. That gives an ordering of the points from which the DBSCAN result for _every_ ε can be read off, much like cutting a dendrogram at any height.

**HDBSCAN** ([Campello et al., 2013](https://doi.org/10.1007/978-3-642-37456-2_14)) goes further. Let $$\text{core}_k(p)$$ be the distance from $$p$$ to its k-th nearest neighbour, which is small in dense regions. HDBSCAN replaces every distance by the **mutual reachability distance**:

$$d_{mr}(a, b) = \max\big(\text{core}_k(a),\ \text{core}_k(b),\ \lVert a - b \rVert\big)$$

That pushes sparse points away from everything while leaving dense regions as they are. Then it runs single linkage on these distances, and instead of one horizontal cut, it picks the clusters that survive longest in the tree. Each cluster effectively gets its own ε.

## Further reading

- M. Ester, H.-P. Kriegel, J. Sander and X. Xu, [_A Density-Based Algorithm for Discovering Clusters in Large Spatial Databases with Noise_](https://cdn.aaai.org/KDD/1996/KDD96-037.pdf) (1996): the original DBSCAN paper.
- E. Schubert, J. Sander, M. Ester, H.-P. Kriegel and X. Xu, [_DBSCAN Revisited, Revisited_](https://doi.org/10.1145/3068335) (2017): how to choose the parameters, and how fast it really is.
- M. Ankerst, M. Breunig, H.-P. Kriegel and J. Sander, [_OPTICS: Ordering Points To Identify the Clustering Structure_](https://doi.org/10.1145/304181.304187) (1999).
- L. McInnes, J. Healy and S. Astels, [_How HDBSCAN Works_](https://hdbscan.readthedocs.io/en/latest/how_hdbscan_works.html): an illustrated walk through HDBSCAN.

{% include cl-series.liquid %}
