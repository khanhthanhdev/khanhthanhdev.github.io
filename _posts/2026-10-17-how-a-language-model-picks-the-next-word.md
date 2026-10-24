---
layout: post
title: how a language model picks the next word
date: 2026-10-17 00:00:00
description: an interactive look at tokens, scores, softmax, temperature and sampling, the loop behind every chatbot reply
tags: ai llm interactive
categories: explainer
math: true
toc:
  sidebar: left
css:
  - /assets/css/screen-works.css
  - /assets/css/next-token.css
js:
  - /assets/js/screen-works.js
  - /assets/js/next-token.js
---

You know the word suggestions above your phone keyboard? Type _"see you"_ and it offers _"soon"_, _"tomorrow"_, _"later"_.

A chatbot works the same way, just much better. It never plans a whole answer. It only asks one question, over and over:

> Given the text so far, what should come next?

It picks one piece, adds it to the end, and asks again. That's it. Poems, code and exam answers all come from this one loop.

This post walks through the loop step by step. There are two figures you can play with. Their numbers are a toy I made up by hand, but the steps are the same ones real models use.

## The loop

Every reply is built like this:

1. **Read** the text so far.
2. **Score** every possible next piece. (This is the neural network's job.)
3. **Turn the scores into chances.**
4. **Pick** one piece.
5. **Add** it to the text, and go back to step 1.

<figure class="sw-fig">
  <span class="sw-badge">Schematic</span>
  <h4 class="sw-caption" data-toc-skip>A reply is one small step, repeated.</h4>
  <ol class="sw-pipe sw-build">
    <li class="sw-stage"><span class="sw-num">01</span><span class="sw-label">Read</span><p>The text so far</p></li>
    <li class="sw-stage is-active"><span class="sw-num">02</span><span class="sw-label">Score</span><p>One score per token</p></li>
    <li class="sw-stage"><span class="sw-num">03</span><span class="sw-label">Convert</span><p>Scores become chances</p></li>
    <li class="sw-stage"><span class="sw-num">04</span><span class="sw-label">Pick</span><p>Take one</p></li>
    <li class="sw-stage"><span class="sw-num">05</span><span class="sw-label">Append</span><p>Add it to the text</p></li>
  </ol>
  <div class="sw-return"><span class="sw-label">Back to 01 · read</span></div>
  <p class="sw-note">The network does step 02. Everything after it is simple maths.</p>
</figure>

The loop stops when the model picks a special "the end" piece, or runs out of room.

We won't open up the neural network here. Think of it as a black box that hands us a list of scores.

## The pieces are called tokens

I keep saying "piece" because models don't really use words. They use **tokens**: chunks of text from a fixed list. Common words are one token. Long or rare words get split up.

<figure class="sw-fig">
  <span class="sw-badge">Schematic</span>
  <h4 class="sw-caption" data-toc-skip>A word is one or more tokens.</h4>
  <dl class="sw-rows sw-build">
    <dt class="sw-label">The cat sat</dt>
    <dd><span class="sw-chip">The</span><span class="sw-chip">␣cat</span><span class="sw-chip">␣sat</span></dd>
    <dt class="sw-label">unbelievable</dt>
    <dd><span class="sw-chip">un</span><span class="sw-chip is-key">believ</span><span class="sw-chip">able</span></dd>
    <dt class="sw-label">ChatGPT rocks!</dt>
    <dd><span class="sw-chip">Chat</span><span class="sw-chip">G</span><span class="sw-chip">PT</span><span class="sw-chip">␣rocks</span><span class="sw-chip">!</span></dd>
  </dl>
  <p class="sw-note">␣ marks a leading space</p>
</figure>

The `␣` means "starts with a space". To the model, `␣cat` and `cat` are two different tokens.

The list of all tokens is the **vocabulary**. A real one has around 50,000 to 250,000 tokens. For the rest of this post I'll mostly say "word" anyway, because it's easier to read.

## Step 1: score every word

Take the prompt _"The cat sat on the"_. The model gives **every** word in its vocabulary a score. A higher score means "this fits better". The score has a name, a **logit**, but it's just a number.

Scores are hard to read alone. Is 3.1 good? Only if the others are lower. What we want instead are **chances**: numbers between 0% and 100% that add up to 100%.

### Softmax: scores into chances

The tool for this is called **softmax**. It does two things:

1. Make every score positive, in a way that stretches out the gaps. (It raises the number _e_ ≈ 2.718 to the power of each score.)
2. Divide each result by the total, so they add up to 100%.

Here it is with three words:

<figure class="sw-fig">
  <span class="sw-badge">Toy</span>
  <h4 class="sw-caption" data-toc-skip>Softmax turns scores into shares.</h4>
  <ul class="sw-bars sw-build">
    <li class="sw-bar-row sw-bars-head"><span class="sw-label">Word</span><span class="sw-label sw-col-mid">Score <span class="sw-num sw-lc">z → e<sup>z</sup></span></span><span class="sw-label">Share</span><span class="sw-label">Prob.</span></li>
    <li class="sw-bar-row is-key"><span class="sw-label">mat</span><span class="sw-num sw-col-mid">3.1 → 22.20</span><span class="sw-track"><span class="sw-fill" style="--v:53.1"></span></span><span class="sw-num is-big">53.1%</span></li>
    <li class="sw-bar-row"><span class="sw-label">floor</span><span class="sw-num sw-col-mid">2.5 → 12.18</span><span class="sw-track"><span class="sw-fill" style="--v:29.2"></span></span><span class="sw-num is-big">29.2%</span></li>
    <li class="sw-bar-row"><span class="sw-label">sofa</span><span class="sw-num sw-col-mid">2.0 → 7.39</span><span class="sw-track"><span class="sw-fill" style="--v:17.7"></span></span><span class="sw-num is-big">17.7%</span></li>
  </ul>
  <p class="sw-eq">Total <span class="sw-num">22.20 + 12.18 + 7.39 ≈ 41.77</span>, and each share is its value ÷ <span class="sw-num">41.77</span>.</p>
</figure>

The best word stays on top, and every word gets some chance. One more useful fact: only the **gaps** between scores matter. Add 10 to every score and the chances don't move.

For the curious, the formula is

$$
p_i = \frac{e^{z_i}}{\sum_{j} e^{z_j}}
$$

where $$z_i$$ is the score of word $$i$$. You don't need it for the rest of the post.

### Temperature: the "creativity" knob

Many AI tools have a **temperature** setting. Before softmax, every score is divided by the temperature.

- **Low temperature** (below 1) makes the gaps bigger. The favourite wins even more often. Output gets safe and predictable.
- **Temperature 1** leaves the scores as they are.
- **High temperature** (above 1) makes the gaps smaller. Unlikely words get more of a chance. Output gets more varied, and sometimes weird.

<figure class="sw-fig">
  <span class="sw-badge">Toy</span>
  <h4 class="sw-caption" data-toc-skip>Temperature changes the gap, not the order.</h4>
  <ul class="sw-bars is-4col sw-build">
    <li class="sw-bar-row sw-bars-head"><span class="sw-label">Temp.</span><span class="sw-label">Word</span><span class="sw-label">Share of all 8</span><span class="sw-label">Prob.</span></li>
    <li class="sw-bar-row is-key"><span class="sw-num">0.5</span><span class="sw-label">mat</span><span class="sw-track"><span class="sw-fill" style="--v:65.9"></span></span><span class="sw-num is-big">65.9%</span></li>
    <li class="sw-bar-row"><span></span><span class="sw-label">floor</span><span class="sw-track"><span class="sw-fill" style="--v:19.8"></span></span><span class="sw-num is-big">19.8%</span></li>
    <li class="sw-bar-row is-key"><span class="sw-num">1</span><span class="sw-label">mat</span><span class="sw-track"><span class="sw-fill" style="--v:41.1"></span></span><span class="sw-num is-big">41.1%</span></li>
    <li class="sw-bar-row"><span></span><span class="sw-label">floor</span><span class="sw-track"><span class="sw-fill" style="--v:22.5"></span></span><span class="sw-num is-big">22.5%</span></li>
    <li class="sw-bar-row is-key"><span class="sw-num">2</span><span class="sw-label">mat</span><span class="sw-track"><span class="sw-fill" style="--v:26.4"></span></span><span class="sw-num is-big">26.4%</span></li>
    <li class="sw-bar-row"><span></span><span class="sw-label">floor</span><span class="sw-track"><span class="sw-fill" style="--v:19.5"></span></span><span class="sw-num is-big">19.5%</span></li>
  </ul>
  <p class="sw-eq">Mat ÷ floor <span class="sw-num">= e<sup>0.6 / T</sup></span>: <span class="sw-num">3.32×</span> at T = 0.5, <span class="sw-num">1.82×</span> at 1, <span class="sw-num">1.35×</span> at 2. Mat stays on top every time.</p>
</figure>

Notice that _mat_ is always first. Temperature never changes the order. It only changes how far ahead the leader is.

There's no deep theory behind the "right" temperature. People just try values and see what reads well. Stephen Wolfram, in [his ChatGPT essay](https://writings.stephenwolfram.com/2023/02/what-is-chatgpt-doing-and-why-does-it-work/), found that about 0.8 worked best for essays.

Try it yourself. Drag the temperature slider, then press _Pick a word_ a few times.

<div class="ntk-figure" data-ntk-figure="softmax" data-prompt="The cat sat on the">
  <p class="ntk-figure-placeholder">Loading interactive figure…</p>
  <noscript><p class="ntk-figure-placeholder">This figure needs JavaScript.</p></noscript>
</div>
<p class="ntk-caption">
  Figure 1. Toy scores for eight possible next words. <strong>Model probability</strong> is what softmax gives at the current temperature. <strong>Sampled</strong> counts how often each word came up in your picks. The uncertainty chart shows how unsure the model is at each temperature.
</p>

The same eight words at a few temperatures:

| Temperature | mat   | floor | sofa  | bed   | roof | keyboard | moon | banana |
| ----------- | ----- | ----- | ----- | ----- | ---- | -------- | ---- | ------ |
| 0.1         | 99.8% | 0.2%  | ~0%   | ~0%   | ~0%  | ~0%      | ~0%  | ~0%    |
| 0.5         | 65.9% | 19.8% | 7.3%  | 4.9%  | 1.2% | 0.8%     | ~0%  | ~0%    |
| 1.0         | 41.1% | 22.5% | 13.7% | 11.2% | 5.6% | 4.6%     | 1.0% | 0.4%   |
| 2.0         | 26.4% | 19.5% | 15.2% | 13.8% | 9.7% | 8.8%     | 4.1% | 2.5%   |

At 0.1 the model almost always says _mat_. At 2.0 it says _moon_ about once in 25 tries.

### How unsure is the model?

The "uncertainty" chart in Figure 1 measures how spread out the chances are. It's called **entropy**, and it's counted in bits.

- **0 bits**: one word has all the chance. The model is sure.
- **3 bits**: all eight words are equally likely. That's as unsure as three coin flips.

Our toy sits at 2.29 bits at temperature 1, and drops to almost 0 at temperature 0.1.

## Step 2: pick a word

Now we have chances. We still need to choose **one** word. The rule for choosing is called the **decoding strategy**. Here are the common ones.

**Greedy: always take the top word.** Same prompt, same answer, every time. The downside is that it gets stuck. On long texts it often repeats itself, because once a loop is the most likely path, nothing breaks it out. (Set Figure 1 to _top 1_ to see greedy.)

**Sampling: roll a weighted die.** Each word's chance of coming up equals its probability. At temperature 1, _mat_ comes up about 41% of the time, _floor_ about 22%, and once in a while _keyboard_. Press _Pick 50 times_ in the figure. The **Sampled** bars start out bumpy, then slowly match the **Model probability** bars.

**Top-k and top-p: cut off the junk first.** A real vocabulary has 100,000+ tokens, and most are nonsense in any given spot. Each is unlikely, but together they add up. So before sampling, we throw most of them away:

- **Top-k** keeps only the _k_ best words. Set the figure to _top 3_ and you get 53.1%, 29.2% and 17.7%, the same three numbers as the softmax example above.
- **Top-p** keeps the best words until their chances add up to _p_, say 90%. At temperature 1 that keeps five words (_mat_ to _roof_) and drops _keyboard_, _moon_ and _banana_.

Top-p is clever because it adapts. When the model is sure, a couple of words already reach 90%. When it's unsure, more words get in. That's why many tools use top-p with a medium temperature.

A simple way to remember it: **temperature changes how steep the odds are; top-k and top-p change how many words are allowed to play.**

## Step 3: repeat

Once a word is picked, it joins the text, and the model scores the next spot from scratch. So a whole sentence is a **path** through a tree of choices.

Click the words below to build your own path, or press _Let the model write_.

<div class="ntk-figure" data-ntk-figure="tree" data-src="{{ '/assets/json/next-token-tree.json' | relative_url }}">
  <p class="ntk-figure-placeholder">Loading interactive figure…</p>
  <noscript><p class="ntk-figure-placeholder">This figure needs JavaScript.</p></noscript>
</div>
<p class="ntk-caption">
  Figure 2. Each column shows likely next tokens, given everything to their left, with their chance underneath. The highlighted ribbon is your path; thicker lines mean higher chance. <code>␣</code> marks a leading space, and "+ others" is the chance left over for every token not shown.
</p>

### Chances multiply along a path

To get the chance of a whole path, multiply the chance of each step. For the most common path, _time → , → there → was_:

<figure class="sw-fig">
  <span class="sw-badge">Toy</span>
  <h4 class="sw-caption" data-toc-skip>Every step multiplies in a number below 1.</h4>
  <ul class="sw-bars is-3col sw-build">
    <li class="sw-bar-row sw-bars-head"><span class="sw-label">Step</span><span class="sw-label">Chance of the path so far</span><span class="sw-label">Total</span></li>
    <li class="sw-bar-row"><span class="sw-num">× 0.80 time</span><span class="sw-track"><span class="sw-fill" style="--v:80"></span></span><span class="sw-num is-big">80.0%</span></li>
    <li class="sw-bar-row"><span class="sw-num">× 0.52 ,</span><span class="sw-track"><span class="sw-fill" style="--v:41.6"></span></span><span class="sw-num is-big">41.6%</span></li>
    <li class="sw-bar-row"><span class="sw-num">× 0.46 there</span><span class="sw-track"><span class="sw-fill" style="--v:19.1"></span></span><span class="sw-num is-big">19.1%</span></li>
    <li class="sw-bar-row is-key"><span class="sw-num">× 0.71 was</span><span class="sw-track"><span class="sw-fill" style="--v:13.6"></span></span><span class="sw-num is-big">13.6%</span></li>
  </ul>
  <p class="sw-note">Path from Figure 2: time → , → there → was</p>
</figure>

Even the most popular opening comes out word for word only about 1 time in 7. Each extra word multiplies in another number below 1, so any exact long text is very unlikely.

(Multiplying hundreds of tiny numbers gets so close to zero that computers lose track. So in practice, models add up the _logarithms_ of the chances instead. Same answer, safer maths.)

### No going back

A real model has a branch for every token in its vocabulary. With 100,000 tokens, ten steps already give more possible paths than anyone could ever list. So the model never looks at the whole tree. It walks one step at a time, without looking ahead.

That means **early choices steer everything after**. Pick _midnight_ instead of _time_ in Figure 2 and every later column changes. The model can't go back and edit an earlier word. It can only keep adding new ones.

## What this explains about chatbots

Knowing the loop makes a lot of chatbot behaviour make sense:

- **Same question, different answers.** Sampling takes a different path each time. Turn the temperature near 0 and answers become much more repeatable.
- **"Creative" vs "precise" modes.** That's usually just the temperature knob, sometimes with top-p.
- **Repeating itself.** Greedy picking and very low temperatures can fall into loops.
- **Confident mistakes.** The model picks words that _fit_, one at a time. Nothing in the loop checks if the whole answer is true. A smooth wrong answer and a smooth right one look the same to it.
- **Wording matters.** Your prompt is the start of the path. Change a few words and the very first scores change, and so does everything after.

## Summary

- A model writes by repeating one step: **score every token, turn scores into chances, pick one, add it.**
- **Softmax** turns scores into chances. Only the gaps between scores matter.
- **Temperature** makes the odds steeper (low) or flatter (high). It never changes the order.
- **Greedy, sampling, top-k and top-p** are different rules for picking.
- A full reply is a **path through a tree**. Early picks shape everything after.

Real models do exactly this, just with 100,000+ tokens instead of eight words, and a huge neural network making the scores. How that network works is a story for another post.

## Further reading

- Stephen Wolfram, [What Is ChatGPT Doing … and Why Does It Work?](https://writings.stephenwolfram.com/2023/02/what-is-chatgpt-doing-and-why-does-it-work/): a long, friendly tour of the same loop, with real GPT-2 examples.
- Maxime Labonne, [Decoding Strategies in Large Language Models](https://huggingface.co/blog/mlabonne/decoding-strategies): greedy, beam search, top-k and top-p, with code.
- Machine Learning Mastery, [How LLMs Choose Their Words](https://machinelearningmastery.com/how-llms-choose-their-words-a-practical-walk-through-of-logits-softmax-and-sampling/): a hands-on walk through logits, softmax and sampling.

---

_The figures are plain JavaScript and SVG: no chart library. The interactive style is inspired by [Sophie Wang's research explainers](https://www.sophielwang.com/cues)._
