---
layout: post
title: "attention is all you need, part 3: one encoder block"
date: 2026-10-24 02:00:00
description: residual connections, layer normalisation and the feed-forward network, the parts that turn one attention layer into a Transformer encoder block
tags: ai llm transformer interactive
categories: explainer
series: attention-is-all-you-need
part: 3
math: true
toc:
  beginning: true
css:
  - /assets/css/screen-works.css
  - /assets/css/transformer.css
js:
  - /assets/js/transformer/tf-math.js
  - /assets/js/transformer/tf-view.js
  - /assets/js/transformer/part3.js
  - /assets/js/transformer/tf-scrolly.js
---

{% include tf-series.liquid %}

[Part 2]({% post_url 2026-10-24-attention-2-multi-head-and-positions %}) finished the multi-head attention sublayer. On its own it lets words share information, but a Transformer needs a few more parts around it to train well and to do something _with_ that information.

Those parts make up one **encoder block**, the left half of the paper's Figure 1. There are three new ideas, all small:

1. **Residual connections**: add a sublayer's input back to its output.
2. **Layer normalisation**: rescale each word's numbers to mean 0 and variance 1.
3. A **feed-forward network**: two matrix multiplies with a ReLU between them, applied to each word on its own.

Same toy model as before, now with positions added. Edit the sentence and every matrix below recomputes.

## Inside the block, step by step

<section class="tf-scrolly" data-tf-scene="part3" data-sentence="the cat sat on the mat">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="block" data-title="One block, four boxes." markdown="1">
**Here is the whole block.** Read it from the bottom up, the way the data flows.

At the bottom, each word is looked up in the embedding table and its positional encoding is added (the ⊕), giving $$X + PE$$ from part 2. That happens once, outside the frame. The block itself starts where the line forks into three: the same input becomes the queries, keys and values of multi-head attention. Then comes **Add & Norm**, then a feed-forward network, then Add & Norm again.

The numbers under each box are the toy's sizes, and the shape on the arrows ($$n \times 8$$) is the same in and out.

The lines running up the right side skip around each sublayer. They are the residual connections. The dashed frame with "× N" means the paper stacks N = 6 of these blocks.

</div>

<div class="tf-step" data-step="residual" data-title="Add the input back." markdown="1">
**The first "Add".** Take the block's input _X_ and the output of attention, and add them, number by number:

$$X + \text{MultiHead}(X)$$

This is a **residual connection** (from [ResNet](https://arxiv.org/abs/1512.03385), 2015). Attention doesn't have to rebuild each word's vector from scratch. It only has to learn a _change_ to add on top.

That makes deep stacks much easier to train ([here's why](#why-residuals)). If a block has nothing useful to add, it can learn to add almost nothing, and the word passes through unharmed.

</div>

<div class="tf-step" data-step="norm" data-title="Normalise each word's row." markdown="1">
**Then "Norm".** For each word separately, compute the mean and variance of its 8 numbers. Subtract the mean and divide by the square root of the variance:

$$\text{LayerNorm}(x) = \gamma \cdot \frac{x - \mu}{\sqrt{\sigma^2 + \epsilon}} + \beta$$

The number line underneath shows one row before and after. The dots keep their order and their relative spacing; they are just shifted and squeezed so the mean sits at 0 and the spread is 1. Hover or tap a word to see its row.

Without this, numbers can drift bigger and bigger as they pass through the layers. $$\gamma$$ and $$\beta$$ are learned per column, so the model can undo the squeeze where it helps. Ours start at 1 and 0.

</div>

<div class="tf-step" data-step="ffn1" data-title="Feed-forward: grow, then cut." markdown="1">
**The second sublayer is a tiny neural network.** First, multiply each word's 8 numbers by $$W_1$$, an 8 × 16 matrix. Every word grows to 16 numbers.

Then apply **ReLU**, which keeps positive numbers and turns negative ones into 0. Watch the hidden matrix: at the end of the step every blue (negative) cell turns grey: it is now 0.

This is the only non-linear step in the block apart from softmax. Without it, two matrix multiplies in a row would collapse into one.

</div>

<div class="tf-step" data-step="ffn2" data-title="…then shrink back." markdown="1">
**Then multiply by $$W_2$$**, a 16 × 8 matrix, to get back to 8 numbers per word. Together that is the paper's equation (2):

$$\text{FFN}(x) = \max(0,\, x W_1 + b_1)\, W_2 + b_2$$

Notice what this step _doesn't_ do: it never mixes rows. Every word goes through the same two matrices on its own. The paper calls it **position-wise**. Attention moves information between words; the feed-forward network works on what each word has gathered.

In the paper the hidden layer has 2048 numbers per word, against 512 for the model. That makes the feed-forward network about two thirds of each block's weights.

</div>

<div class="tf-step" data-step="addnorm2" data-title="Add & Norm, again." markdown="1">
**The same trick a second time.** Add the feed-forward network's input to its output, then apply LayerNorm:

$$\text{LayerNorm}(x + \text{FFN}(x))$$

The result is the block's output. It has exactly the same shape as the input: one row of 8 numbers per word.

</div>

<div class="tf-step" data-step="stack" data-title="Blocks stack like bricks." markdown="1">
**Same shape in, same shape out.** That means the output of one block can be fed straight into the next.

Each block has its own weights, so each one can refine the vectors a bit more. Our toy uses 2 blocks; the paper uses **N = 6**, and large modern models use 100 or more.

The output of the last block is the encoder's final answer: one vector per word, each one shaped by the whole sentence. In part 4 the decoder reads it.

</div>

  </div>
</section>

## The whole block in two lines

Writing $$x$$ for the input of a block, the paper's encoder layer is:

$$h = \text{LayerNorm}(x + \text{MultiHead}(x))$$

$$\text{out} = \text{LayerNorm}(h + \text{FFN}(h))$$

All sublayers, and the embeddings too, produce $$d_{model} = 512$$ numbers per word in the paper (8 in our toy), precisely so these additions line up.

Two details from the paper I left out of the figure. Dropout is applied to each sublayer's output before the add, with rate 0.1 in training. And the order shown here, add first and then normalise ("post-norm"), is the original. Most models today normalise first, $$x + \text{Sublayer}(\text{LayerNorm}(x))$$ ("pre-norm"), because it trains more stably in deep stacks.

## Going deeper

### Why residual connections help learning {#why-residuals}

Training works backwards. The loss sends a gradient back through every layer, and each layer multiplies it by its own derivative. With a residual connection, a sublayer computes $$y = x + F(x)$$, so its derivative is

$$\frac{\partial y}{\partial x} = I + \frac{\partial F}{\partial x}$$

The $$I$$ (the identity) is the important part. Going back through $$N$$ blocks multiplies $$N$$ of these together. Multiply out the brackets and one of the terms is just $$I \cdot I \cdots I$$: a path where the gradient reaches the first block untouched, however deep the stack.

Write it out for three blocks, with $$J_l = \partial F_l / \partial x$$:

$$(I + J_3)(I + J_2)(I + J_1) = I + (J_1 + J_2 + J_3) + (J_2 J_1 + J_3 J_1 + J_3 J_2) + J_3 J_2 J_1$$

There is one term for every subset of blocks: $$2^N$$ paths in all, of every length from 0 to $$N$$. Most of them are short, and the shortest is the identity.

Without the skip, the gradient is a product of $$N$$ derivatives $$\partial F / \partial x$$: only the last, longest term. Products of many factors tend to shrink towards zero or blow up, which is why very deep networks were so hard to train before [ResNet](https://arxiv.org/abs/1512.03385). [Veit et al. (2016)](https://arxiv.org/abs/1605.06431) give another way to see it: a residual network behaves like many shallow networks of different depths, added together.

### Post-norm and pre-norm, unrolled

The algebra above assumes the add is the last thing a block does. In the paper's post-norm block it isn't: $$x_{l+1} = \text{LN}(x_l + F_l(x_l))$$. Every path back to the input now passes through all $$N$$ LayerNorms, and each one rescales the gradient by its own $$1/\sigma$$ (see [below](#layernorm-gradient)). There is no clean identity path any more.

Pre-norm moves the norm inside the branch: $$x_{l+1} = x_l + F_l(\text{LN}(x_l))$$. Unroll it and the input survives untouched to the top:

$$x_N = x_0 + \sum_{l=0}^{N-1} F_l\big(\text{LN}(x_l)\big)$$

Each block only adds to a running sum, often called the **residual stream**, and the gradient with respect to $$x_0$$ always contains a plain $$I$$. That is why deep pre-norm stacks train more easily, and why [Xiong et al. (2020)](https://arxiv.org/abs/2002.04745) found they don't need the learning-rate warmup of [part 4]({% post_url 2026-10-24-attention-4-decoder-and-training %}#why-warm-up). The cost: since nothing rescales the sum, it grows as blocks pile on, so pre-norm models add one last LayerNorm before the output layer.

### Attention alone collapses: why the skips are not optional {#rank-collapse}

Residuals do more than help gradients. Without them, a stack of attention layers destroys its own input. [Dong, Cordonnier and Loukas (2021)](https://arxiv.org/abs/2103.03404) proved this; here is the core of the argument, then their result.

Take attention with no skip and no feed-forward network: $$X_{l+1} = P_l\, X_l\, W_V$$, where each row of $$P_l$$ is positive and adds up to 1. Pick one column $$v$$ of $$X$$ (one feature, across all $$n$$ words) and measure how spread out it is by its **range**, $$\max_i v_i - \min_i v_i$$.

**Claim.** If every entry of $$P$$ is at least $$\varepsilon$$, then $$\text{range}(Pv) \le (1 - n\varepsilon)\, \text{range}(v)$$.

**Proof.** Compare two rows $$i$$ and $$j$$ of the output:

$$(Pv)_i - (Pv)_j = \sum_k a_k\, v_k, \qquad a_k = P_{ik} - P_{jk}$$

Both rows add up to 1, so $$\sum_k a_k = 0$$: the positive $$a_k$$ add up to some $$s$$ and the negative ones to $$-s$$. The sum is largest when all the positive weight sits on the biggest $$v_k$$ and all the negative weight on the smallest, so

$$\sum_k a_k v_k \le s \max_k v_k - s \min_k v_k = s \cdot \text{range}(v)$$

And $$s$$ is small. Each positive part is $$P_{ik} - \min(P_{ik}, P_{jk})$$, so

$$s = \sum_k P_{ik} - \sum_k \min(P_{ik}, P_{jk}) = 1 - \sum_k \min(P_{ik}, P_{jk}) \le 1 - n\varepsilon$$

since each of the $$n$$ minimums is at least $$\varepsilon$$. This holds for every pair $$i, j$$, which proves the claim. $$\blacksquare$$

So each attention layer pulls every feature closer to "the same for all words". Repeat it and the rows of $$X$$ converge to one shared row: $$X \to \mathbf{1} x^\top$$, a matrix of rank 1, where every word holds the same vector. Softmax makes every weight strictly positive, so this always happens to some degree. The claim ignores $$W_V$$, which mixes features and can stretch them back out. Dong et al. handle $$W_V$$ and multiple heads too: measuring the distance from rank 1 by $$\text{res}(X) = X - \mathbf{1}x^\top$$ (for the best $$x$$), they show it shrinks **doubly exponentially** with depth, with an exponent like $$3^L$$. That is an upper bound, for a stack where the residual is already small; it says collapse _can_ be very fast, not that it always is.

**What saves real Transformers.**

- **Skips.** With $$X_{l+1} = X_l + P_l X_l W_V$$, the same unrolling as in [the residual section](#why-residuals) gives one path per subset of layers: $$\binom{L}{k} H^k$$ paths through $$k$$ of $$L$$ layers with $$H$$ heads, which is $$2^L$$ for one head. The path through no attention at all is $$X_0$$ itself, which never collapses. The paper shows that _some_ settings of the weights then avoid collapse (the trivial one is $$W_V = 0$$); it is a guarantee that escape is possible, not that training finds it.
- **Feed-forward networks.** They can pull rows apart again. The paper bounds how much by the network's Lipschitz constant (how much it can stretch distances): the bigger it is, the slower the collapse.
- **Not LayerNorm.** LayerNorm treats every row the same way, on its own. If all rows are already equal, they come out equal. It can't split words that attention has merged.

### What LayerNorm ignores

Ignoring the tiny $$\epsilon$$, LayerNorm doesn't change if you scale a row by any $$a > 0$$ or shift all its numbers by the same $$c$$. The mean of $$a x + c$$ is $$a\mu + c$$ and its standard deviation is $$a\sigma$$, so

$$\frac{(a x + c) - (a\mu + c)}{a \sigma} = \frac{x - \mu}{\sigma}$$

Before $$\gamma$$ and $$\beta$$, every output row $$z$$ also has a fixed shape: its numbers add up to 0 (mean 0) and their squares add up to $$d$$ (variance 1). So every row sits on the same sphere, of radius $$\sqrt{d}$$. Whatever a sublayer does to the size of a word's vector, the next one sees a vector of the same length.

### The LayerNorm gradient {#layernorm-gradient}

For one row $$x$$ of $$d$$ numbers with $$z = (x - \mu)/\sigma$$, the derivative of the output with respect to the input is

$$\frac{\partial z}{\partial x} = \frac{1}{\sigma}\left(I - \tfrac{1}{d}\,\mathbf{1}\mathbf{1}^\top - \tfrac{1}{d}\, z z^\top\right)$$

where $$\mathbf{1}$$ is a row of ones. To see it, differentiate the two statistics: $$\partial \mu / \partial x_j = 1/d$$ and $$\partial \sigma / \partial x_j = z_j / d$$. Then the quotient rule on $$z_i = (x_i - \mu)/\sigma$$ gives

$$\frac{\partial z_i}{\partial x_j} = \frac{\delta_{ij} - 1/d}{\sigma} - \frac{(x_i - \mu)}{\sigma^2}\cdot\frac{z_j}{d} = \frac{1}{\sigma}\left(\delta_{ij} - \frac{1}{d} - \frac{z_i z_j}{d}\right)$$

Read the bracket as an instruction: take the incoming gradient and remove the part along $$\mathbf{1}$$ (shifting every number at once) and the part along $$z$$ (scaling the row), since LayerNorm ignores both. Then divide by $$\sigma$$. A row with a big spread gets a small gradient, which is the $$1/\sigma$$ that post-norm stacks multiply together.

### Why LayerNorm and not BatchNorm?

**BatchNorm**, common in image models, normalises each feature across all the examples in a batch. **LayerNorm** normalises each word across its own features. For text, LayerNorm is the better fit:

- Sentences in a batch have different lengths and are padded. Batch statistics would mix in padding and depend on which other sentences happen to share the batch.
- When generating, there is often only one sentence, so there is no batch to average over.
- LayerNorm treats every word on its own, so it computes exactly the same thing in training and in use.

### Why not RMSNorm?

Many recent models (Llama among them) use **RMSNorm** ([Zhang & Sennrich, 2019](https://arxiv.org/abs/1910.07467)), which skips the mean:

$$\text{RMSNorm}(x) = \gamma \cdot \frac{x}{\sqrt{\tfrac{1}{d}\sum_i x_i^2 + \epsilon}}$$

It keeps the scale invariance above and drops the shift invariance. The authors' argument is that the rescaling is what does the work, and they found it matched LayerNorm's quality while running faster, since there is one statistic to compute instead of two. The paper's choice simply predates it.

### Where the weights live

Count the weights in one block of the paper's base model ($$d = 512$$, $$d_{ff} = 2048$$, ignoring the small biases and LayerNorm parameters):

- attention: $$W_Q, W_K, W_V, W_O$$ are 4 matrices of $$d \times d$$, so $$4d^2 \approx 1.05$$ million.
- feed-forward: $$W_1$$ is $$d \times 4d$$ and $$W_2$$ is $$4d \times d$$, so $$8d^2 \approx 2.1$$ million.

The feed-forward network holds two thirds of each block's weights, and does most of its arithmetic too.

### Why the ReLU is needed

Remove it and the network is two matrix multiplies in a row. Matrix products can be regrouped:

$$(x W_1) W_2 = x\, (W_1 W_2)$$

So the pair is just one $$d \times d$$ matrix, $$W_1 W_2$$, and the 2048 hidden numbers bought nothing. ReLU breaks the regrouping: $$\max(0, xW_1)\, W_2$$ can't be written as $$x$$ times anything fixed, because which hidden units are switched on depends on $$x$$.

Why widen to $$4d$$ in the middle? A network with one hidden layer can approximate any reasonable function given enough hidden units, and each unit is one more pattern it can detect ([see below](#what-does-the-feed-forward-network-do)). The width is a budget. The paper doesn't explain the factor 4; most later models kept it, or something close.

### Why ReLU, and not GELU or SwiGLU?

ReLU was the standard choice in 2017. Two smoother options came after:

- **GELU** ([Hendrycks & Gimpel, 2016](https://arxiv.org/abs/1606.08415)), used by BERT and GPT-2, is $$x \cdot \Phi(x)$$, where $$\Phi$$ is the standard normal's cumulative probability. It bends smoothly near 0 instead of having a corner, and lets small negative numbers through.
- **SwiGLU** ([Shazeer, 2020](https://arxiv.org/abs/2002.05202)), used by Llama and many others, adds a **gate**: a second matrix $$W_3$$ whose output multiplies the hidden layer entry by entry,

$$\text{FFN}(x) = \big(\text{Swish}(x W_1) \odot x W_3\big)\, W_2$$

The gate lets one projection decide _how much_ of the other gets through. Three matrices instead of two would cost more weights, so the hidden size is cut from $$4d$$ to about $$\tfrac{2}{3} \cdot 4d$$ to keep the total the same. Shazeer found the gated versions trained to a lower loss than ReLU at equal cost, and offered no deeper reason: _"we attribute their success, as all else, to divine benevolence"_.

### What does the feed-forward network do?

Read equation (2) one hidden unit at a time. Each of the 2048 hidden units has a column of $$W_1$$, which works like a **key**: its dot product with the word's vector says how well the word matches some pattern. ReLU keeps only positive matches. The matching row of $$W_2$$ is a **value**, added to the output in proportion to the match.

So the network is a big, fixed lookup: _"if the word looks like this, add that"_. [Geva et al. (2021)](https://arxiv.org/abs/2012.14913) found exactly this in trained models. In lower layers, keys tend to fire on surface patterns, such as text ending in a particular word; in higher layers, on topics. In the higher layers, the values push towards likely next words. It looks like attention, except the keys and values are learned once, rather than coming from the sentence.

## Further reading

- Vaswani et al., [_Attention Is All You Need_](https://arxiv.org/abs/1706.03762), sections 3.1 (encoder stack) and 3.3 (feed-forward networks).
- Ba, Kiros and Hinton, [_Layer Normalization_](https://arxiv.org/abs/1607.06450) (2016).
- He et al., [_Deep Residual Learning for Image Recognition_](https://arxiv.org/abs/1512.03385) (2015): where residual connections come from.
- Xiong et al., [_On Layer Normalization in the Transformer Architecture_](https://arxiv.org/abs/2002.04745) (2020): post-norm vs. pre-norm.
- Dong, Cordonnier and Loukas, [_Attention is Not All You Need: Pure Attention Loses Rank Doubly Exponentially with Depth_](https://arxiv.org/abs/2103.03404) (2021): the [rank-collapse](#rank-collapse) result and why skips stop it.

{% include tf-series.liquid %}
