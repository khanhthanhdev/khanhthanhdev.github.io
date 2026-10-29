# Diffusion models from scratch: research notes and series plan

Working document for a new scroll-through blog series on diffusion models, in the same style as the existing interactive series (mobile robots, computer vision, transformers). The first half collects what each original paper actually says. The second half plans the posts.

Excluded from the Jekyll build in `_config.yml`.

---

## Part A. Research notes from the original papers

Read in the order they build on each other. Numbers below come from the papers themselves. Items marked **(verify)** come from memory and must be checked against the paper before they go into a post.

### A.1 The lineage at a glance

| Year | Paper                                                                                                             | What it added                                                                                                                        | arXiv                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 2005 | Hyvärinen, _Estimation of non-normalized models by score matching_                                                | Fit $\nabla_x \log p(x)$ without knowing the normaliser                                                                              | JMLR (not arXiv)                                                                               |
| 2011 | Vincent, _A connection between score matching and denoising autoencoders_                                         | Denoising score matching: the score of noised data is learnable by denoising                                                         | Neural Computation                                                                             |
| 2015 | Sohl-Dickstein, Weiss, Maheswaranathan, Ganguli, _Deep unsupervised learning using nonequilibrium thermodynamics_ | The diffusion probabilistic model: slowly destroy structure with a Markov chain, learn the reverse chain                             | [1503.03585](https://arxiv.org/abs/1503.03585)                                                 |
| 2019 | Song, Ermon, _Generative modeling by estimating gradients of the data distribution_ (NCSN)                        | Score networks conditioned on many noise levels plus annealed Langevin sampling                                                      | [1907.05600](https://arxiv.org/abs/1907.05600)                                                 |
| 2020 | Ho, Jain, Abbeel, _Denoising diffusion probabilistic models_ (DDPM)                                               | Predict the noise $\epsilon$, train with plain MSE ($L_\text{simple}$); first diffusion model that matched GANs on sample quality    | [2006.11239](https://arxiv.org/abs/2006.11239)                                                 |
| 2020 | Song, Meng, Ermon, _Denoising diffusion implicit models_ (DDIM)                                                   | Non-Markovian forward process with the same training loss; deterministic, few-step sampling and inversion                            | [2010.02502](https://arxiv.org/abs/2010.02502)                                                 |
| 2021 | Song, Sohl-Dickstein, Kingma, Kumar, Ermon, Poole, _Score-based generative modeling through SDEs_                 | One continuous-time picture: NCSN = VE SDE, DDPM = VP SDE; reverse SDE, predictor–corrector, probability flow ODE, exact likelihoods | [2011.13456](https://arxiv.org/abs/2011.13456)                                                 |
| 2021 | Nichol, Dhariwal, _Improved denoising diffusion probabilistic models_                                             | Cosine schedule, learned reverse variance, hybrid loss, fewer sampling steps                                                         | [2102.09672](https://arxiv.org/abs/2102.09672)                                                 |
| 2021 | Dhariwal, Nichol, _Diffusion models beat GANs on image synthesis_ (ADM)                                           | Ablated U-Net architecture and classifier guidance                                                                                   | [2105.05233](https://arxiv.org/abs/2105.05233)                                                 |
| 2021 | Rombach, Blattmann, Lorenz, Esser, Ommer, _High-resolution image synthesis with latent diffusion models_ (LDM)    | Diffuse in an autoencoder's latent space; cross-attention conditioning. The basis of Stable Diffusion                                | [2112.10752](https://arxiv.org/abs/2112.10752)                                                 |
| 2022 | Ho, Salimans, _Classifier-free diffusion guidance_                                                                | Guidance from one network trained with and without the condition                                                                     | [2207.12598](https://arxiv.org/abs/2207.12598)                                                 |
| 2022 | Karras, Aittala, Aila, Laine, _Elucidating the design space of diffusion-based generative models_ (EDM)           | Separates every design choice: noise schedule, scaling, preconditioning, loss weighting, sampler                                     | [2206.00364](https://arxiv.org/abs/2206.00364)                                                 |
| 2022 | Lipman et al., _Flow matching for generative modeling_; Liu et al., _Flow straight and fast_ (rectified flow)     | Regress a velocity field along a straight noise-to-data path. Simpler objective, straighter trajectories **(verify details)**        | [2210.02747](https://arxiv.org/abs/2210.02747), [2209.03003](https://arxiv.org/abs/2209.03003) |
| 2022 | Peebles, Xie, _Scalable diffusion models with transformers_ (DiT)                                                 | Replace the U-Net with a transformer on latent patches **(verify FID numbers)**                                                      | [2212.09748](https://arxiv.org/abs/2212.09748)                                                 |
| 2023 | Song, Dhariwal, Chen, Sutskever, _Consistency models_                                                             | Map any point on an ODE trajectory straight to its end, so one or few steps sample **(verify)**                                      | [2303.01469](https://arxiv.org/abs/2303.01469)                                                 |

The 1982 result that every post from part 6 on depends on is B. D. O. Anderson, _Reverse-time diffusion equation models_ (Stochastic Processes and their Applications). Cite it there.

### A.2 Sohl-Dickstein et al. 2015: the original idea

- **Problem it attacks.** The trade-off between tractable models (a Gaussian you can evaluate and sample) and flexible models (an energy function you cannot normalise). The paper wants both.
- **Idea, borrowed from nonequilibrium statistical physics.** Define a forward Markov chain $q(\mathbf{x}^{(t)} \mid \mathbf{x}^{(t-1)})$ that slowly turns data into a simple distribution $\pi$ (an identity-covariance Gaussian, or independent binomials for binary data), with a per-step rate $\beta_t$. Learn the reverse chain $p(\mathbf{x}^{(t-1)} \mid \mathbf{x}^{(t)})$.
- **Why the reverse step is learnable.** For small enough steps the reverse of a Gaussian diffusion step is itself Gaussian, so the network only has to output a mean and a covariance per step (the paper points to the Kolmogorov forward and backward equations). This is the single most important sentence for readers to understand.
- **Likelihood.** $p(\mathbf{x}^{(0)})$ is an average over forward trajectories of the ratio of reverse-path to forward-path probability, the same move as annealed importance sampling and the Jarzynski equality. Training maximises a Jensen lower bound $K$ that becomes a sum of KL divergences between the forward posterior $q(\mathbf{x}^{(t-1)} \mid \mathbf{x}^{(t)}, \mathbf{x}^{(0)})$ and the learned reverse step.
- **Conditioning.** Multiplying the model by another distribution $r(\mathbf{x}^{(0)})$ perturbs each reverse step, which gives denoising and inpainting. This is an early form of guidance.
- **Experiments.** 2D Swiss roll (the figure every explainer redraws), a binary "heartbeat" sequence, MNIST, CIFAR-10, dead-leaves images (log-likelihood beat the MCGSM baseline) and bark-texture inpainting. Samples were not competitive with GANs. That gap is the story of the next five years.

### A.3 Song and Ermon 2019 (NCSN): scores and Langevin dynamics

- **Score.** $s(\mathbf{x}) = \nabla_\mathbf{x} \log p(\mathbf{x})$. Learning it avoids the normalising constant entirely.
- **Langevin sampling.** $\tilde{\mathbf{x}}_t = \tilde{\mathbf{x}}_{t-1} + \tfrac{\epsilon}{2} \nabla_\mathbf{x} \log p(\tilde{\mathbf{x}}_{t-1}) + \sqrt{\epsilon}\, \mathbf{z}_t$.
- **Two failure modes the paper names.** (1) The manifold hypothesis: data on a low-dimensional manifold has no well-defined score in the ambient space. (2) Low-density regions: few training samples there, so the score is poorly estimated, and Langevin dynamics cannot recover the relative weights of separated modes.
- **Fix.** Perturb data with Gaussian noise at a geometric sequence of levels $\sigma_1 > \dots > \sigma_L$. Train one network $s_\theta(\mathbf{x}, \sigma)$ with denoising score matching at every level, weighted by $\lambda(\sigma) = \sigma^2$ so each level contributes equally. Sample with **annealed Langevin dynamics**: run Langevin at the largest $\sigma$, then hand the samples to the next level, with step size proportional to $\sigma_i^2$.
- **Results.** CIFAR-10 Inception Score 8.87 ± 0.12 (state of the art for unconditional models at the time), FID 25.32.
- **For the series.** The two failure modes make a perfect interactive demo on a 2D two-mode mixture: plain Langevin gets the mode weights wrong; annealed Langevin gets them right.

### A.4 Ho, Jain, Abbeel 2020 (DDPM): the recipe that worked

- **Forward process.** $q(\mathbf{x}_t \mid \mathbf{x}_{t-1}) = \mathcal{N}(\sqrt{1-\beta_t}\,\mathbf{x}_{t-1}, \beta_t \mathbf{I})$, with $\beta$ linear from $10^{-4}$ to $0.02$ over $T = 1000$ steps. In closed form, $\mathbf{x}_t = \sqrt{\bar\alpha_t}\,\mathbf{x}_0 + \sqrt{1-\bar\alpha_t}\,\boldsymbol\epsilon$ with $\bar\alpha_t = \prod_{s \le t}(1-\beta_s)$.
- **Reverse process.** $p_\theta(\mathbf{x}_{t-1} \mid \mathbf{x}_t) = \mathcal{N}(\boldsymbol\mu_\theta(\mathbf{x}_t, t), \sigma_t^2 \mathbf{I})$ with $\sigma_t^2$ fixed to $\beta_t$ or $\tilde\beta_t$ (both worked about equally; learning it was unstable in their setup).
- **The key reparameterisation.** Predict the noise, not the mean:
  $\boldsymbol\mu_\theta(\mathbf{x}_t, t) = \frac{1}{\sqrt{\alpha_t}}\left(\mathbf{x}_t - \frac{\beta_t}{\sqrt{1-\bar\alpha_t}}\,\boldsymbol\epsilon_\theta(\mathbf{x}_t, t)\right)$.
  With this choice the ELBO term at each step is a weighted denoising score matching loss, and sampling looks like Langevin dynamics. This is the bridge between section A.3 and section A.2.
- **$L_\text{simple}$.** Drop the weights: $\mathbb{E}_{t, \mathbf{x}_0, \boldsymbol\epsilon} \lVert \boldsymbol\epsilon - \boldsymbol\epsilon_\theta(\sqrt{\bar\alpha_t}\mathbf{x}_0 + \sqrt{1-\bar\alpha_t}\boldsymbol\epsilon, t) \rVert^2$. It down-weights the easy small-$t$ terms. Ablation: $\epsilon$-prediction with $L_\text{simple}$ gives FID 3.17; the true bound gives 13.51.
- **Architecture.** U-Net (PixelCNN++ backbone), group norm, self-attention at 16×16, sinusoidal time embedding. Data scaled to $[-1, 1]$; discrete decoder at the last step.
- **Results.** CIFAR-10 FID 3.17, IS 9.46. LSUN 256² Church FID 7.89, Bedroom 4.90. Log-likelihood was weak (≤ 3.75 bits/dim). The paper reads this as a bias toward lossy compression: most bits describe imperceptible detail. Progressive generation goes coarse to fine.
- **Algorithms 1 and 2 of the paper** are each about five lines. Part 4 should reproduce both, verbatim in spirit, and run them live.

### A.5 Song, Meng, Ermon 2020 (DDIM): same network, faster sampler

- **Observation.** The DDPM loss only depends on the marginals $q(\mathbf{x}_t \mid \mathbf{x}_0)$, not on the forward process being Markov. Any joint with the same marginals trains the same network (their Theorem 1).
- **Family.** A parameter $\sigma_t$ (or $\eta$) sets how stochastic each reverse step is. $\eta = 1$ recovers DDPM; $\eta = 0$ gives a deterministic map from $\mathbf{x}_T$ to $\mathbf{x}_0$, the implicit model.
- **Update.** Predict $\hat{\mathbf{x}}_0 = (\mathbf{x}_t - \sqrt{1-\bar\alpha_t}\,\boldsymbol\epsilon_\theta) / \sqrt{\bar\alpha_t}$, then step to $\mathbf{x}_{t-1} = \sqrt{\bar\alpha_{t-1}}\,\hat{\mathbf{x}}_0 + \sqrt{1-\bar\alpha_{t-1}}\,\boldsymbol\epsilon_\theta$ (when $\eta = 0$). Steps can skip along any sub-sequence of timesteps.
- **Results.** CIFAR-10 FID 4.67 with 50 steps; 10× to 50× faster than 1000-step DDPM at similar quality. The same $\mathbf{x}_T$ gives the same image at any step count, so $\mathbf{x}_T$ is a usable latent: interpolation and near-exact reconstruction by running the ODE backwards.
- **Link.** The update is Euler integration of an ODE, the probability flow ODE of section A.6.

### A.6 Song et al. 2021: the SDE picture

- **Forward SDE.** $d\mathbf{x} = \mathbf{f}(\mathbf{x}, t)\,dt + g(t)\,d\mathbf{w}$, no trainable parts.
- **Reverse SDE (Anderson 1982).** $d\mathbf{x} = [\mathbf{f}(\mathbf{x}, t) - g(t)^2 \nabla_\mathbf{x} \log p_t(\mathbf{x})]\,dt + g(t)\,d\bar{\mathbf{w}}$. The only unknown is the score.
- **Training.** Continuous denoising score matching over $t \sim \mathcal{U}(0, T)$ with weight $\lambda(t)$.
- **Three SDEs.** VE: $d\mathbf{x} = \sqrt{d[\sigma^2(t)]/dt}\,d\mathbf{w}$ is the limit of NCSN. VP: $d\mathbf{x} = -\tfrac12\beta(t)\mathbf{x}\,dt + \sqrt{\beta(t)}\,d\mathbf{w}$ is the limit of DDPM. sub-VP is new and gives better likelihoods.
- **Samplers.** Any SDE solver; "reverse diffusion" discretisation; **predictor–corrector** (a solver step, then Langevin correction steps).
- **Probability flow ODE.** $d\mathbf{x} = [\mathbf{f}(\mathbf{x}, t) - \tfrac12 g(t)^2 \nabla_\mathbf{x} \log p_t(\mathbf{x})]\,dt$ has the same marginals as the SDE. Gives exact likelihood (via the instantaneous change of variables and a Hutchinson trace estimate), adaptive black-box solvers (more than 90% fewer evaluations), and a unique, identifiable encoding.
- **Conditional generation.** $\nabla \log p_t(\mathbf{x} \mid y) = \nabla \log p_t(\mathbf{x}) + \nabla \log p_t(y \mid \mathbf{x})$: class conditioning, inpainting and colourisation from one unconditional model.
- **Results.** CIFAR-10 FID 2.20, IS 9.89 (NCSN++ cont. deep); 2.99 bits/dim (sub-VP, DDPM++ cont. deep); first 1024×1024 CelebA-HQ samples from a score model.

### A.7 Nichol and Dhariwal 2021 (Improved DDPM)

- **Cosine schedule.** $\bar\alpha_t = f(t)/f(0)$, $f(t) = \cos^2\!\left(\frac{t/T + s}{1+s}\cdot\frac{\pi}{2}\right)$ with small offset $s$. The linear schedule destroys low-resolution images too early; most of its last steps are wasted on pure noise.
- **Learned variance.** $\Sigma_\theta = \exp(v \log\beta_t + (1-v)\log\tilde\beta_t)$, the network outputs $v$.
- **Hybrid loss.** $L_\text{hybrid} = L_\text{simple} + \lambda L_\text{vlb}$, with importance sampling of $t$ when training on $L_\text{vlb}$ alone.
- **Findings.** Competitive log-likelihoods; good samples in 50 to 100 steps; much higher recall than GANs at similar FID (diffusion covers more of the distribution); FID and NLL improve smoothly with compute.

### A.8 Dhariwal and Nichol 2021 (ADM): beating GANs

- **Architecture ablations on ImageNet 128.** Width beats depth per unit time; more attention heads (64 channels per head); attention at 32, 16 and 8; BigGAN residual blocks for up- and downsampling; **adaptive group norm** (time and class embedding scale and shift the normalised features).
- **Classifier guidance.** Train a classifier $p_\phi(y \mid \mathbf{x}_t, t)$ on noisy images. Shift each reverse step's mean by $s\,\Sigma\,\nabla_{\mathbf{x}_t} \log p_\phi(y \mid \mathbf{x}_t)$. A scale $s > 1$ sharpens to $p(y \mid \mathbf{x})^s$ and trades recall for precision, a better trade-off than BigGAN's truncation trick.
- **Results.** ImageNet FID: 2.97 at 128², 4.59 at 256², 7.72 at 512² (BigGAN-deep: 6.02, 6.95, 8.43). With an upsampling stack: 3.94 at 256², 3.85 at 512². LSUN Bedroom 1.90. Comparable to BigGAN-deep with 25 DDIM steps.

### A.9 Ho and Salimans 2022: classifier-free guidance

- **Training.** One network. Drop the condition with probability $p_\text{uncond}$ (0.1 to 0.2 worked best; 0.5 was worse).
- **Sampling.** $\tilde{\boldsymbol\epsilon} = (1+w)\,\boldsymbol\epsilon_\theta(\mathbf{z}, \mathbf{c}) - w\,\boldsymbol\epsilon_\theta(\mathbf{z})$. Larger $w$ raises IS and precision and lowers diversity.
- **Why it works, in score terms.** It follows $\nabla\log p(\mathbf{x} \mid \mathbf{c}) + w\,\nabla \log p(\mathbf{c} \mid \mathbf{x})$ using an implicit classifier, so no classifier gradients and no worry about adversarial gradients fooling the metric.
- **Note for readers.** Libraries such as `diffusers` call $1 + w$ the "guidance scale", so a Stable Diffusion scale of 7.5 is $w = 6.5$ in the paper's notation. Say this explicitly in part 9.

### A.10 Rombach et al. 2021 (LDM, later Stable Diffusion)

- **Two stages.** (1) A perceptual autoencoder (LPIPS loss plus a patch discriminator, with a light KL or VQ regulariser) downsamples by $f$. (2) A diffusion model runs on the latent $\mathbf{z} = \mathcal{E}(\mathbf{x})$.
- **Why.** Pixel-space diffusion spends most of its capacity on imperceptible detail (the same point DDPM made about bits/dim). Separate perceptual compression from semantic generation.
- **Sweet spot.** $f = 4$ to $16$. $f = 1, 2$ train slowly; $f = 32$ loses too much.
- **Conditioning.** Cross-attention from U-Net features (queries) to a domain encoder $\tau_\theta(y)$ (keys and values): text, layouts, semantic maps.
- **Results.** ImageNet 256² FID 3.60 with classifier-free guidance (vs ADM-G 4.59) at a fraction of the compute; CelebA-HQ FID 5.11; a 1.45B text-to-image model on LAION-400M with MS-COCO FID 12.63; state-of-the-art Places inpainting.

### A.11 Karras et al. 2022 (EDM): the design space

- **Common frame.** Write every model as a probability flow ODE in terms of a noise level $\sigma(t)$ and scale $s(t)$. The score is $(D(\mathbf{x}; \sigma) - \mathbf{x})/\sigma^2$ for an ideal denoiser $D$. VP, VE and DDIM become rows of one table.
- **Sampling.** Heun's second-order method; $\sigma(t) = t$, $s(t) = 1$ (trajectories are nearly straight); time steps $\sigma_i$ spaced with exponent $\rho = 7$. Optional "churn" stochasticity with $S_\text{tmin}, S_\text{tmax}, S_\text{noise}$.
- **Training.** Preconditioning $D_\theta(\mathbf{x}; \sigma) = c_\text{skip}(\sigma)\,\mathbf{x} + c_\text{out}(\sigma)\,F_\theta(c_\text{in}(\sigma)\,\mathbf{x}; c_\text{noise}(\sigma))$, each coefficient derived from unit-variance inputs and targets. Loss weight chosen so the effective weight is flat across $\sigma$. Log-normal $p_\text{train}(\sigma)$ focuses on mid noise. Non-leaking augmentation.
- **Results.** CIFAR-10 FID 1.79 (conditional) and 1.97 (unconditional) with 35 network evaluations; ImageNet-64 FID 1.36. The new sampler alone takes ADM's ImageNet-64 model from 2.07 to 1.55 with no retraining. With well-trained models, deterministic sampling was best on CIFAR-10, while ImageNet-64 still benefited from some stochasticity.

### A.12 After EDM (for the final part; verify each before writing)

- **Flow matching / rectified flow / stochastic interpolants (2022).** Train a velocity field $v_\theta(\mathbf{x}_t, t)$ to regress $\mathbf{x}_1 - \mathbf{x}_0$ along $\mathbf{x}_t = (1-t)\mathbf{x}_0 + t\mathbf{x}_1$. With a Gaussian path it is a diffusion model with a different parameterisation and weighting.
- **DiT (2022).** Transformer on latent patches with adaLN-Zero conditioning; quality scales with compute (Gflops).
- **Distillation and consistency models (2022–2023).** Progressive distillation (Salimans and Ho, [2202.00512](https://arxiv.org/abs/2202.00512)) halves steps repeatedly; consistency models learn to jump to the trajectory's end.
- **Fast ODE solvers.** DPM-Solver (Lu et al., [2206.00927](https://arxiv.org/abs/2206.00927)) exploits the semi-linear form of the ODE.
- **Current large systems** (Stable Diffusion 3 with rectified flow transformers, [2403.03206](https://arxiv.org/abs/2403.03206), and video models) as pointers only.

### A.13 Ideas that tie the series together

These are the threads to keep returning to, so the series reads as one argument rather than a list of papers.

1. **Destroy slowly, undo slowly.** Small steps make each reverse step nearly Gaussian (2015). Every later improvement is about taking fewer, larger steps without losing that property.
2. **Three equivalent things a network can predict.** Noise $\boldsymbol\epsilon$, clean data $\mathbf{x}_0$, score $\nabla \log p_t$. For Gaussian noise, $\nabla \log p_t(\mathbf{x}_t) = -\boldsymbol\epsilon / \sqrt{1-\bar\alpha_t}$. Velocity (flow matching) is a fourth. Show the conversion table once and reuse it.
3. **Training is just denoising.** DDPM's $L_\text{simple}$, NCSN's DSM and EDM's denoiser loss are the same regression with different weights over noise levels.
4. **Sampling is solving a differential equation.** Ancestral sampling ≈ reverse SDE; DDIM ≈ Euler on the ODE; EDM = Heun on the ODE. Fewer steps means a better solver or straighter paths.
5. **Guidance is adding a gradient.** 2015 multiplication by $r(\mathbf{x})$, the SDE paper's $\nabla\log p(y \mid \mathbf{x})$, classifier guidance, and classifier-free guidance are one idea.
6. **Where the capacity goes.** Pixel likelihood spends bits on imperceptible detail (DDPM), so move to a latent space (LDM) and weight the noise levels that matter (IDDPM cosine, EDM log-normal).

---

## Part B. Series plan

### B.1 Shape of the series

- **Name:** _diffusion models from scratch_ (`series: diffusion-models-from-scratch`, include `dm-series.liquid`, assets under `assets/js/diffusion/` and `assets/css/diffusion.css`, post files `YYYY-MM-DD-dm-N-<slug>.md`).
- **Format:** same as the other series. Lower-case titles, `categories: explainer`, `tags: ai generative-models diffusion interactive`, `math: true`, `toc.beginning: true`, scroll-through steps with a sticky figure.
- **Reader:** knows basic probability (Gaussians, Bayes' rule, expectation) and has trained a neural network. The computer vision series is the natural prerequisite. No SDE background assumed; it is built in part 6.
- **Running example:** a 2D dataset (Swiss roll, the 2015 paper's own figure, plus a two-mode mixture and a "spiral of letters" for conditioning). Everything runs in the browser at 2D, so readers watch every particle. Each part ends with one image-scale figure from the paper (redrawn, cited) to show the same idea at scale.
- **Shared code:** `dm-core.js` with datasets, noise schedules, a tiny MLP (2 → 128 → 128 → 2 with time embedding) trained in the browser, and samplers (ancestral, DDIM, Euler/Heun ODE, Langevin, predictor–corrector). Later parts reuse it rather than shipping new math. Pretrained weights for each demo ship as small JSON files so pages load ready to sample; a "train it yourself" button retrains live.

### B.2 The posts

Each part lists: the question it answers, the source paper(s), what the reader computes or sees, and the interactive figure.

**Part 1. The idea: destroy structure, then learn to undo it**

- _Question:_ Why would adding noise help you generate anything?
- _Sources:_ Sohl-Dickstein et al. 2015 (sections 1–2, Figure 1).
- _Content:_ The tractable-vs-flexible trade-off. A drop of ink spreading in water. Forward chain on the Swiss roll. The claim that small reverse steps are Gaussian, shown, not proved. Where diffusion sits next to VAEs, GANs, flows and autoregressive models.
- _Interactive:_ Scrub $t$ from 0 to $T$ and watch the Swiss roll diffuse into a Gaussian; toggle "reverse" to play a trained model backwards. A histogram of $\mathbf{x}_{t-1}$ given a fixed $\mathbf{x}_t$ that stays Gaussian when steps are small and goes non-Gaussian when they are large.

**Part 2. The forward process in closed form**

- _Question:_ How noisy is the data at step $t$, and how do we pick the schedule?
- _Sources:_ DDPM section 2 (closed-form $q(\mathbf{x}_t \mid \mathbf{x}_0)$); Improved DDPM section 3.2 (cosine schedule).
- _Content:_ Derive $\mathbf{x}_t = \sqrt{\bar\alpha_t}\mathbf{x}_0 + \sqrt{1-\bar\alpha_t}\boldsymbol\epsilon$ by composing Gaussians. Variance preserving vs exploding. Signal-to-noise ratio $\bar\alpha_t / (1-\bar\alpha_t)$ as the one number that matters. Linear vs cosine schedule and why linear wastes its final steps.
- _Interactive:_ Schedule editor (linear, cosine, custom), plotting $\bar\alpha_t$ and log-SNR, next to a small image and the 2D cloud noised at the same $t$. Jump straight to any $t$ to show no loop is needed.

**Part 3. The reverse process and the variational bound**

- _Question:_ What exactly is the network trained to match?
- _Sources:_ Sohl-Dickstein et al. 2015 section 2.4; DDPM section 2 and Appendix A.
- _Content:_ Short KL and ELBO refresher. The forward posterior $q(\mathbf{x}_{t-1} \mid \mathbf{x}_t, \mathbf{x}_0)$ is Gaussian with known mean $\tilde{\boldsymbol\mu}_t$ and variance $\tilde\beta_t$, derived step by step. The bound splits into $L_T + \sum L_{t-1} + L_0$; each $L_{t-1}$ is a KL between two Gaussians, so a squared distance between means.
- _Interactive:_ Pick a training point $\mathbf{x}_0$ and a noisy $\mathbf{x}_t$; show the true posterior ellipse and the model's predicted ellipse, with the KL updating as you drag.

**Part 4. Predicting the noise: DDPM**

- _Question:_ Why did a plain MSE on noise beat the principled bound?
- _Sources:_ DDPM sections 3–4, Algorithms 1 and 2, Table 2 ablation.
- _Content:_ Three parameterisations ($\tilde{\boldsymbol\mu}$, $\mathbf{x}_0$, $\boldsymbol\epsilon$) and the algebra from one to another. $L_\text{simple}$ and what dropping the weights does. Algorithms 1 and 2 as runnable code. Time embedding. Fixed variances. FID 3.17 in context, and the weak bits/dim result and its lossy-compression reading.
- _Interactive:_ Train the tiny MLP live on the Swiss roll with $L_\text{simple}$, loss curve updating; then sample with Algorithm 2 and watch 2,000 particles fall onto the roll. Toggle "predict $\mathbf{x}_0$" vs "predict $\boldsymbol\epsilon$" and train again to compare.

**Part 5. Scores and Langevin dynamics**

- _Question:_ What is the network's output really pointing at?
- _Sources:_ Hyvärinen 2005; Vincent 2011; Song and Ermon 2019 (NCSN).
- _Content:_ The score as an arrow field toward higher density. Langevin dynamics as noisy gradient ascent that samples rather than climbs. Denoising score matching: the best denoiser points along the score. NCSN's two failure modes and the multi-noise fix. The DDPM identity $\boldsymbol\epsilon_\theta = -\sqrt{1-\bar\alpha_t}\,\mathbf{s}_\theta$, so parts 4 and 5 describe one model.
- _Interactive:_ A two-mode mixture with a 70/30 weight. Draw the learned score field as arrows at a chosen $\sigma$. Run plain Langevin (gets the weights wrong, gets stuck in empty regions) and annealed Langevin (recovers 70/30), with a live histogram of the mode counts.

**Part 6. One picture: stochastic differential equations**

- _Question:_ What happens when the number of steps goes to infinity?
- _Sources:_ Song et al. 2021 (sections 2–4); Anderson 1982.
- _Content:_ Brownian motion and an SDE built from scratch, no measure theory. DDPM's chain becomes the VP SDE; NCSN's noise levels become the VE SDE. The reverse-time SDE and why only the score is unknown. Predictor–corrector sampling as "a solver step plus a Langevin touch-up".
- _Interactive:_ Side-by-side VP and VE forward paths for the same points (VE spreads out, VP stays in a unit ball). Reverse SDE sampler with a slider for corrector steps per predictor step and a running quality score (a 2D sliced Wasserstein distance to the data).

**Part 7. Deterministic sampling: the probability flow ODE and DDIM**

- _Question:_ Can we remove the randomness and use far fewer steps?
- _Sources:_ Song, Meng, Ermon 2020 (DDIM); Song et al. 2021 section 4.3.
- _Content:_ DDIM's observation that the loss only sees marginals. The $\eta$ family from DDPM to deterministic. The DDIM update as Euler on the probability flow ODE. Same $\mathbf{x}_T$, same sample at any step count. Inversion: run the ODE forward to encode, and what that enables (editing, interpolation). Exact likelihood in one paragraph.
- _Interactive:_ Trajectories from the same starting noise under SDE (wiggly) and ODE (smooth) sampling. A step-count slider (1000 → 10) showing DDPM falling apart before DDIM does. Click a data point to invert it to noise and back.

**Part 8. Making it work on real images: Improved DDPM and ADM**

- _Question:_ What engineering turned a 2D toy into an image model that beat GANs?
- _Sources:_ Nichol and Dhariwal 2021 (Improved DDPM); Dhariwal and Nichol 2021 (ADM) sections 2–3.
- _Content:_ The U-Net, layer by layer: residual blocks, down/up paths, attention at low resolution, time embedding through adaptive group norm. Learned variance and the hybrid loss. Precision and recall, and why diffusion covers more of the distribution than GANs. FID, briefly and critically.
- _Interactive:_ An annotated, clickable U-Net diagram (tensor shapes at each block for a 64×64 input). A precision/recall plot of samples against the data for a GAN-like mode-dropping sampler vs the diffusion sampler on the 2D mixture.

**Part 9. Steering the model: classifier and classifier-free guidance**

- _Question:_ How does a prompt or a class label control what comes out?
- _Sources:_ Sohl-Dickstein et al. 2015 section 2.5 (multiplying distributions); Song et al. 2021 section 5; ADM section 4; Ho and Salimans 2022.
- _Content:_ Bayes' rule on scores. Classifier guidance and why the classifier must be trained on noisy inputs. Classifier-free guidance: condition dropout, the $(1+w)$ formula, the score it implicitly follows. The quality–diversity knob. The "guidance scale" naming convention in libraries.
- _Interactive:_ A conditional 2D dataset (three coloured clusters, or letters drawn as point clouds). A guidance slider from 0 to 10 that shows samples collapsing toward each cluster's core, with diversity and "on-class" rate plotted together.

**Part 10. Latent diffusion: how Stable Diffusion works**

- _Question:_ Why diffuse in a compressed space, and how does text get in?
- _Sources:_ Rombach et al. 2021 (LDM); cross-reference the transformer series for attention.
- _Content:_ The perceptual autoencoder and its losses. Choosing $f$. Diffusion on latents. Cross-attention from image features to text tokens, step by step. The full text-to-image pipeline: text encoder → U-Net in latent space with CFG → decoder. What changed between the paper and the released Stable Diffusion models, kept short and sourced.
- _Interactive:_ A pipeline diagram you step through with tensor shapes at a real resolution (512×512×3 → 64×64×4). A cross-attention heatmap demo on a toy grid where each "word" attends to a region.

**Part 11. The design space: EDM**

- _Question:_ Which of all these choices actually matter, and what are the best ones?
- _Sources:_ Karras et al. 2022 (EDM), Table 1 and Algorithms 1–2.
- _Content:_ Rewriting every model as $\sigma(t)$, $s(t)$ and a denoiser $D$. Why $\sigma(t) = t$ gives straight trajectories. Euler vs Heun, and the $\rho = 7$ step spacing. Preconditioning ($c_\text{skip}$, $c_\text{out}$, $c_\text{in}$, $c_\text{noise}$) as "keep the network's inputs and outputs at unit scale". Log-normal noise sampling in training. The result that a better sampler alone took ADM from 2.07 to 1.55.
- _Interactive:_ The same trained toy model sampled with Euler and Heun at 4–64 steps, showing endpoint error vs evaluations. A $\rho$ slider showing where the step points land on the $\sigma$ axis.

**Part 12. Where it went next: transformers, flow matching and one-step models**

- _Question:_ What do current systems change, and what stayed the same?
- _Sources:_ Flow matching and rectified flow (2022), DiT (2022), progressive distillation (2022), consistency models (2023), DPM-Solver (2022); SD3 as a pointer. Every number checked against the paper first.
- _Content:_ Flow matching as the same regression with a straight path and a velocity target, placed in the conversion table from A.13. DiT: patches and adaLN instead of the U-Net. Getting from 50 steps to 1: better solvers, distillation, consistency. A closing map of the whole series as one argument (the six threads in A.13).
- _Interactive:_ Diffusion (VP) path vs straight flow-matching path between the same noise and data pairs, with the same Euler step budget, so curvature is visible as error.

### B.3 Optional extras (after the main 12, if there is appetite)

- **Inverse problems** (inpainting, super-resolution, deblurring with a pretrained prior; DPS, RePaint).
- **Beyond images:** audio (DiffWave, WaveGrad), video, molecules and proteins, discrete/text diffusion.
- **A from-scratch PyTorch notebook** that mirrors parts 4, 7 and 9 on MNIST, linked from each post.

### B.4 Writing order and milestones

1. Build `dm-core.js` (datasets, schedules, tiny MLP with time embedding, ancestral/DDIM/Heun/Langevin samplers) and pretrain weights for the Swiss roll, two-mode mixture and conditional clusters. Every later demo depends on this.
2. Write parts 1–4 together; they share one model and one notation. Publish as a batch.
3. Parts 5–7 (the score / SDE / ODE arc). Publish as a batch.
4. Parts 8–10 (images, guidance, latent diffusion).
5. Parts 11–12, then go back and add forward links across the series, as was done for the mobile robots series.

### Progress

- **Step 1 done.** `assets/js/diffusion/dm-core.js` (datasets as exact Gaussian mixtures, schedules, forward process, exact model and true reverse kernels, a 5,714-weight MLP with backprop and Adam, DDPM sampler, sliced Wasserstein distance, bound terms), `dm-view.js` (plots, charts, pictures), `dm-scrolly.js`, `assets/css/diffusion.css`, `_includes/dm-series.liquid`. Shipped networks are rebuilt with `node bin/dm-pretrain.js` into `dm-weights.js`: `swissroll-eps` (L_simple), `swissroll-x0` (predicts x₀) and `swissroll-vlb` (the bound's weights), 30,000 steps each.
- **Step 2 done.** Parts 1–4 are published as `_posts/2026-10-29-dm-{1..4}-*.md`. The toy uses T = 200 (the linear schedule stretched by 5); parts 2 and 4 use T = 1000 where the papers' numbers are quoted.
- **Step 3 done.** Parts 5–7 are published (`dm-5-scores-and-langevin`, `dm-6-sdes`, `dm-7-ode-and-ddim`). New engine pieces: exact scores of blurred data, plain and annealed Langevin, a VE noise ladder and the shipped `twomodes-ncsn` score network, VP/VE SDEs with Euler–Maruyama and predictor–corrector sampling, DDIM (any η, even or quadratic spacing), DDIM inversion, and ODE log-likelihoods.
- **Measurement.** Distances are `DM.slicedToData` (a cloud against the exact mixture), with `DM.dataFloor` as the real-data reference. At 800 points the floor is about 0.04 and varies by about ±0.013 between draws, so prose quotes 4,000- or 2,000-sample numbers computed in Node.
- **Step 4 done.** Parts 8–10 are published (`dm-8-improved-ddpm-and-adm`, `dm-9-guidance`, `dm-10-latent-diffusion`). New engine pieces: three-output networks with Improved DDPM's learned variance and hybrid loss, respaced ancestral sampling (fixed or learned variance, noise temperature), k-NN precision and recall, class-conditional networks with condition dropout and classifier-free guidance, exact guided models (`DM.exactGuided`), and the `classes` dataset. New shipped networks: `swissroll-learned` and `classes-cfg`. Part 10 uses 16 × 16 pictures of a dot placed by the Swiss roll, with a hand-written autoencoder.
- **Step 5 done.** Parts 11 and 12 are published (`dm-11-edm-design-space`, `dm-12-where-it-went-next`), and the first plain mention of each other part in every post is now a link. New engine pieces: EDM's denoiser view (`vpDenoiser`, `exactDenoiser`, `edmDenoiser`, `edmTrainer`, `edmSigmas`, `edmStepper`) and flow matching (`flowTrainer`, `flowStepper`, reflow in `bin/dm-pretrain.js`). New shipped networks: `swissroll-edm`, `swissroll-flow`, `swissroll-reflow`. The main series is complete; the optional extras in B.3 remain.

### B.5 Notation (fix once, use everywhere)

- Data $\mathbf{x}_0$, noisy $\mathbf{x}_t$, noise $\boldsymbol\epsilon \sim \mathcal{N}(\mathbf{0}, \mathbf{I})$, discrete steps $t = 1, \dots, T$.
- DDPM symbols $\beta_t$, $\alpha_t = 1 - \beta_t$, $\bar\alpha_t$ in parts 1–5 and 7–10. Switch to $\sigma$ in part 6 (VE) and part 11 (EDM) with an explicit translation box ($\sigma_t^2 = (1-\bar\alpha_t)/\bar\alpha_t$ for VP data scaled by $1/\sqrt{\bar\alpha_t}$).
- Network outputs: $\boldsymbol\epsilon_\theta$, $\hat{\mathbf{x}}_0$, $\mathbf{s}_\theta$, $D_\theta$, $\mathbf{v}_\theta$, with one conversion table introduced in part 5 and repeated in parts 11–12.
- Guidance weight $w$ as in Ho and Salimans; always mention the $1 + w$ library convention.

### B.6 Open questions to settle before writing

- Do all 12 parts run training in the browser, or ship pretrained weights and make training optional? (Plan above: ship weights, offer retraining.)
- One image-scale figure per part: redraw from the papers (needs attribution) or generate our own with a small pretrained model.
- Whether part 3 (the ELBO) should be merged into part 4 for readers who want to skip the derivation; a collapsible "derivation" block may be enough.
