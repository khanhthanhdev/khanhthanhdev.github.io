---
layout: post
title: "deep learning for computer vision, part 1: image classification and nearest neighbours"
date: 2026-10-26 00:00:00 +0700
description: a scroll-through walk through the data-driven approach and k-nearest neighbours, on tiny images whose every pixel and distance you can see
tags: ai computer-vision deep-learning interactive
categories: explainer
series: deep-learning-for-computer-vision
part: 1
series_title: deep learning for computer vision
series_description: a scroll-through course in deep learning for computer vision that follows Stanford's CS231n, from nearest neighbours to convolutional networks, with every model running live in your browser on images small enough to see every pixel
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
  - /assets/js/cv/part1.js
  - /assets/js/cv/cv-figures.js
---

{% include cv-series.liquid %}

You glance at a photo and know at once that it shows a cat. To a computer the same photo is a grid of numbers, one per pixel per colour. Nothing in that grid says "cat". The same cat in a different pose, under a different light or half behind a sofa gives a completely different grid. People call this the **semantic gap**, and closing it is what computer vision is about.

This series is a tour of how deep learning closes it. It follows the order of Stanford's course [**CS231n: Deep Learning for Computer Vision**](https://cs231n.stanford.edu/), and its [course notes](https://cs231n.github.io/). Each part takes one stretch of the course and builds it from scratch. Every figure runs the real model in your browser, and every number you see is computed, not drawn by hand.

This first part follows the course's opening topic, [image classification](https://cs231n.github.io/classification/): what the problem is, and the simplest method that solves it at all, **nearest neighbours**.

## The toy images

CS231n works with [CIFAR-10](https://www.cs.toronto.edu/~kriz/cifar.html): 60,000 colour photos of 32 × 32 pixels in ten classes (planes, cars, birds, cats, …). That's 3,072 numbers per image, far too many to draw.

So this series uses tiny stand-ins: **grey images of 8 × 8 pixels**, so each one is 64 numbers between 0 (white paper) and 1 (black ink). Each shows one of four shapes:

- a **vertical** bar,
- a **horizontal** bar,
- a **diagonal** stroke,
- the outline of a **box**.

Each shape sits at a random spot, with random brightness and a little noise, so no two images are the same. There are 64 training images (16 per class), 32 more for validation and 40 for testing. They are generated from a fixed seed, so you see the same ones I do.

## Classifying by nearest neighbours, step by step

<section class="tf-scrolly" data-cv-scene="part1">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="pixels" data-title="An image is a grid of numbers." markdown="1">
**This is what the computer gets**: 64 numbers. Dark cells are ink, light cells are paper. You can probably see the box in it; the computer sees only the numbers.

The task of **image classification** is to take a grid like this and return one label from a fixed list: here _vertical_, _horizontal_, _diagonal_ or _box_.

Try writing the rule yourself. "A box has four lines that meet at corners" is easy to say. But turning it into code that works for every size, position and smudge of a box is hard, and for "cat" it is hopeless.

</div>

<div class="tf-step" data-step="classes" data-title="Learn from examples instead." markdown="1">
**The data-driven approach.** Instead of writing rules, collect many images that people have already labelled, and let an algorithm learn from them.

Every classifier in this series has the same two parts:

1. **train**(images, labels) → a model,
2. **predict**(model, image) → a label.

Here are the 64 training images, grouped by class. The coloured tab on top of each is its label.

</div>

<div class="tf-step" data-step="compare" data-title="Compare two images, pixel by pixel." markdown="1">
**The simplest model: remember everything.** Training just stores all 64 images. To predict, find the stored image most like the new one and copy its label.

To say what "most like" means, we need a distance. The simplest is the **L1 distance**: subtract the two images pixel by pixel, drop the signs, and add up all 64 differences.

$$d_1(I_1, I_2) = \sum_{p} \lvert I_1^p - I_2^p \rvert$$

Scroll to watch the sum build up. Identical images are 0 apart. The training image shown is the one closest to our test image: 11.93 away.

</div>

<div class="tf-step" data-step="nearest" data-title="Find the nearest one." markdown="1">
**Now measure the distance to all 64 training images** and sort them, nearest first. Each caption is the distance.

The nearest image, ringed, is a _vertical_ bar, so the **nearest neighbour** classifier says "vertical". It's wrong: the test image is a box.

What happened? The vertical bar happens to sit right on the box's left edge. The nearest box is only a hair further away, at 12.12, but "nearest" means only one image gets a say.

Use ◀ ▶ above the figure to try other test images. Most get the right answer; boxes often don't.

</div>

<div class="tf-step" data-step="knn" data-title="Let the k nearest vote." markdown="1">
**Ask more than one neighbour.** The **k-nearest neighbours** (k-NN) classifier takes the k nearest training images and lets them vote.

With k = 3 the vote is 2 box, 1 vertical, and the answer is right. A single unlucky neighbour can no longer decide alone.

Move the slider: k = 5 and k = 7 also say box. With large k the vote drifts towards whichever class is simply most common nearby.

You can also switch to the **L2 distance**, the straight-line distance $$\sqrt{\sum_p (I_1^p - I_2^p)^2}$$. It squares the differences, so it punishes one big difference more than many small ones. On this test image it gives the same neighbours in nearly the same order.

</div>

<div class="tf-step" data-step="validate" data-title="Choose k on data you didn't train on." markdown="1">
**k and the distance are hyperparameters**: choices we make, not things the algorithm learns. How do we pick them?

Not by trying them on the test images. If we pick whichever setting scores best on the test set, the test score stops being an honest estimate of how we'll do on new images. The test set gets used **once**, at the very end.

Instead, we set aside a **validation set**: 32 more labelled images, kept out of training. The chart tries every k from 1 to 15 on them.

k = 3 does best, with 23 of 32 (72%) right for both distances. Run once on the 40 test images, it gets 32 right: **80%**. A random guess would get 25%.

</div>

<div class="tf-step" data-step="shift" data-title="Pixel distance is not similarity." markdown="1">
**Now the bad news.** Here is a diagonal stroke from the test set. k-NN gets it right: its nearest neighbour is another diagonal, only 2.64 away.

Now **move it one pixel to the right**. To you it's the same picture. In L1 distance, it is now 11.87 away from its old self, which is further than it is from a _vertical_ bar in the training set (10.85). So it gets called vertical.

Use the slider to try other shifts. Moved over the whole test set, accuracy falls from 80% to 75% after one pixel, and to 57.5% after two.

The trouble isn't k or the distance. **Distances between raw pixels measure the wrong thing**: they compare which pixels are dark, not what shape the dark pixels make.

</div>

  </div>
</section>

## The whole thing in one line

For a test image $$x$$, k-NN finds the $$k$$ training images $$x_{i_1}, \dots, x_{i_k}$$ nearest to it, and predicts the label that appears most often among $$y_{i_1}, \dots, y_{i_k}$$.

It has two odd properties.

**Training is free, and predicting is slow.** Training only stores the data. Predicting compares the test image with every training image. With $$N$$ training images of $$D$$ pixels:

{: .tf-table}
| | work | in our toy | on CIFAR-10 |
| ------- | ----------- | --------------------- | -------------------------------- |
| train | store $$N$$ images | 64 images | 50,000 images |
| predict | $$N \cdot D$$ differences | 64 × 64 = 4,096 | 50,000 × 3,072 ≈ 154 million |

That's backwards from what we want. We can afford to train for a long time, once; we need predictions to be fast, on a phone, thousands of times a second.

**It doesn't work well on real images.** On CIFAR-10, the course notes report 38.6% with L1 and 35.4% with L2. People get about 94%, and convolutional networks about 95%.

## What's still missing

- **Predicting needs the whole training set.** A model should be a small summary of the data, not the data itself.
- **Distances between raw pixels don't measure what an image shows.** Move, darken or partly cover an image and its pixel distance changes a lot, while its meaning doesn't change at all.

Part 2 fixes the first problem with a **linear classifier**: a model that boils the training set down to one template per class, so predicting is one quick calculation. The second problem takes us until part 5, where **convolutional networks** learn features that don't care where a shape sits.

## Going deeper

### What k does to the boundaries {#knn-boundaries}

On images it's hard to see the decision regions, because they live in 64 dimensions. On points in the plane we can paint them. Below, each spot is coloured by the class k-NN would give a new point placed there. Three points sit deliberately in the "wrong" blob.

<figure class="tf-figure" data-cv-figure="knn2d">
  <noscript><p class="tf-noscript">This figure needs JavaScript. With k = 1, every training point owns a patch of the plane, even the three that sit in the wrong blob; larger k smooths those islands away.</p></noscript>
</figure>

With k = 1 every training point owns its own patch, so each odd point carves an island out of its neighbours' region. The boundary follows the noise. As k grows, the islands vanish and the boundaries smooth out.

That is the classic trade-off. Small k: the model fits the training data exactly, noise included (**overfitting**). Large k: it smooths away real detail (**underfitting**). The caption scores each setting by **leave-one-out** accuracy: each point is classified by all the others, an extreme form of the cross-validation below.

### L1 or L2?

Both are reasonable; they differ in which images they call close.

- **L2** squares each difference, so one large difference counts for more than several small ones adding up to the same total. It prefers images that differ a little everywhere.
- **L1** treats all differences alike. It's also tied to the axes: rotate the coordinate system and L1 distances change, while L2 distances don't. For pixels, which have fixed meaning, that hardly matters.

In the 2-D figure above, L1's regions have borders at 45° and straight angles; L2's are straight lines at any angle. On our images, both pick k = 3 and both score 80% on the test set. On CIFAR-10, L1 does slightly better.

### Cross-validation

With only 64 training images, a validation set of 32 is expensive: it's data we didn't train on. **k-fold cross-validation** reuses it:

1. Split the training data into, say, 5 equal folds.
2. For each fold: train on the other 4, measure accuracy on this one.
3. Average the 5 accuracies, and pick the hyperparameters with the best average.

Every image gets used for both training and validation, just never at the same time. It costs 5 times as much computation, so it's mostly used when data is scarce. With large datasets and slow models, people use a single validation split, as we did.

### The curse of dimensionality

k-NN works when every test point has close training neighbours. That needs the training points to fill the space densely, and the amount of data needed grows exponentially with the number of dimensions.

Divide each axis into 4 bins. In 1 dimension you need 4 points to put one in every bin; in 2 dimensions, 16; in 64 dimensions (our images), $$4^{64} \approx 3.4 \times 10^{38}$$. A 32 × 32 × 3 image has 3,072 dimensions.

So nearest-neighbour methods only work in high dimensions if the data isn't really spread across all of them. Images aren't: natural images fill a tiny part of the space of all pixel grids. But "nearby in that part" is still badly measured by raw pixel distance, as the shift step showed.

### Nearest neighbours are not dead

k-NN on raw pixels is a poor classifier, but k-NN itself is everywhere in modern vision. The trick is to measure distance between **features** a network computed, not pixels. Image search, face recognition and "find similar products" all embed images with a deep network, then look up nearest neighbours among millions of stored embeddings.

To make that fast, they use **approximate** nearest-neighbour search, which finds _almost_ the nearest points while skipping most of the comparisons, as in the [FAISS library](https://arxiv.org/abs/1702.08734). Part 5's convolutional networks are where such features come from.

## Further reading

- CS231n notes, [_Image Classification_](https://cs231n.github.io/classification/): the data-driven approach, k-NN and validation on CIFAR-10.
- T. Cover and P. Hart, [_Nearest neighbor pattern classification_](https://doi.org/10.1109/TIT.1967.1053964) (1967): the classic analysis of the 1-NN rule.
- A. Krizhevsky, [_Learning Multiple Layers of Features from Tiny Images_](https://www.cs.toronto.edu/~kriz/learning-features-2009-TR.pdf) (2009): the report that introduced CIFAR-10.
- J. Johnson, M. Douze and H. Jégou, [_Billion-scale similarity search with GPUs_](https://arxiv.org/abs/1702.08734) (2017): nearest neighbours at scale, the FAISS library.

{% include cv-series.liquid %}
