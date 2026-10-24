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

Like the encoder, the paper stacks N = 6 of them.

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

### Why one masked pass equals writing word by word

With the mask, the output at position $$i$$ depends only on positions $$0 \dots i$$. Every other part of the decoder works on each position on its own, or looks only backwards. So running the decoder on the whole sentence at once gives each position exactly the same vector as running it on just the words up to that point. In our toy the two agree to the last digit.

That's what makes teacher forcing work: one pass trains all $$n$$ predictions at once. It also explains a trick every chat model uses when generating. Earlier positions never change, so their keys and values can be stored and reused (the **KV cache**). Each new word then costs one new row, rather than a rerun of the whole sentence.

### What label smoothing does to the loss

With a smoothed target $$t$$, the loss $$-\sum_w t(w) \log p(w)$$ is smallest when the model's probabilities equal the target exactly, $$p = t$$. Even then it isn't 0: its lowest value is the target's own entropy. For the paper's shared vocabulary of about 37,000 tokens that floor is about 1.38; for our 35 words it is 0.68.

So the best the model can do is put 90% on the right word, never 100%. Without smoothing, the loss keeps falling as the right word's logit grows, so the model is rewarded for becoming ever more certain. Smoothing removes that reward. The paper reports that this makes the model less certain (worse perplexity) but improves both accuracy and BLEU.

### Why warm up?

The paper doesn't say. There are two common explanations, and they don't exclude each other:

- **Adam needs data first.** Adam divides each step by a running estimate of how big the gradients are. In the first few steps that estimate rests on very few samples, so some steps come out far too large. A small learning rate keeps those early steps safe ([Liu et al., 2019](https://arxiv.org/abs/1908.03265)).
- **Post-norm is touchy.** With LayerNorm after each add, as in the paper, gradients near the output are large at the start of training. Moving the LayerNorm inside the residual branch (pre-norm) tames them, and such models can train without any warmup ([Xiong et al., 2020](https://arxiv.org/abs/2002.04745)).

For the record, the paper's Adam settings were $$\beta_1 = 0.9$$, $$\beta_2 = 0.98$$, $$\epsilon = 10^{-9}$$. The schedule peaks at step 4000, at $$512^{-0.5} \cdot 4000^{-0.5} \approx 7.0 \times 10^{-4}$$.

### One table for three jobs

The paper uses a single matrix for three jobs: the encoder's input embedding, the decoder's input embedding, and the final layer that turns vectors into word scores ([Press & Wolf, 2016](https://arxiv.org/abs/1608.05859)). With 37,000 tokens and $$d = 512$$, each copy would be about 19 million weights, so sharing saves tens of millions.

It also makes sense: a word's score is high when the decoder's vector points the same way as that word's embedding. The paper also multiplies the embeddings by $$\sqrt{d_{model}}$$ on the way in. A common explanation: a table shared with the output layer starts with small numbers, and the scaling keeps the words from being drowned out by the positional encodings.

### Greedy decoding vs. beam search

Our loop takes the single most likely word every time (**greedy** decoding). That can paint the model into a corner: a word that looks best now can lead to a worse sentence overall.

**Beam search** keeps the best few partial sentences at every step instead of one. The paper keeps 4. A sentence's score is the sum of its words' log-probabilities, which favours short outputs, since every extra word adds a negative number. A **length penalty** ($$\alpha = 0.6$$ in the paper) corrects for that.

## Further reading

- Vaswani et al., [_Attention Is All You Need_](https://arxiv.org/abs/1706.03762), sections 3.1–3.4 (decoder and output) and 5 (training).
- Harvard NLP, [_The Annotated Transformer_](https://nlp.seas.harvard.edu/annotated-transformer/): the full model and training loop in PyTorch, including the mask and label smoothing.
- Andrej Karpathy, [_Let's build GPT: from scratch, in code, spelled out_](https://www.youtube.com/watch?v=kCc8FmEb1nY): a decoder-only Transformer, built live.
- Jay Alammar, [_The Illustrated GPT-2_](https://jalammar.github.io/illustrated-gpt2/): the decoder-only family, in pictures.

{% include tf-series.liquid %}
