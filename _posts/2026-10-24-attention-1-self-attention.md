---
layout: post
title: "attention is all you need, part 1: self-attention from scratch"
date: 2026-10-24 00:00:00
description: a scroll-through, step-by-step walk through scaled dot-product attention, with every multiplication drawn and every number real
tags: ai llm transformer interactive
categories: explainer
series: attention-is-all-you-need
part: 1
series_description: a five-part, scroll-through rebuild of the Transformer from the paper, from a single attention head to a trained model writing text with a KV cache, with every step drawn and every number real
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

The paper draws the same four steps as a flow chart, its Figure 2 (left). Here it is again, with the shape of every matrix written on its arrow:

<figure class="tf-figure" data-tf-figure="sdpa">
  <noscript><p class="tf-noscript">This figure needs JavaScript. It shows Q and K going into a MatMul, then Scale, an optional Mask, SoftMax, and a second MatMul with V.</p></noscript>
</figure>

Every shape follows from the rules of matrix multiplication: an $$a \times b$$ matrix times a $$b \times c$$ matrix gives $$a \times c$$. With $$n$$ words:

{: .tf-table}
| matrix | shape | in our toy |
| ---------------------------- | ------------------------ | ---------- |
| $$X$$ | $$n \times d_{model}$$ | 6 × 8 |
| $$W_Q,\ W_K,\ W_V$$ | $$d_{model} \times d_k$$ | 8 × 4 |
| $$Q,\ K,\ V$$ | $$n \times d_k$$ | 6 × 4 |
| $$Q K^\top$$ and its softmax | $$n \times n$$ | 6 × 6 |
| output | $$n \times d_k$$ | 6 × 4 |

Counting the multiply-adds gives the cost: $$3\, n\, d_{model}\, d_k$$ for the three projections, then $$n^2 d_k$$ for $$Q K^\top$$ and another $$n^2 d_k$$ for the mix with $$V$$. The first part grows like $$n$$, the second like $$n^2$$. Part 2 comes back to that square.

It is called **scaled dot-product attention**. It is _self_-attention when queries, keys and values all come from the same sentence, as here. In part 4 we'll meet **cross-attention**, where the queries come from one sentence and the keys and values from another.

## What's still missing

Two things in our figure should bother you.

- **Word order.** Nothing in these steps knows where a word is. Shuffle the sentence and each word gets exactly the same output, just in a different row. (Try _"mat the on sat cat the"_, or read [the proof](#order-proof).)
- **One question per word.** A single head can only look for one kind of thing at a time. _sat_ wants to know who sat _and_ where.

The paper fixes both, with **positional encodings** and **multi-head attention**. That is part 2.

## Going deeper

The steps above show _what_ happens. This section is about _why_. Each question stands on its own, so skip to the ones you care about.

### Why divide by √d_k? {#why-sqrt-dk}

Picture a fresh model, before any training. Its weights are random, so the numbers in each query and key behave like independent random numbers with mean 0 and variance 1.

A score is a dot product: $$q \cdot k = q_1 k_1 + q_2 k_2 + \dots + q_{d_k} k_{d_k}$$.

Work out the mean and variance of one term, $$q_i k_i$$. Because $$q_i$$ and $$k_i$$ are independent, the average of a product is the product of the averages:

$$\mathbb{E}[q_i k_i] = \mathbb{E}[q_i]\,\mathbb{E}[k_i] = 0 \cdot 0 = 0$$

$$\text{Var}(q_i k_i) = \mathbb{E}[q_i^2 k_i^2] - \big(\mathbb{E}[q_i k_i]\big)^2 = \mathbb{E}[q_i^2]\,\mathbb{E}[k_i^2] - 0 = 1 \cdot 1 = 1$$

(For a mean-0 number, $$\mathbb{E}[q_i^2]$$ is its variance, which is 1.) Different terms are independent too, so their variances simply add:

$$\text{Var}(q \cdot k) = \sum_{i=1}^{d_k} \text{Var}(q_i k_i) = d_k$$

So the typical size of a score, its standard deviation, is $$\sqrt{d_k}$$. Dividing a number by $$c$$ divides its variance by $$c^2$$, so

$$\text{Var}\!\left(\frac{q \cdot k}{\sqrt{d_k}}\right) = \frac{d_k}{d_k} = 1$$

whatever $$d_k$$ is.

This is footnote 4 of the paper. With the paper's $$d_k = 64$$, raw scores are typically around ±8. Dividing by $$\sqrt{d_k}$$ brings the spread back to about 1, whatever $$d_k$$ is.

Try it below. The left panel keeps a fixed axis, so you can watch the raw scores spread out as $$d_k$$ grows. The right panel, after dividing, keeps the same shape.

<figure class="tf-figure" data-tf-figure="dk">
  <noscript><p class="tf-noscript">This figure needs JavaScript. With d_k = 1024, raw scores have a spread of about 32, and a softmax over 10 of them puts about 98% on one word.</p></noscript>
</figure>

**Why a big spread is bad.** Softmax turns scores into weights. Its gradient says how much weight $$p_i$$ moves when score $$x_j$$ moves. Write $$Z = \sum_l e^{x_l}$$ for the bottom of the fraction, so $$p_i = e^{x_i} / Z$$ and $$\partial Z / \partial x_j = e^{x_j}$$. The quotient rule gives

$$\frac{\partial p_i}{\partial x_j} = \frac{\delta_{ij}\, e^{x_i} Z - e^{x_i} e^{x_j}}{Z^2} = \frac{e^{x_i}}{Z}\left(\delta_{ij} - \frac{e^{x_j}}{Z}\right) = p_i\,(\delta_{ij} - p_j)$$

where $$\delta_{ij}$$ is 1 if $$i = j$$ and 0 otherwise. As a matrix, the whole Jacobian is $$\text{diag}(p) - p\,p^\top$$.

Now suppose the winner has weight $$1 - \varepsilon$$, so all the others share $$\varepsilon$$. Then every entry is at most $$\varepsilon$$:

- for the winner's own entry, $$p_i(1 - p_i) = (1 - \varepsilon)\,\varepsilon \le \varepsilon$$;
- any other entry in the winner's row is $$p_i p_j \le p_j \le \varepsilon$$;
- every other row starts with a factor $$p_i \le \varepsilon$$.

So as the softmax approaches one-hot, its whole gradient goes to 0, as fast as $$\varepsilon$$ does.

So almost no gradient flows back to $$W_Q$$ and $$W_K$$, and attention stops learning. In the paper's words, large dot products _"push the softmax function into regions where it has extremely small gradients"_. The table in the figure measures this: at $$d_k = 1024$$ without the division, the top word takes about 98% and the gradient is more than ten times smaller than with it.

One caveat: the "independent, variance 1" picture is exact only at the start of training. Trained queries and keys are not random. But the start is exactly where it matters. A model that can't take its first steps never learns anything.

### Why not divide by d_k? {#why-not-dk}

That over-corrects. The spread would become $$1/\sqrt{d_k}$$: about 0.125 for $$d_k = 64$$. Scores that small make the softmax nearly flat, so every word gets about the same weight and attention can't pick anything out. $$\sqrt{d_k}$$ is the one divisor that keeps the spread at 1 for every size.

There is a twist. After training, queries and keys are no longer independent, and their dot products can grow like $$d_k$$ rather than $$\sqrt{d_k}$$. For that reason, some recipes for very wide models (μP, [Yang et al., 2022](https://arxiv.org/abs/2203.03466)) do divide by $$d_k$$.

### A dot product, or a small network?

Before the Transformer, the popular choice was **additive attention** ([Bahdanau et al., 2014](https://arxiv.org/abs/1409.0473)). It scores a pair with a tiny neural network, $$v^\top \tanh(W_1 q + W_2 k)$$, instead of a dot product.

The paper says the two work about equally well in theory, but dot products are much faster, because all the scores come out of one matrix multiplication. It also notes that _without_ scaling, additive attention beat dot-product attention for larger $$d_k$$. The authors suspected the large-dot-product problem above, which is why they added the $$\sqrt{d_k}$$.

### Why two matrices, W_Q and W_K?

Write $$x_i$$ for word $$i$$'s row of $$X$$. Its score against word $$j$$ is

$$q_i \cdot k_j = (x_i W_Q)(x_j W_K)^\top = x_i \,\big(W_Q W_K^\top\big)\, x_j^\top$$

So a head really uses one $$d_{model} \times d_{model}$$ matrix, $$A = W_Q W_K^\top$$. Storing it as two thin factors has two benefits. It takes $$2\, d_{model}\, d_k$$ numbers instead of $$d_{model}^2$$. (In our toy the two happen to be equal, 64 each. For one head of the paper's model it is 65,536 instead of 262,144.) And it caps the rank of $$A$$ at $$d_k$$: one head can only compare words along $$d_k$$ directions, which is part of why it can only ask one kind of question.

Why not one matrix _W_ for both queries and keys? Then $$A = W W^\top$$ and the score of word _i_ looking at word _j_ would be $$x_i W W^\top x_j^\top$$, which is exactly the score of _j_ looking at _i_. Every score grid would be symmetric. (The weights need not be, since each row is softmaxed on its own, but a big score from _i_ to _j_ would always mean a big score back.)

Language isn't symmetric. In our hand-wired head, _sat_ looks hard at _cat_ (score 1.92), but _cat_ barely looks at _sat_ (score 0.02). The verb is searching for its subject; the noun isn't searching for its verb. Separate $$W_Q$$ and $$W_K$$ let "what I'm looking for" differ from "what I offer".

### Can one head make any pattern? {#low-rank-bottleneck}

The rank cap above has a sharp consequence. [Bhojanapalli et al. (2020)](https://arxiv.org/abs/2002.07028) asked: given $$n$$ words, can one head produce _any_ $$n \times n$$ weight matrix $$P$$ we like (positive entries, rows adding to 1)? The answer depends on whether $$d_k \ge n$$.

**When $$d_k \ge n$$, yes.** Take $$X$$ with $$n$$ independent rows (so $$d_{model} \ge n$$). Then it has a right inverse $$X^+$$ with $$X X^+ = I_n$$. We want scores $$S = \log P$$, because then $$\text{softmax}(S)$$ is $$P$$ back again: each row of $$e^{\log P}$$ already adds to 1. So pick

$$W_Q W_K^\top = \sqrt{d_k}\; X^+ (\log P)\, (X^+)^\top$$

and check it, step by step:

$$S = \frac{X\, W_Q W_K^\top X^\top}{\sqrt{d_k}} = (X X^+)\,(\log P)\,(X X^+)^\top = I \cdot \log P \cdot I = \log P$$

The middle matrix has rank at most $$n \le d_k$$, so it really can be split into two $$d_{model} \times d_k$$ factors.

**When $$d_k < n$$, not always.** The scores $$S$$ have rank at most $$d_k$$. Softmax ignores a constant added to a row, so the scores that produce $$P$$ are exactly $$\log P + c\,\mathbf{1}^\top$$ for some column $$c$$. Adding $$c\,\mathbf{1}^\top$$ is adding a rank-1 matrix, which changes the rank by at most 1. So if $$\text{rank}(\log P) > d_k + 1$$, no choice of weights reaches $$P$$.

The rank count is not the only way to fail. Even when it allows a pattern, the embeddings themselves can block it. The smallest case: let $$d_{model} = d_k = 1$$ and $$n = 2$$, with word 1 embedded as $$x_1 = 1$$ and word 2 as $$x_2 = 0$$. Every score is $$x_i\, w\, x_j / 1$$, so

$$S = \begin{pmatrix} w & 0 \\ 0 & 0 \end{pmatrix}, \qquad \text{softmax}(\text{row } 2) = (0.5,\ 0.5) \text{ for every } w$$

Word 2's embedding is 0, so all its scores are 0 and it can never prefer anyone, whatever the weights. Part 2 shows [what this means for splitting a model into many small heads]({% post_url 2026-10-24-attention-2-multi-head-and-positions %}#many-heads-cost-the-same).

### Why softmax? {#why-softmax}

We want weights that are positive and add up to 1, so the output is a weighted average of the values. Softmax gives that, and it is smooth, so gradients can flow through it. Picking only the top word (a "hard" max) has no useful gradient at all.

There is a neater reason, too. Among all ways of splitting weight over the words, softmax is the one that best trades off two wishes: put weight on high scores, and stay spread out. Score a split $$p$$ by

$$\sum_i p_i x_i + \tau H(p), \qquad H(p) = -\sum_i p_i \log p_i$$

where $$H$$ is the entropy (how spread out $$p$$ is) and $$\tau > 0$$ says how much spread matters. Maximise it subject to $$\sum_i p_i = 1$$ with a Lagrange multiplier $$\lambda$$. Setting the derivative with respect to $$p_i$$ to zero:

$$x_i - \tau(\log p_i + 1) + \lambda = 0 \quad\Rightarrow\quad p_i = e^{x_i / \tau} \cdot e^{\lambda/\tau - 1}$$

The last factor is the same for every $$i$$, and it has to make the weights add up to 1. So $$p_i = e^{x_i/\tau} / \sum_j e^{x_j/\tau}$$: exactly the softmax of $$x / \tau$$.

$$\tau$$ is called the **temperature**. As $$\tau \to 0$$, spread stops mattering and the answer becomes the hard max. As $$\tau \to \infty$$, only spread matters and every word gets $$1/n$$. Dividing by $$\sqrt{d_k}$$ is choosing a temperature of $$\sqrt{d_k}$$, which is why [too small a divisor](#why-sqrt-dk) gives a near-hard max and [too big a one](#why-not-dk) a near-flat row.

A handy property: adding the same number $$c$$ to every score in a row changes nothing, because it cancels between the top and bottom of the fraction:

$$\frac{e^{x_i + c}}{\sum_j e^{x_j + c}} = \frac{e^c\, e^{x_i}}{e^c \sum_j e^{x_j}} = \frac{e^{x_i}}{\sum_j e^{x_j}}$$

Code uses this to subtract each row's maximum before taking $$e^x$$, so the numbers never overflow. The toy model here does the same.

### Attention is one step of a memory lookup {#hopfield}

There is a second derivation of the same formula, from memory instead of from weights. [Ramsauer et al. (2020)](https://arxiv.org/abs/2008.02217) treat the keys $$k_1, \dots, k_n$$ as stored memories and a query $$q$$ as a noisy cue. To recall the memory that matches the cue, they define an **energy** that is low near a good match:

$$E(q) = -\,L(q) + \tfrac{1}{2}\lVert q \rVert^2, \qquad L(q) = \frac{1}{\beta} \log \sum_j e^{\beta\, q \cdot k_j}$$

$$L$$ is a smooth maximum ("log-sum-exp") of the scores, so $$-L$$ pulls $$q$$ toward the best key, and $$\tfrac{1}{2}\lVert q\rVert^2$$ stops $$q$$ from running off to infinity. $$\beta$$ plays the role of $$1/\tau$$.

**Step 1: the gradient of $$L$$ is attention.** Differentiate the log, then the sum:

$$\nabla L(q) = \frac{1}{\beta} \cdot \frac{\sum_j \beta\, k_j\, e^{\beta\, q \cdot k_j}}{\sum_j e^{\beta\, q \cdot k_j}} = \sum_j p_j\, k_j, \qquad p = \text{softmax}(\beta\, q K^\top)$$

A softmax-weighted average of the keys.

**Step 2: $$L$$ is convex.** Differentiate once more. The Hessian is $$\beta\, K^\top \big(\text{diag}(p) - p\,p^\top\big) K$$, the same softmax Jacobian as in the [√d_k section](#why-sqrt-dk). For any vector $$u$$,

$$u^\top \big(\text{diag}(p) - p\,p^\top\big) u = \sum_j p_j u_j^2 - \Big(\sum_j p_j u_j\Big)^2$$

which is the variance of $$u$$ under the weights $$p$$, so it is never negative.

**Step 3: the update.** $$E$$ is "convex minus convex". The standard trick for such functions (the concave–convex procedure) is to set the gradient of the convex part at the new point equal to the gradient of the subtracted part at the old point: $$q_{new} = \nabla L(q_{old})$$. By step 1,

$$q_{new} = \text{softmax}\big(\beta\, q_{old} K^\top\big)\, K$$

**Step 4: the energy never goes up.** Because $$L$$ is convex, it lies above its tangent line: $$L(q_{new}) \ge L(q_{old}) + q_{new} \cdot (q_{new} - q_{old})$$, using $$\nabla L(q_{old}) = q_{new}$$. Put that into $$E(q_{new}) - E(q_{old})$$:

$$E(q_{new}) - E(q_{old}) \le \tfrac{1}{2}\lVert q_{new}\rVert^2 - \tfrac{1}{2}\lVert q_{old}\rVert^2 - q_{new}\cdot q_{new} + q_{new} \cdot q_{old} = -\tfrac{1}{2}\lVert q_{new} - q_{old}\rVert^2 \le 0$$

So every step moves downhill. The paper also shows that when the memories are well separated, one step already lands almost exactly on the nearest one.

Now set $$\beta = 1/\sqrt{d_k}$$ and read the stored patterns out through a separate value matrix, $$V$$ instead of $$K$$. The update becomes $$\text{softmax}(q K^\top / \sqrt{d_k})\, V$$: one attention row. A Transformer takes this step once per layer rather than repeating it until it settles, so attention has the _same form_ as a Hopfield update rather than being one in the strict sense. It also explains the temperature from a new angle: a large $$\beta$$ (small $$\tau$$) recalls one memory, a small $$\beta$$ blends many. The authors' [blog post](https://ml-jku.github.io/hopfield-layers/) has pictures.

### Why a dot product, and not a distance?

A natural alternative is to score a pair by how _close_ the query and the key are: minus half the squared distance. Expand it:

$$-\tfrac{1}{2}\lVert q - k_j \rVert^2 = q \cdot k_j - \tfrac{1}{2}\lVert q \rVert^2 - \tfrac{1}{2}\lVert k_j \rVert^2$$

The middle term is the same for every key in the row, so by the property above the softmax ignores it. What's left is the dot product plus a bonus $$-\tfrac{1}{2}\lVert k_j\rVert^2$$ for each key. So distance-based attention is dot-product attention with one extra rule: long keys get penalised. The dot product is the simpler of the two, it is one matrix multiply, and $$W_K$$ can learn to control key lengths anyway.

### Attention as a kernel smoother {#kernel-view}

Write one output row without matrices:

$$o_i = \frac{\sum_j \kappa(q_i, k_j)\, v_j}{\sum_j \kappa(q_i, k_j)}, \qquad \kappa(q, k) = e^{\,q \cdot k / \tau}$$

Statisticians have used this shape since the 1960s. It is a **Nadaraya–Watson kernel smoother**: estimate a value at $$q_i$$ by averaging the known values $$v_j$$, weighted by a **kernel** $$\kappa$$ that says how similar $$q_i$$ is to $$k_j$$. [Tsai et al. (2019)](https://arxiv.org/abs/1908.11775) read attention this way and asked which kernel works best.

Run the distance expansion above backwards and the exponential kernel splits into three factors:

$$e^{\,q \cdot k/\tau} = e^{\lVert q\rVert^2 / 2\tau} \cdot e^{\lVert k\rVert^2 / 2\tau} \cdot e^{-\lVert q - k\rVert^2 / 2\tau}$$

The first factor is the same for the whole row, so it cancels between top and bottom. The last is the **Gaussian (RBF) kernel**, the textbook choice. So softmax attention is a Gaussian kernel smoother in which each key also carries a weight $$e^{\lVert k\rVert^2/2\tau}$$.

Tsai et al. swapped the kernel in a Transformer for translation and compared BLEU (higher is better):

{: .tf-table}
| Kernel $$\kappa(q, k)$$ | BLEU |
| ------------------------------------------- | ------------------ |
| linear, $$q \cdot k$$ | did not train |
| polynomial, $$(q \cdot k)^2$$ | 32.72 |
| exponential, $$e^{q \cdot k/\tau}$$ (usual) | 33.98 |
| Gaussian, $$e^{-\lVert q-k\rVert^2/2\tau}$$ | 34.26 |

The linear kernel can go negative, so its "weights" are not weights at all and the averages blow up. Any kernel that stays positive and grows with similarity works, and the exponential is within a fraction of a point of the best. The same paper tried tying $$W_Q = W_K$$ (a symmetric kernel) and got 33.78, so on this task the [symmetry worry](#why-two-matrices-w_q-and-w_k) cost little. The real reasons the plain exponential stays the default are that it is one matrix multiply and that the speed-ups in part 5 are all built around it.

### Why not cosine similarity?

Cosine similarity divides the dot product by both lengths, so every score lands between −1 and 1. That sounds tidy, but it caps how sharp attention can be. In a row of $$n$$ words, the best a word can do is score 1 while all the others score −1:

$$p_{max} \le \frac{e^{1}}{e^{1} + (n-1)\,e^{-1}} = \frac{e^2}{e^2 + n - 1}$$

That is at most 60% for our 6 words, and under 1% for 1,000. A head could never focus on one word in a long text. The fix is to multiply the cosines by a learned temperature, which brings back the freedom the dot product had all along. That is **QK-norm** ([Henry et al., 2020](https://arxiv.org/abs/2010.04245)). A close cousin, LayerNorm on the queries and keys, kept attention scores from blowing up when training the 22-billion-weight ViT-22B ([Dehghani et al., 2023](https://arxiv.org/abs/2302.05442)).

### Why the softmax, and not something cheaper?

The $$n^2$$ cost comes from the softmax. Without it, matrix products can be regrouped:

$$(Q K^\top) V = Q (K^\top V)$$

The left side builds an $$n \times n$$ matrix and costs about $$n^2 d_k$$. The right side builds a $$d_k \times d_k$$ matrix and costs about $$n d_k^2$$: linear in $$n$$. **Linear attention** ([Katharopoulos et al., 2020](https://arxiv.org/abs/2006.16236)) does this, replacing $$e^{q \cdot k}$$ with $$\phi(q) \cdot \phi(k)$$ for some simple positive function $$\phi$$, so the regrouping is allowed.

The price is sharpness. With the softmax, the $$n \times n$$ weight matrix can be anything, including close to one-hot rows. With $$\phi$$, the score matrix is a product of two thin matrices, so its rank is at most the size of $$\phi$$'s output. Low-rank weights can't pick out one word among thousands as cleanly. That is one reason the softmax version is still the default.

### Attention can't see order: the proof {#order-proof}

Reorder the words with a **permutation matrix** $$P$$: a 0/1 matrix with one 1 in every row and column, so $$PX$$ is $$X$$ with its rows shuffled. It has the handy property $$P^\top P = I$$.

Feed in $$PX$$ instead of $$X$$. The queries become $$PX W_Q = PQ$$, and likewise $$PK$$ and $$PV$$. The scores become

$$(PQ)(PK)^\top = P\, Q K^\top P^\top$$

which is the old score grid with its rows _and_ its columns shuffled the same way. Softmax works on each row on its own, and doesn't care about the order of the entries inside a row, so $$\text{softmax}(P S P^\top) = P\, \text{softmax}(S)\, P^\top$$. Then

$$P\, \text{softmax}(S)\, P^\top \cdot PV = P\, \text{softmax}(S)\, V = P \cdot \text{Attention}(X)$$

The output is the old output, shuffled. Nothing else changed. Mathematicians call this **permutation equivariance**, and it is exactly the problem part 2 fixes.

### How the gradient flows back

Training needs the gradient of the loss with respect to $$Q$$, $$K$$ and $$V$$. Write $$S = QK^\top / \sqrt{d_k}$$, $$P = \text{softmax}(S)$$ and $$O = PV$$, and let $$dO$$ be the gradient arriving at the output. The rules for matrix products give

$$dV = P^\top dO, \qquad dP = dO\, V^\top$$

For the softmax, use the Jacobian from [above](#why-sqrt-dk), one row at a time. For a row $$p$$ with incoming gradient $$dp$$:

$$ds = \big(\text{diag}(p) - p\,p^\top\big)\, dp = p \odot \big(dp - (p \cdot dp)\big)$$

where $$\odot$$ multiplies entry by entry. Then back through the scaled product:

$$dQ = \frac{dS\, K}{\sqrt{d_k}}, \qquad dK = \frac{dS^\top Q}{\sqrt{d_k}}$$

Every gradient to $$Q$$ and $$K$$ passes through that factor $$p \odot (\cdots)$$. In a one-hot row, $$p$$ is 0 everywhere except at the winner, and there $$dp - (p \cdot dp)$$ is $$dp_{win} - dp_{win} = 0$$. So $$ds$$ is zero, and $$W_Q$$ and $$W_K$$ learn nothing from that row: the [√d_k story](#why-sqrt-dk) again, seen from the backward pass. $$V$$ is different: $$dV = P^\top dO$$ has no such factor, so values keep learning either way.

## Further reading

- Vaswani et al., [_Attention Is All You Need_](https://arxiv.org/abs/1706.03762) (2017). Section 3.2 covers everything in this post.
- Jay Alammar, [_The Illustrated Transformer_](https://jalammar.github.io/illustrated-transformer/): the classic picture-book version.
- Polo Club, [_Transformer Explainer_](https://poloclub.github.io/transformer-explainer/): GPT-2 running live in your browser.
- Harvard NLP, [_The Annotated Transformer_](https://nlp.seas.harvard.edu/annotated-transformer/): the paper, line by line, in PyTorch.
- Peter Bloem, [_Transformers from scratch_](https://peterbloem.nl/blog/transformers) (2019): builds self-attention up from a plain weighted average, including the √d_k argument.
- Ramsauer et al., [_Hopfield Networks is All You Need_](https://arxiv.org/abs/2008.02217) (2020), and their [blog post](https://ml-jku.github.io/hopfield-layers/): the energy view of [attention as memory lookup](#hopfield).
- Tsai et al., [_Transformer Dissection_](https://arxiv.org/abs/1908.11775) (2019): attention as a [kernel smoother](#kernel-view), and which kernels work.
- Bhojanapalli et al., [_Low-Rank Bottleneck in Multi-head Attention Models_](https://arxiv.org/abs/2002.07028) (2020): the [rank argument](#low-rank-bottleneck) in full.

{% include tf-series.liquid %}
