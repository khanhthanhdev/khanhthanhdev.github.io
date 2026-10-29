---
layout: post
title: "diffusion models from scratch, part 2: the forward process in closed form"
date: 2026-10-29 00:00:00 +0700
description: why a thousand small steps of noise collapse into one formula, what the signal-to-noise ratio says about every step, and why the cosine schedule replaced the linear one, with the toy spiral and a small picture noised as you scroll
tags: ai generative-models diffusion interactive
categories: explainer
series: diffusion-models-from-scratch
part: 2
math: true
toc:
  beginning: true
css:
  - /assets/css/screen-works.css
  - /assets/css/transformer.css
  - /assets/css/diffusion.css
js:
  - /assets/js/diffusion/dm-core.js
  - /assets/js/transformer/tf-view.js
  - /assets/js/diffusion/dm-view.js
  - /assets/js/diffusion/part2.js
  - /assets/js/diffusion/dm-scrolly.js
---

{% include dm-series.liquid %}

In [part 1]({% post_url 2026-10-29-dm-1-the-idea %}), the forward process turned a spiral into noise by applying one small step 200 times. Training a diffusion model needs noisy examples at every step, millions of times over. If getting $$x_{500}$$ meant running 500 steps first, training would be hopeless.

It doesn't. Because every step is Gaussian, any number of steps collapses into a single step with a known size. This part derives that formula, which [Ho, Jain and Abbeel (2020)](https://arxiv.org/abs/2006.11239) put at the centre of DDPM training, and then looks at the one choice it leaves open: the **noise schedule**, the list of step sizes $$\beta_1, \dots, \beta_T$$. Part of the story is the cosine schedule of [Nichol and Dhariwal (2021)](https://arxiv.org/abs/2102.09672), which fixed a waste in the original.

## Notation

Three symbols do all the work in this series:

{: .tf-table}
| symbol | meaning | in words |
| --- | --- | --- |
| $$\beta_t$$ | the noise variance step $$t$$ adds | the schedule |
| $$\alpha_t = 1 - \beta_t$$ | the share of variance step $$t$$ keeps | |
| $$\bar\alpha_t = \alpha_1 \alpha_2 \cdots \alpha_t$$ | the share of $$x_0$$'s variance left after $$t$$ steps | "alpha bar" |

With them, one forward step is $$x_t = \sqrt{\alpha_t}\, x_{t-1} + \sqrt{\beta_t}\, \varepsilon$$, with fresh noise $$\varepsilon \sim \mathcal{N}(0, I)$$ each time.

## Many steps, one formula

<section class="tf-scrolly" data-dm-scene="part2">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="two" data-title="Two steps are one step." markdown="1">
**Start with two steps.** Write $$x_2$$ in terms of $$x_0$$:

$$x_2 = \sqrt{\alpha_2}\,\big(\sqrt{\alpha_1}\,x_0 + \sqrt{\beta_1}\,\varepsilon_1\big) + \sqrt{\beta_2}\,\varepsilon_2$$

The $$x_0$$ part is $$\sqrt{\alpha_1\alpha_2}\,x_0$$. The rest is two independent Gaussian noises added together, and the sum of independent Gaussians is a Gaussian whose variance is the sum: $$\alpha_2\beta_1 + \beta_2 = 1 - \alpha_1\alpha_2$$. So

$$x_2 = \sqrt{\alpha_1\alpha_2}\,x_0 + \sqrt{1 - \alpha_1\alpha_2}\,\varepsilon$$

for one fresh $$\varepsilon$$. In the figure, blue is two real steps and orange is one jump with the combined numbers. The strip compares them: they differ by no more than two jumps with different random noise differ from each other.

</div>

<div class="tf-step" data-step="closed" data-title="Jump straight to any step." markdown="1">
**The same argument works for any number of steps**, one step at a time ([Going deeper](#induction) has the induction). After $$t$$ steps:

$$x_t = \sqrt{\bar\alpha_t}\, x_0 + \sqrt{1 - \bar\alpha_t}\, \varepsilon, \qquad \varepsilon \sim \mathcal{N}(0, I)$$

That is the formula that makes training cheap. To get a noisy example at step $$t$$, take a clean $$x_0$$, draw one $$\varepsilon$$, and add. No loop.

Scroll to sweep $$t$$ from 0 to 200. Every frame is a single jump from $$x_0$$, not a chain. The chart shows $$\bar\alpha_t$$, the one number that decides how noisy step $$t$$ is. It falls from 1 (clean) to almost 0 (noise).

</div>

<div class="tf-step" data-step="one" data-title="Where one point can end up." markdown="1">
**Fix a single data point** $$x_0$$ and ask where it can be at step $$t$$. The formula says: anywhere in a round Gaussian cloud,

$$q(x_t \mid x_0) = \mathcal{N}\big(\sqrt{\bar\alpha_t}\,x_0,\; (1 - \bar\alpha_t)\, I\big)$$

The centre slides along a straight line towards the origin (the faint track), while the cloud around it grows. The orange dots are 200 draws.

Early on, the cloud is tiny and sits on $$x_0$$: you could tell which point it came from. By the end, the centre is at the origin and the cloud has spread 1: every $$x_0$$ gives the same cloud, and there is no way back without a model. That's the job of the reverse process.

</div>

<div class="tf-step" data-step="snr" data-title="The signal-to-noise ratio." markdown="1">
**At step $$t$$, $$x_t$$ is a signal plus a noise.** The signal $$\sqrt{\bar\alpha_t}\,x_0$$ has variance $$\bar\alpha_t$$ (our data has spread about 1), and the noise has variance $$1 - \bar\alpha_t$$. Their ratio is the **signal-to-noise ratio**:

$$\mathrm{SNR}(t) = \frac{\bar\alpha_t}{1 - \bar\alpha_t}$$

The chart plots it on a log scale. It starts above 1,000 and falls to about $$3 \times 10^{-5}$$, through nine orders of magnitude. Signal and noise are equal (SNR = 1) after step 51 of 200.

The SNR is a better way to think about a schedule than the $$\beta$$s themselves: two schedules with the same SNR at every step make exactly the same noisy examples, just labelled with different $$t$$. [Part 11]({% post_url 2026-10-29-dm-11-edm-design-space %}) takes that idea all the way.

</div>

<div class="tf-step" data-step="schedules" data-title="Linear against cosine." markdown="1">
**Now the schedules of the papers**, with $$T = 1000$$. DDPM used a **linear** schedule: $$\beta_t$$ rising in a straight line from $$10^{-4}$$ to $$0.02$$. Improved DDPM introduced a **cosine** schedule, defined directly by how much signal is left:

$$\bar\alpha_t = \frac{f(t)}{f(0)}, \qquad f(t) = \cos^2\!\Big(\frac{t/T + s}{1 + s}\cdot\frac{\pi}{2}\Big), \quad s = 0.008$$

Scroll to sweep both at once. The linear schedule is down to half the signal ($$\sqrt{\bar\alpha_t} = 0.5$$) at step 369; the cosine one gets there at step 665. Its curve is nearly a straight line through the middle and flattens at both ends.

(Our toy chain from part 1 is the linear schedule squeezed into 200 steps, with every $$\beta_t$$ multiplied by 5.)

</div>

<div class="tf-step" data-step="picture" data-title="The same thing on a picture." markdown="1">
**Points in a plane are one thing; here is a picture**, 32 × 32 grey pixels scaled to $$[-1, 1]$$ as image models do. Each pixel is noised independently with exactly the same formula. Same picture, same noise, two schedules.

Scroll slowly. At step 300 the linear picture keeps 63% of its signal and the house is already fading; the cosine picture keeps 89% and the house is clear. By step 600 the linear picture keeps 16% and is noise to the eye, while the cosine one still keeps 58%.

This is the problem Nichol and Dhariwal pointed out for small images like these: the linear schedule spends the end of the chain on pictures that are already pure noise.

</div>

<div class="tf-step" data-step="wasted" data-title="Where the steps go." markdown="1">
**Count the wasted steps.** Mark the point where less than 5% of the signal is left (the dashed line; at that level, a 32 × 32 picture is lost in the noise). With the linear schedule, 231 of the 1,000 steps are past it. With the cosine schedule, 33 are.

Those steps are not free. The network has to learn them, and sampling runs through them one by one, and they barely change the picture. Nichol and Dhariwal report that a linear-schedule model barely got worse when the last 20% of its reverse steps were skipped. The cosine schedule spends the same 1,000 steps where they make a difference, and gave them better likelihoods.

Larger images need different schedules again, because neighbouring pixels repeat each other's signal. [Going deeper](#resolution) says more.

</div>

  </div>
</section>

## The whole thing in one line

Everything in this part comes from one formula, the **forward marginal**:

$$q(x_t \mid x_0) = \mathcal{N}\big(\sqrt{\bar\alpha_t}\,x_0,\; (1-\bar\alpha_t)\, I\big), \qquad \text{or} \qquad x_t = \sqrt{\bar\alpha_t}\,x_0 + \sqrt{1-\bar\alpha_t}\,\varepsilon$$

with $$\bar\alpha_t = \prod_{s=1}^{t}(1-\beta_s)$$. The schedule only enters through $$\bar\alpha_t$$, so a schedule is really a choice of how $$\bar\alpha_t$$ (or the SNR) falls from 1 to 0.

The two schedules in this part, side by side:

{: .tf-table}
| | linear (Ho et al., 2020) | cosine (Nichol and Dhariwal, 2021) |
| --- | --- | --- |
| defined by | $$\beta_t$$ from $$10^{-4}$$ to $$0.02$$ | $$\bar\alpha_t = \cos^2(\cdot)$$, offset $$s = 0.008$$ |
| $$\bar\alpha_t$$ at $$t = 250$$ | 0.524 | 0.847 |
| $$\bar\alpha_t$$ at $$t = 500$$ | 0.079 | 0.494 |
| $$\bar\alpha_t$$ at $$t = 750$$ | 0.003 | 0.144 |
| $$\bar\alpha_T$$ | $$4.0 \times 10^{-5}$$ | $$2.4 \times 10^{-9}$$ |
| steps with under 5% signal | 231 | 33 |

## Going deeper

### The induction {#induction}

Suppose that after $$t-1$$ steps, $$x_{t-1} = \sqrt{\bar\alpha_{t-1}}\,x_0 + \sqrt{1-\bar\alpha_{t-1}}\,\varepsilon'$$. Take one more step:

$$x_t = \sqrt{\alpha_t}\,x_{t-1} + \sqrt{\beta_t}\,\varepsilon_t = \sqrt{\alpha_t\bar\alpha_{t-1}}\,x_0 + \underbrace{\sqrt{\alpha_t(1-\bar\alpha_{t-1})}\,\varepsilon' + \sqrt{\beta_t}\,\varepsilon_t}_{\text{two independent Gaussians}}$$

The first coefficient is $$\sqrt{\bar\alpha_t}$$. The noise part has variance $$\alpha_t(1 - \bar\alpha_{t-1}) + \beta_t = \alpha_t - \bar\alpha_t + 1 - \alpha_t = 1 - \bar\alpha_t$$. So $$x_t = \sqrt{\bar\alpha_t}\,x_0 + \sqrt{1-\bar\alpha_t}\,\varepsilon$$, which is the same statement for $$t$$. It holds for $$t = 1$$ by definition, so it holds for every $$t$$.

Notice what was used: the noises are Gaussian and independent of each other and of $$x_0$$. Nothing about the data distribution. The formula is exact whatever $$x_0$$ is.

### Why square roots

The coefficients are $$\sqrt{\bar\alpha_t}$$ and $$\sqrt{1-\bar\alpha_t}$$, not $$\bar\alpha_t$$ and $$1-\bar\alpha_t$$, because variances scale with the square of a coefficient. With square roots, the signal's variance is $$\bar\alpha_t$$ and the noise's is $$1 - \bar\alpha_t$$, and they add to 1 for data with spread 1. That's the variance-preserving property from part 1, now visible in one line.

### The reparameterisation

Writing a Gaussian sample as "mean plus scale times standard noise", $$x_t = \sqrt{\bar\alpha_t}\,x_0 + \sqrt{1-\bar\alpha_t}\,\varepsilon$$, is the same trick that makes variational autoencoders trainable (Kingma and Welling, 2013). Here it does something more useful: it hands us the exact noise $$\varepsilon$$ that was mixed in. [Part 4]({% post_url 2026-10-29-dm-4-ddpm %}) trains the network to predict exactly that $$\varepsilon$$ from $$x_t$$, which turns training into plain regression.

### The posterior is also Gaussian

The forward marginal also answers a backwards question. If you know both the clean point $$x_0$$ and the noisy $$x_t$$, the step in between, $$q(x_{t-1} \mid x_t, x_0)$$, is a Gaussian with a known centre and width. (It follows from Bayes' rule, with every factor Gaussian.) That Gaussian is what the network will be trained to imitate, and it is where [part 3]({% post_url 2026-10-29-dm-3-reverse-process %}) starts.

### The continuous view

For small $$\beta$$s, $$\log \bar\alpha_t = \sum_s \log(1 - \beta_s) \approx -\sum_s \beta_s$$. So $$\bar\alpha_t \approx e^{-\sum_{s \le t} \beta_s}$$: the signal decays exponentially in the total amount of noise added so far. For the linear schedule, $$\sum \beta_s \approx 10.05$$ over 1,000 steps, and indeed $$\bar\alpha_T \approx e^{-10.05} \approx 4.3 \times 10^{-5}$$ (the exact product is $$4.0 \times 10^{-5}$$).

If you let the steps get smaller and more numerous, the sum becomes an integral and the chain becomes a stochastic differential equation. That's the subject of [part 6]({% post_url 2026-10-29-dm-6-sdes %}), and it explains why "1,000 steps" is not sacred: what matters is the curve $$\bar\alpha(t)$$, not how finely it is sliced.

### The two small fixes in the cosine schedule

The cosine formula has two details. The offset $$s = 0.008$$ keeps $$\beta_t$$ from being vanishingly small near $$t = 0$$; Nichol and Dhariwal chose it so that the noise at the first step is about the size of one pixel's quantisation step. And because the formula makes $$\bar\alpha_T$$ exactly 0, the last $$\beta_t$$ would be exactly 1 (the step would erase everything at once), so each $$\beta_t$$ is clipped at 0.999.

### Bigger images need more noise {#resolution}

The 5% line in the last step is a rough rule for a 32 × 32 picture. On a 256 × 256 picture of the same scene, neighbouring pixels carry nearly the same information, so averaging over a small patch cancels much of the noise. The same SNR destroys much less of a large image than of a small one.

The fix, from work like Hoogeboom, Heek and Salimans's [_simple diffusion_](https://arxiv.org/abs/2301.11093) (2023) and Chen's [_On the importance of noise scheduling for diffusion models_](https://arxiv.org/abs/2301.10972) (2023), is to shift the whole SNR curve down for higher resolutions, so that each step adds more noise. Latent diffusion ([part 10]({% post_url 2026-10-29-dm-10-latent-diffusion %})) side-steps part of the problem by diffusing in a smaller space.

## Further reading

- J. Ho, A. Jain and P. Abbeel, [_Denoising diffusion probabilistic models_](https://arxiv.org/abs/2006.11239) (2020), section 2: the closed form and the linear schedule.
- A. Nichol and P. Dhariwal, [_Improved denoising diffusion probabilistic models_](https://arxiv.org/abs/2102.09672) (2021), section 3.2: the cosine schedule.
- D. Kingma, T. Salimans, B. Poole and J. Ho, [_Variational diffusion models_](https://arxiv.org/abs/2107.00630) (2021): the schedule written as an SNR curve, and learned.

{% include dm-series.liquid %}
