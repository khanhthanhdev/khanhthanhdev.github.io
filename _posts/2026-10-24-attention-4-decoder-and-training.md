---
layout: post
title: "attention is all you need, part 4: the decoder, masking and training"
date: 2026-10-24 03:00:00
description: how the Transformer's decoder writes one word at a time, why it needs a mask, how it reads the encoder through cross-attention, and how the whole model is trained
tags: ai llm transformer interactive
categories: explainer
series: attention-is-all-you-need
part: 4
math: true
toc:
  beginning: true
css:
  - /assets/css/screen-works.css
  - /assets/css/transformer.css
js:
  - /assets/js/transformer/tf-math.js
  - /assets/js/transformer/tf-view.js
  - /assets/js/transformer/part4.js
  - /assets/js/transformer/tf-scrolly.js
---

{% include tf-series.liquid %}

The first three parts built the **encoder**: it reads a sentence and turns each word into a vector shaped by the whole sentence. [Part 3]({% post_url 2026-10-24-attention-3-encoder-block %}) ended with a stack of encoder blocks.

The paper's Transformer was built for **translation**, so it also needs a way to _write_. That is the **decoder**, the right half of Figure 1. It reuses almost everything we've seen, with two changes:

1. Its self-attention is **masked**, so a word can't peek at the words that come after it.
2. It adds **cross-attention**, where it reads the encoder's output.

This part covers the decoder, the output layer, the loop that writes a sentence word by word, and how the whole thing is trained.

Our toy can't translate: it has 35 words and has never been trained. So its task is the simplest one there is: **copy the sentence**. The encoder reads _"the cat sat on the mat"_ and the decoder should write it back. The arithmetic is the same as for translation; only the training data would differ.

## The decoder, step by step

<section class="tf-scrolly" data-tf-scene="part4" data-sentence="the cat sat on the mat">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="overview" data-title="Two stacks: one reads, one writes." markdown="1">
**Here are both halves.** On the left, the encoder from part 3. On the right, the decoder.

A decoder block has three sublayers instead of two, each wrapped in Add & Norm:

1. **masked** self-attention over the words written so far,
2. **cross-attention**, which reads the encoder's output (the blue line),
3. the same kind of feed-forward network as the encoder.

Like the encoder, the paper stacks N = 6 of them. Everything outside the dashed frames runs once: the embeddings and positions at the bottom, and, at the top of the decoder, a linear layer and a softmax that turn the last vector into word probabilities. Notice the forks: self-attention takes Q, K and V from the line below, but cross-attention takes only Q from below. Its K and V arrive from the encoder.

</div>

<div class="tf-step" data-step="shift" data-title="Train on the answer, shifted right." markdown="1">
**How is the decoder trained?** We already know the right output, so we feed it in, moved one place to the right, with a start token `<s>` in front.

Then every position has a simple job: predict the word under it. After `<s>` comes _the_; after _the_ comes _cat_; and so on.

This is called **teacher forcing**. All positions are trained at the same time, in one pass, which is much faster than generating word by word.

</div>

<div class="tf-step" data-step="mask" data-title="The mask hides the future." markdown="1">
**There's a catch.** If position 2 can attend to position 3, it can simply read the answer. The model would learn to copy instead of to predict.

So before the softmax, we add a **mask**: $$-\infty$$ to every score above the diagonal, 0 everywhere else.

$$\text{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}} + M\right) V$$

Since $$e^{-\infty} = 0$$, those words get exactly zero weight. Each row is a word that can only see itself and the words before it, just like when the model writes for real. ([Why not just zero them afterwards?](#why-minus-infinity))

</div>

<div class="tf-step" data-step="cross" data-title="Cross-attention reads the encoder." markdown="1">
**The second sublayer looks across.** It is ordinary multi-head attention with one difference: the **queries** come from the decoder, but the **keys** and **values** come from the encoder's output.

$$\text{Attention}(Q_{\text{decoder}},\, K_{\text{encoder}},\, V_{\text{encoder}})$$

So each word the decoder is writing asks: _which source words matter for me right now?_ In translation, this is where the model lines up _chat_ with _cat_. Hover or tap a word on the left.

Our weights are random, so the lines here don't mean anything yet. There's no mask: the whole source sentence is known from the start.

</div>

<div class="tf-step" data-step="logits" data-title="Scores for every word in the vocabulary." markdown="1">
**From vectors back to words.** The decoder's last row is a vector of 8 numbers. To turn it into a word, we score it against every word in the vocabulary.

The paper does this with the **embedding table itself**: the logits are $$y\,E^\top$$, a dot product with each word's embedding. Reusing $$E$$ saves weights and ties input and output words together.

A softmax turns the logits into probabilities. (My [post on next-word prediction]({% post_url 2026-10-17-how-a-language-model-picks-the-next-word %}) is all about this last step.)

</div>

<div class="tf-step" data-step="generate" data-title="Writing is a loop." markdown="1">
**After training, the decoder writes one word at a time.** Start with `<s>`. Run the decoder, pick the likeliest word, append it, run again. Stop at the end token `</s>`.

The encoder runs once; the decoder runs once per word.

Here is our toy doing exactly that. Its output is nonsense, because it hasn't learned anything. A trained model runs the very same loop and gets the copy right. Real systems usually pick with **beam search** (the paper uses a beam of 4) rather than always taking the top word.

</div>

<div class="tf-step" data-step="loss" data-title="The loss compares two distributions." markdown="1">
**Training measures how wrong the model is.** At each position, compare the model's probabilities with the right answer using **cross-entropy**:

$$\text{loss} = -\sum_{w} \text{target}(w) \cdot \log p(w)$$

The paper uses **label smoothing** with $$\epsilon = 0.1$$. Instead of asking for 100% on the right word, the target is 90%, with the other 10% spread over every other word. The paper notes that this makes the model less sure of itself, which hurts one measure (perplexity) but improves the translations (BLEU).

Our untrained model gives _mat_ almost nothing, so the loss is high. Training uses its gradient to nudge every weight, over and over, to bring it down.

</div>

<div class="tf-step" data-step="warmup" data-title="Warm up, then slow down." markdown="1">
**How big should each nudge be?** The paper uses the Adam optimiser with a learning rate that changes as training goes on:

$$\text{lr} = \frac{\min\!\left(s^{-0.5},\ s \cdot w^{-1.5}\right)}{\sqrt{d_{model}}}$$

where $$s$$ is the training step and $$w = 4000$$ is the number of warmup steps.

For the first 4000 steps it grows in a straight line. Big steps at the very start, when the weights are random, tend to blow training up. After that it shrinks like $$1/\sqrt{\text{step}}$$, so the model settles down.

The base model trained for 100,000 steps, about 12 hours on 8 GPUs.

</div>

<div class="tf-step" data-step="recap" data-title="The whole Transformer." markdown="1">
**And that's the whole model.** Every box in the paper's Figure 1 is something we've now computed by hand:

- embeddings and positional encodings (parts 1 and 2),
- scaled dot-product and multi-head attention (parts 1 and 2),
- Add & Norm and the feed-forward network (part 3),
- masking, cross-attention, the output layer and training (this part).

</div>

  </div>
</section>

## Putting it all together

Here's the full model, in the order the data moves:

1. **Encoder.** Embed the source words, add positions, and run $$N$$ encoder blocks.
2. **Decoder.** Embed the words written so far, add positions, and run $$N$$ decoder blocks. Each one does masked self-attention, cross-attention to the encoder's output, and a feed-forward network.
3. **Output.** Multiply the last decoder vector by $$E^\top$$ and take the softmax to get the next word.
4. **Training.** Teacher forcing, cross-entropy with label smoothing, and Adam with warmup.

The paper's base model has $$d_{model} = 512$$, 8 heads, $$d_{ff} = 2048$$ and $$N = 6$$: about 65 million weights. Our toy has a few thousand. The arithmetic is the same.

## What came next

The paper's encoder–decoder design split into two families almost at once:

- **Encoder only**, like [BERT](https://arxiv.org/abs/1810.04805) (2018): just the left stack, for understanding text.
- **Decoder only**, like [GPT](https://cdn.openai.com/research-covers/language-unsupervised/language_understanding_paper.pdf) (2018): just the right stack, without cross-attention. Masked self-attention and the generation loop from this post are, more or less, how today's chat models write.

The core of every one of them is the equation from part 1.

## Going deeper

### Why −∞ before the softmax, and not 0 after? {#why-minus-infinity}

Adding $$-\infty$$ to a score makes its $$e^{x}$$ exactly 0, so the softmax of a masked row is

$$p_j = \frac{e^{x_j}}{\sum_{l \le i} e^{x_l}} \quad (j \le i)$$

and $$p_j = 0$$ for $$j > i$$.

That is exactly a softmax over the allowed words only. The row still adds up to 1, and future words play no part in it.

Now try it the other way: take the normal softmax, then set the future weights to 0. The row no longer adds up to 1. Worse, the future scores were in the denominator, so the weights that are left still carry a trace of the future words. The model could learn to read that trace.

In real code the mask is usually a large negative number such as $$-10^9$$ rather than true $$-\infty$$. If a whole row is masked (it happens with padding), true infinities give $$0/0$$, which is NaN. The causal mask always leaves the diagonal open, so our toy can use real $$-\infty$$.

### Why one masked pass equals writing word by word {#causal-proof}

Call a layer **causal** if its output at position $$i$$ depends only on its inputs at positions $$0 \dots i$$. Check each part of a decoder block:

- **Masked self-attention** is causal: row $$i$$ of the weights is zero beyond column $$i$$, so output $$i$$ mixes only values $$0 \dots i$$.
- **Cross-attention** reads the encoder's output, which is fixed, plus the decoder's row $$i$$ alone. Causal.
- **Add & Norm** and the **feed-forward network** work on each row on its own. Causal.

And a causal layer fed by a causal layer is causal: output $$i$$ of the second depends on its inputs $$0 \dots i$$, each of which depends only on positions up to itself. So by induction, layer after layer, the whole decoder is causal.

That's the whole proof. Running the decoder on the full sentence at once gives each position exactly the vector it would get from the words up to that point alone. In our toy the two agree to the last digit.

That's what makes teacher forcing work: one pass trains all $$n$$ predictions at once. It also explains a trick every chat model uses when generating. Earlier positions never change, so their keys and values can be stored and reused (the **KV cache**). Each new word then costs one new row, rather than a rerun of the whole sentence. [Part 5]({% post_url 2026-10-24-attention-5-inference %}) draws it step by step.

### Where the loss comes from

Training should make the right answer likely. The probability of a whole target sentence $$y_1 \dots y_n$$, given the source $$x$$, splits into one factor per word. This is just the chain rule of probability, true of any distribution:

$$p(y_1, \dots, y_n \mid x) = \prod_{t=1}^{n} p(y_t \mid y_1, \dots, y_{t-1},\, x)$$

Each factor is what position $$t - 1$$ of the decoder predicts, and the mask guarantees it only sees $$y_1 \dots y_{t-1}$$, exactly as the factor requires. Taking $$-\log$$ turns the product into a sum:

$$-\log p(y \mid x) = \sum_{t=1}^{n} -\log p(y_t \mid y_{<t},\, x)$$

Each term is the cross-entropy of position $$t$$ against a one-hot target. So minimising cross-entropy summed over positions is the same as **maximising the likelihood** of the training sentences.

### The gradient is "prediction minus target" {#ce-gradient}

Cross-entropy and softmax fit together unusually well. Write the logits as $$z$$ and the probabilities as $$p = \text{softmax}(z)$$, so $$\log p_w = z_w - \log \sum_v e^{z_v}$$. For a target $$t$$ that adds up to 1:

$$\text{loss} = -\sum_w t_w \log p_w = -\sum_w t_w z_w + \log \sum_v e^{z_v}$$

The derivative of the last term with respect to $$z_j$$ is $$e^{z_j} / \sum_v e^{z_v} = p_j$$. So

$$\frac{\partial\, \text{loss}}{\partial z_j} = p_j - t_j$$

No softmax Jacobian, no division: the gradient on each word's logit is how much probability the model gave it minus how much it should have. Every learning signal in the model starts from this vector.

### What label smoothing does to the loss

With a smoothed target $$t$$, the loss $$-\sum_w t(w) \log p(w)$$ is smallest when the model's probabilities equal the target exactly, $$p = t$$. Here is why. The cross-entropy splits into two parts:

$$-\sum_w t_w \log p_w = \underbrace{-\sum_w t_w \log t_w}_{H(t)} + \underbrace{\sum_w t_w \log \frac{t_w}{p_w}}_{\text{KL}(t \,\Vert\, p)}$$

The first part, the target's entropy, doesn't depend on the model at all. The second, the Kullback–Leibler divergence, is never negative and is 0 only when $$p = t$$ (Gibbs' inequality). So the loss can never go below $$H(t)$$.

That floor is above 0 whenever the target is spread out. For the paper's shared vocabulary of about 37,000 tokens that floor is about 1.38; for our 35 words it is 0.68.

So the best the model can do is put 90% on the right word, never 100%. The [gradient](#ce-gradient) says the same thing. With a one-hot target, the right word's gradient is $$p - 1$$, which is negative until $$p$$ reaches exactly 1: the logit is pushed up forever, and the model is rewarded for becoming ever more certain. With smoothing, it is $$p - 0.9$$, which turns positive once the model is more than 90% sure, and pushes back. Smoothing removes the reward for overconfidence. The paper reports that this makes the model less certain (worse perplexity) but improves both accuracy and BLEU.

### Why warm up?

The paper doesn't say. There are two common explanations, and they don't exclude each other:

- **Adam needs data first.** Adam divides each step by a running estimate of how big the gradients are. In the first few steps that estimate rests on very few samples, so some steps come out far too large. A small learning rate keeps those early steps safe ([Liu et al., 2019](https://arxiv.org/abs/1908.03265)).
- **Post-norm is touchy.** With LayerNorm after each add, as in the paper, gradients near the output are large at the start of training. Moving the LayerNorm inside the residual branch (pre-norm) tames them, and such models can train without any warmup ([Xiong et al., 2020](https://arxiv.org/abs/2002.04745)).

Where is the peak? The schedule is the smaller of a falling curve, $$s^{-0.5}$$, and a rising line, $$s \cdot w^{-1.5}$$. They cross where

$$s^{-0.5} = s \cdot w^{-1.5} \quad\Leftrightarrow\quad s^{1.5} = w^{1.5} \quad\Leftrightarrow\quad s = w$$

so the switch from warming up to decaying happens exactly at step $$w$$, and the peak learning rate is $$d_{model}^{-0.5} \cdot w^{-0.5}$$.

For the record, the paper's Adam settings were $$\beta_1 = 0.9$$, $$\beta_2 = 0.98$$, $$\epsilon = 10^{-9}$$. The schedule peaks at step 4000, at $$512^{-0.5} \cdot 4000^{-0.5} \approx 7.0 \times 10^{-4}$$.

### Why Adam's first steps are unreliable: the variance argument {#adam-variance}

[Liu et al. (2019)](https://arxiv.org/abs/1908.03265) turned the first explanation into a calculation. Adam scales each step by an **adaptive factor** $$\psi_t = 1 / \sqrt{\hat v_t}$$, where $$\hat v_t$$ is its running average of squared gradients. The question is how much that factor jumps around early on.

**At step 1 its variance is infinite.** The average holds one sample, so $$\hat v_1 = g_1^2$$ and $$\psi_1 = 1/\lvert g_1 \rvert$$. Model the gradient as random noise around 0, $$g_1 \sim \mathcal{N}(0, \sigma^2)$$, with density $$\varphi$$. Then

$$\mathbb{E}\big[\psi_1^2\big] = \int_{-\infty}^{\infty} \frac{\varphi(g)}{g^2}\, dg$$

Near $$g = 0$$ the density is about $$\varphi(0) > 0$$, and $$\int_{-\delta}^{\delta} dg / g^2$$ is infinite. So the expected square of $$\psi_1$$ is infinite: a gradient that happens to be tiny makes the factor huge.

(A caveat: with bias correction, Adam's actual first step is $$\hat m_1 / \sqrt{\hat v_1} = g_1 / \lvert g_1 \rvert$$, just the sign of $$g_1$$, which is bounded. The trouble is the factor $$\psi$$ itself, which over the next steps multiplies a momentum built from different gradients than the ones in $$\hat v$$.)

**Later, it shrinks with the number of samples.** An exponential average with decay $$\beta_2$$ behaves roughly like a plain average of a limited number of samples. The paper calls that number $$\rho_t$$:

$$\rho_\infty = \frac{2}{1 - \beta_2} - 1, \qquad \rho_t = \rho_\infty - \frac{2 t\, \beta_2^t}{1 - \beta_2^t}$$

Treating $$1/\hat v_t$$ like a scaled chi-squared variable with $$\rho_t$$ degrees of freedom, they get

$$\text{Var}[\psi_t] \approx \frac{\rho_t}{2(\rho_t - 2)(\rho_t - 4)\, \sigma^2}$$

which is finite only once $$\rho_t > 4$$, and falls towards its final value as $$\rho_t$$ grows. Their fix, **RAdam**, multiplies the step by $$r_t$$, the square root of (final variance ÷ current variance), and uses plain momentum SGD while $$\rho_t \le 4$$. For the paper's $$\beta_2 = 0.98$$, $$\rho_\infty = 99$$, and:

{: .tf-table}
| $$t$$ | 1–4 | 5 | 10 | 50 | 100 | 500 |
| ---------- | --- | ---- | ---- | ---- | ---- | ---- |
| $$\rho_t$$ | < 4 | 4.92 | 9.67 | 41.7 | 68.4 | 99.0 |
| $$r_t$$ | – | 0.08 | 0.22 | 0.62 | 0.82 | 1.00 |

(In steps 1–4 RAdam takes a plain momentum step instead.) That is a warmup, derived instead of hand-tuned: it ramps from almost 0 to full size over a few hundred steps. The paper's 4000-step warmup is far longer, which is one hint that the post-norm explanation matters too.

### One table for three jobs

The paper uses a single matrix for three jobs: the encoder's input embedding, the decoder's input embedding, and the final layer that turns vectors into word scores ([Press & Wolf, 2016](https://arxiv.org/abs/1608.05859)). With 37,000 tokens and $$d = 512$$, each copy would be about 19 million weights, so sharing saves tens of millions.

It also makes sense: a word's score is high when the decoder's vector points the same way as that word's embedding. The paper also multiplies the embeddings by $$\sqrt{d_{model}}$$ on the way in. A common explanation: a table shared with the output layer starts with small numbers, and the scaling keeps the words from being drowned out by the positional encodings.

### Can 512 numbers describe 37,000 choices? {#softmax-bottleneck}

The output layer has a hidden limit. Stack the decoder's final vectors for many different contexts into a matrix $$H$$ (one row per context, $$d$$ columns) and the embedding table into $$E$$ (one row per token). The scores are $$H E^\top$$. A product through $$d$$ columns has rank at most $$d$$.

The model's log-probabilities are the scores minus each row's log-sum-exp:

$$\log P = H E^\top - c\, \mathbf{1}^\top, \qquad c_i = \log \sum_w e^{(H E^\top)_{iw}}$$

Subtracting $$c\,\mathbf{1}^\top$$ is subtracting a rank-1 matrix, which raises the rank by at most 1. So **every** log-probability matrix the model can produce has rank at most $$d + 1$$, however many contexts and tokens there are. [Yang et al. (2017)](https://arxiv.org/abs/1711.03953) call this the **softmax bottleneck**. If the true log-probabilities of language, over all contexts, have rank higher than $$d + 1$$, then some contexts must get the wrong distribution, whatever the weights.

Whether language really is that high-rank can't be proved, but they measured it. On a 10,000-token language-modelling task, the plain softmax's log-probability matrix had rank about equal to $$d$$ (400), as the bound says. Their **mixture of softmaxes**, which averages several softmaxes _before_ taking the log, is not limited by it: its matrix reached rank 9,981, and its perplexity improved. For the paper's $$d = 512$$ and 37,000 tokens, the bound is real, though bigger $$d$$ in later models makes it bite less.

### Counting to 65 million

The weights of the base model ($$d = 512$$, $$d_{ff} = 4d$$, $$N = 6$$, ignoring biases and LayerNorms) add up from the pieces of this series:

- each **encoder** block: $$4d^2$$ for attention and $$8d^2$$ for the feed-forward network, so $$12 d^2$$;
- each **decoder** block: two attention sublayers and a feed-forward network, so $$16 d^2$$;
- the shared **embedding** table: $$37{,}000 \times 512$$.

$$6 \cdot 12 d^2 + 6 \cdot 16 d^2 + 37{,}000\, d = 18.9\text{M} + 25.2\text{M} + 18.9\text{M} \approx 63\text{M}$$

That is close to the 65 million the paper reports (Table 3). Without the shared table it would be about 38 million more. Attention itself is under a third of the total; the feed-forward networks and the embeddings hold the rest.

### Why teacher forcing, and not training on the model's own words?

Teacher forcing feeds the decoder the _right_ previous words, even where the model would have picked wrong ones. That has a cost, called **exposure bias**: in training the model never sees its own mistakes, so in use one bad word can lead it somewhere it has never been.

The alternative, feeding the model its own picks during training, would fix that, but it brings back the RNN's problem. Each word would have to wait for the previous one to be chosen, so training would need $$n$$ passes per sentence instead of one. [Scheduled sampling](https://arxiv.org/abs/1506.03099) mixes the two, but for Transformers the speed of teacher forcing has mostly won.

### Greedy decoding vs. beam search

Our loop takes the single most likely word every time (**greedy** decoding). That can paint the model into a corner: a word that looks best now can lead to a worse sentence overall.

**Beam search** keeps the best few partial sentences at every step instead of one. The paper keeps 4. A sentence's score is the sum of its words' log-probabilities, which favours short outputs, since every extra word adds a negative number. A **length penalty** ($$\alpha = 0.6$$ in the paper) corrects for that.

The penalty comes from Google's translation system ([Wu et al., 2016](https://arxiv.org/abs/1609.08144), eq. 14), which the paper cites. Divide the log-probability by a slowly growing function of the length $$\lvert Y \rvert$$:

$$\text{score}(Y) = \frac{\log P(Y \mid X)}{\text{lp}(Y)}, \qquad \text{lp}(Y) = \left(\frac{5 + \lvert Y \rvert}{5 + 1}\right)^{\alpha}$$

With $$\alpha = 0$$, $$\text{lp} = 1$$ and nothing changes. With $$\alpha = 1$$, it is close to dividing by the length: an average per word. $$\alpha = 0.6$$ sits in between. The 5 keeps very short outputs from being divided by almost nothing, and the $$+1$$ makes $$\text{lp} = 1$$ for one word.

A worked case. A 3-token candidate with $$\log P = -3.0$$ beats an 8-token one with $$\log P = -3.8$$ on raw score. With the penalty:

$$\frac{-3.0}{(8/6)^{0.6}} = \frac{-3.0}{1.188} = -2.52, \qquad \frac{-3.8}{(13/6)^{0.6}} = \frac{-3.8}{1.590} = -2.39$$

Now the longer sentence wins. Google's system also adds a coverage term, which rewards translations that attend to every source word; the Transformer paper reports only $$\alpha$$. It also stops decoding at the input length plus 50 tokens.

## Further reading

- Vaswani et al., [_Attention Is All You Need_](https://arxiv.org/abs/1706.03762), sections 3.1–3.4 (decoder and output) and 5 (training).
- Harvard NLP, [_The Annotated Transformer_](https://nlp.seas.harvard.edu/annotated-transformer/): the full model and training loop in PyTorch, including the mask and label smoothing.
- Andrej Karpathy, [_Let's build GPT: from scratch, in code, spelled out_](https://www.youtube.com/watch?v=kCc8FmEb1nY): a decoder-only Transformer, built live.
- Jay Alammar, [_The Illustrated GPT-2_](https://jalammar.github.io/illustrated-gpt2/): the decoder-only family, in pictures.
- Jay Mody, [_GPT in 60 Lines of NumPy_](https://jaykmody.com/blog/gpt-from-scratch/) (2023): a working decoder you can read in one sitting.
- Liu et al., [_On the Variance of the Adaptive Learning Rate and Beyond_](https://arxiv.org/abs/1908.03265) (2019): the [variance argument](#adam-variance) for warmup, and RAdam.
- Yang et al., [_Breaking the Softmax Bottleneck_](https://arxiv.org/abs/1711.03953) (2017): the [rank limit](#softmax-bottleneck) of the output layer.
- Wu et al., [_Google's Neural Machine Translation System_](https://arxiv.org/abs/1609.08144) (2016): where the length penalty comes from.

{% include tf-series.liquid %}
