---
layout: post
title: "deep learning for computer vision, part 2: linear classifiers and loss functions"
date: 2026-10-26 00:00:00 +0700
description: a scroll-through walk through scores, templates, the SVM and softmax losses and regularisation, on tiny images and on points in the plane
tags: ai computer-vision deep-learning interactive
categories: explainer
series: deep-learning-for-computer-vision
part: 2
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
  - /assets/js/cv/part2.js
  - /assets/js/cv/cv-figures.js
---

{% include cv-series.liquid %}

In [part 1]({% post_url 2026-10-26-cv-1-image-classification %}), k-nearest neighbours classified our tiny images by comparing each new one with all 64 training images. It got 80% right, but it had to keep the whole training set around, and every prediction compared against all of it.

This part follows the next stretch of CS231n, [linear classification](https://cs231n.github.io/linear-classify/). Instead of storing the training images, we'll learn a few numbers from them: one **template** per class. A prediction is then one quick calculation, however much data we trained on.

Two ideas come with it, and the rest of the series uses both:

- a **score function**, which turns an image into one score per class,
- a **loss function**, which says, with a single number, how unhappy we are with those scores.

Part 3 will add the third piece, **optimisation**: how to find the template values that make the loss small. In this part the classifier is already trained, so we can look at what it learned.

## A linear classifier, step by step

<section class="tf-scrolly" data-cv-scene="part2">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="flatten" data-title="Unroll the image into a list." markdown="1">
**A linear classifier sees an image as one long list of numbers.** Read the 8 rows one after another, and the 8 × 8 grid becomes a list $$x$$ of 64 numbers.

That throws away the fact that some pixels are neighbours. The classifier will only know that pixel 12 and pixel 13 are different inputs. We'll come back to this; it's what part 5 fixes.

The test image here is a box that this classifier gets wrong. That makes it a good one to learn from. Use ◀ ▶ above to switch images.

</div>

<div class="tf-step" data-step="scores" data-title="One score per class: weights times pixels." markdown="1">
**For each class, the classifier has 64 weights and one bias.** Its score for that class is

$$s_j = w_j \cdot x + b_j = \sum_{p=1}^{64} w_{j,p}\, x_p + b_j$$

Each pixel's value is multiplied by its weight, and the 64 products are added up. The middle panel shows the 64 products for one class at a time: red cells push the score up, blue cells push it down.

Stack the four weight rows into a 4 × 64 matrix $$W$$, and all four scores come from one matrix–vector product: $$s = Wx + b$$. The predicted class is the one with the highest score.

Here the box scores 0.10, and the vertical class wins with 1.15. That's wrong.

</div>

<div class="tf-step" data-step="templates" data-title="Each row of weights is a template." markdown="1">
**Fold each class's 64 weights back into an 8 × 8 grid, and you can see what the classifier learned.** Each one is a **template**: the score is high when the image's ink falls on red pixels and avoids blue ones.

They are noisy. With only 16 training images per class, the classifier latches onto whichever pixels happened to tell those particular images apart. The easiest to read is the diagonal one: deep red in the top-left and bottom-right corners, which a diagonal stroke always reaches and no other shape here ever does.

The others show the deeper problem: a single template has to cover every position a shape can take. Vertical bars can sit in any column, so no one column can be the "vertical" column. And the box template can't look like a box at all, because boxes of different sizes at different spots barely overlap.

So the classifier gets diagonals right 10 times out of 10, but boxes only 3 out of 10. Overall it scores 67.5% on the test images. k-NN got 80%, but needed all 64 training images to do it; this needs 260 numbers.

</div>

<div class="tf-step" data-step="geometry" data-title="In the plane: straight borders." markdown="1">
**Another way to see it: each image is a point in a 64-dimensional space**, and the classifier cuts that space into regions with flat walls.

We can't draw 64 dimensions, so here is the same classifier on points with just 2 numbers each. The tint shows which class wins at every spot.

Where two classes' scores are equal, $$w_i \cdot x + b_i = w_j \cdot x + b_j$$, which is a straight line. So every border between regions is straight. On these three blobs that's all we need: every point is on the right side.

</div>

<div class="tf-step" data-step="svm" data-title="The SVM loss: beat every wrong class by a margin." markdown="1">
**How bad were the scores for our box?** A **loss function** turns that question into one number.

The **multiclass SVM loss** wants the true class's score to beat every wrong class's score by at least a margin of 1. For each wrong class $$j$$ it charges however far short of that we fell:

$$L = \sum_{j \neq y} \max(0,\; s_j - s_y + 1)$$

For our box ($$s_y$$ = 0.10):

- vertical: 1.15 − 0.10 + 1 = 2.05, so it costs 2.05.
- horizontal: −0.28 − 0.10 + 1 = 0.61.
- diagonal: −0.94 − 0.10 + 1 is below 0, so it costs **nothing**. The box already beats it by more than the margin.

The loss is 2.66. If the box score beat every other score by 1 or more, it would be 0.

</div>

<div class="tf-step" data-step="softmax" data-title="The softmax loss: turn scores into probabilities." markdown="1">
**The other common loss reads the scores as probabilities.** Scores can be any number, so first make them positive by exponentiating, then divide by their sum so they add up to 1. That's the **softmax** function:

$$p_j = \frac{e^{s_j}}{\sum_k e^{s_k}}$$

Our box gets probability 0.205, and vertical gets 0.584. The **cross-entropy loss** is the negative log of the true class's probability:

$$L = -\log p_y = -\log 0.205 = 1.59$$

If the true class got probability 1, the loss would be 0; as its probability falls towards 0, the loss grows without limit. This **softmax classifier** is the one CS231n uses most, and every network in the rest of this series ends with it.

</div>

<div class="tf-step" data-step="reg" data-title="Regularisation: prefer small weights." markdown="1">
**The loss on the training data isn't all we care about.** Many different $$W$$ can fit the training images about equally well, and we'd like the one most likely to work on new images.

**Regularisation** adds a penalty for large weights to the loss:

$$L = \frac{1}{N} \sum_{i=1}^{N} L_i + \frac{\lambda}{2} \sum_{j,p} W_{j,p}^2$$

The bigger $$\lambda$$, the more the classifier is pushed towards small, spread-out weights. Pick a value under the figure and watch the templates fade.

On these images it doesn't pay: as $$\lambda$$ grows from 0 to 1, training accuracy falls from 97% to 72%, and validation accuracy falls too, from 50% to 38%. Regularisation fights **overfitting**, and the linear classifier's trouble isn't overfitting. It's too simple to fit the data at all.

</div>

<div class="tf-step" data-step="spiral" data-title="What a straight line can't do." markdown="1">
**Here is the limit in a picture.** These three classes are arms of a spiral. Every arm winds around the others, so no set of straight borders can separate them.

The best linear classifier gets 52% of the points right, against 33% for guessing. The CS231n notes get 49% on their version of this spiral.

No choice of loss or regularisation can fix this. The scores themselves have to become something more flexible than $$Wx + b$$. That's what **neural networks** do, in part 4.

</div>

  </div>
</section>

## The whole thing in one line

A linear classifier computes one score per class,

$$s = W x + b$$

with $$x$$ the image as a list of $$D$$ numbers, $$W$$ a $$C \times D$$ matrix of weights and $$b$$ a list of $$C$$ biases. Learning means finding the $$W$$ and $$b$$ that make the total loss small:

$$L(W, b) = \frac{1}{N} \sum_{i=1}^{N} L_i\big(s(x_i), y_i\big) + \frac{\lambda}{2} \lVert W \rVert^2$$

where $$L_i$$ is the SVM loss or the cross-entropy loss of one training example.

Compared with k-NN:

{: .tf-table}
| | k-NN | linear classifier |
| ----------------- | ---------------------------- | ----------------------------- |
| what it keeps | all $$N$$ training images | $$C \times D + C$$ numbers |
| in our toy | 64 × 64 = 4,096 numbers | 4 × 64 + 4 = 260 numbers |
| on CIFAR-10 | 50,000 × 3,072 ≈ 154 million | 10 × 3,072 + 10 = 30,730 |
| cost to predict | $$N \cdot D$$ | $$C \cdot D$$ |
| test accuracy (toy) | 80% | 67.5% |

## What's still missing

- **We haven't said how to find $$W$$.** The models in the figure were trained, but by what? That's part 3: gradient descent.
- **One template per class is too few.** It can't say "a bar, anywhere" or "a box of any size".
- **Straight borders are too few.** The spiral needs curved ones.

## Going deeper

### The bias trick

Carrying $$W$$ and $$b$$ around separately is clumsy. Append a constant 1 to every input, $$x' = (x_1, \dots, x_D, 1)$$, and add $$b$$ as an extra column of $$W$$:

$$W x + b = \begin{bmatrix} W & b \end{bmatrix} \begin{bmatrix} x \\ 1 \end{bmatrix}$$

Now the classifier is a single matrix product. In practice, libraries keep $$b$$ separate, but the derivations get shorter with the trick.

### Scale makes the margin arbitrary

The SVM margin of 1 looks like a choice we'd have to tune. It isn't. Multiply $$W$$ and $$b$$ by 2 and every score doubles, so every score difference doubles too: a classifier that beats the margin of 1 by a bit now beats it by more. The size of the weights and the size of the margin trade off against each other, and the regularisation strength $$\lambda$$ is what really sets how far apart the scores end up. So the margin can be fixed at 1 and only $$\lambda$$ tuned.

### Scaling the scores changes the softmax

The softmax doesn't just look at which score is highest; it looks at how far apart they are. Scale our box's scores by a factor $$c$$ and watch the probabilities:

<figure class="tf-figure" data-cv-figure="softmaxScale">
  <noscript><p class="tf-noscript">This figure needs JavaScript. Multiplying all scores by a large factor makes the softmax put nearly all its probability on the highest score; multiplying by a small factor makes it nearly uniform.</p></noscript>
</figure>

As $$c \to 0$$ the probabilities all approach $$\frac{1}{4}$$; as $$c$$ grows, the top score takes everything. So the softmax loss can always be lowered by scaling up a $$W$$ that already gets an example right, which is one more reason regularisation is needed to keep the weights finite.

### SVM or softmax?

They usually give classifiers that perform about the same. The difference is in what satisfies them.

- The **SVM loss** is happy as soon as every margin is met: the diagonal term above is exactly 0, and nothing more is learned from it.
- The **softmax loss** is never fully happy: a probability of 0.98 can still be pushed to 0.99. Every example keeps contributing a little.

The softmax also gives numbers that read as confidence, which is useful downstream, though deep networks' probabilities tend to be overconfident.

### A sanity check at the start

When training starts, the weights are tiny random numbers, so every score is close to 0. That tells you what the first loss should be:

- **SVM:** every wrong class gives $$\max(0, 0 - 0 + 1) = 1$$, so $$L \approx C - 1$$. With our 4 classes, that's 3; our untrained classifier's average loss is 2.995.
- **Softmax:** every class gets probability $$\frac{1}{C}$$, so $$L \approx \log C$$. With 4 classes, $$\log 4 = 1.386$$; ours is 1.385.

If your first loss is far from these, something in the code is wrong. CS231n suggests this check before every training run.

### Why squared weights?

Take an input $$x = (1, 1, 1, 1)$$ and two weight vectors, $$w_1 = (1, 0, 0, 0)$$ and $$w_2 = (0.25, 0.25, 0.25, 0.25)$$. Both give the same score, $$w \cdot x = 1$$. The L2 penalty is 1 for $$w_1$$ and 0.25 for $$w_2$$, so regularisation prefers $$w_2$$: use all the evidence a little, instead of one pixel a lot. A single noisy pixel then can't swing the decision.

The **L1 penalty**, $$\sum \lvert W_{j,p} \rvert$$, does the opposite: it pushes many weights to exactly zero, which selects a few inputs. Both are used; L2 is the default for neural networks, where it's also called **weight decay**.

### Where the cross-entropy comes from

Two readings of the same formula:

- **Probability.** Treat the softmax outputs as the model's probabilities. The probability the model gives to the whole training set is $$\prod_i p_{y_i}$$. Making that large is the same as making $$-\sum_i \log p_{y_i}$$ small. So minimising cross-entropy is **maximum likelihood**.
- **Information.** The cross-entropy between the true distribution $$q$$ (all of its mass on the right class) and the model's $$p$$ is $$H(q, p) = -\sum_j q_j \log p_j = -\log p_y$$. It's smallest when $$p = q$$.

Adding the L2 penalty also has a probability reading: it's a Gaussian prior on the weights, which makes training a **maximum a posteriori** estimate.

## Further reading

- CS231n notes, [_Linear classification: Support Vector Machine, Softmax_](https://cs231n.github.io/linear-classify/): the same material on CIFAR-10, with an interactive demo.
- J. Weston and C. Watkins, _Support Vector Machines for Multi-Class Pattern Recognition_ (ESANN 1999): the multiclass SVM loss used here.
- C. Bishop, _Pattern Recognition and Machine Learning_ (2006), chapter 4: linear models for classification, including the softmax and its probabilistic reading.

{% include cv-series.liquid %}
