---
layout: post
title: "diffusion models from scratch, part 9: classifier guidance and classifier-free guidance"
date: 2026-10-29 00:00:00 +0700
description: how a class label or a text prompt steers a diffusion model, from Dhariwal and Nichol's classifier guidance to Ho and Salimans's classifier-free guidance, the one-line trick behind every text-to-image model, worked through on three overlapping classes with exact answers and a network trained with condition dropout
tags: ai generative-models diffusion interactive
categories: explainer
series: diffusion-models-from-scratch
part: 9
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
  - /assets/js/diffusion/part9.js
  - /assets/js/diffusion/dm-scrolly.js
---

{% include dm-series.liquid %}

Type "a corgi wearing a top hat" into an image generator and it draws a corgi wearing a top hat. Everything so far in this series samples from the whole data distribution, with no say over what comes out. This part is about how a diffusion model is told what to draw.

The obvious answer is to feed the condition (a class label, or an encoding of a prompt) into the network alongside $$x_t$$ and $$t$$, and train on labelled data. That works, but the samples come out only loosely tied to the condition. The trick that makes them follow it closely is **guidance**: push each sampling step a little further in the direction of the condition than the model's own distribution would.

There are two versions. **Classifier guidance**, from [Dhariwal and Nichol (2021)](https://arxiv.org/abs/2105.05233), uses the gradient of a separately trained classifier. **Classifier-free guidance**, from [Ho and Salimans (2022)](https://arxiv.org/abs/2207.12598), gets the same effect from one network trained with and without the condition. The second is in nearly every text-to-image model since 2022: Stable Diffusion's "guidance scale" is its weight.

## Steering the sampler

The data is three classes, round blobs with a spread of 0.6 whose centres sit 1.73 apart, so they overlap: about one point in eight is more likely under another class than under its own. As always, the densities are known exactly, so every guided sampler below can be compared with the exact answer.

<section class="tf-scrolly" data-dm-scene="part9">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="data" data-title="Three classes that overlap." markdown="1">
**Here is the data**, coloured by class. The hollow circles are the class centres.

A useful number for each point is $$p(c \mid x)$$, the probability that it came from class $$c$$, given where it is. For points near a centre it's close to 1. In the overlaps it's around a half or a third. Averaged over the data, the true class gets about 0.8: the classes are distinct, but not cleanly separated.

A conditional model's job is to sample from $$p(x \mid c)$$: points that look like they came from class $$c$$, overlaps included.

</div>

<div class="tf-step" data-step="conditional" data-title="Conditional sampling, no guidance." markdown="1">
**Sample each class with its exact conditional model**, 200 points per class. Each class comes out right: the same spread as the data, the same overlaps, and the same average confidence, about 0.8.

That is the correct answer, and it is often not what people want. A photo labelled "dog" that could pass for a wolf is a perfectly good sample of the dog class, and a poor answer to "draw me a dog". Image models with plain conditioning gave samples that were diverse but often only weakly recognisable. GANs had the truncation trick; diffusion models needed a way to ask for more typical, more clearly class-like samples.

</div>

<div class="tf-step" data-step="classifier" data-title="A classifier's gradient points away from the others." markdown="1">
**Bayes' rule splits the conditional score in two:**

$$\nabla_x \log p_t(x \mid c) = \nabla_x \log p_t(x) + \nabla_x \log p_t(c \mid x)$$

an unconditional score, plus the gradient of a classifier's log-probability. The arrows show that second term for class 1 (the shading is $$p_t(\text{class }1 \mid x)$$). It points away from the other classes, strongest where they overlap. Scroll to change the step $$t$$.

The classifier has to work on noisy inputs, at every noise level the sampler visits. Dhariwal and Nichol trained one on noisy ImageNet images for exactly this. Here we use the exact one.

</div>

<div class="tf-step" data-step="guided" data-title="Classifier guidance: scale the push." markdown="1">
**Classifier guidance multiplies the classifier's term** by a scale $$s$$:

$$\nabla_x \log p_t(x) + s\,\nabla_x \log p_t(c \mid x)$$

With $$s = 1$$ this is exactly the conditional score. With $$s > 1$$ it samples, approximately, from $$p(x)\,p(c \mid x)^s$$: the classifier's opinion, sharpened. Scroll to raise $$s$$ from 1 to 9.

The classes pull apart. Confidence rises towards 1, and each class gets tighter (the chart). Dhariwal and Nichol found that this trades diversity for fidelity better than BigGAN's truncation, and it was how ADM beat BigGAN on ImageNet. The cost: a second network, a classifier trained on noisy data, and its gradients.

</div>

<div class="tf-step" data-step="train" data-title="Classifier-free: one network, sometimes without the label." markdown="1">
**Ho and Salimans removed the classifier.** Train one network $$\varepsilon_\theta(x_t, t, c)$$ with the class as an input, and **drop the class** at random, replacing it with a "no class" token $$\varnothing$$ some of the time (they found 10 to 20% worked best; this one uses 20%). The same network then knows both the conditional and the unconditional model.

Left: the network told nothing, $$\varepsilon_\theta(x_t, t, \varnothing)$$, sampling the whole data. Right: the same network told the class. It costs nothing extra to train: one network, one loss, just a missing label now and then.

</div>

<div class="tf-step" data-step="cfg" data-title="Classifier-free guidance." markdown="1">
**Now combine the two predictions:**

$$\tilde\varepsilon = (1 + w)\,\varepsilon_\theta(x_t, t, c) - w\,\varepsilon_\theta(x_t, t, \varnothing)$$

Since $$\varepsilon$$ is a scaled score, this is $$\nabla \log p(x \mid c) + w\,\big(\nabla \log p(x \mid c) - \nabla\log p(x)\big)$$, and the bracket is $$\nabla \log p(c \mid x)$$ by Bayes' rule. So it is classifier guidance with scale $$s = 1 + w$$, using the classifier implied by the model itself. With exact models the two are identical; the chart's dashed lines are the exact answers.

Scroll to raise $$w$$ from 0 to 8. The trained network follows the exact curves closely up to $$w \approx 2$$. Beyond that, its own errors get multiplied by $$1 + w$$ too, and its classes start to spread out again. On images, very high guidance shows up as oversaturated, overcooked pictures.

</div>

<div class="tf-step" data-step="outward" data-title="Guidance pushes past the class." markdown="1">
**Where do guided samples go?** Not to the most typical point of the class. Here is class 1 with $$w = 4$$, over its true density. The samples' mean has moved well out from the class's centre, away from the other two classes.

That's what $$p(x \mid c)\,p(c \mid x)^w$$ asks for: points that are likely under the class _and_ unmistakably not the other classes. In the overlap, $$p(c \mid x)$$ is small, so guidance empties it; on the far side, $$p(c \mid x)$$ is close to 1, so samples gather there. For images, that means "more dog than any dog": exaggerated, prototypical, high-contrast samples. Usually that is what a user wants. It is also why guided samples are less diverse than the data.

</div>

  </div>
</section>

## The whole thing in a few lines

To guide a diffusion model towards a condition $$c$$, replace the noise prediction at every sampling step:

{: .tf-table}
| | prediction used for sampling | needs |
| --- | --- | --- |
| conditional | $$\varepsilon_\theta(x_t, t, c)$$ | a conditional network |
| classifier guidance, scale $$s$$ | $$\varepsilon_\theta(x_t, t) - s\,\sqrt{1 - \bar\alpha_t}\;\nabla_{x_t}\log p_\phi(c \mid x_t, t)$$ | a classifier trained on noisy data |
| classifier-free guidance, weight $$w$$ | $$(1 + w)\,\varepsilon_\theta(x_t, t, c) - w\,\varepsilon_\theta(x_t, t, \varnothing)$$ | one network trained with condition dropout |

For classifier-free guidance, train as in [part 4]({% post_url 2026-10-29-dm-4-ddpm %}) but replace the condition by $$\varnothing$$ with probability $$p_\text{uncond}$$ (Ho and Salimans: 0.1 to 0.2 worked best; 0.5 was worse). Sampling costs two network evaluations per step, conditional and unconditional, usually run as one batch.

On the toy (2,100 samples per run, 50 steps; the data: confidence 0.82, spread 0.60, centres at radius 1):

{: .tf-table}
| $$w$$ | 0 | 0.5 | 1 | 2 | 4 | 8 |
| --- | --- | --- | --- | --- | --- | --- |
| confidence, network | 0.818 | 0.916 | 0.953 | 0.977 | 0.987 | 0.992 |
| confidence, exact | 0.816 | 0.913 | 0.950 | 0.974 | 0.987 | 0.994 |
| spread per class, network | 0.605 | 0.545 | 0.520 | 0.507 | 0.518 | 0.558 |
| spread per class, exact | 0.611 | 0.552 | 0.529 | 0.513 | 0.507 | 0.506 |
| class centres' radius, exact | 1.02 | 1.24 | 1.37 | 1.54 | 1.72 | 1.90 |

A naming warning: libraries such as `diffusers` call $$1 + w$$ the **guidance scale**. Stable Diffusion's usual setting of 7.5 is $$w = 6.5$$ in the paper's notation, and a guidance scale of 1 means no guidance at all.

## Going deeper

### Classifier guidance as a shifted Gaussian

Dhariwal and Nichol derive their sampler step by step. The guided reverse step $$p(x_t \mid x_{t+1}, c) \propto p_\theta(x_t \mid x_{t+1})\,p_\phi(c \mid x_t)$$ is a Gaussian times something smooth; expanding $$\log p_\phi(c \mid x_t)$$ to first order around the Gaussian's mean $$\mu$$ (the same move as [part 1]({% post_url 2026-10-29-dm-1-the-idea %})'s small-step argument) gives another Gaussian with the mean shifted:

$$\mathcal{N}\big(\mu + s\,\Sigma\,\nabla_x \log p_\phi(c \mid x)\big|_{x = \mu},\; \Sigma\big)$$

For DDIM they write the same idea through the score, which gives the noise-prediction form in the table above.

### Why the classifier must see noise

An ordinary image classifier has only seen clean images. Shown $$x_t$$ at high noise, its output is meaningless, and its gradient points nowhere useful. The classifier in classifier guidance is trained on $$(x_t, t)$$ pairs from the forward process, so it answers the right question: given this noisy image, which class did it start as? That's the $$p_t(c \mid x)$$ in the arrows of step 3, and it changes with $$t$$: at high noise it is nearly flat, and the arrows are weak and broad.

A worry with classifier guidance was that its gains in FID and Inception Score might come from adversarial gradients, images nudged to fool a classifier rather than to look better. Classifier-free guidance got the same improvements with no classifier involved, which settled that.

### The implicit classifier

Classifier-free guidance never trains a classifier, but it defines one: $$p(c \mid x) \propto p(x \mid c)/p(x)$$, using the network's own conditional and unconditional models. Its gradient is $$\nabla\log p(x \mid c) - \nabla\log p(x)$$, exactly the difference of the two predictions (up to the scale $$-1/\sqrt{1-\bar\alpha_t}$$). When the network is exact, so is the classifier, and classifier-free guidance with weight $$w$$ equals classifier guidance with scale $$1 + w$$, as the page's exact models confirm.

With a trained network, the two predictions are never perfect, and $$(1+w)\,\varepsilon_c - w\,\varepsilon_\varnothing$$ amplifies their difference, errors included. That's the rising spread at $$w = 8$$ on the toy, and the oversaturation of strongly guided images. Later work tamed it with tricks such as clipping or rescaling the guided prediction.

### Guided samples are not samples of anything simple

$$p(x)\,p(c \mid x)^s$$ is a fine target, but the guided sampler doesn't sample it exactly: guidance is applied to the score at every noise level, and the guided scores at different levels are not the scores of one consistent family of noisy distributions. It works very well in practice, but "the distribution of guided samples" has no closed form. That's one reason guidance is usually described as a heuristic with a good theoretical motivation, rather than as exact conditional sampling.

### From classes to text

Nothing above needs $$c$$ to be a class. GLIDE (Nichol et al., 2021) conditioned on a text encoding, compared classifier-free guidance with guidance by CLIP's image–text similarity, and found people preferred classifier-free. Imagen, Stable Diffusion and the models after them all train with prompts dropped some of the time and sample with classifier-free guidance. [Part 10]({% post_url 2026-10-29-dm-10-latent-diffusion %}) shows how the text gets into the network.

## Further reading

- P. Dhariwal and A. Nichol, [_Diffusion models beat GANs on image synthesis_](https://arxiv.org/abs/2105.05233) (2021), section 4: classifier guidance.
- J. Ho and T. Salimans, [_Classifier-free diffusion guidance_](https://arxiv.org/abs/2207.12598) (2022, first presented at a NeurIPS 2021 workshop).
- A. Nichol et al., [_GLIDE: towards photorealistic image generation and editing with text-guided diffusion models_](https://arxiv.org/abs/2112.10741) (2021).
- S. Dieleman, [_Guidance: a cheat code for diffusion models_](https://sander.ai/2022/05/26/guidance.html) (2022).

{% include dm-series.liquid %}
