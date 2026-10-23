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

A chatbot's reply can feel like it was planned from start to finish. Under the hood, a language model does one small thing over and over: it looks at the text so far and guesses **the next small piece of text**. Then it adds that piece to the end and guesses again.

Everything else, from writing poems to answering exam questions, is built on top of that loop. This post takes the loop apart one step at a time, with two figures you can play with along the way.

The numbers in the figures are a toy I wrote by hand, not the output of a real model. The mechanics, though, are the same ones real models use.

## The whole loop at a glance

Every time a model writes a reply, it runs this loop:

1. **Read** the text so far (your prompt, plus anything the model has already written).
2. **Score** every possible next token. A neural network does this part.
3. **Convert** the scores into probabilities with a function called _softmax_.
4. **Pick** one token, using a _decoding strategy_ (always take the top one, or sample at random, or something in between).
5. **Append** that token to the text and go back to step 1.

<figure class="sw-fig">
  <span class="sw-badge">Schematic</span>
  <h4 class="sw-caption" data-toc-skip>A reply is one small step, repeated.</h4>
  <ol class="sw-pipe sw-build">
    <li class="sw-stage"><span class="sw-num">01</span><span class="sw-label">Read</span><p>The text so far</p></li>
    <li class="sw-stage is-active"><span class="sw-num">02</span><span class="sw-label">Score</span><p>One logit per token</p></li>
    <li class="sw-stage"><span class="sw-num">03</span><span class="sw-label">Convert</span><p>Softmax gives probabilities</p></li>
    <li class="sw-stage"><span class="sw-num">04</span><span class="sw-label">Pick</span><p>Greedy or sampled</p></li>
    <li class="sw-stage"><span class="sw-num">05</span><span class="sw-label">Append</span><p>Add it to the text</p></li>
  </ol>
  <div class="sw-return sw-label">Back to read</div>
  <p class="sw-note">The network does step 02. Everything after it is plain arithmetic.</p>
</figure>

The loop stops when the model picks a special "end of text" token, or when it hits a length limit. Models that work this way are called **autoregressive**: each new output is fed back in as input.

The rest of this post goes through steps 2 to 5. Step 2, the neural network itself, is a big topic of its own, so here we treat it as a black box that hands us a list of scores.

## First, what is a "word"?

So far I've been saying "word", but models actually work with **tokens**. A token is a chunk of text from a fixed list called the **vocabulary**. Common words are usually a single token. Rare or long words are split into several pieces. Spaces and punctuation are part of the tokens too.

Here is how a typical tokenizer might split a sentence. The exact split depends on the model; this one is just an illustration:

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

The `␣` symbol marks a leading space. To the model, `␣cat` (with a space in front) and `cat` (without one) are two completely different tokens. You'll see that symbol again in Figure 2.

Vocabularies are large but finite. GPT-2 used about 50,000 tokens; many newer models use somewhere between 100,000 and 250,000. Whatever the size, the model's job at each step is the same: give every single token in the vocabulary a score.

## Step 1: give every token a score

Take the prompt _"The cat sat on the"_. The model doesn't output one answer. It outputs a **score**, called a **logit**, for every token in its vocabulary. A higher score means "this fits better here".

Logits are just real numbers. They can be large, small or negative, and they don't add up to anything in particular. That makes them hard to read on their own. Is a score of 3.1 good? It depends entirely on what the other scores are.

So we need a way to turn a list of scores into a list of probabilities: numbers between 0 and 1 that add up to exactly 1.

### Softmax: from scores to probabilities

The standard tool for this is **softmax**. If token $$i$$ has score $$z_i$$, its probability is

$$
p_i = \frac{e^{z_i}}{\sum_{j} e^{z_j}}
$$

In words: raise $$e \approx 2.718$$ to the power of each score, then divide each result by the total, so that everything adds up to 1.

Let's do it by hand for just three words from the figure below: _mat_ (score 3.1), _floor_ (2.5) and _sofa_ (2.0).

$$
\begin{aligned}
e^{3.1} &\approx 22.20 \\
e^{2.5} &\approx 12.18 \\
e^{2.0} &\approx 7.39
\end{aligned}
$$

The total is about $$41.77$$, so

$$
\begin{aligned}
p_{\text{mat}} &\approx \tfrac{22.20}{41.77} \approx 53.1\% \\
p_{\text{floor}} &\approx \tfrac{12.18}{41.77} \approx 29.2\% \\
p_{\text{sofa}} &\approx \tfrac{7.39}{41.77} \approx 17.7\%
\end{aligned}
$$

<figure class="sw-fig">
  <span class="sw-badge">Toy</span>
  <h4 class="sw-caption" data-toc-skip>Softmax turns scores into shares.</h4>
  <ul class="sw-bars sw-build">
    <li class="sw-bar-row sw-bars-head"><span class="sw-label">Word</span><span class="sw-label sw-col-mid">Score → eˢᶜᵒʳᵉ</span><span class="sw-label">Share</span><span class="sw-label">Prob.</span></li>
    <li class="sw-bar-row is-key"><span class="sw-label">mat</span><span class="sw-num sw-col-mid">3.1 → 22.20</span><span class="sw-track"><span class="sw-fill" style="--v:53.1"></span></span><span class="sw-num is-big">53.1%</span></li>
    <li class="sw-bar-row"><span class="sw-label">floor</span><span class="sw-num sw-col-mid">2.5 → 12.18</span><span class="sw-track"><span class="sw-fill" style="--v:29.2"></span></span><span class="sw-num is-big">29.2%</span></li>
    <li class="sw-bar-row"><span class="sw-label">sofa</span><span class="sw-num sw-col-mid">2.0 → 7.39</span><span class="sw-track"><span class="sw-fill" style="--v:17.7"></span></span><span class="sw-num is-big">17.7%</span></li>
  </ul>
  <p class="sw-eq">Total <span class="sw-num">22.20 + 12.18 + 7.39 ≈ 41.77</span>, and each share is its value ÷ <span class="sw-num">41.77</span>.</p>
</figure>

Why use $$e^{z}$$ rather than just dividing the raw scores by their sum? Three reasons:

- **It's always positive**, even for negative scores, so every token gets a valid probability.
- **It keeps the order**: a higher score always gives a higher probability.
- **Only differences matter.** If you add the same number to every score, the probabilities don't change at all. A useful way to see this is to compare two tokens directly:

$$
\frac{p_a}{p_b} = e^{\,z_a - z_b}
$$

_Mat_ scores 0.6 higher than _floor_, so it is $$e^{0.6} \approx 1.82$$ times as likely, whatever the other scores are.

### Temperature: one knob to sharpen or flatten

Most AI tools let you set a **temperature** $$T$$. It divides every score before the softmax:

$$
p_i = \frac{e^{z_i / T}}{\sum_{j} e^{z_j / T}}
$$

Plug that into the ratio from above and you can see exactly what temperature does:

$$
\frac{p_a}{p_b} = e^{\,(z_a - z_b)/T}
$$

- At $$T = 1$$ nothing changes: _mat_ is 1.82 times as likely as _floor_.
- At $$T = 0.5$$ the gap doubles before exponentiating: _mat_ becomes $$e^{1.2} \approx 3.32$$ times as likely. The favourite pulls ahead.
- At $$T = 2$$ the gap halves: the ratio drops to $$e^{0.3} \approx 1.35$$. The bars even out.

As $$T$$ approaches 0, all the probability piles onto the highest-scoring token. As $$T$$ grows very large, every token tends toward the same probability.

<figure class="sw-fig">
  <span class="sw-badge">Toy</span>
  <h4 class="sw-caption" data-toc-skip>Temperature changes the gap, not the order.</h4>
  <ul class="sw-bars is-3col sw-build">
    <li class="sw-bar-row sw-bars-head"><span class="sw-label">Temperature</span><span class="sw-label">Mat vs floor</span><span class="sw-label">Times likelier</span></li>
    <li class="sw-bar-row is-key"><span class="sw-num">T = 0.5</span><span class="sw-track"><span class="sw-fill" style="--v:100"></span></span><span class="sw-num is-big">3.32×</span></li>
    <li class="sw-bar-row"><span class="sw-num">T = 1</span><span class="sw-track"><span class="sw-fill" style="--v:54.9"></span></span><span class="sw-num is-big">1.82×</span></li>
    <li class="sw-bar-row"><span class="sw-num">T = 2</span><span class="sw-track"><span class="sw-fill" style="--v:40.7"></span></span><span class="sw-num is-big">1.35×</span></li>
  </ul>
  <p class="sw-eq">Ratio <span class="sw-num">e^((3.1 − 2.5) ÷ T)</span>: halve T and the gap doubles before it is exponentiated.</p>
</figure>

Try it below. Drag the temperature slider (or drag across the uncertainty chart), then press _Pick a word_ a few times.

<div class="ntk-figure" data-ntk-figure="softmax" data-prompt="The cat sat on the">
  <p class="ntk-figure-placeholder">Loading interactive figure…</p>
  <noscript><p class="ntk-figure-placeholder">This figure needs JavaScript.</p></noscript>
</div>
<p class="ntk-caption">
  Figure 1. Toy scores for eight possible next words. <strong>Model probability</strong> is what softmax gives at the current temperature. <strong>Sampled</strong> shows how often each word actually came up in your picks. The uncertainty chart traces the entropy across every temperature, with a marker at the current one.
</p>

Here is what the eight toy words look like at a few temperatures:

| Temperature | mat   | floor | sofa  | bed   | roof | keyboard | moon | banana | Uncertainty |
| ----------- | ----- | ----- | ----- | ----- | ---- | -------- | ---- | ------ | ----------- |
| 0.1         | 99.8% | 0.2%  | ~0%   | ~0%   | ~0%  | ~0%      | ~0%  | ~0%    | 0.03 bits   |
| 0.5         | 65.9% | 19.8% | 7.3%  | 4.9%  | 1.2% | 0.8%     | ~0%  | ~0%    | 1.49 bits   |
| 1.0         | 41.1% | 22.5% | 13.7% | 11.2% | 5.6% | 4.6%     | 1.0% | 0.4%   | 2.29 bits   |
| 2.0         | 26.4% | 19.5% | 15.2% | 13.8% | 9.7% | 8.8%     | 4.1% | 2.5%   | 2.73 bits   |

At 0.1 the model is almost a lookup table that always says _mat_. At 2.0 it would say _moon_ about one time in 25, which is how odd outputs creep in.

## Step 2: pick a token

Now we have probabilities, but we still need one token. The rule we use to choose it is called the **decoding strategy**. There are a few common ones.

### Greedy decoding

The simplest rule: always take the token with the highest probability. In the figure, that's the _top 1_ option.

Greedy decoding is predictable. The same prompt always gives the same output. Its weakness is that it tends to get stuck: on longer texts it often repeats the same phrase over and over, because once a loop is the most likely continuation, nothing can break it.

### Sampling

Instead of always taking the favourite, we can **sample**: roll a weighted die where each token's chance of coming up equals its probability. _Mat_ wins about 41% of the time at $$T = 1$$, _floor_ about 22%, and now and then something unusual like _keyboard_ appears.

Press _Pick 50 times_ in the figure and compare the two panels. After a handful of picks the **Sampled** bars look lopsided, but as the picks add up they grow into the same shape as **Model probability**. That's the law of large numbers: over many draws, how often each word comes up approaches its probability.

### Top-k and top-p

Pure sampling has a problem. A real vocabulary has over 100,000 tokens, and most of them are nonsense in any given spot. Each one is very unlikely on its own, but together they add up, so a weird token gets picked more often than you'd like. Two common fixes cut off this long tail before sampling:

- **Top-k** keeps only the $$k$$ highest-scoring tokens, then runs softmax again over just those. Set the figure to _top 3_ at temperature 1.0 and you get 53.1%, 29.2% and 17.7%: exactly the three-word example we worked out by hand above.
- **Top-p** (also called _nucleus sampling_) keeps the smallest set of top tokens whose probabilities add up to at least $$p$$. With $$p = 0.9$$ at temperature 1.0, the running total goes 41.1%, 63.6%, 77.3%, 88.5%, 94.1%, so it keeps the first five words and drops _keyboard_, _moon_ and _banana_.

Top-p adapts to the situation. When the model is confident, a few tokens already cover 90% and the cut is tight. When it's unsure, the cut widens. That's why many tools use top-p together with a moderate temperature.

### Measuring uncertainty: entropy

The figure also shows an **uncertainty** chart. That's the **entropy** of the distribution, measured in bits:

$$
H = -\sum_{i} p_i \log_2 p_i
$$

Entropy is 0 when one token has all the probability: the model is completely sure. It's highest when every option is equally likely. For eight equally likely words, it would be $$\log_2 8 = 3$$ bits, the same as three fair coin flips.

Our toy words sit at 2.29 bits at $$T = 1$$. Lowering the temperature to 0.1 drops that to almost 0. The curve in the figure shows the whole picture at once: entropy climbs quickly as the temperature leaves 0, then flattens out as it creeps toward the 3-bit ceiling.

## Step 3: repeat, one token at a time

Picking one token is only half the story. Once a token is chosen, it becomes part of the text, and the model scores the next position from scratch. So a whole sentence is a **path** through a tree of choices.

Click the words below to walk your own path, or press _Let the model write_ to let it sample one for you.

<div class="ntk-figure" data-ntk-figure="tree" data-src="{{ '/assets/json/next-token-tree.json' | relative_url }}">
  <p class="ntk-figure-placeholder">Loading interactive figure…</p>
  <noscript><p class="ntk-figure-placeholder">This figure needs JavaScript.</p></noscript>
</div>
<p class="ntk-caption">
  Figure 2. Each column holds the likely next tokens given everything to its left, with each token's probability printed under it. The highlighted ribbon is the path you've chosen; thicker lines mean higher probability. The <code>␣</code> marks a leading space, and "+ others" is the probability left over for every token not shown.
</p>

### Probabilities multiply along a path

The chance of a whole continuation is the product of the chance of each step. Each step is conditioned on everything before it. Writing $$w_t$$ for the token at position $$t$$ and $$w_{<t}$$ for all the tokens before it:

$$
P(w_1, w_2, \dots, w_n) = \prod_{t=1}^{n} P(w_t \mid w_{<t})
$$

This is just the chain rule of probability. For the most common path in the figure, _time → , → there → was_:

$$
\begin{aligned}
P(\text{path}) &= 0.80 \times 0.52 \times 0.46 \times 0.71 \\
&\approx 13.6\%
\end{aligned}
$$

<figure class="sw-fig">
  <span class="sw-badge">Toy</span>
  <h4 class="sw-caption" data-toc-skip>Every step multiplies in a number below 1.</h4>
  <ul class="sw-bars is-3col sw-build">
    <li class="sw-bar-row sw-bars-head"><span class="sw-label">Step</span><span class="sw-label">Chance so far</span><span class="sw-label">Total</span></li>
    <li class="sw-bar-row"><span class="sw-num">time</span><span class="sw-track"><span class="sw-fill" style="--v:80"></span></span><span class="sw-num is-big">80.0%</span></li>
    <li class="sw-bar-row"><span class="sw-num">× 0.52 ,</span><span class="sw-track"><span class="sw-fill" style="--v:41.6"></span></span><span class="sw-num is-big">41.6%</span></li>
    <li class="sw-bar-row"><span class="sw-num">× 0.46 there</span><span class="sw-track"><span class="sw-fill" style="--v:19.1"></span></span><span class="sw-num is-big">19.1%</span></li>
    <li class="sw-bar-row is-key"><span class="sw-num">× 0.71 was</span><span class="sw-track"><span class="sw-fill" style="--v:13.6"></span></span><span class="sw-num is-big">13.6%</span></li>
  </ul>
  <p class="sw-note">Path from Figure 2: time → , → there → was</p>
</figure>

Even the single most popular opening has only about a 1 in 7 chance of coming out word for word. Every extra token multiplies in another number below 1, so the probability of any one exact long text gets tiny very quickly.

### Why models add log-probabilities instead

Multiplying hundreds of small numbers runs into a practical problem: the result gets so close to zero that a computer can't store it accurately. So in practice we take logarithms and add them instead:

$$
\log P(w_1, \dots, w_n) = \sum_{t=1}^{n} \log P(w_t \mid w_{<t})
$$

For our path, that's $$\ln 0.80 + \ln 0.52 + \ln 0.46 + \ln 0.71 \approx -2.00$$, and $$e^{-2.00} \approx 13.6\%$$, the same answer. This sum of log-probabilities is also what training optimises. The model is pushed to give high probability to the real next token in billions of example texts.

### The tree is far too big to search

Our toy tree has three or four branches per step. A real model has a branch for every token in its vocabulary. With 100,000 tokens, there are $$100{,}000^{10} = 10^{50}$$ possible ten-token continuations: far more than the model could ever list.

So models never look at the whole tree. Greedy decoding and sampling each walk a single path, one step at a time, without looking ahead. (An older technique called _beam search_ keeps the best handful of partial paths at each step. It's still used for tasks like translation, but chat models mostly sample.)

That has a big consequence: **early choices steer everything after**. Pick _midnight_ instead of _time_ in the figure and every later column changes. There's no going back. The model never edits earlier tokens; it can only keep adding new ones.

## What this explains about chatbots

Once you know the loop, a lot of everyday chatbot behaviour makes sense:

- **Same question, different answers.** With sampling turned on, each run walks a different path through the tree. Setting the temperature close to 0 makes answers much more repeatable. (Not always perfectly identical, because of tiny numerical differences on the hardware.)
- **"Creativity" settings.** The slider labelled "creative" or "precise" in many AI tools is usually just the temperature knob from Figure 1, sometimes combined with top-p.
- **Repetition.** Greedy decoding and very low temperatures can fall into loops. That's one reason most chat systems sample instead.
- **Confident-sounding mistakes.** The model picks tokens that _fit_, one step at a time. Nothing in this loop checks whether the whole answer is true. A fluent wrong answer and a fluent right one look exactly the same to the sampler.
- **Wording matters.** The prompt is the start of the path. Changing a few words changes the scores at the very first step, and those changes carry through everything after.

## Summary

- A language model writes by repeating one step: **score every token, turn the scores into probabilities, pick one, append it.**
- **Softmax** turns scores into probabilities. Only the _differences_ between scores matter.
- **Temperature** divides the scores to make the distribution sharper ($$T < 1$$) or flatter ($$T > 1$$).
- **Greedy decoding, sampling, top-k and top-p** are different rules for picking a token from those probabilities.
- **Entropy** measures how uncertain the model is at a given step.
- A full text is a **path through a tree**: its probability is the product of the step probabilities, which is why models add log-probabilities instead.

Real models do exactly this, with a vocabulary of 100,000 or more tokens instead of eight words, and a large neural network computing the scores instead of a hand-written table. How that network turns text into scores is a topic for another post.

---

_The figures are plain JavaScript and SVG: no chart library. The interactive style is inspired by [Sophie Wang's research explainers](https://www.sophielwang.com/cues)._
