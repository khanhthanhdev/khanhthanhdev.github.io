---
layout: post
title: "diffusion models from scratch, part 8: from the toy to images, with Improved DDPM and ADM"
date: 2026-10-29 00:00:00 +0700
description: what OpenAI's two 2021 papers changed to make diffusion models beat GANs, from a network that learns its own reverse variance and samples well in fewer steps, through precision and recall and the fidelity–diversity trade-off, to the U-Net and the architecture changes behind ADM
tags: ai generative-models diffusion interactive
categories: explainer
series: diffusion-models-from-scratch
part: 8
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
  - /assets/js/diffusion/part8.js
  - /assets/js/diffusion/dm-scrolly.js
---

{% include dm-series.liquid %}

By the end of 2020 diffusion models matched GANs on small benchmarks like CIFAR-10, but not on the one that mattered most, ImageNet, with its thousand classes and higher resolutions. Two papers from OpenAI closed that gap in 2021.

[Nichol and Dhariwal's _Improved denoising diffusion probabilistic models_](https://arxiv.org/abs/2102.09672) made DDPM's training better: the cosine schedule of [part 2]({% post_url 2026-10-29-dm-2-forward-process %}), a network that learns the variance of each reverse step, and a hybrid loss. Their models got competitive likelihoods and sampled well in far fewer steps. [Dhariwal and Nichol's _Diffusion models beat GANs on image synthesis_](https://arxiv.org/abs/2105.05233) then tuned the network itself, and added a way to trade diversity for fidelity. Their model, ADM, set new records on ImageNet at every resolution they tried.

This part covers what the toy can show of that: the learned variance, precision and recall, and the trade-off between them. It ends with the network, which the toy can't show, so it is drawn instead. The trade-off mechanism ADM introduced, classifier guidance, has [part 9]({% post_url 2026-10-29-dm-9-guidance %}) to itself.

## Better training, better measurement, a better network

<section class="tf-scrolly" data-dm-scene="part8">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="variance" data-title="Let the network choose the variance." markdown="1">
**DDPM fixed the width of every reverse step** to $$\sigma_t^2 = \beta_t$$ or $$\tilde\beta_t$$ ([part 3]({% post_url 2026-10-29-dm-3-reverse-process %})); learning it directly was unstable. Nichol and Dhariwal made it learnable by letting the network output one more number $$v$$ per point and interpolating between the two choices in log space:

$$\Sigma_\theta(x_t, t) = \exp\big(v \log\beta_t + (1 - v)\log\tilde\beta_t\big)$$

$$L_\text{simple}$$ doesn't involve the variance, so they train with a **hybrid loss**, $$L_\text{simple} + \lambda L_\text{vlb}$$ with $$\lambda = 0.001$$, where the bound term only trains $$v$$.

The network in this figure was trained that way. The chart shows the $$v$$ it learned at each step: mostly near 1, close to $$\beta_t$$, which part 3 found was the better fixed choice on this toy. The strip compares the bound with fixed and learned variances.

</div>

<div class="tf-step" data-step="fewer" data-title="Learned variances help with fewer steps." markdown="1">
**The payoff is in sampling with fewer steps.** Skip steps, as DDIM did, and each remaining step covers a big jump. The right width for a big jump is not obvious; a fixed rule is a guess. Improved DDPM respaces the bounds ($$\beta$$ and $$\tilde\beta$$ of the big jump) and lets the learned $$v$$ choose between them.

The chart compares the same network mean with fixed widths (red) and learned widths (orange), at 10 to 200 steps. Scroll to see the clouds.

On 2,000 samples, the learned widths improve 10 steps from 0.078 to 0.065 and 20 steps from 0.042 to 0.030, and make no difference from 100 steps on. Nichol and Dhariwal found the same pattern on images: with learned variances, they could sample "with an order of magnitude fewer forward passes with a negligible difference in sample quality".

</div>

<div class="tf-step" data-step="pr" data-title="Precision and recall." markdown="1">
**How do you measure "good samples"?** A single number like FID mixes two different failures: making bad samples, and failing to make some kinds of good ones. **Precision and recall** separate them.

Draw a ball around every real point, reaching its 3rd nearest real neighbour; together the balls mark out where the data lives. **Precision** is the share of samples that land inside some ball: are the samples realistic? **Recall** swaps the roles: the share of real points inside the balls around the samples: is every part of the data covered? This is the version of [Kynkäänniemi et al. (2019)](https://arxiv.org/abs/1904.06991).

The figure zooms in on part of the spiral. Samples outside every ball are black. The strip compares both numbers with what a second sample of real data scores: with only 600 points they are noisy, and even real data misses some balls. On 2,000 points, real data scores 0.96 and 0.97, and this 50-step sampler 0.86 and 0.99: a few of its samples land between the arms, but no part of the spiral is missed.

</div>

<div class="tf-step" data-step="tradeoff" data-title="Trading diversity for fidelity." markdown="1">
**GANs had a knob diffusion models lacked.** BigGAN's "truncation trick" samples its latent code from a narrowed distribution: images get cleaner and more typical, and less varied. Precision goes up, recall goes down.

The simplest analogue here is to scale down the noise the sampler adds at each step by a factor $$\tau$$. Scroll to lower it from 1 to 0.2. Precision creeps up and recall falls off a cliff: the samples crowd onto the middle of the arms and leave the rest of the spiral empty.

That's the trade-off ADM wanted, but scaling the noise is a crude way to get it: the distance to the spiral gets much worse as soon as $$\tau$$ drops. Part 9's guidance gives a much better trade.

</div>

<div class="tf-step" data-step="unet" data-title="The network: a U-Net." markdown="1">
**Now the network**, which on images is where most of the work is. Every model in this series since DDPM uses a **U-Net**, a convolutional network shaped like the letter U.

The left side takes the noisy image down through lower and lower resolutions, 32 × 32 to 4 × 4 for CIFAR-10, with two residual blocks at each. The right side comes back up. **Skip connections** carry each resolution's features straight across, so fine detail never has to squeeze through the 4 × 4 bottleneck. Self-attention at 16 × 16 lets distant parts of the image talk to each other. The step $$t$$, as a sinusoidal embedding, is added into every residual block.

The output has the same shape as the input: the predicted noise at every pixel.

</div>

<div class="tf-step" data-step="adm" data-title="What ADM changed." markdown="1">
**Dhariwal and Nichol ablated the U-Net piece by piece** on ImageNet at 128 × 128, and kept what helped:

- **attention at three resolutions**, 32 × 32, 16 × 16 and 8 × 8, instead of one;
- **more attention heads**, with 64 channels per head;
- **BigGAN residual blocks** for going down and up in resolution;
- **adaptive group normalisation** (AdaGN): the time step (and the class, when there is one) sets a scale and a shift for each block's normalised features, $$\text{AdaGN}(h, y) = y_s\,\text{GroupNorm}(h) + y_b$$;
- **wider rather than deeper**: more channels gave more per unit of training time than more blocks.

Together with classifier guidance (part 9), these took ImageNet 256 × 256 to an FID of 4.59, against 6.95 for BigGAN-deep.

</div>

  </div>
</section>

## The whole thing in a few lines

**Improved DDPM** (Nichol and Dhariwal, 2021) changed the training:

1. The cosine noise schedule (part 2).
2. Learned reverse variances, $$\Sigma_\theta = \exp(v\log\beta_t + (1-v)\log\tilde\beta_t)$$, trained by the hybrid loss $$L_\text{simple} + 0.001\,L_\text{vlb}$$ with the mean held fixed inside $$L_\text{vlb}$$.
3. Importance sampling of $$t$$ when training on $$L_\text{vlb}$$ alone, to tame its gradient noise.

With them, DDPMs reached competitive log-likelihoods, sampled with an order of magnitude fewer steps at almost the same quality, and showed much higher recall than GANs at similar FID. Sample quality and likelihood both improved smoothly with model size and compute.

**ADM** (Dhariwal and Nichol, 2021) changed the network (the list in the last step) and added classifier guidance. Its ImageNet results (FID, lower is better):

{: .tf-table}
| resolution | BigGAN-deep | ADM, guided | ADM, guided, with an upsampler |
| --- | --- | --- | --- |
| 128 × 128 | 6.02 | 2.97 | |
| 256 × 256 | 6.95 | 4.59 | 3.94 |
| 512 × 512 | 8.43 | 7.72 | 3.85 |

Without any guidance, the architecture alone gave state-of-the-art results on LSUN (bedrooms: FID 1.90) and ImageNet 64 × 64 (2.07).

On the toy, with 2,000 samples (2,000 real points sit at 0.025):

{: .tf-table}
| steps | 10 | 20 | 50 | 100 | 200 |
| --- | --- | --- | --- | --- | --- |
| fixed variance, $$\beta$$ | 0.078 | 0.042 | 0.029 | 0.023 | 0.026 |
| learned variance | 0.065 | 0.030 | 0.026 | 0.023 | 0.027 |

## Going deeper

### Why the hybrid loss holds the mean fixed

$$L_\text{vlb}$$ cares about the very first steps, where the noise is tiny and its terms are huge (part 3), and its gradient is very noisy. Letting it train the mean would undo what $$L_\text{simple}$$ does well. So in the hybrid loss, the mean inside $$L_\text{vlb}$$ is treated as a constant (a "stop-gradient"), and $$L_\text{vlb}$$ only teaches the variance. The small weight, $$\lambda = 0.001$$, keeps it from dominating. On the toy, the learned network's samples with the fixed $$\beta$$ widths match the plain network's exactly at every step count, which confirms that the mean was left alone.

### Why the variance matters most with few steps

With 1,000 small steps, $$\beta_t$$ and $$\tilde\beta_t$$ are almost equal except at the very start (part 3: at $$t = 2$$ in our toy, $$\tilde\beta$$ is a third of $$\beta$$; by $$t = 10$$ it is 82%). Any width between them works. A respaced jump over 20 original steps has bounds that differ much more, and a wrong choice either blurs the cloud (too wide) or leaves it noisy and sparse (too narrow). That's where a learned choice pays.

### Precision, recall and FID

**FID** (Fréchet Inception Distance) fits a Gaussian to the features of real images and another to the features of samples, using a pretrained Inception network, and measures the distance between the two Gaussians. Lower is better. It's the standard number in every paper in this series, and it rewards both fidelity and diversity, which is why it can't say which one is missing.

Kynkäänniemi et al.'s precision and recall work in the same feature space, with the k-nearest-neighbour balls of the figure. Nichol and Dhariwal used them to show that at similar FID, diffusion models had much higher recall than BigGAN-deep: they covered more of the distribution. ADM used them to show that guidance trades recall for precision, the same way truncation does in GANs, but at a better rate.

### Why a U-Net

A denoiser has to see the whole image (is this blob a face?) and also get every pixel right (where exactly is this edge?). A U-Net does both: the bottleneck sees the whole image at low resolution, and the skip connections carry the fine detail across at full resolution. It was designed in 2015 for medical image segmentation, a task with the same need. PixelCNN++ used a U-Net-like design for generation, and DDPM took its backbone from there.

### Scaling

Nichol and Dhariwal fitted how FID and log-likelihood improved with training compute, and found smooth trends that kept improving as models grew. That was an early sign that diffusion models would reward scale the way language models do, and it set up the next three years: bigger U-Nets, then transformers (part 12), trained on more data.

## Further reading

- A. Nichol and P. Dhariwal, [_Improved denoising diffusion probabilistic models_](https://arxiv.org/abs/2102.09672) (ICML 2021).
- P. Dhariwal and A. Nichol, [_Diffusion models beat GANs on image synthesis_](https://arxiv.org/abs/2105.05233) (NeurIPS 2021): section 3 is the architecture ablation; their code, [guided-diffusion](https://github.com/openai/guided-diffusion), became the base of many later models.
- T. Kynkäänniemi, T. Karras, S. Laine, J. Lehtinen and T. Aila, [_Improved precision and recall metric for assessing generative models_](https://arxiv.org/abs/1904.06991) (NeurIPS 2019).
- O. Ronneberger, P. Fischer and T. Brox, [_U-Net: convolutional networks for biomedical image segmentation_](https://arxiv.org/abs/1505.04597) (2015).

{% include dm-series.liquid %}
