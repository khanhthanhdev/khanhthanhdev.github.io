---
layout: post
title: "MNIST Image Classification: From Pixels to Predictions"
date: 2026-08-09 09:00:00
description: "Build, train, evaluate, and test a neural network for handwritten digit classification in an interactive browser playground."
tags: [machine-learning, neural-networks, image-classification, mnist, interactive]
categories: [explanation]
enable_math: true
toc:
  sidebar: true
---

Image classification asks a model to assign an image to one of several classes. In
the **MNIST** problem, the input is a small grayscale image of a handwritten digit,
and the output is one of ten labels: 0 through 9. The dataset is simple enough to
explore in a browser, but it contains the same essential pieces as larger vision
systems: pixels, labels, a model, a loss function, optimization, and evaluation on
unseen examples.

This article develops those pieces, then puts them together in a live experiment.
At the end, you can draw your own digit and inspect all ten predicted probabilities.

## 1. What does the model see?

Each MNIST image contains $$28 \times 28 = 784$$ grayscale pixels. A pixel value is
scaled from the integer range 0–255 to the real range 0–1. A dense neural network
then flattens the image into a vector:

$$
\mathbf{x} = [x_1, x_2, \ldots, x_{784}], \qquad x_i \in [0, 1].
$$

The label is represented by a **one-hot vector** of length 10. For example, digit 4
has a 1 in position 4 and a 0 everywhere else:

$$
\mathbf{y} = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0].
$$

A network layer computes a weighted sum and then applies an activation function:

$$
\mathbf{h} = f(W\mathbf{x} + \mathbf{b}).
$$

The weights $$W$$ and biases $$\mathbf{b}$$ are the quantities learned during
training.

## 2. Choosing the layer sizes and activations

The architecture `784, 128, 64, 10` means:

- **784 input values:** one per pixel;
- **128 and 64 hidden units:** learned intermediate features;
- **10 output values:** one score per digit.

More hidden units give the model more capacity, but also require more computation
and can overfit. In a dense network, the first layer alone contains
$$784 \times 128$$ weights. The playground therefore keeps the input and output
sizes fixed and lets you edit the hidden layers.

The **hidden activation** makes the model nonlinear. ReLU,
$$\operatorname{ReLU}(z) = \max(0, z),$$ is usually a strong default. Tanh and
sigmoid are useful comparisons, but they can saturate and produce smaller
gradients.

For the **output activation**, softmax turns ten scores into a probability
distribution:

$$
p_k = \frac{e^{z_k}}{\sum_{j=0}^{9} e^{z_j}}, \qquad \sum_{k=0}^{9} p_k = 1.
$$

Softmax is the natural choice when exactly one class is correct. The playground
also offers sigmoid so you can observe how independent output probabilities differ.

## 3. Cost function and gradient updates

The cost function measures disagreement between the target and prediction.
**Categorical cross-entropy** is normally paired with softmax:

$$
L = -\sum_{k=0}^{9} y_k \log(p_k).
$$

Because only the correct class has $$y_k=1$$, minimizing this loss increases the
probability assigned to the correct digit. Mean squared error is available as an
experiment, although it generally learns classification more slowly.

Backpropagation computes the gradient of this loss for every parameter. A basic
gradient-descent update is

$$
\theta_{t+1} = \theta_t - \eta\nabla_\theta L,
$$

where $$\eta$$ is the **learning rate**. Too small is slow; too large can make the
loss oscillate or diverge.

**Momentum** remembers part of the previous update:

$$
\mathbf{v}_{t+1} = \mu\mathbf{v}_t - \eta\nabla_\theta L,
\qquad
\theta_{t+1} = \theta_t + \mathbf{v}_{t+1}.
$$

Here $$\mu$$ is the momentum coefficient. A value around 0.9 often smooths noisy
updates.

Finally, the **mini-batch size** controls how many examples contribute to one
update. Small batches make frequent, noisy updates; large batches are steadier but
use more memory and make fewer updates per epoch.

## 4. Training and validation

An **epoch** is one pass over the training examples. The training split controls
how much of the loaded subset is used to update weights; the rest becomes the
validation set. Validation examples never update the model. A widening gap between
high training accuracy and lower validation accuracy is evidence of overfitting.

Accuracy is intuitive, but it only checks the highest-probability class. A
**receiver operating characteristic (ROC) curve** studies every classification
threshold. For each digit, we treat that digit as positive and all other digits as
negative, then plot true-positive rate against false-positive rate. The **area
under the curve (AUC)** is 0.5 for random ranking and 1.0 for perfect ranking. The
macro AUC shown below is the unweighted mean of the ten one-vs-rest AUC values.

## 5. Train a model and draw a digit

The first run downloads the public MNIST sprite (about 10 MB) and caches it in your
browser. Training uses a subset so the experiment remains responsive. Everything
else—including training, ROC calculation, and drawing prediction—runs locally in
your browser with TensorFlow.js.

{% include interactive.html
  src="/assets/interactive/ml-series/002-neural-networks/mnist-playground.html"
  title="MNIST neural network playground"
  caption="Configure and train a dense classifier, compare learning curves and one-vs-rest ROC/AUC, then draw a digit for the model to classify."
  height="1250"
  wide=true
%}

### Experiments to try

1. Start with `784, 128, 10`, ReLU, softmax, cross-entropy, learning rate 0.05,
   momentum 0.9, and batch size 64.
2. Raise the learning rate to 0.5. Does the loss become unstable?
3. Compare ReLU with sigmoid while keeping every other setting fixed.
4. Add a second hidden layer, such as `784, 128, 64, 10`. Does validation improve
   enough to justify the extra parameters and training time?
5. Compare softmax + cross-entropy with sigmoid + mean squared error.
6. Open the ROC view. Which digits have the lowest AUC, and which handwritten
   shapes might the model confuse?

## 6. What this demo leaves out

Flattening discards the fact that neighboring pixels are spatially related. A
convolutional neural network (CNN) usually performs better because shared filters
learn local strokes, corners, and curves. Data augmentation, regularization,
careful hyperparameter tuning, and the full training set would also improve the
result.

The important lesson is not the final score. It is the complete classification
loop:

$$
\text{pixels} \rightarrow \text{network} \rightarrow \text{probabilities}
\rightarrow \text{loss} \rightarrow \text{gradient update} \rightarrow
\text{evaluation}.
$$

Once that loop is clear, larger image classifiers are variations on the same idea.

## Further reading

- [The MNIST database of handwritten digits](https://yann.lecun.com/exdb/mnist/)
- [TensorFlow.js documentation](https://www.tensorflow.org/js)
- [Understanding ROC curves and AUC](https://developers.google.com/machine-learning/crash-course/classification/roc-and-auc)
