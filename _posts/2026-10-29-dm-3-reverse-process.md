---
layout: post
title: "diffusion models from scratch, part 3: the reverse process and the variational bound"
date: 2026-10-29 00:00:00 +0700
description: what a diffusion model is actually trained to match, from the forward posterior that becomes Gaussian once you know where a point started to the variational bound that adds up one KL divergence per step, all computed on the toy spiral as you scroll
tags: ai generative-models diffusion interactive
categories: explainer
series: diffusion-models-from-scratch
part: 3
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
  - /assets/js/diffusion/part3.js
  - /assets/js/diffusion/dm-scrolly.js
---

{% include dm-series.liquid %}

[Part 1]({% post_url 2026-10-29-dm-1-the-idea %}) said a network should learn each small reverse step, and [part 2]({% post_url 2026-10-29-dm-2-forward-process %}) showed how to get noisy training examples at any step in one jump. One thing is still missing: a number to minimise. "Make the learned reverse step match the true one" is not something you can compute a gradient of, because the true reverse step depends on the whole data distribution, which is exactly what we don't know.

The fix goes back to the 2015 paper of [Sohl-Dickstein et al.](https://arxiv.org/abs/1503.03585), and was written in its now-standard form by [Ho, Jain and Abbeel (2020)](https://arxiv.org/abs/2006.11239). It has one trick in it: **cheat by looking at where the point started**. Once you know $$x_0$$, the reverse step becomes a simple Gaussian you can write down, and the training objective becomes a sum of distances between Gaussians, one per step.

This part builds that objective. It is the most mathematical part of the series, and every formula in it is computed in the figure, on the toy spiral from part 1.

## From the true step to something computable

<section class="tf-scrolly" data-dm-scene="part3">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="goal" data-title="What we want to match." markdown="1">
**Here is the target again.** One noisy point at step 40, and on the right the true reverse step $$q(x_{39} \mid x_{40})$$: where that point was one step earlier.

The model's reverse step is a Gaussian, $$p_\theta(x_{t-1} \mid x_t) = \mathcal{N}\big(\mu_\theta(x_t, t),\, \sigma_t^2 I\big)$$, with a centre the network outputs and a fixed width. We want it to sit on top of the shaded bump.

The trouble: computing the bump needs $$q(x_{39})$$, the density of all the data after 39 steps of noise. We could compute it here only because this toy is a known mixture of Gaussians. For real data nobody knows it. We need a target that can be computed from a training example alone.

</div>

<div class="tf-step" data-step="posterior" data-title="Cheat: look at where it started." markdown="1">
**Suppose we also know the clean point** $$x_0$$ that this noisy point came from. In training we always do: we made $$x_t$$ from $$x_0$$ ourselves.

Then the step in between, $$q(x_{t-1} \mid x_t, x_0)$$, is a plain Gaussian with a closed form ([Going deeper](#posterior) derives it):

$$q(x_{t-1} \mid x_t, x_0) = \mathcal{N}\big(\tilde\mu_t,\, \tilde\beta_t I\big), \quad \tilde\mu_t = \frac{\sqrt{\bar\alpha_{t-1}}\,\beta_t}{1-\bar\alpha_t}\,x_0 + \frac{\sqrt{\alpha_t}\,(1-\bar\alpha_{t-1})}{1-\bar\alpha_t}\,x_t, \quad \tilde\beta_t = \frac{1-\bar\alpha_{t-1}}{1-\bar\alpha_t}\,\beta_t$$

The centre is a weighted average: mostly $$x_t$$ (weight 0.95 here), nudged a little towards $$x_0$$ (weight 0.05). It is called the **forward posterior**. The orange disc on the right is it, slightly narrower than one forward step's noise.

</div>

<div class="tf-step" data-step="average" data-title="The true step averages the cheats." markdown="1">
**But the model will not be told $$x_0$$.** Given only $$x_t$$, many starting points are possible. The orange dots on the left are 40 of them, drawn from the exact $$q(x_0 \mid x_t)$$: all near this part of the spiral, on a couple of nearby arms.

Each possible $$x_0$$ gives its own posterior: the small orange rings on the right. And the true reverse step is exactly their average, weighted by how likely each $$x_0$$ is:

$$q(x_{t-1} \mid x_t) = \mathbb{E}_{x_0 \sim q(x_0 \mid x_t)}\big[\,q(x_{t-1} \mid x_t, x_0)\,\big]$$

The strip checks it on these 40 draws: the average of their centres lands on the centre of the true step, to within the noise of using 40 samples.

So matching the posterior, averaged over training examples, is matching the true step. That is what makes the training objective work.

</div>

<div class="tf-step" data-step="model" data-title="Score the network against a posterior." markdown="1">
**Now score the network.** For one training example, we know $$x_0$$, so we compare the network's Gaussian (red) with the posterior (orange) using the KL divergence. For two Gaussians, it has a closed form; with fixed widths it is just the squared distance between the centres, scaled:

$$\mathrm{KL}\big(q(x_{t-1}\mid x_t, x_0)\,\Vert\, p_\theta(x_{t-1}\mid x_t)\big) = \frac{\lVert \tilde\mu_t - \mu_\theta(x_t, t) \rVert^2}{2\sigma_t^2} + \text{a constant}$$

The strip gives the KL for this $$x_0$$, and averaged over the 40 possible ones. Even with the exact best centre, the average isn't 0: the network has to pick one centre for all the $$x_0$$s it can't tell apart. That leftover is the spread of the orange rings, and no model can remove it.

Press _new point_ to try another point.

</div>

<div class="tf-step" data-step="terms" data-title="One term per step." markdown="1">
**Add the KLs up over all steps, and you get the training objective.** The **variational bound** (derived [below](#elbo)) says that for every data point

$$-\log p_\theta(x_0) \;\le\; \underbrace{\mathrm{KL}\big(q(x_T\mid x_0)\,\Vert\,p(x_T)\big)}_{L_T} + \sum_{t=2}^{T} \underbrace{\mathrm{KL}\big(q(x_{t-1}\mid x_t,x_0)\,\Vert\,p_\theta(x_{t-1}\mid x_t)\big)}_{L_{t-1}} \;\underbrace{-\,\log p_\theta(x_0 \mid x_1)}_{L_0}$$

The chart shows every $$L_{t-1}$$, averaged over 256 data points, for the trained network (red) and for the best possible centre at every step (green, from the exact model). Scroll to move along $$t$$.

The terms span four orders of magnitude, and the first few steps carry most of the total: the steps that remove the last bit of noise are where the fine detail of the spiral is decided. The network sits almost on top of the best possible curve.

</div>

<div class="tf-step" data-step="variance" data-title="How wide should each step be?" markdown="1">
**One choice is left: the width $$\sigma_t$$** of each reverse step. Ho et al. tried two natural values and found they gave similar samples:

- $$\sigma_t^2 = \beta_t$$, the noise one forward step adds;
- $$\sigma_t^2 = \tilde\beta_t$$, the width of the forward posterior.

The chart shows the best possible bound with each, step by step. They agree everywhere except the first few steps, where $$\tilde\beta_t$$ is much smaller than $$\beta_t$$ (at $$t = 2$$ it is a third). On this toy, $$\beta_t$$ gives the lower total.

[Part 8]({% post_url 2026-10-29-dm-8-improved-ddpm-and-adm %}) shows how Improved DDPM let the network learn a width between the two, which improved the bound a lot.

</div>

  </div>
</section>

## The whole thing in one line

The model's reverse step is $$p_\theta(x_{t-1}\mid x_t) = \mathcal{N}(\mu_\theta(x_t, t), \sigma_t^2 I)$$, and training minimises the bound

$$L = \mathbb{E}_{x_0}\Big[\, L_T + \sum_{t=2}^{T} L_{t-1} + L_0 \,\Big]$$

on the negative log-likelihood. $$L_T$$ has nothing to learn (it measures how close $$x_T$$ is to pure noise: 0.00003 nats here). Each middle term compares the model's step with the forward posterior, which is known once $$x_0$$ is known. In practice one doesn't compute all $$T$$ terms per example: pick a random $$t$$, compute that one term, and take a gradient step. That is unbiased, because the sum is $$T$$ times the average over random $$t$$.

Since the widths are fixed, each middle term is a weighted squared error between two centres:

$$L_{t-1} = \frac{1}{2\sigma_t^2}\,\big\lVert \tilde\mu_t(x_t, x_0) - \mu_\theta(x_t, t)\big\rVert^2 + C_t$$

[Part 4]({% post_url 2026-10-29-dm-4-ddpm %}) rewrites that squared error in terms of the noise $$\varepsilon$$, and finds that dropping the weight $$1/2\sigma_t^2$$ makes better samples.

## Going deeper

### Deriving the bound {#elbo}

The model defines a joint distribution over the whole chain, $$p_\theta(x_{0:T}) = p(x_T)\prod_{t=1}^{T} p_\theta(x_{t-1}\mid x_t)$$, and the probability of a data point is the sum over every chain that ends there:

$$p_\theta(x_0) = \int p_\theta(x_{0:T})\, dx_{1:T}$$

That integral is hopeless, but we can multiply and divide by the forward process, which is a distribution over exactly the same variables:

$$p_\theta(x_0) = \int q(x_{1:T}\mid x_0)\,\frac{p_\theta(x_{0:T})}{q(x_{1:T}\mid x_0)}\, dx_{1:T} = \mathbb{E}_{q}\Big[\frac{p_\theta(x_{0:T})}{q(x_{1:T}\mid x_0)}\Big]$$

This is the 2015 paper's starting point: the probability as an average over forward paths, the form borrowed from annealed importance sampling and the Jarzynski equality. Taking the log and using **Jensen's inequality** ($$\log \mathbb{E}[Y] \ge \mathbb{E}[\log Y]$$, since log is concave) gives a lower bound:

$$\log p_\theta(x_0) \;\ge\; \mathbb{E}_{q}\Big[\log \frac{p_\theta(x_{0:T})}{q(x_{1:T}\mid x_0)}\Big]$$

This is the **evidence lower bound** (ELBO), the same one used to train variational autoencoders, with the forward process playing the role of the encoder. Its negative is the $$L$$ above.

To split it into one term per step, rewrite each forward factor with Bayes' rule, conditioning on $$x_0$$ throughout:

$$q(x_t \mid x_{t-1}) = q(x_t\mid x_{t-1}, x_0) = \frac{q(x_{t-1}\mid x_t, x_0)\, q(x_t\mid x_0)}{q(x_{t-1}\mid x_0)}$$

(The first equality holds because the chain is Markov.) Substituted into the bound, the $$q(x_t\mid x_0)/q(x_{t-1}\mid x_0)$$ ratios telescope down to $$q(x_T\mid x_0)/q(x_1\mid x_0)$$, and what remains groups into the KL divergences $$L_T$$ and $$L_{t-1}$$ and the last term $$L_0$$. Appendix A of Ho et al. writes out every line.

### The forward posterior {#posterior}

By Bayes' rule, and because the chain is Markov,

$$q(x_{t-1}\mid x_t, x_0) \;\propto\; q(x_t\mid x_{t-1})\; q(x_{t-1}\mid x_0) = \mathcal{N}\big(x_t;\, \sqrt{\alpha_t}\,x_{t-1},\, \beta_t I\big)\;\mathcal{N}\big(x_{t-1};\, \sqrt{\bar\alpha_{t-1}}\,x_0,\, (1-\bar\alpha_{t-1}) I\big)$$

Both factors are Gaussian in $$x_{t-1}$$, so the product is too. Collect the terms of the exponent that are quadratic in $$x_{t-1}$$ to get the precision, and the linear ones to get the centre:

$$\frac{1}{\tilde\beta_t} = \frac{\alpha_t}{\beta_t} + \frac{1}{1 - \bar\alpha_{t-1}}, \qquad \tilde\mu_t = \tilde\beta_t\Big(\frac{\sqrt{\alpha_t}}{\beta_t}\,x_t + \frac{\sqrt{\bar\alpha_{t-1}}}{1-\bar\alpha_{t-1}}\,x_0\Big)$$

Simplifying with $$\alpha_t(1-\bar\alpha_{t-1}) + \beta_t = 1 - \bar\alpha_t$$ gives the formulas in the figure. In our example at $$t = 40$$, $$\tilde\mu_t = 0.049\,x_0 + 0.950\,x_t$$, and $$\sqrt{\tilde\beta_t} = 0.139$$ against $$\sqrt{\beta_t} = 0.141$$.

### The KL between two Gaussians

For two round Gaussians in $$d$$ dimensions,

$$\mathrm{KL}\big(\mathcal{N}(m_1, v_1 I)\,\Vert\,\mathcal{N}(m_2, v_2 I)\big) = \frac{d}{2}\Big(\frac{v_1}{v_2} - 1 - \log\frac{v_1}{v_2}\Big) + \frac{\lVert m_1 - m_2\rVert^2}{2 v_2}$$

The first part depends only on the widths, so with fixed widths it is a constant $$C_t$$ that training can't change. The second part is the squared distance between the centres, divided by twice the model's variance. The figure uses $$d = 2$$.

### Why the bound has a floor

The green curve is not zero, and can never be. Write the $$x_0$$ the model can't see as a random variable. For a fixed $$x_t$$, the average of $$\lVert\tilde\mu_t(x_t, x_0) - \mu\rVert^2$$ over the possible $$x_0$$ is smallest when $$\mu$$ is the average of the $$\tilde\mu_t$$, and what is left is their variance: how far apart the possible posteriors are. That is the spread of the orange rings in step 3.

So the bound measures two things at once: how well the model fits, and how uncertain the reverse step inherently is. To see what's left to learn, compare a model with the floor, as the chart does, not with zero. On this toy, the network's total is within about 1% of the floor.

### Why β and β̃ are the two natural widths

Ho et al. note that the two choices are optimal in two opposite extremes: $$\sigma_t^2 = \tilde\beta_t$$ when the data is a single fixed point (then $$x_0$$ is known, and the posterior is the answer), and $$\sigma_t^2 = \beta_t$$ when the data is itself a standard Gaussian. Real data is somewhere in between. Nichol and Dhariwal (part 8) let the network interpolate between them in log space, $$\sigma_t^2 = \exp\big(v \log\beta_t + (1-v)\log\tilde\beta_t\big)$$, with $$v$$ predicted per point.

### The last term, L₀

$$L_0 = -\log p_\theta(x_0\mid x_1)$$ scores the very last step. For images, whose pixels are integers from 0 to 255, Ho et al. use a **discrete decoder**: the probability of each pixel value is the mass of the last Gaussian over that value's bin of width $$2/255$$. That is what makes their bound a true code length in bits. Our toy data is continuous, so the chart leaves $$L_0$$ out and shows only the terms that compare Gaussians.

### What the 2015 paper learned

The 2015 paper trained on this same bound, called $$K$$ there. It learned more than DDPM does: the network output both the centre and the covariance of each Gaussian reverse step, and for Gaussian diffusion the schedule $$\beta_t$$ was also learned by gradient ascent on $$K$$. DDPM fixed the schedule and the widths, and changed what the network predicts. Part 4 shows why that worked better.

## Further reading

- J. Ho, A. Jain and P. Abbeel, [_Denoising diffusion probabilistic models_](https://arxiv.org/abs/2006.11239) (2020): section 2 and appendix A, the bound and its derivation.
- J. Sohl-Dickstein et al., [_Deep unsupervised learning using nonequilibrium thermodynamics_](https://arxiv.org/abs/1503.03585) (2015): section 2.4, the same bound, written as $$K$$.
- C. Luo, [_Understanding diffusion models: a unified perspective_](https://arxiv.org/abs/2208.11970) (2022): a slow, complete derivation of every equation in this part.

{% include dm-series.liquid %}
