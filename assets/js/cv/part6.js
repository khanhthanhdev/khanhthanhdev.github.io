// Part 6 of the computer vision series: looking inside a trained convnet. A deeper network than part 5's (trained
// offline, cv-photos.js loads it), its last layer's maps, the class activation map they add up to, occlusion and
// gradient maps, a sanity check with random weights, its mistakes, edited photos, and a nudge that fools it.
(function () {
  "use strict";

  const CV = window.CV;
  const { s, fmt, matrix, bars, progress, narrow } = window.TF.view;
  const { thumb } = CV.view;
  const { button, select, slider } = CV.controls;
  CV.scenes = CV.scenes || {};

  const N = CV.PHOTOS.side;
  const CLASSES = CV.PHOTOS.classes;
  const article = (name) => (/^[aeiou]/.test(name) ? "an" : "a");
  const pc = (v) => `${fmt(100 * v, 0)}%`;

  // Measured offline on all 4,000 CIFAR-10 test photos of the four classes, with these same weights: overall
  // accuracy (%) and per class (plane, car, frog, ship), for each edit and for each size of nudge (in 1/255ths).
  const EDIT_ACC = {
    none: [89.8, [84.5, 92.1, 95.9, 86.6]],
    hide: [70.6, [71.9, 61.0, 70.7, 78.7]],
    keep: [44.3, [96.6, 24.7, 23.5, 32.3]],
    grey: [84.3, [80.5, 89.4, 83.2, 84.1]],
    swap: [62.8, [75.9, 81.1, 33.7, 60.6]],
    shift: [87.1, [82.4, 85.9, 95.5, 84.6]],
  };
  const FOOL_ACC = {
    0: [89.8, [84.5, 92.1, 95.9, 86.6]],
    1: [78.7, [69.4, 82.2, 92.6, 70.7]],
    2: [66.1, [54.0, 68.1, 87.0, 55.4]],
    4: [43.6, [30.2, 40.2, 70.4, 33.4]],
    8: [20.1, [9.0, 13.6, 47.6, 10.2]],
  };
  const EDITS = [
    ["none", "unchanged"],
    ["hide", "centre hidden"],
    ["keep", "only the centre"],
    ["grey", "greyscale"],
    ["swap", "red and blue swapped"],
    ["shift", "moved 8 px right"],
  ];
  const EPS = [0, 1, 2, 4, 8];

  // Heat over a photo: the photo in dimmed grey, red where grid > 0 and blue where < 0, full colour at ±range. The
  // grid (any size) is stretched over the photo smoothly. Fixed colours, like the photos themselves.
  const HOT = [226, 60, 40];
  const COLD = [40, 110, 226];
  function overlay(p, grid, range) {
    const n = grid.length;
    const at = (i, j) => grid[Math.max(0, Math.min(n - 1, i))][Math.max(0, Math.min(n - 1, j))];
    const px = new Uint8Array(N * N * 3);
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        // bilinear, with grid cell i centred at (i + 0.5) · N / n
        const y = ((r + 0.5) * n) / N - 0.5;
        const x = ((c + 0.5) * n) / N - 0.5;
        const [i, j] = [Math.floor(y), Math.floor(x)];
        const [fy, fx] = [y - i, x - j];
        const v = (1 - fy) * ((1 - fx) * at(i, j) + fx * at(i, j + 1)) + fy * ((1 - fx) * at(i + 1, j) + fx * at(i + 1, j + 1));
        const k = (r * N + c) * 3;
        const lum = (0.3 * p.px[k] + 0.59 * p.px[k + 1] + 0.11 * p.px[k + 2]) / 255;
        const base = 60 + 130 * lum;
        const a = Math.min(1, Math.abs(v) / range) * 0.8;
        const col = v > 0 ? HOT : COLD;
        for (let q = 0; q < 3; q++) px[k + q] = Math.round(base + (col[q] - base) * a);
      }
    return { px };
  }

  // A photo with some of its pixels changed: fn(r, c, rgb in 0 … 1) → rgb. Keeps exact values in vec, bytes in px.
  function editPhoto(p, fn) {
    const vec = new Array(N * N * 3);
    const px = new Uint8Array(N * N * 3);
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const k = (r * N + c) * 3;
        const rgb = fn(r, c, [p.vec[k], p.vec[k + 1], p.vec[k + 2]]);
        for (let q = 0; q < 3; q++) {
          vec[k + q] = rgb[q];
          px[k + q] = Math.round(255 * Math.max(0, Math.min(1, rgb[q])));
        }
      }
    return { label: p.label, vec, px };
  }

  // A grid's rank correlation with another (Spearman's ρ): 1 for the same order, about 0 for unrelated ones.
  function spearman(a, b) {
    const rank = (v) => {
      const order = v.map((x, i) => [x, i]).sort((u, w) => u[0] - w[0]);
      const r = new Array(v.length);
      order.forEach(([, i], k) => (r[i] = k));
      return r;
    };
    const [ra, rb] = [rank(a.flat()), rank(b.flat())];
    const m = (ra.length - 1) / 2;
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    ra.forEach((x, i) => {
      sab += (x - m) * (rb[i] - m);
      saa += (x - m) ** 2;
      sbb += (rb[i] - m) ** 2;
    });
    return sab / Math.sqrt(saa * sbb);
  }

  // The same layers with random weights, scaled the way training starts them: the sanity check's network.
  function randomLike(net, seed) {
    const r = CV.rng(seed);
    const fill = (n, sd) => Float32Array.from({ length: n }, () => r.normal() * sd);
    return {
      chMean: net.chMean,
      layers: net.layers.map((l) => ({ K: l.K, C: l.C, w: fill(l.w.length, Math.sqrt(2 / (l.C * 9))), b: new Float32Array(l.K) })),
      fc: { w: fill(net.fc.w.length, Math.sqrt(1 / net.layers.at(-1).K)), b: new Float32Array(net.fc.b.length) },
    };
  }

  CV.scenes.part6 = (stage) =>
    Promise.all([CV.loadPhotos(), CV.loadDeepNet(), CV.loadOcclusion()]).then(([photos, net, occ]) => scene(stage, photos, net, occ));

  function scene(stage, photos, net, occ) {
    const { svg, toolbar, controls, strip } = stage;
    const { test } = photos;
    const rnd = randomLike(net, 7);
    const right = test.filter((p, i) => occ.pred[i] === p.label).length;
    const fill = net.chMean;

    // forward passes and gradients, memoised per photo object (edited photos are new objects)
    const memo = new WeakMap();
    function look(p, model = net) {
      if (!memo.has(p)) memo.set(p, new Map());
      const m = memo.get(p);
      if (!m.has(model)) {
        const x = CV.deepInput(model, p);
        const f = CV.deepForward(model, x);
        m.set(model, { f, probs: CV.softmax(f.scores), cams: [], grads: [] });
      }
      return m.get(model);
    }
    const cam = (p, j, model = net) => {
      const l = look(p, model);
      return (l.cams[j] ??= CV.deepCam(model, l.f, j));
    };
    // saliency: the gradient's size at each pixel, the largest of its three colours
    const saliency = (p, j, model = net) => {
      const l = look(p, model);
      return (l.grads[j] ??= (() => {
        const g = CV.deepGrad(model, l.f, j);
        return Array.from({ length: N }, (_, r) =>
          Array.from({ length: N }, (_, c) => Math.max(...[0, 1, 2].map((q) => Math.abs(g[q * N * N + r * N + c]))))
        );
      })());
    };
    // a grid scaled to 0 … 1 by its 99th percentile, so one hot pixel doesn't wash out the rest
    const stretch = (grid) => {
      const v = grid.flat().sort((a, b) => a - b);
      const top = v[Math.floor(0.99 * (v.length - 1))] || 1;
      return grid.map((row) => row.map((x) => Math.min(1, x / top)));
    };
    // one colour scale for a photo's four maps: the strongest evidence for any class is full red (stronger evidence
    // against stays full blue), so the maps can be compared without one class's large negatives washing out the rest
    const camRange = (p, model = net) => Math.max(1e-6, ...CLASSES.flatMap((_, j) => cam(p, j, model).flat()));

    /* -------------------------------------------- inputs: test photo, class, edit, nudge */

    const state = { q: 36, cls: null, edit: 1, eps: 2 };
    const qText = document.createElement("span");
    qText.className = "tf-label";
    const prevQ = button("◀", () => pickQuery(state.q - 1));
    const nextQ = button("▶", () => pickQuery(state.q + 1));
    prevQ.setAttribute("aria-label", "Previous test photo");
    nextQ.setAttribute("aria-label", "Next test photo");
    toolbar.append(qText, prevQ, nextQ);
    function pickQuery(i) {
      state.q = (i + test.length) % test.length;
      state.cls = null;
      clsIn.el.value = "";
      stage.refresh();
    }
    const clsIn = select("map for", [["", "its true class"], ...CLASSES.map((c, j) => [j, c])], "", (v) => {
      state.cls = v === "" ? null : Number(v);
      stage.refresh();
    });
    const editIn = select(
      "edit",
      EDITS.map(([, text], i) => [i, text]),
      state.edit,
      (v) => {
        state.edit = Number(v);
        stage.refresh();
      }
    );
    const epsIn = slider(
      "nudge",
      0,
      EPS.length - 1,
      state.eps,
      (v) => {
        state.eps = v;
        stage.refresh();
      },
      (v) => `${EPS[v]}/255`
    );
    controls.append(clsIn.wrap, editIn.wrap, epsIn.wrap);
    const photo = () => test[state.q];
    const cls = () => state.cls ?? photo().label;

    /* -------------------------------------------- objects */

    const titleOf = (t, y = -12) => {
      const el = s("text", { class: "tf-mat-title", x: 0, y });
      t.el.append(el);
      return (text) => (el.textContent = text);
    };
    const pictureBox = (size) => ({ x: -6, y: -30, width: size + 12, height: size + 46 });
    function pic(size) {
      const t = thumb(svg, { size });
      const title = titleOf(t);
      t.title = (text) => {
        title(text);
        return t;
      };
      t.box = pictureBox(size);
      return t;
    }
    function windowOn(t, unit) {
      const rect = s("rect", { class: "cv-window" });
      t.el.append(rect);
      return (r, c, size) => {
        rect.style.opacity = r == null ? "0" : "1";
        if (r == null) return;
        rect.setAttribute("x", c * unit);
        rect.setAttribute("y", r * unit);
        rect.setAttribute("width", size * unit);
        rect.setAttribute("height", size * unit);
      };
    }
    const probBars = (title) => {
      const b = bars(svg, { labels: CLASSES, width: 140, gap: 26, title, percent: true });
      b.box = { x: -60, y: -34, width: 260, height: 4 * 26 + 44 };
      return b;
    };

    // the network, layer by layer: the photo, one map from each conv layer, and the probabilities
    const stages = [pic(128), pic(128), pic(128), pic(128)];
    const lookBars = probBars("probabilities");

    // the last layer's maps that matter most for a class
    const TOP = 12;
    const topMaps = Array.from({ length: TOP }, () => {
      const t = thumb(svg, { size: 72 });
      t.box = { x: -6, y: -10, width: 84, height: 100 };
      return t;
    });
    const topTitle = s("text", { class: "tf-mat-title", x: 0, y: -24 });
    topMaps[0].el.append(topTitle);

    // the class activation map: the photo and one heat picture per class
    const camPhoto = pic(140);
    const cams = CLASSES.map(() => pic(140));

    // occlusion: the photo with the grey patch, the drop map building up, and the probabilities
    const occPhoto = pic(192);
    const occWin = windowOn(occPhoto, 192 / N);
    const occMap = pic(192);
    const occMapWin = windowOn(occMap, 192 / occ.n);
    const occBars = probBars("with the patch");

    // gradients: the photo, its saliency map, the CAM of the same class
    const salPhoto = pic(160);
    const salMap = pic(160);
    const salCam = pic(160);

    // sanity: trained and random, saliency and CAM
    const sanity = [pic(140), pic(140), pic(140), pic(140)];

    // mistakes: the confusion matrix on the 100 test photos, and every wrong photo with the CAM of its wrong answer
    const conf = matrix(svg, {
      rows: 4,
      cols: 4,
      cell: 44,
      kind: "signed",
      range: 25,
      digits: 0,
      name: "true ↓ · guessed →",
      rowLabels: CLASSES,
      colLabels: CLASSES,
    });
    conf.box = { x: -60, y: -80, width: 4 * 44 + 70, height: 4 * 44 + 90 };
    const wrongIdx = test.map((p, i) => i).filter((i) => occ.pred[i] !== test[i].label);
    const wrongs = wrongIdx.map(() => {
      const t = thumb(svg, { size: 64 });
      t.box = { x: -6, y: -10, width: 76, height: 96 };
      return t;
    });
    const wrongTitle = s("text", { class: "tf-mat-title", x: 0, y: -24 });
    wrongs[0]?.el.append(wrongTitle);

    // edits: the edited photo, the CAM of what it now says, the probabilities
    const editPhotoPic = pic(160);
    const editCam = pic(160);
    const editBars = probBars("probabilities");

    // the nudge: the photo, the change (exaggerated), the nudged photo, before and after
    const foolPics = [pic(128), pic(128), pic(128)];
    const foolBefore = probBars("before");
    const foolAfter = probBars("after");

    const layout = CV.layout(svg, () => ({
      ...Object.fromEntries(stages.map((t, k) => [`st${k}`, t])),
      lookBars,
      ...Object.fromEntries(topMaps.map((t, k) => [`tm${k}`, t])),
      camPhoto,
      ...Object.fromEntries(cams.map((t, j) => [`cam${j}`, t])),
      occPhoto,
      occMap,
      occBars,
      salPhoto,
      salMap,
      salCam,
      ...Object.fromEntries(sanity.map((t, k) => [`san${k}`, t])),
      conf,
      ...Object.fromEntries(wrongs.map((t, k) => [`wr${k}`, t])),
      editPhotoPic,
      editCam,
      editBars,
      ...Object.fromEntries(foolPics.map((t, k) => [`fp${k}`, t])),
      foolBefore,
      foolAfter,
    }));

    const verdict = (p, probs) => {
      const g = CV.argmax(probs);
      return `${article(CLASSES[p.label])} ${CLASSES[p.label]} → ${CLASSES[g]} ${pc(probs[g])} ${g === p.label ? "✓" : "✗"}`;
    };
    // the strip's text: on a phone, the shorter version, so it fits in two lines
    const say = (long, short = long) => strip(narrow.matches ? short : long);
    const perClass = (list) => CLASSES.map((c, j) => `${c} ${fmt(list[j], 0)}%`).join(", ");
    // a map (K × H × W numbers, one channel) as a grid
    const channel = (a, k) => Array.from({ length: a.H }, (_, r) => Array.from(a.y.subarray(k * a.H * a.W + r * a.W, k * a.H * a.W + (r + 1) * a.W)));
    const maxOf = (grid) => Math.max(1e-6, ...grid.flat());
    const unit = (grid) => grid.map((row) => row.map((v) => v / maxOf(grid)));
    // pictures are redrawn only when what they show changes, not on every scroll frame
    const drawn = {};
    const fresh = (name, key) => drawn[name] !== key && ((drawn[name] = key), true);
    // edited and nudged photos are made once each, so their forward passes are memoised too
    const made = new Map();
    const once = (key, fn) => (made.has(key) ? made.get(key) : made.set(key, fn()).get(key));

    /* -------------------------------------------- render */

    const steps = {
      look() {
        const p = photo();
        const { f, probs } = look(p);
        if (fresh("look", state.q)) {
          stages[0].set(p).title("photo, 32 × 32").caption("3 colours");
          // from each layer, the map that responds most, as grey
          f.acts.forEach((a, n) => {
            const sums = Array.from({ length: a.K }, (_, k) =>
              channel(a, k)
                .flat()
                .reduce((x, y) => x + y, 0)
            );
            const k = CV.argmax(sums);
            stages[n + 1].set(unit(channel(a, k))).title(`layer ${n + 1}, ${a.H} × ${a.W}`);
            stages[n + 1].caption(`1 of ${a.K} maps`);
          });
          lookBars.set(probs, CV.argmax(probs));
        }
        layout(
          narrow.matches
            ? { st0: [0, 0], st1: [180, 0], st2: [0, 210], st3: [180, 210], lookBars: [60, 440] }
            : { st0: [0, 0], st1: [170, 0], st2: [340, 0], st3: [510, 0], lookBars: [240, 230] }
        );
        say(
          `${verdict(p, probs)} · ${right} of the 100 test photos right · each picture: the layer's busiest map, of ${f.acts.map((a) => a.K).join(", ")}`,
          `${verdict(p, probs)} · ${right} of 100 right`
        );
      },

      maps() {
        const p = photo();
        const j = cls();
        const { f } = look(p);
        const last = f.acts.at(-1);
        const K = last.K;
        const contrib = f.feats.map((v, k) => net.fc.w[j * K + k] * v);
        const order = contrib.map((v, k) => k).sort((a, b) => Math.abs(contrib[b]) - Math.abs(contrib[a]));
        const top = order.slice(0, TOP);
        if (fresh("maps", `${state.q}:${j}`)) {
          const range = Math.max(1e-6, ...top.map((k) => maxOf(channel(last, k))));
          top.forEach((k, i) => {
            topMaps[i].set(channel(last, k).map((row) => row.map((v) => v / range)));
            topMaps[i].caption(`${contrib[k] > 0 ? "+" : "−"}${fmt(Math.abs(contrib[k]), 2)}`);
          });
        }
        topTitle.textContent = `the ${TOP} of ${K} maps that move "${CLASSES[j]}" most (w × average)`;
        const cols = narrow.matches ? 4 : 6;
        layout(Object.fromEntries(topMaps.map((_, i) => [`tm${i}`, [(i % cols) * 96, Math.floor(i / cols) * 110]])));
        const sum = contrib.reduce((a, b) => a + b, 0);
        const total = `${fmt(sum, 2)} ${net.fc.b[j] < 0 ? "−" : "+"} ${fmt(Math.abs(net.fc.b[j]), 2)} = ${fmt(f.scores[j], 2)}`;
        say(
          `score for ${CLASSES[j]} = Σ over ${K} maps of weight × average, plus bias = ${total} · the ${TOP} here give ${fmt(
            top.reduce((a, k) => a + contrib[k], 0),
            2
          )}`,
          `${CLASSES[j]}: Σ w × average + bias = ${total}`
        );
      },

      cam() {
        const p = photo();
        const { f, probs } = look(p);
        if (fresh("cam", state.q)) {
          const range = camRange(p);
          camPhoto.set(p).title("test photo");
          cams.forEach((t, j) => {
            t.set(overlay(p, cam(p, j), range), { label: j }).title(`${CLASSES[j]}: score ${fmt(f.scores[j], 1)}`);
            t.mark(j === CV.argmax(probs) ? "ring" : null);
          });
        }
        layout(
          narrow.matches
            ? { camPhoto: [100, 0], cam0: [0, 210], cam1: [180, 210], cam2: [0, 410], cam3: [180, 410] }
            : { camPhoto: [0, 100], cam0: [200, 0], cam1: [370, 0], cam2: [200, 200], cam3: [370, 200] }
        );
        const g = cam(p, CV.argmax(probs));
        const avg = g.flat().reduce((a, b) => a + b, 0) / g.flat().length;
        const bias = net.fc.b[CV.argmax(probs)];
        const total = `${fmt(avg, 2)} ${bias < 0 ? "−" : "+"} ${fmt(Math.abs(bias), 2)} = ${fmt(f.scores[CV.argmax(probs)], 2)}`;
        say(
          `${verdict(p, probs)} · red: evidence for, blue: against · map average plus bias: ${total}, the score`,
          `${verdict(p, probs)} · average + bias = ${total}`
        );
      },

      occlude(t) {
        const p = photo();
        const j = p.label;
        const i = state.q;
        const n = occ.n;
        const base = look(p).probs;
        const drop = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => base[j] - occ.at(i, r, c)[j]));
        const k = progress(t, n * n);
        const done = !(k >= 1 && k <= n * n);
        // the patch walks row by row; when done, it sits where it hurt most
        let at = [Math.floor((k - 1) / n), (k - 1) % n];
        if (done) {
          at = [0, 0];
          drop.forEach((row, r) => row.forEach((v, c) => v > drop[at[0]][at[1]] && (at = [r, c])));
        }
        const [r0, c0] = [at[0] * occ.stride, at[1] * occ.stride];
        if (fresh("occPhoto", `${i}:${r0}:${c0}`))
          occPhoto
            .set(editPhoto(p, (r, c, rgb) => (r >= r0 && r < r0 + occ.patch && c >= c0 && c < c0 + occ.patch ? fill : rgb)))
            .title(`a grey ${occ.patch} × ${occ.patch} patch`);
        occWin(r0, c0, occ.patch);
        if (fresh("occMap", `${i}:${done ? "all" : k}`)) {
          const shown = done ? drop : drop.map((row, r) => row.map((v, c) => (r * n + c < k ? v : 0)));
          occMap.set(shown, { signed: true, range: Math.max(0.05, ...drop.flat().map(Math.abs)) }).title(`drop in p(${CLASSES[j]}), ${n} × ${n}`);
        }
        occMapWin(at[0], at[1], 1);
        const probs = occ.at(i, at[0], at[1]);
        occBars.set(probs, j);
        layout(
          narrow.matches ? { occPhoto: [0, 0], occMap: [220, 0], occBars: [100, 270] } : { occPhoto: [0, 0], occMap: [240, 0], occBars: [540, 40] }
        );
        strip(
          `patch at row ${r0 + 1}, column ${c0 + 1}: p(${CLASSES[j]}) ${pc(base[j])} → ${pc(probs[j])}` +
            (done ? ` · ${n * n} grey patches, ${n * n} more forward passes` : "")
        );
      },

      saliency() {
        const p = photo();
        const j = cls();
        if (fresh("saliency", `${state.q}:${j}`)) {
          salPhoto.set(p).title("test photo");
          salMap.set(stretch(saliency(p, j))).title(`gradient, ${CLASSES[j]}`);
          salCam.set(overlay(p, cam(p, j), camRange(p)), { label: j }).title(`CAM for ${CLASSES[j]}`);
        }
        layout(narrow.matches ? { salPhoto: [0, 0], salMap: [180, 0], salCam: [90, 230] } : { salPhoto: [0, 0], salMap: [200, 0], salCam: [400, 0] });
        const other = (j + 1) % 4;
        strip(
          `${CLASSES[j]} vs ${CLASSES[other]}, same photo · rank correlation of the gradient maps ${fmt(spearman(saliency(p, j), saliency(p, other)), 2)}, of the CAMs ${fmt(
            spearman(cam(p, j), cam(p, other)),
            2
          )}`
        );
      },

      sanity() {
        const p = photo();
        const j = cls();
        if (fresh("sanity", `${state.q}:${j}`)) {
          sanity[0].set(stretch(saliency(p, j))).title("gradient, trained");
          sanity[1].set(overlay(p, cam(p, j), camRange(p)), { label: j }).title("CAM, trained");
          sanity[2].set(stretch(saliency(p, j, rnd))).title("gradient, random");
          sanity[3].set(overlay(p, cam(p, j, rnd), camRange(p, rnd)), { label: j }).title("CAM, random");
        }
        layout(
          narrow.matches
            ? { san0: [0, 0], san1: [180, 0], san2: [0, 220], san3: [180, 220] }
            : { san0: [0, 0], san1: [200, 0], san2: [0, 220], san3: [200, 220] }
        );
        strip(
          `${CLASSES[j]}, trained vs random weights, rank correlation · gradient ${fmt(spearman(saliency(p, j), saliency(p, j, rnd)), 2)} · CAM ${fmt(
            spearman(cam(p, j), cam(p, j, rnd)),
            2
          )}`
        );
      },

      mistakes() {
        if (fresh("mistakes", "all")) {
          const C = CLASSES.map((_, a) => CLASSES.map((_, b) => test.filter((p, i) => p.label === a && occ.pred[i] === b).length));
          conf.set(C);
          wrongIdx.forEach((i, k) => {
            const p = test[i];
            const g = occ.pred[i];
            wrongs[k].set(overlay(p, cam(p, g), camRange(p)), { label: g }).caption(`${CLASSES[p.label]}→${CLASSES[g]}`);
          });
        }
        wrongTitle.textContent = `all ${wrongIdx.length} mistakes, heat for the wrong answer`;
        const cols = 4;
        layout({
          conf: narrow.matches ? [60, 80] : [60, 80],
          ...Object.fromEntries(
            wrongs.map((_, k) =>
              narrow.matches
                ? [`wr${k}`, [(k % cols) * 84, 360 + Math.floor(k / cols) * 110]]
                : [`wr${k}`, [330 + (k % cols) * 84, 40 + Math.floor(k / cols) * 110]]
            )
          ),
        });
        say(
          `${100 - right} wrong of 100 · on all 4,000: planes 84.5%, cars 92.1%, frogs 95.9%, ships 86.6%; 84 planes called ships, and 82 ships planes`,
          `${100 - right} wrong of 100 · on all 4,000: 84 planes called ships, 82 ships planes`
        );
      },

      edits() {
        const p = photo();
        const [key, text] = EDITS[state.edit];
        const lo = N / 4;
        const hi = (3 * N) / 4;
        const inside = (r, c) => r >= lo && r < hi && c >= lo && c < hi;
        const fn = {
          none: (r, c, rgb) => rgb,
          hide: (r, c, rgb) => (inside(r, c) ? fill : rgb),
          keep: (r, c, rgb) => (inside(r, c) ? rgb : fill),
          grey: (r, c, rgb) => {
            const v = (rgb[0] + rgb[1] + rgb[2]) / 3;
            return [v, v, v];
          },
          swap: (r, c, rgb) => [rgb[2], rgb[1], rgb[0]],
          shift: (r, c) => (c < 8 ? fill : p.vec.slice((r * N + c - 8) * 3, (r * N + c - 8) * 3 + 3)),
        }[key];
        const e = once(`edit:${state.q}:${key}`, () => editPhoto(p, fn));
        const { probs } = look(e);
        const g = CV.argmax(probs);
        if (fresh("edits", `${state.q}:${key}`)) {
          editPhotoPic.set(e).title(text);
          editCam.set(overlay(e, cam(e, g), camRange(e)), { label: g }).title(`CAM for ${CLASSES[g]}`);
          editBars.set(probs, g);
        }
        layout(
          narrow.matches
            ? { editPhotoPic: [0, 0], editCam: [180, 0], editBars: [60, 250] }
            : { editPhotoPic: [0, 0], editCam: [200, 0], editBars: [470, 30] }
        );
        const [all, per] = EDIT_ACC[key];
        say(
          `${verdict(e, probs)} · on all 4,000 test photos, ${text}: ${fmt(all, 1)}% (${perClass(per)})`,
          `${verdict(e, probs)} · all 4,000: ${fmt(all, 1)}%`
        );
      },

      fool() {
        const p = photo();
        const eps = EPS[state.eps];
        const { f, probs } = look(p);
        // the loss's gradient: Σ_j (p_j − [j = true class]) × ∂ score_j / ∂ pixel
        const g = once(`grad:${state.q}`, () =>
          CV.deepGrad(
            net,
            f,
            probs.map((v, j) => v - (j === p.label ? 1 : 0))
          )
        );
        const sign = (r, c, q) => Math.sign(g[q * N * N + r * N + c]);
        const nudged = once(`fool:${state.q}:${eps}`, () =>
          editPhoto(p, (r, c, rgb) => rgb.map((v, q) => Math.max(0, Math.min(1, v + (eps / 255) * sign(r, c, q)))))
        );
        const after = look(nudged).probs;
        if (fresh("fool", `${state.q}:${eps}`)) {
          // the change, exaggerated to ±100 of 255 so it can be seen at all
          const change = {
            px: Uint8Array.from({ length: N * N * 3 }, (_, k) => 128 + (eps ? 100 * sign(Math.floor(k / 3 / N), Math.floor(k / 3) % N, k % 3) : 0)),
          };
          foolPics[0].set(p).title("test photo");
          foolPics[1].set(change).title(eps ? `the change, × ${Math.round(100 / eps)}` : "no change");
          foolPics[2].set(nudged).title("nudged");
          foolBefore.set(probs, CV.argmax(probs));
          foolAfter.set(after, CV.argmax(after));
        }
        layout(
          narrow.matches
            ? { fp0: [0, 0], fp1: [150, 0], fp2: [300, 0], foolBefore: [70, 220], foolAfter: [70, 380] }
            : { fp0: [0, 0], fp1: [170, 0], fp2: [340, 0], foolBefore: [80, 230], foolAfter: [400, 230] }
        );
        const [all] = FOOL_ACC[eps];
        say(
          `${verdict(p, probs)} · nudged ${eps}/255: ${CLASSES[CV.argmax(after)]} ${pc(Math.max(...after))} · on all 4,000 test photos: ${fmt(all, 1)}% right`,
          `nudged ${eps}/255: ${CLASSES[CV.argmax(after)]} ${pc(Math.max(...after))} · all 4,000: ${fmt(all, 1)}%`
        );
      },
    };

    function render(step, t) {
      clsIn.wrap.hidden = !["maps", "saliency", "sanity"].includes(step);
      editIn.wrap.hidden = step !== "edits";
      epsIn.wrap.hidden = step !== "fool";
      const pick = step !== "mistakes";
      [qText, prevQ, nextQ].forEach((el) => (el.style.visibility = pick ? "visible" : "hidden"));
      const p = photo();
      qText.textContent = `test photo ${state.q + 1} of ${test.length} · ${article(CLASSES[p.label])} ${CLASSES[p.label]}`;
      occWin(null);
      occMapWin(null);
      steps[step](t);
    }

    return { render };
  }
})();
