---
layout: post
title: "From a Decision Line to a Tiny Neural Network"
date: 2026-06-06 12:00:00
description: "A visual, interactive path through neurons, loss, gradient descent, backpropagation, mini-batches, and nonlinear classification."
tags: [machine-learning, neural-networks, gradient-descent, backpropagation, interactive]
categories: [explanation]
enable_math: true
css:
  - /assets/css/posts/gradient-descent.css
js:
  - /assets/js/posts/gradient-descent.js
---

How can a program learn to separate two kinds of fruit, then eventually recognize a
doodle? We will build the ideas one at a time. Every playground below is a real
calculation in vanilla JavaScript—not a prerecorded animation.

## 1. Begin with a boundary

Imagine each fruit as a point: $$x_1$$ is redness and $$x_2$$ is roundness. Apples
and oranges have labels 1 and 0. A classifier needs a boundary in this feature
plane; points on opposite sides receive opposite predictions.

## 2. Weights and bias

A single neuron computes

$$z=w_1x_1+w_2x_2+b,\qquad \hat y=\begin{cases}1&z\ge0\\0&z<0.\end{cases}$$

Weights rotate the boundary and the bias shifts it. Try to separate the fruit. The
renderer handles vertical boundaries directly rather than dividing by $$w_2$$.

<div class="ml-playground" id="gd-boundary-demo">
  <div class="playground-card">
    <div class="control-bar">
      <label>Weight w₁ <output id="gd-boundary-w1-value">1.0</output><input id="gd-boundary-w1" class="custom-slider" type="range" min="-3" max="3" step="0.1" value="1"></label>
      <label>Weight w₂ <output id="gd-boundary-w2-value">-1.0</output><input id="gd-boundary-w2" class="custom-slider" type="range" min="-3" max="3" step="0.1" value="-1"></label>
      <label>Bias b <output id="gd-boundary-b-value">0.0</output><input id="gd-boundary-b" class="custom-slider" type="range" min="-3" max="3" step="0.1" value="0"></label>
    </div>
    <div class="canvas-wrapper"><canvas id="gd-boundary-canvas" width="720" height="400" role="img" aria-label="Fruit points and adjustable linear decision boundary">Interactive boundary plot.</canvas></div>
    <p class="playground-status" id="gd-boundary-status" aria-live="polite"></p>
  </div>
</div>

## 3. Hidden layers need bends

Several linear maps still collapse into one linear map: $$W_2(W_1x+b_1)+b_2$$
can be rearranged as $$Wx+b$$. An **activation function** between layers supplies
the bend needed for curved boundaries. Sigmoid compresses to $$(0,1)$$, tanh to
$$(-1,1)$$, and ReLU keeps positive values while clipping negatives.

<div class="ml-playground" id="gd-activation-demo">
  <div class="playground-card">
    <div class="button-row" role="group" aria-label="Activation function"><button type="button" class="playground-btn is-active" data-activation="sigmoid">Sigmoid</button><button type="button" class="playground-btn" data-activation="tanh">tanh</button><button type="button" class="playground-btn" data-activation="relu">ReLU</button></div>
    <label>Input z <output id="gd-activation-z-value">0.00</output><input id="gd-activation-z" class="custom-slider" type="range" min="-5" max="5" step="0.05" value="0"></label>
    <div class="canvas-wrapper compact"><canvas id="gd-activation-canvas" width="720" height="300" role="img" aria-label="Selected activation function graph">Interactive activation graph.</canvas></div>
    <p class="playground-status" id="gd-activation-status" aria-live="polite"></p>
  </div>
</div>

## 4. Turn mistakes into cost

A prediction needs a score that says how wrong it is. For one example, squared
error is $$C=(a-y)^2$$. It is zero at the target and rises smoothly away from it.

<div class="ml-playground" id="gd-cost-demo"><div class="playground-card playground-split">
  <div><label>Prediction a <output id="gd-cost-a-value">0.35</output><input id="gd-cost-a" class="custom-slider" type="range" min="0" max="1" step="0.01" value="0.35"></label><label for="gd-cost-target">Target y</label><select id="gd-cost-target"><option value="0">0</option><option value="1" selected>1</option></select><p class="equation-box" id="gd-cost-status" aria-live="polite"></p></div>
  <div class="canvas-wrapper compact"><canvas id="gd-cost-canvas" width="600" height="300" role="img" aria-label="Squared error curve and current prediction">Interactive cost plot.</canvas></div>
</div></div>

## 5. Walk downhill

For $$L(x)=(x-1)^2+0.15\sin(3x)$$, the exact derivative is
$$L'(x)=2(x-1)+0.45\cos(3x)$$. Gradient descent updates
$$x\leftarrow x-\eta L'(x)$$. Small $$\eta$$ crawls, a useful value settles
quickly, and an excessive value can overshoot.

<div class="ml-playground" id="gd-one-d-demo"><div class="playground-card">
  <div class="control-bar"><label>Learning rate η <output id="gd-one-d-lr-value">0.15</output><input id="gd-one-d-lr" class="custom-slider" type="range" min="0.01" max="1.1" step="0.01" value="0.15"></label></div>
  <div class="button-row"><button type="button" id="gd-one-d-step" class="playground-btn">Step</button><button type="button" id="gd-one-d-run" class="playground-btn playground-btn-primary">Run</button><button type="button" id="gd-one-d-reset" class="playground-btn">Reset</button></div>
  <div class="metrics-row" id="gd-one-d-status" aria-live="polite"></div><div class="canvas-wrapper"><canvas id="gd-one-d-canvas" width="720" height="360" role="img" aria-label="One-dimensional loss function and gradient descent point">Interactive loss graph.</canvas></div>
</div></div>

## 6. A landscape of parameters

A model usually has many adjustable numbers. Here, every point in the plane is a
linear regression model $$\hat y=mx+b$$; color shows its mean squared error. The
trajectory follows the two-component gradient. The cross is the closed-form
least-squares optimum, useful here as a reference.

<div class="ml-playground" id="gd-landscape-demo"><div class="playground-card">
  <div class="control-bar"><label>Learning rate η <output id="gd-landscape-lr-value">0.08</output><input id="gd-landscape-lr" class="custom-slider" type="range" min="0.005" max="0.3" step="0.005" value="0.08"></label></div>
  <div class="button-row"><button type="button" id="gd-landscape-step" class="playground-btn">Step</button><button type="button" id="gd-landscape-run" class="playground-btn playground-btn-primary">Run</button><button type="button" id="gd-landscape-reset" class="playground-btn">Reset</button></div>
  <p class="playground-status" id="gd-landscape-status" aria-live="polite"></p><div class="canvas-wrapper square"><canvas id="gd-landscape-canvas" width="600" height="500" role="img" aria-label="Regression cost heatmap with optimization trajectory">Interactive parameter landscape.</canvas></div>
</div></div>

With three parameters the landscape is three-dimensional; with millions it is a
million-dimensional space. The update rule is unchanged even when we cannot draw it.

## 7. Chain rule becomes backpropagation

For a tiny network,
$$z=wx+b,\quad a=\sigma(z),\quad C=(a-y)^2.$$
The chain rule follows the route from cost back to the weight:

$$
\frac{\partial C}{\partial w}=\frac{\partial C}{\partial a}
\frac{\partial a}{\partial z}\frac{\partial z}{\partial w}
=2(a-y)\,a(1-a)\,x.
$$

Likewise, $$\partial C/\partial b=2(a-y)a(1-a)$$ because
$$\partial z/\partial b=1$$.

<div class="ml-playground" id="gd-chain-demo"><div class="playground-card">
  <div class="control-grid"><label>x <output id="gd-chain-x-value"></output><input id="gd-chain-x" type="range" min="-2" max="2" step="0.1" value="1.2"></label><label>w <output id="gd-chain-w-value"></output><input id="gd-chain-w" type="range" min="-3" max="3" step="0.1" value="0.8"></label><label>b <output id="gd-chain-b-value"></output><input id="gd-chain-b" type="range" min="-2" max="2" step="0.1" value="-0.3"></label><label>target y <select id="gd-chain-target"><option value="0">0</option><option value="1" selected>1</option></select></label></div>
  <div class="node-flow" aria-label="Forward flow"><span>x</span><b>× w, + b</b><span>z</span><b>sigmoid</b><span>a</span><b>squared error</b><span>C</span></div>
  <div class="derivative-grid" id="gd-chain-status" aria-live="polite"></div>
</div></div>

Backpropagation is this same chain rule organized efficiently: each node receives a
reverse sensitivity, multiplies it by its local derivative, and reuses the result
for every incoming parameter.

## 8. Mini-batches and a network that actually learns

**Batch** descent averages every training example before an update. **Stochastic**
descent uses one randomly chosen example. A **mini-batch** sits between them: its
gradient is cheaper than a full batch and less noisy than a single example. Some
noise can help exploration, but very small batches make the loss wobble.

This final demo trains a genuine 2→4→1 network on a deterministic, XOR-like set.
Hidden tanh neurons create nonlinear features; a sigmoid output estimates class 1.

<div class="ml-playground" id="gd-network-demo"><div class="playground-card">
  <div class="control-grid"><label>Learning rate <output id="gd-network-lr-value">0.12</output><input id="gd-network-lr" type="range" min="0.01" max="0.8" step="0.01" value="0.12"></label><label for="gd-network-batch">Batch size</label><select id="gd-network-batch"><option>1</option><option selected>8</option><option>16</option><option>64</option></select></div>
  <div class="button-row"><button type="button" id="gd-network-step" class="playground-btn">Step batch</button><button type="button" id="gd-network-run" class="playground-btn playground-btn-primary">Run</button><button type="button" id="gd-network-reset" class="playground-btn">Reset</button></div>
  <div class="metrics-row" id="gd-network-status" aria-live="polite"></div><div class="canvas-wrapper square"><canvas id="gd-network-canvas" width="600" height="500" role="img" aria-label="Neural network decision regions and XOR-like data">Interactive neural classifier.</canvas></div>
  <div class="canvas-legend"><span><i class="legend-dot class-zero"></i> class 0</span><span><i class="legend-dot class-one"></i> class 1</span><span>background = predicted probability</span></div>
</div></div>

## From toys to images: applications and limits

Image classification uses the same ingredients at a larger scale. A flattened
28×28 MNIST or Fashion-MNIST image supplies **784 inputs**; **10 outputs** can score
the ten classes. Quick Draw adds varied hand-drawn objects, while CIFAR-10 uses
small color photographs. These browser demos are toy models and do not train on
any of those datasets.

A responsible experiment separates training data from a held-out test set.
Performance can still fall under **distribution shift**—different cameras, drawing
styles, backgrounds, or populations. Augmentation creates plausible transformed
training examples; regularization and validation help detect overfitting. Dense
networks also discard image geometry and require many connections. Convolutional
neural networks share local filters, making them better suited to spatial patterns.

## Experiment checklist

- Rotate and shift the fruit boundary; try $$w_2=0$$.
- Compare sigmoid, tanh, and ReLU near zero and at their extremes.
- Put the cost prediction on and far from its target.
- Compare learning rates around 0.02, 0.15, and 1.0 in the 1D demo.
- Follow the landscape trail to the closed-form cross.
- Change each chain-rule input and identify which derivative factor changes.
- Train the nonlinear model with batch sizes 1, 8, and 64; compare noise and speed.

## Summary

A neuron draws a weighted boundary. Activations let layers bend that boundary. A
cost measures error, gradients point toward local improvement, and the chain rule
delivers those gradients through every layer. Mini-batches make repeated updates
practical. Together these simple mechanisms are enough for the tiny network above
to learn a nonlinear decision region—and form the foundation of much larger models.
