// The maths for the "Diffusion models from scratch" series: seeded 2D datasets, noise schedules, the forward
// process, a small neural network that learns to undo it, and the samplers. Classic script (not an ES module): it
// sets window.DM in the browser and module.exports in Node, so the numbers quoted in the posts (and the shipped
// weights) can be checked and rebuilt from the command line with bin/dm-pretrain.js.
//
// Every dataset is a mixture of small round Gaussians. That makes the forward process exact in closed form: after
// noising, each component is still a round Gaussian, so the true noisy density, its score and the best possible
// denoiser can all be computed. The network never sees those; they are the answer key it is measured against.
(function (root) {
  "use strict";

  /* ---------------------------------------------------------------- random numbers */

  // mulberry32: a tiny seeded generator, so a figure shows the same "random" points on every visit.
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
      // Box–Muller, keeping the second value for the next call
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

  // Picks an index with probability proportional to w (w sums to 1).
  function pick(rand, w) {
    let u = rand.next();
    for (let k = 0; k < w.length - 1; k++) {
      u -= w[k];
      if (u < 0) return k;
    }
    return w.length - 1;
  }

  /* ---------------------------------------------------------------- datasets */

  // A dataset is { label, weights, means, sd, classes? }: components k with weight w_k, centre μ_k and spread sd_k.
  // Points live near the origin with a spread of about 1, like the standard Gaussian they will be noised into.

  // The Swiss roll of Sohl-Dickstein et al. (2015), Figure 1: the curve (t cos t, t sin t) for t from 1.5π to 4.5π
  // (the same range as scikit-learn's make_swiss_roll), scaled down by 7 and laid out as 160 small blobs.
  function swissRoll() {
    const K = 160;
    const means = [];
    for (let k = 0; k < K; k++) {
      const t = 1.5 * Math.PI * (1 + (2 * (k + 0.5)) / K);
      means.push([(t * Math.cos(t)) / 7, (t * Math.sin(t)) / 7]);
    }
    // centre it on the origin
    const cx = means.reduce((sum, m) => sum + m[0], 0) / K;
    const cy = means.reduce((sum, m) => sum + m[1], 0) / K;
    means.forEach((m) => {
      m[0] -= cx;
      m[1] -= cy;
    });
    return { label: "Swiss roll", weights: means.map(() => 1 / K), means, sd: means.map(() => 0.07) };
  }

  const DATASETS = {
    swissroll: swissRoll(),
    // two blobs of unequal weight: the test case for Langevin dynamics in part 5
    twomodes: {
      label: "two modes, 70/30",
      weights: [0.7, 0.3],
      means: [
        [-1.4, 0.6],
        [1.5, -0.7],
      ],
      sd: [0.35, 0.35],
    },
    // three labelled clusters for conditioning and guidance (part 9)
    clusters: {
      label: "three clusters",
      weights: [1 / 3, 1 / 3, 1 / 3],
      means: [
        [-1.3, -0.9],
        [1.3, -0.9],
        [0, 1.35],
      ],
      sd: [0.4, 0.4, 0.4],
      classes: [0, 1, 2],
    },
  };

  // n points from a dataset, as a flat Float64Array [x0, y0, x1, y1, …]. labels[i] is the component each came from.
  function sample(data, n, seed = 1) {
    const rand = rng(seed);
    const xs = new Float64Array(2 * n);
    const labels = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const k = pick(rand, data.weights);
      labels[i] = k;
      xs[2 * i] = data.means[k][0] + data.sd[k] * rand.normal();
      xs[2 * i + 1] = data.means[k][1] + data.sd[k] * rand.normal();
    }
    return { xs, labels, n };
  }

  // n standard Gaussian points: the noise every chain starts from.
  function gaussian(n, seed = 1) {
    const rand = rng(seed);
    const xs = new Float64Array(2 * n);
    for (let i = 0; i < 2 * n; i++) xs[i] = rand.normal();
    return xs;
  }

  /* ---------------------------------------------------------------- noise schedules */

  // A schedule for T steps: beta[t], alpha[t] = 1 − beta[t] and alphaBar[t] = alpha[1]·…·alpha[t], indexed 1…T, with
  // alphaBar[0] = 1 (clean data). Arrays have length T + 1; index 0 of beta and alpha is unused.
  //
  // linear: Ho et al. (2020) use beta from 1e-4 to 0.02 over T = 1000 steps. For other T we stretch the same line by
  //         1000/T, so the chain still ends at about the same noise level (alphaBar_T ≈ 4e-5).
  // cosine: Nichol and Dhariwal (2021): alphaBar_t = f(t)/f(0), f(t) = cos²(((t/T + s)/(1 + s))·π/2), s = 0.008,
  //         with each beta clipped at 0.999.
  function schedule(kind = "linear", T = 1000) {
    const beta = new Float64Array(T + 1);
    const alpha = new Float64Array(T + 1);
    const alphaBar = new Float64Array(T + 1);
    alphaBar[0] = 1;
    if (kind === "cosine") {
      const s = 0.008;
      const f = (t) => Math.cos(((t / T + s) / (1 + s)) * (Math.PI / 2)) ** 2;
      for (let t = 1; t <= T; t++) beta[t] = Math.min(1 - f(t) / f(t - 1), 0.999);
    } else {
      const k = 1000 / T;
      for (let t = 1; t <= T; t++) beta[t] = k * (1e-4 + ((0.02 - 1e-4) * (t - 1)) / Math.max(1, T - 1));
    }
    for (let t = 1; t <= T; t++) {
      alpha[t] = 1 - beta[t];
      alphaBar[t] = alphaBar[t - 1] * alpha[t];
    }
    // the posterior variance beta~_t = (1 − alphaBar_{t−1}) / (1 − alphaBar_t) · beta_t (Ho et al., eq. 7)
    const betaTilde = new Float64Array(T + 1);
    for (let t = 1; t <= T; t++) betaTilde[t] = ((1 - alphaBar[t - 1]) / (1 - alphaBar[t])) * beta[t];
    return { kind, T, beta, alpha, alphaBar, betaTilde, snr: (t) => alphaBar[t] / (1 - alphaBar[t]) };
  }

  /* ---------------------------------------------------------------- the forward process */

  // One forward step, x_t = √(1 − β_t)·x_{t−1} + √β_t·ε, applied to every point in place.
  function forwardStep(xs, sch, t, rand) {
    const a = Math.sqrt(1 - sch.beta[t]);
    const b = Math.sqrt(sch.beta[t]);
    for (let i = 0; i < xs.length; i++) xs[i] = a * xs[i] + b * rand.normal();
    return xs;
  }

  // Straight to step t: x_t = √ᾱ_t·x_0 + √(1 − ᾱ_t)·ε. Returns { xt, eps } (eps is the noise that was used).
  function qSample(x0, sch, t, seed = 7) {
    const rand = rng(seed);
    const a = Math.sqrt(sch.alphaBar[t]);
    const b = Math.sqrt(1 - sch.alphaBar[t]);
    const xt = new Float64Array(x0.length);
    const eps = new Float64Array(x0.length);
    for (let i = 0; i < x0.length; i++) {
      eps[i] = rand.normal();
      xt[i] = a * x0[i] + b * eps[i];
    }
    return { xt, eps };
  }

  // Every frame of the forward chain, one step at a time: frames[t] is a Float64Array of the points at step t.
  function forwardChain(x0, sch, seed = 11) {
    const rand = rng(seed);
    const frames = [Float64Array.from(x0)];
    let xs = Float64Array.from(x0);
    for (let t = 1; t <= sch.T; t++) {
      xs = forwardStep(Float64Array.from(xs), sch, t, rand);
      frames.push(xs);
    }
    return frames;
  }

  // The forward posterior q(x_{t−1} | x_t, x_0) = N(μ~, β~_t I), with
  // μ~ = √ᾱ_{t−1}·β_t / (1 − ᾱ_t) · x_0 + √α_t·(1 − ᾱ_{t−1}) / (1 − ᾱ_t) · x_t (Ho et al., eq. 7).
  function posterior(x0, xt, sch, t) {
    const c0 = (Math.sqrt(sch.alphaBar[t - 1]) * sch.beta[t]) / (1 - sch.alphaBar[t]);
    const ct = (Math.sqrt(sch.alpha[t]) * (1 - sch.alphaBar[t - 1])) / (1 - sch.alphaBar[t]);
    return { mean: [c0 * x0[0] + ct * xt[0], c0 * x0[1] + ct * xt[1]], variance: sch.betaTilde[t], c0, ct };
  }

  /* ---------------------------------------------------------------- the exact answer key */

  // After t steps, component k of the data is N(√ᾱ_t μ_k, (ᾱ_t sd_k² + 1 − ᾱ_t) I). The noisy density p_t is the
  // mixture of those. resp(x) gives each component's posterior weight at x, which is all the exact quantities need.
  function noisyComponents(data, ab) {
    const a = Math.sqrt(ab);
    return data.means.map((m, k) => ({
      w: data.weights[k],
      mean: [a * m[0], a * m[1]],
      v: ab * data.sd[k] ** 2 + 1 - ab,
      m0: m,
      v0: data.sd[k] ** 2,
    }));
  }

  function responsibilities(comps, x, y) {
    let best = -Infinity;
    const logs = comps.map((c) => {
      const d2 = (x - c.mean[0]) ** 2 + (y - c.mean[1]) ** 2;
      const l = Math.log(c.w) - Math.log(2 * Math.PI * c.v) - d2 / (2 * c.v);
      if (l > best) best = l;
      return l;
    });
    let z = 0;
    const r = logs.map((l) => {
      const e = Math.exp(l - best);
      z += e;
      return e;
    });
    return { r: r.map((e) => e / z), logp: best + Math.log(z) };
  }

  // The exact model: the best possible ε prediction at every (x_t, t), E[ε | x_t], from the closed form above.
  // E[x_0 | x_t] for component k is the usual Gaussian conditioning: μ_k + √ᾱ sd_k² / v_k · (x_t − √ᾱ μ_k).
  function exactModel(data, sch) {
    const cache = new Map();
    const comps = (t) => {
      if (!cache.has(t)) cache.set(t, noisyComponents(data, sch.alphaBar[t]));
      return cache.get(t);
    };
    function x0hat(x, y, t) {
      const ab = sch.alphaBar[t];
      const a = Math.sqrt(ab);
      const cs = comps(t);
      const { r } = responsibilities(cs, x, y);
      let ex = 0;
      let ey = 0;
      cs.forEach((c, k) => {
        const g = (a * c.v0) / c.v;
        ex += r[k] * (c.m0[0] + g * (x - c.mean[0]));
        ey += r[k] * (c.m0[1] + g * (y - c.mean[1]));
      });
      return [ex, ey];
    }
    return {
      name: "exact",
      // xs: flat [x, y, …] at step t; returns ε̂ = (x_t − √ᾱ x̂_0) / √(1 − ᾱ) for every point
      eps(xs, t) {
        const a = Math.sqrt(sch.alphaBar[t]);
        const b = Math.sqrt(1 - sch.alphaBar[t]);
        const out = new Float64Array(xs.length);
        for (let i = 0; i < xs.length; i += 2) {
          const [ex, ey] = x0hat(xs[i], xs[i + 1], t);
          out[i] = (xs[i] - a * ex) / b;
          out[i + 1] = (xs[i + 1] - a * ey) / b;
        }
        return out;
      },
      x0hat,
      // log p_t(x) and the score ∇ log p_t(x) = −(x − E[√ᾱ x_0 | x]) / (1 − ᾱ) … here computed per component
      logp: (x, y, t) => responsibilities(comps(t), x, y).logp,
      score(x, y, t) {
        const cs = comps(t);
        const { r } = responsibilities(cs, x, y);
        let sx = 0;
        let sy = 0;
        cs.forEach((c, k) => {
          sx -= (r[k] * (x - c.mean[0])) / c.v;
          sy -= (r[k] * (y - c.mean[1])) / c.v;
        });
        return [sx, sy];
      },
    };
  }

  // The true reverse step q(x_s | x_t) for s < t (s = t − 1 by default), with no x_0 given, for one point x_t. By
  // Bayes' rule it is q(x_t | x_s) · q_s(x_s) up to a constant. The jump from s to t is itself Gaussian,
  // q(x_t | x_s) = N(√(ᾱ_t/ᾱ_s) x_s, (1 − ᾱ_t/ᾱ_s) I), and q_s is a mixture of Gaussians, so the answer is a mixture of
  // Gaussians in closed form: [{ w, mean, v }, …]. With a small jump it is almost a single Gaussian.
  function trueReverse(data, sch, t, xt, s = t - 1) {
    const ratio = sch.alphaBar[t] / sch.alphaBar[s];
    const a = Math.sqrt(ratio);
    const b = 1 - ratio;
    const prev = noisyComponents(data, sch.alphaBar[s]);
    // q(x_t | x_s) as a function of x_s: N(x_s; x_t / a, b / a² I)
    const lm = [xt[0] / a, xt[1] / a];
    const lv = b / (a * a);
    let best = -Infinity;
    const parts = prev.map((c) => {
      const v = 1 / (1 / c.v + 1 / lv);
      const mean = [v * (c.mean[0] / c.v + lm[0] / lv), v * (c.mean[1] / c.v + lm[1] / lv)];
      // the weight picks up the overlap of the two Gaussians, N(lm; c.mean, c.v + lv)
      const sv = c.v + lv;
      const d2 = (lm[0] - c.mean[0]) ** 2 + (lm[1] - c.mean[1]) ** 2;
      const lw = Math.log(c.w) - Math.log(2 * Math.PI * sv) - d2 / (2 * sv);
      if (lw > best) best = lw;
      return { lw, mean, v };
    });
    let z = 0;
    parts.forEach((p) => (z += Math.exp(p.lw - best)));
    return parts.map((p) => ({ w: Math.exp(p.lw - best) / z, mean: p.mean, v: p.v }));
  }

  // The density of a 2D mixture [{ w, mean, v }, …] at (x, y).
  function mixturePdf(parts, x, y) {
    let p = 0;
    for (const c of parts) p += (c.w / (2 * Math.PI * c.v)) * Math.exp(-((x - c.mean[0]) ** 2 + (y - c.mean[1]) ** 2) / (2 * c.v));
    return p;
  }

  // The mean and covariance of a 2D Gaussian mixture, and how far it is from being one Gaussian: the KL divergence
  // from the mixture to the single Gaussian with the same mean and covariance, estimated with m samples.
  function mixtureMoments(parts) {
    let mx = 0;
    let my = 0;
    parts.forEach((p) => {
      mx += p.w * p.mean[0];
      my += p.w * p.mean[1];
    });
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    parts.forEach((p) => {
      const dx = p.mean[0] - mx;
      const dy = p.mean[1] - my;
      sxx += p.w * (p.v + dx * dx);
      syy += p.w * (p.v + dy * dy);
      sxy += p.w * dx * dy;
    });
    return { mean: [mx, my], cov: [sxx, sxy, syy] };
  }

  function gaussianGap(parts, m = 4000, seed = 3) {
    const rand = rng(seed);
    const { mean, cov } = mixtureMoments(parts);
    const [a, b, c] = cov;
    const det = a * c - b * b;
    const ia = c / det;
    const ib = -b / det;
    const ic = a / det;
    const w = parts.map((p) => p.w);
    let kl = 0;
    for (let i = 0; i < m; i++) {
      const p = parts[pick(rand, w)];
      const x = p.mean[0] + Math.sqrt(p.v) * rand.normal();
      const y = p.mean[1] + Math.sqrt(p.v) * rand.normal();
      let best = -Infinity;
      const ls = parts.map((q) => {
        const l = Math.log(q.w) - Math.log(2 * Math.PI * q.v) - ((x - q.mean[0]) ** 2 + (y - q.mean[1]) ** 2) / (2 * q.v);
        if (l > best) best = l;
        return l;
      });
      const logMix = best + Math.log(ls.reduce((z, l) => z + Math.exp(l - best), 0));
      const dx = x - mean[0];
      const dy = y - mean[1];
      const logG = -Math.log(2 * Math.PI) - 0.5 * Math.log(det) - 0.5 * (ia * dx * dx + 2 * ib * dx * dy + ic * dy * dy);
      kl += logMix - logG;
    }
    return Math.max(0, kl / m);
  }

  /* ---------------------------------------------------------------- the network */

  // A small fully connected network: input (x, y) plus a time embedding, three hidden layers of SiLU units, and two
  // outputs. The time embedding is sin and cos of t/T at EMBED/2 frequencies, as in the Transformer and in DDPM.
  const EMBED = 16;
  const HIDDEN = 48;
  const LAYERS = [2 + EMBED, HIDDEN, HIDDEN, HIDDEN, 2];

  function timeEmbedding(t, T, out = new Float64Array(EMBED), offset = 0) {
    const u = t / T;
    for (let j = 0; j < EMBED / 2; j++) {
      const f = 2 ** j * Math.PI * 0.5; // frequencies π/2, π, 2π, … 64π
      out[offset + 2 * j] = Math.sin(f * u);
      out[offset + 2 * j + 1] = Math.cos(f * u);
    }
    return out;
  }

  // The parameters, all in one Float64Array: for each layer, its weights (out × in, row-major) then its biases.
  function paramCount(layers = LAYERS) {
    let n = 0;
    for (let l = 0; l + 1 < layers.length; l++) n += layers[l + 1] * layers[l] + layers[l + 1];
    return n;
  }

  function createNet(seed = 1, layers = LAYERS) {
    const rand = rng(seed);
    const w = new Float64Array(paramCount(layers));
    let o = 0;
    for (let l = 0; l + 1 < layers.length; l++) {
      const fanIn = layers[l];
      const scale = Math.sqrt(2 / fanIn) * (l + 2 === layers.length ? 0.1 : 1); // small last layer: outputs start near 0
      for (let i = 0; i < layers[l + 1] * fanIn; i++) w[o++] = scale * rand.normal();
      o += layers[l + 1]; // biases start at 0
    }
    return { layers, w, T: null, target: "eps" };
  }

  const silu = (z) => z / (1 + Math.exp(-z));
  const siluGrad = (z) => {
    const s = 1 / (1 + Math.exp(-z));
    return s * (1 + z * (1 - s));
  };

  // Runs the network on a batch. inputs: Float64Array of n × layers[0]. Returns the outputs and, when keep is set,
  // every layer's pre-activations and activations, for backprop.
  function forward(net, inputs, n, keep = false) {
    const { layers, w } = net;
    let a = inputs;
    let o = 0;
    const zs = [];
    const as = [inputs];
    for (let l = 0; l + 1 < layers.length; l++) {
      const nin = layers[l];
      const nout = layers[l + 1];
      const last = l + 2 === layers.length;
      const z = new Float64Array(n * nout);
      const bo = o + nout * nin;
      for (let i = 0; i < n; i++) {
        const ai = i * nin;
        const zi = i * nout;
        for (let j = 0; j < nout; j++) {
          // two running sums: about 30% faster in V8 than one
          let s0 = w[bo + j];
          let s1 = 0;
          const wj = o + j * nin;
          let k = 0;
          for (; k + 1 < nin; k += 2) {
            s0 += w[wj + k] * a[ai + k];
            s1 += w[wj + k + 1] * a[ai + k + 1];
          }
          if (k < nin) s0 += w[wj + k] * a[ai + k];
          z[zi + j] = s0 + s1;
        }
      }
      o = bo + nout;
      let next = z;
      if (!last) {
        next = new Float64Array(z.length);
        for (let i = 0; i < z.length; i++) next[i] = silu(z[i]);
      }
      if (keep) {
        zs.push(z);
        as.push(next);
      }
      a = next;
    }
    return { out: a, zs, as };
  }

  // Gradient of a loss with respect to every parameter, given dLoss/dOutput for the batch.
  function backward(net, cache, dout, n) {
    const { layers, w } = net;
    const grad = new Float64Array(w.length);
    // parameter offsets per layer
    const offs = [];
    let o = 0;
    for (let l = 0; l + 1 < layers.length; l++) {
      offs.push(o);
      o += layers[l + 1] * layers[l] + layers[l + 1];
    }
    let delta = dout; // dLoss/dz for the current layer
    for (let l = layers.length - 2; l >= 0; l--) {
      const nin = layers[l];
      const nout = layers[l + 1];
      const a = cache.as[l];
      const wo = offs[l];
      const bo = wo + nout * nin;
      for (let i = 0; i < n; i++) {
        const di = i * nout;
        const ai = i * nin;
        for (let j = 0; j < nout; j++) {
          const d = delta[di + j];
          if (d === 0) continue;
          grad[bo + j] += d;
          const wj = wo + j * nin;
          for (let k = 0; k < nin; k++) grad[wj + k] += d * a[ai + k];
        }
      }
      if (l === 0) break;
      const zPrev = cache.zs[l - 1];
      const prev = new Float64Array(n * nin);
      for (let i = 0; i < n; i++) {
        const di = i * nout;
        const pi = i * nin;
        for (let j = 0; j < nout; j++) {
          const d = delta[di + j];
          if (d === 0) continue;
          const wj = wo + j * nin;
          for (let k = 0; k < nin; k++) prev[pi + k] += d * w[wj + k];
        }
        for (let k = 0; k < nin; k++) prev[pi + k] *= siluGrad(zPrev[pi + k]);
      }
      delta = prev;
    }
    return grad;
  }

  // Builds the network's inputs for points xs (flat [x, y, …]) at step t (a number, or an Int32Array per point).
  function netInputs(xs, t, T) {
    const n = xs.length / 2;
    const d = LAYERS[0];
    const inp = new Float64Array(n * d);
    const emb = new Float64Array(EMBED);
    let lastT = -1;
    for (let i = 0; i < n; i++) {
      const ti = typeof t === "number" ? t : t[i];
      if (ti !== lastT) {
        timeEmbedding(ti, T, emb);
        lastT = ti;
      }
      inp[i * d] = xs[2 * i];
      inp[i * d + 1] = xs[2 * i + 1];
      inp.set(emb, i * d + 2);
    }
    return inp;
  }

  // The trained network as a model with the same interface as exactModel: eps(xs, t) → ε̂ for every point.
  // A network trained to predict x_0 (net.target === "x0") is converted with ε̂ = (x_t − √ᾱ x̂_0) / √(1 − ᾱ).
  function netModel(net, sch) {
    return {
      name: net.target === "x0" ? "network (predicts x₀)" : "network",
      eps(xs, t) {
        const n = xs.length / 2;
        const { out } = forward(net, netInputs(xs, t, sch.T), n);
        if (net.target !== "x0") return out;
        const a = Math.sqrt(sch.alphaBar[t]);
        const b = Math.sqrt(1 - sch.alphaBar[t]);
        const e = new Float64Array(out.length);
        for (let i = 0; i < out.length; i++) e[i] = (xs[i] - a * out[i]) / b;
        return e;
      },
    };
  }

  /* ---------------------------------------------------------------- training */

  // Adam (Kingma and Ba, 2015) with the usual β1 = 0.9, β2 = 0.999.
  function adam(net, lr = 2e-3) {
    const m = new Float64Array(net.w.length);
    const v = new Float64Array(net.w.length);
    let step = 0;
    return {
      get step() {
        return step;
      },
      apply(grad, rate = lr) {
        step++;
        const c1 = 1 - 0.9 ** step;
        const c2 = 1 - 0.999 ** step;
        for (let i = 0; i < grad.length; i++) {
          m[i] = 0.9 * m[i] + 0.1 * grad[i];
          v[i] = 0.999 * v[i] + 0.001 * grad[i] * grad[i];
          net.w[i] -= (rate * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + 1e-8);
        }
      },
    };
  }

  // A trainer for one network: each call to step() draws a fresh batch of data points x_0, a step t for each
  // (uniform on 1…T), and noise ε, and takes one Adam step on the mean squared error of Ho et al.'s L_simple:
  //   target "eps": ‖ε − ε_θ(x_t, t)‖²      target "x0": ‖x_0 − x̂_θ(x_t, t)‖²
  // Returns the batch loss. lr decays along a cosine to 10% over `steps`.
  function trainer(net, data, sch, opts = {}) {
    const batch = opts.batch ?? 256;
    const steps = opts.steps ?? 6000;
    const lr = opts.lr ?? 2e-3;
    const rand = rng(opts.seed ?? 5);
    const opt = adam(net, lr);
    net.T = sch.T;
    net.target = opts.target ?? "eps";
    const x0 = new Float64Array(2 * batch);
    const xt = new Float64Array(2 * batch);
    const eps = new Float64Array(2 * batch);
    const ts = new Int32Array(batch);
    return {
      opt,
      step() {
        for (let i = 0; i < batch; i++) {
          const k = pick(rand, data.weights);
          x0[2 * i] = data.means[k][0] + data.sd[k] * rand.normal();
          x0[2 * i + 1] = data.means[k][1] + data.sd[k] * rand.normal();
          ts[i] = 1 + rand.int(sch.T);
        }
        // sort by t so each embedding is computed once per run of equal t
        const order = Array.from(ts.keys()).sort((p, q) => ts[p] - ts[q]);
        const sx0 = new Float64Array(2 * batch);
        const sts = new Int32Array(batch);
        order.forEach((p, i) => {
          sx0[2 * i] = x0[2 * p];
          sx0[2 * i + 1] = x0[2 * p + 1];
          sts[i] = ts[p];
        });
        for (let i = 0; i < batch; i++) {
          const ab = sch.alphaBar[sts[i]];
          const a = Math.sqrt(ab);
          const b = Math.sqrt(1 - ab);
          for (let d = 0; d < 2; d++) {
            const e = rand.normal();
            eps[2 * i + d] = e;
            xt[2 * i + d] = a * sx0[2 * i + d] + b * e;
          }
        }
        const cache = forward(net, netInputs(xt, sts, sch.T), batch, true);
        const target = net.target === "x0" ? sx0 : eps;
        const dout = new Float64Array(2 * batch);
        let loss = 0;
        for (let i = 0; i < 2 * batch; i++) {
          const r = cache.out[i] - target[i];
          loss += r * r;
          dout[i] = (2 * r) / batch;
        }
        const g = backward(net, cache, dout, batch);
        const progress = Math.min(1, opt.step / steps);
        opt.apply(g, lr * (0.1 + 0.9 * 0.5 * (1 + Math.cos(Math.PI * progress))));
        return loss / batch;
      },
    };
  }

  // Weights travel as base64 Float32 (little-endian), about 30 KB per network.
  function encodeWeights(w) {
    const f = new Float32Array(w);
    const bytes = new Uint8Array(f.buffer);
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function decodeWeights(b64) {
    let bytes;
    if (typeof Buffer !== "undefined") bytes = Uint8Array.from(Buffer.from(b64, "base64"));
    else bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    return Float64Array.from(new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4));
  }

  // A shipped network from DM.WEIGHTS (dm-weights.js): { T, schedule, target, dataset, w }.
  function loadNet(name) {
    const spec = root.DM && root.DM.WEIGHTS && root.DM.WEIGHTS[name];
    if (!spec) return null;
    return { layers: LAYERS, w: decodeWeights(spec.w), T: spec.T, target: spec.target, dataset: spec.dataset, schedule: spec.schedule };
  }

  /* ---------------------------------------------------------------- sampling */

  // Ancestral sampling, Algorithm 2 of Ho et al. (2020): start from x_T ~ N(0, I) and for t = T … 1 set
  //   x_{t−1} = 1/√α_t · (x_t − β_t / √(1 − ᾱ_t) · ε_θ(x_t, t)) + σ_t z,   z ~ N(0, I) (no noise at the last step).
  // sigma: "beta" (σ_t² = β_t) or "tilde" (σ_t² = β~_t). Returns every frame: frames[t] is the cloud at step t.
  function ddpmSample(model, sch, xT, opts = {}) {
    const rand = rng(opts.seed ?? 21);
    const T = sch.T;
    const frames = new Array(T + 1);
    let x = Float64Array.from(xT);
    frames[T] = x;
    for (let t = T; t >= 1; t--) {
      const e = model.eps(x, t);
      const k = sch.beta[t] / Math.sqrt(1 - sch.alphaBar[t]);
      const ia = 1 / Math.sqrt(sch.alpha[t]);
      const sd = t > 1 ? Math.sqrt(opts.sigma === "tilde" ? sch.betaTilde[t] : sch.beta[t]) : 0;
      const next = new Float64Array(x.length);
      for (let i = 0; i < x.length; i++) next[i] = ia * (x[i] - k * e[i]) + sd * rand.normal();
      frames[t - 1] = next;
      x = next;
    }
    return frames;
  }

  // The same sampler, run a few steps at a time so a page can stay responsive: call next() until it returns null.
  function ddpmStepper(model, sch, xT, opts = {}) {
    const rand = rng(opts.seed ?? 21);
    const frames = new Array(sch.T + 1);
    let x = Float64Array.from(xT);
    let t = sch.T;
    frames[t] = x;
    return {
      frames,
      next(count = 20) {
        for (let c = 0; c < count && t >= 1; c++, t--) {
          const e = model.eps(x, t);
          const k = sch.beta[t] / Math.sqrt(1 - sch.alphaBar[t]);
          const ia = 1 / Math.sqrt(sch.alpha[t]);
          const sd = t > 1 ? Math.sqrt(opts.sigma === "tilde" ? sch.betaTilde[t] : sch.beta[t]) : 0;
          const nx = new Float64Array(x.length);
          for (let i = 0; i < x.length; i++) nx[i] = ia * (x[i] - k * e[i]) + sd * rand.normal();
          frames[t - 1] = nx;
          x = nx;
        }
        return t >= 1 ? 1 - t / sch.T : null;
      },
    };
  }

  /* ---------------------------------------------------------------- measuring */

  // How far apart two point clouds are: the sliced Wasserstein-1 distance, the average over 64 fixed directions of
  // the distance between the two sorted 1D projections. 0 means identical; for our data, 0.05 is very close.
  function sliced(a, b, dirs = 64) {
    const n = Math.min(a.length, b.length) / 2;
    let total = 0;
    const pa = new Float64Array(n);
    const pb = new Float64Array(n);
    for (let d = 0; d < dirs; d++) {
      const th = (Math.PI * d) / dirs;
      const c = Math.cos(th);
      const s = Math.sin(th);
      for (let i = 0; i < n; i++) {
        pa[i] = c * a[2 * i] + s * a[2 * i + 1];
        pb[i] = c * b[2 * i] + s * b[2 * i + 1];
      }
      pa.sort();
      pb.sort();
      let sum = 0;
      for (let i = 0; i < n; i++) sum += Math.abs(pa[i] - pb[i]);
      total += sum / n;
    }
    return total / dirs;
  }

  // The mean and per-axis spread of a cloud: { mean: [x, y], sd: [x, y] }.
  function moments(xs) {
    const n = xs.length / 2;
    let mx = 0;
    let my = 0;
    for (let i = 0; i < n; i++) {
      mx += xs[2 * i];
      my += xs[2 * i + 1];
    }
    mx /= n;
    my /= n;
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < n; i++) {
      vx += (xs[2 * i] - mx) ** 2;
      vy += (xs[2 * i + 1] - my) ** 2;
    }
    return { mean: [mx, my], sd: [Math.sqrt(vx / n), Math.sqrt(vy / n)] };
  }

  // The terms of the variational bound for a model, per step t, averaged over m data points (Ho et al., eq. 5):
  //   L_{t−1} = KL(q(x_{t−1} | x_t, x_0) ‖ p_θ(x_{t−1} | x_t)) for t ≥ 2, in nats per point (2 dimensions).
  // With p_θ = N(μ_θ, σ_t² I) and q = N(μ~, β~_t I) it is ‖μ~ − μ_θ‖² / (2σ_t²) + (β~_t/σ_t² − 1 − log(β~_t/σ_t²)).
  // The mean error can also be written through ε: ‖μ~ − μ_θ‖² = β_t² / (α_t (1 − ᾱ_t)) · ‖ε − ε_θ‖².
  function boundTerms(model, data, sch, opts = {}) {
    const m = opts.m ?? 512;
    const sigma = opts.sigma ?? "beta";
    const { xs: x0 } = sample(data, m, opts.seed ?? 31);
    const out = new Float64Array(sch.T + 1);
    for (let t = 2; t <= sch.T; t++) {
      const { xt, eps } = qSample(x0, sch, t, 1000 + t);
      const e = model.eps(xt, t);
      let se = 0;
      for (let i = 0; i < xt.length; i++) se += (eps[i] - e[i]) ** 2;
      se /= m;
      const s2 = sigma === "tilde" ? sch.betaTilde[t] : sch.beta[t];
      const meanTerm = ((sch.beta[t] ** 2 / (sch.alpha[t] * (1 - sch.alphaBar[t]))) * se) / (2 * s2);
      const r = sch.betaTilde[t] / s2;
      out[t] = meanTerm + (r - 1 - Math.log(r));
    }
    return out;
  }

  /* ---------------------------------------------------------------- export */

  const DM = {
    rng,
    pick,
    DATASETS,
    sample,
    gaussian,
    schedule,
    forwardStep,
    qSample,
    forwardChain,
    posterior,
    noisyComponents,
    exactModel,
    trueReverse,
    mixturePdf,
    mixtureMoments,
    gaussianGap,
    EMBED,
    LAYERS,
    timeEmbedding,
    paramCount,
    createNet,
    forward,
    backward,
    netInputs,
    netModel,
    adam,
    trainer,
    encodeWeights,
    decodeWeights,
    loadNet,
    ddpmSample,
    ddpmStepper,
    sliced,
    moments,
    boundTerms,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = DM;
  else {
    root.DM = Object.assign(root.DM || {}, DM);
    root.TF = root.TF || {}; // tf-view.js (shared drawing helpers) attaches itself to window.TF
  }
})(typeof window !== "undefined" ? window : globalThis);
