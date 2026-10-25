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
    return { name, seed, k: spec.k, ...spec.make(rng(seed * 7919 + name.length)) };
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
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CL;
  else {
    root.CL = CL;
    root.TF = root.TF || {}; // tf-view.js (shared drawing helpers) attaches itself to window.TF
  }
})(typeof window !== "undefined" ? window : globalThis);
