// The maths for the "Deep learning for computer vision" series: seeded toy images and points, and the models the
// series builds (nearest neighbours, linear classifiers, small neural networks, convolutions), written so every
// intermediate step can be drawn. Classic script: it sets window.CV in the browser and module.exports in Node, so
// the numbers quoted in the posts can be checked from the command line.
(function (root) {
  "use strict";

  /* ---------------------------------------------------------------- random numbers */

  // mulberry32 with Box–Muller normals: the same generator as the clustering series.
  function rng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let spare = null;
    return {
      next,
      normal() {
        if (spare !== null) {
          const v = spare;
          spare = null;
          return v;
        }
        const u = Math.max(next(), 1e-12);
        const r = Math.sqrt(-2 * Math.log(u));
        const th = 2 * Math.PI * next();
        spare = r * Math.sin(th);
        return r * Math.cos(th);
      },
      int: (n) => Math.floor(next() * n),
    };
  }

  const zeros = (r, c) => Array.from({ length: r }, () => new Array(c).fill(0));
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  const argmax = (v) => v.reduce((best, x, i) => (x > v[best] ? i : best), 0);

  /* ---------------------------------------------------------------- tiny images */

  // 8 × 8 grey images, ink 1 on paper 0, of four kinds of shape. Each shape lands at a random spot, with random
  // brightness and a little noise, so no two images are the same. An image is a list of 8 rows of 8 numbers.
  const SIDE = 8;
  const CLASSES = ["vertical", "horizontal", "diagonal", "box"];

  function drawShape(kind, rand) {
    const img = zeros(SIDE, SIDE);
    const ink = 0.75 + 0.25 * rand.next();
    const put = (r, c) => {
      if (r >= 0 && r < SIDE && c >= 0 && c < SIDE) img[r][c] = ink;
    };
    if (kind === 0 || kind === 1) {
      // a bar 2 wide and 5 or 6 long
      const len = 5 + rand.int(2);
      const across = rand.int(SIDE - 1);
      const along = rand.int(SIDE - len + 1);
      for (let k = 0; k < len; k++) for (let w = 0; w < 2; w++) kind === 0 ? put(along + k, across + w) : put(across + w, along + k);
    } else if (kind === 2) {
      // a "\" stroke 2 wide, slid left or right
      const shift = rand.int(5) - 2;
      for (let r = 0; r < SIDE; r++) {
        put(r, r + shift);
        put(r, r + shift + 1);
      }
    } else {
      // the outline of a square, 4 or 5 on a side
      const size = 4 + rand.int(2);
      const r0 = rand.int(SIDE - size + 1);
      const c0 = rand.int(SIDE - size + 1);
      for (let k = 0; k < size; k++) {
        put(r0, c0 + k);
        put(r0 + size - 1, c0 + k);
        put(r0 + k, c0);
        put(r0 + k, c0 + size - 1);
      }
    }
    return img.map((row) => row.map((v) => Math.min(1, Math.max(0, v + 0.08 * rand.normal()))));
  }

  // A split of `perClass` images of each kind, in the order 0, 1, 2, 3, 0, 1, … The splits use different seeds.
  function images(perClass, seed) {
    const rand = rng(seed);
    const out = [];
    for (let i = 0; i < perClass; i++)
      CLASSES.forEach((_, label) => {
        out.push({ img: drawShape(label, rand), label });
      });
    return out;
  }

  const SPLITS = { train: [16, 11], val: [8, 22], test: [10, 33] };
  const split = (name) => images(...SPLITS[name]);

  const flat = (img) => img.flat();
  const unflat = (v, side = SIDE) => Array.from({ length: side }, (_, r) => v.slice(r * side, (r + 1) * side));

  // Moves an image by (dr, dc) pixels, filling the gap with paper.
  const shift = (img, dr, dc) => img.map((row, r) => row.map((_, c) => img[r - dr]?.[c - dc] ?? 0));

  /* ---------------------------------------------------------------- nearest neighbours */

  const l1 = (a, b) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);
  const l2 = (a, b) => Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
  const METRICS = { L1: l1, L2: l2 };

  // Every training example sorted by its distance to x (a flat vector), nearest first.
  function ranked(train, x, metric = "L1") {
    return train.map((ex, i) => ({ i, label: ex.label, d: METRICS[metric](ex.vec ?? flat(ex.img), x) })).sort((a, b) => a.d - b.d || a.i - b.i);
  }

  // A majority vote among the k nearest; a tie goes to the class whose nearest member is closest.
  function vote(order, k, classes = CLASSES.length) {
    const counts = new Array(classes).fill(0);
    order.slice(0, k).forEach((r) => counts[r.label]++);
    const top = Math.max(...counts);
    const winner = order.find((r) => counts[r.label] === top).label;
    return { counts, label: winner };
  }

  function knnAccuracy(train, test, k, metric = "L1") {
    const right = test.filter((ex) => vote(ranked(train, ex.vec ?? flat(ex.img), metric), k).label === ex.label).length;
    return right / test.length;
  }

  /* ---------------------------------------------------------------- 2-D points */

  // Points live in the square [0, 10]², like the clustering series, so its scatter plot can draw them. Models see
  // them centred and scaled to about [−1, 1]: input(p) = (p − 5) / 5.
  const BOX = 10;
  const input = (p) => [(p[0] - 5) / 5, (p[1] - 5) / 5];
  const inBox = (v) => Math.min(BOX - 0.15, Math.max(0.15, v));

  function blobs(seed = 1, perClass = 30) {
    const rand = rng(seed);
    const centres = [
      [3, 7.2],
      [7.2, 6.6],
      [5, 2.6],
    ];
    const points = [];
    const labels = [];
    for (let i = 0; i < perClass; i++)
      centres.forEach(([cx, cy], label) => {
        points.push([inBox(cx + rand.normal()), inBox(cy + rand.normal())]);
        labels.push(label);
      });
    return { points, labels, classes: 3 };
  }

  // The spiral from the CS231n case study: K arms of N points, radius 0 → 1, angle sweeping 4 radians plus noise.
  function spiral(seed = 1, perClass = 60, classes = 3) {
    const rand = rng(seed);
    const points = [];
    const labels = [];
    for (let j = 0; j < classes; j++)
      for (let i = 0; i < perClass; i++) {
        const r = i / (perClass - 1);
        const t = j * 4 + (4 * i) / (perClass - 1) + 0.2 * rand.normal();
        points.push([5 + 4.6 * r * Math.sin(t), 5 + 4.6 * r * Math.cos(t)]);
        labels.push(j);
      }
    return { points, labels, classes };
  }

  /* ---------------------------------------------------------------- losses */

  // Multiclass SVM (hinge) loss for one example: Σ_{j ≠ y} max(0, s_j − s_y + 1).
  function hinge(scores, y, margin = 1) {
    const terms = scores.map((sj, j) => (j === y ? 0 : Math.max(0, sj - scores[y] + margin)));
    return { terms, loss: terms.reduce((a, b) => a + b, 0) };
  }

  // Softmax: exponentiate, normalise. The cross-entropy loss is −log p_y.
  function softmax(scores) {
    const m = Math.max(...scores);
    const e = scores.map((v) => Math.exp(v - m));
    const z = e.reduce((a, b) => a + b, 0);
    return e.map((v) => v / z);
  }
  const crossEntropy = (scores, y) => -Math.log(softmax(scores)[y]);

  /* ---------------------------------------------------------------- a linear classifier */

  // scores = W x + b, W is classes × d. Trained with softmax loss + L2 penalty by full-batch gradient descent.
  function linearScores(model, x) {
    return model.W.map((row, j) => dot(row, x) + model.b[j]);
  }

  // The average loss over the data and its gradient. kind "softmax" or "svm".
  function linearLoss(model, X, y, reg = 0, kind = "softmax") {
    const C = model.W.length;
    const d = model.W[0].length;
    const dW = zeros(C, d);
    const db = new Array(C).fill(0);
    let loss = 0;
    X.forEach((x, n) => {
      const sc = linearScores(model, x);
      const g = new Array(C).fill(0);
      if (kind === "softmax") {
        const p = softmax(sc);
        loss -= Math.log(p[y[n]]);
        p.forEach((pj, j) => (g[j] = pj - (j === y[n] ? 1 : 0)));
      } else {
        const h = hinge(sc, y[n]);
        loss += h.loss;
        h.terms.forEach((tj, j) => {
          if (tj > 0) {
            g[j] += 1;
            g[y[n]] -= 1;
          }
        });
      }
      g.forEach((gj, j) => {
        db[j] += gj;
        for (let k = 0; k < d; k++) dW[j][k] += gj * x[k];
      });
    });
    const N = X.length;
    const penalty = 0.5 * reg * model.W.flat().reduce((a, v) => a + v * v, 0);
    return {
      loss: loss / N + penalty,
      dW: dW.map((row, j) => row.map((v, k) => v / N + reg * model.W[j][k])),
      db: db.map((v) => v / N),
    };
  }

  function trainLinear(X, y, classes, opts = {}) {
    const { steps = 300, lr = 0.5, reg = 1e-3, seed = 1, kind = "softmax" } = opts;
    const rand = rng(seed);
    const d = X[0].length;
    const model = { W: zeros(classes, d).map((row) => row.map(() => 0.01 * rand.normal())), b: new Array(classes).fill(0) };
    const history = [];
    for (let t = 0; t < steps; t++) {
      const { loss, dW, db } = linearLoss(model, X, y, reg, kind);
      history.push(loss);
      model.W = model.W.map((row, j) => row.map((v, k) => v - lr * dW[j][k]));
      model.b = model.b.map((v, j) => v - lr * db[j]);
    }
    return { model, history };
  }

  const accuracy = (predict, X, y) => X.filter((x, n) => predict(x) === y[n]).length / X.length;

  /* ---------------------------------------------------------------- a two-parameter loss surface */

  // Part 3's toy: logistic regression with two weights and no bias on two classes of points, one stretched along
  // a long axis. The loss over (w1, w2) is a long, narrow valley, which is what makes plain gradient descent slow.
  function valleyData(seed = 3, perClass = 40) {
    const rand = rng(seed);
    const X = [];
    const y = [];
    for (let i = 0; i < 2 * perClass; i++) {
      const label = i % 2;
      const a = (label ? 0.5 : -0.5) + 0.6 * rand.normal();
      X.push([2.5 * a + rand.normal(), 0.3 * a + 0.15 * rand.normal()]);
      y.push(label);
    }
    return { X, y };
  }

  const sigmoid = (z) => 1 / (1 + Math.exp(-z));

  // Mean logistic loss + reg/2 ‖w‖² over the given rows (all, if idx is null), and its gradient.
  function valleyLoss(data, w, reg = 0.01, idx = null) {
    const rows = idx ?? data.X.map((_, i) => i);
    let loss = 0;
    const g = [0, 0];
    rows.forEach((i) => {
      const x = data.X[i];
      const z = w[0] * x[0] + w[1] * x[1];
      const p = sigmoid(z);
      const yi = data.y[i];
      loss += -(yi * Math.log(Math.max(p, 1e-12)) + (1 - yi) * Math.log(Math.max(1 - p, 1e-12)));
      g[0] += (p - yi) * x[0];
      g[1] += (p - yi) * x[1];
    });
    const n = rows.length;
    return {
      loss: loss / n + 0.5 * reg * (w[0] ** 2 + w[1] ** 2),
      grad: [g[0] / n + reg * w[0], g[1] / n + reg * w[1]],
    };
  }

  // Runs an optimiser from `start` and returns the path of weights and the full-data loss at each point.
  // kind: "gd", "sgd", "momentum", "adam". batch is the minibatch size for the stochastic ones.
  function optimise(data, kind, opts = {}) {
    const { lr = 0.5, steps = 60, start = [-3.5, 4], batch = 8, beta = 0.9, beta2 = 0.999, seed = 1, reg = 0.01 } = opts;
    const rand = rng(seed);
    const n = data.X.length;
    let w = start.slice();
    let v = [0, 0];
    let m2 = [0, 0];
    const path = [w.slice()];
    const losses = [valleyLoss(data, w, reg).loss];
    for (let t = 1; t <= steps; t++) {
      const idx = kind === "gd" ? null : Array.from({ length: batch }, () => rand.int(n));
      const { grad } = valleyLoss(data, w, reg, idx);
      if (kind === "gd" || kind === "sgd") w = [w[0] - lr * grad[0], w[1] - lr * grad[1]];
      else if (kind === "momentum") {
        v = [beta * v[0] + grad[0], beta * v[1] + grad[1]];
        w = [w[0] - lr * v[0], w[1] - lr * v[1]];
      } else {
        v = [beta * v[0] + (1 - beta) * grad[0], beta * v[1] + (1 - beta) * grad[1]];
        m2 = [beta2 * m2[0] + (1 - beta2) * grad[0] ** 2, beta2 * m2[1] + (1 - beta2) * grad[1] ** 2];
        const vh = v.map((x) => x / (1 - beta ** t));
        const mh = m2.map((x) => x / (1 - beta2 ** t));
        w = [w[0] - (lr * vh[0]) / (Math.sqrt(mh[0]) + 1e-8), w[1] - (lr * vh[1]) / (Math.sqrt(mh[1]) + 1e-8)];
      }
      path.push(w.slice());
      losses.push(valleyLoss(data, w, reg).loss);
    }
    return { path, losses };
  }

  // The lowest point of the valley, by many small gradient steps.
  function valleyMin(data, reg = 0.01) {
    let w = [0, 0];
    for (let t = 0; t < 20000; t++) {
      const { grad } = valleyLoss(data, w, reg);
      w = [w[0] - 0.5 * grad[0], w[1] - 0.5 * grad[1]];
    }
    return { w, loss: valleyLoss(data, w, reg).loss };
  }

  /* ---------------------------------------------------------------- computational graphs */

  // A graph is a list of nodes in forward order: { id, op, inputs: [ids], value?, label }. op is "input" or one
  // of the ops below. forward() fills node.value; backward() fills node.grad, starting from the last node.
  const OPS = {
    add: { f: (a, b) => a + b, df: () => [1, 1] },
    mul: { f: (a, b) => a * b, df: (a, b) => [b, a] },
    max: { f: (a, b) => Math.max(a, b), df: (a, b) => (a >= b ? [1, 0] : [0, 1]) },
    neg: { f: (a) => -a, df: () => [-1] },
    exp: { f: (a) => Math.exp(a), df: (a) => [Math.exp(a)] },
    addc: { f: (a) => a + 1, df: () => [1] },
    inv: { f: (a) => 1 / a, df: (a) => [-1 / (a * a)] },
    sigmoid: { f: sigmoid, df: (a) => [sigmoid(a) * (1 - sigmoid(a))] },
  };

  function forward(graph) {
    const byId = Object.fromEntries(graph.map((n) => [n.id, n]));
    graph.forEach((n) => {
      if (n.op !== "input") n.value = OPS[n.op].f(...n.inputs.map((id) => byId[id].value));
    });
    return graph;
  }

  // Returns the order the backward pass visits nodes in, each with its local gradients and the upstream one.
  function backward(graph) {
    const byId = Object.fromEntries(graph.map((n) => [n.id, n]));
    graph.forEach((n) => (n.grad = 0));
    const out = graph[graph.length - 1];
    out.grad = 1;
    const visits = [];
    for (let k = graph.length - 1; k >= 0; k--) {
      const n = graph[k];
      if (n.op === "input") continue;
      const local = OPS[n.op].df(...n.inputs.map((id) => byId[id].value));
      n.inputs.forEach((id, i) => (byId[id].grad += local[i] * n.grad));
      visits.push({ id: n.id, upstream: n.grad, local });
    }
    return visits;
  }

  /* ---------------------------------------------------------------- a two-layer network */

  // scores = W2 · relu(W1 x + b1) + b2, trained with softmax loss + L2 by full-batch Adam. Returns snapshots of
  // the model at the requested steps, so a figure can show training as it goes.
  function initNet(d, hidden, classes, seed) {
    const rand = rng(seed);
    const he = (fanIn) => Math.sqrt(2 / fanIn);
    return {
      W1: zeros(hidden, d).map((row) => row.map(() => he(d) * rand.normal())),
      b1: new Array(hidden).fill(0),
      W2: zeros(classes, hidden).map((row) => row.map(() => he(hidden) * rand.normal())),
      b2: new Array(classes).fill(0),
    };
  }

  function netForward(net, x) {
    const pre = net.W1.map((row, j) => dot(row, x) + net.b1[j]);
    const hid = pre.map((v) => Math.max(0, v));
    const scores = net.W2.map((row, j) => dot(row, hid) + net.b2[j]);
    return { pre, hid, scores };
  }

  const clone = (net) => JSON.parse(JSON.stringify(net));

  // Adam (β1 = 0.9, β2 = 0.999) over a model made of nested arrays of numbers. step(params, grads, lr, t) updates
  // params in place; t counts from 1.
  function adamState(params) {
    const zero = (a) => (Array.isArray(a) ? a.map(zero) : 0);
    const m = {};
    const v = {};
    Object.keys(params).forEach((key) => {
      m[key] = zero(params[key]);
      v[key] = zero(params[key]);
    });
    const go = (p, g, mm, vv, lr, t) => {
      for (let i = 0; i < p.length; i++) {
        if (Array.isArray(p[i])) go(p[i], g[i], mm[i], vv[i], lr, t);
        else {
          mm[i] = 0.9 * mm[i] + 0.1 * g[i];
          vv[i] = 0.999 * vv[i] + 0.001 * g[i] * g[i];
          p[i] -= (lr * (mm[i] / (1 - 0.9 ** t))) / (Math.sqrt(vv[i] / (1 - 0.999 ** t)) + 1e-8);
        }
      }
    };
    return { step: (params, grads, lr, t) => Object.keys(params).forEach((key) => go(params[key], grads[key], m[key], v[key], lr, t)) };
  }

  function netLoss(net, X, y, reg) {
    const g = { W1: net.W1.map((r) => r.map(() => 0)), b1: net.b1.map(() => 0), W2: net.W2.map((r) => r.map(() => 0)), b2: net.b2.map(() => 0) };
    let loss = 0;
    X.forEach((x, n) => {
      const { pre, hid, scores } = netForward(net, x);
      const p = softmax(scores);
      loss -= Math.log(p[y[n]]);
      const ds = p.map((v, j) => v - (j === y[n] ? 1 : 0));
      const dh = new Array(hid.length).fill(0);
      ds.forEach((dj, j) => {
        g.b2[j] += dj;
        hid.forEach((hv, k) => {
          g.W2[j][k] += dj * hv;
          dh[k] += dj * net.W2[j][k];
        });
      });
      dh.forEach((dk, k) => {
        if (pre[k] <= 0) return; // ReLU: no gradient where the unit was off
        g.b1[k] += dk;
        x.forEach((xv, i) => (g.W1[k][i] += dk * xv));
      });
    });
    const N = X.length;
    let penalty = 0;
    ["W1", "W2"].forEach((key) =>
      net[key].forEach((row, j) =>
        row.forEach((v, k) => {
          penalty += 0.5 * reg * v * v;
          g[key][j][k] = g[key][j][k] / N + reg * v;
        })
      )
    );
    g.b1 = g.b1.map((v) => v / N);
    g.b2 = g.b2.map((v) => v / N);
    return { loss: loss / N + penalty, grad: g };
  }

  function trainNet(X, y, classes, opts = {}) {
    const { hidden = 40, steps = 600, lr = 0.02, reg = 1e-3, seed = 1, snapshots = [] } = opts;
    const net = initNet(X[0].length, hidden, classes, seed);
    const adam = adamState(net);
    const shots = { 0: clone(net) };
    const history = [];
    for (let t = 1; t <= steps; t++) {
      const { loss, grad } = netLoss(net, X, y, reg);
      history.push(loss);
      adam.step(net, grad, lr, t);
      if (snapshots.includes(t)) shots[t] = clone(net);
    }
    history.push(netLoss(net, X, y, reg).loss);
    return { net, history, shots };
  }

  const netPredict = (net) => (x) => argmax(netForward(net, x).scores);

  /* ---------------------------------------------------------------- convolution */

  // Valid cross-correlation (what deep-learning libraries call convolution) of a 2-D image with a k × k filter,
  // with a stride and zero padding. Returns the output map and, for drawing, the window of each output cell.
  function conv2d(img, filter, { stride = 1, pad = 0, bias = 0 } = {}) {
    const H = img.length;
    const W = img[0].length;
    const k = filter.length;
    const at = (r, c) => (r < 0 || c < 0 || r >= H || c >= W ? 0 : img[r][c]);
    const outH = Math.floor((H - k + 2 * pad) / stride) + 1;
    const outW = Math.floor((W - k + 2 * pad) / stride) + 1;
    const out = zeros(outH, outW);
    for (let i = 0; i < outH; i++)
      for (let j = 0; j < outW; j++) {
        let sum = bias;
        for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) sum += filter[a][b] * at(i * stride - pad + a, j * stride - pad + b);
        out[i][j] = sum;
      }
    return out;
  }

  const relu2d = (M) => M.map((row) => row.map((v) => Math.max(0, v)));

  function maxPool(M, size = 2) {
    const outH = Math.floor(M.length / size);
    const outW = Math.floor(M[0].length / size);
    return Array.from({ length: outH }, (_, i) =>
      Array.from({ length: outW }, (_, j) => {
        let best = -Infinity;
        for (let a = 0; a < size; a++) for (let b = 0; b < size; b++) best = Math.max(best, M[i * size + a][j * size + b]);
        return best;
      })
    );
  }

  // Hand-made 3 × 3 filters: each lights up on one kind of stroke.
  const FILTERS = {
    vertical: [
      [-1, 2, -1],
      [-1, 2, -1],
      [-1, 2, -1],
    ],
    horizontal: [
      [-1, -1, -1],
      [2, 2, 2],
      [-1, -1, -1],
    ],
    diagonal: [
      [2, -1, -1],
      [-1, 2, -1],
      [-1, -1, 2],
    ],
    corner: [
      [2, 2, 2],
      [2, -1, -1],
      [2, -1, -1],
    ],
  };

  // A tiny convolutional network: four learned 3 × 3 filters (padding 1), ReLU, a global max over each map, and a
  // linear layer to four scores. Trained with softmax loss by Adam. The global max is what makes it ignore where
  // in the image a shape is.
  function initConvNet(filters, classes, seed) {
    const rand = rng(seed);
    return {
      F: Array.from({ length: filters }, () => zeros(3, 3).map((row) => row.map(() => 0.4 * rand.normal()))),
      fb: new Array(filters).fill(0),
      W: zeros(classes, filters).map((row) => row.map(() => 0.5 * rand.normal())),
      b: new Array(classes).fill(0),
    };
  }

  function convNetForward(net, img) {
    const maps = net.F.map((f, q) => conv2d(img, f, { pad: 1, bias: net.fb[q] }));
    const pooled = maps.map((M) => {
      let best = -Infinity;
      let where = [0, 0];
      M.forEach((row, r) => row.forEach((v, c) => v > best && ((best = v), (where = [r, c]))));
      return { value: Math.max(0, best), where, on: best > 0 };
    });
    const feats = pooled.map((p) => p.value);
    const scores = net.W.map((row, j) => dot(row, feats) + net.b[j]);
    return { maps, pooled, feats, scores };
  }

  function convNetGrad(net, data, reg) {
    const g = {
      F: net.F.map((f) => f.map((r) => r.map(() => 0))),
      fb: net.fb.map(() => 0),
      W: net.W.map((r) => r.map(() => 0)),
      b: net.b.map(() => 0),
    };
    let loss = 0;
    data.forEach(({ img, label }) => {
      const { pooled, feats, scores } = convNetForward(net, img);
      const p = softmax(scores);
      loss -= Math.log(p[label]);
      const ds = p.map((v, j) => v - (j === label ? 1 : 0));
      const df = new Array(feats.length).fill(0);
      ds.forEach((dj, j) => {
        g.b[j] += dj;
        feats.forEach((fv, q) => {
          g.W[j][q] += dj * fv;
          df[q] += dj * net.W[j][q];
        });
      });
      // the gradient flows only into the winning window of each map, and only if the ReLU was on
      pooled.forEach((pq, q) => {
        if (!pq.on) return;
        const [r, c] = pq.where;
        g.fb[q] += df[q];
        for (let a = 0; a < 3; a++)
          for (let b = 0; b < 3; b++) {
            const rr = r - 1 + a;
            const cc = c - 1 + b;
            if (rr >= 0 && cc >= 0 && rr < SIDE && cc < SIDE) g.F[q][a][b] += df[q] * img[rr][cc];
          }
      });
    });
    const N = data.length;
    const scale = (a, key) => a.map((v) => (Array.isArray(v) ? scale(v, key) : v / N));
    ["F", "fb", "W", "b"].forEach((key) => (g[key] = scale(g[key], key)));
    net.F.forEach((f, q) => f.forEach((row, a) => row.forEach((v, b) => (g.F[q][a][b] += reg * v))));
    net.W.forEach((row, j) => row.forEach((v, q) => (g.W[j][q] += reg * v)));
    return { loss: loss / N, grad: g };
  }

  function trainConvNet(data, opts = {}) {
    const { filters = 4, steps = 400, lr = 0.03, reg = 1e-3, seed = 1 } = opts;
    const net = initConvNet(filters, CLASSES.length, seed);
    const adam = adamState(net);
    const history = [];
    for (let t = 1; t <= steps; t++) {
      const { loss, grad } = convNetGrad(net, data, reg);
      history.push(loss);
      adam.step(net, grad, lr, t);
    }
    return { net, history };
  }

  const convNetPredict = (net) => (img) => argmax(convNetForward(net, img).scores);

  const CV = {
    rng,
    zeros,
    dot,
    argmax,
    SIDE,
    CLASSES,
    split,
    flat,
    unflat,
    shift,
    l1,
    l2,
    METRICS,
    ranked,
    vote,
    knnAccuracy,
    BOX,
    input,
    blobs,
    spiral,
    hinge,
    softmax,
    crossEntropy,
    linearScores,
    linearLoss,
    trainLinear,
    accuracy,
    valleyData,
    valleyLoss,
    optimise,
    valleyMin,
    sigmoid,
    OPS,
    forward,
    backward,
    initNet,
    netForward,
    netLoss,
    trainNet,
    netPredict,
    conv2d,
    relu2d,
    maxPool,
    FILTERS,
    convNetForward,
    trainConvNet,
    convNetPredict,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CV;
  else {
    root.CV = CV;
    root.TF = root.TF || {};
  }
})(typeof window !== "undefined" ? window : globalThis);
