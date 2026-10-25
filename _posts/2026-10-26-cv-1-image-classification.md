---
layout: post
title: "deep learning for computer vision, part 1: image classification and nearest neighbours"
date: 2026-10-26 00:00:00 +0700
description: a scroll-through walk through the data-driven approach and k-nearest neighbours, on real CIFAR-10 photos of planes, cars, frogs and ships
tags: ai computer-vision deep-learning interactive
categories: explainer
series: deep-learning-for-computer-vision
part: 1
series_title: deep learning for computer vision
series_description: a scroll-through course in deep learning for computer vision that follows Stanford's CS231n, from nearest neighbours to convolutional networks, with every model running live in your browser, on real CIFAR-10 photos and on small problems you can see whole
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
  - /assets/js/cv/cv-photos.js
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

## The photos

CS231n works with [CIFAR-10](https://www.cs.toronto.edu/~kriz/cifar.html): 60,000 colour photos of 32 × 32 pixels, in ten classes (planes, cars, birds, cats, …). This series uses a small slice of it, small enough to download with the page and run in your browser:

- four of the classes: **plane**, **car**, **frog** and **ship**;
- 320 training photos (80 per class), 80 more for validation, and 100 for testing.

Each photo is 32 × 32 pixels, and each pixel has three numbers, for red, green and blue: 3,072 numbers per photo. They're tiny, but you can still tell a frog from a ship, which is the point: whatever a computer does with them, you can check it with your own eyes.

## Classifying by nearest neighbours, step by step

<section class="tf-scrolly" data-cv-scene="part1">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="pixels" data-title="An image is a grid of numbers." markdown="1">
**This is what the computer gets.** You see a jet against a blue sky. The computer sees, for each of the 1,024 pixels, three numbers from 0 to 255: how much red, green and blue light it has. The framed patch, on the jet's wing, is light grey: all three numbers are high, the blue a little lower.

The task of **image classification** is to take those 3,072 numbers and return one label from a fixed list: here _plane_, _car_, _frog_ or _ship_.

Try writing the rule yourself. "A plane has wings and a tail" is easy to say. Turning it into arithmetic on pixel values, for every size, angle, colour and background of plane, is hopeless.

</div>

<div class="tf-step" data-step="classes" data-title="Learn from examples instead." markdown="1">
**The data-driven approach.** Instead of writing rules, collect many photos that people have already labelled, and let an algorithm learn from them.

Every classifier in this series has the same two parts:

1. **train**(images, labels) → a model,
2. **predict**(model, image) → a label.

Here are 12 training photos of each class. The coloured tab on top of each is its label. Notice how much they vary: planes in the sky and on the ground, cars of every colour, frogs on rock, leaves and white paper.

</div>

<div class="tf-step" data-step="compare" data-title="Compare two images, pixel by pixel." markdown="1">
**The simplest model: remember everything.** Training just stores all 320 photos. To predict, find the stored photo most like the new one and copy its label.

To say what "most like" means, we need a distance. The simplest is the **L1 distance**: subtract the two photos number by number, drop the signs, and add up all 3,072 differences (with each number scaled to run from 0 to 1).

$$d_1(I_1, I_2) = \sum_{p} \lvert I_1^p - I_2^p \rvert$$

The third picture shows the differences: dark where the two photos disagree, white where they match. Scroll to watch the sum build up, row by row. Identical photos are 0 apart; these two are 304.7 apart.

</div>

<div class="tf-step" data-step="nearest" data-title="Find the nearest one." markdown="1">
**Now measure the distance to all 320 training photos** and sort them, nearest first. Here are the 24 nearest; each caption is the distance.

The nearest photo, ringed, is a _ship_, so the **nearest neighbour** classifier says "ship". It's wrong.

Look at what the near photos have in common: not wings, but a **pale blue background**. Sky and sea are both pale blue, and the background fills most of the pixels, so to L1 distance a plane in the sky and a boat on the water look alike. The jet itself barely counts.

Use ◀ ▶ above the figure to try other test photos.

</div>

<div class="tf-step" data-step="knn" data-title="Let the k nearest vote." markdown="1">
**Ask more than one neighbour.** The **k-nearest neighbours** (k-NN) classifier takes the k nearest training photos and lets them vote.

With k = 3 the vote is 2 ship, 1 plane: still wrong. Move the slider to k = 5 and the next two neighbours, both planes, tip it to plane, 3 to 2.

You can also switch to the **L2 distance**, the straight-line distance $$\sqrt{\sum_p (I_1^p - I_2^p)^2}$$. It squares the differences, so it punishes one big difference more than many small ones. Here it reorders the neighbours enough that k = 3 already says plane.

</div>

<div class="tf-step" data-step="validate" data-title="Choose k on data you didn't train on." markdown="1">
**k and the distance are hyperparameters**: choices we make, not things the algorithm learns. How do we pick them?

Not by trying them on the test photos. If we pick whichever setting scores best on the test set, the test score stops being an honest estimate of how we'll do on new photos. The test set gets used **once**, at the very end.

Instead, we set aside a **validation set**: 80 more labelled photos, kept out of training. The chart tries every k from 1 to 15 on them (solid L1, dashed L2).

L1 with k = 8 does best: 48 of 80 (60%) right. Run once on the 100 test photos, it gets **53%**. A random guess would get 25%, so k-NN has learned something. But not much: it gets 20 of the 25 frogs and only **2 of the 25 cars**, and it calls 12 of the cars frogs.

</div>

<div class="tf-step" data-step="fooled" data-title="Pixel distance is not similarity." markdown="1">
**Why so bad?** Take this plane, and make three copies: one **moved** 2 pixels right, one a little **darker**, and one with a black square **covering** its middle. Each copy is about 570 away from the original in L1 distance.

To you the first two are obviously the same plane, and the third a damaged one. To the distance they're all equally different, and all three are **further from the original than a photo of a frog**, at 556: the nearest photo in the whole training set.

The trouble isn't k or the choice of L1 or L2. **Distances between raw pixels measure the wrong thing**: they compare colours at fixed positions, not what the photo shows. The CS231n notes make the same point with the same three kinds of edit, using L2.

</div>

  </div>
</section>

## The whole thing in one line

For a test image $$x$$, k-NN finds the $$k$$ training images $$x_{i_1}, \dots, x_{i_k}$$ nearest to it, and predicts the label that appears most often among $$y_{i_1}, \dots, y_{i_k}$$.

It has two odd properties.

**Training is free, and predicting is slow.** Training only stores the data. Predicting compares the test image with every training image. With $$N$$ training images of $$D$$ pixels:

{: .tf-table}
| | work | in our slice | on all of CIFAR-10 |
| ------- | ----------- | --------------------- | -------------------------------- |
| train | store $$N$$ images | 320 photos | 50,000 photos |
| predict | $$N \cdot D$$ differences | 320 × 3,072 ≈ 1 million | 50,000 × 3,072 ≈ 154 million |

That's backwards from what we want. We can afford to train for a long time, once; we need predictions to be fast, on a phone, thousands of times a second.

**It doesn't work well on real images.** We got 53% on four classes. On all ten classes of CIFAR-10, with all 50,000 training photos, the course notes report 38.6% with L1 and 35.4% with L2. People get about 94%, and convolutional networks about 95%.

## What's still missing

- **Predicting needs the whole training set.** A model should be a small summary of the data, not the data itself.
- **Distances between raw pixels don't measure what an image shows.** Move, darken or partly cover an image and its pixel distance changes a lot, while its meaning doesn't change at all.

Part 2 fixes the first problem with a **linear classifier**: a model that boils the training set down to one template per class, so predicting is one quick calculation. The second problem takes us until part 5, where **convolutional networks** learn features that look at shapes, not at where the colours sit.

## Going deeper

### What k does to the boundaries {#knn-boundaries}

On photos it's hard to see the decision regions, because they live in 3,072 dimensions. On points in the plane we can paint them. Below, each spot is coloured by the class k-NN would give a new point placed there. Three points sit deliberately in the "wrong" blob.

<figure class="tf-figure" data-cv-figure="knn2d">
  <noscript><p class="tf-noscript">This figure needs JavaScript. With k = 1, every training point owns a patch of the plane, even the three that sit in the wrong blob; larger k smooths those islands away.</p></noscript>
</figure>

With k = 1 every training point owns its own patch, so each odd point carves an island out of its neighbours' region. The boundary follows the noise. As k grows, the islands vanish and the boundaries smooth out.

That is the classic trade-off. Small k: the model fits the training data exactly, noise included (**overfitting**). Large k: it smooths away real detail (**underfitting**). The caption scores each setting by **leave-one-out** accuracy: each point is classified by all the others, an extreme form of the cross-validation below.

### L1 or L2?

Both are reasonable; they differ in which images they call close.

- **L2** squares each difference, so one large difference counts for more than several small ones adding up to the same total. It prefers images that differ a little everywhere.
- **L1** treats all differences alike. It's also tied to the axes: rotate the coordinate system and L1 distances change, while L2 distances don't. For pixels, which have fixed meaning, that hardly matters.

In the 2-D figure above, L1's regions have borders at 45° and straight angles; L2's are straight lines at any angle. On our photos, L1 picks k = 8 and scores 53% on the test set; L2 picks k = 12 and scores 51%. On CIFAR-10, too, L1 does slightly better.

### Cross-validation

With only 320 training photos, a validation set of 80 is expensive: it's data we didn't train on. **k-fold cross-validation** reuses it:

1. Split the training data into, say, 5 equal folds.
2. For each fold: train on the other 4, measure accuracy on this one.
3. Average the 5 accuracies, and pick the hyperparameters with the best average.

Every image gets used for both training and validation, just never at the same time. It costs 5 times as much computation, so it's mostly used when data is scarce. With large datasets and slow models, people use a single validation split, as we did.

### The curse of dimensionality

k-NN works when every test point has close training neighbours. That needs the training points to fill the space densely, and the amount of data needed grows exponentially with the number of dimensions.

Divide each axis into 4 bins. In 1 dimension you need 4 points to put one in every bin; in 2 dimensions, 16; in 64 dimensions, $$4^{64} \approx 3.4 \times 10^{38}$$. Our 32 × 32 × 3 photos have 3,072 dimensions.

So nearest-neighbour methods only work in high dimensions if the data isn't really spread across all of them. Images aren't: natural images fill a tiny part of the space of all pixel grids. But "nearby in that part" is still badly measured by raw pixel distance, as the moved, darkened and covered planes showed.

### Nearest neighbours are not dead

k-NN on raw pixels is a poor classifier, but k-NN itself is everywhere in modern vision. The trick is to measure distance between **features** a network computed, not pixels. Image search, face recognition and "find similar products" all embed images with a deep network, then look up nearest neighbours among millions of stored embeddings.

To make that fast, they use **approximate** nearest-neighbour search, which finds _almost_ the nearest points while skipping most of the comparisons, as in the [FAISS library](https://arxiv.org/abs/1702.08734). Part 5's convolutional networks are where such features come from.

## Further reading

- CS231n notes, [_Image Classification_](https://cs231n.github.io/classification/): the data-driven approach, k-NN and validation on CIFAR-10.
- T. Cover and P. Hart, [_Nearest neighbor pattern classification_](https://doi.org/10.1109/TIT.1967.1053964) (1967): the classic analysis of the 1-NN rule.
- A. Krizhevsky, [_Learning Multiple Layers of Features from Tiny Images_](https://www.cs.toronto.edu/~kriz/learning-features-2009-TR.pdf) (2009): the report that introduced CIFAR-10.
- J. Johnson, M. Douze and H. Jégou, [_Billion-scale similarity search with GPUs_](https://arxiv.org/abs/1702.08734) (2017): nearest neighbours at scale, the FAISS library.

{% include cv-series.liquid %}
