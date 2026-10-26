---
layout: post
title: "deep learning for computer vision, part 6: visualising and understanding"
date: 2026-10-26 00:00:00 +0700
description: a scroll-through look inside a trained convnet, with class activation maps, occlusion and gradient maps, a sanity check with random weights, its mistakes, edited photos, and a nudge of 2/255 per pixel that fools it
tags: ai computer-vision deep-learning interactive
categories: explainer
series: deep-learning-for-computer-vision
part: 6
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
  - /assets/js/cv/part6.js
---

{% include cv-series.liquid %}

[Part 5]({% post_url 2026-10-26-cv-5-convolutional-networks %}) trained a convnet and measured how often it was right. That doesn't tell us **why** it was right: which parts of the photo it used, or whether it learned what we hoped it would.

This part opens a trained network up, following CS231n's lecture on [visualising and understanding](https://cs231n.github.io/understanding-cnn/) convnets. The pictures it produces are often called **attention maps**, or more precisely **attribution** or **saliency maps**: for each part of the photo, how much it counted towards the answer. (A network that _attends_, with a layer that decides where to look, comes in part 9 with vision transformers.)

Part 5's network is too weak to be worth inspecting: it gets 65% of the test photos right, and covering a patch at the border of a photo costs it about as much as covering one in the middle (on average, 0.029 off the probability of the right class, against 0.027). So we train a bigger one on more photos.

## Inside a trained network

<section class="tf-scrolly" data-cv-scene="part6">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="look" data-title="What it sees, and what it says." markdown="1">
**The network here is part 5's, made deeper and trained on more photos:**

1. 16 filters of 3 × 3 × 3, ReLU, a 2 × 2 max pool: 16 × 16 × 16;
2. 32 filters of 3 × 3 × 16, ReLU, a 2 × 2 max pool: 8 × 8 × 32;
3. 64 filters of 3 × 3 × 32, ReLU: 8 × 8 × 64;
4. the **average** of each of those 64 maps (a **global average pool**), and a linear layer to the 4 scores.

That's 23,844 weights. It was trained offline on 19,920 CIFAR-10 photos of the same four classes, every training photo except the 80 validation ones, for 40 passes. Each photo was flipped half the time and moved by up to 4 pixels.

It gets 92 of our 100 test photos right, and 89.8% of all 4,000 CIFAR-10 test photos of these classes. The pictures show one map from each layer: the first layer's maps still look like the photo, and the last layer's are coarse 8 × 8 grids.

</div>

<div class="tf-step" data-step="maps" data-title="The last layer's 64 maps." markdown="1">
**The scores come from the last layer's 64 maps.** Each map is averaged to a single number, and each class's score is a weighted sum of those 64 averages, plus a bias:

$$s_j = b_j + \sum_k w_{jk} \cdot \operatorname{avg}(A_k)$$

The pictures are the 12 maps with the biggest effect on the class picked in the menu, each with its **contribution** $$w_{jk} \cdot \operatorname{avg}(A_k)$$ under it. Positive ones push the score up, negative ones down.

A single map is hard to read on its own. Together, though, they hold all the evidence the network has.

</div>

<div class="tf-step" data-step="cam" data-title="Weight them and add them up." markdown="1">
**Swap the order: weight the maps first, average after.** Since averaging is linear, it gives the same score:

$$s_j = b_j + \operatorname{avg}\Big(\sum_k w_{jk} A_k\Big)$$

The weighted sum inside the brackets is an 8 × 8 map, the **class activation map** or CAM ([Zhou et al., 2016](https://arxiv.org/abs/1512.04150)). Each cell says how much that part of the photo adds to the class's score: red for evidence for, blue for evidence against. Its average, plus the bias, is the score exactly.

Here it is for all four classes, stretched over the photo. Look at where the "plane" evidence sits. For this plane, it's mostly on the white sky around the plane, not on the plane itself.

That's not a one-off. We measured, for each 4 × 4 block of a photo, how plain it is (how little its pixels vary). On 82% of the 1,000 plane test photos, the plane CAM is higher on the plainer blocks. The car CAM is the opposite: higher on the busier blocks, on 93% of the car photos.

</div>

<div class="tf-step" data-step="occlude" data-title="Cover part of the photo." markdown="1">
**A CAM needs a network built this way. Occlusion works on any.** Cover part of the photo with a grey patch, run the network again, and see how far the probability of the right class falls ([Zeiler and Fergus, 2014](https://arxiv.org/abs/1311.2901)). Keep scrolling to slide an 8 × 8 patch across the photo, 4 pixels at a time: 49 positions, 49 more runs of the network.

Red cells mark where covering the photo hurt. For this plane, no single patch matters much: the worst drops it from 100% to 89%. The evidence is spread out.

Other photos are more fragile. In test photo 4, a ship, covering a patch of the hull turns the answer into "car", at 96%.

The patch's colour matters too. It's the training photos' average colour, which is zero to the network, but zero isn't "nothing" to it: a photo that's all that grey comes out 62% ship and 28% plane.

</div>

<div class="tf-step" data-step="saliency" data-title="Ask the gradient." markdown="1">
**A third way: ask how the score would change if each pixel changed a little.** That's the gradient of the score with respect to the pixels, found with one backward pass ([Simonyan et al., 2014](https://arxiv.org/abs/1312.6034)), exactly as in part 4, but stopping at the photo instead of the weights. The middle picture shows its size at each pixel.

It's sharp, but noisy, and it says less about the class than you'd hope. Pick another class in the menu: the gradient map hardly changes. Across our 100 test photos, the gradient maps for the photo's own class and for another class have a rank correlation of 0.43. The two CAMs have −0.23: evidence for one class tends to be evidence against another.

A gradient is a **local** answer: what tiny changes to each pixel would do. It doesn't say what the network relied on.

</div>

<div class="tf-step" data-step="sanity" data-title="Check the check." markdown="1">
**Do these maps show the network, or just the photo?** [Adebayo et al. (2018)](https://arxiv.org/abs/1810.03292) proposed a simple test: compute the same map for a network with **random weights**. If it looks the same, the map shows what's in the photo, such as its edges, not what was learned.

The bottom row is the same network with random weights. For this plane, the random CAM still has a rough plane-against-sky shape (rank correlation 0.48 with the trained one): random filters respond to bright, flat regions too.

Averaged over all 100 test photos, though, the trained and random maps have little in common: a rank correlation of 0.16 for the gradient maps, and 0.05 for the CAMs. Both depend on what the network learned, so both pass. Several popular methods don't; see "Going deeper".

</div>

<div class="tf-step" data-step="mistakes" data-title="Where it goes wrong." markdown="1">
**The confusion matrix counts, for each true class, what the network said.** On our 100 test photos, it makes 8 mistakes; 5 of them are planes.

Planes are its weakest class on all 4,000 test photos too: 84.5% right, against 95.9% for frogs. The biggest confusions are between the two classes with large, plain backgrounds: 84 planes called ships, and 82 ships called planes. A plane over the sea and a ship under a pale sky share most of their pixels.

The heat on each mistake is the CAM for the **wrong** answer: what it took as evidence for that class.

</div>

<div class="tf-step" data-step="edits" data-title="Edit the photo, watch the answer." markdown="1">
**The maps suggest things. Changing the photos tests them.** Each edit in the menu is applied here to the current photo, and was measured on all 4,000 test photos:

{: .tf-table}
| edit | right, of 4,000 |
| -------------------------------- | --------------- |
| unchanged | 89.8% |
| centre hidden (16 × 16 of 32 × 32) | 70.6% |
| only the centre kept | 44.3% |
| greyscale | 84.3% |
| red and blue swapped | 62.8% |
| moved 8 px right | 87.1% |

With the centre hidden, where the object usually is, it still gets 70.6% right, and 78.7% of ships: much of what it uses is around the object. Keep only the centre, with grey all round, and it calls 77% of all the photos "plane". To this network, a plain surround means a plane.

Colour matters most for frogs: swap red and blue, and only 33.7% of frogs are still frogs. Moving the photo costs little, because it was trained on moved photos; part 5's network fell to 46% at 8 pixels.

</div>

<div class="tf-step" data-step="fool" data-title="Nudge every pixel." markdown="1">
**The gradient also says how to make the network wrong.** Move every pixel's colours a tiny step, $$\epsilon$$, in the direction that increases the loss:

$$x' = x + \epsilon \cdot \operatorname{sign}\big(\nabla_x L\big)$$

This is the **fast gradient sign method** ([Goodfellow et al., 2015](https://arxiv.org/abs/1412.6572)). At $$\epsilon = 2/255$$, the nudged photo looks the same as the original, but on all 4,000 test photos accuracy falls from 89.8% to 66.1%. At 8/255 it's 20.1%: worse than guessing.

This plane holds: it stays a plane even at 8/255. Of the 92 test photos the network gets right, 25 change their answer at 2/255 or less, and 75 at 8/255 or less. Try test photo 4, the ship: at 2/255, it's a car.

These are **adversarial examples** ([Szegedy et al., 2014](https://arxiv.org/abs/1312.6199)). The change is chosen with the gradient, so it's tiny on every pixel, but every pixel pushes the same way.

</div>

  </div>
</section>

## What we learned about this network

The network is right 89.8% of the time, but not always for reasons we'd choose:

- **It reads the background.** The CAMs put much of the evidence for "plane" on the sky, and the edits agree: hide the object and it's still right 70.6% of the time; surround any object with plain grey and it's usually a plane.
- **Its biggest confusion is plane against ship**, the two classes with large plain backgrounds.
- **Colour is a big clue for frogs**, and much less for the others.
- **It tolerates moves and flips** it was trained on, and **not small, chosen changes** it wasn't.

None of this is a bug in the code. The network learned what the training photos rewarded. In our training photos, 43% of the border of a plane photo is almost flat colour, against 33% for ships, 18% for cars and 12% for frogs. A network that has learned a shortcut like this can score well on a test set that shares it, and fail in the world.

Every map here is a **hypothesis** about the network, not proof. The edits and the sanity check are what turn a picture into evidence.

## Going deeper

### Grad-CAM, for any convnet

The CAM needs a global average pool straight before the last linear layer. [Grad-CAM (Selvaraju et al., 2017)](https://arxiv.org/abs/1610.02391) removes the restriction: it weights each map by the average gradient of the score with respect to that map. For a network like ours, that average is $$w_{jk}/64$$, so Grad-CAM gives the CAM back, scaled down, with its negative parts set to zero. It's one of the methods that passes the sanity check.

### Smoother gradients

Raw gradients are noisy because ReLU networks are piecewise linear: the gradient jumps as each unit switches on or off. **SmoothGrad** ([Smilkov et al., 2017](https://arxiv.org/abs/1706.03825)) averages the gradient over many noisy copies of the photo. **Integrated gradients** ([Sundararajan et al., 2017](https://arxiv.org/abs/1703.01365)) adds up gradients along a path from a plain baseline image to the photo, so the contributions add up to the change in score. Both need choices: how much noise, which baseline. Grey, as we saw, isn't neutral.

Some methods, such as guided backpropagation, make sharper pictures, but [Adebayo et al.](https://arxiv.org/abs/1810.03292) found they barely change when the weights are randomised: they show the photo's edges, not the model.

### What a unit wants to see

Instead of asking about one photo, we can ask about one unit: start from noise and follow the gradient to make a picture that excites it as much as possible ([Simonyan et al., 2014](https://arxiv.org/abs/1312.6034); [Olah et al., 2017](https://distill.pub/2017/feature-visualization/)). Without strong regularisation, the result is itself an adversarial pattern. With it, large networks give recognisable textures, parts and objects, layer by layer. Another way is to show the training photos that excite a unit most.

### Shortcuts

The plane-and-sky shortcut has well-known relatives. One classifier told wolves from huskies by the snow in the background ([Ribeiro et al., 2016](https://arxiv.org/abs/1602.04938)). ImageNet networks rely more on texture than on shape ([Geirhos et al., 2019](https://arxiv.org/abs/1811.12231)). [Geirhos et al. (2020)](https://arxiv.org/abs/2004.07780) collect many examples under the name **shortcut learning**.

### Defending against adversarial examples

The most reliable defence is **adversarial training**: generate adversarial examples while training, and train on them too ([Madry et al., 2018](https://arxiv.org/abs/1706.06083)). It costs accuracy on clean photos and many times the compute. [Goodfellow et al.](https://arxiv.org/abs/1412.6572) argued that adversarial examples come from networks being too _linear_: thousands of tiny changes, each aligned with a weight, add up to a large change in the score. That's why the sign of the gradient, rather than the gradient itself, works so well.

## Further reading

- CS231n notes, [_Visualizing what ConvNets learn_](https://cs231n.github.io/understanding-cnn/).
- B. Zhou, A. Khosla, A. Lapedriza, A. Oliva and A. Torralba, [_Learning Deep Features for Discriminative Localization_](https://arxiv.org/abs/1512.04150) (2016): the class activation map.
- M. Zeiler and R. Fergus, [_Visualizing and Understanding Convolutional Networks_](https://arxiv.org/abs/1311.2901) (2014): occlusion, and pictures of what each layer responds to.
- K. Simonyan, A. Vedaldi and A. Zisserman, [_Deep Inside Convolutional Networks_](https://arxiv.org/abs/1312.6034) (2014): gradient saliency maps.
- J. Adebayo et al., [_Sanity Checks for Saliency Maps_](https://arxiv.org/abs/1810.03292) (2018).
- I. Goodfellow, J. Shlens and C. Szegedy, [_Explaining and Harnessing Adversarial Examples_](https://arxiv.org/abs/1412.6572) (2015).
- A. Krizhevsky, [_Learning Multiple Layers of Features from Tiny Images_](https://www.cs.toronto.edu/~kriz/learning-features-2009-TR.pdf) (2009): the CIFAR-10 dataset our photos come from.

{% include cv-series.liquid %}
