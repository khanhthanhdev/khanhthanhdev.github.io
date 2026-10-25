---
layout: post
title: "attention is all you need, part 5: inference and the KV cache"
date: 2026-10-24 04:00:00
description: "how a trained Transformer writes fast: the KV cache drawn row by row, multi-query and grouped-query attention, the attention patterns models use, and what it all costs in memory"
tags: ai llm transformer interactive
categories: explainer
series: attention-is-all-you-need
part: 5
math: true
toc:
  beginning: true
css:
  - /assets/css/screen-works.css
  - /assets/css/transformer.css
js:
  - /assets/js/transformer/tf-math.js
  - /assets/js/transformer/tf-view.js
  - /assets/js/transformer/part5.js
  - /assets/js/transformer/tf-scrolly.js
  - /assets/js/transformer/tf-figures.js
---

{% include tf-series.liquid %}

[Part 4]({% post_url 2026-10-24-attention-4-decoder-and-training %}) finished the model: the decoder writes one word at a time, feeding each word back in. That loop is correct, but done naively it is slow. Every new word reruns the decoder over everything written so far.

This part is about **inference**: using a trained model, rather than training it. Almost everything that makes today's chat models fast to run comes from one observation: with a causal mask, old positions never change. So their keys and values can be stored once and reused. That store is the **KV cache**.

Then we'll look at the two main ways models shrink that cache, by sharing keys and values between heads (**multi-query** and **grouped-query** attention) and by limiting which past words a query may read (**sliding windows** and other attention patterns).

The scrolly figure below runs the decoder from part 4, with the cache, on the sentence you type. Every number is real.

## The KV cache, step by step

<section class="tf-scrolly" data-tf-scene="part5" data-sentence="the cat sat on the mat">
  <div class="tf-stage">
    <noscript><p class="tf-noscript">These figures need JavaScript. The text alongside still explains every step.</p></noscript>
  </div>
  <div class="tf-steps">

<div class="tf-step" data-step="loop" data-title="The naive loop repeats itself." markdown="1">
**Part 4's generation loop, counted.** At step $$k$$, the decoder reads $$k$$ tokens and computes queries, keys and values for all $$k$$ of them, in every layer. Only the last position's output is used to pick the next word.

Each row of the grid is one step; each cell is one position the decoder has to compute. Writing $$n$$ words costs

$$1 + 2 + \cdots + n = \frac{n(n+1)}{2}$$

positions: the work grows with the square of the length.

</div>

<div class="tf-step" data-step="cache" data-title="Most of that work is repeated." markdown="1">
**The mask makes old positions frozen.** Position $$i$$ only reads positions $$0 \dots i$$. When a new word arrives at the end, nothing before it changes: the keys and values of the earlier positions come out exactly as they did last step.

So keep them. At each step, compute the keys and values of the **new token only**, append them to a cache, and let its query read the whole cache. The grid shrinks to its diagonal: $$n$$ positions instead of $$n(n+1)/2$$.

</div>

<div class="tf-step" data-step="prefill" data-title="Some keys are known up front." markdown="1">
**Cross-attention's keys and values never change.** They come from the encoder's output, and the encoder reads the source sentence once. So before writing a single word, the decoder computes $$K = \text{memory} \cdot W_K$$ and $$V = \text{memory} \cdot W_V$$ for each layer and head, and keeps them for the whole generation.

Running the whole prompt through the model in one pass before writing is called **prefill**. In a decoder-only model like GPT, the prompt goes through the decoder itself, and prefill fills its self-attention cache with one row per prompt token.

</div>

<div class="tf-step" data-step="newrow" data-title="One token in, one row out." markdown="1">
**A decode step.** The decoder is fed a single token: the word it picked last step, plus the positional encoding for its place in the sentence. (Not position 0. A real implementation has to keep count.)

That one row of 8 numbers goes through $$W_Q$$, $$W_K$$ and $$W_V$$ as in part 1, giving one query, one key and one value: each a single row of 4 numbers.

</div>

<div class="tf-step" data-step="append" data-title="The cache grows by one row." markdown="1">
**Append, don't recompute.** The new key goes to the bottom of the key cache, the new value to the bottom of the value cache. The rows above are what earlier steps put there, untouched.

This happens in every self-attention head of every decoder layer. The figure shows layer 1, head 1. Scroll on to watch it fill.

</div>

<div class="tf-step" data-step="attend" data-title="One query reads the whole cache." markdown="1">
**Attention with a single query.** The new query is scored against every cached key, its own included:

$$\text{softmax}\!\left(\frac{q K_{\text{cache}}^\top}{\sqrt{d_k}}\right) V_{\text{cache}}$$

That's equation (1) from part 1 with a $$1 \times 4$$ query instead of an $$n \times 4$$ one. No mask is needed: the cache only holds the past.

The rest of the block (Add & Norm, cross-attention, the feed-forward network) also runs on just this one row.

</div>

<div class="tf-step" data-step="same" data-title="Same answer, less work." markdown="1">
**The cache is not an approximation.** The table runs both versions on your sentence: part 4's full pass at every step, and the cached decode step. They pick the same words with the same probabilities, down to the last digit.

The trade: we've swapped repeated computation for memory. That memory is what the rest of this post is about.

</div>

<div class="tf-step" data-step="memory" data-title="Every head keeps its own cache." markdown="1">
**The full cache.** Every self-attention head in every decoder layer keeps a K and a V. In our toy that's 2 layers × 2 heads × (4 + 4) numbers = 32 numbers per token.

In a real model it's far more. Llama 2 7B keeps 2 × 32 layers × 32 heads × 128 = 262,144 numbers per token: half a megabyte at 16 bits. A 4,096-token conversation needs 2 GiB of cache on top of the weights.

</div>

  </div>
</section>

## Sharing keys and values between heads

The paper gives every attention head its own $$W_K$$ and $$W_V$$, so every head caches its own keys and values. That's **multi-head attention** (MHA). But heads are mostly free to differ in their _queries_: what each one looks for. Do they each need their own keys and values?

- **Multi-query attention** (MQA, [Shazeer, 2019](https://arxiv.org/abs/1911.02150)): all query heads share a single key head and a single value head. The cache shrinks by the number of heads, often 32× or more. Quality can drop somewhat.
- **Grouped-query attention** (GQA, [Ainslie et al., 2023](https://arxiv.org/abs/2305.13245)): the middle ground. Query heads are split into groups, and each group shares one key and value head. With 8 groups, the authors found quality close to multi-head attention with speed close to multi-query.

Each query head still computes its own scores and weights; only the $$K$$ and $$V$$ they read are shared. Most open models since 2023 use GQA: Llama 2 70B, Llama 3, Mistral 7B and others pair 32 or 64 query heads with 8 key/value heads.

<figure class="tf-figure" data-tf-figure="heads">
  <noscript><p>Interactive figure: 8 query heads sharing 8, 4, 2 or 1 key/value heads. It needs JavaScript.</p></noscript>
</figure>

How much memory is that? For one sequence, the cache holds

$$2 \cdot L \cdot h_{kv} \cdot d_{head} \cdot n \cdot b \text{ bytes}$$

where the 2 is for K and V, $$L$$ is the number of layers, $$h_{kv}$$ the number of key/value heads, $$d_{head}$$ the numbers per head, $$n$$ the tokens so far and $$b$$ the bytes per number (2, for 16-bit numbers).

Pick a model, a context length and a number of sequences served at once:

<figure class="tf-figure" data-tf-figure="kvcalc">
  <noscript><p>Interactive figure: a KV cache size calculator. It needs JavaScript. Example: Llama 2 7B keeps 512 KiB per token, 2 GiB for 4,096 tokens.</p></noscript>
</figure>

Try Llama 2 7B at its full 4,096 tokens and 32 sequences: 64 GiB of cache, for a model whose weights take about 13.5 GB. At long contexts the cache, not the model, decides how much a GPU can serve.

## Which keys a query may read

So far we've met two attention patterns. The encoder's self-attention is **full**: every word reads every word. The decoder's is **causal**: every word reads only itself and the past. Cross-attention is a third kind: queries from one sequence, keys and values from another.

Patterns are just masks: which (query, key) pairs get a score, and which get $$-\infty$$ (part 4). Changing the mask changes both the cost and what the cache has to keep. Rows are queries, columns are keys, and dark cells are pairs that get computed:

<figure class="tf-figure" data-tf-figure="masks">
  <noscript><p>Interactive figure: attention masks for full, causal, sliding-window, sink + window and prefix attention. It needs JavaScript.</p></noscript>
</figure>

- **Sliding window** ([Longformer](https://arxiv.org/abs/2004.05150), [Mistral 7B](https://arxiv.org/abs/2310.06825)): each token reads only the last $$w$$ tokens. Cost per token is fixed, and the cache can be a ring buffer of $$w$$ rows. Information from further back still flows, but indirectly: layer 2 reads tokens that read the $$w$$ before them, so after $$L$$ layers a token can be influenced by about $$L \times w$$ positions.
- **Attention sinks** ([StreamingLLM](https://arxiv.org/abs/2309.17453)): trained models put a lot of attention on the first few tokens, whatever they are, as a place to park weight they don't need. Evict those from a sliding window and the model falls apart. Keep the first 4 plus the window, and the authors ran Llama 2 stably on 4 million tokens.
- **Prefix** (studied in the [T5 paper](https://arxiv.org/abs/1910.10683)): the prompt attends in both directions, like an encoder, and only the answer is causal. It's a halfway house between the paper's encoder–decoder and a decoder-only model.
- **Sparse patterns** ([Child et al., 2019](https://arxiv.org/abs/1904.10509)): each token reads a local window plus every $$k$$-th earlier token, so two hops can reach anywhere at a cost of about $$n\sqrt{n}$$ instead of $$n^2$$.

Some models mix them. [Gemma 2](https://arxiv.org/abs/2408.00118) alternates sliding-window and full-attention layers, and [Gemma 3](https://arxiv.org/abs/2503.19786) uses five sliding-window layers (of 1,024 tokens) for each full one, so most layers have a small cache and a few still see everything.

## Going deeper

### Counting the work, with and without the cache

Split one decoder layer's work into two kinds. The **per-token** work (the projections and the feed-forward network) costs about $$c\, d^2$$ for every position it runs on. The **attention** work costs about the same for every (query, key) pair it scores and mixes.

Without the cache, step $$k$$ reruns all $$k$$ positions, and with the mask position $$i$$ reads $$i$$ keys, so the step scores $$1 + 2 + \cdots + k = k(k+1)/2$$ pairs. Over $$n$$ steps:

$$\text{positions: } \sum_{k=1}^{n} k = \frac{n(n+1)}{2}, \qquad \text{pairs: } \sum_{k=1}^{n} \frac{k(k+1)}{2} = \frac{n(n+1)(n+2)}{6} \approx \frac{n^3}{6}$$

With the cache, step $$k$$ runs one position, whose one query reads $$k$$ keys:

$$\text{positions: } n, \qquad \text{pairs: } \sum_{k=1}^{n} k = \frac{n(n+1)}{2} \approx \frac{n^2}{2}$$

The cache takes one power of $$n$$ off both. Generation stays quadratic in total, but only through the attention term, which for short texts is the small one.

### The cache is exact: the proof

Claim: after step $$t$$, every layer's key and value cache equals the keys and values a full masked pass over the first $$t$$ tokens would compute. Use induction on $$t$$.

- **Start.** At $$t = 1$$ there is one token, and the decode step computes exactly what the full pass computes.
- **Step.** Suppose the claim holds after step $$t - 1$$. The rows for positions $$1 \dots t-1$$ are already right, and the full pass over $$t$$ tokens leaves them unchanged, because the decoder is [causal]({% post_url 2026-10-24-attention-4-decoder-and-training %}#causal-proof): appending a token can't change earlier outputs. For the new row, go up the layers. Layer 1's input at position $$t$$ is the token's embedding plus position, same in both. Its query attends over a cache that is right by assumption plus its own new key and value, so its output matches. That output is layer 2's input at position $$t$$, and so on to the top.

So the cache changes how much work is done, never the result. The figure's "same answer" table checks this on your sentence.

### Prefill and decode are different kinds of work

A GPU can do arithmetic far faster than it can read memory. An H100 does about 990 trillion 16-bit operations per second but reads about 3.35 trillion bytes per second: roughly 300 operations in the time it takes to read one byte.

- **Prefill** pushes the whole prompt through at once. Every weight that is read gets used for hundreds or thousands of tokens, so the chip stays busy with arithmetic. This is **compute-bound**, like training.
- **Decode** pushes one token per sequence. Every weight read from memory is used for one multiply-add per sequence, a couple of operations per two-byte number. The chip spends most of its time waiting for memory. This is **memory-bound**.

A rough count makes this precise. Multiplying a batch of $$B$$ rows by a $$d \times d$$ weight matrix takes $$2 B d^2$$ operations (a multiply and an add for each pair) and reads the $$d^2$$ weights once, $$2d^2$$ bytes at 16 bits. That is

$$\frac{2 B d^2 \text{ operations}}{2 d^2 \text{ bytes}} = B \text{ operations per byte}$$

To keep an H100 busy it needs about 300. Prefill gets $$B$$ = the number of prompt tokens, easily enough. A single decoding sequence gets $$B = 1$$.

Serving many sequences at once (batching) helps decode, because they all share the weights: one read of $$W_Q$$ serves the whole batch. The cache can't be shared, though: every sequence reads its own. Do the same count for attention over the cache. One query head reads $$n$$ cached keys and values of $$d_{head}$$ numbers each, $$4 n\, d_{head}$$ bytes, and does about $$4 n\, d_{head}$$ operations with them: about 1 operation per byte, whatever the batch. With grouped-query attention, the $$g$$ query heads in a group read the same cached keys and values, so the ratio rises to about $$g$$. At long contexts reading the cache dominates, which is why shrinking it with GQA or MQA speeds up decoding, not just saves memory. Much of [Pope et al. (2022)](https://arxiv.org/abs/2211.05102) is this analysis, at scale.

### Multi-head latent attention: cache something smaller

DeepSeek-V2 ([2024](https://arxiv.org/abs/2405.04434)) keeps 128 query heads _and_ effectively 128 key/value heads, but caches neither keys nor values. Each token's vector is first squeezed into a small **latent** vector,

$$c = x\, W_{down}, \qquad c \in \mathbb{R}^{512},$$

and that's what gets cached. Each head's keys and values are $$c\, W_{up}^{K}$$ and $$c\, W_{up}^{V}$$. Because matrix products can be regrouped, $$W_{up}^{K}$$ can be folded into $$W_Q$$ ahead of time (and $$W_{up}^{V}$$ into $$W_O$$), so the full keys are never written out.

There's one catch: RoPE (next section) rotates keys by position, and a rotation stuck between $$W_{up}^{K}$$ and $$W_Q$$ breaks the folding. So DeepSeek-V2 also caches one small 64-number key that carries the position. That's 576 numbers per token per layer, against 32,768 for 128 full heads: 57 times smaller. The paper reports a 93% smaller cache than its previous 67B model.

### Positions inside the cache

Our toy adds the sinusoidal position encoding to the input, as the paper does, so a cached key already "knows" its position. Most models today use **rotary embeddings** ([RoPE](https://arxiv.org/abs/2104.09864)) instead: rather than adding a position to the input, they rotate each query and key by an angle proportional to its position, inside every attention layer.

That works well with a cache. A key's rotation depends only on its own position, so it's rotated once and stored rotated. And part 2's rotation trick does the rest: the score between a query at position $$p$$ and a key at $$k$$ depends only on the distance $$p - k$$, however long the cache gets.

### FlashAttention and the online softmax

The cache saves recomputation, but each step still reads every cached key and value. [FlashAttention](https://arxiv.org/abs/2205.14135) speeds up the attention computation itself by never writing the full score matrix to the GPU's main memory: it reads $$K$$ and $$V$$ in blocks small enough for fast on-chip memory, and finishes each block before loading the next.

The hard part is the softmax, which seems to need every score before it can divide. The trick ([Milakov & Gimelshein, 2018](https://arxiv.org/abs/1805.02867)) is to keep a running maximum $$m$$, a running sum $$\ell$$ and a running output $$o$$. For each new block of scores $$s_j$$:

$$m' = \max(m,\, \max_j s_j)$$

$$\ell' = e^{m - m'}\ell + \textstyle\sum_j e^{s_j - m'}$$

$$o' = e^{m - m'}\, o + \textstyle\sum_j e^{s_j - m'}\, v_j$$

and the answer is $$o / \ell$$ at the end. The factor $$e^{m - m'}$$ rescales everything so far whenever a bigger score turns up.

Why is that right? After each block, three things stay true of the scores seen so far:

$$m = \max_j s_j, \qquad \ell = \sum_j e^{s_j - m}, \qquad o = \sum_j e^{s_j - m}\, v_j$$

The update keeps them true. Multiplying the old $$\ell$$ by $$e^{m - m'}$$ turns each $$e^{s_j - m}$$ into $$e^{s_j - m'}$$: the old terms, re-expressed against the new maximum. Then the new block's terms are added in, against the same maximum. The same goes for $$o$$. At the end, the common factor $$e^{-m}$$ cancels:

$$\frac{o}{\ell} = \frac{\sum_j e^{s_j - m} v_j}{\sum_j e^{s_j - m}} = \sum_j \frac{e^{s_j}}{\sum_l e^{s_l}}\, v_j = \text{softmax}(s) \cdot V$$

And since $$m$$ is the largest score so far, every exponent is at most 0, so nothing overflows. On the cached step in the figure above, done two keys at a time, it matches the direct softmax to about $$10^{-16}$$, the last digit a computer keeps. FlashAttention is exact, not an approximation; it changes how much memory traffic attention needs, not what it computes.

### PagedAttention: the cache as virtual memory

A server doesn't know in advance how long each answer will be. Reserving a cache for the maximum length wastes most of it; [vLLM](https://arxiv.org/abs/2309.06180) found earlier systems used as little as a fifth of the memory they reserved. **PagedAttention** borrows the operating system's answer: split the cache into small fixed-size blocks, hand them out as a sequence grows, and keep a table of where each sequence's blocks are. Sequences that share a prompt can share its blocks. The authors report 2–4× more throughput at the same latency.

### Speculative decoding: use part 4's trick in reverse

Part 4 showed that one masked pass over a sentence gives the same predictions as writing it word by word. [Speculative decoding](https://arxiv.org/abs/2211.17192) uses that to break the one-word-per-pass limit. A small, fast model drafts a few words ahead. The big model then checks all of them in one pass, the way it would during training, and keeps the drafted words up to the first one it disagrees with, plus its own word at that point.

Every pass of the big model yields at least one word, and often several. With the right acceptance rule for sampling, the output follows exactly the big model's distribution.

The rule is short. Let $$p$$ be the big model's probabilities for the next word and $$q$$ the small model's. The small model drafts a word $$x$$ from $$q$$. Accept it with probability $$\min(1,\ p(x)/q(x))$$. If it's rejected, draw a replacement from the leftover distribution

$$r(x) = \frac{\max(0,\ p(x) - q(x))}{\sum_y \max(0,\ p(y) - q(y))}$$

**Proof that this samples from $$p$$.** Write $$\beta = \sum_y \min(p(y), q(y))$$ for the overall chance of accepting. There are two ways to end up with word $$x$$:

- drafted and accepted: $$q(x) \cdot \min(1, p(x)/q(x)) = \min(p(x), q(x))$$;
- some draft rejected, then $$x$$ drawn from $$r$$: $$(1 - \beta)\, r(x)$$.

Since $$p(y) = \min(p(y), q(y)) + \max(0, p(y) - q(y))$$ and $$p$$ adds up to 1, the denominator of $$r$$ is exactly $$1 - \beta$$. So the second way has probability $$\max(0, p(x) - q(x))$$, and the total is

$$\min(p(x), q(x)) + \max(0,\ p(x) - q(x)) = p(x)$$

The small model only changes how fast the words come out, not which words are likely. A good draft model (one with $$q$$ close to $$p$$) just makes $$\beta$$ big, so most drafts are kept. The authors report 2–3× faster decoding on T5-XXL with identical outputs.

### How many words does one pass buy? {#speculative-speedup}

[Leviathan et al. (2022)](https://arxiv.org/abs/2211.17192) also work out the speed-up. Let the small model draft $$\gamma$$ words, and call $$\alpha$$ the average of $$\beta$$, the chance that a draft is accepted. Assume, to keep it simple, that each draft is accepted independently with chance $$\alpha$$.

**Step 1: the words per pass.** Let $$N$$ be the number of words one big pass produces. If the first $$k$$ drafts are accepted and draft $$k+1$$ is rejected, we keep $$k$$ drafts plus the big model's replacement: $$N = k + 1$$. If all $$\gamma$$ are accepted, the big model's pass has already computed the next word's probabilities too, so we get a free extra word: $$N = \gamma + 1$$. Either way, $$N \ge k + 1$$ exactly when the first $$k$$ drafts are accepted:

$$\Pr(N \ge k + 1) = \alpha^k, \qquad k = 0, 1, \dots, \gamma$$

**Step 2: the average.** For a count that is never negative, the average is the sum of the chances of being at least each value, $$\mathbb{E}[N] = \sum_{j \ge 1} \Pr(N \ge j)$$. So

$$\mathbb{E}[N] = \sum_{k=0}^{\gamma} \alpha^k = \frac{1 - \alpha^{\gamma + 1}}{1 - \alpha}$$

the usual geometric sum. Even with endless drafts it can't pass $$1/(1 - \alpha)$$: 5 words per pass for $$\alpha = 0.8$$.

**Step 3: the cost.** One round costs $$\gamma$$ small-model steps plus one big pass. If a small step costs $$c$$ times a big one, a round costs $$\gamma c + 1$$ big passes. Plain decoding gets one word per big pass, so the speed-up is

$$\text{speed-up} = \frac{1 - \alpha^{\gamma+1}}{(1 - \alpha)(\gamma c + 1)}$$

With $$\gamma = 1$$ this is $$(1 + \alpha)/(1 + c)$$, which is above 1 whenever $$\alpha > c$$. So speculation always helps when the draft is accepted more often than it costs. For $$\alpha = 0.8$$ and $$c = 0.05$$:

{: .tf-table}
| drafts $$\gamma$$ | 1 | 2 | 3 | 5 | 8 | 10 |
| ----------------------------- | ---- | ---- | ---- | ---- | ---- | ---- |
| words per pass $$\mathbb{E}[N]$$ | 1.80 | 2.44 | 2.95 | 3.69 | 4.33 | 4.57 |
| speed-up | 1.71 | 2.22 | 2.57 | 2.95 | 3.09 | 3.05 |

Past about 8 drafts, the extra drafting costs more than the words it adds. Two things the formula leaves out: the big model has to do more total arithmetic (it checks drafts that get thrown away), which only pays off because decoding is limited by memory reads, not arithmetic, as [above](#prefill-and-decode-are-different-kinds-of-work); and real acceptances aren't independent, so the table is a guide, not a promise.

### Choosing the next word

Part 4 always took the most likely word (greedy). Chat models usually **sample** from the probabilities instead, after reshaping them:

- **Temperature** $$T$$ divides the logits before the softmax: $$\text{softmax}(z / T)$$. Below 1 sharpens the distribution towards greedy; above 1 flattens it. It's the √d_k story from part 1 again: dividing scores changes how peaked a softmax is.
- **Top-k** keeps only the $$k$$ most likely words and renormalises.
- **Top-p** or nucleus sampling ([Holtzman et al., 2019](https://arxiv.org/abs/1904.09751)) keeps the smallest set of words whose probabilities add up to $$p$$. It's a fixed share of the probability rather than a fixed number of words, so it adapts: few candidates when the model is sure, many when it isn't.

None of these change the cache: they act only on the final probabilities.

## Further reading

- Noam Shazeer, [_Fast Transformer Decoding: One Write-Head is All You Need_](https://arxiv.org/abs/1911.02150) (2019): multi-query attention, and a clear cost analysis of incremental decoding.
- Ainslie et al., [_GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints_](https://arxiv.org/abs/2305.13245) (2023).
- Pope et al., [_Efficiently Scaling Transformer Inference_](https://arxiv.org/abs/2211.05102) (2022): prefill vs. decode, memory vs. compute, at scale.
- Dao et al., [_FlashAttention_](https://arxiv.org/abs/2205.14135) (2022), and Kwon et al., [_PagedAttention_](https://arxiv.org/abs/2309.06180) (2023).
- DeepSeek-AI, [_DeepSeek-V2_](https://arxiv.org/abs/2405.04434) (2024), section 2.1: multi-head latent attention.
- Leviathan, Kalman and Matias, [_Fast Inference from Transformers via Speculative Decoding_](https://arxiv.org/abs/2211.17192) (2022): the acceptance rule and the [speed-up formula](#speculative-speedup).
- kipply, [_Transformer Inference Arithmetic_](https://kipp.ly/transformer-inference-arithmetic/) (2022): KV-cache sizes and the memory-vs-compute count, worked by hand.

{% include tf-series.liquid %}
