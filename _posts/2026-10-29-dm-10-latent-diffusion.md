---
layout: post
title: "diffusion models from scratch, part 10: latent diffusion and how Stable Diffusion works"
date: 2026-10-29 00:00:00 +0700
description: why Rombach et al. moved diffusion out of pixel space and into the latent space of an autoencoder, and how text gets into the network through cross-attention, with a toy where 256-pixel pictures carry only two numbers, latent diffusion done live with the part 4 network, and the Stable Diffusion pipeline end to end
tags: ai generative-models diffusion interactive
categories: explainer
series: diffusion-models-from-scratch
part: 10
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
  - /assets/js/diffusion/part10.js
  - /assets/js/diffusion/dm-scrolly.js
---

{% include dm-series.liquid %}

By 2021 diffusion models made the best images of any generative model, and they were very expensive. Every training step and every sampling step ran a large U-Net over every pixel. A 512 × 512 colour image is 786,432 numbers, and the network had to denoise all of them, hundreds of times per picture.

[Part 4]({% post_url 2026-10-29-dm-4-ddpm %}) quoted Ho et al.'s observation that most of a diffusion model's bits go into **imperceptible detail**: the exact noise texture of a patch of sky, which no one would miss. [Rombach, Blattmann, Lorenz, Esser and Ommer's _High-resolution image synthesis with latent diffusion models_](https://arxiv.org/abs/2112.10752) (2022) acted on it. First train an **autoencoder** that compresses images into a much smaller **latent** representation and decodes them back almost perfectly. Then run diffusion in that latent space. The autoencoder handles the perceptual detail once; the diffusion model only has to learn what is in the picture.

They also gave the network a general way to take a condition, any sequence of vectors such as an encoded prompt, through **cross-attention**. Released openly eight months later as **Stable Diffusion**, this is the design most people's first image generator used.

## The toy: pictures that are really two numbers

This part needs data that looks like images. Each picture here is 16 × 16 grey pixels showing one soft dot, and the dot's position is a point drawn from the Swiss roll of [part 1]({% post_url 2026-10-29-dm-1-the-idea %}). A picture has 256 numbers, but only two of them are free: the dot's coordinates.

That makes the ideal autoencoder easy to write by hand: the **encoder** finds the dot's centre of mass, and the **decoder** draws a dot at a given place. In the paper the autoencoder is a trained network; the rest of the method is exactly the same.

## From pixel space to latent space

<section class="tf-scrolly" data-dm-scene="part10">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="pictures" data-title="Pictures from the data." markdown="1">
**Here are twelve pictures from the data.** Each one is 256 pixel values, scaled to $$[-1, 1]$$ the way image models scale them.

A pixel-space diffusion model would treat them as points in a 256-dimensional space and learn to denoise all 256 numbers at every step. Nearly all of that work would go into getting the smooth dark background and the dot's soft edge exactly right, things that are the same in every picture.

</div>

<div class="tf-step" data-step="pixel" data-title="Noise in pixel space, noise in latent space." markdown="1">
**Run the same forward process two ways.** Left: noise added to every pixel, as in parts 1 to 9. Right: noise added to the two latent numbers, then the result decoded into a picture. Scroll to raise $$t$$.

On the left, the pictures turn into static, and a pixel-space model would have to learn every step of that path. On the right, every picture is a clean dot at every step; only its position wanders. The latent-space model never deals with static at all: it works only on _what_ is in the picture.

</div>

<div class="tf-step" data-step="encode" data-title="Encode everything into the latent space." markdown="1">
**Now encode all 600 data pictures.** Each becomes two numbers, and plotted together, the codes are the Swiss roll from part 1.

That's the first stage of latent diffusion: an autoencoder trained once, before any diffusion, with an encoder $$\mathcal{E}$$ and a decoder $$\mathcal{D}$$ such that $$\mathcal{D}(\mathcal{E}(x)) \approx x$$. Rombach et al. train it with a perceptual loss and a small adversarial loss, so reconstructions are sharp rather than blurry, plus a light penalty that keeps the latent space well behaved.

The strip checks our hand-made one: encoding and decoding loses about 0.0005 latent units.

</div>

<div class="tf-step" data-step="latent" data-title="Diffusion in the latent space." markdown="1">
**The second stage is an ordinary diffusion model on the codes.** Ours is the network from part 4, trained on the Swiss roll and used unchanged: it has no idea the codes stand for pictures.

Scroll to run the sampler from $$t = 200$$ down to 0. The plot shows the latent codes; the pictures show twelve of them decoded at the current step. The network denoises two numbers per step instead of 256.

</div>

<div class="tf-step" data-step="decoded" data-title="Decode the samples." markdown="1">
**At the end, decode.** The twelve pictures are new samples: dots in places the data could have put them, none copied from the training set. Measured on 2,000 samples, the latent codes sit as close to the true spiral as real codes do (0.024 against 0.025); the strip's 600-point numbers are noisier.

On images the saving is the same in kind. Stable Diffusion generates 512 × 512 × 3 pictures through a 64 × 64 × 4 latent: 786,432 numbers against 16,384, 48 times fewer, and the U-Net's convolutions and attention work at 64 × 64 instead of 512 × 512.

</div>

<div class="tf-step" data-step="attention" data-title="How a prompt gets in: cross-attention." markdown="1">
**A class label is one number. A prompt is a sequence of words.** Latent diffusion encodes the prompt into one vector per token, and lets every position of the U-Net's feature maps look up the tokens it cares about with **cross-attention**:

$$\text{Attention}(Q, K, V) = \text{softmax}\Big(\frac{Q K^\top}{\sqrt{d}}\Big)\, V$$

with the queries $$Q$$ computed from the image features, and the keys $$K$$ and values $$V$$ from the token vectors. Each position takes a weighted average of the tokens' values, weighted by how well its query matches each key.

The grid illustrates the mechanism with hand-made vectors (a real model learns them, in hundreds of dimensions). The prompt is "a dot near the top left". Scroll to step through the words: positions at the top attend to "top", positions on the left to "left", and the rest fall back on "dot".

</div>

<div class="tf-step" data-step="pipeline" data-title="Stable Diffusion, end to end." markdown="1">
**Put it together.** Stable Diffusion v1 encodes the prompt with CLIP's text encoder into 77 token vectors of 768 numbers. It starts from noise in the 64 × 64 × 4 latent space, and runs a U-Net with cross-attention layers for about 50 steps, with classifier-free guidance ([part 9]({% post_url 2026-10-29-dm-9-guidance %})). Then the autoencoder's decoder turns the final latent into a 512 × 512 picture.

Every piece is from earlier in this series: the forward process and noise prediction (parts 2 to 4), a fast deterministic sampler ([part 7]({% post_url 2026-10-29-dm-7-ode-and-ddim %})), the U-Net ([part 8]({% post_url 2026-10-29-dm-8-improved-ddpm-and-adm %})), guidance (part 9). Latent diffusion's own contributions are the autoencoder that moves everything into a small space, and cross-attention as the doorway for the prompt.

</div>

  </div>
</section>

## The whole thing in a few lines

**Stage 1, perceptual compression.** Train an autoencoder: the encoder $$\mathcal{E}$$ maps an image $$x \in \mathbb{R}^{H \times W \times 3}$$ to $$z = \mathcal{E}(x) \in \mathbb{R}^{h \times w \times c}$$, smaller by a factor $$f = H/h$$ in each direction, and the decoder maps it back. Losses: a perceptual (LPIPS) reconstruction loss, a patch-based adversarial loss, and either a light KL penalty towards a standard Gaussian or a vector-quantisation layer, to keep the latent space from drifting to arbitrary scales.

**Stage 2, latent diffusion.** Train a diffusion model on the codes, exactly as in part 4, with the condition $$y$$ encoded by a domain-specific encoder $$\tau_\theta$$ and fed in by cross-attention:

$$L_\text{LDM} = \mathbb{E}_{\mathcal{E}(x),\, y,\, \varepsilon,\, t}\Big[\big\lVert \varepsilon - \varepsilon_\theta\big(z_t, t, \tau_\theta(y)\big)\big\rVert^2\Big]$$

**Sampling.** Run any diffusion sampler in the latent space, with guidance, and decode once at the end.

How much to compress is the key choice. The paper tried $$f$$ from 1 (pixel space) to 32:

{: .tf-table}
| downsampling $$f$$ | what the paper found |
| --- | --- |
| 1, 2 | slow to train: still mostly pixel-space work |
| 4, 8, 16 | the sweet spot: far cheaper, and better FID for the same compute |
| 32 | too much compression: detail lost in the autoencoder caps the quality |

Results from the paper: on ImageNet 256 × 256 with classifier-free guidance, an FID of 3.60 against ADM's 4.59 with classifier guidance, with about half the parameters and a quarter of the training compute; a 1.45-billion-parameter text-to-image model trained on LAION-400M reached an FID of 12.63 on MS-COCO; and new state-of-the-art results for inpainting.

## Going deeper

### Perceptual and semantic compression

Rombach et al. split what an image model has to learn into two parts. **Perceptual compression** removes high-frequency detail that carries many bits but little meaning; an autoencoder does it well and only needs training once. **Semantic compression** is learning what is in the picture and how it is arranged; that is the generative model's real job. A pixel-space diffusion model does both at once, spending most of its effort on the first. Latent diffusion gives each to the tool suited for it.

The toy is the extreme case: its "perceptual" content (the dot's shape, the dark background) is identical in every picture, so the perfect autoencoder throws all of it away, and the latent holds only the semantic content, two numbers.

### Why mild compression and a 2D latent

Earlier two-stage models, such as VQ-VAE-2 and DALL·E, compressed images hard into a short sequence of discrete tokens and modelled that sequence autoregressively. Rombach et al.'s latents stay two-dimensional, $$h \times w \times c$$, so the diffusion model can still be a convolutional U-Net, with its built-in sense of space. That is what lets them use mild compression ($$f = 4$$ to $$16$$) and keep detail, where token models needed strong compression to make their sequences short enough.

A bonus of the convolutional latent: a model trained at one resolution can be run on bigger latents to make bigger images, which the paper used for megapixel inpainting and super-resolution.

### Why the latent needs regularising

An autoencoder trained only to reconstruct can put its codes anywhere: huge values in one channel, tiny in another. Diffusion assumes data near unit scale, the scale of the noise ($$\bar\alpha_T \approx 0$$ has to mean "pure noise"). The paper's KL penalty is weighted very lightly, just enough to keep the latent's variance in check. Stable Diffusion also multiplies its latents by a fixed constant (0.18215 in v1) so they have roughly unit variance, the same job our Swiss roll's scaling did in part 1.

### Cross-attention, from the Transformer

The attention formula is the Transformer's. In self-attention, queries, keys and values all come from the same sequence. In cross-attention, the queries come from one source (the image features) and the keys and values from another (the prompt). The U-Net interleaves cross-attention layers with its convolutional blocks, so at several resolutions every spatial position can read the prompt. Changing the encoder $$\tau_\theta$$ changes the kind of condition: the paper used text, semantic maps and bounding-box layouts with the same mechanism.

## Further reading

- R. Rombach, A. Blattmann, D. Lorenz, P. Esser and B. Ommer, [_High-resolution image synthesis with latent diffusion models_](https://arxiv.org/abs/2112.10752) (CVPR 2022), and the code at [CompVis/latent-diffusion](https://github.com/CompVis/latent-diffusion).
- P. Esser, R. Rombach and B. Ommer, [_Taming transformers for high-resolution image synthesis_](https://arxiv.org/abs/2012.09841) (2021): the autoencoder with perceptual and adversarial losses that latent diffusion builds on.
- A. Vaswani et al., [_Attention is all you need_](https://arxiv.org/abs/1706.03762) (2017): where the attention formula comes from.
- J. Alammar, [_The illustrated Stable Diffusion_](https://jalammar.github.io/illustrated-stable-diffusion/) (2022): the pipeline drawn out piece by piece.

{% include dm-series.liquid %}
