---
layout: post
title: "diffusion models from scratch, part 7: deterministic sampling with the probability flow ODE and DDIM"
date: 2026-10-29 00:00:00 +0700
description: how removing the noise from sampling gives a deterministic map from noise to data, why DDIM samples well in ten times fewer steps with the same trained network, how to encode a point into noise and back, and how the same equation gives exact likelihoods, checked against the true density of the toy spiral
tags: ai generative-models diffusion interactive
categories: explainer
series: diffusion-models-from-scratch
part: 7
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
  - /assets/js/diffusion/part7.js
  - /assets/js/diffusion/dm-scrolly.js
---

{% include dm-series.liquid %}

Every sampler so far adds fresh noise at every step: DDPM's Algorithm 2, Langevin dynamics, the reverse SDE. That noise is part of why sampling took 1,000 network calls. DDPM generated 50,000 small CIFAR-10 images in about 20 hours; a GAN does it in under a minute.

In October 2020, two papers removed the noise. [Song, Meng and Ermon's _Denoising diffusion implicit models_](https://arxiv.org/abs/2010.02502) (DDIM) found a deterministic sampler that works with any network already trained as in DDPM, and samples well in 10 to 50 times fewer steps. A month later, [Song et al.'s SDE paper](https://arxiv.org/abs/2011.13456) from part 6 derived the continuous version, the **probability flow ODE**, an ordinary differential equation whose solutions have exactly the same distribution as the reverse SDE at every moment.

Removing the noise does more than save time. It turns the model into a fixed, invertible map between noise and data: the same noise always gives the same sample, any data point can be encoded into noise and decoded back, and the model's exact likelihood can be computed. This part shows all of that with the network from part 4, still not retrained.

## Taking the noise out

<section class="tf-scrolly" data-dm-scene="part7">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="ode" data-title="Drop the noise." markdown="1">
**Here is the probability flow ODE** for an SDE $$dx = f\,dt + g\,dw$$:

$$\frac{dx}{dt} = f(x, t) - \tfrac{1}{2}\,g(t)^2\,\nabla_x \log p_t(x)$$

Compared with the reverse SDE of part 6, the noise term is gone, and the score term is halved. Starting from the same noise, the figure runs both: the black paths are the ODE, smooth curves straight to the spiral; the faint red paths are the SDE, jittering their way there.

Each ODE path is fixed by its starting point. There is nothing random after the first draw of $$x_T$$.

Notice how little the ODE moves at first. While $$p_t$$ is still close to a standard Gaussian, its score is about $$-x$$, and the two terms $$-\tfrac12\beta x$$ and $$-\tfrac12\beta\,s$$ nearly cancel. Almost all of the motion happens in the last stretch, as the spiral emerges.

</div>

<div class="tf-step" data-step="marginals" data-title="Same distribution, at every moment." markdown="1">
**Why halve the score?** The SDE's noise spreads the cloud out, and its full score term pulls it back in. Drop the noise, and you also have to drop half the pull, or the cloud would collapse. With exactly half, the ODE moves its cloud through the same sequence of distributions $$p_t$$ as the SDE. [Going deeper](#why-half) has the one-line check with the Fokker–Planck equation.

The chart measures it: at each time $$t$$, the distance from the ODE's cloud (blue) and the SDE's cloud (red) to the exact distribution of the data noised to that time. Both stay at the level of a real sample all the way down.

Individual paths are completely different. The distributions are the same.

</div>

<div class="tf-step" data-step="ddim" data-title="DDIM: the same idea, discretely." markdown="1">
**DDIM reaches the same place from a different direction.** Song, Meng and Ermon noticed that DDPM's training loss only depends on the one-jump marginals $$q(x_t \mid x_0)$$ of part 2, not on the forward process being a chain. So there is a whole family of forward processes with the same marginals, and one network trained with $$L_\text{simple}$$ serves all of them.

Their sampler predicts the clean point, then jumps to any earlier step $$s$$:

$$\hat x_0 = \frac{x_t - \sqrt{1-\bar\alpha_t}\,\varepsilon_\theta(x_t, t)}{\sqrt{\bar\alpha_t}}, \qquad x_s = \sqrt{\bar\alpha_s}\,\hat x_0 + \sqrt{1 - \bar\alpha_s - \sigma^2}\;\varepsilon_\theta(x_t, t) + \sigma z$$

The parameter $$\eta$$ sets $$\sigma$$: $$\eta = 1$$ is DDPM's ancestral sampler on the shortened chain, and $$\eta = 0$$ adds no noise at all. Here are both with only 10 steps.

</div>

<div class="tf-step" data-step="steps" data-title="Few steps: what you gain." markdown="1">
**Now vary the number of steps.** The chart shows DDIM ($$\eta = 0$$), DDPM ($$\eta = 1$$) and, for comparison, part 6's Euler solver for the ODE.

The paper's finding shows up on the toy: with few steps, the deterministic sampler beats the noisy one, and with many steps the noisy one catches up and passes it. On CIFAR-10 the paper measured FIDs of 13.4 against 41.1 at 10 steps and 4.7 against 8.0 at 50.

The toy adds a lesson of its own: at 10 steps, the plain Euler solver is better than DDIM here. Both converge to the same ODE as the steps shrink (with 200 steps their samples are within 0.005 of each other). With few steps, _how_ you take them, and where you put them, matters as much as which equation you solve. Part 11 is about exactly that.

</div>

<div class="tf-step" data-step="consistent" data-title="Same noise, same sample." markdown="1">
**A deterministic sampler is a function** from noise to data. Start from the same $$x_T$$ with 10, 20, 50 and 200 DDIM steps, and the eight lines show where eight samples end up: always on nearly the same spot of the spiral, with the coarse runs slightly off.

The DDIM paper calls this **consistency**, and it means $$x_T$$ works as a code for the sample: the same code decodes to the same image at any step count, and interpolating between two codes gives a smooth path between two samples. A stochastic sampler has no such code: two DDPM runs from the same $$x_T$$ end in unrelated places, as the strip shows.

</div>

<div class="tf-step" data-step="invert" data-title="Encode a point, then decode it." markdown="1">
**A deterministic map can be run backwards.** Solve the ODE from $$t = 0$$ to $$t = 1$$, and a data point becomes its noise code; solve it back, and you get the point again. The figure does it with 50 DDIM steps each way for eight points (black: forward to noise, hollow circles; red: back again).

**Click anywhere on the plot** to encode your own point. Points on the spiral come back to where they started, up to the error of 50 steps. Points off the spiral come back too, since the map is invertible, but their codes give them away: a point in an empty corner encodes to "noise" dozens of units from the origin, where real Gaussian noise almost never lands (its typical size is about 1.25). The strip shows the size of each code.

That's the basis of a whole family of image-editing methods: encode a real photo, change something about its code or about the conditioning, and decode.

</div>

<div class="tf-step" data-step="likelihood" data-title="Exact likelihoods." markdown="1">
**An invertible map gives exact probabilities**, the same way normalising flows do. As points flow along the ODE, the density along each path changes by the divergence of the velocity field:

$$\log p_0(x_0) = \log p_1(x_1) + \int_0^1 \nabla \cdot v(x_t, t)\, dt, \qquad v = f - \tfrac12 g^2\,\nabla \log p_t$$

and $$p_1$$ is the standard Gaussian. The figure computes this for 40 test points with the network, and compares it with their exact log density, which we know for the toy. Each dot is one point: the model's log-likelihood (up) against the truth (across).

They line up along the diagonal. This is how the SDE paper reported likelihoods for score-based models: 2.99 bits per dimension on CIFAR-10 (with uniform dequantisation), a record at the time.

</div>

  </div>
</section>

## The whole thing in a few lines

For a forward SDE $$dx = f\,dt + g\,dw$$ with marginals $$p_t$$, the **probability flow ODE**

$$\frac{dx}{dt} = f(x, t) - \tfrac12\,g(t)^2\,s_\theta(x, t)$$

has the same marginals, once the score network is good. For the VP SDE, $$f = -\tfrac12\beta(t)\,x$$ and $$g^2 = \beta(t)$$. Solving it from $$x_1 \sim \mathcal{N}(0, I)$$ to $$t = 0$$ samples; solving it forward encodes; integrating the divergence along the way gives the exact log-likelihood.

DDIM is a particular discretisation of it, written in DDPM's variables. Rewrite the DDIM step with $$\bar x = x/\sqrt{\bar\alpha}$$ and $$\bar\sigma = \sqrt{(1-\bar\alpha)/\bar\alpha}$$, and it is one Euler step of $$d\bar x = \varepsilon_\theta\, d\bar\sigma$$, the probability flow ODE in those variables.

{: .tf-table}
| sampler | noise per step | deterministic | typical steps (images) |
| --- | --- | --- | --- |
| DDPM ancestral (part 4) | yes | no | 1,000 |
| reverse SDE, Euler–Maruyama (part 6) | yes | no | hundreds to 1,000 |
| DDIM, $$\eta = 0$$ | no | yes | 20 to 100 |
| probability flow ODE, adaptive solver | no | yes | chosen by the solver (RK45 in the SDE paper) |

The DDIM paper's CIFAR-10 results (FID, lower is better; quadratic step spacing):

{: .tf-table}
| steps | 10 | 20 | 50 | 100 | 1000 |
| --- | --- | --- | --- | --- | --- |
| DDIM, $$\eta = 0$$ | 13.36 | 6.84 | 4.67 | 4.16 | 4.04 |
| DDPM, $$\eta = 1$$ | 41.07 | 18.36 | 8.01 | 5.78 | 4.73 |

And on the toy, with 2,000 samples each (distance to the true spiral; 2,000 real points sit at 0.025):

{: .tf-table}
| steps | 5 | 10 | 20 | 50 | 100 |
| --- | --- | --- | --- | --- | --- |
| DDIM, $$\eta = 0$$ | 0.302 | 0.133 | 0.072 | 0.044 | 0.038 |
| DDPM, $$\eta = 1$$ | 0.342 | 0.166 | 0.085 | 0.031 | 0.023 |
| Euler on the ODE | | 0.050 | 0.038 | 0.034 | 0.034 |

Note the last column: with enough steps, the noisy sampler ends closer to the data than any deterministic one. Noise along the way corrects some of the network's errors; a deterministic path carries them all the way to the end. Part 11 shows that the best samplers mix the two.

## Going deeper

### Why the score is halved {#why-half}

The density of the SDE $$dx = f\,dt + g\,dw$$ obeys the Fokker–Planck equation of part 6:

$$\partial_t p_t = -\nabla\cdot(f\,p_t) + \tfrac12 g^2\,\nabla^2 p_t$$

Since $$\nabla^2 p = \nabla\cdot(\nabla p) = \nabla\cdot(p\,\nabla\log p)$$, the diffusion term can be written as a flow too:

$$\partial_t p_t = -\nabla\cdot\Big(\big[f - \tfrac12 g^2\,\nabla \log p_t\big]\, p_t\Big)$$

That is the continuity equation for points moving deterministically with velocity $$v = f - \tfrac12 g^2\nabla\log p_t$$. So the ODE with that velocity moves densities exactly as the SDE does. The half comes from the $$\tfrac12$$ in front of the diffusion term.

### DDIM's family of forward processes

DDIM defines a forward process that is not a Markov chain: each $$x_{t-1}$$ depends on both $$x_t$$ and $$x_0$$,

$$q_\sigma(x_{t-1}\mid x_t, x_0) = \mathcal{N}\Big(\sqrt{\bar\alpha_{t-1}}\,x_0 + \sqrt{1-\bar\alpha_{t-1}-\sigma_t^2}\,\frac{x_t - \sqrt{\bar\alpha_t}\,x_0}{\sqrt{1-\bar\alpha_t}},\; \sigma_t^2 I\Big)$$

chosen so that every one-jump marginal is still $$q(x_t\mid x_0) = \mathcal{N}(\sqrt{\bar\alpha_t}\,x_0, (1-\bar\alpha_t)I)$$. Their Theorem 1 shows that the variational bound for any member of this family equals DDPM's, up to weights per step and a constant. With $$L_\text{simple}$$, where the weights are dropped anyway, one trained network fits every $$\sigma$$. The sampler replaces $$x_0$$ by the network's $$\hat x_0$$.

Because only the marginals matter, the sampler can also skip steps: any increasing subsequence of $$1, \dots, T$$ defines a valid shorter process. That's where the speed comes from. The paper spaced the steps evenly for most datasets and quadratically (crowded near the data) for CIFAR-10.

### Why the deterministic map is a good code

The probability flow ODE's map from data to noise has no learned parts except the score. Unlike a VAE's or a GAN's latent space, it isn't chosen by training; it is determined by the data distribution and the forward SDE. The SDE paper calls this **uniquely identifiable encoding**: two well-trained models of the same data give (nearly) the same code for the same point. Our inversion error at 50 steps is 0.064 on average for points on the spiral, and 0.013 with 200 steps; the spiral's spread is about 1.

### Computing the divergence

In 2D the divergence of the score network is just two derivatives, which the figure gets by finite differences (two extra network calls per step). In $$d = 3{,}072$$ dimensions that would cost thousands of calls per step. The SDE paper uses the **Skilling–Hutchinson trace estimator** instead, $$\nabla\cdot v = \mathbb{E}_z[z^\top (\partial v/\partial x)\, z]$$ for random $$z$$, which needs one vector–Jacobian product per step, the same trick as FFJORD's continuous normalising flows.

### What the likelihood measures here

The figure compares the model's log density of a point with the exact log density of the data after one step of noise, $$t = 1/200$$, where the ODE stops (one more step to $$t = 0$$ would need the density of the noiseless data, which for a real dataset of discrete images isn't even defined without dequantisation). On the 40 test points, the model's average log-likelihood is within a few hundredths of a nat of the truth (−1.27 against −1.26 in our run). With the exact score in place of the network, the gap is about 0.03, which is the error of the 200-step solver itself; individual points scatter more, by up to a few tenths of a nat.

## Further reading

- J. Song, C. Meng and S. Ermon, [_Denoising diffusion implicit models_](https://arxiv.org/abs/2010.02502) (ICLR 2021): sections 3 to 5; Table 1 is the comparison above.
- Y. Song et al., [_Score-based generative modeling through stochastic differential equations_](https://arxiv.org/abs/2011.13456) (ICLR 2021): section 4.3 and appendix D, the probability flow ODE and its likelihoods.
- C. Lu, Y. Zhou, F. Bao, J. Chen, C. Li and J. Zhu, [_DPM-Solver_](https://arxiv.org/abs/2206.00927) (2022): higher-order solvers for the same ODE, good samples in 10 to 20 steps.

{% include dm-series.liquid %}
