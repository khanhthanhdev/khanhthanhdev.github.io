---
layout: post
title: "attention is all you need, part 2: multi-head attention and positions"
date: 2026-10-24 01:00:00
description: how the Transformer learns word order from sine waves, and why it runs several attention heads side by side
tags: ai llm transformer interactive
categories: explainer
series: attention-is-all-you-need
part: 2
math: true
toc:
  beginning: true
css:
  - /assets/css/screen-works.css
  - /assets/css/transformer.css
js:
  - /assets/js/transformer/tf-math.js
  - /assets/js/transformer/tf-view.js
  - /assets/js/transformer/part2.js
  - /assets/js/transformer/tf-scrolly.js
---

{% include tf-series.liquid %}

[Part 1]({% post_url 2026-10-24-attention-1-self-attention %}) built one attention head from scratch. It ended with two problems:

1. Attention can't tell word order. _"The cat sat on the mat"_ and _"mat the on sat cat the"_ look the same to it.
2. One head can only ask one kind of question at a time.

The paper solves the first with **positional encodings** and the second with **multi-head attention**. Both are small ideas. Let's see them with real numbers.

As before, this is the tiny model from part 1: 8 numbers per word and real arithmetic. The sentence is editable, and scrolling inside a step plays it.

## Positions and heads, step by step

<section class="tf-scrolly" data-tf-scene="part2" data-sentence="the cat sat on the mat">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="shuffle" data-title="Without positions, order is invisible." markdown="1">
**First, the problem.** On the left is the output of an attention layer for our sentence. On the right is the same sentence reversed.

Every line joins a word to the same word in the other sentence. Their rows are _exactly_ equal. The layer has no idea the order changed. It only moved the rows around.

That makes sense. Attention compares every word with every other word, and nothing in those comparisons says _where_ a word is.

</div>

<div class="tf-step" data-step="waves" data-title="Each position gets a pattern of waves." markdown="1">
**The fix: give each position its own fingerprint.** The paper uses waves. Column $$2i$$ of the encoding is a sine wave and column $$2i+1$$ is a cosine, each at its own speed:

$$PE_{(pos,\,2i)} = \sin\!\left(\frac{pos}{10000^{2i/d}}\right)$$

$$PE_{(pos,\,2i+1)} = \cos\!\left(\frac{pos}{10000^{2i/d}}\right)$$

The first pair of waves wiggles fast and the last pair barely moves. Read down at any position (the blue line) and you get 8 heights. That is the position's row of PE. No two positions have the same row.

</div>

<div class="tf-step" data-step="addpe" data-title="Positions are added to the words." markdown="1">
**Then we simply add.** Each word's row of _X_ gets its position's row of PE added to it, number by number.

Adding, not appending, keeps the size at 8 numbers. The word is still in there, and now the position is too. Two copies of _the_ at positions 0 and 4 now get different rows.

From here on, every layer sees $$X + PE$$ instead of _X_.

</div>

<div class="tf-step" data-step="order" data-title="Now order changes the result." markdown="1">
**Run the same test again**, this time with positions added.

Now the lines turn red and dashed: the same word gets a different output depending on where it stands. Word order finally matters.

(There is nothing special about reversing. Any other order would show the same thing.)

</div>

<div class="tf-step" data-step="rotate" data-title="One step later is always the same turn." markdown="1">
**Why waves, and not just the numbers 0, 1, 2, …?** Plain counting grows without limit, and the network would only ever see small numbers while training.

Waves stay between −1 and 1. They also have a nice property. Treat each sine/cosine pair as a point on a circle. Moving one position later turns the point by the same angle, wherever it starts.

So _"the word just before me"_ is the same rotation at position 3 as at position 300. A weight matrix can learn to recognise it once and use it everywhere. ([The proof is below](#shift-is-rotation).) The paper says the authors chose waves because they hoped the model could _"easily learn to attend by relative positions"_.

</div>

<div class="tf-step" data-step="heads" data-title="Several heads ask several questions." markdown="1">
**Now the second problem.** _sat_ wants to know _who_ sat, but also _where_. One softmax row can't put most of its weight on two places at once.

So the Transformer runs several heads side by side. Each head has its own $$W_Q$$, $$W_K$$ and $$W_V$$ and runs its own attention, exactly as in part 1.

Our toy has 2 heads. Head 1 is the hand-wired one from part 1. Head 2 is random. Hover or tap a row to compare them. In a trained model every head learns a pattern of its own. Some track the previous word, some link a pronoun to its noun, and some just look at punctuation.

</div>

<div class="tf-step" data-step="concat" data-title="Heads are joined, then mixed." markdown="1">
**Each head is made smaller**, so the total cost stays the same. With $$d_{model} = 8$$ and 2 heads, each head works with $$d_k = 8 / 2 = 4$$ numbers.

The heads' outputs are placed side by side ("concatenated") to get back to 8 numbers per word. Then one more matrix, $$W_O$$, mixes them. The square brackets mean "side by side":

$$\text{MultiHead}(X) = [\,\text{head}_1 \cdots \text{head}_h\,]\, W_O$$

The paper uses 8 heads of 64 numbers each: $$8 \times 64 = 512 = d_{model}$$.

</div>

<div class="tf-step" data-step="cost" data-title="Attention is parallel, but costs n²." markdown="1">
**Was it worth it?** The paper compares attention with recurrent layers. Drag the slider to change the number of words.

Attention compares every pair of words, so its work grows like $$n^2$$. A recurrent layer does less work per word for long inputs, but it has to go **one word after another**: $$n$$ steps, each waiting for the last.

For sentences shorter than $$d$$ (512 in the paper), attention is both cheaper _and_ fully parallel. That speed is a big part of why Transformers took over. The $$n^2$$ cost for very long texts is why so much later research tries to make attention cheaper.

</div>

  </div>
</section>

## What we have so far

We now have the full **multi-head attention** sublayer of the paper:

1. Add positions: $$X \leftarrow X + PE$$.
2. For each head _h_: $$\text{head}_h = \text{Attention}(X W_Q^h,\; X W_K^h,\; X W_V^h)$$.
3. Join the heads and mix: $$\text{Concat}(\text{head}_1, \ldots, \text{head}_h)\, W_O$$.

Its output has the same shape as its input: one row of $$d_{model}$$ numbers per word.

One detail I glossed over: the paper also multiplies the embeddings by $$\sqrt{d_{model}}$$ before adding positions, so the two have similar sizes. In this toy the embeddings already have about the right size, so I left that out.

Attention lets words share information, but it doesn't do much _with_ that information on its own. In part 3 we wrap it in the rest of an encoder block: residual connections, layer normalisation and a small feed-forward network.

## Going deeper

### Why a shift is a rotation {#shift-is-rotation}

Take one sine/cosine pair with speed $$\omega$$. Write $$a = \omega p$$ for the angle at position $$p$$, and $$b = \omega k$$ for the extra angle after $$k$$ more steps. The angle-addition rules say:

$$\sin(a + b) = \sin a \cos b + \cos a \sin b$$

$$\cos(a + b) = \cos a \cos b - \sin a \sin b$$

In matrix form:

$$\begin{pmatrix} \sin(a+b) \\ \cos(a+b) \end{pmatrix} = \begin{pmatrix} \cos b & \sin b \\ -\sin b & \cos b \end{pmatrix} \begin{pmatrix} \sin a \\ \cos a \end{pmatrix}$$

The matrix in the middle is a rotation by the angle $$b = \omega k$$. It depends on $$k$$ but not on $$p$$. So "$$k$$ places later" is the same fixed matrix at every position. A weight matrix like $$W_Q$$ multiplies by fixed matrices, so in principle it can learn "the word just before me" once and have it work everywhere.

### Dot products only see distance

Here's another consequence. Take the dot product of two position rows, $$PE(p)$$ and $$PE(p+k)$$. Each sine/cosine pair contributes $$\sin a \sin b + \cos a \cos b = \cos(a - b)$$, so

$$PE(p) \cdot PE(p+k) = \sum_i \cos(\omega_i k)$$

This depends only on the distance $$k$$, not on where you are. In our toy ($$d = 8$$), positions 3 apart always have a dot product of 1.96, whether they are positions 0 and 3 or 40 and 43.

It's also the same for $$+k$$ and $$-k$$, since cosine doesn't care about sign. On their own, the dot products can't tell "3 words before" from "3 words after". The rotation above can, which is one reason the learned $$W_Q$$ and $$W_K$$ matter.

### Why 10000, and why so many speeds?

The speeds are $$\omega_i = 1 / 10000^{2i/d}$$, so the wavelengths grow geometrically from $$2\pi$$ (about 6 positions) to $$10000 \cdot 2\pi$$ (about 63,000 positions).

Think of the hands of a clock. The fast hand tells neighbouring positions apart, but it repeats every few steps. The slow hands barely move between neighbours, but they tell far-apart positions apart. Together, every position gets a unique pattern, and 10000 makes the slowest wave far longer than any sentence the model will see.

### Learned positions work too

The paper also tried simply _learning_ a vector for each position, like a second embedding table. The results were nearly identical (Table 3, row E). The authors kept the waves because they hoped the model could then handle sentences longer than any it saw in training.

Later models went both ways. BERT and GPT-2 learned their positions. Many of today's models use **RoPE** ([Su et al., 2021](https://arxiv.org/abs/2104.09864)), which takes the rotation above literally: it rotates each query and key by its position, so a score depends only on the distance between the two words.

### Many heads cost the same as one

Each head has its own $$W_Q$$, $$W_K$$ and $$W_V$$, each of size $$d \times (d/h)$$. Over $$h$$ heads that is $$3 \cdot h \cdot d \cdot (d/h) = 3d^2$$ weights, plus $$d^2$$ for $$W_O$$:

$$4d^2 \text{ weights, whatever } h \text{ is.}$$

So splitting into heads is free. The paper tested this (Table 3, row A). One big head scored 0.9 BLEU worse than 8 heads. Too many heads hurt as well: with 32 heads of size 16, quality dropped again. Each head needs enough numbers to ask a useful question.

## Further reading

- Vaswani et al., [_Attention Is All You Need_](https://arxiv.org/abs/1706.03762), sections 3.2.2 (multi-head), 3.5 (positions) and 4 (why self-attention).
- Amirhossein Kazemnejad, [_Transformer Architecture: The Positional Encoding_](https://kazemnejad.com/blog/transformer_architecture_positional_encoding/): a careful look at the rotation property.
- Jesse Vig, [_BertViz_](https://github.com/jessevig/bertviz): see what real attention heads learn.

{% include tf-series.liquid %}
