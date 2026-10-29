---
layout: post
title: "diffusion models from scratch, part 11: the design space, after EDM"
date: 2026-10-29 00:00:00 +0700
description: how Karras, Aittala, Aila and Laine took diffusion models apart into independent choices (the noise levels, the solver, where to put the steps, how to scale the network's inputs and outputs, which noise levels to train on), and what each one buys, measured on the toy spiral with the exact denoiser and with networks trained both ways
tags: ai generative-models diffusion interactive
categories: explainer
series: diffusion-models-from-scratch
part: 11
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
  - /assets/js/diffusion/part11.js
  - /assets/js/diffusion/dm-scrolly.js
---

{% include dm-series.liquid %}

By 2022 the field had DDPM and its variance-preserving SDE, score models and their variance-exploding SDE, DDIM, learned variances, and a dozen samplers, each paper with its own notation and derivation. Changing one piece usually meant re-deriving everything, because each method came as a tightly coupled package.

[Karras, Aittala, Aila and Laine's _Elucidating the design space of diffusion-based generative models_](https://arxiv.org/abs/2206.00364) (2022), known as **EDM**, untangled the package. They rewrote every model in one common form, showed that the choices inside it are independent of each other, and then picked the best option for each, mostly from first principles. Their result set records on CIFAR-10 (FID 1.79) with only 35 network evaluations per image, and their sampler alone, dropped into an existing ImageNet model without retraining, took its FID from 2.07 to 1.55.

This part goes through EDM's choices one at a time, and measures each on the toy, with the exact denoiser where that isolates a choice and with networks where it doesn't. The toy's gains turn out smaller than the paper's, which says something too.

## One equation, many choices

<section class="tf-scrolly" data-dm-scene="part11">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="denoiser" data-title="Everything is a denoiser." markdown="1">
**EDM's first move is a change of variables.** Write a noisy point as the data plus scaled noise, $$x = y + \sigma\, n$$, with no shrinking: the VE convention, with the noise level $$\sigma$$ itself as "time". VP models fit in by rescaling: their $$x_\text{VP}$$ is $$x/\sqrt{1+\sigma^2}$$, with $$\sigma^2 = (1-\bar\alpha)/\bar\alpha$$.

In these coordinates, every network in this series is a **denoiser** $$D(x; \sigma)$$, an estimate of $$\mathbb{E}[y \mid x]$$: noise prediction, score and $$x_0$$ prediction are all rewritings of it. And the probability flow ODE of part 7 becomes

$$\frac{dx}{d\sigma} = \frac{x - D(x; \sigma)}{\sigma}$$

Scroll to lower $$\sigma$$ from 5 to 0.05. The arrows go from noisy points to the exact denoiser's answers, the best guess of where each started.

</div>

<div class="tf-step" data-step="straight" data-title="Straight paths, bent at the end." markdown="1">
**The coordinates matter for how hard the ODE is to solve.** A solver with few steps does well when paths are nearly straight. Here are the same 40 ODE paths, from $$\sigma = 5$$ to 0, drawn two ways: in VP coordinates (left, the space DDPM works in) and in EDM's coordinates (right, zoomed out).

In EDM's coordinates the paths are close to straight lines: at large $$\sigma$$, $$D$$ hardly changes, so each path heads straight for it. The strip measures the ratio of path length to straight-line distance. Measured from $$\sigma = 80$$, EDM's paths come out at 1.004 and VP's at 1.78.

But look at the end of each path: all the bending happens at small $$\sigma$$, where the denoiser's answer jumps from "somewhere on the spiral" to "this exact arm". That is where a solver's steps should go.

</div>

<div class="tf-step" data-step="heun" data-title="A better solver: Heun's method." markdown="1">
**Euler's method** takes a step along the slope at its start. **Heun's method** takes the same step, looks at the slope where it lands, and redoes the step with the average of the two. It costs two denoiser calls per step instead of one, and its error per step shrinks with the cube of the step size instead of the square.

The chart uses the exact denoiser, so the only error is the solver's: the average distance from where a very fine solution ends. With 33 or 65 calls, Heun is two to four times closer than Euler for the same budget. With 9 or 17 calls it is worse: its steps are then so large that the second slope is taken somewhere unhelpful.

EDM's sampler is Heun with 18 steps, 35 calls (the last step, to $$\sigma = 0$$, is a plain Euler step).

</div>

<div class="tf-step" data-step="rho" data-title="Where to put the steps." markdown="1">
**EDM spaces the noise levels by a power law**:

$$\sigma_i = \Big(\sigma_\text{max}^{1/\rho} + \tfrac{i}{N-1}\big(\sigma_\text{min}^{1/\rho} - \sigma_\text{max}^{1/\rho}\big)\Big)^{\rho}, \qquad \sigma_\text{max} = 80,\; \sigma_\text{min} = 0.002$$

With $$\rho = 1$$ the steps are evenly spaced in $$\sigma$$; larger $$\rho$$ crowds them towards small $$\sigma$$. Scroll through $$\rho = 1$$, 3 and 7. The chart shows where 18 steps land, on a log scale.

The strip gives Heun's error with each. Evenly spaced steps are hopeless, because nearly all of them land at large $$\sigma$$, where the paths are straight and nothing happens. Karras et al. found that $$\rho = 3$$ roughly equalises the error of each step, but $$\rho = 7$$ gave the best images, and on the toy it is also the best.

</div>

<div class="tf-step" data-step="precond" data-title="Keep the network's job at unit scale." markdown="1">
**Now the network.** At $$\sigma = 80$$ the input $$x$$ has values in the hundreds; at $$\sigma = 0.002$$ it is almost the data. And the right output changes character too: at small $$\sigma$$, $$D$$ is almost $$x$$; at large $$\sigma$$, it's almost the data's mean. Asking one network to produce $$D$$ directly across all of that is asking for trouble.

EDM wraps the network $$F$$ in scalings chosen so that $$F$$'s input and its training target both have unit variance at every $$\sigma$$:

$$D(x;\sigma) = c_\text{skip}(\sigma)\,x + c_\text{out}(\sigma)\,F\big(c_\text{in}(\sigma)\,x;\; c_\text{noise}(\sigma)\big)$$

The chart shows the three scalings for our data ($$\sigma_\text{data} = 1$$). At small $$\sigma$$, $$c_\text{skip} \to 1$$: pass $$x$$ through, and let $$F$$ add a small correction. At large $$\sigma$$, $$c_\text{skip} \to 0$$: $$F$$ predicts the clean data itself. In between, it predicts a mix of noise and data.

DDPM's choice, predicting the noise, is the special case $$c_\text{skip} = 1$$, $$c_\text{out} = -\sigma$$: fine at small $$\sigma$$, but at large $$\sigma$$ it multiplies the network's error by $$\sigma$$.

</div>

<div class="tf-step" data-step="noise" data-title="Train where it matters." markdown="1">
**Which noise levels should training see?** DDPM picks a step $$t$$ uniformly, which maps to the blue density of $$\ln\sigma$$: a lot of training at very large $$\sigma$$, where every answer is nearly the data's mean and there's little to learn.

EDM draws $$\ln\sigma$$ from a normal distribution with mean $$-1.2$$ and standard deviation $$1.2$$ (red), concentrating training where the denoiser's job is hardest and its answer matters most. With the preconditioning above, it also weights the loss so that every noise level starts at the same scale.

Scroll to see training examples across the range of $$\sigma$$ that EDM samples.

</div>

<div class="tf-step" data-step="result" data-title="The whole recipe on the toy." markdown="1">
**Put it all together** and compare three samplers at 17, 35 and 79 network calls:

- DDIM with the part 4 network (part 7);
- EDM's Heun sampler ($$\rho = 7$$) with the same part 4 network, read as a denoiser;
- EDM's sampler with a network trained with EDM's preconditioning, noise distribution and loss weighting.

The honest summary: on this toy, EDM's full recipe is the best at 79 calls, and roughly tied with the alternatives at 35. At 17 its first Heun steps, which start from $$\sigma = 80$$, are too coarse. Scroll to see the EDM samples at each budget.

</div>

  </div>
</section>

## The whole thing in a few lines

EDM's recipe, with the paper's settings:

{: .tf-table}
| choice | EDM | why |
| --- | --- | --- |
| noise schedule and scaling | $$\sigma(t) = t$$, $$s(t) = 1$$ | the ODE's paths are nearly straight at large $$\sigma$$ |
| solver | Heun (2nd order), Euler for the last step | more accuracy per network call once steps are fine enough |
| time steps | $$\rho = 7$$ spacing, $$\sigma$$ from 80 to 0.002 | crowd the steps where the paths bend |
| preconditioning | $$c_\text{skip} = \tfrac{\sigma_d^2}{\sigma^2 + \sigma_d^2}$$, $$c_\text{out} = \tfrac{\sigma\sigma_d}{\sqrt{\sigma^2 + \sigma_d^2}}$$, $$c_\text{in} = \tfrac{1}{\sqrt{\sigma^2 + \sigma_d^2}}$$, $$c_\text{noise} = \tfrac14\ln\sigma$$ | unit-variance input and target at every $$\sigma$$ |
| training noise | $$\ln\sigma \sim \mathcal{N}(-1.2,\, 1.2^2)$$ | spend training where it matters |
| loss weighting | $$\lambda(\sigma) = (\sigma^2 + \sigma_d^2)/(\sigma\sigma_d)^2$$ | equal effective weight at every $$\sigma$$ |

with $$\sigma_d = 0.5$$ for images scaled to $$[-1, 1]$$ (we use 1, our data's spread).

The paper's results: CIFAR-10 FID 1.79 (class-conditional) and 1.97 (unconditional) with 35 network evaluations; ImageNet 64 × 64 FID 1.36 after retraining ADM's network with the recipe; and ADM's original ImageNet-64 model improved from 2.07 to 1.55 by the sampler alone.

On the toy (2,000 samples, distance to the true spiral; 2,000 real points: 0.025):

{: .tf-table}
| network calls | 17 | 35 | 79 |
| --- | --- | --- | --- |
| DDIM, part 4 network | 0.074 | 0.053 | 0.040 |
| Euler in VP time (part 6), part 4 network | 0.040 | 0.034 | 0.034 |
| EDM sampler, part 4 network | 0.078 | 0.036 | 0.035 |
| EDM sampler, EDM-trained network | 0.124 | 0.035 | 0.029 |

## Going deeper

### Why the toy gains are small

The paper's gains come from images, and three things differ on the toy. Our network is tiny and our data two-dimensional, so the network's own error, not the solver's, sets the floor early: every sampler reaches about 0.035 by 35 calls. The spiral is very thin (each of its blobs has spread 0.07), so almost all of the ODE's curvature sits at very small $$\sigma$$, where DDPM's even steps in $$t$$ happen to be dense already. And EDM's $$\sigma_\text{max} = 80$$ is tuned for images with $$\sigma_d = 0.5$$; on our data, the first few steps from $$\sigma = 80$$ are spent where nothing happens, which is what hurts at 17 calls. The design space idea is exactly what makes this easy to see: each choice can be changed and measured on its own.

### Stochastic sampling, revisited

EDM also studied adding noise back during sampling: at each step, raise the noise level a little ("churn", controlled by $$S_\text{churn}$$), then take the ODE step from there. Like part 6's corrector, this corrects some of the errors that accumulate along a deterministic path. Karras et al. found it helped less as models got better: with their best CIFAR-10 models, deterministic sampling was best, while ImageNet-64 still benefited from some stochasticity. It also needs care: too much churn washes out detail and oversaturates colours, so they restricted it to a middle range of $$\sigma$$ and inflated the added noise slightly ($$S_\text{noise} > 1$$).

### Where the preconditioning comes from

Each scaling falls out of one requirement. Require $$F$$'s input to have unit variance: since $$x = y + \sigma n$$ has variance $$\sigma_d^2 + \sigma^2$$, $$c_\text{in} = 1/\sqrt{\sigma^2 + \sigma_d^2}$$. Write the loss in terms of $$F$$: its effective target is $$(y - c_\text{skip}\,x)/c_\text{out}$$. Require that target to have unit variance, and choose $$c_\text{skip}$$ to make $$c_\text{out}$$ as small as possible, so the network's errors are amplified as little as possible; that gives the formulas in the table. Finally, set $$\lambda(\sigma) = 1/c_\text{out}^2$$, so that the loss in terms of $$F$$ has weight 1 at every $$\sigma$$.

### What the change of variables did not change

The denoiser view doesn't make DDPM, score models or DDIM wrong. It shows they are the same ODE (or SDE) with different parameterisations of time, scale and network output, and different discretisations. That is also why the part 4 network, trained the DDPM way, can be dropped into EDM's sampler unchanged: it is already a denoiser, $$D(x;\sigma) = x - \sigma\,\varepsilon_\theta(x/\sqrt{1+\sigma^2},\, t(\sigma))$$, the VP column of EDM's Table 1.

## Further reading

- T. Karras, M. Aittala, T. Aila and S. Laine, [_Elucidating the design space of diffusion-based generative models_](https://arxiv.org/abs/2206.00364) (NeurIPS 2022): Table 1 lines up every model's choices side by side; Algorithm 1 is the Heun sampler.
- T. Karras et al., [_Analyzing and improving the training dynamics of diffusion models_](https://arxiv.org/abs/2312.02696) (2024): EDM2, the follow-up, on network design and training at ImageNet scale.
- C. Lu et al., [_DPM-Solver_](https://arxiv.org/abs/2206.00927) (2022): solvers that exploit the ODE's structure analytically, good samples in 10 to 20 steps.

{% include dm-series.liquid %}
