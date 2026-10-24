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

The input is $$X + PE$$ from part 2. It goes through multi-head attention, then **Add & Norm**, then a feed-forward network, then Add & Norm again.

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

Without the skip, the gradient is a product of $$N$$ derivatives $$\partial F / \partial x$$. Products of many factors tend to shrink towards zero or blow up, which is why very deep networks were so hard to train before [ResNet](https://arxiv.org/abs/1512.03385). [Veit et al. (2016)](https://arxiv.org/abs/1605.06431) give another way to see it: a residual network behaves like many shallow networks of different depths, added together.

### Why LayerNorm and not BatchNorm?

**BatchNorm**, common in image models, normalises each feature across all the examples in a batch. **LayerNorm** normalises each word across its own features. For text, LayerNorm is the better fit:

- Sentences in a batch have different lengths and are padded. Batch statistics would mix in padding and depend on which other sentences happen to share the batch.
- When generating, there is often only one sentence, so there is no batch to average over.
- LayerNorm treats every word on its own, so it computes exactly the same thing in training and in use.

### Where the weights live

Count the weights in one block of the paper's base model ($$d = 512$$, $$d_{ff} = 2048$$, ignoring the small biases and LayerNorm parameters):

- attention: $$W_Q, W_K, W_V, W_O$$ are 4 matrices of $$d \times d$$, so $$4d^2 \approx 1.05$$ million.
- feed-forward: $$W_1$$ is $$d \times 4d$$ and $$W_2$$ is $$4d \times d$$, so $$8d^2 \approx 2.1$$ million.

The feed-forward network holds two thirds of each block's weights, and does most of its arithmetic too.

### What does the feed-forward network do?

Read equation (2) one hidden unit at a time. Each of the 2048 hidden units has a column of $$W_1$$, which works like a **key**: its dot product with the word's vector says how well the word matches some pattern. ReLU keeps only positive matches. The matching row of $$W_2$$ is a **value**, added to the output in proportion to the match.

So the network is a big, fixed lookup: _"if the word looks like this, add that"_. [Geva et al. (2021)](https://arxiv.org/abs/2012.14913) found exactly this in trained models. In lower layers, keys tend to fire on surface patterns, such as text ending in a particular word; in higher layers, on topics. In the higher layers, the values push towards likely next words. It looks like attention, except the keys and values are learned once, rather than coming from the sentence.

## Further reading

- Vaswani et al., [_Attention Is All You Need_](https://arxiv.org/abs/1706.03762), sections 3.1 (encoder stack) and 3.3 (feed-forward networks).
- Ba, Kiros and Hinton, [_Layer Normalization_](https://arxiv.org/abs/1607.06450) (2016).
- He et al., [_Deep Residual Learning for Image Recognition_](https://arxiv.org/abs/1512.03385) (2015): where residual connections come from.
- Xiong et al., [_On Layer Normalization in the Transformer Architecture_](https://arxiv.org/abs/2002.04745) (2020): post-norm vs. pre-norm.

{% include tf-series.liquid %}
