// Part 5 of the computer vision series: convolution, on the CIFAR-10 photos. A 3 × 3 edge filter sliding over a
// photo's brightness, padding and stride, ReLU and max pooling, why a moved photo gives a moved map, and a small
// convnet trained offline (cv-photos.js loads it) set against part 2's linear classifier.
(function () {
  "use strict";

  const CV = window.CV;
  const { h, s, fmt, matrix, bars, progress, narrow } = window.TF.view;
  const { thumb } = CV.view;
  const { button, select, slider } = CV.controls;
  CV.scenes = CV.scenes || {};

  const N = CV.PHOTOS.side;
  const CLASSES = CV.PHOTOS.classes;
  const NAMES = Object.keys(CV.EDGES);
  const SHIFTS = [0, 2, 4, 8];
  const U = 8; // screen pixels per photo pixel in the big pictures
  const article = (name) => (/^[aeiou]/.test(name) ? "an" : "a");

  // A photo's brightness as a grey picture, and a grid of numbers as one (signed: blue below 0, red above).
  const greyPhoto = (grid) => ({
    px: Uint8Array.from(
      grid.flat().flatMap((v) => [v, v, v]),
      (v) => Math.round(255 * Math.max(0, Math.min(1, v)))
    ),
  });
  // what the filters read: brightness minus the photo's average, so the zero padding is average grey, not black
  const meanOf = (grid) => grid.flat().reduce((a, v) => a + v, 0) / grid.flat().length;
  const centred = (grid, mean = meanOf(grid)) => grid.map((row) => row.map((v) => v - mean));
  const maxAbs = (grid) => Math.max(1e-6, ...grid.flat().map(Math.abs));

  // A learned first-layer filter (3 × 3 × 3 weights) as a tiny colour picture, stretched to 0 … 255.
  function filterPhoto(l, k) {
    const w = Array.from({ length: 27 }, (_, i) => {
      const [a, d, c] = [Math.floor(i / 9), Math.floor(i / 3) % 3, i % 3];
      return l.w[((k * l.C + c) * 3 + a) * 3 + d];
    });
    const lo = Math.min(...w);
    const hi = Math.max(...w);
    return { px: Uint8Array.from(w, (v) => Math.round((255 * (v - lo)) / (hi - lo))) };
  }
  // The same for a row of part 2's weights.
  function templatePhoto(row) {
    const lo = Math.min(...row);
    const hi = Math.max(...row);
    return { px: Uint8Array.from(row, (v) => Math.round((255 * (v - lo)) / (hi - lo))) };
  }

  CV.scenes.part5 = (stage) =>
    Promise.all([CV.loadPhotos(), CV.loadLinear(), CV.loadConvNet()]).then(([photos, linear, net]) => scene(stage, photos, linear, net));

  function scene(stage, photos, linear, net) {
    const { svg, toolbar, controls, strip } = stage;
    const { test } = photos;
    const lin = linear.models[1];
    const pc = (v) => `${fmt(100 * v, 0)}%`;
    const convRight = test.filter((p) => CV.argmax(CV.photoNetForward(net, p).scores) === p.label).length / test.length;
    const linRight = test.filter((p) => CV.argmax(CV.linearScores(lin, linear.input(p))) === p.label).length / test.length;
    const nParams = (l) => l.w.length + l.b.length;
    const convParams = net.layers.reduce((a, l) => a + nParams(l), 0) + net.fc.w.length + net.fc.b.length;
    const linParams = lin.W.length * lin.W[0].length + lin.b.length;

    /* -------------------------------------------- inputs: test photo, filter, padding, stride, shift */

    const state = { q: 25, filter: 0, pad: 1, stride: 1, shift: 1 };
    const qLabel = h("span", { class: "tf-label" });
    const prevQ = button("◀", () => pickQuery(state.q - 1));
    const nextQ = button("▶", () => pickQuery(state.q + 1));
    prevQ.setAttribute("aria-label", "Previous test photo");
    nextQ.setAttribute("aria-label", "Next test photo");
    toolbar.append(qLabel, prevQ, nextQ);
    function pickQuery(i) {
      state.q = (i + test.length) % test.length;
      stage.refresh();
    }
    const refreshWith = (key) => (v) => {
      state[key] = Number(v);
      stage.refresh();
    };
    const filterIn = select(
      "filter",
      NAMES.map((n, i) => [i, n]),
      state.filter,
      refreshWith("filter")
    );
    const padIn = select(
      "padding",
      [0, 1].map((p) => [p, String(p)]),
      state.pad,
      refreshWith("pad")
    );
    const strideIn = select(
      "stride",
      [1, 2].map((p) => [p, String(p)]),
      state.stride,
      refreshWith("stride")
    );
    const shiftIn = slider("shift right", 0, SHIFTS.length - 1, state.shift, refreshWith("shift"), (v) => `${SHIFTS[v]} px`);
    controls.append(filterIn.wrap, padIn.wrap, strideIn.wrap, shiftIn.wrap);

    /* -------------------------------------------- objects */

    // a title above a picture
    const titleOf = (t) => {
      const el = s("text", { class: "tf-mat-title", x: 0, y: -12 });
      t.el.append(el);
      return (text) => (el.textContent = text);
    };
    // a window drawn over a picture: show(r, c, size) outlines size × size of its pixels from (r, c); show(null) hides it
    function windowOn(t, unit) {
      const rect = s("rect", { class: "cv-window" });
      t.el.append(rect);
      return {
        show(r, c, size = 1) {
          rect.style.opacity = r == null ? "0" : "1";
          if (r == null) return;
          rect.setAttribute("x", c * unit);
          rect.setAttribute("y", r * unit);
          rect.setAttribute("width", size * unit);
          rect.setAttribute("height", size * unit);
        },
      };
    }
    const pictureBox = (size) => ({ x: -6, y: -30, width: size + 12, height: size + 36 });

    // the sweep: the photo (with its padding ring), the filter, the pixels under the window, and the output
    const image = thumb(svg, { size: N * U });
    const imageTitle = titleOf(image);
    const imageWin = windowOn(image, U);
    const padRing = s("rect", { class: "cv-pad", x: -U, y: -U, width: (N + 2) * U, height: (N + 2) * U });
    image.el.prepend(padRing);
    image.box = { x: -U - 6, y: -U - 30, width: (N + 2) * U + 12, height: (N + 2) * U + 36 };
    const filter = matrix(svg, { rows: 3, cols: 3, cell: 30, kind: "signed", range: 1, digits: 0, name: "filter" });
    const patch = matrix(svg, { rows: 3, cols: 3, cell: 30, kind: "signed", range: 0.6, digits: 2, name: "pixels under it" });
    filter.box = { x: -6, y: -30, width: 102, height: 126 };
    patch.box = filter.box;
    // one output picture per (padding, stride), each drawn at the scale of the photo pixels it steps over
    const sizes = { "1,1": 32, "0,1": 30, "1,2": 16, "0,2": 15 };
    const outs = {};
    Object.entries(sizes).forEach(([key, n]) => {
      const stride = Number(key.split(",")[1]);
      const t = thumb(svg, { size: n * U * stride });
      t.win = windowOn(t, U * stride);
      t.title = titleOf(t);
      t.box = pictureBox(n * U * stride);
      outs[key] = t;
    });

    // four filters and their maps, small
    const small = thumb(svg, { size: 128 });
    const smallTitle = titleOf(small);
    small.box = pictureBox(128);
    const filters = NAMES.map((name) => matrix(svg, { rows: 3, cols: 3, cell: 22, kind: "signed", range: 1, digits: 0, name }));
    const maps = NAMES.map(() => thumb(svg, { size: 128 }));
    const mapTitles = maps.map(titleOf);
    filters.forEach((m) => (m.box = { x: -4, y: -26, width: 74, height: 98 }));
    maps.forEach((t) => (t.box = pictureBox(128)));

    // pooling: a map after ReLU, its 2 × 2 max pool, and the block being pooled, as numbers
    const relu = thumb(svg, { size: N * U });
    const reluTitle = titleOf(relu);
    const reluWin = windowOn(relu, U);
    const pooled = thumb(svg, { size: (N / 2) * 2 * U });
    const pooledTitle = titleOf(pooled);
    const pooledWin = windowOn(pooled, 2 * U);
    const block = matrix(svg, { rows: 2, cols: 2, cell: 40, kind: "signed", range: 1.5, digits: 2, name: "block" });
    relu.box = pictureBox(N * U);
    pooled.box = pictureBox(N * U);
    block.box = { x: -6, y: -30, width: 92, height: 116 };

    // shifting: the original and the moved photo, each with its map
    const pairs = ["original", "moved"].map(() => {
      const img = thumb(svg, { size: 160 });
      const map = thumb(svg, { size: 160 });
      const pair = { img, map, imgTitle: titleOf(img), mapTitle: titleOf(map), peak: windowOn(map, 5) };
      img.box = pictureBox(160);
      map.box = pictureBox(160);
      return pair;
    });

    // the trained net: its first layer's filters, their maps on the current photo, the second layer's maxima, the scores
    const [L1, L2] = net.layers;
    const learned = Array.from({ length: L1.K }, (_, k) => thumb(svg, { size: 40 }).set(filterPhoto(L1, k)));
    const learnedMaps = Array.from({ length: L1.K }, () => thumb(svg, { size: 80 }));
    learned.forEach((t) => (t.box = { x: -6, y: -14, width: 52, height: 60 }));
    learnedMaps.forEach((t) => (t.box = { x: -6, y: -14, width: 92, height: 100 }));
    const featBars = bars(svg, {
      labels: Array.from({ length: L2.K }, (_, k) => String(k + 1)),
      width: 110,
      gap: 15,
      title: "layer 2: max of each map",
      format: (v) => fmt(v, 1),
    });
    const scoreBars = bars(svg, { labels: CLASSES, width: 120, gap: 24, title: "scores", max: 6, format: (v) => fmt(v, 1) });
    featBars.box = { x: -40, y: -34, width: 220, height: 16 * 15 + 50 };
    scoreBars.box = { x: -70, y: -34, width: 250, height: 130 };
    const netTitle = s("text", { class: "tf-mat-title", x: 0, y: -24, text: "layer 1: 8 filters, 3 × 3 × 3, and their maps" });
    learned[0].el.append(netTitle);

    // part 2's templates against the convnet's filters
    const templates = lin.W.map((row, j) => thumb(svg, { size: 96 }).set(templatePhoto(row), { label: j }));
    const templateTitles = templates.map(titleOf);
    templates.forEach((t, j) => {
      t.box = pictureBox(96);
      templateTitles[j](CLASSES[j]);
    });

    const layout = CV.layout(svg, () => ({
      image,
      filter,
      patch,
      ...Object.fromEntries(Object.entries(outs).map(([k, m]) => [`out${k}`, m])),
      small,
      ...Object.fromEntries(filters.map((m, q) => [`f${q}`, m])),
      ...Object.fromEntries(maps.map((m, q) => [`m${q}`, m])),
      relu,
      pooled,
      block,
      ...Object.fromEntries(
        pairs.flatMap((p, k) => [
          [`pi${k}`, p.img],
          [`pm${k}`, p.map],
        ])
      ),
      ...Object.fromEntries(learned.map((m, q) => [`l${q}`, m])),
      ...Object.fromEntries(learnedMaps.map((m, q) => [`lm${q}`, m])),
      featBars,
      scoreBars,
      ...Object.fromEntries(templates.map((m, j) => [`t${j}`, m])),
    }));

    /* -------------------------------------------- the sweep shared by the "filter", "slide" and "size" steps */

    // done: the whole output is shown, with the window on its strongest response
    function sweep(t, pad, stride) {
      const p = test[state.q];
      const f = CV.EDGES[NAMES[state.filter]];
      const g = centred(p.grey);
      const out = CV.conv2d(g, f, { pad, stride });
      const n = out.length;
      const m = outs[`${pad},${stride}`];
      image.set(greyPhoto(p.grey));
      imageTitle(`the photo's brightness, ${N} × ${N}`);
      filter.set(f);
      padRing.style.opacity = pad ? "1" : "0";
      // row by row: rows above the window are done, the window walks to the strongest response in its row
      const k = t == null ? n + 1 : progress(t, n);
      const at =
        k >= 1 && k <= n ? [k - 1, out[k - 1].reduce((best, v, c, row) => (Math.abs(v) > Math.abs(row[best]) ? c : best), 0)] : argmaxAbs(out);
      const shown = k >= 1 && k <= n ? out.map((row, r) => (r < k ? row : row.map(() => 0))) : out;
      m.set(shown, { signed: true, range: 1.5 });
      m.title(`output, ${n} × ${n}`);
      m.win.show(at[0], at[1]);
      const [r0, c0] = [at[0] * stride - pad, at[1] * stride - pad];
      imageWin.show(r0, c0, 3);
      patch.set([0, 1, 2].map((a) => [0, 1, 2].map((b) => g[r0 + a]?.[c0 + b] ?? 0)));
      layout(
        narrow.matches
          ? { image: [0, 0], filter: [8, 360], patch: [148, 360], [`out${pad},${stride}`]: [0, 540] }
          : { image: [0, 0], filter: [320, 40], patch: [320, 200], [`out${pad},${stride}`]: [470, 0] }
      );
      return { out, at, p, f, k, n };
    }

    function argmaxAbs(M) {
      let best = [0, 0];
      M.forEach((row, r) => row.forEach((v, c) => Math.abs(v) > Math.abs(M[best[0]][best[1]]) && (best = [r, c])));
      return best;
    }
    function argmax2d(M) {
      let best = [0, 0];
      M.forEach((row, r) => row.forEach((v, c) => v > M[best[0]][best[1]] && (best = [r, c])));
      return best;
    }
    const where = (v) => (v > 0 ? "dark → light" : "light → dark");

    /* -------------------------------------------- render */

    const steps = {
      filter() {
        const { out, at, p } = sweep(null, 1, 1);
        const v = out[at[0]][at[1]];
        strip(`${NAMES[state.filter]} filter: strongest response ${fmt(v, 2)} (${where(v)}) at row ${at[0] + 1}, column ${at[1] + 1}`);
      },

      slide(t) {
        const { out, at, k, n } = sweep(t, 1, 1);
        strip(
          k >= 1 && k <= n
            ? `output row ${k}: 32 positions, each the sum of 9 weight × pixel · at column ${at[1] + 1}: ${fmt(out[at[0]][at[1]], 2)}`
            : "32 × 32 outputs, one per position of the window, all with the same 9 weights"
        );
      },

      maps() {
        const p = test[state.q];
        small.set(p);
        smallTitle("test photo");
        NAMES.forEach((name, q) => {
          filters[q].set(CV.EDGES[name]);
          maps[q].set(CV.relu2d(CV.conv2d(centred(p.grey), CV.EDGES[name], { pad: 1 })), { signed: true, range: 1.5 });
          mapTitles[q]("after ReLU");
        });
        // one row per filter: the filter on the left, its map to the right
        const row = (q) => ({ [`f${q}`]: [180, q * 170 + 40], [`m${q}`]: [340, q * 170] });
        // on a phone, two columns, each filter above its map
        const grid = (q) => ({
          [`f${q}`]: [(q % 2) * 180, 190 + Math.floor(q / 2) * 290],
          [`m${q}`]: [(q % 2) * 180, 190 + Math.floor(q / 2) * 290 + 110],
        });
        layout(
          narrow.matches
            ? { small: [90, 0], ...grid(0), ...grid(1), ...grid(2), ...grid(3) }
            : { small: [0, 250], ...row(0), ...row(1), ...row(2), ...row(3) }
        );
        const sums = NAMES.map(
          (name) =>
            CV.relu2d(CV.conv2d(centred(p.grey), CV.EDGES[name], { pad: 1 }))
              .flat()
              .filter((v) => v > 0.3).length
        );
        strip(`map pixels above 0.3: ${NAMES.map((n, q) => `${n} ${sums[q]}`).join(" · ")}`);
      },

      size(t) {
        const { pad, stride } = state;
        const { n } = sweep(t, pad, stride);
        const exact = (N - 3 + 2 * pad) / stride + 1;
        strip(
          `(W − F + 2P) / S + 1 = (32 − 3 + ${2 * pad}) / ${stride} + 1 = ${fmt(exact, Number.isInteger(exact) ? 0 : 1)}` +
            (Number.isInteger(exact)
              ? `: a ${n} × ${n} output`
              : `, rounded down: ${n} × ${n}, and the ${pad ? "padding's" : "photo's"} last row and column are never covered`)
        );
      },

      pool(t) {
        const p = test[state.q];
        const R = CV.relu2d(CV.conv2d(centred(p.grey), CV.EDGES[NAMES[state.filter]], { pad: 1 }));
        const P = CV.maxPool(R);
        const n = N / 2;
        const k = progress(t, n);
        const done = !(k >= 1 && k <= n);
        // row by row of blocks; the window sits on the strongest block of the current row
        const at = done ? argmax2d(P) : [k - 1, argmax2d([P[k - 1]])[1]];
        relu.set(R, { signed: true, range: 1.5 });
        reluTitle(`${NAMES[state.filter]} map after ReLU, 32 × 32`);
        pooled.set(done ? P : P.map((row, r) => (r < k ? row : row.map(() => 0))), { signed: true, range: 1.5 });
        pooledTitle("2 × 2 max pool, 16 × 16");
        reluWin.show(2 * at[0], 2 * at[1], 2);
        pooledWin.show(at[0], at[1]);
        const B = [0, 1].map((a) => [0, 1].map((b) => R[2 * at[0] + a][2 * at[1] + b]));
        block.set(B);
        layout(narrow.matches ? { relu: [0, 0], block: [20, 330], pooled: [0, 500] } : { relu: [0, 0], block: [300, 110], pooled: [430, 0] });
        strip(
          `max(${B.flat()
            .map((v) => fmt(v, 2))
            .join(", ")}) = ${fmt(P[at[0]][at[1]], 2)}` +
            (done ? " · 32 × 32 → 16 × 16: a quarter of the numbers, and the strong responses survive" : "")
        );
      },

      shift() {
        const p = test[state.q];
        const f = CV.EDGES[NAMES[state.filter]];
        const d = SHIFTS[state.shift];
        const moved = CV.shiftPhoto(p, 0, d);
        // both centred by the original's average, so the only difference is the move
        const mean = meanOf(p.grey);
        const [M0, M1] = [p, moved].map((ph) => CV.conv2d(centred(ph.grey, mean), f, { pad: 1 }));
        // the original's strongest response, away from the edges a move of up to 8 px can disturb
        const at = argmax2d(M0.map((row, r) => row.map((v, c) => (r > 0 && r < N - 1 && c > 0 && c < N - 1 - SHIFTS.at(-1) ? v : -Infinity))));
        [M0, M1].forEach((M, k) => {
          pairs[k].img.set(k ? moved : p);
          pairs[k].map.set(CV.relu2d(M), { signed: true, range: 1.5 });
          pairs[k].peak.show(at[0], at[1] + k * d);
        });
        pairs[0].imgTitle("original");
        pairs[1].imgTitle(`moved ${d} px right`);
        pairs.forEach((pr) => pr.mapTitle(`${NAMES[state.filter]} map`));
        layout(
          narrow.matches
            ? { pi0: [0, 0], pm0: [190, 0], pi1: [0, 220], pm1: [190, 220] }
            : { pi0: [0, 0], pm0: [200, 0], pi1: [0, 230], pm1: [200, 230] }
        );
        strip(
          `ringed: ${fmt(M0[at[0]][at[1]], 2)} at (row ${at[0] + 1}, column ${at[1] + 1}) → ${fmt(M1[at[0]][at[1] + d], 2)} at (row ${at[0] + 1}, column ${at[1] + d + 1}): the same, ${d} columns right`
        );
      },

      train() {
        const p = test[state.q];
        const { maps: M, feats, scores } = CV.photoNetForward(net, p);
        M.forEach((m, k) => learnedMaps[k].set(m, { signed: true, range: maxAbs(m) }));
        featBars.set(feats, CV.argmax(feats));
        const guess = CV.argmax(scores);
        scoreBars.set(scores, guess);
        const cols = narrow.matches ? 4 : 8;
        layout({
          ...Object.fromEntries(learned.map((_, k) => [`l${k}`, [(k % cols) * 105 + 25, Math.floor(k / cols) * 170]])),
          ...Object.fromEntries(learnedMaps.map((_, k) => [`lm${k}`, [(k % cols) * 105, Math.floor(k / cols) * 170 + 56]])),
          ...(narrow.matches ? { featBars: [40, 380], scoreBars: [260, 380] } : { featBars: [100, 220], scoreBars: [480, 260] }),
        });
        strip(
          `${article(CLASSES[p.label])} ${CLASSES[p.label]} → ${CLASSES[guess]} ${guess === p.label ? "✓" : "✗"} · this net gets ${pc(convRight)} of the 100 test photos right`
        );
      },

      params() {
        const cols = narrow.matches ? 4 : 8;
        layout({
          ...Object.fromEntries(templates.map((_, j) => [`t${j}`, narrow.matches ? [(j % 2) * 130, Math.floor(j / 2) * 140] : [j * 130, 0]])),
          ...Object.fromEntries(learned.map((_, k) => [`l${k}`, [(k % cols) * 60, (narrow.matches ? 330 : 190) + Math.floor(k / cols) * 70]])),
        });
        strip(
          `linear: ${linParams.toLocaleString("en-US")} parameters, ${pc(linRight)} · convnet: ${convParams.toLocaleString("en-US")} parameters, ${pc(convRight)} on the test photos`
        );
      },
    };

    const usesImage = ["filter", "slide", "maps", "size", "pool", "shift", "train"];

    function render(step, t) {
      filterIn.wrap.hidden = !["filter", "slide", "size", "pool", "shift"].includes(step);
      padIn.wrap.hidden = step !== "size";
      strideIn.wrap.hidden = step !== "size";
      shiftIn.wrap.hidden = step !== "shift";
      const pick = usesImage.includes(step);
      [qLabel, prevQ, nextQ].forEach((el) => (el.style.visibility = pick ? "visible" : "hidden"));
      const p = test[state.q];
      qLabel.textContent = `test photo ${state.q + 1} of ${test.length} · ${article(CLASSES[p.label])} ${CLASSES[p.label]}`;
      netTitle.style.opacity = step === "train" || step === "params" ? "1" : "0";
      netTitle.textContent = step === "train" ? "layer 1: 8 filters, 3 × 3 × 3, and their maps" : "the convnet's layer 1: 8 filters, 3 × 3 × 3";
      [imageWin, reluWin, pooledWin, ...Object.values(outs).map((m) => m.win)].forEach((w) => w.show(null));
      steps[step](t);
    }

    return { render };
  }
})();
