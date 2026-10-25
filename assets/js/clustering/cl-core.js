// The maths for the "Clustering from scratch" series: seeded toy datasets and the algorithms, written so every
// intermediate step can be drawn. Classic script (not an ES module): it sets window.CL in the browser and
// module.exports in Node, so the numbers quoted in the posts can be checked from the command line.
(function (root) {
  "use strict";

  /* ---------------------------------------------------------------- random numbers */

  // mulberry32: a tiny seeded generator, so a dataset and its "random" starts are the same on every visit.
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

  /* ---------------------------------------------------------------- datasets */

  // Every dataset lives in the square [0, 10] × [0, 10]. A point is [x, y]; `truth` is the group it was drawn from.
  const BOX = 10;
  const clampBox = (v) => Math.min(BOX - 0.15, Math.max(0.15, v));

  function blobs(rand, specs) {
    const points = [];
    const truth = [];
    specs.forEach(([cx, cy, sd, count, sy], g) => {
      for (let i = 0; i < count; i++) {
        points.push([clampBox(cx + sd * rand.normal()), clampBox(cy + (sy ?? sd) * rand.normal())]);
        truth.push(g);
      }
    });
    return { points, truth };
  }

  const DATASETS = {
    blobs: {
      label: "three blobs",
      k: 3,
      make: (rand) =>
        blobs(rand, [
          [2.6, 7.2, 0.85, 20],
          [7.3, 7.0, 0.85, 20],
          [5.0, 2.6, 0.85, 20],
        ]),
    },
    uneven: {
      label: "big and small",
      k: 3,
      make: (rand) =>
        blobs(rand, [
          [3.4, 5.0, 1.55, 44],
          [7.9, 7.9, 0.45, 10],
          [7.9, 2.2, 0.45, 10],
        ]),
    },
    stretched: {
      label: "stretched",
      k: 3,
      make: (rand) =>
        blobs(rand, [
          [5.0, 8.2, 2.3, 22, 0.35],
          [5.0, 5.0, 2.3, 22, 0.35],
          [5.0, 1.8, 2.3, 22, 0.35],
        ]),
    },
    few: {
      label: "24 points",
      k: 3,
      make: (rand) =>
        blobs(rand, [
          [2.6, 7.2, 0.8, 8],
          [7.3, 7.0, 0.8, 8],
          [5.0, 2.6, 0.8, 8],
        ]),
    },
    bridge: {
      label: "bridged blobs",
      k: 2,
      make(rand) {
        const { points, truth } = blobs(rand, [
          [2.4, 5.0, 0.7, 14],
          [7.6, 5.0, 0.7, 14],
        ]);
        // a thin line of points from one blob towards the other, counted with the left blob
        for (let i = 0; i < 6; i++) {
          points.push([clampBox(3.3 + i * 0.62 + 0.05 * rand.normal()), clampBox(5.0 + 0.08 * rand.normal())]);
          truth.push(0);
        }
        return { points, truth };
      },
    },
    noisy: {
      label: "blobs and noise",
      k: 3,
      make(rand) {
        const { points, truth } = blobs(rand, [
          [2.6, 7.2, 0.7, 20],
          [7.3, 7.0, 0.7, 20],
          [5.0, 2.6, 0.7, 20],
        ]);
        // scattered points that belong to no group: truth −2 marks noise
        for (let i = 0; i < 14; i++) {
          points.push([clampBox(0.4 + 9.2 * rand.next()), clampBox(0.4 + 9.2 * rand.next())]);
          truth.push(-2);
        }
        return { points, truth };
      },
    },
    rings: {
      label: "ring around a blob",
      k: 2,
      make(rand) {
        const points = [];
        const truth = [];
        for (let i = 0; i < 20; i++) {
          points.push([clampBox(5 + 0.55 * rand.normal()), clampBox(5 + 0.55 * rand.normal())]);
          truth.push(0);
        }
        for (let i = 0; i < 56; i++) {
          const a = (2 * Math.PI * i) / 56;
          const r = 3.6 + 0.2 * rand.normal();
          points.push([clampBox(5 + r * Math.cos(a)), clampBox(5 + r * Math.sin(a))]);
          truth.push(1);
        }
        return { points, truth };
      },
    },
    density: {
      label: "dense and sparse",
      k: 2,
      make: (rand) =>
        blobs(rand, [
          [3.0, 6.5, 0.35, 30],
          [6.6, 4.2, 1.5, 30],
        ]),
    },
    tilted: {
      label: "tilted blobs",
      k: 3,
      salt: 15844, // picks the default sample (seed 1); other seeds are just as valid
      make(rand) {
        // three elongated, rotated Gaussian blobs: [cx, cy, long sd, short sd, angle, count]
        const specs = [
          [3.0, 6.6, 1.5, 0.32, 0.75, 26],
          [6.0, 6.0, 1.5, 0.32, 0.75, 26],
          [5.0, 2.5, 1.7, 0.35, -0.12, 26],
        ];
        const points = [];
        const truth = [];
        specs.forEach(([cx, cy, a, b, th, count], g) => {
          for (let i = 0; i < count; i++) {
            const u = a * rand.normal();
            const v = b * rand.normal();
            points.push([clampBox(cx + u * Math.cos(th) - v * Math.sin(th)), clampBox(cy + u * Math.sin(th) + v * Math.cos(th))]);
            truth.push(g);
          }
        });
        return { points, truth };
      },
    },
    moons: {
      label: "two moons",
      k: 2,
      make(rand) {
        const points = [];
        const truth = [];
        for (let i = 0; i < 70; i++) {
          const upper = i < 35;
          const a = (Math.PI * (upper ? i : i - 35)) / 34;
          const x = upper ? Math.cos(a) : 1 - Math.cos(a);
          const y = upper ? Math.sin(a) : 0.45 - Math.sin(a);
          points.push([clampBox(2 + 3 * x + 0.22 * rand.normal()), clampBox(4.4 + 3 * y + 0.22 * rand.normal())]);
          truth.push(upper ? 0 : 1);
        }
        return { points, truth };
      },
    },
  };

  function dataset(name, seed = 1) {
    const spec = DATASETS[name] || DATASETS.blobs;
    return { name, seed, k: spec.k, ...spec.make(rng(seed * 7919 + (spec.salt ?? name.length))) };
  }

  /* ---------------------------------------------------------------- small vector helpers */

  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const dist = (a, b) => Math.sqrt(dist2(a, b));
  const mean = (pts) => {
    const n = pts.length;
    return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
  };

  // Index of the nearest centre (ties go to the lower index, so runs are reproducible).
  function nearest(p, centres) {
    let best = 0;
    let bestD = Infinity;
    centres.forEach((c, j) => {
      const d = dist2(p, c);
      if (d < bestD) [best, bestD] = [j, d];
    });
    return best;
  }

  // Inertia (within-cluster sum of squares): the number k-means makes small.
  const inertia = (points, labels, centres) => points.reduce((s, p, i) => s + dist2(p, centres[labels[i]]), 0);

  /* ---------------------------------------------------------------- k-means */

  // Forgy start: k distinct data points picked at random.
  function randomStart(points, k, seed) {
    const rand = rng(seed * 104729 + 17);
    const picked = [];
    while (picked.length < Math.min(k, points.length)) {
      const i = rand.int(points.length);
      if (!picked.includes(i)) picked.push(i);
    }
    return { centres: picked.map((i) => points[i].slice()), picked };
  }

  // k-means++ (Arthur & Vassilvitskii, 2007): the first centre uniformly, then each next one with probability
  // proportional to D(x)², the squared distance to the nearest centre chosen so far. Returns every draw's weights.
  function plusPlusStart(points, k, seed) {
    const rand = rng(seed * 104729 + 31);
    const picked = [rand.int(points.length)];
    const rounds = [];
    while (picked.length < Math.min(k, points.length)) {
      const centres = picked.map((i) => points[i]);
      const d2 = points.map((p) => dist2(p, centres[nearest(p, centres)]));
      const total = d2.reduce((s, v) => s + v, 0);
      const probs = d2.map((v) => v / total);
      let u = rand.next();
      let i = 0;
      while (i < points.length - 1 && u >= probs[i]) u -= probs[i++];
      rounds.push({ centres: centres.map((c) => c.slice()), probs, pick: i });
      picked.push(i);
    }
    return { centres: picked.map((i) => points[i].slice()), picked, rounds };
  }

  // Lloyd's algorithm. Returns the whole trace: frames alternate "assign" and "update", each with the centres,
  // the labels and the inertia at that moment, so a figure can scrub through it.
  function lloyd(points, start, maxIter = 50) {
    let centres = start.map((c) => c.slice());
    let labels = null;
    const frames = [{ kind: "start", centres, labels: null, inertia: null, changed: points.length }];
    for (let it = 1; it <= maxIter; it++) {
      const next = points.map((p) => nearest(p, centres));
      const changed = labels ? next.filter((l, i) => l !== labels[i]).length : points.length;
      labels = next;
      frames.push({ kind: "assign", iter: it, centres, labels, inertia: inertia(points, labels, centres), changed });
      if (changed === 0) break;
      centres = centres.map((c, j) => {
        const members = points.filter((_, i) => labels[i] === j);
        return members.length ? mean(members) : c.slice(); // an empty cluster keeps its centre
      });
      frames.push({ kind: "update", iter: it, centres, labels, inertia: inertia(points, labels, centres) });
    }
    const last = frames[frames.length - 1];
    return { frames, centres: last.centres, labels: last.labels, inertia: last.inertia, iterations: last.iter };
  }

  function kmeans(points, k, seed = 1, init = "plusplus") {
    const start = init === "random" ? randomStart(points, k, seed) : plusPlusStart(points, k, seed);
    return { start, ...lloyd(points, start.centres) };
  }

  // The best of several starts, as libraries do by default (scikit-learn's n_init).
  function bestOf(points, k, starts = 10, init = "plusplus") {
    let best = null;
    for (let s = 1; s <= starts; s++) {
      const run = kmeans(points, k, s, init);
      if (!best || run.inertia < best.inertia - 1e-9) best = run;
    }
    return best;
  }

  /* ---------------------------------------------------------------- scores */

  // Silhouette (Rousseeuw, 1987): for each point, a = mean distance to its own cluster, b = mean distance to the
  // nearest other cluster, s = (b − a) / max(a, b). Points alone in their cluster score 0.
  function silhouette(points, labels) {
    const k = Math.max(...labels) + 1;
    const per = points.map((p, i) => {
      const sums = new Array(k).fill(0);
      const counts = new Array(k).fill(0);
      points.forEach((q, j) => {
        if (i === j) return;
        sums[labels[j]] += dist(p, q);
        counts[labels[j]]++;
      });
      const own = labels[i];
      if (counts[own] === 0) return 0;
      const a = sums[own] / counts[own];
      let b = Infinity;
      for (let c = 0; c < k; c++) if (c !== own && counts[c] > 0) b = Math.min(b, sums[c] / counts[c]);
      return b === Infinity ? 0 : (b - a) / Math.max(a, b);
    });
    return { per, mean: per.reduce((s, v) => s + v, 0) / per.length };
  }

  // Share of pairs of points on which two labellings agree (together in both, or apart in both): the Rand index.
  function randIndex(a, b) {
    let agree = 0;
    let total = 0;
    for (let i = 0; i < a.length; i++)
      for (let j = i + 1; j < a.length; j++) {
        agree += (a[i] === a[j]) === (b[i] === b[j]) ? 1 : 0;
        total++;
      }
    return agree / total;
  }

  /* ---------------------------------------------------------------- hierarchical clustering */

  const LINKAGES = {
    single: "single",
    complete: "complete",
    average: "average",
    ward: "Ward",
  };

  // Agglomerative clustering: start with every point alone, and merge the two closest clusters until one is left.
  // Leaves are ids 0 … n − 1, the cluster made by merge m has id n + m. Between-cluster distance by linkage:
  //   single   — the closest pair of points, one from each cluster
  //   complete — the farthest such pair
  //   average  — the mean over all such pairs
  //   ward     — how much the inertia grows if the two are merged: |A||B| / (|A| + |B|) · ‖μ_A − μ_B‖²
  // Each merge records its height (that distance) and the closest pair of points across it, for drawing.
  function agglomerate(points, linkage = "single") {
    const n = points.length;
    const D = points.map((p) => points.map((q) => dist(p, q)));
    const members = points.map((_, i) => [i]);
    const centre = points.map((p) => p.slice());
    const between = new Map(); // "a,b" (a < b) → linkage distance
    const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
    const ward = (a, b) => {
      const na = members[a].length;
      const nb = members[b].length;
      return ((na * nb) / (na + nb)) * dist2(centre[a], centre[b]);
    };
    let active = points.map((_, i) => i);
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) between.set(key(a, b), linkage === "ward" ? ward(a, b) : D[a][b]);

    const merges = [];
    while (active.length > 1) {
      let best = null;
      for (let x = 0; x < active.length; x++)
        for (let y = x + 1; y < active.length; y++) {
          const d = between.get(key(active[x], active[y]));
          if (!best || d < best.d - 1e-12) best = { a: active[x], b: active[y], d };
        }
      const { a, b, d } = best;
      const id = n + merges.length;
      // the closest pair of points across the merge, for the line drawn on the plot
      let pair = null;
      members[a].forEach((i) =>
        members[b].forEach((j) => {
          if (!pair || D[i][j] < pair[2]) pair = [i, j, D[i][j]];
        })
      );
      const na = members[a].length;
      const nb = members[b].length;
      members[id] = [...members[a], ...members[b]];
      centre[id] = [(na * centre[a][0] + nb * centre[b][0]) / (na + nb), (na * centre[a][1] + nb * centre[b][1]) / (na + nb)];
      active = active.filter((c) => c !== a && c !== b);
      // Lance–Williams updates: the distance from the new cluster to every other one, from the old distances
      active.forEach((c) => {
        const da = between.get(key(a, c));
        const db = between.get(key(b, c));
        let v;
        if (linkage === "single") v = Math.min(da, db);
        else if (linkage === "complete") v = Math.max(da, db);
        else if (linkage === "average") v = (na * da + nb * db) / (na + nb);
        else v = ward(id, c);
        between.set(key(id, c), v);
      });
      active.push(id);
      merges.push({ a, b, id, height: d, size: na + nb, pair: pair.slice(0, 2), members: members[id] });
    }
    return { n, merges, linkage, order: leafOrder(n, merges) };
  }

  // Leaves left to right as the dendrogram draws them.
  function leafOrder(n, merges) {
    if (!merges.length) return [0];
    const walk = (id) => (id < n ? [id] : [...walk(merges[id - n].a), ...walk(merges[id - n].b)]);
    return walk(n + merges.length - 1);
  }

  // Labels after the first `count` merges (so n − count clusters), numbered by cluster size, largest first.
  function cutAfter(tree, count) {
    const { n, merges } = tree;
    const root = Array.from({ length: n }, (_, i) => i);
    const find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
    const owner = new Map(); // cluster id → one of its points
    for (let i = 0; i < n; i++) owner.set(i, i);
    merges.slice(0, count).forEach((m) => {
      const pa = find(owner.get(m.a));
      const pb = find(owner.get(m.b));
      root[pb] = pa;
      owner.set(m.id, pa);
    });
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(i);
    }
    const sorted = [...groups.values()].sort((x, y) => y.length - x.length || x[0] - y[0]);
    const labels = new Array(n);
    sorted.forEach((g, c) => g.forEach((i) => (labels[i] = c)));
    return labels;
  }

  const cutK = (tree, k) => cutAfter(tree, Math.max(0, tree.n - k));

  /* ---------------------------------------------------------------- DBSCAN */

  // Indices of the points within eps of point i, including i itself.
  function neighbours(points, i, eps) {
    const out = [];
    points.forEach((q, j) => {
      if (dist(points[i], q) <= eps) out.push(j);
    });
    return out;
  }

  // DBSCAN (Ester et al., 1996). A point is a core point if at least minPts points (itself included) lie within
  // eps. Clusters grow from core points through their neighbours; non-core points reached that way are border
  // points; everything else is noise (label −1). `visits` is the order points joined, [point, cluster, from], for
  // drawing the growth.
  function dbscan(points, eps, minPts) {
    const n = points.length;
    const nbrs = points.map((_, i) => neighbours(points, i, eps));
    const core = nbrs.map((list) => list.length >= minPts);
    const labels = new Array(n).fill(-1);
    const visits = [];
    let cluster = 0;
    for (let i = 0; i < n; i++) {
      if (labels[i] !== -1 || !core[i]) continue;
      labels[i] = cluster;
      visits.push([i, cluster, null]);
      const queue = [i];
      while (queue.length) {
        const p = queue.shift();
        if (!core[p]) continue; // border points join, but don't pass the cluster on
        nbrs[p].forEach((q) => {
          if (labels[q] !== -1) return;
          labels[q] = cluster;
          visits.push([q, cluster, p]);
          queue.push(q);
        });
      }
      cluster++;
    }
    const kind = labels.map((l, i) => (core[i] ? "core" : l >= 0 ? "border" : "noise"));
    return { labels, core, kind, visits, clusters: cluster, nbrs };
  }

  // Distance from each point to its m-th nearest point (counting itself as the first), sorted, largest first:
  // the "k-distance" plot used to choose eps.
  function kDistances(points, m) {
    return points
      .map((p) => {
        const ds = points.map((q) => dist(p, q)).sort((a, b) => a - b);
        return ds[Math.min(m - 1, ds.length - 1)];
      })
      .sort((a, b) => b - a);
  }

  /* ---------------------------------------------------------------- Gaussian mixtures */

  // A 2-D Gaussian: mean m and covariance S = [[a, b], [b, c]]. logPdf is the log of its density at x.
  function logPdf(x, m, S) {
    const [a, b, c] = [S[0][0], S[0][1], S[1][1]];
    const det = a * c - b * b;
    const dx = x[0] - m[0];
    const dy = x[1] - m[1];
    const quad = (c * dx * dx - 2 * b * dx * dy + a * dy * dy) / det; // (x − m)ᵀ S⁻¹ (x − m)
    return -Math.log(2 * Math.PI) - 0.5 * Math.log(det) - 0.5 * quad;
  }

  function covariance(points, weights, m) {
    let sw = 0;
    let a = 0;
    let b = 0;
    let c = 0;
    points.forEach((p, i) => {
      const w = weights ? weights[i] : 1;
      const dx = p[0] - m[0];
      const dy = p[1] - m[1];
      sw += w;
      a += w * dx * dx;
      b += w * dx * dy;
      c += w * dy * dy;
    });
    const r = 1e-6; // keeps a covariance invertible if a component shrinks onto one point
    return [
      [a / sw + r, b / sw],
      [b / sw, c / sw + r],
    ];
  }

  const logSumExp = (xs) => {
    const top = Math.max(...xs);
    return top + Math.log(xs.reduce((s, v) => s + Math.exp(v - top), 0));
  };

  // E step: responsibilities r[i][j] = P(component j | point i), and the log-likelihood of the parameters.
  function eStep(points, params) {
    let ll = 0;
    const resp = points.map((x) => {
      const logs = params.map((p) => Math.log(p.weight) + logPdf(x, p.mean, p.cov));
      const total = logSumExp(logs);
      ll += total;
      return logs.map((v) => Math.exp(v - total));
    });
    return { resp, ll };
  }

  // M step: each component's weight, mean and covariance from the points, weighted by responsibility.
  function mStep(points, resp) {
    const k = resp[0].length;
    return Array.from({ length: k }, (_, j) => {
      const w = resp.map((r) => r[j]);
      const nj = w.reduce((s, v) => s + v, 0);
      const mean = [points.reduce((s, p, i) => s + w[i] * p[0], 0) / nj, points.reduce((s, p, i) => s + w[i] * p[1], 0) / nj];
      return { weight: nj / points.length, mean, cov: covariance(points, w, mean) };
    });
  }

  // EM for a mixture of k Gaussians (Dempster, Laird and Rubin, 1977). Starts from k-means++ means, each with
  // the covariance of the whole dataset and equal weights. Frames: start, then e/m pairs, each with the
  // parameters, the responsibilities and the log-likelihood.
  function gmm(points, k, seed = 1, maxIter = 100, tol = 1e-6) {
    const start = plusPlusStart(points, k, seed).centres;
    const all = covariance(points, null, mean(points));
    let params = start.map((m) => ({ weight: 1 / k, mean: m, cov: all }));
    let { resp, ll } = eStep(points, params);
    const frames = [{ kind: "start", params, resp: null, ll }];
    let iter = 0;
    for (iter = 1; iter <= maxIter; iter++) {
      frames.push({ kind: "e", iter, params, resp, ll });
      params = mStep(points, resp);
      const next = eStep(points, params);
      frames.push({ kind: "m", iter, params, resp, ll: next.ll });
      const gain = next.ll - ll;
      resp = next.resp;
      ll = next.ll;
      if (gain < tol) break;
    }
    const labels = resp.map((r) => r.indexOf(Math.max(...r)));
    return { frames, params, resp, labels, ll, iterations: Math.min(iter, maxIter) };
  }

  // The best of several starts, by log-likelihood.
  function bestGmm(points, k, starts = 5) {
    let best = null;
    for (let s = 1; s <= starts; s++) {
      const run = gmm(points, k, s);
      if (!best || run.ll > best.ll + 1e-9) best = run;
    }
    return best;
  }

  // BIC = −2 log L + (free parameters) · log n. A 2-D component has 2 mean and 3 covariance numbers, and the
  // k weights add k − 1 more (they sum to 1).
  const bic = (run, n) => -2 * run.ll + (6 * run.params.length - 1) * Math.log(n);

  const CL = {
    BOX,
    DATASETS,
    rng,
    dataset,
    dist,
    dist2,
    mean,
    nearest,
    inertia,
    randomStart,
    plusPlusStart,
    lloyd,
    kmeans,
    bestOf,
    silhouette,
    randIndex,
    LINKAGES,
    agglomerate,
    cutAfter,
    cutK,
    neighbours,
    dbscan,
    kDistances,
    logPdf,
    covariance,
    eStep,
    mStep,
    gmm,
    bestGmm,
    bic,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CL;
  else {
    root.CL = CL;
    root.TF = root.TF || {}; // tf-view.js (shared drawing helpers) attaches itself to window.TF
  }
})(typeof window !== "undefined" ? window : globalThis);
