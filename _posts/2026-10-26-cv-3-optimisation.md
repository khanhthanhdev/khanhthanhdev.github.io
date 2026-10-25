---
layout: post
title: "deep learning for computer vision, part 3: optimisation"
date: 2026-10-26 00:00:00 +0700
description: a scroll-through walk across a loss landscape small enough to see whole, with random search, gradient descent, SGD, momentum and Adam each leaving its path
tags: ai computer-vision deep-learning interactive
categories: explainer
series: deep-learning-for-computer-vision
part: 3
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
  - /assets/js/cv/part3.js
---

{% include cv-series.liquid %}

[Part 2]({% post_url 2026-10-26-cv-2-linear-classifiers %}) built a classifier from two pieces: a **score function** with weights $$W$$, and a **loss** that says how bad its scores are. It skipped the question of how the weights get their values.

That's **optimisation**: find the weights that make the loss as small as possible. This part follows CS231n's lecture on [regularisation and optimisation](https://cs231n.github.io/optimization-1/). The same few methods train everything from part 2's linear classifier to networks with billions of weights.

## A landscape you can see

The loss is a function of the weights. Part 2's classifier had 12,292 weights, so its loss is a surface over a 12,292-dimensional space, which no one can draw.

So this part shrinks the classifier until the surface fits on screen: **two weights**, $$w_1$$ and $$w_2$$, and no bias. It looks at 80 points, each with two numbers $$x = (x_1, x_2)$$, in two classes, and gives each point the probability $$p = \sigma(w_1 x_1 + w_2 x_2)$$ of being in class 1, where $$\sigma(z) = 1/(1 + e^{-z})$$. That's the two-class version of part 2's softmax classifier, called **logistic regression**. The loss is the same cross-entropy, averaged over the points, plus a little L2 regularisation.

Now every pair $$(w_1, w_2)$$ is one complete classifier, and its loss is one number. Paint every pair by its loss, and we have a map: darker is lower.

## Downhill, step by step

<section class="tf-scrolly" data-cv-scene="part3">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="landscape" data-title="The loss is a landscape." markdown="1">
**This is the loss of every classifier we could pick.** The horizontal axis is $$w_1$$, the vertical axis $$w_2$$, and the shading is the loss: darker bands are lower.

The lowest point, ★, is at (0.75, 0.82) with loss 0.463. Our start, the ringed dot, is at (2.60, −3.50) with loss 0.790.

The low ground is a long, narrow valley: walls that rise fast across it, and a floor that falls only slowly along it. That shape makes optimisation hard, and it's typical. Here it comes from the data: $$x_1$$ is spread about eight times wider than $$x_2$$, so changing $$w_1$$ changes the scores much more than changing $$w_2$$.

Click anywhere on the landscape to start from somewhere else; every later step reruns from there.

</div>

<div class="tf-step" data-step="random" data-title="Idea 1: guess at random." markdown="1">
**The simplest search: try random weights, and keep the best.**

On this map it works fine. After 100 tries the best guess has loss 0.468, close to the lowest possible 0.463.

But it can't scale. To land within a small distance of the best point, random guesses need to cover the space, and the number of guesses needed grows exponentially with the number of weights (the curse of dimensionality from [part 1]({% post_url 2026-10-26-cv-1-image-classification %}#the-curse-of-dimensionality)). With 12,292 weights, never mind millions, random search goes nowhere.

</div>

<div class="tf-step" data-step="gradient" data-title="Idea 2: feel which way is down." markdown="1">
**Better: stand where you are, and feel the slope.** The **gradient** $$\nabla L = (\partial L / \partial w_1,\, \partial L / \partial w_2)$$ is the direction in which the loss rises fastest. So **minus the gradient** points steepest downhill. The arrow shows it.

There are two ways to get it:

- **Numerically**: nudge each weight by a tiny $$h$$ and see how much the loss changes, $$\frac{L(w + h) - L(w)}{h}$$. Easy, but it costs one extra loss evaluation per weight: impossible with millions of weights.
- **Analytically**: work out the formula with calculus. For this loss it's $$\nabla L = \frac{1}{N}\sum_i (p_i - y_i)\, x_i + \lambda w$$. Exact and fast.

Here both give (0.2154, −0.0335): the two arrows lie on top of each other. In practice you always use the formula, and check it against the numerical version on a few weights. That's a **gradient check**.

</div>

<div class="tf-step" data-step="descent" data-title="Gradient descent: step, and repeat." markdown="1">
**Gradient descent** takes a small step against the gradient, recomputes it, and repeats:

$$w \leftarrow w - \eta\, \nabla L(w)$$

The step size $$\eta$$ is the **learning rate**. Here $$\eta$$ = 2.

Watch the path. It heads mostly across the valley first, because that's where the slope is steepest, then turns and creeps along the floor, where the slope is gentle. After 60 steps the loss is down from 0.790 to 0.469; it took 49 steps to get within 0.01 of the lowest point.

</div>

<div class="tf-step" data-step="rate" data-title="The learning rate matters most." markdown="1">
**Choose the learning rate below the figure.** It's the single most important setting in training a network.

- **0.5**: every step is safe but tiny. After 60 steps the loss is still 0.525.
- **2**: steady progress, as before.
- **8**: steps are big enough to overshoot the valley's floor, and the path bounces from wall to wall. Sometimes the loss goes up.
- **12**: the first big step flings the weights far up the far wall (loss 3.54 after two steps). It finds its way back, but erratically.

Too small wastes time; too big wastes it in a different way, and on a less forgiving landscape it can make the loss grow without limit. The best value sits just below the point where the path starts to bounce.

</div>

<div class="tf-step" data-step="sgd" data-title="Stochastic gradient descent: use a sample." markdown="1">
**Each gradient above used all 80 points.** On ImageNet, the dataset most vision models are trained on, that would be 1.2 million images for every single step.

**Stochastic gradient descent** (SGD) estimates the gradient from a small random **minibatch** instead, and takes a step with that. The estimate is noisy, but it's cheap, so you can take far more steps for the same work.

With a batch of 8 points, the path swings widely around the full-gradient one, and the loss jumps up now and then, but it drifts the same way. With a batch of 32 it's steadier; with a batch of 1, it staggers. The noise shrinks as the batch grows, roughly as one over the square root of its size. Real networks use batches of 32 to a few thousand images, and almost always train with some form of SGD.

</div>

<div class="tf-step" data-step="momentum" data-title="Momentum: keep rolling." markdown="1">
**Plain gradient descent forgets its past.** In a narrow valley that's a problem: it keeps stepping across the valley, and makes slow progress along it.

**Momentum** treats the weights like a ball rolling downhill. It keeps a running velocity $$v$$, adds each new gradient to it, and steps along the velocity:

$$v \leftarrow \beta v + \nabla L(w), \qquad w \leftarrow w - \eta\, v$$

With $$\beta = 0.9$$, the gradients along the valley point the same way every time and add up, so the ball picks up speed along the floor. The gradients across it flip sign from step to step, so they partly cancel. You can see both: the path swings from wall to wall, but it races up the valley while it does. It gets within 0.01 of the lowest loss after 44 steps, against 49 for plain descent.

Momentum isn't magic: those swings show it can overshoot, and its loss curve is bumpier. Its strength shows most on long, gentle slopes, which deep networks have plenty of.

</div>

<div class="tf-step" data-step="adam" data-title="Adam: a step size for every weight." markdown="1">
**The valley is hard because one learning rate has to suit both weights.** Steep $$w_1$$ wants small steps; gentle $$w_2$$ wants big ones.

**Adam** keeps two running averages for each weight: one of its gradients (momentum, as before), and one of its squared gradients. It divides the first by the square root of the second. A weight whose gradients are big gets smaller steps; one whose gradients are small gets bigger ones.

Here Adam with learning rate 0.1 gets within 0.01 of the lowest loss after 36 steps. It's the default choice for most networks today, often in a variant called **AdamW**.

</div>

  </div>
</section>

## The whole thing in one line

Every method here repeats one loop:

1. Take a minibatch of training examples.
2. Compute the loss on it, and its gradient with respect to every weight.
3. Update the weights using the gradient.

They differ only in step 3:

{: .tf-table}
| method | update | remembers |
| -------- | ------------------------------------------------------------------ | -------------------------- |
| SGD | $$w \leftarrow w - \eta\, g$$ | nothing |
| momentum | $$v \leftarrow \beta v + g,\; w \leftarrow w - \eta\, v$$ | a velocity per weight |
| Adam | $$w \leftarrow w - \eta\, \hat m / (\sqrt{\hat v} + \epsilon)$$ | two averages per weight |

Here $$g$$ is the minibatch gradient. Adam's $$\hat m$$ and $$\hat v$$ are given [below](#adam).

## What's still missing

Step 2 needs the gradient of the loss **with respect to every weight**. For our two weights, and for part 2's linear classifier, a formula worked out by hand does it.

For a deep network, writing that formula by hand is hopeless. Part 4 shows how to get every gradient of any network mechanically, at about the cost of computing the loss once: **backpropagation**. Then we'll use it to train our first neural network.

## Going deeper

### Why minus the gradient is steepest downhill

Take a tiny step $$\delta$$ from $$w$$. To first order, the loss changes by

$$L(w + \delta) - L(w) \approx \nabla L(w) \cdot \delta = \lVert \nabla L \rVert\, \lVert \delta \rVert \cos\theta$$

where $$\theta$$ is the angle between the step and the gradient. For steps of a fixed length, this is most negative when $$\cos\theta = -1$$: pointing exactly against the gradient. That's also why the gradient is at right angles to the contour lines: a step along a contour, $$\cos\theta = 0$$, doesn't change the loss.

### Numerical gradients and their error

The one-sided difference $$\frac{L(w + h) - L(w)}{h}$$ has an error proportional to $$h$$. The **centred** difference

$$\frac{L(w + h) - L(w - h)}{2h}$$

has an error proportional to $$h^2$$, because the second-order terms of the two Taylor expansions cancel. It costs two loss evaluations instead of one, and it's what CS231n recommends for gradient checks. Make $$h$$ too small, though, and floating-point rounding takes over; around $$10^{-5}$$ is typical.

Compare the two by **relative error**, $$\frac{\lvert a - n \rvert}{\max(\lvert a \rvert, \lvert n \rvert)}$$: below about $$10^{-7}$$ is a pass; above $$10^{-2}$$ means the analytic gradient is probably wrong.

### Why the valley is narrow, and how to widen it

Near the bottom, the loss looks like a bowl, $$L(w) \approx L(w^*) + \frac{1}{2}(w - w^*)^\top H (w - w^*)$$, where $$H$$ is the **Hessian**, the matrix of second derivatives. The curvature along each direction is an eigenvalue of $$H$$.

Here the steep direction curves about 28 times more than the gentle one. Gradient descent is stable only if $$\eta < 2/\lambda_{\max}$$, set by the steepest direction, but then it crawls along the gentlest one, at a rate set by the ratio $$\lambda_{\max}/\lambda_{\min}$$, the **condition number**.

For a linear model the curvature comes straight from the spread of the inputs. **Standardising** each input (subtract its mean, divide by its standard deviation) makes the bowl rounder before training even starts. That's why image pixels are normalised before they go into a network, and it's the same idea as **batch normalisation**, later in the course.

### Learning-rate schedules

A rate that's right at the start is usually too big near the end, where the minibatch noise makes the weights jitter around the minimum. So the learning rate is lowered during training:

- **step decay**: divide by 10 at a few fixed epochs (the classic recipe for ResNets);
- **cosine decay**: follow half a cosine from the initial rate down to 0;
- **warm-up**: start from a very small rate and raise it over the first few hundred steps, which keeps early, wild gradients from wrecking the initial weights. Transformers almost always use it.

### Adam in full {#adam}

For each weight, with gradient $$g_t$$ at step $$t$$:

$$m_t = \beta_1 m_{t-1} + (1 - \beta_1)\, g_t \qquad v_t = \beta_2 v_{t-1} + (1 - \beta_2)\, g_t^2$$

$$\hat m_t = \frac{m_t}{1 - \beta_1^t} \qquad \hat v_t = \frac{v_t}{1 - \beta_2^t} \qquad w_t = w_{t-1} - \eta\, \frac{\hat m_t}{\sqrt{\hat v_t} + \epsilon}$$

with the usual $$\beta_1 = 0.9$$, $$\beta_2 = 0.999$$ and $$\epsilon = 10^{-8}$$. The hats are a **bias correction**: $$m$$ and $$v$$ start at 0, so in the first steps they underestimate the true averages, and dividing by $$1 - \beta^t$$ undoes that.

Without $$m$$, the method is **RMSProp** (Hinton's lecture notes, 2012). Without $$v$$, it's momentum. **AdamW** ([Loshchilov and Hutter, 2019](https://arxiv.org/abs/1711.05101)) applies weight decay directly to the weights instead of adding it to the gradient, which works better with Adam's per-weight scaling.

### Why not use the curvature directly?

**Newton's method** steps by $$w \leftarrow w - H^{-1} \nabla L$$. On a bowl it jumps to the bottom in a single step, whatever the condition number. But $$H$$ has one entry per _pair_ of weights: for a network with 10 million weights, that's $$10^{14}$$ numbers, and inverting it is out of the question. Approximations such as **L-BFGS** work well on small problems with full batches; for deep networks, cheap first-order methods with minibatches have won.

## Further reading

- CS231n notes, [_Optimization: Stochastic Gradient Descent_](https://cs231n.github.io/optimization-1/) and the training section of [_Neural Networks Part 3_](https://cs231n.github.io/neural-networks-3/): gradient checks, momentum, Adam and schedules.
- D. Kingma and J. Ba, [_Adam: A Method for Stochastic Optimization_](https://arxiv.org/abs/1412.6980) (2015).
- I. Loshchilov and F. Hutter, [_Decoupled Weight Decay Regularization_](https://arxiv.org/abs/1711.05101) (2019): AdamW.
- G. Goh, [_Why Momentum Really Works_](https://distill.pub/2017/momentum/) (Distill, 2017): an interactive look at momentum on narrow valleys.

{% include cv-series.liquid %}
