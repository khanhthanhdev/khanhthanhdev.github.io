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

  // three overlapping classes for guidance (part 9): round blobs of spread 0.6 whose centres sit 1.73 apart, on a
  // circle of radius 1, so about one point in eight lies closer to another class's centre
  DATASETS.classes = {
    label: "three overlapping classes",
    weights: [1 / 3, 1 / 3, 1 / 3],
    means: [90, 210, 330].map((deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)]),
    sd: [0.6, 0.6, 0.6],
    classes: [0, 1, 2],
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

  // A ladder of noise levels for score-based models in the style of Song and Ermon (2019): data plus noise of
  // standard deviation sigma[i], x̃ = x + σ_i·ε, for i = 1 … L, spaced geometrically from sigmaMin (i = 1) to sigmaMax
  // (i = L). Numbered from the clean end, like the steps t of DDPM (the paper numbers them from the noisy end).
  function veSchedule(sigmaMax = 4, sigmaMin = 0.03, L = 10) {
    const sigma = new Float64Array(L + 1);
    for (let i = 1; i <= L; i++) sigma[i] = sigmaMin * (sigmaMax / sigmaMin) ** ((i - 1) / Math.max(1, L - 1));
    return { kind: "ve", T: L, sigma };
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
      // a draw from q(x_0 | x_t): pick a component by its posterior weight, then the Gaussian x_0 | x_t within it,
      // N(μ_k + √ᾱ sd_k² / v_k · (x_t − √ᾱ μ_k), sd_k² (1 − ᾱ) / v_k I)
      sampleX0(x, y, t, rand) {
        const ab = sch.alphaBar[t];
        const a = Math.sqrt(ab);
        const cs = comps(t);
        const c = cs[pick(rand, responsibilities(cs, x, y).r)];
        const g = (a * c.v0) / c.v;
        const sd = Math.sqrt((c.v0 * (1 - ab)) / c.v);
        return [c.m0[0] + g * (x - c.mean[0]) + sd * rand.normal(), c.m0[1] + g * (y - c.mean[1]) + sd * rand.normal()];
      },
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

  // Exact guided noise predictions for a dataset with classes (part 9). cls is the class of every point (an Int32Array,
  // or one number for all). With p_t(x | c) the noisy density of class c's components and p_t(x) of all of them:
  //   classifier-free guidance, weight w:  ε̃ = (1 + w)·ε(x | c) − w·ε(x)
  //   classifier guidance, scale s:        ∇ log p_t(x) + s·∇ log p_t(c | x), i.e. ε̃ = ε(x) + s·(ε(x | c) − ε(x))
  // since ∇ log p_t(c | x) = ∇ log p_t(x | c) − ∇ log p_t(x) for the exact classifier. So scale s is weight w = s − 1.
  function exactGuided(data, sch, opts = {}) {
    const all = exactModel(data, sch);
    const K = Math.max(...data.classes) + 1;
    const per = Array.from({ length: K }, (_, c) => {
      const idx = data.classes.map((cc, k) => (cc === c ? k : -1)).filter((k) => k >= 0);
      const tot = idx.reduce((sum, k) => sum + data.weights[k], 0);
      return exactModel(
        { weights: idx.map((k) => data.weights[k] / tot), means: idx.map((k) => data.means[k]), sd: idx.map((k) => data.sd[k]) },
        sch
      );
    });
    const w = opts.scale != null ? opts.scale - 1 : (opts.w ?? 0);
    return {
      name: "exact, guided",
      classModel: (c) => per[c],
      eps(xs, t) {
        const u = all.eps(xs, t);
        const n = xs.length / 2;
        const out = new Float64Array(xs.length);
        for (let i = 0; i < n; i++) {
          const c = typeof opts.cls === "number" ? opts.cls : opts.cls[i];
          const ec = per[c].eps(xs.subarray(2 * i, 2 * i + 2), t);
          out[2 * i] = (1 + w) * ec[0] - w * u[2 * i];
          out[2 * i + 1] = (1 + w) * ec[1] - w * u[2 * i + 1];
        }
        return out;
      },
    };
  }

  // The data with noise of standard deviation sigma added (no shrinking): component k becomes N(μ_k, (sd_k² + σ²) I).
  // Returns the exact density, log density and score ∇ log p_σ of that blurred data.
  function blurred(data, sigma) {
    const comps = data.means.map((m, k) => ({ w: data.weights[k], mean: m, v: data.sd[k] ** 2 + sigma * sigma }));
    return {
      comps,
      pdf: (x, y) => mixturePdf(comps, x, y),
      logp: (x, y) => responsibilities(comps, x, y).logp,
      score(x, y) {
        const { r } = responsibilities(comps, x, y);
        let sx = 0;
        let sy = 0;
        comps.forEach((c, k) => {
          sx -= (r[k] * (x - c.mean[0])) / c.v;
          sy -= (r[k] * (y - c.mean[1])) / c.v;
        });
        return [sx, sy];
      },
      // the scores of a whole cloud at once
      scores(xs) {
        const out = new Float64Array(xs.length);
        for (let i = 0; i < xs.length; i += 2) {
          const [sx, sy] = this.score(xs[i], xs[i + 1]);
          out[i] = sx;
          out[i + 1] = sy;
        }
        return out;
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
  // With K > 0 the network is conditional: K more inputs, a one-hot code for the class (cls, a number or an Int32Array
  // per point), where the last slot, K − 1, means "no class" (classifier-free guidance trains with it).
  function netInputs(xs, t, T, cls = null, K = 0) {
    const n = xs.length / 2;
    const d = 2 + EMBED + K;
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
      if (K) {
        const c = cls == null ? K - 1 : typeof cls === "number" ? cls : cls[i];
        inp[i * d + 2 + EMBED + (c < 0 ? K - 1 : c)] = 1;
      }
    }
    return inp;
  }

  // The trained network as a model with the same interface as exactModel: eps(xs, t) → ε̂ for every point.
  // A network trained to predict x_0 (net.target === "x0") is converted with ε̂ = (x_t − √ᾱ x̂_0) / √(1 − ᾱ).
  // A network with a third output (Improved DDPM's learned variance) also answers v(xs, t). A conditional network
  // (net.K > 0) takes opts.cls (a class, or null for "no class") and opts.w, the classifier-free guidance weight:
  // ε̃ = (1 + w)·ε(x, c) − w·ε(x, ∅) (Ho and Salimans, 2022).
  function netModel(net, sch, opts = {}) {
    const out = net.layers[net.layers.length - 1];
    const K = net.K || 0;
    const run = (xs, t, cls) => {
      const n = xs.length / 2;
      const res = forward(net, netInputs(xs, t, sch.T, cls, K), n).out;
      if (out === 2) return res;
      const e = new Float64Array(2 * n);
      for (let i = 0; i < n; i++) {
        e[2 * i] = res[out * i];
        e[2 * i + 1] = res[out * i + 1];
      }
      return e;
    };
    return {
      name: net.target === "x0" ? "network (predicts x₀)" : "network",
      eps(xs, t) {
        let e;
        const w = opts.w ?? 0;
        if (K && opts.cls != null && w !== 0) {
          const c = run(xs, t, opts.cls);
          const u = run(xs, t, null);
          e = new Float64Array(c.length);
          for (let i = 0; i < c.length; i++) e[i] = (1 + w) * c[i] - w * u[i];
        } else e = run(xs, t, K ? (opts.cls ?? null) : null);
        if (net.target !== "x0") return e;
        const a = Math.sqrt(sch.alphaBar[t]);
        const b = Math.sqrt(1 - sch.alphaBar[t]);
        for (let i = 0; i < e.length; i++) e[i] = (xs[i] - a * e[i]) / b;
        return e;
      },
      // the learned mix between log β_t (v = 1) and log β~_t (v = 0); only for three-output networks
      v(xs, t) {
        const n = xs.length / 2;
        const res = forward(net, netInputs(xs, t, sch.T, opts.cls ?? null, K), n).out;
        return Float64Array.from({ length: n }, (_, i) => res[out * i + 2]);
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
  // weighting "vlb" multiplies each example's error by the weight the true bound puts on its step,
  // β_t² / (2σ_t² α_t (1 − ᾱ_t)) with σ_t² = β_t, rescaled to average 1 over t, instead of L_simple's flat weight.
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
    const cs = new Int32Array(batch);
    const K = net.K || 0;
    const pUncond = opts.pUncond ?? 0.2;
    const out = net.layers[net.layers.length - 1];
    // Improved DDPM's hybrid loss: L_simple + λ·L_vlb, where L_vlb only trains the variance output (the mean is held
    // fixed inside it). As in their code, each step's KL is in bits per dimension and weighted by T/1000.
    const learnSigma = out === 3;
    const vbWeight = sch.T / 1000 / (2 * Math.LN2);
    const weight = new Float64Array(sch.T + 1).fill(1);
    if (opts.weighting === "vlb" && sch.kind !== "ve") {
      let mean = 0;
      for (let t = 1; t <= sch.T; t++) {
        weight[t] = sch.beta[t] / (2 * sch.alpha[t] * (1 - sch.alphaBar[t]));
        mean += weight[t] / sch.T;
      }
      for (let t = 1; t <= sch.T; t++) weight[t] /= mean;
    }
    return {
      opt,
      step() {
        for (let i = 0; i < batch; i++) {
          const k = pick(rand, data.weights);
          x0[2 * i] = data.means[k][0] + data.sd[k] * rand.normal();
          x0[2 * i + 1] = data.means[k][1] + data.sd[k] * rand.normal();
          ts[i] = 1 + rand.int(sch.T);
          // conditional training: the component's class, dropped to "no class" with probability pUncond
          if (K) cs[i] = rand.next() < pUncond ? K - 1 : data.classes[k];
        }
        // sort by t so each embedding is computed once per run of equal t
        const order = Array.from(ts.keys()).sort((p, q) => ts[p] - ts[q]);
        const sx0 = new Float64Array(2 * batch);
        const sts = new Int32Array(batch);
        const scs = new Int32Array(batch);
        order.forEach((p, i) => {
          sx0[2 * i] = x0[2 * p];
          sx0[2 * i + 1] = x0[2 * p + 1];
          sts[i] = ts[p];
          scs[i] = cs[p];
        });
        for (let i = 0; i < batch; i++) {
          // VP: x_t = √ᾱ x_0 + √(1 − ᾱ) ε. VE (score networks): x̃ = x_0 + σ_i ε, and predicting ε is denoising score
          // matching with Song and Ermon's weight λ(σ) = σ², since σ²‖s_θ + ε/σ‖² = ‖σ s_θ + ε‖².
          const ve = sch.kind === "ve";
          const ab = ve ? 1 : sch.alphaBar[sts[i]];
          const a = ve ? 1 : Math.sqrt(ab);
          const b = ve ? sch.sigma[sts[i]] : Math.sqrt(1 - ab);
          for (let d = 0; d < 2; d++) {
            const e = rand.normal();
            eps[2 * i + d] = e;
            xt[2 * i + d] = a * sx0[2 * i + d] + b * e;
          }
        }
        const cache = forward(net, netInputs(xt, sts, sch.T, K ? scs : null, K), batch, true);
        const target = net.target === "x0" ? sx0 : eps;
        const dout = new Float64Array(out * batch);
        let loss = 0;
        for (let i = 0; i < batch; i++) {
          for (let d = 0; d < 2; d++) {
            const r = cache.out[out * i + d] - target[2 * i + d];
            const w = weight[sts[i]];
            loss += w * r * r;
            dout[out * i + d] = (2 * w * r) / batch;
          }
          if (!learnSigma || sts[i] < 2) continue;
          // KL(N(μ~, β~) ‖ N(μ_θ, Σ)) in 2D with Σ = exp(v log β + (1 − v) log β~) and μ_θ from ε_θ, held fixed
          const t = sts[i];
          const v = cache.out[out * i + 2];
          const lb = Math.log(sch.beta[t]);
          const lbt = Math.log(sch.betaTilde[t]);
          const S = Math.exp(v * lb + (1 - v) * lbt);
          const post = posterior([sx0[2 * i], sx0[2 * i + 1]], [xt[2 * i], xt[2 * i + 1]], sch, t);
          const k = sch.beta[t] / Math.sqrt(1 - sch.alphaBar[t]);
          const ia = 1 / Math.sqrt(sch.alpha[t]);
          let d2 = 0;
          for (let d = 0; d < 2; d++) d2 += (post.mean[d] - ia * (xt[2 * i + d] - k * cache.out[out * i + d])) ** 2;
          const r = sch.betaTilde[t] / S;
          loss += (vbWeight * (r - 1 - Math.log(r) + d2 / (2 * S))) / 1; // reported in the loss for monitoring
          const dLogS = -r + 1 - d2 / (2 * S);
          dout[out * i + 2] = (vbWeight * dLogS * (lb - lbt)) / batch;
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
    const K = spec.K || 0;
    const layers = [2 + EMBED + K, HIDDEN, HIDDEN, HIDDEN, spec.out || 2];
    return { layers, K, w: decodeWeights(spec.w), T: spec.T, target: spec.target, dataset: spec.dataset, schedule: spec.schedule };
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

  /* ---------------------------------------------------------------- Langevin dynamics */

  // Langevin dynamics: x ← x + (α/2)·∇ log p(x) + √α·z, z ~ N(0, I), repeated. score(xs) returns the score of every
  // point. Run a few iterations per call to next(); frames keeps the cloud every `every` iterations.
  function langevinStepper(score, init, opts = {}) {
    const rand = rng(opts.seed ?? 61);
    const steps = opts.steps ?? 1000;
    const alpha = opts.alpha ?? 0.01;
    const every = opts.every ?? 10;
    let x = Float64Array.from(init);
    let k = 0;
    const frames = [Float64Array.from(x)];
    const sa = Math.sqrt(alpha);
    return {
      frames,
      every,
      next(count = 50) {
        for (let c = 0; c < count && k < steps; c++, k++) {
          const g = score(x);
          for (let i = 0; i < x.length; i++) x[i] += 0.5 * alpha * g[i] + sa * rand.normal();
          if ((k + 1) % every === 0) frames.push(Float64Array.from(x));
        }
        return k < steps ? k / steps : null;
      },
    };
  }

  // Annealed Langevin dynamics, Algorithm 1 of Song and Ermon (2019): for each noise level from the largest to the
  // smallest, run T Langevin steps with that level's score and step size α_i = ε·σ_i²/σ_L² (σ_L the smallest),
  // starting from where the last level ended. score(xs, i) returns the scores at level i of sch (a veSchedule).
  // frames[j] is the cloud after j levels (frames[0] is the start); trail keeps the cloud every `every` steps.
  function annealedStepper(score, sch, init, opts = {}) {
    const rand = rng(opts.seed ?? 62);
    const T = opts.T ?? 100;
    const eps = opts.eps ?? 0.1 * sch.sigma[1] ** 2;
    const every = opts.every ?? 10;
    let x = Float64Array.from(init);
    let level = sch.T;
    let k = 0;
    const frames = [Float64Array.from(x)];
    const trail = [{ level, xs: Float64Array.from(x) }];
    return {
      frames,
      trail,
      alpha: (i) => (eps * sch.sigma[i] ** 2) / sch.sigma[1] ** 2,
      next(count = 50) {
        for (let c = 0; c < count && level >= 1; c++) {
          const alpha = (eps * sch.sigma[level] ** 2) / sch.sigma[1] ** 2;
          const sa = Math.sqrt(alpha);
          const g = score(x, level);
          for (let i = 0; i < x.length; i++) x[i] += 0.5 * alpha * g[i] + sa * rand.normal();
          k++;
          if (k % every === 0) trail.push({ level, xs: Float64Array.from(x) });
          if (k === T) {
            frames.push(Float64Array.from(x));
            k = 0;
            level--;
          }
        }
        return level >= 1 ? 1 - level / sch.T : null;
      },
    };
  }

  // n points spread uniformly over the square [−r, r]², the starting point of the Langevin samplers.
  function uniform(n, r = 3, seed = 1) {
    const rand = rng(seed);
    const xs = new Float64Array(2 * n);
    for (let i = 0; i < 2 * n; i++) xs[i] = r * (2 * rand.next() - 1);
    return xs;
  }

  /* ---------------------------------------------------------------- stochastic differential equations */

  // The variance-preserving SDE of Song et al. (2021), dx = −½β(t)x dt + √β(t) dw on t ∈ [0, 1], with
  // β(t) = βmin + t(βmax − βmin). With βmin = 0.1 and βmax = 20 it is the limit of DDPM's linear schedule, and of our
  // 200-step toy schedule: step i of the chain is time t = i/200. ᾱ(t) = exp(−∫β) = exp(−βmin t − ½(βmax − βmin)t²).
  function vpSDE(betaMin = 0.1, betaMax = 20, steps = 200) {
    const beta = (t) => betaMin + t * (betaMax - betaMin);
    const alphaBar = (t) => Math.exp(-betaMin * t - 0.5 * (betaMax - betaMin) * t * t);
    return { kind: "vp", beta, alphaBar, sigma: (t) => Math.sqrt(1 - alphaBar(t)), steps };
  }

  // The variance-exploding SDE: dx = √(dσ²/dt) dw with σ(t) = σmin (σmax/σmin)^t, the limit of a geometric ladder.
  function veSDE(sigmaMin = 0.03, sigmaMax = 5) {
    const sigma = (t) => sigmaMin * (sigmaMax / sigmaMin) ** t;
    const g2 = (t) => 2 * Math.log(sigmaMax / sigmaMin) * sigma(t) ** 2; // dσ²/dt
    return { kind: "ve", sigma, g2 };
  }

  // A network trained on the 200-step chain, read as a score at continuous time t: s(x, t) = −ε_θ(x, 200t) / σ(t).
  // The network was trained at whole steps only; in between, its sine–cosine time input changes smoothly.
  function vpScore(model, sde) {
    return (xs, t) => {
      const e = model.eps(xs, t * sde.steps);
      const sd = sde.sigma(t);
      for (let i = 0; i < e.length; i++) e[i] = -e[i] / sd;
      return e;
    };
  }

  // Simulates the forward VP SDE from x0 with n Euler–Maruyama steps. frames[k] is the cloud at time k/n.
  function forwardSDE(x0, sde, n = 200, seed = 13) {
    const rand = rng(seed);
    const dt = 1 / n;
    let x = Float64Array.from(x0);
    const frames = [Float64Array.from(x)];
    for (let k = 0; k < n; k++) {
      const t = k * dt;
      const sd = Math.sqrt(sde.kind === "ve" ? sde.g2(t) * dt : sde.beta(t) * dt);
      const drift = sde.kind === "ve" ? 0 : -0.5 * sde.beta(t) * dt;
      const nx = new Float64Array(x.length);
      for (let i = 0; i < x.length; i++) nx[i] = x[i] + drift * x[i] + sd * rand.normal();
      frames.push(nx);
      x = nx;
    }
    return frames;
  }

  // Sampling with the reverse-time SDE (Anderson, 1982), dx = [f(x, t) − g(t)² ∇ log p_t(x)] dt + g(t) dw̄, run from
  // t = 1 down to t = tMin in n Euler–Maruyama steps (the predictor). With corrector > 0, each step is followed by that
  // many Langevin steps at the new time (the corrector of Song et al.'s predictor–corrector sampler, Algorithm 5), with
  // step size ε = 2α(r‖z‖/‖g‖)², where α = 1 − β(t)/200 is the toy chain's α_i at that time and r is the
  // "signal-to-noise ratio". mode "ode" drops the noise and halves the score term: the probability flow ODE (part 7).
  // denoise (on by default) replaces the last point by the best guess of the clean point, x + σ(t)²·s(x, t) for
  // x = √ᾱ·x₀ + noise, divided by √ᾱ: the usual last step of these samplers, removing the noise left at tMin.
  // times[k] and frames[k] go from t = 1 (k = 0) to tMin (k = n).
  function reverseStepper(score, sde, xT, opts = {}) {
    const n = opts.n ?? 200;
    const tMin = opts.tMin ?? 1 / sde.steps;
    const corrector = opts.corrector ?? 0;
    const r = opts.snr ?? 0.16;
    const ode = opts.mode === "ode";
    const rand = rng(opts.seed ?? 71);
    const dt = (1 - tMin) / n;
    let x = Float64Array.from(xT);
    let k = 0;
    const frames = [Float64Array.from(x)];
    const times = [1];
    let evals = 0;
    return {
      frames,
      times,
      get evals() {
        return evals;
      },
      next(count = 10) {
        for (let c = 0; c < count && k < n; c++, k++) {
          const t = 1 - k * dt;
          const b = sde.beta(t);
          const g = score(x, t);
          evals++;
          const nx = new Float64Array(x.length);
          const sd = Math.sqrt(b * dt);
          for (let i = 0; i < x.length; i++) {
            // reverse time: x(t − dt) = x(t) − [f − g² s] dt (+ noise); f = −½βx, g² = β
            const drift = -0.5 * b * x[i] - (ode ? 0.5 : 1) * b * g[i];
            nx[i] = x[i] - drift * dt + (ode ? 0 : sd * rand.normal());
          }
          x = nx;
          const tn = t - dt;
          for (let m = 0; m < corrector; m++) {
            const gs = score(x, tn);
            evals++;
            const z = new Float64Array(x.length);
            let zn = 0;
            let gn = 0;
            for (let i = 0; i < x.length; i++) {
              z[i] = rand.normal();
              zn += z[i] * z[i];
              gn += gs[i] * gs[i];
            }
            const alpha = 1 - sde.beta(tn) / sde.steps;
            const step = 2 * alpha * ((r * Math.sqrt(zn)) / Math.sqrt(gn)) ** 2;
            for (let i = 0; i < x.length; i++) x[i] += step * gs[i] + Math.sqrt(2 * step) * z[i];
          }
          if (k === n - 1 && opts.denoise !== false) {
            const gs = score(x, tn);
            evals++;
            const s2 = sde.sigma(tn) ** 2;
            const a = Math.sqrt(sde.alphaBar(tn));
            for (let i = 0; i < x.length; i++) x[i] = (x[i] + s2 * gs[i]) / a;
          }
          frames.push(Float64Array.from(x));
          times.push(tn);
        }
        return k < n ? k / n : null;
      },
    };
  }

  /* ---------------------------------------------------------------- DDIM and the probability flow ODE */

  // S steps over 1 … T, from the top: [T, …, 1] (rounded, no repeats). "even" spaces them evenly; "quadratic" puts
  // step k (from the clean end) at about T·(k/S)², crowding them near the data, as the DDIM paper did for CIFAR-10.
  function stepList(T, S, spacing = "even") {
    const out = [];
    for (let k = 0; k < S; k++) {
      const u = 1 - k / Math.max(1, S - 1); // 1 → 0
      const t = Math.max(1, Math.round(spacing === "quadratic" ? 1 + (T - 1) * u * u : 1 + (T - 1) * u));
      if (!out.includes(t)) out.push(t);
    }
    return out;
  }

  // DDIM sampling (Song, Meng and Ermon, 2020), with any trained ε network and no retraining. Over a sub-sequence of
  // steps t → s (s < t), predict x̂₀ = (x_t − √(1 − ᾱ_t)·ε_θ) / √ᾱ_t and move to
  //   x_s = √ᾱ_s·x̂₀ + √(1 − ᾱ_s − σ²)·ε_θ + σ·z,  σ = η·√((1 − ᾱ_s)/(1 − ᾱ_t))·√(1 − ᾱ_t/ᾱ_s)
  // η = 0 is deterministic (DDIM); η = 1 is DDPM's ancestral sampler on the shortened chain. The last step goes to
  // s = 0, where ᾱ = 1, so it returns x̂₀ itself. frames[k] is the cloud after k steps; steps[k] the step it is at.
  function ddimStepper(model, sch, xT, opts = {}) {
    const S = opts.S ?? 50;
    const eta = opts.eta ?? 0;
    const rand = rng(opts.seed ?? 81);
    const steps = [...stepList(sch.T, S, opts.spacing), 0];
    let x = Float64Array.from(xT);
    let k = 0;
    const frames = [Float64Array.from(x)];
    return {
      frames,
      steps,
      next(count = 5) {
        for (let c = 0; c < count && k < steps.length - 1; c++, k++) {
          const t = steps[k];
          const sPrev = steps[k + 1];
          const at = sch.alphaBar[t];
          const as = sch.alphaBar[sPrev];
          const e = model.eps(x, t);
          const sigma = eta * Math.sqrt((1 - as) / (1 - at)) * Math.sqrt(1 - at / as);
          const dir = Math.sqrt(Math.max(0, 1 - as - sigma * sigma));
          const nx = new Float64Array(x.length);
          for (let i = 0; i < x.length; i++) {
            const x0 = (x[i] - Math.sqrt(1 - at) * e[i]) / Math.sqrt(at);
            nx[i] = Math.sqrt(as) * x0 + dir * e[i] + (sigma > 0 ? sigma * rand.normal() : 0);
          }
          x = nx;
          frames.push(Float64Array.from(x));
        }
        return k < steps.length - 1 ? k / (steps.length - 1) : null;
      },
    };
  }

  // Ancestral sampling on a shortened chain, as Improved DDPM samples with fewer steps (Nichol and Dhariwal, 2021).
  // Over steps t → s the chain is respaced: β' = 1 − ᾱ_t/ᾱ_s and β~' = (1 − ᾱ_s)/(1 − ᾱ_t)·β'. The mean is the forward
  // posterior's with x̂₀ from ε_θ; the variance is β' ("beta"), β~' ("tilde"), or the network's learned mix
  // exp(v log β' + (1 − v) log β~') ("learned", for a three-output network).
  function respacedStepper(model, sch, xT, opts = {}) {
    const S = opts.S ?? 50;
    const variance = opts.variance ?? "beta";
    const rand = rng(opts.seed ?? 91);
    const steps = [...stepList(sch.T, S, opts.spacing), 0];
    let x = Float64Array.from(xT);
    let k = 0;
    const frames = [Float64Array.from(x)];
    return {
      frames,
      steps,
      next(count = 5) {
        for (let c = 0; c < count && k < steps.length - 1; c++, k++) {
          const t = steps[k];
          const sPrev = steps[k + 1];
          const at = sch.alphaBar[t];
          const as = sch.alphaBar[sPrev];
          const b = 1 - at / as;
          const bt = ((1 - as) / (1 - at)) * b;
          const e = model.eps(x, t);
          const v = variance === "learned" && sPrev > 0 ? model.v(x, t) : null;
          const tau = opts.temperature ?? 1; // scales the added noise; below 1 trades diversity for fidelity
          const c0 = (Math.sqrt(as) * b) / (1 - at);
          const ct = (Math.sqrt(at / as) * (1 - as)) / (1 - at);
          const nx = new Float64Array(x.length);
          for (let i = 0; i < x.length; i += 2) {
            let sd = 0;
            if (sPrev > 0)
              sd = tau * Math.sqrt(variance === "tilde" ? bt : v ? Math.exp(v[i >> 1] * Math.log(b) + (1 - v[i >> 1]) * Math.log(bt)) : b);
            for (let d = 0; d < 2; d++) {
              const x0 = (x[i + d] - Math.sqrt(1 - at) * e[i + d]) / Math.sqrt(at);
              nx[i + d] = c0 * x0 + ct * x[i + d] + sd * rand.normal();
            }
          }
          x = nx;
          frames.push(Float64Array.from(x));
        }
        return k < steps.length - 1 ? k / (steps.length - 1) : null;
      },
    };
  }

  // DDIM run backwards: encode clean points into noise along the same deterministic path, in S steps from step 1 up
  // to T. Each step uses the network at the current step to estimate x̂₀ and ε, then moves to the next step's mix.
  // Returns every frame, from x₀ (frames[0]) to x_T.
  function ddimInvert(model, sch, x0, S = 50) {
    const steps = [0, ...stepList(sch.T, S).reverse()];
    let x = Float64Array.from(x0);
    const frames = [Float64Array.from(x)];
    for (let k = 0; k + 1 < steps.length; k++) {
      const t = steps[k];
      const n = steps[k + 1];
      const at = sch.alphaBar[t];
      const an = sch.alphaBar[n];
      const e = model.eps(x, Math.max(1, t));
      const nx = new Float64Array(x.length);
      for (let i = 0; i < x.length; i++) {
        const xh = (x[i] - Math.sqrt(1 - at) * e[i]) / Math.sqrt(at);
        nx[i] = Math.sqrt(an) * xh + Math.sqrt(1 - an) * e[i];
      }
      x = nx;
      frames.push(Float64Array.from(x));
    }
    return frames;
  }

  // The exact log-likelihood of points under the model, through the probability flow ODE (Song et al., 2021):
  // dx/dt = v(x, t) = −½β(t)·x − ½β(t)·s_θ(x, t) carries the data at t ≈ 0 to noise at t = 1, and along the way
  // d log p_t(x(t)) / dt = −∇·v. So log p₀(x) = log N(x(1); 0, I) + ∫ ∇·v dt. In 2D the divergence is computed by
  // finite differences of the score (two extra network calls per step). n Euler steps from tMin to 1.
  function odeLogLikelihood(score, sde, xs, opts = {}) {
    const n = opts.n ?? 200;
    const tMin = opts.tMin ?? 1 / sde.steps;
    const h = 1e-3;
    const m = xs.length / 2;
    let x = Float64Array.from(xs);
    const div = new Float64Array(m);
    const dt = (1 - tMin) / n;
    for (let k = 0; k < n; k++) {
      const t = tMin + k * dt;
      const b = sde.beta(t);
      const s = score(x, t);
      const px = Float64Array.from(x);
      const py = Float64Array.from(x);
      for (let i = 0; i < m; i++) {
        px[2 * i] += h;
        py[2 * i + 1] += h;
      }
      const sx = score(px, t);
      const sy = score(py, t);
      for (let i = 0; i < m; i++) {
        // ∇·v = −β (the −½β·x part, in 2D) − ½β·(∂s_x/∂x + ∂s_y/∂y)
        const ds = (sx[2 * i] - s[2 * i]) / h + (sy[2 * i + 1] - s[2 * i + 1]) / h;
        div[i] += (-b - 0.5 * b * ds) * dt;
      }
      for (let i = 0; i < x.length; i++) x[i] += (-0.5 * b * x[i] - 0.5 * b * s[i]) * dt;
    }
    const out = new Float64Array(m);
    for (let i = 0; i < m; i++) out[i] = -Math.log(2 * Math.PI) - 0.5 * (x[2 * i] ** 2 + x[2 * i + 1] ** 2) + div[i];
    return { logp: out, end: x };
  }

  /* ---------------------------------------------------------------- EDM: the design space (Karras et al., 2022) */

  // EDM writes every model as x = y + σ·n (data y, standard noise n), and the network as a denoiser D(x; σ) ≈ E[y | x].
  // The probability flow ODE is then dx/dσ = (x − D(x; σ)) / σ. VP data relates by x_VP = x/√(1 + σ²), σ² = (1 − ᾱ)/ᾱ.

  // The VP time t of a noise level σ, for the VP SDE: ln(1 + σ²) = −ln ᾱ(t) = βmin t + ½(βmax − βmin) t².
  function vpTime(sigma, sde = vpSDE()) {
    const L = Math.log1p(sigma * sigma);
    const a = 0.5 * (sde.beta(1) - sde.beta(0));
    const b = sde.beta(0);
    return (-b + Math.sqrt(b * b + 4 * a * L)) / (2 * a);
  }

  // A denoiser from a network trained on the 200-step VP chain (parts 1–4): D(x; σ) = x − σ·ε_θ(x/√(1 + σ²), 200 t(σ)).
  // In EDM's Table 1 this is the VP column: c_skip = 1, c_out = −σ, c_in = 1/√(σ² + 1).
  function vpDenoiser(model, steps = 200) {
    return (xs, sigma) => {
      const cin = 1 / Math.sqrt(1 + sigma * sigma);
      const e = model.eps(
        Float64Array.from(xs, (v) => v * cin),
        vpTime(sigma) * steps
      );
      const out = new Float64Array(xs.length);
      for (let i = 0; i < xs.length; i++) out[i] = xs[i] - sigma * e[i];
      return out;
    };
  }

  // The exact denoiser of a mixture dataset: Tweedie's formula, D = x + σ²·∇ log p_σ(x).
  function exactDenoiser(data) {
    const cache = new Map();
    return (xs, sigma) => {
      const key = sigma.toPrecision(12);
      if (!cache.has(key)) cache.set(key, blurred(data, sigma));
      const b = cache.get(key);
      const g = b.scores(xs);
      for (let i = 0; i < xs.length; i++) g[i] = xs[i] + sigma * sigma * g[i];
      return g;
    };
  }

  // EDM's preconditioning (Table 1): D(x; σ) = c_skip·x + c_out·F(c_in·x; c_noise), with
  // c_skip = σd²/(σ² + σd²), c_out = σ·σd/√(σ² + σd²), c_in = 1/√(σ² + σd²), c_noise = ¼ ln σ. Our network takes its noise
  // input through the same sine–cosine embedding as the step t, so ln σ is mapped linearly onto [0, 200].
  const EDM = { sigmaMin: 0.002, sigmaMax: 80, pMean: -1.2, pStd: 1.2, rho: 7 };
  const edmCoef = (sigma, sd) => ({
    skip: (sd * sd) / (sigma * sigma + sd * sd),
    out: (sigma * sd) / Math.sqrt(sigma * sigma + sd * sd),
    in: 1 / Math.sqrt(sigma * sigma + sd * sd),
    noise: 200 * Math.min(1, Math.max(0, (Math.log(sigma) - Math.log(EDM.sigmaMin)) / (Math.log(EDM.sigmaMax) - Math.log(EDM.sigmaMin)))),
  });

  function edmDenoiser(net, sigmaData = 1) {
    return (xs, sigma) => {
      const c = edmCoef(sigma, sigmaData);
      const n = xs.length / 2;
      const { out } = forward(
        net,
        netInputs(
          Float64Array.from(xs, (v) => v * c.in),
          c.noise,
          200
        ),
        n
      );
      const d = new Float64Array(xs.length);
      for (let i = 0; i < xs.length; i++) d[i] = c.skip * xs[i] + c.out * out[i];
      return d;
    };
  }

  // EDM training: σ with ln σ ~ N(P_mean, P_std²), x = y + σ·n, and a plain squared error on F against its effective
  // target (y − c_skip·x)/c_out. The loss weight λ(σ) = (σ² + σd²)/(σ·σd)² times c_out² is exactly 1, so every noise
  // level's loss starts at the same scale.
  function edmTrainer(net, data, opts = {}) {
    const batch = opts.batch ?? 256;
    const steps = opts.steps ?? 6000;
    const lr = opts.lr ?? 2e-3;
    const sd = opts.sigmaData ?? 1;
    const rand = rng(opts.seed ?? 5);
    const opt = adam(net, lr);
    return {
      opt,
      step() {
        const xin = new Float64Array(2 * batch);
        const tgt = new Float64Array(2 * batch);
        const tn = new Float64Array(batch);
        for (let i = 0; i < batch; i++) {
          const k = pick(rand, data.weights);
          const sigma = Math.exp(EDM.pMean + EDM.pStd * rand.normal());
          const c = edmCoef(sigma, sd);
          tn[i] = c.noise;
          for (let d = 0; d < 2; d++) {
            const y = data.means[k][d] + data.sd[k] * rand.normal();
            const x = y + sigma * rand.normal();
            xin[2 * i + d] = c.in * x;
            tgt[2 * i + d] = (y - c.skip * x) / c.out;
          }
        }
        const cache = forward(net, netInputs(xin, tn, 200), batch, true);
        const dout = new Float64Array(2 * batch);
        let loss = 0;
        for (let i = 0; i < 2 * batch; i++) {
          const r = cache.out[i] - tgt[i];
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

  // EDM's time steps: σ_i = (σmax^(1/ρ) + i/(N − 1)·(σmin^(1/ρ) − σmax^(1/ρ)))^ρ for i < N, then σ_N = 0.
  // ρ = 1 spaces them evenly in σ; larger ρ crowds them towards σmin. EDM uses ρ = 7.
  function edmSigmas(N, opts = {}) {
    const rho = opts.rho ?? EDM.rho;
    const lo = opts.sigmaMin ?? EDM.sigmaMin;
    const hi = opts.sigmaMax ?? EDM.sigmaMax;
    const out = [];
    for (let i = 0; i < N; i++) out.push((hi ** (1 / rho) + (i / Math.max(1, N - 1)) * (lo ** (1 / rho) - hi ** (1 / rho))) ** rho);
    out.push(0);
    return out;
  }

  // Solves dx/dσ = (x − D(x; σ))/σ through the given σ list, from x = σ_0·n. "euler" takes one denoiser call per step;
  // "heun" corrects each step with a second call at its end (EDM's Algorithm 1), except the last step to σ = 0,
  // which is a plain Euler step. frames[k] is the cloud at sigmas[k]; evals counts denoiser calls.
  function edmStepper(D, sigmas, noise, opts = {}) {
    const heun = (opts.solver ?? "heun") === "heun";
    let x = Float64Array.from(noise, (v) => v * sigmas[0]);
    let k = 0;
    let evals = 0;
    const frames = [Float64Array.from(x)];
    return {
      frames,
      sigmas,
      get evals() {
        return evals;
      },
      next(count = 5) {
        for (let c = 0; c < count && k < sigmas.length - 1; c++, k++) {
          const s0 = sigmas[k];
          const s1 = sigmas[k + 1];
          const d0 = D(x, s0);
          evals++;
          const slope = new Float64Array(x.length);
          for (let i = 0; i < x.length; i++) slope[i] = (x[i] - d0[i]) / s0;
          const nx = new Float64Array(x.length);
          for (let i = 0; i < x.length; i++) nx[i] = x[i] + (s1 - s0) * slope[i];
          if (heun && s1 > 0) {
            const d1 = D(nx, s1);
            evals++;
            for (let i = 0; i < x.length; i++) nx[i] = x[i] + (s1 - s0) * 0.5 * (slope[i] + (nx[i] - d1[i]) / s1);
          }
          x = nx;
          frames.push(Float64Array.from(x));
        }
        return k < sigmas.length - 1 ? k / (sigmas.length - 1) : null;
      },
    };
  }

  /* ---------------------------------------------------------------- flow matching and rectified flow */

  // Flow matching with straight paths (Lipman et al., 2022; Liu et al., 2022, "rectified flow"): mix data y and noise
  // z along a straight line, x_t = (1 − t)·y + t·z for t in [0, 1], and train a network v(x_t, t) to predict the
  // line's velocity z − y. (The papers put noise at t = 0; we keep noise at t = 1, like the rest of the series.)
  // pairs(rand) returns one training pair [y_x, y_y, z_x, z_y]: data with fresh noise, or a reflow pair.
  function flowTrainer(net, pairs, opts = {}) {
    const batch = opts.batch ?? 256;
    const steps = opts.steps ?? 6000;
    const lr = opts.lr ?? 2e-3;
    const rand = rng(opts.seed ?? 5);
    const opt = adam(net, lr);
    return {
      opt,
      step() {
        const xin = new Float64Array(2 * batch);
        const tgt = new Float64Array(2 * batch);
        const tt = new Float64Array(batch);
        for (let i = 0; i < batch; i++) {
          const [yx, yy, zx, zy] = pairs(rand);
          const t = rand.next();
          tt[i] = 200 * t;
          xin[2 * i] = (1 - t) * yx + t * zx;
          xin[2 * i + 1] = (1 - t) * yy + t * zy;
          tgt[2 * i] = zx - yx;
          tgt[2 * i + 1] = zy - yy;
        }
        const cache = forward(net, netInputs(xin, tt, 200), batch, true);
        const dout = new Float64Array(2 * batch);
        let loss = 0;
        for (let i = 0; i < 2 * batch; i++) {
          const r = cache.out[i] - tgt[i];
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

  // Data with fresh noise, the first round of rectified flow.
  const dataPairs = (data) => (rand) => {
    const k = pick(rand, data.weights);
    return [data.means[k][0] + data.sd[k] * rand.normal(), data.means[k][1] + data.sd[k] * rand.normal(), rand.normal(), rand.normal()];
  };

  // The trained velocity network: v(xs, t) for t in [0, 1].
  const flowModel = (net) => (xs, t) => forward(net, netInputs(xs, 200 * t, 200), xs.length / 2).out;

  // Euler steps of dx/dt = v from t = 1 (noise) to t = 0 (data): x ← x − Δt·v. frames[k] is the cloud after k steps.
  function flowStepper(v, noise, opts = {}) {
    const n = opts.n ?? 50;
    let x = Float64Array.from(noise);
    let k = 0;
    const frames = [Float64Array.from(x)];
    return {
      frames,
      next(count = 10) {
        for (let c = 0; c < count && k < n; c++, k++) {
          const t = 1 - k / n;
          const vel = v(x, t);
          for (let i = 0; i < x.length; i++) x[i] -= vel[i] / n;
          frames.push(Float64Array.from(x));
        }
        return k < n ? k / n : null;
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

  // The same distance, but from a cloud to the exact data distribution instead of to a second sample, so only one
  // side is random. Along each direction the data is a 1D mixture of Gaussians with a known CDF F, and the distance is
  // ∫ |F_n(x) − F(x)| dx, with F_n the cloud's empirical CDF, integrated on a fine grid.
  function slicedToData(xs, data, dirs = 32, grid = 400) {
    const n = xs.length / 2;
    const p = new Float64Array(n);
    let total = 0;
    for (let d = 0; d < dirs; d++) {
      const th = (Math.PI * (d + 0.5)) / dirs;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      for (let i = 0; i < n; i++) p[i] = c * xs[2 * i] + sn * xs[2 * i + 1];
      p.sort();
      const ms = data.means.map((m) => c * m[0] + sn * m[1]);
      const lo = Math.min(p[0], ...ms) - 4 * Math.max(...data.sd);
      const hi = Math.max(p[n - 1], ...ms) + 4 * Math.max(...data.sd);
      const dx = (hi - lo) / grid;
      let j = 0;
      let sum = 0;
      for (let g = 0; g < grid; g++) {
        const x = lo + (g + 0.5) * dx;
        while (j < n && p[j] <= x) j++;
        let F = 0;
        for (let k = 0; k < ms.length; k++) F += data.weights[k] * normalCdf((x - ms[k]) / data.sd[k]);
        sum += Math.abs(j / n - F) * dx;
      }
      total += sum;
    }
    return total / dirs;
  }

  // Φ, the standard normal CDF (Abramowitz and Stegun 7.1.26, error under 1.5e-7).
  function normalCdf(z) {
    const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
    return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
  }

  // The floor for slicedToData: the average distance of `draws` fresh samples of n real data points.
  function dataFloor(data, n, draws = 5) {
    let sum = 0;
    for (let d = 0; d < draws; d++) sum += slicedToData(sample(data, n, 500 + d).xs, data);
    return sum / draws;
  }

  // The data after t steps of the forward process, as a dataset of its own (component k becomes
  // N(√ᾱ μ_k, (ᾱ sd_k² + 1 − ᾱ) I)), for measuring a cloud at step t against the exact answer.
  function noisedData(data, ab) {
    return {
      weights: data.weights,
      means: data.means.map((m) => [Math.sqrt(ab) * m[0], Math.sqrt(ab) * m[1]]),
      sd: data.sd.map((s) => Math.sqrt(ab * s * s + 1 - ab)),
    };
  }

  // The standard Gaussian as a dataset, for measuring how close a cloud is to pure noise.
  const STANDARD = { weights: [1], means: [[0, 0]], sd: [1] };

  // Precision and recall for generative models in the k-nearest-neighbour form of Kynkäänniemi et al. (2019). Each
  // real point gets a ball reaching its k-th nearest real neighbour; the union of the balls estimates where the data
  // lives. Precision is the share of samples inside it. Recall swaps the roles: the share of real points inside the
  // balls around the samples. Precision measures fidelity, recall measures coverage.
  function precisionRecall(samples, real, k = 3) {
    const radii = (xs) => {
      const n = xs.length / 2;
      const r = new Float64Array(n);
      const d = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) d[j] = (xs[2 * i] - xs[2 * j]) ** 2 + (xs[2 * i + 1] - xs[2 * j + 1]) ** 2;
        d.sort();
        r[i] = d[k]; // d[0] is the point itself
      }
      return r;
    };
    const inside = (pts, centres, r2) => {
      let c = 0;
      for (let i = 0; i < pts.length; i += 2)
        for (let j = 0; j < centres.length; j += 2)
          if ((pts[i] - centres[j]) ** 2 + (pts[i + 1] - centres[j + 1]) ** 2 <= r2[j >> 1]) {
            c++;
            break;
          }
      return c / (pts.length / 2);
    };
    return { precision: inside(samples, real, radii(real)), recall: inside(real, samples, radii(samples)) };
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
    const out = opts.into ?? new Float64Array(sch.T + 1);
    for (let t = Math.max(2, opts.from ?? 2); t <= (opts.to ?? sch.T); t++) {
      const { xt, eps } = qSample(x0, sch, t, 1000 + t);
      const e = model.eps(xt, t);
      let se = 0;
      for (let i = 0; i < xt.length; i++) se += (eps[i] - e[i]) ** 2;
      se /= m;
      if (sigma === "learned") {
        // a per-point variance from the network's v: average the 2D KL over the points
        const v = model.v(xt, t);
        const c = sch.beta[t] ** 2 / (sch.alpha[t] * (1 - sch.alphaBar[t]));
        let kl = 0;
        for (let i = 0; i < m; i++) {
          const S = Math.exp(v[i] * Math.log(sch.beta[t]) + (1 - v[i]) * Math.log(sch.betaTilde[t]));
          const d2 = c * ((eps[2 * i] - e[2 * i]) ** 2 + (eps[2 * i + 1] - e[2 * i + 1]) ** 2);
          const r = sch.betaTilde[t] / S;
          kl += r - 1 - Math.log(r) + d2 / (2 * S);
        }
        out[t] = kl / m;
        continue;
      }
      const s2 = sigma === "tilde" ? sch.betaTilde[t] : sch.beta[t];
      const meanTerm = ((sch.beta[t] ** 2 / (sch.alpha[t] * (1 - sch.alphaBar[t]))) * se) / (2 * s2);
      const r = sch.betaTilde[t] / s2;
      out[t] = meanTerm + (r - 1 - Math.log(r));
    }
    return out;
  }

  // KL(N(m1, v1 I) ‖ N(m2, v2 I)) in 2 dimensions, in nats.
  function kl2(m1, v1, m2, v2) {
    const r = v1 / v2;
    return r - 1 - Math.log(r) + ((m1[0] - m2[0]) ** 2 + (m1[1] - m2[1]) ** 2) / (2 * v2);
  }

  /* ---------------------------------------------------------------- export */

  const DM = {
    rng,
    pick,
    DATASETS,
    sample,
    gaussian,
    schedule,
    veSchedule,
    forwardStep,
    qSample,
    forwardChain,
    posterior,
    noisyComponents,
    exactModel,
    exactGuided,
    blurred,
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
    langevinStepper,
    annealedStepper,
    uniform,
    vpSDE,
    veSDE,
    vpScore,
    forwardSDE,
    reverseStepper,
    stepList,
    ddimStepper,
    respacedStepper,
    ddimInvert,
    odeLogLikelihood,
    vpTime,
    vpDenoiser,
    exactDenoiser,
    EDM,
    edmCoef,
    edmDenoiser,
    edmTrainer,
    edmSigmas,
    edmStepper,
    flowTrainer,
    dataPairs,
    flowModel,
    flowStepper,
    sliced,
    slicedToData,
    precisionRecall,
    dataFloor,
    noisedData,
    STANDARD,
    normalCdf,
    moments,
    boundTerms,
    kl2,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = DM;
  else {
    root.DM = Object.assign(root.DM || {}, DM);
    root.TF = root.TF || {}; // tf-view.js (shared drawing helpers) attaches itself to window.TF
  }
})(typeof window !== "undefined" ? window : globalThis);
