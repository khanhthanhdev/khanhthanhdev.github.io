---
layout: post
title: "clustering from scratch, part 4: Gaussian mixtures and EM"
date: 2026-10-25 00:00:03
description: clusters as overlapping, tilted Gaussian blobs, fitted by the EM algorithm; soft assignments, the log-likelihood that only goes up, and choosing k with BIC, all run live
tags: ml clustering unsupervised interactive
categories: explainer
series: clustering-from-scratch
part: 4
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
  - /assets/js/clustering/part4.js
  - /assets/js/clustering/cl-scrolly.js
---

{% include cl-series.liquid %}

Every method so far has given each point a single, definite answer: this cluster, or noise. But some points really are ambiguous. A point exactly halfway between two blobs belongs to each about equally, and pretending otherwise throws information away.

[Part 1]({% post_url 2026-10-25-clustering-1-k-means %}) also left k-means with round clusters only. Real groups are often stretched, tilted, or of different sizes.

A **Gaussian mixture model** fixes both. It describes the data as a blend of a few **Gaussian** (bell-shaped) blobs, each with its own centre, its own shape and tilt, and its own share of the points. Fitting one gives every point a **probability** of belonging to each blob. The algorithm that fits it, **EM**, turns out to be a soft version of k-means.

## The toy data

The figure starts with **78 points** in three long, tilted blobs: two parallel ones at the top, very close together, and one flatter one below. The menu has the earlier datasets too. _New start_ under the figure tries another starting guess.

## Gaussian mixtures, step by step

<section class="tf-scrolly" data-cl-scene="part4" data-dataset="tilted" data-datasets="tilted stretched uneven blobs density moons">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="hard" data-title="k-means draws hard, straight borders." markdown="1">
**First, k-means**, the best of 10 starts with k = 3. It gets most points right, 92% agreement with the true groups, but look at the borders.

The two top blobs are long and tilted. k-means only knows distance to a centre, so its borders are straight lines halfway between centres, and they cut across the ends of the blobs. And every point gets one colour, even those that sit right on a border.

</div>

<div class="tf-step" data-step="gaussian" data-title="A Gaussian has a centre and a shape." markdown="1">
**A 2-D Gaussian** is a bell-shaped hill of probability. It's described by two things:

- its **mean** μ, the centre of the hill,
- its **covariance** Σ, a 2 × 2 matrix that sets the hill's width in each direction and its tilt.

The ellipses mark where the hill is 1 and 2 standard deviations from its centre (in 2-D, they contain about 39% and 86% of its points). Here a single Gaussian is fitted to all 78 points: mean (4.61, 5.10), and a covariance with 3.78 and 3.98 on its diagonal and 0.19 off it. Nearly round, because the three blobs together fill the square.

One Gaussian is a poor description of three blobs. A mixture of three should do better.

</div>

<div class="tf-step" data-step="mixture" data-title="Three Gaussians, from a rough first guess." markdown="1">
**A mixture of k Gaussians** says each point was made in two steps: first pick one of the k components at random, with probabilities $$\pi_1, \dots, \pi_k$$ (the **weights**), then draw the point from that component's Gaussian.

We don't know any of the parameters, and we don't know which component made which point. EM needs a starting guess. Here: three means picked by k-means++, each component given the covariance of the whole dataset, and equal weights of 1/3. That's why the three ellipses start out the same size and nearly round.

</div>

<div class="tf-step" data-step="estep" data-title="E step: how likely is each component?" markdown="1">
**E step.** For each point, ask: given the current guesses, how likely is it that each component made this point? By Bayes' rule, the answer for component _j_ is proportional to its weight times its density at the point:

$$r_{ij} = \frac{\pi_j\, \mathcal{N}(x_i \mid \mu_j, \Sigma_j)}{\sum_m \pi_m\, \mathcal{N}(x_i \mid \mu_m, \Sigma_m)}$$

These are the **responsibilities**. Each point's add up to 100%. The figure walks through the points: each one takes the colour of its most likely component, and the fainter it is, the less sure. The first point, (5.6, 9.0), is 73% component 2 and 26% component 1.

With such a rough start, almost everything is unsure: 77 of the 78 points are under 90% for any one component.

</div>

<div class="tf-step" data-step="mstep" data-title="M step: refit each Gaussian." markdown="1">
**M step.** Now refit each Gaussian, using every point, but counting each one by its responsibility. A point that is 73% component 2 counts as 0.73 of a point there and 0.26 of a point in component 1. So for component _j_:

- its **weight** is its share of all the responsibility,
- its **mean** is the responsibility-weighted average of the points,
- its **covariance** is the responsibility-weighted spread around that mean.

It's the k-means update step, with fractional members. The ellipses move, and start to stretch along their blobs.

</div>

<div class="tf-step" data-step="iterate" data-title="Repeat, and the fit only improves." markdown="1">
**Alternate the two steps.** Better parameters give sharper responsibilities, which give better parameters.

The chart tracks the **log-likelihood**: how probable the whole dataset is under the current mixture, on a log scale. It rises after every round, from −342.16 at the start to −320.97 after the first M step, and never falls. [Going deeper](#why-em-works) proves it can't.

Watch the two top ellipses: they tilt to match their blobs, and narrow until they lie side by side.

</div>

<div class="tf-step" data-step="result" data-title="Converged: tilted, sized, and soft." markdown="1">
**EM stops when the log-likelihood stops improving.** Here that's after 17 rounds, at −246.27.

Each component found its blob's shape: the two top ellipses are long and tilted, the bottom one long and flat. The assignment, taking each point's most likely component, agrees with the true groups 100%, against 92% for k-means.

And the uncertainty is still there where it matters: the point at (3.1, 3.2), where the tail of a top blob reaches the bottom one, is only 88% sure. On _stretched_ the mixture gets 100% where k-means got 78%.

</div>

<div class="tf-step" data-step="choosek" data-title="Choosing k with BIC." markdown="1">
**More components always fit better**, just as more centres always lowered the inertia in part 1. So the log-likelihood alone can't pick k.

The **Bayesian information criterion** (BIC) adds a penalty for every parameter:

$$\text{BIC} = -2 \log L + p \log n$$

where _p_ is the number of numbers the model needs. Lower is better. Each 2-D component costs 5 (2 for the mean, 3 for the covariance), plus one weight.

Move the slider, or keep scrolling. BIC is lowest at k = 3: 566.60, against 620.01 for 2 and 584.05 for 4.

</div>

<div class="tf-step" data-step="limits" data-title="Gaussians are still blobs." markdown="1">
**Switch to _two moons_.** A mixture of two Gaussians does no better than k-means here (57% against 64%): a moon isn't an ellipse.

BIC is honest about it, though. On the moons it prefers 6 components to 2: the best description of a curved cluster, in Gaussians, is several overlapping ones. A mixture model describes where the points are dense; it doesn't know which components "belong together".

That's the trade-off of the whole series. k-means and Gaussian mixtures assume a shape and are fast; hierarchical and density-based methods follow any shape, but need a distance threshold.

</div>

  </div>
</section>

## The whole thing in two lines

A mixture of $$k$$ Gaussians gives a point $$x$$ the density

$$p(x) = \sum_{j=1}^{k} \pi_j\, \mathcal{N}(x \mid \mu_j, \Sigma_j), \qquad \mathcal{N}(x \mid \mu, \Sigma) = \frac{\exp\!\big(-\tfrac{1}{2}(x - \mu)^\top \Sigma^{-1} (x - \mu)\big)}{2\pi \sqrt{\det \Sigma}}$$

(that's the 2-D version of the Gaussian), and EM fits it by repeating

$$\textbf{E:}\quad r_{ij} = \frac{\pi_j\, \mathcal{N}(x_i \mid \mu_j, \Sigma_j)}{\sum_m \pi_m\, \mathcal{N}(x_i \mid \mu_m, \Sigma_m)}$$

$$\textbf{M:}\quad N_j = \sum_i r_{ij}, \quad \pi_j = \frac{N_j}{n}, \quad \mu_j = \frac{1}{N_j} \sum_i r_{ij}\, x_i, \quad \Sigma_j = \frac{1}{N_j} \sum_i r_{ij} (x_i - \mu_j)(x_i - \mu_j)^\top$$

until the log-likelihood $$\log L = \sum_i \log p(x_i)$$ stops rising.

Side by side with k-means:

{: .tf-table}
| | k-means | Gaussian mixture |
| -------------- | ------------------------------ | --------------------------------------- |
| a cluster is | a centre | a mean, a covariance and a weight |
| a point is | in one cluster | in every cluster, with a probability |
| borders are | straight lines | curves (conic sections) |
| step 1 | assign to the nearest centre | E: responsibilities by Bayes' rule |
| step 2 | centre = mean of members | M: weighted mean, covariance and weight |
| it maximises | −inertia | log-likelihood |

## Wrapping up the series

Four algorithms, four answers to "what is a cluster?":

- **k-means**: points near the same centre. Fast and simple; round clusters of similar size.
- **Hierarchical**: points joined by short links, at every scale at once. No k up front; slow on big data.
- **DBSCAN**: points in the same crowded region. Any shape, and real noise; one density for everything.
- **Gaussian mixtures**: points drawn from the same tilted bell curve. Soft answers and elliptical shapes; still blobs.

None is best everywhere, which is why scikit-learn's [comparison page](https://scikit-learn.org/stable/modules/clustering.html) shows a whole grid of them on toy datasets much like the ones here. The useful question is which assumption fits your data.

## Going deeper

### Why the log-likelihood never goes down {#why-em-works}

Write $$z_i$$ for the (unknown) component that made point $$i$$, and $$\theta$$ for all the parameters. For any probabilities $$q_i(j)$$ over the components, multiply and divide by $$q_i(j)$$ inside the log-likelihood of one point:

$$\log p(x_i \mid \theta) = \log \sum_j q_i(j)\, \frac{p(x_i, z_i = j \mid \theta)}{q_i(j)} \ \ge\ \sum_j q_i(j) \log \frac{p(x_i, z_i = j \mid \theta)}{q_i(j)}$$

The inequality is **Jensen's**: the log of an average is at least the average of the logs, because log is concave. Call the right side, summed over points, $$B(q, \theta)$$. It's a lower bound on $$\log L(\theta)$$ for any $$q$$.

The gap between the two sides is $$\sum_i \text{KL}\big(q_i \,\|\, p(z_i \mid x_i, \theta)\big)$$, which is zero exactly when $$q_i$$ is the posterior $$p(z_i = j \mid x_i, \theta)$$, that is, the responsibilities. So:

- **E step**: set $$q$$ to the responsibilities under the current $$\theta_{old}$$. Now $$B(q, \theta_{old}) = \log L(\theta_{old})$$: the bound touches the curve.
- **M step**: choose $$\theta_{new}$$ to maximise $$B(q, \theta)$$. Then

$$\log L(\theta_{new}) \ \ge\ B(q, \theta_{new}) \ \ge\ B(q, \theta_{old}) = \log L(\theta_{old})$$

The first $$\ge$$ holds because $$B$$ is a lower bound, the second because $$\theta_{new}$$ maximises it. So the log-likelihood can't go down. This is the general argument of [Dempster, Laird and Rubin (1977)](https://doi.org/10.1111/j.2517-6161.1977.tb01600.x), and it works for any model with hidden variables, not just Gaussian mixtures.

### Where the M-step formulas come from

With $$q$$ fixed, the part of $$B$$ that depends on component $$j$$ is

$$\sum_i r_{ij} \big(\log \pi_j + \log \mathcal{N}(x_i \mid \mu_j, \Sigma_j)\big)$$

**The mean.** $$\log \mathcal{N}$$ contains $$-\tfrac{1}{2}(x_i - \mu_j)^\top \Sigma_j^{-1} (x_i - \mu_j)$$, whose gradient in $$\mu_j$$ is $$\Sigma_j^{-1}(x_i - \mu_j)$$. Set the weighted sum to zero:

$$\Sigma_j^{-1} \sum_i r_{ij} (x_i - \mu_j) = 0 \quad\Rightarrow\quad \mu_j = \frac{\sum_i r_{ij}\, x_i}{\sum_i r_{ij}}$$

Part 1's "why the mean", with weights.

**The weights.** Maximise $$\sum_j N_j \log \pi_j$$ subject to $$\sum_j \pi_j = 1$$. With a Lagrange multiplier $$\lambda$$, the derivative in $$\pi_j$$ is $$N_j / \pi_j - \lambda = 0$$, so $$\pi_j \propto N_j$$, and the constraint gives $$\pi_j = N_j / n$$.

**The covariance.** The same idea, differentiating with respect to $$\Sigma_j^{-1}$$ (using $$\partial \log\det A / \partial A = A^{-\top}$$), gives the responsibility-weighted covariance.

### k-means is EM in the limit

Fix every covariance to $$\sigma^2 I$$ (round, all the same size) and every weight to $$1/k$$. Then the responsibilities are

$$r_{ij} = \frac{\exp\!\big(-\lVert x_i - \mu_j \rVert^2 / 2\sigma^2\big)}{\sum_m \exp\!\big(-\lVert x_i - \mu_m \rVert^2 / 2\sigma^2\big)}$$

a softmax of minus the squared distances, at temperature $$2\sigma^2$$. As $$\sigma \to 0$$, the nearest centre's term dominates every other, and $$r_{ij}$$ becomes 1 for the nearest centre and 0 for the rest. The E step becomes k-means' assign step, and the M step for the means becomes its update step. So k-means is "hard EM" for a mixture of tiny, identical, round Gaussians, which is why it likes round clusters of similar size.

### The likelihood can be infinite

Put one component's mean exactly on a data point, and shrink its covariance towards zero. Its density at that point grows without limit, so the log-likelihood goes to $$+\infty$$. The "best" fit is a useless spike.

EM rarely walks into this from a sensible start, but it can, especially with many components and few points. The standard fix is to add a small number to the covariance's diagonal at every M step. This page adds $$10^{-6}$$, the same default as scikit-learn's `reg_covar`. A more principled fix puts a prior on the covariances, which turns maximum likelihood into maximum a posteriori estimation.

### Local maxima, again

EM only climbs. Like k-means, it stops at the top of whichever hill it started on. On the default points, 40 of 100 different starts end at a clearly lower log-likelihood than the best. Libraries run several starts (scikit-learn's `n_init`) and keep the best, and usually start from a k-means solution.

### Counting parameters for BIC

A 2-D component has 2 numbers in its mean and 3 in its covariance (it's symmetric, so the two off-diagonal entries are the same number). The $$k$$ weights add up to 1, so only $$k - 1$$ are free. In total,

$$p = 5k + (k - 1) = 6k - 1$$

The $$\log n$$ factor comes from [Schwarz (1978)](https://doi.org/10.1214/aos/1176344136): it's what you get approximating the probability of the data under the model, averaged over all parameter values, for large $$n$$. Its practical meaning: an extra parameter has to raise the log-likelihood by about $$\tfrac{1}{2} \log n$$ to be worth it. With 78 points, that's about 2.2 per parameter, or 13 per extra component.

### Fewer parameters per component

A full covariance has $$d(d+1)/2$$ numbers in $$d$$ dimensions: 5,050 for $$d = 100$$. With few points, that's far too many to estimate. Common restrictions, as in scikit-learn's `covariance_type`:

{: .tf-table}
| type | each component's shape | numbers per covariance |
| --------- | ------------------------------------------ | --------------------- |
| full | any ellipse, any tilt | $$d(d+1)/2$$ |
| diagonal | an ellipse aligned with the axes | $$d$$ |
| spherical | a circle (a sphere) | 1 |
| tied | full, but the same for every component | $$d(d+1)/2$$, shared |

Spherical, with equal weights and $$\sigma \to 0$$, is k-means again.

## Further reading

- A. Dempster, N. Laird and D. Rubin, [_Maximum Likelihood from Incomplete Data via the EM Algorithm_](https://doi.org/10.1111/j.2517-6161.1977.tb01600.x) (1977): EM in general.
- C. Bishop, _Pattern Recognition and Machine Learning_ (2006), chapter 9: mixtures, EM and the k-means connection, with the bound argument above.
- G. Schwarz, [_Estimating the Dimension of a Model_](https://doi.org/10.1214/aos/1176344136) (1978): the BIC.
- scikit-learn, [_Gaussian mixture models_](https://scikit-learn.org/stable/modules/mixture.html): covariance types, BIC model selection and a Bayesian variant that picks k by itself.

{% include cl-series.liquid %}
