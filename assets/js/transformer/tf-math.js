// A tiny, fully inspectable Transformer (Vaswani et al., 2017) for the "Attention is all you need" series.
// Every function returns plain arrays, and the forward passes return every intermediate matrix so the figures can
// draw each step. Classic script (not an ES module): it sets window.TF in the browser and module.exports in Node.
(function (root) {
  "use strict";

  const config = { dModel: 8, heads: 2, dK: 4, dFF: 16, maxLen: 10, layers: 2 };

  /* ---------------------------------------------------------------- vocabulary */

  // Hand-made word features so one attention head has a story to tell. Columns:
  const FEATURES = ["noun", "verb", "det", "prep", "animal", "thing", "adj", "motion"];
  const f = (...on) => FEATURES.map((name) => (on.includes(name) ? 1 : 0));
  const WORDS = {
    "<pad>": f(),
    "<s>": f(),
    "</s>": f(),
    "<unk>": f(),
    the: f("det"),
    a: f("det"),
    my: f("det"),
    cat: f("noun", "animal"),
    dog: f("noun", "animal"),
    bird: f("noun", "animal"),
    fox: f("noun", "animal"),
    mat: f("noun", "thing"),
    sofa: f("noun", "thing"),
    tree: f("noun", "thing"),
    park: f("noun", "thing"),
    ball: f("noun", "thing"),
    house: f("noun", "thing"),
    sat: f("verb"),
    slept: f("verb"),
    saw: f("verb"),
    liked: f("verb"),
    ran: f("verb", "motion"),
    jumped: f("verb", "motion"),
    chased: f("verb", "motion"),
    on: f("prep"),
    in: f("prep"),
    under: f("prep"),
    near: f("prep"),
    over: f("prep", "motion"),
    big: f("adj"),
    small: f("adj"),
    lazy: f("adj"),
    quick: f("adj"),
    brown: f("adj"),
    and: f(),
  };
  const vocab = Object.keys(WORDS);
  const vocabIndex = Object.fromEntries(vocab.map((w, i) => [w, i]));
  const UNK = vocabIndex["<unk>"];

  // Lower-cases, splits on anything that is not a letter, and caps the length at config.maxLen.
  function tokenize(text) {
    return String(text)
      .toLowerCase()
      .split(/[^a-z<>/]+/)
      .filter(Boolean)
      .slice(0, config.maxLen)
      .map((word) => {
        const id = word in vocabIndex ? vocabIndex[word] : UNK;
        return { text: word, id, known: id !== UNK };
      });
  }

  /* ---------------------------------------------------------------- linear algebra */

  const zeros = (r, c) => Array.from({ length: r }, () => new Array(c).fill(0));
  const shape = (A) => [A.length, A[0] ? A[0].length : 0];
  const transpose = (A) => A[0].map((_, j) => A.map((row) => row[j]));
  const add = (A, B) => A.map((row, i) => row.map((v, j) => v + B[i][j]));
  const scale = (A, k) => A.map((row) => row.map((v) => v * k));
  const map = (A, fn) => A.map((row, i) => row.map((v, j) => fn(v, i, j)));
  const dot = (a, b) => a.reduce((sum, v, k) => sum + v * b[k], 0);
  const sliceCols = (A, from, to) => A.map((row) => row.slice(from, to));
  const concatCols = (...Ms) => Ms[0].map((_, i) => Ms.flatMap((M) => M[i]));
  const relu = (A) => map(A, (v) => Math.max(0, v));
  const addRow = (A, b) => A.map((row) => row.map((v, j) => v + b[j]));

  function matmul(A, B) {
    if (A[0].length !== B.length) throw new Error(`matmul: ${shape(A)} × ${shape(B)}`);
    const Bt = transpose(B);
    return A.map((row) => Bt.map((col) => dot(row, col)));
  }

  // Numerically stable softmax over one vector; -Infinity entries get exactly 0.
  function softmax(v) {
    const m = Math.max(...v);
    const e = v.map((x) => (x === -Infinity ? 0 : Math.exp(x - m)));
    const sum = e.reduce((a, b) => a + b, 0);
    return e.map((x) => x / sum);
  }
  const softmaxRows = (A) => A.map(softmax);

  // Per-row LayerNorm. Returns the statistics too, because the figures plot them.
  function layerNorm(X, gamma, beta, eps = 1e-5) {
    const d = X[0].length;
    const mean = X.map((row) => row.reduce((a, b) => a + b, 0) / d);
    const variance = X.map((row, i) => row.reduce((a, v) => a + (v - mean[i]) ** 2, 0) / d);
    const normed = X.map((row, i) => row.map((v) => (v - mean[i]) / Math.sqrt(variance[i] + eps)));
    const out = normed.map((row) => row.map((v, j) => v * gamma[j] + beta[j]));
    return { mean, variance, normed, out };
  }

  // Sinusoidal positional encoding from section 3.5 of the paper.
  function positionalEncoding(n, d = config.dModel) {
    return Array.from({ length: n }, (_, pos) =>
      Array.from({ length: d }, (_, i) => {
        const angle = pos / Math.pow(10000, (2 * Math.floor(i / 2)) / d);
        return i % 2 === 0 ? Math.sin(angle) : Math.cos(angle);
      })
    );
  }

  // 0 where position i may look at j (j <= i), -Infinity above the diagonal.
  const causalMask = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (j <= i ? 0 : -Infinity)));

  /* ---------------------------------------------------------------- weights */

  // mulberry32: small, fast, seedable. Same seed, same numbers, on every browser.
  function rng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Box–Muller standard normal
    next.normal = () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
    return next;
  }

  // Values are rounded to 2 decimals so every weight the reader sees is exactly the weight that is used.
  const round2 = (v) => Math.round(v * 100) / 100;
  const randn = (r, c, std, rand) => Array.from({ length: r }, () => Array.from({ length: c }, () => round2(rand.normal() * std)));

  function makeWeights(seed = 2017) {
    const rand = rng(seed);
    const { dModel: d, heads, dK, dFF, layers } = config;
    const xavier = (r, c) => randn(r, c, 1 / Math.sqrt(r), rand);
    const noise = (A, std) => A.map((row) => row.map((v) => round2(v + rand.normal() * std)));

    const embedding = noise(
      vocab.map((w) => WORDS[w]),
      0.1
    );

    // Head 0 of the first encoder layer is wired by hand: verbs look for animals (who did it), prepositions look
    // for things (on what), adjectives and determiners look for nouns. Everything else is random.
    const F = Object.fromEntries(FEATURES.map((name, i) => [name, i]));
    function storyHead() {
      const Wq = zeros(d, dK);
      const Wk = zeros(d, dK);
      [
        ["verb", "animal", 2.4],
        ["prep", "thing", 2.4],
        ["adj", "noun", 2.4],
        ["det", "noun", 1.6],
      ].forEach(([query, key, w], col) => {
        Wq[F[query]][col] = w;
        Wk[F[key]][col] = w;
      });
      return { Wq: noise(Wq, 0.1), Wk: noise(Wk, 0.1), Wv: xavier(d, dK) };
    }
    const randomHead = () => ({ Wq: xavier(d, dK), Wk: xavier(d, dK), Wv: xavier(d, dK) });
    const mha = (story) => ({
      heads: Array.from({ length: heads }, (_, h) => (story && h === 0 ? storyHead() : randomHead())),
      Wo: xavier(heads * dK, d),
    });
    const norm = () => ({ gamma: new Array(d).fill(1), beta: new Array(d).fill(0) });
    const ffn = () => ({ W1: xavier(d, dFF), b1: new Array(dFF).fill(0), W2: xavier(dFF, d), b2: new Array(d).fill(0) });

    return {
      embedding,
      encoder: Array.from({ length: layers }, (_, l) => ({ attn: mha(l === 0), norm1: norm(), ffn: ffn(), norm2: norm() })),
      decoder: Array.from({ length: layers }, () => ({
        self: mha(false),
        norm1: norm(),
        cross: mha(false),
        norm2: norm(),
        ffn: ffn(),
        norm3: norm(),
      })),
    };
  }

  /* ---------------------------------------------------------------- the model */

  // Scaled dot-product attention, eq. (1): softmax(Q Kᵀ / √d_k) V, with every step kept.
  function attention(Q, K, V, mask) {
    const scores = matmul(Q, transpose(K));
    const scaled = scale(scores, 1 / Math.sqrt(K[0].length));
    const masked = mask ? add(scaled, mask) : scaled;
    const weights = softmaxRows(masked);
    return { Q, K, V, scores, scaled, masked, weights, out: matmul(weights, V) };
  }

  // Multi-head attention, section 3.2.2. Queries come from Xq, keys and values from Xkv (the same for self-attention).
  function multiHead(Xq, Xkv, W, mask) {
    const heads = W.heads.map((h) => attention(matmul(Xq, h.Wq), matmul(Xkv, h.Wk), matmul(Xkv, h.Wv), mask));
    const concat = concatCols(...heads.map((h) => h.out));
    return { heads, concat, out: matmul(concat, W.Wo) };
  }

  function feedForward(X, W) {
    const hidden = addRow(matmul(X, W.W1), W.b1);
    const active = relu(hidden);
    return { hidden, active, out: addRow(matmul(active, W.W2), W.b2) };
  }

  // Residual connection followed by LayerNorm: LayerNorm(x + Sublayer(x)).
  function addNorm(X, Y, W) {
    const sum = add(X, Y);
    return { sum, ...layerNorm(sum, W.gamma, W.beta) };
  }

  function embed(tokens, weights, positional) {
    const ids = tokens.map((t) => (typeof t === "number" ? t : t.id));
    const E = ids.map((id) => weights.embedding[id].slice());
    const pe = positionalEncoding(ids.length);
    return { ids, E, pe, x: positional ? add(E, pe) : E };
  }

  function encoderLayer(X, W) {
    const attn = multiHead(X, X, W.attn);
    const norm1 = addNorm(X, attn.out, W.norm1);
    const ffn = feedForward(norm1.out, W.ffn);
    const norm2 = addNorm(norm1.out, ffn.out, W.norm2);
    return { input: X, attn, norm1, ffn, norm2, out: norm2.out };
  }

  // options.positional (default true) adds positional encodings; options.layers limits the stack depth.
  function encode(tokens, options = {}) {
    const weights = options.weights || defaultWeights;
    const positional = options.positional !== false;
    const nLayers = options.layers ?? config.layers;
    const emb = embed(tokens, weights, positional);
    const layers = [];
    let X = emb.x;
    for (let l = 0; l < nLayers; l++) {
      const layer = encoderLayer(X, weights.encoder[l]);
      layers.push(layer);
      X = layer.out;
    }
    return { tokens, ...emb, layers, out: X };
  }

  function decoderLayer(Y, memory, W) {
    const mask = causalMask(Y.length);
    const self = multiHead(Y, Y, W.self, mask);
    const norm1 = addNorm(Y, self.out, W.norm1);
    const cross = multiHead(norm1.out, memory, W.cross);
    const norm2 = addNorm(norm1.out, cross.out, W.norm2);
    const ffn = feedForward(norm2.out, W.ffn);
    const norm3 = addNorm(norm2.out, ffn.out, W.norm3);
    return { input: Y, mask, self, norm1, cross, norm2, ffn, norm3, out: norm3.out };
  }

  // One decoder pass over the target prefix. The output projection shares the embedding matrix (section 3.4).
  function decode(prefix, memory, options = {}) {
    const weights = options.weights || defaultWeights;
    const emb = embed(prefix, weights, true);
    const layers = [];
    let Y = emb.x;
    for (const W of weights.decoder.slice(0, options.layers ?? config.layers)) {
      const layer = decoderLayer(Y, memory, W);
      layers.push(layer);
      Y = layer.out;
    }
    const last = Y[Y.length - 1];
    const logits = weights.embedding.map((row) => dot(last, row));
    return { ...emb, layers, out: Y, logits, probs: softmax(logits) };
  }

  // Greedy generation: start from <s>, append the most likely token, stop at </s> or maxSteps.
  function generate(tokens, maxSteps = 5, options = {}) {
    const memory = encode(tokens, options).out;
    const prefix = [vocabIndex["<s>"]];
    const steps = [];
    for (let s = 0; s < maxSteps; s++) {
      const step = decode(prefix, memory, options);
      const next = step.probs.indexOf(Math.max(...step.probs));
      steps.push({ prefix: prefix.slice(), step, next });
      prefix.push(next);
      if (next === vocabIndex["</s>"]) break;
    }
    return { memory, steps, output: prefix.slice(1) };
  }

  /* ---------------------------------------------------------------- training bits (section 5) */

  // Learning-rate schedule, eq. (3).
  const learningRate = (step, dModel = 512, warmup = 4000) =>
    Math.pow(dModel, -0.5) * Math.min(Math.pow(Math.max(step, 1), -0.5), Math.max(step, 1) * Math.pow(warmup, -1.5));

  // Label smoothing (section 5.4): the target keeps 1 - eps, the rest is spread over the other tokens.
  const smoothTarget = (target, size, eps = 0.1) => Array.from({ length: size }, (_, i) => (i === target ? 1 - eps : eps / (size - 1)));

  const crossEntropy = (probs, target) => -target.reduce((sum, t, i) => sum + (t ? t * Math.log(Math.max(probs[i], 1e-12)) : 0), 0);

  const defaultWeights = makeWeights();

  const TF = {
    config,
    FEATURES,
    vocab,
    vocabIndex,
    tokenize,
    zeros,
    shape,
    transpose,
    add,
    scale,
    map,
    dot,
    matmul,
    sliceCols,
    concatCols,
    relu,
    softmax,
    softmaxRows,
    layerNorm,
    positionalEncoding,
    causalMask,
    rng,
    makeWeights,
    weights: defaultWeights,
    attention,
    multiHead,
    feedForward,
    addNorm,
    encoderLayer,
    encode,
    decoderLayer,
    decode,
    generate,
    learningRate,
    smoothTarget,
    crossEntropy,
  };

  if (typeof module === "object" && module.exports) module.exports = TF;
  else root.TF = TF;
})(typeof window !== "undefined" ? window : globalThis);
