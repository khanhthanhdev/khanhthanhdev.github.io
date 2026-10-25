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
  - /assets/js/transformer/tf-figures.js
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

Its output has the same shape as its input: one row of $$d_{model}$$ numbers per word. The paper draws it as its Figure 2 (right). Drag the slider to change the number of heads, with the paper's $$d_{model} = 512$$:

<figure class="tf-figure" data-tf-figure="mha">
  <noscript><p class="tf-noscript">This figure needs JavaScript. It shows V, K and Q each going through h linear layers, h attention heads side by side, a Concat, and a final linear layer W_O.</p></noscript>
</figure>

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

### Why add the positions, and not append them?

Appending would give each word $$[x,\ p]$$: twice as many numbers. But the first thing the layer does is multiply by a matrix. Split that matrix into a top half $$W_a$$ (for the word) and a bottom half $$W_b$$ (for the position):

$$[x,\ p] \begin{pmatrix} W_a \\ W_b \end{pmatrix} = x W_a + p W_b$$

So appending and then multiplying is the same as adding a _transformed_ position. Adding the position directly is the special case $$W_b = W_a$$, and it saves the extra width. In 512 dimensions there is plenty of room for the model to keep word and position information in different directions, so little is lost.

### What a score sees once positions are added

With positions added, the score between word $$i$$ and word $$j$$ is $$(x_i + p_i)\, A\, (x_j + p_j)^\top$$, where $$A = W_Q W_K^\top$$ as in [part 1]({% post_url 2026-10-24-attention-1-self-attention %}#why-two-matrices-w_q-and-w_k). Multiply out the brackets:

$$\underbrace{x_i A x_j^\top}_{\text{word–word}} + \underbrace{x_i A p_j^\top}_{\text{word–position}} + \underbrace{p_i A x_j^\top}_{\text{position–word}} + \underbrace{p_i A p_j^\top}_{\text{position–position}}$$

Each term asks a different question. The first is the content match from part 1. The last depends only on the two positions: _"look one word back"_ lives here. The middle two mix the two: _"the word at the start of the sentence"_. One matrix $$A$$ has to serve all four. [Transformer-XL](https://arxiv.org/abs/1901.02860) took this expansion as its starting point, and gave the position terms their own weights, using only the distance $$i - j$$.

### Why 10000, and why so many speeds?

The speeds are $$\omega_i = 1 / 10000^{2i/d}$$, so the wavelengths grow geometrically from $$2\pi$$ (about 6 positions) to $$10000 \cdot 2\pi$$ (about 63,000 positions).

Think of the hands of a clock. The fast hand tells neighbouring positions apart, but it repeats every few steps. The slow hands barely move between neighbours, but they tell far-apart positions apart. Together, every position gets a unique pattern, and 10000 makes the slowest wave far longer than any sentence the model will see.

### Learned positions work too

The paper also tried simply _learning_ a vector for each position, like a second embedding table. The results were nearly identical (Table 3, row E). The authors kept the waves because they hoped the model could then handle sentences longer than any it saw in training.

Later models went both ways. BERT and GPT-2 learned their positions. Many of today's models use **RoPE** ([Su et al., 2021](https://arxiv.org/abs/2104.09864)), which takes the rotation above literally: it rotates each query and key by its position, so a score depends only on the distance between the two words.

### RoPE in one line

RoPE rotates the query of the word at position $$m$$ by $$R_m$$ (a rotation by $$m\omega$$, as above) and the key at position $$n$$ by $$R_n$$. Their score is

$$(q R_m)\cdot(k R_n) = q\, R_m R_n^\top\, k^\top = q\, R_{m-n}\, k^\top$$

using two facts about rotations: undoing a rotation is rotating backwards ($$R_n^\top = R_{-n}$$), and two rotations add their angles ($$R_m R_{-n} = R_{m-n}$$). Only the distance $$m - n$$ is left. Unlike the added waves, nothing about the absolute position survives in the score, and unlike plain dot products of positions, $$R_{m-n}$$ and $$R_{n-m}$$ differ, so before and after are told apart.

### Deriving RoPE from what we want {#rope-derivation}

The line above checks that rotation works. [Su et al. (2021, section 3.4)](https://arxiv.org/abs/2104.09864) go the other way: they start from the property we want and show that rotation is the answer. Here is that argument for one pair of numbers.

**Set up.** Treat a 2-number vector $$(a, b)$$ as the complex number $$a + ib$$, where $$i = \sqrt{-1}$$ (so in this section and the next, $$i$$ is never an index). Then the dot product of two such vectors is the real part of one times the conjugate of the other: $$(a, b) \cdot (c, d) = \text{Re}\big[(a + ib)(c - id)\big]$$. We look for a way $$f(q, m)$$ to mark a query $$q$$ with its position $$m$$ (and the same $$f$$ for keys), such that

$$f(q, m)\; \overline{f(k, n)} = g(q, k, m - n) \qquad \text{and} \qquad f(x, 0) = x$$

The first condition says the product, and so the score, depends on the positions only through their distance. The second says position 0 leaves a vector alone.

**Step 1: polar form.** Write each complex number as a length and an angle: $$f(q, m) = r(q, m)\, e^{i \Theta(q, m)}$$. Multiplying complex numbers multiplies lengths and adds angles (the conjugate flips the sign of an angle), so the condition splits in two:

$$r(q, m)\, r(k, n) = r_g(q, k, m - n), \qquad \Theta(q, m) - \Theta(k, n) = \Theta_g(q, k, m - n)$$

**Step 2: lengths don't move.** Set $$n = m$$, so the distance is 0. The right side no longer depends on $$m$$, so it equals its value at $$m = 0$$, where $$f(x, 0) = x$$:

$$r(q, m)\, r(k, m) = r(q, 0)\, r(k, 0) = \lVert q\rVert\, \lVert k\rVert$$

The simplest solution, and the one RoPE uses, is $$r(q, m) = \lVert q \rVert$$: marking a vector with its position never changes its length.

**Step 3: every vector turns by the same amount.** Do the same with the angles. Let $$\theta_q$$ and $$\theta_k$$ be the original angles of $$q$$ and $$k$$. With $$n = m$$,

$$\Theta(q, m) - \Theta(k, m) = \theta_q - \theta_k \quad\Rightarrow\quad \Theta(q, m) - \theta_q = \Theta(k, m) - \theta_k$$

The left side involves only $$q$$ and the right only $$k$$, and they are equal for every $$q$$ and $$k$$. So both are some function of the position alone. Call it $$\phi(m)$$: each vector is turned by $$\phi(m)$$ at position $$m$$, whatever it is.

**Step 4: the turn grows in equal steps.** Now set $$n = m - 1$$, a distance of 1. The angle condition becomes

$$\big(\theta_q + \phi(m)\big) - \big(\theta_k + \phi(m-1)\big) = \Theta_g(q, k, 1)$$

so $$\phi(m) - \phi(m-1) = \Theta_g(q, k, 1) - \theta_q + \theta_k$$, which does not depend on $$m$$. A function that goes up by the same amount $$\omega$$ at every step is a straight line, $$\phi(m) = m\omega + \phi(0)$$, and $$f(x, 0) = x$$ forces $$\phi(0) = 0$$.

**Result.** Putting the length and the angle back together:

$$f(q, m) = \lVert q \rVert\, e^{i(\theta_q + m\omega)} = q\, e^{i m \omega}$$

Multiplying by $$e^{im\omega}$$ is rotating by $$m\omega$$. So once we ask for "distance only" and "position 0 does nothing" (plus the simple choice of length in step 2), rotation is the only answer. With $$d$$ numbers, RoPE does this for each of the $$d/2$$ pairs, with speeds $$\omega_l = 10000^{-2l/d}$$, the same as the sinusoidal waves. The [EleutherAI write-up](https://blog.eleuther.ai/rotary-embeddings/) walks through the same steps with code.

### Do far-apart words matter less under RoPE?

Write the score as a sum over the $$d/2$$ pairs. With $$h_l = q_{[l]}\, \overline{k_{[l]}}$$ for pair $$l$$ (as complex numbers) and distance $$r = m - n$$:

$$\text{score} = \text{Re} \sum_{l=0}^{d/2 - 1} h_l\, e^{i r \omega_l}$$

Su et al. bound this with **Abel summation**, the sum version of integration by parts. Let $$S_0 = 0$$ and $$S_j = \sum_{l < j} e^{i r \omega_l}$$, so $$e^{i r \omega_l} = S_{l+1} - S_l$$, and set $$h_{d/2} = 0$$. Then, regrouping the terms,

$$\sum_l h_l (S_{l+1} - S_l) = -\sum_{j=1}^{d/2} S_j\, (h_j - h_{j-1}) \quad\Rightarrow\quad \lvert \text{score} \rvert \le \Big(\max_j \lvert h_j - h_{j-1} \rvert\Big) \sum_{j=1}^{d/2} \lvert S_j \rvert$$

The first factor depends only on $$q$$ and $$k$$. The second depends only on the distance $$r$$, so it is a ceiling on how much any pair of vectors can score at that distance. For $$d = 128$$, the average of $$\lvert S_j \rvert$$ comes out at:

{: .tf-table}
| distance $$r$$ | 0 | 10 | 100 | 1000 | 4000 |
| ----------------- | ---- | ---- | ---- | ---- | ---- |
| average $$\lvert S_j \rvert$$ | 32.5 | 18.0 | 10.2 | 4.5 | 5.0 |

The ceiling trends down as words get further apart, with some wiggles. Two caveats keep this honest. The decay is _computed_, not proved: the paper shows the same curve as a plot. And it is a bound for all possible $$q$$ and $$k$$, often far above the real score; a trained head can still look a thousand words back if its query and key line up.

### Why one head can't look at two places

Row $$i$$ of a head's weights is a set of positive numbers adding up to 1, so the output for word $$i$$ is a weighted average of the value rows:

$$o_i = \sum_j P_{ij}\, v_j, \qquad P_{ij} \ge 0, \quad \sum_j P_{ij} = 1$$

Suppose _sat_ needs both _cat_'s value and _mat_'s. The best one head can do is split its weight, say $$\lambda$$ and $$1 - \lambda$$, and return the blend $$\lambda v_{cat} + (1-\lambda) v_{mat}$$. Both are in there, but mixed into the same numbers, and the more it gets of one, the less it gets of the other.

Two heads don't have to share. Head 1 puts all its weight on _cat_, head 2 on _mat_, and the concatenation keeps the two values in separate columns. The next matrix, $$W_O$$, sees each one whole.

### Concat, then W_O, is a sum over heads

Cut $$W_O$$ into $$h$$ horizontal slices, one per head, each $$d_k \times d_{model}$$. Multiplying a row of blocks by a column of blocks works block by block, so

$$[\,\text{head}_1 \cdots \text{head}_h\,] \begin{pmatrix} W_O^{(1)} \\ \vdots \\ W_O^{(h)} \end{pmatrix} = \sum_{k=1}^{h} \text{head}_k\, W_O^{(k)}$$

So "concatenate and mix" is the same as letting every head write its own contribution, through its own matrix, and adding them up. Nothing in the layer makes heads talk to each other. That is what lets researchers study one head at a time ([Elhage et al., 2021](https://transformer-circuits.pub/2021/framework/index.html)).

### Where the paper's Table 1 comes from

The paper's case for attention (section 4) is a table comparing layer types, for $$n$$ words of $$d$$ numbers each. Each entry is a count you can do by hand:

{: .tf-table}
| layer | work per layer | steps that must wait | longest path between two words |
| ------------------------ | ------------------ | -------------------- | ------------------------------ |
| self-attention | $$O(n^2 d)$$ | $$O(1)$$ | $$O(1)$$ |
| recurrent | $$O(n d^2)$$ | $$O(n)$$ | $$O(n)$$ |
| convolution, width $$k$$ | $$O(k\, n\, d^2)$$ | $$O(1)$$ | $$O(\log_k n)$$ |

- **Self-attention.** $$QK^\top$$ is $$n^2$$ dot products of length $$d$$. All of them are independent, so nothing waits. Every word reads every word directly, so any two are one step apart.
- **Recurrent.** Each step computes $$h_t = f(h_{t-1} W + x_t U)$$: a $$d \times d$$ matrix times a vector, $$d^2$$ work, done $$n$$ times. Step $$t$$ needs step $$t-1$$, so there are $$n$$ waits. Information from word 1 reaches word $$n$$ after $$n$$ steps.
- **Convolution.** Each output reads $$k$$ neighbours through a $$d \times d$$ matrix each: $$k d^2$$ per word. One layer only reaches $$k$$ words, so joining two far-apart words takes a stack: $$O(n/k)$$ layers, or $$O(\log_k n)$$ with dilated convolutions.

Compare the first two: attention is cheaper exactly when $$n^2 d < n d^2$$, that is when $$n < d$$. With $$d = 512$$, that held for most sentences in 2017. The last column is the deeper argument. A short path means a gradient from one word reaches another in one hop, which the paper argues makes long-range patterns easier to learn.

### Many heads cost the same as one {#many-heads-cost-the-same}

Each head has its own $$W_Q$$, $$W_K$$ and $$W_V$$, each of size $$d \times (d/h)$$. Over $$h$$ heads that is $$3 \cdot h \cdot d \cdot (d/h) = 3d^2$$ weights, plus $$d^2$$ for $$W_O$$:

$$4d^2 \text{ weights, whatever } h \text{ is.}$$

So splitting into heads is free. The paper tested this (Table 3, row A). One big head scored 0.9 BLEU worse than 8 heads. Too many heads hurt as well: with 32 heads of size 16, quality dropped again. Each head needs enough numbers to ask a useful question.

Part 1's [rank argument]({% post_url 2026-10-24-attention-1-self-attention %}#low-rank-bottleneck) says why. A head of size $$d_k = d/h$$ can only make every possible pattern over $$n$$ words if $$d_k \ge n$$, that is $$h \le d/n$$. [Bhojanapalli et al. (2020)](https://arxiv.org/abs/2002.07028) checked this in BERT-large ($$d = 1024$$, sequences of $$n = 128$$, so the limit is $$h = 8$$), keeping the weight count fixed at 336 million:

{: .tf-table}
| heads | head size $$d_k$$ | SQuAD F1 | MNLI accuracy |
| ----- | ----------------- | -------- | ------------- |
| 8 | 128 | 90.89 | 85.0 |
| 16 | 64 | 90.61 | 84.5 |
| 32 | 32 | 90.45 | 84.4 |

Past 8 heads, each head drops below $$n$$ and scores slip. The drop is small, but it goes one way. Their fix is to stop tying the head size to $$d/h$$: pick $$d_k$$ by itself, at least as big as $$n$$. "Free" is true for the weight count, not for what each head can express.

## Further reading

- Vaswani et al., [_Attention Is All You Need_](https://arxiv.org/abs/1706.03762), sections 3.2.2 (multi-head), 3.5 (positions) and 4 (why self-attention).
- Amirhossein Kazemnejad, [_Transformer Architecture: The Positional Encoding_](https://kazemnejad.com/blog/transformer_architecture_positional_encoding/): a careful look at the rotation property.
- Jesse Vig, [_BertViz_](https://github.com/jessevig/bertviz): see what real attention heads learn.
- Su et al., [_RoFormer: Enhanced Transformer with Rotary Position Embedding_](https://arxiv.org/abs/2104.09864) (2021): section 3.4 has the [derivation](#rope-derivation) and the decay bound.
- Biderman et al., [_Rotary Embeddings: A Relative Revolution_](https://blog.eleuther.ai/rotary-embeddings/) (EleutherAI, 2021): RoPE derived with complex numbers, plus experiments.
- Lilian Weng, [_The Transformer Family Version 2.0_](https://lilianweng.github.io/posts/2023-01-27-the-transformer-family-v2/) (2023): a survey of position encodings and attention variants.

{% include tf-series.liquid %}
