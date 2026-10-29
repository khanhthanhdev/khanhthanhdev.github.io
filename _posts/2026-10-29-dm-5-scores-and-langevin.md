---
layout: post
title: "diffusion models from scratch, part 5: scores and Langevin dynamics"
date: 2026-10-29 00:00:00 +0700
description: the other road to diffusion models, from Song and Ermon's 2019 paper, where a network learns the gradient of the log density and Langevin dynamics follows it, worked through on a two-mode mixture where plain Langevin gets the proportions wrong and annealing over noise levels fixes it
tags: ai generative-models diffusion interactive
categories: explainer
series: diffusion-models-from-scratch
part: 5
math: true
toc:
  beginning: true
css:
  - /assets/css/screen-works.css
  - /assets/css/transformer.css
  - /assets/css/diffusion.css
js:
  - /assets/js/diffusion/dm-core.js
  - /assets/js/diffusion/dm-weights.js
  - /assets/js/transformer/tf-view.js
  - /assets/js/diffusion/dm-view.js
  - /assets/js/diffusion/part5.js
  - /assets/js/diffusion/dm-scrolly.js
---

{% include dm-series.liquid %}

Parts 1 to 4 built diffusion models the way the 2015 paper and DDPM did: as a chain of Gaussian steps, trained with a variational bound. There is a second road to the same place, and it starts from a different question. Instead of "where was this point one step ago?", it asks **"which way is the data?"**

In 2019, a year before DDPM, Yang Song and Stefano Ermon published [_Generative modeling by estimating gradients of the data distribution_](https://arxiv.org/abs/1907.05600). Their network learns the **score**, the gradient of the log density, at many levels of noise. To sample, they follow the score uphill with a little noise mixed in, from the blurriest level down to the sharpest. Their CIFAR-10 model set a new record Inception Score for unconditional models (8.87).

DDPM's paper pointed out that the two methods are close relatives. [Part 6]({% post_url 2026-10-29-dm-6-sdes %}) shows they are the same model. This part builds the score view from scratch, on a dataset made to show its one big trap.

## The toy data

Two round blobs, one on the left holding 70% of the points and one on the right holding 30%, with almost nothing in between. A good sampler has to get two things right: the shape of each blob, and the 70/30 split. The second turns out to be the hard part.

Like the spiral, this dataset is a known mixture of Gaussians, so its true score can be computed exactly at any noise level. The figures use it to check both the samplers and a network trained on samples alone.

## Following the score

<section class="tf-scrolly" data-dm-scene="part5">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="data" data-title="Two modes, 70 and 30." markdown="1">
**Here is the data**: 500 points, about 70% in the left blob and 30% in the right. The shading is the density $$p(x)$$, the thing a generative model is supposed to capture.

A density has to integrate to 1. That one constraint is what makes most flexible models hard to train: the normalising constant of an arbitrary function is an integral over the whole space, which nobody can compute in high dimensions. The score side-steps it entirely.

</div>

<div class="tf-step" data-step="score" data-title="The score: which way is up." markdown="1">
**The score** of a density is the gradient of its logarithm:

$$s(x) = \nabla_x \log p(x)$$

At every point it is an arrow pointing towards higher density, longer where the density climbs faster. The arrows show it here (their length is capped so the far field stays readable).

The normalising constant disappears: if $$p(x) = f(x)/Z$$, then $$\log p = \log f - \log Z$$, and the gradient of the constant $$\log Z$$ is zero. So a network can model the score with no constraint at all on its output. That's the appeal.

</div>

<div class="tf-step" data-step="langevin" data-title="Langevin dynamics." markdown="1">
**Given the score, how do you sample?** Climbing it would pile every point onto the peaks. **Langevin dynamics** climbs with noise:

$$x \leftarrow x + \frac{\alpha}{2}\,\nabla_x \log p(x) + \sqrt{\alpha}\; z, \qquad z \sim \mathcal{N}(0, I)$$

The uphill pull and the random kick balance so that, with a small step $$\alpha$$ and enough steps, the points end up distributed exactly as $$p(x)$$. It's the same equation physicists use for a particle jiggling in a potential well.

Scroll to watch 500 points start from uniform noise and run 1,000 steps, using the exact score. The lines follow five of them. Each point slides into the nearest blob and then jiggles around inside it.

</div>

<div class="tf-step" data-step="weights" data-title="The proportions come out wrong." markdown="1">
**Now count.** After 1,000 steps, about 55% of the points are in the left blob, not 70%. The chart tracks the share over the run: it hardly moves from where it started. Each point stayed in whichever blob it first fell into, so the split reflects the starting positions, not the data.

That isn't a bug in the code. Song and Ermon explain it in two lines: inside the left blob, $$\log p(x) = \log 0.7 + \log p_\text{left}(x)$$, and the gradient of the constant $$\log 0.7$$ is zero. **The score doesn't know the weights.** Only the thin region between the blobs carries that information, and a point almost never crosses it. Langevin dynamics would fix the split eventually, but "eventually" here is astronomically long.

</div>

<div class="tf-step" data-step="learned" data-title="A learned score is worst where there is no data." markdown="1">
**There is a second problem once the score is learned.** A network trained on samples only sees samples. Between and around the blobs there are none, so nothing tells it what the score should be there.

This network was trained with **denoising score matching** ([below](#dsm)) on noisy copies of the data. Here it is at its least noisy level, $$\sigma = 0.03$$: red is learned, green is true, and the green only shows where the two disagree. The strip measures the average angle between them in three regions. The error is smallest where the data is dense and grows where the data thins out, most visibly in the gap between the blobs.

In two dimensions the network gets away with it: the plane is small, and even the empty regions are close to some data. In image space almost everything is empty. Song and Ermon found that a score network trained at one small noise level and sampled with plain Langevin dynamics failed to produce reasonable images at all.

</div>

<div class="tf-step" data-step="noise" data-title="Noise fills the gaps." markdown="1">
**Song and Ermon's fix for both problems: add noise to the data.** Blur every point with Gaussian noise of size $$\sigma$$, and the density spreads out. Scroll to raise $$\sigma$$ from 0.03 to 4, through 10 levels spaced geometrically.

At large $$\sigma$$ the blobs merge into one smooth hill that covers the whole plane. Two things improve at once. The score is now defined and well estimated everywhere, because noisy training samples land everywhere. And the bigger blob makes a bigger hill, so **the weights are visible again** in the shape of the blurred density.

The price is that the blurred density isn't the data. So they learn the score at every level, with one network that is told the level: a **noise-conditional score network**.

</div>

<div class="tf-step" data-step="annealed" data-title="Annealed Langevin dynamics." markdown="1">
**To sample, anneal.** Start at the blurriest level and run Langevin dynamics there; at that level everything is one hill, and points spread out in the right proportions. Then step down to the next level and continue from where you are, and so on, down to $$\sigma = 0.03$$. This is Algorithm 1 of the paper:

for $$i$$ from the noisiest level to the cleanest, set $$\alpha_i = \epsilon\,\sigma_i^2/\sigma_\text{min}^2$$ and run 100 steps of $$x \leftarrow x + \tfrac{\alpha_i}{2}\,s_\theta(x, \sigma_i) + \sqrt{\alpha_i}\,z$$.

The step size shrinks with the noise, so each level moves points about as far, relative to its blur. Scroll to watch all 1,000 steps, using the trained network. The chart shows the left share settling near 70% as the levels come down.

</div>

<div class="tf-step" data-step="result" data-title="Side by side." markdown="1">
**The two samplers, side by side.** Left: plain Langevin with the exact score. Right: annealed Langevin with the learned score, which never saw a density, only noisy samples.

The annealed sampler recovers the 70/30 split and the shape of both blobs, even though its score is an imperfect, learned one. The plain sampler, with the exact score, keeps the split it happened to start with.

</div>

<div class="tf-step" data-step="same" data-title="Scores and noise are the same thing." markdown="1">
**Now look back at [part 4]({% post_url 2026-10-29-dm-4-ddpm %}).** Its network predicts the noise $$\varepsilon$$ in a noisy point. For Gaussian noise, the best noise prediction and the score of the noisy data are the same thing up to a scale:

$$\nabla_{x_t} \log q_t(x_t) = -\frac{\mathbb{E}[\varepsilon \mid x_t]}{\sqrt{1 - \bar\alpha_t}}$$

The figure takes the spiral network from parts 1 to 4, which was never told about scores, and turns its output into one with that formula (red). Green is the exact score of the noised spiral. Scroll to change the step. They agree closely: DDPM's network _is_ a noise-conditional score network, and its sampler is a kind of annealed Langevin dynamics. Part 6 makes that exact.

</div>

  </div>
</section>

## The whole thing in a few lines

Pick noise levels $$\sigma_1 > \sigma_2 > \dots > \sigma_L$$ (Song and Ermon number them from the noisiest; the figures number them the other way, like DDPM's steps).

1. **Train** one network $$s_\theta(x, \sigma)$$ to be the score of the data blurred by $$\sigma$$, at every level, with denoising score matching:
   $$\sum_{i} \lambda(\sigma_i)\; \mathbb{E}_{x,\;\tilde x = x + \sigma_i\varepsilon}\Big[\big\lVert s_\theta(\tilde x, \sigma_i) + \tfrac{\tilde x - x}{\sigma_i^2}\big\rVert^2\Big], \qquad \lambda(\sigma) = \sigma^2$$
2. **Sample** with annealed Langevin dynamics: from noise, 100 Langevin steps at each level, from the noisiest to the cleanest, with step size $$\alpha_i = \epsilon\,\sigma_i^2/\sigma_L^2$$.

The paper's settings for images, and ours for the toy:

{: .tf-table}
| | Song and Ermon, images | this page |
| --- | --- | --- |
| noise levels | 10, from 1 to 0.01 (pixels in [0, 1]) | 10, from 4 to 0.03 |
| steps per level, $$T$$ | 100 | 100 |
| $$\epsilon$$ | $$2 \times 10^{-5}$$ | $$0.1\,\sigma_\text{min}^2 = 9 \times 10^{-5}$$ |
| start | uniform noise | uniform noise on $$[-3, 3]^2$$ |
| network | a U-Net-like RefineNet, conditional instance norm | 5,714-weight MLP |

Song and Ermon's own toy in Figure 3 is the same idea: a 1/5–4/5 mixture of two Gaussians, where plain Langevin with the exact score gets the proportions wrong and annealed Langevin gets them right.

With $$\lambda(\sigma) = \sigma^2$$ the loss becomes $$\lVert \sigma\, s_\theta + \varepsilon \rVert^2$$: predict $$-\varepsilon$$, scaled. That's why our page trains it exactly like part 4's network, predicting $$\varepsilon$$, and reads the score off as $$-\hat\varepsilon/\sigma$$.

## Going deeper

### Score matching {#score-matching}

How do you fit a network to $$\nabla \log p$$ without knowing $$p$$? The obvious loss, $$\mathbb{E}\lVert s_\theta(x) - \nabla \log p(x)\rVert^2$$, needs the true score. Aapo Hyvärinen showed in 2005 ([_Estimation of non-normalized statistical models by score matching_](https://jmlr.org/papers/v6/hyvarinen05a.html)) that, after integrating by parts, it equals (up to a constant)

$$\mathbb{E}_{p}\Big[\operatorname{tr}\big(\nabla_x s_\theta(x)\big) + \tfrac{1}{2}\lVert s_\theta(x)\rVert^2\Big]$$

which only needs samples. The catch is the trace of the Jacobian, which needs one backward pass per input dimension: fine for 2D points, hopeless for a 3,072-dimensional image. Song et al.'s sliced score matching (2019) replaces it with random projections.

### Denoising score matching {#dsm}

Pascal Vincent found a cheaper route in 2011 ([_A connection between score matching and denoising autoencoders_](https://doi.org/10.1162/NECO_a_00142)). Add noise, $$\tilde x = x + \sigma\varepsilon$$, and target the score of the _noisy_ data instead. Then

$$\mathbb{E}\big\lVert s_\theta(\tilde x) - \nabla \log q_\sigma(\tilde x)\big\rVert^2 \;=\; \mathbb{E}\Big\lVert s_\theta(\tilde x) - \nabla_{\tilde x}\log q_\sigma(\tilde x \mid x)\Big\rVert^2 + C$$

and the conditional score on the right is known: $$-(\tilde x - x)/\sigma^2 = -\varepsilon/\sigma$$. So you can train against the noise you added, the same regression as part 4. The best possible network is $$s^*(\tilde x) = -\mathbb{E}[\varepsilon \mid \tilde x]/\sigma$$, exactly the score of the blurred data, which is where the identity in the last step comes from.

The price is that you learn the score of $$q_\sigma$$, not of the data. That's harmless when $$\sigma$$ is tiny, and it is the whole point when $$\sigma$$ is large.

### Why Langevin dynamics samples from p

For a small step, the Langevin update is a discretisation of the stochastic differential equation $$dx = \tfrac{1}{2}\nabla \log p(x)\,dt + dW$$. Its distribution evolves by the Fokker–Planck equation, and one can check that $$p$$ is a fixed point of it: the drift pushes probability towards high density at exactly the rate that diffusion spreads it out. Under mild conditions it is the only fixed point, and the chain converges to it as the step size goes to 0 and the number of steps to infinity.

"Converges" says nothing about how fast. When the density has separate modes, the time to cross between them grows exponentially with the height of the low-density barrier. That's the trap in step 4, and the reason simulated annealing and annealed importance sampling, which inspired the paper, work at a sequence of temperatures.

### Why the weights are lost

Song and Ermon's argument, in full: let $$p = \pi p_1 + (1 - \pi) p_2$$ with $$p_1$$ and $$p_2$$ on disjoint regions. Where $$p_1$$ lives, $$\nabla \log p = \nabla \log(\pi p_1) = \nabla \log p_1$$, and likewise for $$p_2$$. Nowhere does $$\pi$$ appear. Any sampler that only uses the score at the points it visits, and never crosses between the regions, can't recover $$\pi$$.

Real modes are never perfectly disjoint, so the information is there in principle, in the faint density between them. Our blobs have spread 0.35 and sit 3.2 apart, so the density at the midpoint is about $$e^{-10}$$, three hundred-thousandths of the peak: in principle, yes; in practice, no.

### How to choose the noise levels

Song and Ermon's follow-up, [_Improved techniques for training score-based generative models_](https://arxiv.org/abs/2006.09011) (2020), gives rules of thumb. The largest $$\sigma$$ should be about as big as the largest distance between two training points, so that the blurriest level really is one hill; for our blobs that's 4 to 5, and we use 4. The ratio between neighbouring levels should be small enough that each blurred density overlaps well with the next, and the smallest $$\sigma$$ small enough that it's invisible. With those rules (and an exponential moving average of the weights) they scaled score models to 256 × 256 images.

### Same objective, different bookkeeping

Ho et al. noticed that DDPM's per-step loss with $$\varepsilon$$-prediction is a weighted denoising score matching loss, and that Algorithm 2 looks like annealed Langevin dynamics with one step per level. There are two differences in the bookkeeping. DDPM shrinks the data as it adds noise ($$\sqrt{\bar\alpha_t}\,x_0$$, variance preserving), while the score model only adds noise ($$x + \sigma\varepsilon$$, variance exploding). And DDPM takes one carefully sized step per level, while annealed Langevin takes 100 small ones. Part 6 shows both are discretisations of a stochastic differential equation, and that the same network can drive either sampler.

## Further reading

- Y. Song and S. Ermon, [_Generative modeling by estimating gradients of the data distribution_](https://arxiv.org/abs/1907.05600) (NeurIPS 2019): sections 3 and 4 are this whole page; Figure 3 is the mixture experiment.
- Y. Song, [_Generative modeling by estimating gradients of the data distribution_](https://yang-song.net/blog/2021/score/) (2021): the author's own long blog post on the score view.
- P. Vincent, [_A connection between score matching and denoising autoencoders_](https://doi.org/10.1162/NECO_a_00142) (Neural Computation, 2011).
- A. Hyvärinen, [_Estimation of non-normalized statistical models by score matching_](https://jmlr.org/papers/v6/hyvarinen05a.html) (JMLR, 2005).

{% include dm-series.liquid %}
