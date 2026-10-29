---
layout: post
title: "diffusion models from scratch, part 12: where it went next, with flow matching, one-step models and transformers"
date: 2026-10-29 00:00:00 +0700
description: the ideas that took diffusion models from 2022 to today's image and video generators, from flow matching and rectified flow's straight paths, through reflow, distillation and consistency models that sample in one step, to the diffusion transformer, with a toy where one round of reflow makes one-step sampling as good as the data, and a map of the whole series
tags: ai generative-models diffusion interactive
categories: explainer
series: diffusion-models-from-scratch
part: 12
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
  - /assets/js/diffusion/part12.js
  - /assets/js/diffusion/dm-scrolly.js
---

{% include dm-series.liquid %}

Parts 1 to 11 followed diffusion models from the 2015 idea to EDM in 2022. Since then, three lines of work have reshaped the field, and the newest image and video generators combine all three.

**Straighter paths.** Flow matching ([Lipman et al., 2022](https://arxiv.org/abs/2210.02747)) and rectified flow ([Liu, Gong and Liu, 2022](https://arxiv.org/abs/2209.03003)) train a network to move noise to data along straight lines, a simpler objective with the same structure as diffusion. **Fewer steps.** Distillation and consistency models ([Song, Dhariwal, Chen and Sutskever, 2023](https://arxiv.org/abs/2303.01469)) compress the many-step sampler into one or two network calls. **A different network.** The diffusion transformer ([Peebles and Xie, 2023](https://arxiv.org/abs/2212.09748)) replaced the U-Net, and turned out to scale with compute as transformers do elsewhere.

This last part shows the first two on the toy, draws the third, and ends with a map of how the whole series fits together.

## Straight paths and fewer steps

<section class="tf-scrolly" data-dm-scene="part12">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="lines" data-title="Train on straight lines." markdown="1">
**Flow matching starts from the simplest path between a data point and noise**: a straight line, walked at constant speed,

$$x_t = (1 - t)\,y + t\,z, \qquad t \in [0, 1]$$

with $$y$$ from the data and $$z \sim \mathcal{N}(0, I)$$. (The papers put noise at $$t = 0$$; we keep it at $$t = 1$$, like the rest of the series.) A network $$v_\theta(x_t, t)$$ is trained to predict the line's velocity, $$z - y$$, with a squared error. The red segments are a few such training paths; the blue curves are the diffusion paths between the same pairs, $$\sqrt{\bar\alpha_t}\,y + \sqrt{1-\bar\alpha_t}\,z$$, which bend.

Both are the same kind of model: a velocity field whose ODE carries noise to data. Lipman et al. showed that diffusion is flow matching with a particular curved path, and that a Gaussian path of any shape can be trained the same way.

</div>

<div class="tf-step" data-step="flow" data-title="Sampling a flow." markdown="1">
**To sample, follow the learned velocity backwards**, from noise at $$t = 1$$ to data at $$t = 0$$, here with 50 Euler steps: $$x \leftarrow x - v_\theta(x, t)\,\Delta t$$.

This network has the same size as part 4's and was trained for the same number of steps. With 50 steps its samples are as good as diffusion's (on 2,000 samples: 0.029, against 0.034 for part 7's ODE with the same number of steps).

</div>

<div class="tf-step" data-step="bend" data-title="The learned paths still bend." markdown="1">
**Each training path is straight, but the learned ones are not.** Many lines pass through the same point $$x_t$$, coming from different data points towards different noise. The network can only learn their average direction, and the average of straight lines that cross is a curve.

On this toy, the first flow's sampling paths are actually _more_ curved than diffusion's ODE paths: the strip measures total path length over total straight-line distance. The spiral's arms are thin and far apart, so the average over crossing lines changes direction sharply late in the path. So with few steps, this flow does worse than diffusion (one Euler step: 0.80 against 0.13).

</div>

<div class="tf-step" data-step="reflow" data-title="Reflow: straighten by retraining." markdown="1">
**Liu et al.'s fix is to retrain on the flow's own pairs.** Run the first flow from 20,000 noise points to get 20,000 samples. Now each noise point is paired with _its own_ sample, and the pairs no longer cross: the flow already sorted out which noise goes where. Train a second flow on straight lines between those pairs.

The result is almost perfectly straight: total length over total distance 1.001. This is **reflow**, and the new model is a "2-rectified flow".

</div>

<div class="tf-step" data-step="onestep" data-title="One step." markdown="1">
**Straight paths can be followed in one step.** The chart shows the distance to the spiral after 1 to 16 Euler steps, for diffusion's ODE, the first flow, and the reflowed one.

After reflow, **one step** is as good as the first flow with 50: 0.028 on 2,000 samples, against 0.025 for 2,000 real points. One network call, from noise straight to a sample. Scroll to see the reflowed samples at each step count.

The catch: reflow learns the first flow's map, so it can't be better than that map, and it needed a whole first model and 20,000 simulated samples to train. On images the paths are never quite this straight, and Liu et al. added a distillation step for one-step sampling.

</div>

<div class="tf-step" data-step="consistency" data-title="Consistency models." markdown="1">
**Consistency models attack the step count directly.** Take the probability flow ODE of part 7. Every point on one of its paths leads to the same end, the sample. Train a network $$f(x_t, t)$$ to output that end from _any_ point of the path:

$$f(x_t, t) = f(x_{t'}, t') \quad \text{for any } t, t' \text{ on the same path}, \qquad f(x, \epsilon) = x$$

Then $$f(z, T)$$ is a one-step sampler. Song et al. train it by asking neighbouring points on a path to agree, either using a pretrained diffusion model to find the neighbours (**consistency distillation**) or with no diffusion model at all (**consistency training**). Like EDM, they write $$f = c_\text{skip}\,x + c_\text{out}\,F$$, which builds in $$f(x, \epsilon) = x$$.

With distillation they reached a one-step FID of 3.55 on CIFAR-10 (2.93 with two steps), and 6.20 on ImageNet 64 × 64.

</div>

<div class="tf-step" data-step="dit" data-title="Transformers instead of U-Nets." markdown="1">
**The network changed too.** Peebles and Xie took latent diffusion (part 10) and swapped its U-Net for a standard vision transformer. The noisy latent is cut into $$2 \times 2$$ patches, each patch becomes a token, and a stack of transformer blocks processes the tokens. The step $$t$$ and the class come in through **adaLN-Zero**: they set each block's normalisation scale and shift (like ADM's AdaGN in part 8), plus a gate on each residual branch that starts at zero, so every block begins as the identity.

Their finding: sample quality tracked the network's compute per forward pass very closely, whatever mix of depth, width and patch size provided it. Their largest model, DiT-XL/2, reached an FID of 2.27 on ImageNet 256 × 256, the best at the time, using less compute per step than pixel-space U-Nets.

</div>

  </div>
</section>

## The whole thing in a few lines

**Flow matching** trains a velocity field on a chosen path between noise and data. With straight paths:

$$L = \mathbb{E}_{t,\, y,\, z}\,\big\lVert v_\theta\big((1-t)\,y + t\,z,\; t\big) - (z - y)\big\rVert^2$$

Lipman et al. proved that this per-pair ("conditional") loss has the same gradient as matching the true, intractable marginal velocity field, the same trick as denoising score matching in part 5. Diffusion is the special case of a particular Gaussian path.

**Rectified flow** uses the same straight paths and adds **reflow**: retrain on (noise, sample) pairs produced by the previous flow, which straightens the paths further each round.

**Consistency models** learn the map from any point of a probability flow path to its end, by distillation from a diffusion model or by training alone, and sample in one or a few steps.

**Diffusion transformers** replace the U-Net with a transformer over latent patches, conditioned with adaLN-Zero, and scale with compute.

On the toy (2,000 samples, distance to the true spiral; 2,000 real points: 0.025):

{: .tf-table}
| Euler steps | 1 | 2 | 4 | 8 | 16 | 50 |
| --- | --- | --- | --- | --- | --- | --- |
| diffusion ODE, part 4 network | 0.134 | 0.134 | 0.082 | 0.051 | 0.037 | 0.034 |
| flow matching, straight paths | 0.802 | 0.374 | 0.170 | 0.083 | 0.046 | 0.029 |
| after one reflow | 0.028 | 0.027 | 0.027 | 0.027 | 0.027 | 0.027 |

These ideas now run together. Stable Diffusion 3 ([Esser et al., 2024](https://arxiv.org/abs/2403.03206)) is a latent rectified flow with a transformer backbone. OpenAI described its video model Sora as a diffusion transformer working on patches of video latents. Fast variants of these models are distilled to a few steps.

## The whole series in one picture

Twelve parts, six ideas. Each idea showed up early and kept coming back.

{: .tf-table}
| idea | where it starts | where it comes back |
| --- | --- | --- |
| **Destroy slowly, undo slowly.** Small noise steps make each reverse step nearly Gaussian. | part 1 | every later improvement takes fewer, larger steps without losing that: DDIM (7), learned variances (8), EDM (11), reflow (12) |
| **One network, several readings.** Noise, clean data, score, denoiser and velocity predictions are rewritings of each other. | parts 4 and 5 | the score view (5), the SDE view (6), EDM's denoiser (11), flow matching's velocity (12) |
| **Training is denoising.** Every loss in the series is a squared error on noisy examples, weighted over noise levels. | part 4 | denoising score matching (5), $$L_\text{simple}$$ against the bound (4), EDM's weighting and noise distribution (11), flow matching (12) |
| **Sampling is solving a differential equation.** | part 6 | ancestral sampling, Euler–Maruyama and predictor–corrector (6), DDIM and the probability flow ODE (7), Heun (11), straight flows (12) |
| **Guidance is adding a gradient.** | part 1's conditioning, part 6 | classifier and classifier-free guidance (9), text through cross-attention (10) |
| **Spend capacity where it matters.** | part 2's cosine schedule | the lossy-compression reading of the bound (4), latent diffusion (10), EDM's noise distribution (11), transformers that scale (12) |

## Going deeper

### Why the conditional loss works

The velocity a flow needs at a point $$x$$ and time $$t$$ is the average of the velocities of all training lines through $$x$$ at $$t$$: $$u_t(x) = \mathbb{E}[z - y \mid x_t = x]$$. That average is intractable, because it needs the whole data distribution. But regressing on each line's own velocity, $$z - y$$, has the average as its minimiser, since the best squared-error predictor of a random target is its conditional mean. That's the same reason part 4's network learns $$\mathbb{E}[\varepsilon \mid x_t]$$ by regressing on $$\varepsilon$$. It is also why the learned flow bends where training lines cross: the conditional mean of crossing directions is a turn.

### Why reflow straightens

A flow defines a coupling between noise and data: each noise point goes to exactly one sample, and two ODE paths can never cross (if they met, they would continue identically). Liu et al. showed that reflowing on such a coupling never increases any convex transport cost, like the average squared distance between paired points, and makes the paths straighter with each round. Straight paths are what make big Euler steps exact. On the toy one round is enough: the first flow already found a good coupling, and reflow only had to learn the straight lines between its pairs.

### Distillation, in general

A trained diffusion model defines a deterministic map from noise to samples (part 7). Any network that learns that map directly samples in one step. Progressive distillation ([Salimans and Ho, 2022](https://arxiv.org/abs/2202.00512)) gets there in stages, training a student to match two of its teacher's steps with one, then repeating, halving the step count each round. Consistency distillation instead enforces agreement along paths, and reflow followed by distillation is rectified flow's route. All of them trade extra training for much faster sampling.

### What scaling means for diffusion transformers

Peebles and Xie measured each model's forward-pass compute in Gflops and found a correlation of −0.93 between it and FID across all their configurations: more compute, better samples, whether it came from more layers, wider layers, or smaller patches (more tokens). Larger models were also more compute-efficient in training, and extra sampling steps could not make up for a smaller model. That's the behaviour that made transformers the default in language models, and it is why the largest recent image and video models are transformers too.

## Further reading

- Y. Lipman, R. Chen, H. Ben-Hamu, M. Nickel and M. Le, [_Flow matching for generative modeling_](https://arxiv.org/abs/2210.02747) (ICLR 2023).
- X. Liu, C. Gong and Q. Liu, [_Flow straight and fast: learning to generate and transfer data with rectified flow_](https://arxiv.org/abs/2209.03003) (ICLR 2023).
- M. Albergo and E. Vanden-Eijnden, [_Building normalizing flows with stochastic interpolants_](https://arxiv.org/abs/2209.15571) (ICLR 2023): the same idea, found independently.
- Y. Song, P. Dhariwal, M. Chen and I. Sutskever, [_Consistency models_](https://arxiv.org/abs/2303.01469) (ICML 2023).
- W. Peebles and S. Xie, [_Scalable diffusion models with transformers_](https://arxiv.org/abs/2212.09748) (ICCV 2023).
- P. Esser et al., [_Scaling rectified flow transformers for high-resolution image synthesis_](https://arxiv.org/abs/2403.03206) (2024): Stable Diffusion 3.

{% include dm-series.liquid %}
