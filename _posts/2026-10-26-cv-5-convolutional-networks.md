---
layout: post
title: "deep learning for computer vision, part 5: convolutional networks"
date: 2026-10-26 00:00:00 +0700
description: a scroll-through look at convolution, a small filter sliding over an image, with padding, stride, ReLU and max pooling, and a 60-parameter convnet that shrugs off the shifts that broke parts 1 and 2
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
  - /assets/js/transformer/tf-view.js
  - /assets/js/clustering/cl-view.js
  - /assets/js/cv/cv-view.js
  - /assets/js/cv/cv-scrolly.js
  - /assets/js/cv/part5.js
---

{% include cv-series.liquid %}

[Part 4]({% post_url 2026-10-26-cv-4-backprop-neural-networks %}) trained a neural network on 2 numbers. Images have far more. A fully connected layer gives each hidden unit one weight per input: 64 for our 8 × 8 images, but 120,000 for a 200 × 200 colour photo, **per unit**.

Worse, those weights don't know anything about images. They don't know that neighbouring pixels belong together, or that a stroke on the left is the same stroke on the right. [Part 1]({% post_url 2026-10-26-cv-1-image-classification %}) showed what that costs: shift a test image one pixel and nearest neighbours start getting it wrong.

**Convolutional networks** build both facts into the layer itself. This part follows CS231n's notes on [convolutional networks](https://cs231n.github.io/convolutional-networks/), using the same four kinds of 8 × 8 images as parts 1 and 2.

## A filter that slides

<section class="tf-scrolly" data-cv-scene="part5">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="filter" data-title="A small filter." markdown="1">
**A filter is a tiny grid of weights**, here 3 × 3. This one has a column of +2 between two columns of −1. Laid over a 3 × 3 patch of the image, it multiplies each pixel by its weight and adds them up.

On a bright vertical stroke the middle column scores high and the sides score nothing, so the sum is large. On a blank patch it's about 0. Where the stroke is to one side, the −1s win and the sum is negative.

The ringed cell on the right is where this filter responds most strongly: on the bar. Use the arrows above to try other test images, and the menu below to try other filters.

</div>

<div class="tf-step" data-step="slide" data-title="Slide it everywhere." markdown="1">
**Convolution is that one sum, at every position.** Keep scrolling to slide the window across the image, one pixel at a time. Each position gives one number of the output.

The output is a **feature map**: an image of where the filter found what it looks for. Red where it matched, blue where the opposite pattern was.

The key idea is that **every position uses the same 9 weights**. A fully connected layer would need 64 weights for each output; this needs 9 for all of them. That's **weight sharing**. And each output looks only at its own 3 × 3 neighbourhood, its **receptive field**.

The dashed ring around the image is **zero padding**: one border of zeros, so the window can be centred on the edge pixels too, and the output stays 8 × 8.

</div>

<div class="tf-step" data-step="maps" data-title="Several filters, several maps." markdown="1">
**A layer has many filters**, each producing its own map. Here are four hand-made ones: vertical, horizontal, diagonal and a corner. Each map has been passed through **ReLU**, as in part 4, so only the positive responses remain.

Stacked together, the maps are the layer's output: a block 8 × 8 × 4, which the next layer reads as an image with 4 channels. A real network's first layer has dozens of filters, each spanning all 3 colour channels: a 3 × 3 filter on a colour image has 3 × 3 × 3 = 27 weights.

Look at the maps for this vertical bar. The vertical map traces the bar, and the horizontal map lights up only at its two ends. But the **corner** map is the brightest of all. Its weights add up to +6, where the other filters' add up to 0, so it fires on any bright patch, not just on corners.

Hand-made filters are crude like that. Comparing their raw responses doesn't classify anything: try the other test images, and the corner map wins on most of them. A network learns its filters, and learns how to weigh them, as we'll see below.

</div>

<div class="tf-step" data-step="size" data-title="Padding and stride." markdown="1">
**Two settings change the output's size.** **Padding** $$P$$ adds a border of zeros. **Stride** $$S$$ is how far the window moves each time. For an input $$W$$ pixels wide and a filter $$F$$ wide, the output is

$$\frac{W - F + 2P}{S} + 1$$

pixels wide. Try the menus below:

- padding 1, stride 1: $$(8 - 3 + 2)/1 + 1 = 8$$, the same size as the input;
- padding 0, stride 1: $$(8 - 3)/1 + 1 = 6$$, so the map shrinks by 2 every layer;
- padding 1, stride 2: $$(8 - 3 + 2)/2 + 1 = 4.5$$, which doesn't divide evenly. Libraries round down to 4, quietly ignoring the last row and column of the padding.

Stride 2 halves the size: a cheap way to shrink the maps, which some networks use instead of pooling.

</div>

<div class="tf-step" data-step="pool" data-title="Pooling: keep the strongest." markdown="1">
**Max pooling** shrinks a map by keeping only the largest value in each 2 × 2 block. Keep scrolling to watch it.

The 8 × 8 map becomes 4 × 4: a quarter of the numbers, with the strong responses kept. Pooling has no weights at all.

Shrinking matters because each later layer's 3 × 3 filter then covers a bigger part of the original image. Stack enough conv and pool layers and the last ones see the whole picture.

</div>

<div class="tf-step" data-step="shift" data-title="Move the image, move the map." markdown="1">
**Back to part 1's problem.** Move the image right with the slider, and look at the feature map: it moves right by the same amount, and the peak keeps its value. Because the filter is the same everywhere, a shifted input gives a shifted output (except at the edges). That's **translation equivariance**.

Our tiny network, below, takes the **largest value of each whole map**. That number doesn't care where the peak is.

So on the whole test set moved 2 pixels right, k-NN from part 1 falls to 57.5% and the linear classifier from part 2 to 37.5%. The convnet still gets 100%. At 3 pixels it drops to 95%, as some strokes start falling off the edge.

</div>

<div class="tf-step" data-step="train" data-title="Let it learn the filters." markdown="1">
**We don't hand-make filters in practice: they're learned.** The network here is as small as a convnet gets:

1. 4 filters of 3 × 3, with padding 1, and ReLU;
2. the largest value of each map (a **global max pool**), giving 4 numbers;
3. a linear classifier from those 4 numbers to 4 class scores.

It's trained exactly like part 4's network: softmax loss, backpropagation, Adam. During the backward pass, each max routes its gradient to the one position that won (part 4's max gate), and from there into the 9 filter weights.

After 400 steps it gets all 40 test images right. The learned filters don't look like the hand-made ones, and don't need to: they only have to separate these four classes. Use the arrows to check each test image.

</div>

<div class="tf-step" data-step="params" data-title="Fewer weights, better results." markdown="1">
**Compare it to part 2's linear classifier**, top. That model needs a full 8 × 8 template per class: 260 parameters, and 67.5% of the test images right.

The convnet, bottom, has 60 parameters: 36 filter weights, 4 filter biases, and a 4 × 4 linear layer with its 4 biases. It gets 100%.

Fewer parameters and better results, because the layer's design matches what images are like: **local** patterns that can appear **anywhere**. That built-in assumption is called an **inductive bias**.

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

Our network has one conv layer and four filters, for four kinds of 8 × 8 strokes. Real photos need far more: AlexNet in 2012 had 5 conv layers and 60 million parameters, and newer networks go hundreds of layers deep.

Stacking many layers raises its own problems: gradients that vanish on the way back, and networks that train worse as they get deeper. Part 6 walks through the architectures that solved them, from AlexNet and VGG to ResNet's skip connections.

## Going deeper

### What the filters learn

On real photos, the first layer's filters learn edges at various angles, and blobs of colour, much like the hand-made ones here. [Zeiler and Fergus (2014)](https://arxiv.org/abs/1311.2901) visualised deeper layers: the second responds to corners and textures, later ones to parts such as eyes and wheels, and the last ones to whole objects. Each layer combines the patterns of the layer below over a larger receptive field.

### Receptive fields grow

One 3 × 3 conv sees 3 × 3 pixels. Two stacked see 5 × 5, three see 7 × 7. Three 3 × 3 layers cover the same area as one 7 × 7 layer, with fewer weights ($$3 \times 9 C^2 = 27C^2$$ against $$49C^2$$) and two extra ReLUs in between. That's the argument behind VGG's all-3 × 3 design in part 6.

### Equivariance, invariance, and their limits

A convolution is **equivariant** to shifts: shift the input, and the output shifts the same way. Pooling, especially global pooling, turns that into **invariance**: shift the input, and the output doesn't change. Neither holds exactly in practice. Padding treats the edges differently, and a stride or pool of 2 means a one-pixel shift can change which values get kept. [Zhang (2019)](https://arxiv.org/abs/1904.11486) showed that real convnets are surprisingly sensitive to small shifts for this reason, and fixed much of it by blurring before each down-sampling.

Convolutions are not equivariant to rotation or scale. Networks learn those from data, usually helped by **data augmentation**: training on randomly flipped, cropped and rescaled copies of the images.

### Convolution or cross-correlation?

Strictly, the operation here is a **cross-correlation**. A mathematical convolution flips the filter first. Deep-learning libraries skip the flip and still call it convolution; since the filters are learned, it makes no difference.

## Further reading

- CS231n notes, [_Convolutional Neural Networks_](https://cs231n.github.io/convolutional-networks/): the layer sizes, the output-size formula and the parameter counts.
- Y. LeCun, L. Bottou, Y. Bengio and P. Haffner, [_Gradient-based learning applied to document recognition_](http://yann.lecun.com/exdb/publis/pdf/lecun-01a.pdf) (1998): LeNet-5, the convnet that read cheques.
- M. Zeiler and R. Fergus, [_Visualizing and Understanding Convolutional Networks_](https://arxiv.org/abs/1311.2901) (2014).
- V. Dumoulin and F. Visin, [_A guide to convolution arithmetic for deep learning_](https://arxiv.org/abs/1603.07285) (2016): pictures of every combination of padding and stride.

{% include cv-series.liquid %}
