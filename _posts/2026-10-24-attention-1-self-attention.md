---
layout: post
title: "attention is all you need, part 1: self-attention from scratch"
date: 2026-10-24 00:00:00
description: a scroll-through, step-by-step walk through scaled dot-product attention, with every multiplication drawn and every number real
tags: ai llm transformer interactive
categories: explainer
series: attention-is-all-you-need
part: 1
math: true
toc:
  beginning: true
css:
  - /assets/css/screen-works.css
  - /assets/css/transformer.css
js:
  - /assets/js/transformer/tf-math.js
  - /assets/js/transformer/tf-view.js
  - /assets/js/transformer/part1.js
  - /assets/js/transformer/tf-scrolly.js
  - /assets/js/transformer/tf-figures.js
---

{% include tf-series.liquid %}

In 2017 a team at Google published a paper with a bold title: [_Attention Is All You Need_](https://arxiv.org/abs/1706.03762). It described the **Transformer**. Today almost every large language model, from ChatGPT to Claude, is built on it.

This series rebuilds the Transformer piece by piece. Every figure runs a real (but tiny) Transformer in your browser, and every number you see is computed, not drawn by hand. You can change the sentence and watch every matrix change with it.

This first part covers the idea at the heart of the paper: **self-attention**. In a [previous post]({% post_url 2026-10-17-how-a-language-model-picks-the-next-word %}) I treated the network as a black box that hands out scores. Now we open the box.

## The toy model

Real models are huge: GPT-3 gives each word 12,288 numbers. Ours gives each word **8**, so whole matrices fit on screen. The rest of the setup:

- a vocabulary of about 30 words (press _words it knows_ in the figure to see them),
- attention with **d_k = 4** numbers per query and key,
- weights from a fixed random seed, except for one attention head that I wired by hand so it has a clear story to tell.

The model is not trained, so it can't write a sentence. But the arithmetic is exactly the arithmetic of the paper. I checked it against PyTorch's own Transformer layers, and they agree to within 10⁻¹⁴.

Scroll slowly. Inside each step, scrolling also plays the step: matrices fill in one cell at a time.

## Self-attention, step by step

<section class="tf-scrolly" data-tf-scene="part1" data-sentence="the cat sat on the mat">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="rnn" data-title="An RNN reads one word at a time." markdown="1">
**Before Transformers**, language models were mostly **recurrent networks** (RNNs). They read a sentence like we do: one word at a time, left to right.

After each word, the RNN updates one **memory vector**, _h_. Everything it knows about the start of the sentence has to survive being passed down that chain.

Two problems follow. Long sentences get blurry, because early words fade from the memory. And it is slow, because word 6 can't start until word 5 is done.

</div>

<div class="tf-step" data-step="pairs" data-title="Attention joins every pair of words." markdown="1">
**Attention throws the chain away.** Every word gets to look straight at every other word, in one step.

The distance between the first and the last word is now the same as between neighbours: one hop. And all the pairs can be computed at the same time, which is what GPUs are good at.

The question is _how much_ each word should look at each other word. That is what the next steps compute.

</div>

<div class="tf-step" data-step="embed" data-title="Each word becomes a row of numbers." markdown="1">
**First, words become numbers.** Each word in the vocabulary has an id, and the **embedding table** _E_ has one row per id. We look up one row per word and stack them into a matrix _X_.

_X_ has one row per word and 8 columns. In a real model the columns are learned and mean nothing we can name. In this toy I gave them names: _noun_, _verb_, _animal_, and so on. That makes it easier to see why the attention below comes out the way it does.

</div>

<div class="tf-step" data-step="query" data-title="Queries: what is each word looking for?" markdown="1">
**Each word asks a question.** We multiply _X_ by a weight matrix $$W_Q$$ to get the **queries** $$Q = X W_Q$$.

Watch the figure: row _i_ of _X_ times column _j_ of $$W_Q$$ gives cell (_i_, _j_) of _Q_. Multiply the pairs and add them up, as written at the bottom of the figure. That is all matrix multiplication is.

The wiring I chose means a verb's query says _"I'm looking for an animal"_ and a preposition's query says _"I'm looking for a thing"_.

</div>

<div class="tf-step" data-step="keyvalue" data-title="Keys and values, the same way." markdown="1">
**Two more matrices, the same trick.** $$K = X W_K$$ gives every word a **key**, and $$V = X W_V$$ gives it a **value**.

A helpful picture is a library search:

- the **query** is what you type into the search box,
- each **key** is the label on a book's spine,
- each **value** is what is inside the book.

Queries are matched against keys. Values are what you take home.

</div>

<div class="tf-step" data-step="scores" data-title="Every query meets every key." markdown="1">
**Now we score every pair.** The score for word _i_ looking at word _j_ is the dot product of query _i_ and key _j_. Doing all pairs at once is one matrix product: $$Q K^\top$$.

$$K^\top$$ is _K_ turned on its side, so its columns are the keys. The result is a square grid: one row per word asking, one column per word being asked.

A large dot product means the query and the key point the same way: a good match. Red cells are strong matches.

</div>

<div class="tf-step" data-step="scale" data-title="Divide by √d_k to keep scores tame." markdown="1">
**Then we shrink the scores**, dividing by $$\sqrt{d_k}$$. With $$d_k = 4$$, that is a divide by 2.

Why? A dot product adds up $$d_k$$ products. The more terms, the bigger the scores get (they grow like $$\sqrt{d_k}$$). Very big scores make the next step, softmax, put almost all the weight on one word. Then learning gets stuck.

Try the demo on the right. Random queries and keys, with $$d_k$$ = 1024 and no division, hand nearly 100% to one word. Tick _divide by √d_k_ and the spread comes back.

Where does $$\sqrt{d_k}$$ come from? See [why divide by √d_k](#why-sqrt-dk) further down.

</div>

<div class="tf-step" data-step="softmax" data-title="Softmax turns each row into weights." markdown="1">
**Scores become weights.** We apply **softmax** to each row. It makes every number positive and makes each row add up to exactly 1:

$$\text{softmax}(x)_i = \frac{e^{x_i}}{\sum_j e^{x_j}}$$

Now row _i_ says how word _i_ splits its attention: a percentage for every word in the sentence. Hover or tap a row label to see it as bars.

Look at _sat_: most of its attention goes to _cat_. The verb found who did the sitting.

</div>

<div class="tf-step" data-step="output" data-title="Each output is a weighted mix of values." markdown="1">
**Finally, we mix the values.** Multiply the weights by _V_. Output row _i_ is a blend of all the value rows, each in the amount given by row _i_ of the weights.

So the new vector for _sat_ is mostly _cat_'s value, plus a little of everything else. Each word has gathered information from the words that matter to it.

The output has one row per word, just like _X_. That's important: it means we can stack these layers, as part 3 shows.

</div>

<div class="tf-step" data-step="lines" data-title="Who looks at whom." markdown="1">
**Here is the whole head at a glance.** Each line goes from a word asking (left) to a word being asked (right). Thicker lines mean more attention.

Hover a word on the left. Then try your own sentence in the box above: _"the quick brown fox jumped over the lazy dog"_ or _"my dog chased a ball in the park"_.

Adjectives find their nouns, verbs find animals, prepositions find things. In a trained model nobody wires this by hand. It is learned from data, and some heads really do learn patterns like these.

</div>

  </div>
</section>

## The whole thing in one line

Everything the figure did is the paper's equation (1):

$$\text{Attention}(Q, K, V) = \text{softmax}\!\left(\frac{Q K^\top}{\sqrt{d_k}}\right) V$$

with $$Q = X W_Q$$, $$K = X W_K$$ and $$V = X W_V$$. Reading it from the inside out:

1. $$Q K^\top$$: score every query against every key.
2. $$\div \sqrt{d_k}$$: keep the scores in a sensible range.
3. softmax: turn each row of scores into weights that sum to 1.
4. $$\times V$$: mix the values with those weights.

It is called **scaled dot-product attention**. It is _self_-attention when queries, keys and values all come from the same sentence, as here. In part 4 we'll meet **cross-attention**, where the queries come from one sentence and the keys and values from another.

## What's still missing

Two things in our figure should bother you.

- **Word order.** Nothing in these steps knows where a word is. Shuffle the sentence and each word gets exactly the same output, just in a different row. (Try _"mat the on sat cat the"_.)
- **One question per word.** A single head can only look for one kind of thing at a time. _sat_ wants to know who sat _and_ where.

The paper fixes both, with **positional encodings** and **multi-head attention**. That is part 2.

## Going deeper

The steps above show _what_ happens. This section is about _why_. Each question stands on its own, so skip to the ones you care about.

### Why divide by √d_k? {#why-sqrt-dk}

Picture a fresh model, before any training. Its weights are random, so the numbers in each query and key behave like independent random numbers with mean 0 and variance 1.

A score is a dot product: $$q \cdot k = q_1 k_1 + q_2 k_2 + \dots + q_{d_k} k_{d_k}$$.

- Each product $$q_i k_i$$ has mean 0 and variance $$1 \times 1 = 1$$.
- The variances of independent terms add up. With $$d_k$$ terms, the variance of $$q \cdot k$$ is $$d_k$$.
- So the typical size of a score (its standard deviation) is $$\sqrt{d_k}$$.

This is footnote 4 of the paper. With the paper's $$d_k = 64$$, raw scores are typically around ±8. Dividing by $$\sqrt{d_k}$$ brings the spread back to about 1, whatever $$d_k$$ is.

Try it below. The left panel keeps a fixed axis, so you can watch the raw scores spread out as $$d_k$$ grows. The right panel, after dividing, keeps the same shape.

<figure class="tf-figure" data-tf-figure="dk">
  <noscript><p class="tf-noscript">This figure needs JavaScript. With d_k = 1024, raw scores have a spread of about 32, and a softmax over 10 of them puts about 98% on one word.</p></noscript>
</figure>

**Why a big spread is bad.** Softmax turns scores into weights. Its gradient, how much weight $$p_i$$ moves when score $$x_j$$ moves, is

$$\frac{\partial p_i}{\partial x_j} = p_i\,(\delta_{ij} - p_j)$$

where $$\delta_{ij}$$ is 1 if $$i = j$$ and 0 otherwise. When one weight is close to 1 and the rest are close to 0, every one of these terms is close to 0. For the winner, $$p_i(1 - p_i) \approx 0$$. For everyone else, $$p_i \approx 0$$.

So almost no gradient flows back to $$W_Q$$ and $$W_K$$, and attention stops learning. In the paper's words, large dot products _"push the softmax function into regions where it has extremely small gradients"_. The table in the figure measures this: at $$d_k = 1024$$ without the division, the top word takes about 98% and the gradient is more than ten times smaller than with it.

One caveat: the "independent, variance 1" picture is exact only at the start of training. Trained queries and keys are not random. But the start is exactly where it matters. A model that can't take its first steps never learns anything.

### Why not divide by d_k?

That over-corrects. The spread would become $$1/\sqrt{d_k}$$: about 0.125 for $$d_k = 64$$. Scores that small make the softmax nearly flat, so every word gets about the same weight and attention can't pick anything out. $$\sqrt{d_k}$$ is the one divisor that keeps the spread at 1 for every size.

There is a twist. After training, queries and keys are no longer independent, and their dot products can grow like $$d_k$$ rather than $$\sqrt{d_k}$$. For that reason, some recipes for very wide models (μP, [Yang et al., 2022](https://arxiv.org/abs/2203.03466)) do divide by $$d_k$$.

### A dot product, or a small network?

Before the Transformer, the popular choice was **additive attention** ([Bahdanau et al., 2014](https://arxiv.org/abs/1409.0473)). It scores a pair with a tiny neural network, $$v^\top \tanh(W_1 q + W_2 k)$$, instead of a dot product.

The paper says the two work about equally well in theory, but dot products are much faster, because all the scores come out of one matrix multiplication. It also notes that _without_ scaling, additive attention beat dot-product attention for larger $$d_k$$. The authors suspected the large-dot-product problem above, which is why they added the $$\sqrt{d_k}$$.

### Why two matrices, W_Q and W_K?

Why not one matrix _W_ for both queries and keys? Then the score of word _i_ looking at word _j_ would be $$x_i W W^\top x_j$$, which is exactly the score of _j_ looking at _i_. Every attention pattern would be symmetric.

Language isn't symmetric. In our hand-wired head, _sat_ looks hard at _cat_ (score 1.92), but _cat_ barely looks at _sat_ (score 0.02). The verb is searching for its subject; the noun isn't searching for its verb. Separate $$W_Q$$ and $$W_K$$ let "what I'm looking for" differ from "what I offer".

### Why softmax?

We want weights that are positive and add up to 1, so the output is a weighted average of the values. Softmax gives that, and it is smooth, so gradients can flow through it. Picking only the top word (a "hard" max) has no useful gradient at all.

A handy property: adding the same number to every score in a row changes nothing, because it cancels between the top and bottom of the fraction. Code uses this to subtract each row's maximum before taking $$e^x$$, so the numbers never overflow. The toy model here does the same.

## Further reading

- Vaswani et al., [_Attention Is All You Need_](https://arxiv.org/abs/1706.03762) (2017). Section 3.2 covers everything in this post.
- Jay Alammar, [_The Illustrated Transformer_](https://jalammar.github.io/illustrated-transformer/): the classic picture-book version.
- Polo Club, [_Transformer Explainer_](https://poloclub.github.io/transformer-explainer/): GPT-2 running live in your browser.
- Harvard NLP, [_The Annotated Transformer_](https://nlp.seas.harvard.edu/annotated-transformer/): the paper, line by line, in PyTorch.

{% include tf-series.liquid %}
