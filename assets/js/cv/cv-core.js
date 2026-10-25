// The maths for the "Deep learning for computer vision" series: the CIFAR-10 photos, seeded toy points, and the models the
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

  /* ---------------------------------------------------------------- photos */

  // A small subset of CIFAR-10 (Krizhevsky, 2009): 32 × 32 colour photos of four of its ten classes, packed into
  // one PNG (assets/img/cv/cifar-subset.png), PHOTOS.cols to a row, in the order train, val, test, with the classes
  // interleaved 0, 1, 2, 3, 0, … A photo is { label, px, vec, grey }: px its 3072 bytes in row-major RGB order,
  // vec the same as numbers 0 … 1 (the input to k-NN and the linear classifier), grey a 32 × 32 brightness grid.
  const PHOTOS = {
    side: 32,
    cols: 32,
    classes: ["plane", "car", "frog", "ship"],
    splits: { train: 80, val: 20, test: 25 }, // per class
  };

  // rgba: the atlas's pixels (4 bytes each), width: its width in pixels.
  function photosFrom(rgba, width) {
    const { side, cols, classes, splits } = PHOTOS;
    const C = classes.length;
    let k = 0;
    const out = {};
    Object.entries(splits).forEach(([name, per]) => {
      out[name] = Array.from({ length: per * C }, (_, i) => {
        const x0 = ((k + i) % cols) * side;
        const y0 = Math.floor((k + i) / cols) * side;
        const px = new Uint8Array(side * side * 3);
        for (let r = 0; r < side; r++)
          for (let c = 0; c < side; c++) for (let ch = 0; ch < 3; ch++) px[(r * side + c) * 3 + ch] = rgba[((y0 + r) * width + x0 + c) * 4 + ch];
        return photo(px, i % C);
      });
      k += per * C;
    });
    return out;
  }

  function photo(px, label) {
    const side = PHOTOS.side;
    const vec = Array.from(px, (v) => v / 255);
    const grey = Array.from({ length: side }, (_, r) =>
      Array.from({ length: side }, (_, c) => {
        const k = (r * side + c) * 3;
        return 0.299 * vec[k] + 0.587 * vec[k + 1] + 0.114 * vec[k + 2];
      })
    );
    return { label, px, vec, grey };
  }

  // A photo moved by (dr, dc) pixels, the gap filled with black.
  function shiftPhoto(p, dr, dc) {
    const side = PHOTOS.side;
    const px = new Uint8Array(p.px.length);
    for (let r = 0; r < side; r++)
      for (let c = 0; c < side; c++) {
        const rr = r - dr;
        const cc = c - dc;
        if (rr < 0 || cc < 0 || rr >= side || cc >= side) continue;
        for (let ch = 0; ch < 3; ch++) px[(r * side + c) * 3 + ch] = p.px[(rr * side + cc) * 3 + ch];
      }
    return photo(px, p.label);
  }

  // The average of some photos' vecs, and a photo's vec with that average taken away: the linear classifier's input,
  // as in CS231n, which subtracts the mean training image before anything else.
  function meanVec(photos) {
    const mean = new Array(photos[0].vec.length).fill(0);
    photos.forEach((p) => p.vec.forEach((v, i) => (mean[i] += v / photos.length)));
    return mean;
  }
  const centred = (p, mean) => p.vec.map((v, i) => v - mean[i]);

  // Part 2's classifiers, trained offline (assets/json/cv/linear-photos.json): one per λ, each W stored as int8
  // bytes (base64) times one scale. bytes(base64) → Int8Array.
  function linearModels(json, bytes) {
    return json.models.map((m) => {
      const q = bytes(m.W);
      const d = q.length / m.b.length;
      const W = m.b.map((_, j) => Array.from(q.subarray(j * d, (j + 1) * d), (v) => v * m.scale));
      return { reg: m.reg, W, b: m.b };
    });
  }

  /* ---------------------------------------------------------------- nearest neighbours */

  const l1 = (a, b) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);
  const l2 = (a, b) => Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
  const METRICS = { L1: l1, L2: l2 };

  // Every training example sorted by its distance to x (a flat vector), nearest first.
  function ranked(train, x, metric = "L1") {
    return train.map((ex, i) => ({ i, label: ex.label, d: METRICS[metric](ex.vec ?? flat(ex.img), x) })).sort((a, b) => a.d - b.d || a.i - b.i);
  }

  // A majority vote among the k nearest; a tie goes to the class whose nearest member is closest.
  function vote(order, k, classes = PHOTOS.classes.length) {
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
    double: { f: (a) => 2 * a, df: () => [2] },
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

  // Hand-made 3 × 3 edge filters for the photos: each one's weights add up to 0, so a flat patch gives 0 and only a
  // change in brightness, in the filter's direction, gives a response (positive dark → light, negative light → dark).
  const EDGES = {
    vertical: [
      [-1, 0, 1],
      [-1, 0, 1],
      [-1, 0, 1],
    ],
    horizontal: [
      [-1, -1, -1],
      [0, 0, 0],
      [1, 1, 1],
    ],
    "diagonal \\": [
      [0, 1, 1],
      [-1, 0, 1],
      [-1, -1, 0],
    ],
    "diagonal /": [
      [1, 1, 0],
      [1, 0, -1],
      [0, -1, -1],
    ],
  };

  /* ---------------------------------------------------------------- part 5's convnet on the photos */

  // Trained offline (assets/json/cv/convnet-photos.json): two conv layers of 3 × 3 filters with padding 1, each
  // followed by ReLU; a 2 × 2 max pool after the first; the largest value of each of the second layer's maps; and a
  // linear layer to the four scores. Weights are int8 bytes (base64) times one scale per array. bytes(base64) → Int8Array.
  function photoNet(json, bytes) {
    const deq = (o) => Float32Array.from(bytes(o.q), (v) => v * o.scale);
    return {
      chMean: json.chMean,
      layers: json.layers.map((l) => ({ K: l.K, C: l.C, w: deq(l.w), b: Float32Array.from(l.b) })),
      fc: { w: deq(json.fc.w), b: Float32Array.from(json.fc.b) },
    };
  }

  // One conv layer on C × H × W numbers (channel by channel), padding 1, stride 1, then ReLU.
  function convLayer(x, H, W, l) {
    const { K, C, w, b } = l;
    const HW = H * W;
    const y = new Float32Array(K * HW);
    for (let k = 0; k < K; k++) {
      y.fill(b[k], k * HW, (k + 1) * HW);
      for (let c = 0; c < C; c++)
        for (let a = 0; a < 3; a++)
          for (let d = 0; d < 3; d++) {
            const wv = w[((k * C + c) * 3 + a) * 3 + d];
            for (let i = Math.max(0, 1 - a); i < Math.min(H, H + 1 - a); i++)
              for (let j = Math.max(0, 1 - d); j < Math.min(W, W + 1 - d); j++) y[k * HW + i * W + j] += wv * x[c * HW + (i + a - 1) * W + j + d - 1];
          }
    }
    return y.map((v) => Math.max(0, v));
  }

  // The scores, and the steps on the way: the first layer's maps (as grids), and the second layer's maxima.
  function photoNetForward(net, p) {
    const side = PHOTOS.side;
    const x = new Float32Array(3 * side * side);
    for (let i = 0; i < side * side; i++) for (let c = 0; c < 3; c++) x[c * side * side + i] = p.vec[i * 3 + c] - net.chMean[c];
    const [l1, l2] = net.layers;
    const y1 = convLayer(x, side, side, l1);
    const half = side / 2;
    const pooled = new Float32Array(l1.K * half * half);
    for (let k = 0; k < l1.K; k++)
      for (let i = 0; i < half; i++)
        for (let j = 0; j < half; j++) {
          const at = (a, b) => y1[k * side * side + (2 * i + a) * side + 2 * j + b];
          pooled[k * half * half + i * half + j] = Math.max(at(0, 0), at(0, 1), at(1, 0), at(1, 1));
        }
    const y2 = convLayer(pooled, half, half, l2);
    const feats = Array.from({ length: l2.K }, (_, k) => Math.max(...y2.subarray(k * half * half, (k + 1) * half * half)));
    const scores = net.fc.b.map((bj, j) => feats.reduce((a, f, k) => a + net.fc.w[j * l2.K + k] * f, bj));
    const maps = Array.from({ length: l1.K }, (_, k) =>
      Array.from({ length: side }, (_, r) => Array.from(y1.subarray(k * side * side + r * side, k * side * side + (r + 1) * side)))
    );
    return { maps, feats, scores: Array.from(scores) };
  }

  const CV = {
    rng,
    zeros,
    dot,
    argmax,
    PHOTOS,
    photosFrom,
    photo,
    shiftPhoto,
    meanVec,
    centred,
    linearModels,
    EDGES,
    photoNet,
    convLayer,
    photoNetForward,
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
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CV;
  else {
    root.CV = CV;
    root.TF = root.TF || {};
  }
})(typeof window !== "undefined" ? window : globalThis);
