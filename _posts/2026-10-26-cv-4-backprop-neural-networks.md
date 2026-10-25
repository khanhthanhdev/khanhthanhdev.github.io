---
layout: post
title: "deep learning for computer vision, part 4: backpropagation and neural networks"
date: 2026-10-26 00:00:00 +0700
description: a scroll-through look at backpropagation on small computational graphs, then a two-layer network trained in your browser on a spiral that no linear classifier can split
tags: ai computer-vision deep-learning interactive
categories: explainer
series: deep-learning-for-computer-vision
part: 4
math: true
toc:
  beginning: true
css:
  - /assets/css/screen-works.css
  - /assets/css/transformer.css
  - /assets/css/clustering.css
  - /assets/css/cv.css
js:
  - /assets/js/clustering/cl-core.js
  - /assets/js/cv/cv-core.js
  - /assets/js/transformer/tf-view.js
  - /assets/js/clustering/cl-view.js
  - /assets/js/cv/cv-view.js
  - /assets/js/cv/cv-scrolly.js
  - /assets/js/cv/part4.js
---

{% include cv-series.liquid %}

[Part 3]({% post_url 2026-10-26-cv-3-optimisation %}) trained weights by repeating one loop: compute the loss, compute its gradient, step downhill. For two weights, and for a linear classifier, we could write the gradient's formula by hand.

A neural network has millions of weights, stacked in layers. Writing its gradient by hand is hopeless. **Backpropagation** computes all of it mechanically, from local rules that each fit on one line, at roughly the cost of computing the loss once. This part follows CS231n's notes on [backpropagation](https://cs231n.github.io/optimization-2/) and [neural networks](https://cs231n.github.io/neural-networks-1/), and ends by training a network in your browser.

## Gradients, one gate at a time

<section class="tf-scrolly" data-cv-scene="part4">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="graph" data-title="Write the function as a graph." markdown="1">
**Any formula can be broken into tiny operations.** Take $$f(x, y, z) = (x + y)\,z$$. Name the middle result $$q = x + y$$, so $$f = q\,z$$.

Each circle is a **gate**: it takes its inputs and computes one simple thing. The **forward pass** runs left to right and writes each result, in green, on the edge leaving the gate.

With $$x = -2$$, $$y = 5$$ and $$z = -4$$: $$q = 3$$ and $$f = -12$$.

</div>

<div class="tf-step" data-step="backward" data-title="Then walk it backwards." markdown="1">
**We want $$\partial f/\partial x$$, $$\partial f/\partial y$$ and $$\partial f/\partial z$$**: how much $$f$$ changes when each input is nudged.

The **backward pass** runs right to left and writes each gradient in red, under the edge:

1. At the output, $$\partial f/\partial f = 1$$.
2. The multiply gate $$f = qz$$ knows its own derivatives: $$\partial f/\partial q = z = -4$$ and $$\partial f/\partial z = q = 3$$.
3. The add gate $$q = x + y$$ has derivative 1 for both inputs. So $$\partial f/\partial x = \partial f/\partial y = 1 \times (-4) = -4$$.

Read it as: raising $$x$$ by a little $$h$$ lowers $$f$$ by about $$4h$$.

</div>

<div class="tf-step" data-step="chain" data-title="The chain rule, done locally." markdown="1">
**Step 3 was the chain rule:** $$\frac{\partial f}{\partial x} = \frac{\partial f}{\partial q}\cdot\frac{\partial q}{\partial x}$$.

What makes backpropagation work is that **no gate needs to see the whole graph**. During the backward pass each gate receives one number from above, the gradient of the final output with respect to its own output (the **upstream gradient**). It multiplies that by its own **local gradient**, which it can work out from its inputs alone, and passes the result down to each input:

$$\text{downstream} = \text{local} \times \text{upstream}$$

Where an input feeds several gates, the gradients arriving back from them **add up**.

</div>

<div class="tf-step" data-step="neuron" data-title="A neuron, gate by gate." markdown="1">
**A bigger example: a single neuron with a sigmoid.**

$$f(w, x) = \frac{1}{1 + e^{-(w_0 x_0 + w_1 x_1 + w_2)}}$$

Cut into the smallest pieces: two multiplies, two adds, then $$\times -1$$, $$\exp$$, $$+1$$ and $$1/x$$. With $$w = (2, -3, -3)$$ and $$x = (-1, -2)$$, the forward pass gives a weighted sum of 1, and $$f = 0.731$$.

Keep scrolling to watch the backward pass. Each gate uses only its local rule: $$1/x$$ has derivative $$-1/x^2$$, $$\exp$$ has derivative $$e^x$$, and so on. At the end, $$\partial f/\partial w = (-0.197, -0.393, 0.197)$$ and $$\partial f/\partial x = (0.393, -0.590)$$.

Notice the gradient arriving at the weighted sum, 0.197. That's $$\sigma(1)\,(1 - \sigma(1)) = 0.731 \times 0.269$$: the last four gates together are the sigmoid, and its derivative is $$\sigma(1-\sigma)$$. In practice the whole sigmoid is one gate with that rule. **How finely to cut the graph is up to you**, as long as each gate knows its local gradient.

</div>

<div class="tf-step" data-step="patterns" data-title="Three gates, three habits." markdown="1">
**The gradient flowing backwards follows simple patterns.** Take $$f = 2\,(xy + \max(z, w))$$ with $$x = 3$$, $$y = -4$$, $$z = 2$$ and $$w = -1$$. The gradient arriving at the add gate is 2.

- The **add gate distributes**: it passes the gradient unchanged to every input. Both branches get 2.
- The **max gate routes**: the whole gradient goes to whichever input was larger, $$z$$; the other, $$w$$, gets 0. Nudging $$w$$ a little wouldn't change the max at all.
- The **multiply gate swaps**: each input gets the _other_ input's value times the gradient. $$x$$ gets $$-4 \times 2 = -8$$, $$y$$ gets $$3 \times 2 = 6$$.

The swap has a practical side. If one input is very large, the other input's gradient is very large too. That's one reason inputs are normalised before training.

</div>

<div class="tf-step" data-step="network" data-title="Now stack two layers." markdown="1">
**Back to [part 2]({% post_url 2026-10-26-cv-2-linear-classifiers %})'s spiral**: three arms of 60 points. A linear classifier draws straight borders and gets 52% right.

A **two-layer neural network** puts one more step in the middle:

$$s = W_2 \max(0,\; W_1 x + b_1) + b_2$$

$$W_1$$ maps the 2 inputs to 40 **hidden units**. The $$\max(0, \cdot)$$, called **ReLU**, sets every negative hidden value to 0. Then $$W_2$$ maps the hidden units to 3 class scores, exactly like part 2's classifier.

Without the ReLU the two matrices would multiply into one, $$W_2 W_1$$, and the network would still be linear. **The non-linearity is what buys the extra power.** Here it gets 98.9% of the points right.

</div>

<div class="tf-step" data-step="training" data-title="Training is the same loop." markdown="1">
**Nothing about training is new.** Softmax loss from part 2, plus L2 regularisation. Gradients from backpropagation: the network is just a graph of multiplies, adds and maxes. Updates from part 3's Adam, with learning rate 0.02.

Keep scrolling to train it. The weights start random, at 26% (about chance for three classes). By step 50 the network gets 80% right; by step 100, 96%. The loss falls from 1.45 to 0.26 over 600 steps.

The whole run takes a fraction of a second in your browser.

</div>

<div class="tf-step" data-step="width" data-title="How many hidden units?" markdown="1">
**More hidden units, more complicated borders.** Pick a width below the chart.

With 2 hidden units the network gets 49% right, no better than the linear classifier. With 5 it jumps to 96%; 10 gives 98% and 40 gives 99%.

More units means more capacity, which also means more room to overfit. CS231n's advice is not to shrink the network to avoid overfitting, but to use a big enough network and control it with regularisation (part 2's $$\lambda$$), because big networks are easier to train well.

</div>

<div class="tf-step" data-step="units" data-title="What each hidden unit does." markdown="1">
**Each hidden unit is a linear classifier of its own.** Unit $$k$$ computes $$\max(0, w_k \cdot x + b_k)$$: zero on one side of the line $$w_k \cdot x + b_k = 0$$, and growing with distance on the other.

The lines here are the 5 units of the 5-unit network. Every border in the tinted map is built from pieces of them: the output layer adds up these bent ramps, with its own weights, to make each class's score.

That's the network's whole trick. **Layers of simple bent pieces, combined, can approximate almost any shape.**

</div>

  </div>
</section>

## The whole thing in one line

Backpropagation is the chain rule, applied in the right order:

1. **Forward**: compute every gate's output, left to right, and keep them.
2. **Backward**: start from $$\partial L/\partial L = 1$$ and, right to left, give each gate's inputs $$\text{local gradient} \times \text{upstream gradient}$$, adding where paths meet.

Each step costs about as much as the forward pass, whatever the number of weights. That's why the loop from part 3 still works with millions of them.

{: .tf-table}
| gate | forward | backward (upstream $$g$$) |
| -------- | ------------- | ----------------------------------------- |
| add | $$a + b$$ | $$g$$ to both |
| multiply | $$a \cdot b$$ | $$b\,g$$ to $$a$$, $$a\,g$$ to $$b$$ |
| max | $$\max(a, b)$$ | $$g$$ to the larger, 0 to the other |
| ReLU | $$\max(0, a)$$ | $$g$$ if $$a > 0$$, else 0 |

## What's still missing

The network here takes 2 numbers. An image is thousands of pixels, and a fully connected hidden layer gives every unit one weight per pixel. For a 200 × 200 colour image that's 120,000 weights **per unit**, and none of them knows that neighbouring pixels belong together, or that a cat on the left is the same as a cat on the right.

Part 5 fixes both with **convolutional layers**: small filters, shared across the whole image.

## Going deeper

### Gradients of matrices

In a real network the gates take whole matrices. For $$Y = XW$$, with $$X$$ of shape $$N \times D$$ and $$W$$ of shape $$D \times M$$, and upstream gradient $$\partial L/\partial Y$$ of shape $$N \times M$$:

$$\frac{\partial L}{\partial W} = X^\top \frac{\partial L}{\partial Y} \qquad \frac{\partial L}{\partial X} = \frac{\partial L}{\partial Y}\, W^\top$$

You rarely need to derive these. Check the shapes: the gradient has the same shape as the thing it's for, and there's usually only one way to multiply the pieces to get it. That's the trick the CS231n notes recommend.

### Activation functions

- **Sigmoid** squashes to $$(0, 1)$$, but its gradient $$\sigma(1 - \sigma)$$ is at most 0.25 and near 0 for large inputs, so gradients **vanish** through many layers. Its outputs are also always positive.
- **tanh** is a zero-centred sigmoid, with the same vanishing problem.
- **ReLU**, $$\max(0, x)$$, has gradient 1 wherever it's on. It's cheap and trains fast ([Krizhevsky et al., 2012](https://papers.nips.cc/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html) reported about six times faster than tanh). Its weakness: a unit that is off for every input gets no gradient and never recovers, a **dead ReLU**.
- **Leaky ReLU** and **GELU** keep a little gradient for negative inputs. GELU is the default in transformers.

### Initialisation

If all weights start equal, every hidden unit computes the same thing and gets the same gradient, forever. So weights start random. Their scale matters too: too small and the signal shrinks layer by layer, too large and it explodes. **He initialisation** ([He et al., 2015](https://arxiv.org/abs/1502.01852)) draws each weight with variance $$2/n_\text{in}$$, which keeps the signal's size steady through ReLU layers. The network here uses it.

### Automatic differentiation

Modern libraries such as PyTorch and JAX record the graph as your code runs, and backpropagate through it on request (`loss.backward()`). That's **reverse-mode automatic differentiation**. Each operation is implemented once with its forward and backward rule, exactly the gates above, and the library does the bookkeeping.

## Further reading

- CS231n notes, [_Backpropagation, Intuitions_](https://cs231n.github.io/optimization-2/): the examples in this part come from here.
- CS231n notes, [_Neural Networks Part 1_](https://cs231n.github.io/neural-networks-1/) and the [_spiral case study_](https://cs231n.github.io/neural-networks-case-study/).
- D. Rumelhart, G. Hinton and R. Williams, [_Learning representations by back-propagating errors_](https://www.nature.com/articles/323533a0) (Nature, 1986).
- C. Olah, [_Calculus on Computational Graphs: Backpropagation_](https://colah.github.io/posts/2015-08-Backprop/) (2015).

{% include cv-series.liquid %}
