---
layout: post
title: "deep learning for computer vision, part 5: convolutional networks"
date: 2026-10-26 00:00:00 +0700
description: a scroll-through look at convolution, a small filter sliding over a photo, with padding, stride, ReLU and max pooling, and a 1,460-parameter convnet set against part 2's 12,292-parameter linear classifier
tags: ai computer-vision deep-learning interactive
categories: explainer
series: deep-learning-for-computer-vision
part: 5
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
  - /assets/js/cv/part5.js
---

{% include cv-series.liquid %}

[Part 4]({% post_url 2026-10-26-cv-4-backprop-neural-networks %}) trained a neural network on 2 numbers. Images have far more. A fully connected layer gives each hidden unit one weight per input: 3,072 for our 32 × 32 colour photos, and 120,000 for a 200 × 200 one, **per unit**.

Worse, those weights don't know anything about images. They don't know that neighbouring pixels belong together, or that an edge on the left is the same kind of thing as an edge on the right. [Part 2]({% post_url 2026-10-26-cv-2-linear-classifiers %})'s linear classifier showed what that costs: it had to learn one whole-photo template per class, a blur of every plane it had seen.

**Convolutional networks** build both facts into the layer itself. This part follows CS231n's notes on [convolutional networks](https://cs231n.github.io/convolutional-networks/), using the same CIFAR-10 photos of planes, cars, frogs and ships as parts 1 and 2.

## A filter that slides

<section class="tf-scrolly" data-cv-scene="part5">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="filter" data-title="A small filter." markdown="1">
**A filter is a tiny grid of weights**, here 3 × 3. This one has a column of −1 on the left, 0 in the middle and +1 on the right. Laid over a 3 × 3 patch of the image, it multiplies each pixel by its weight and adds them up.

We use the photo's brightness, minus its average brightness, so each pixel is a number around 0. Where the patch is the same all over, the −1s and +1s cancel and the sum is about 0. Where it gets brighter from left to right, the +1s win and the sum is positive; where it gets darker, negative. So this filter finds **vertical edges**.

The ringed cell on the right is where it responds most strongly in this photo: 1.74, beside the police car's front wheel, where the dark tyre gives way to the light body. The building's columns light up too. Use the arrows above to try other test photos, and the menu below to try other filters.

</div>

<div class="tf-step" data-step="slide" data-title="Slide it everywhere." markdown="1">
**Convolution is that one sum, at every position.** Keep scrolling to slide the window across the photo, one row at a time. Each position gives one number of the output.

The output is a **feature map**: an image of where the filter found what it looks for. Red where it matched, blue where the opposite pattern was.

The key idea is that **every position uses the same 9 weights**. A fully connected layer would need 1,024 weights for each output; this needs 9 for all of them. That's **weight sharing**. And each output looks only at its own 3 × 3 neighbourhood, its **receptive field**.

The dashed ring around the photo is **zero padding**: one border of zeros, so the window can be centred on the edge pixels too, and the output stays 32 × 32. Because we subtracted the average brightness first, a zero is an average grey. With raw brightness from 0 to 1, the padding would be black, and every bright photo would get a strong false edge all the way round.

</div>

<div class="tf-step" data-step="maps" data-title="Several filters, several maps." markdown="1">
**A layer has many filters**, each producing its own map. Here are four hand-made edge filters: vertical, horizontal and the two diagonals. Each map has been passed through **ReLU**, as in part 4, so only the positive responses remain.

Stacked together, the maps are the layer's output: a block 32 × 32 × 4, which the next layer reads as an image with 4 channels. A real network's first layer has dozens of filters, each spanning all 3 colour channels: a 3 × 3 filter on a colour photo has 3 × 3 × 3 = 27 weights.

Each map shows a different part of the picture. The vertical map picks out the building's columns and the edges of the wheels; the horizontal map, the outline of the roof and the bottom of the body; the two diagonal maps, the two slopes of the roof.

None of this classifies anything yet. A network learns its own filters, and learns what to make of their maps, as we'll see below.

</div>

<div class="tf-step" data-step="size" data-title="Padding and stride." markdown="1">
**Two settings change the output's size.** **Padding** $$P$$ adds a border of zeros. **Stride** $$S$$ is how far the window moves each time. For an input $$W$$ pixels wide and a filter $$F$$ wide, the output is

$$\frac{W - F + 2P}{S} + 1$$

pixels wide. Try the menus below:

- padding 1, stride 1: $$(32 - 3 + 2)/1 + 1 = 32$$, the same size as the input;
- padding 0, stride 1: $$(32 - 3)/1 + 1 = 30$$, so the map shrinks by 2 every layer;
- padding 1, stride 2: $$(32 - 3 + 2)/2 + 1 = 16.5$$, which doesn't divide evenly. Libraries round down to 16, quietly ignoring the last row and column of the padding.

Stride 2 halves the size: a cheap way to shrink the maps, which some networks use instead of pooling.

</div>

<div class="tf-step" data-step="pool" data-title="Pooling: keep the strongest." markdown="1">
**Max pooling** shrinks a map by keeping only the largest value in each 2 × 2 block. Keep scrolling to watch it, one row of blocks at a time.

The 32 × 32 map becomes 16 × 16: a quarter of the numbers, with the strong responses kept. Pooling has no weights at all.

Shrinking matters because each later layer's 3 × 3 filter then covers a bigger part of the original photo. Stack enough conv and pool layers and the last ones see the whole picture.

</div>

<div class="tf-step" data-step="shift" data-title="Move the image, move the map." markdown="1">
**Move the photo right with the slider, and look at the feature map**: it moves right by the same amount. The ringed response keeps its exact value, just a few columns over. Because the filter is the same everywhere, a shifted input gives a shifted output. That's **translation equivariance**.

Except at the edges. The black strip the move leaves behind is itself a strong edge, and the map lights up along it.

That matters more than you might hope. Move all 100 test photos 4 pixels right, and the network below drops from 65% to 52%; part 2's linear classifier drops from 67% to 58%. A convnet _reuses_ what it learned at every position, but nothing makes the whole network ignore a black strip it never saw in training. Real networks learn that from data, as "Going deeper" explains.

</div>

<div class="tf-step" data-step="train" data-title="Let it learn the filters." markdown="1">
**We don't hand-make filters in practice: they're learned.** The network here is small, but it's a real convnet:

1. 8 filters of 3 × 3 × 3 on the colour photo, with padding 1, then ReLU;
2. a 2 × 2 max pool, giving 16 × 16 × 8;
3. 16 filters of 3 × 3 × 8, then ReLU;
4. the largest value of each of those 16 maps (a **global max pool**), giving 16 numbers;
5. a linear classifier from those 16 numbers to 4 class scores.

It's trained exactly like part 4's network: softmax loss, backpropagation, Adam. During the backward pass, each max routes its gradient to the one position that won (part 4's max gate), and from there into the filter weights below it.

Like part 2's classifier, it was trained before you opened the page: 60 passes over the 320 training photos, each photo flipped left to right half the time, which is a free way to get more data (a car facing left is still a car). Its settings were picked on the validation photos, where it gets 74%.

The top row shows its first layer's filters as tiny colour pictures, with their maps on the current photo. Some respond to edges, some to colours. On the test photos it gets 65%: 23 of 25 cars and 20 frogs, but only 8 planes.

</div>

<div class="tf-step" data-step="params" data-title="An eighth of the weights, and about as good." markdown="1">
**Compare it to part 2's linear classifier**, top. That model needs a full 32 × 32 colour template per class: 12,292 parameters, and 67% of the test photos right.

The convnet, bottom, has 1,460 parameters, an eighth as many: 224 in the first layer, 1,168 in the second, and 68 in the linear layer. It gets 65%.

On 100 test photos those two numbers are too close to separate: one photo is one percentage point. On all 4,000 CIFAR-10 test photos of these four classes, the same two models get 59.7% (linear) and 67.5% (convnet). And with more training data the gap grows: trained on 1,000 photos per class instead of 80, the same convnet design reaches 76.9% on those 4,000 photos, and a linear classifier 64.8%.

An eighth of the parameters, about the same accuracy here, and better with more data, because the layer's design matches what photos are like: **local** patterns that can appear **anywhere**. That built-in assumption is called an **inductive bias**.

</div>

  </div>
</section>

## The whole thing in one line

A convolutional layer takes a block of $$H \times W \times C$$ numbers and applies $$K$$ filters, each $$F \times F \times C$$:

$$\text{out}[i, j, k] = b_k + \sum_{a, b, c} w_k[a, b, c] \cdot \text{in}[iS + a - P,\; jS + b - P,\; c]$$

That gives $$K$$ feature maps, each $$\frac{W - F + 2P}{S} + 1$$ wide, with $$K(F^2 C + 1)$$ parameters in total, however big the image is. A **convnet** stacks conv layers with ReLU, shrinks the maps now and then with pooling or stride 2, and ends with a fully connected layer (or a global pool and one) that gives the scores.

{: .tf-table}
| layer | weights | output size from $$W \times W \times C$$ |
| -------------------- | ----------------- | ------------------------------------------------ |
| conv, $$K$$ filters | $$K(F^2C + 1)$$ | $$\frac{W - F + 2P}{S} + 1$$, $$K$$ channels |
| ReLU | none | the same |
| max pool, 2 × 2 | none | $$W/2$$, $$C$$ channels |
| fully connected | one per input, per output | a vector |

## What's still missing

Our network has two conv layers and 24 filters, for four classes of tiny photos. Real photos need far more: AlexNet in 2012 had 5 conv layers and 60 million parameters, and newer networks go hundreds of layers deep.

Stacking many layers raises its own problems: gradients that vanish on the way back, and networks that train worse as they get deeper. Part 6 walks through the architectures that solved them, from AlexNet and VGG to ResNet's skip connections.

## Going deeper

### What the filters learn

On large photos and datasets, the first layer's filters learn edges at various angles, and blobs of colour, much like the hand-made ones here. (Ours, trained on 320 photos, are rougher.) [Zeiler and Fergus (2014)](https://arxiv.org/abs/1311.2901) visualised deeper layers: the second responds to corners and textures, later ones to parts such as eyes and wheels, and the last ones to whole objects. Each layer combines the patterns of the layer below over a larger receptive field.

### Receptive fields grow

One 3 × 3 conv sees 3 × 3 pixels. Two stacked see 5 × 5, three see 7 × 7. Three 3 × 3 layers cover the same area as one 7 × 7 layer, with fewer weights ($$3 \times 9 C^2 = 27C^2$$ against $$49C^2$$) and two extra ReLUs in between. That's the argument behind VGG's all-3 × 3 design in part 6.

### Equivariance, invariance, and their limits

A convolution is **equivariant** to shifts: shift the input, and the output shifts the same way. Pooling, especially global pooling, turns that into **invariance**: shift the input, and the output doesn't change. Neither holds exactly in practice. Padding treats the edges differently, and a stride or pool of 2 means a one-pixel shift can change which values get kept. [Zhang (2019)](https://arxiv.org/abs/1904.11486) showed that real convnets are surprisingly sensitive to small shifts for this reason, and fixed much of it by blurring before each down-sampling.

Convolutions are not equivariant to rotation or scale. Networks learn those from data, usually helped by **data augmentation**: training on randomly flipped, cropped and rescaled copies of the images.

### Convolution or cross-correlation?

Strictly, the operation here is a **cross-correlation**. A mathematical convolution flips the filter first. Deep-learning libraries skip the flip and still call it convolution; since the filters are learned, it makes no difference.

## Further reading

- CS231n notes, [_Convolutional Neural Networks_](https://cs231n.github.io/convolutional-networks/): the layer sizes, the output-size formula and the parameter counts.
- A. Krizhevsky, [_Learning Multiple Layers of Features from Tiny Images_](https://www.cs.toronto.edu/~kriz/learning-features-2009-TR.pdf) (2009): the CIFAR-10 dataset our photos come from.
- Y. LeCun, L. Bottou, Y. Bengio and P. Haffner, [_Gradient-based learning applied to document recognition_](http://yann.lecun.com/exdb/publis/pdf/lecun-01a.pdf) (1998): LeNet-5, the convnet that read cheques.
- M. Zeiler and R. Fergus, [_Visualizing and Understanding Convolutional Networks_](https://arxiv.org/abs/1311.2901) (2014).
- V. Dumoulin and F. Visin, [_A guide to convolution arithmetic for deep learning_](https://arxiv.org/abs/1603.07285) (2016): pictures of every combination of padding and stride.

{% include cv-series.liquid %}
