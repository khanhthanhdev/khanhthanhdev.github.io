import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const TF = require("../assets/js/transformer/tf-math.js");

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const argmax = (v) => v.indexOf(Math.max(...v));
const sentence = TF.tokenize("the cat sat on the mat");

test("matmul and attention match a hand-worked example", () => {
  assert.deepEqual(
    TF.matmul(
      [
        [1, 2],
        [3, 4],
      ],
      [
        [5, 6],
        [7, 8],
      ]
    ),
    [
      [19, 22],
      [43, 50],
    ]
  );
  // Q = K = I (d_k = 2): scores = I, scaled = I / √2, so each row is softmax([1/√2, 0]).
  const I = [
    [1, 0],
    [0, 1],
  ];
  const a = TF.attention(I, I, I);
  const p = Math.exp(1 / Math.SQRT2) / (Math.exp(1 / Math.SQRT2) + 1);
  close(a.weights[0][0], p);
  close(a.weights[0][1], 1 - p);
  close(a.out[1][1], p);
});

test("softmax rows sum to 1 and masked entries get exactly 0", () => {
  const mask = TF.causalMask(4);
  const w = TF.softmaxRows(
    TF.add(
      [...Array(4)].map(() => [3, -1, 2, 0.5]),
      mask
    )
  );
  w.forEach((row, i) => {
    close(
      row.reduce((a, b) => a + b, 0),
      1
    );
    row.forEach((v, j) => (j > i ? assert.equal(v, 0) : assert.ok(v > 0)));
  });
});

test("layerNorm rows have mean 0 and variance 1", () => {
  const { out } = TF.layerNorm(
    [
      [1, 2, 3, 4],
      [10, -10, 5, 0],
    ],
    [1, 1, 1, 1],
    [0, 0, 0, 0]
  );
  out.forEach((row) => {
    close(row.reduce((a, b) => a + b, 0) / row.length, 0);
    close(row.reduce((a, v) => a + v * v, 0) / row.length, 1, 1e-4);
  });
});

test("positional encoding follows the paper's formula", () => {
  const pe = TF.positionalEncoding(5, 8);
  close(pe[0][0], 0);
  close(pe[0][1], 1);
  close(pe[3][0], Math.sin(3));
  close(pe[3][3], Math.cos(3 / Math.pow(10000, 2 / 8)));
});

test("weights are seeded, rounded and stable", () => {
  assert.deepEqual(TF.makeWeights(), TF.makeWeights());
  assert.notDeepEqual(TF.makeWeights(1), TF.makeWeights(2));
  TF.weights.encoder[0].ffn.W1.flat().forEach((v) => close(v, Math.round(v * 100) / 100));
  // Pin one value so a change to the PRNG or the weight order (which would change every figure) fails loudly.
  assert.equal(TF.weights.embedding[TF.vocabIndex.sat][1], 0.72);
});

test("tokenize lower-cases, marks unknown words and caps the length", () => {
  const t = TF.tokenize("The ZEBRA sat!");
  assert.deepEqual(
    t.map((x) => x.text),
    ["the", "zebra", "sat"]
  );
  assert.deepEqual(
    t.map((x) => x.known),
    [true, false, true]
  );
  assert.equal(TF.tokenize("a ".repeat(30)).length, TF.config.maxLen);
});

test("encoder keeps the shape at every layer", () => {
  const e = TF.encode(sentence);
  const n = sentence.length;
  assert.deepEqual(TF.shape(e.x), [n, TF.config.dModel]);
  e.layers.forEach((layer) => {
    assert.deepEqual(TF.shape(layer.attn.heads[0].weights), [n, n]);
    assert.deepEqual(TF.shape(layer.attn.concat), [n, TF.config.heads * TF.config.dK]);
    assert.deepEqual(TF.shape(layer.ffn.hidden), [n, TF.config.dFF]);
    assert.deepEqual(TF.shape(layer.out), [n, TF.config.dModel]);
  });
});

test("the hand-wired head finds who sat and what it sat on", () => {
  const head = TF.encode(sentence, { positional: false }).layers[0].attn.heads[0];
  const words = sentence.map((t) => t.text);
  assert.equal(words[argmax(head.weights[2])], "cat"); // sat → cat
  assert.equal(words[argmax(head.weights[3])], "mat"); // on → mat
});

test("without positions, shuffling the words only shuffles the outputs", () => {
  const ids = sentence.map((t) => t.id);
  const order = [5, 2, 0, 4, 1, 3];
  const a = TF.encode(ids, { positional: false }).out;
  const b = TF.encode(
    order.map((i) => ids[i]),
    { positional: false }
  ).out;
  order.forEach((from, to) => b[to].forEach((v, j) => close(v, a[from][j], 1e-9)));
});

test("decoder self-attention is causal and generation is greedy", () => {
  const memory = TF.encode(sentence).out;
  const prefix = [TF.vocabIndex["<s>"], TF.vocabIndex.the, TF.vocabIndex.cat];
  const d = TF.decode(prefix, memory);
  d.layers[0].self.heads.forEach((h) => h.weights.forEach((row, i) => row.forEach((v, j) => j > i && assert.equal(v, 0))));
  assert.deepEqual(TF.shape(d.layers[0].cross.heads[0].weights), [prefix.length, sentence.length]);
  close(
    d.probs.reduce((a, b) => a + b, 0),
    1
  );
  const g = TF.generate(sentence, 4);
  g.steps.forEach((s) => assert.equal(s.next, argmax(s.step.probs)));
});

test("decoding with a KV cache gives exactly the full pass's answers", () => {
  const full = TF.generate(sentence, 6);
  const cached = TF.generateCached(sentence, 6);
  assert.deepEqual(cached.output, full.output);
  cached.steps.forEach((st, k) => st.step.probs.forEach((p, w) => close(p, full.steps[k].step.probs[w], 1e-12)));
  // the self-attention cache grows one row per step; the cross-attention one is the encoder's length throughout
  const L = cached.cache.layers[0];
  assert.equal(L.self[0].K.length, cached.steps.length);
  assert.equal(L.cross[0].K.length, sentence.length);
  // step k's query reads k + 1 keys (its own included)
  cached.steps.forEach((st, k) => assert.equal(st.step.layers[0].selfHeads[0].weights[0].length, k + 1));
});

test("learning-rate schedule peaks at the warmup step", () => {
  const lr = (s) => TF.learningRate(s);
  assert.ok(lr(4000) > lr(3000) && lr(4000) > lr(5000));
  close(lr(4000), Math.pow(512, -0.5) * Math.pow(4000, -0.5));
  const t = TF.smoothTarget(2, 5);
  close(
    t.reduce((a, b) => a + b, 0),
    1
  );
  close(t[2], 0.9);
});

/* ---------------------------------------------------------------- rendered posts (needs a site build in _site) */

const site = (path) => new URL(`../_site/${path}`, import.meta.url);

for (const [part, slug, scene, count] of [
  [1, "attention-1-self-attention", "part1", 10],
  [2, "attention-2-multi-head-and-positions", "part2", 8],
  [3, "attention-3-encoder-block", "part3", 7],
  [4, "attention-4-decoder-and-training", "part4", 9],
  [5, "attention-5-inference", "part5", 8],
]) {
  test(`part ${part} renders its scrolly steps, scripts and series navigation`, async () => {
    const html = await readFile(site(`blog/2026/${slug}/index.html`), "utf8");
    const steps = [...html.matchAll(/data-step="?([a-z0-9-]+)"?/g)].map((m) => m[1]);
    assert.equal(steps.length, count, "number of steps");
    assert.equal(new Set(steps).size, steps.length, "step ids are unique");
    assert.match(html, new RegExp(`data-tf-scene="?${scene}"?`));
    for (const file of ["tf-math.js", "tf-view.js", `${scene}.js`, "tf-scrolly.js"]) assert.match(html, new RegExp(`transformer/${file}`));
    assert.match(html, /class="?tf-series"?/);
    // every part ends with "why" questions; parts 1 and 5 also mount standalone figures
    assert.match(html, /id="?going-deeper"?/);
    const figures = { 1: ["dk"], 5: ["heads", "kvcalc", "masks"] }[part] || [];
    for (const name of figures) assert.match(html, new RegExp(`data-tf-figure="?${name}"?`));
    if (figures.length) assert.match(html, /transformer\/tf-figures\.js/);
    // the prose of every step is server-rendered markdown, readable without JavaScript
    assert.doesNotMatch(html, /\*\*[A-Z][^*]+\*\*/);
  });
}
