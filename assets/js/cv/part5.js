// Part 5 of the computer vision series: convolution. A 3 × 3 filter sliding over the 8 × 8 images, padding and
// stride, ReLU and max pooling, why a shifted image gives a shifted map, and a tiny trained convnet.
(function () {
  "use strict";

  const CV = window.CV;
  const { h, s, fmt, matrix, bars, progress } = window.TF.view;
  const { button, select, slider } = CV.controls;
  CV.scenes = CV.scenes || {};

  const N = CV.SIDE;
  const NAMES = Object.keys(CV.FILTERS);
  const SHIFTS = [0, 1, 2, 3];
  const article = (name) => (/^[aeiou]/.test(name) ? "an" : "a");

  CV.scenes.part5 = function (stage) {
    const { svg, toolbar, controls, strip } = stage;
    const train = CV.split("train");
    const test = CV.split("test");

    /* -------------------------------------------- models: the trained convnet, and part 1's and part 2's for comparison */

    const conv = CV.trainConvNet(train);
    const convPredict = CV.convNetPredict(conv.net);
    const linear = CV.trainLinear(
      train.map((ex) => CV.flat(ex.img)),
      train.map((ex) => ex.label),
      4,
      { steps: 400, lr: 0.2, reg: 0.01 }
    ).model;
    const linearPredict = (img) => CV.argmax(CV.linearScores(linear, CV.flat(img)));
    const pc = (v) => `${Math.round(1000 * v) / 10}%`;
    const right = (predict, set) => set.filter((ex) => predict(ex.img) === ex.label).length / set.length;
    // accuracy on the test set moved d pixels right, for each model; computed when first asked for
    const shifted = {};
    function shiftedScores(d) {
      if (shifted[d]) return shifted[d];
      const set = test.map((ex) => ({ img: CV.shift(ex.img, 0, d), label: ex.label }));
      shifted[d] = { knn: CV.knnAccuracy(train, set, 3), linear: right(linearPredict, set), conv: right(convPredict, set) };
      return shifted[d];
    }

    /* -------------------------------------------- inputs: test image, filter, padding, stride, shift */

    const state = { q: 0, filter: 0, pad: 1, stride: 1, shift: 1 };
    const qLabel = h("span", { class: "tf-label" });
    const prevQ = button("◀", () => pickQuery(state.q - 1));
    const nextQ = button("▶", () => pickQuery(state.q + 1));
    prevQ.setAttribute("aria-label", "Previous test image");
    nextQ.setAttribute("aria-label", "Next test image");
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
    const shiftIn = slider("shift right", 0, SHIFTS.length - 1, state.shift, refreshWith("shift"), (v) => `${v} px`);
    controls.append(filterIn.wrap, padIn.wrap, strideIn.wrap, shiftIn.wrap);

    /* -------------------------------------------- objects */

    // A window drawn over a matrix: show(i, j, size) outlines size × size cells from (i, j); show(null) hides it.
    function windowOn(m) {
      const rect = s("rect", { class: "cv-window" });
      m.el.append(rect);
      return {
        show(i, j, size = 1) {
          rect.style.opacity = i == null ? "0" : "1";
          if (i == null) return;
          rect.setAttribute("x", j * m.cell);
          rect.setAttribute("y", i * m.cell);
          rect.setAttribute("width", size * m.cell);
          rect.setAttribute("height", size * m.cell);
        },
      };
    }

    const image = matrix(svg, { rows: N, cols: N, cell: 30, kind: "prob", name: "image" });
    const imageWin = windowOn(image);
    // the zero padding: a dashed ring of cells around the image
    const padRing = s("rect", { class: "cv-pad", x: -30, y: -30, width: 300, height: 300 });
    image.el.prepend(padRing);
    const filter = matrix(svg, { rows: 3, cols: 3, cell: 30, kind: "signed", range: 2, digits: 0, name: "filter" });
    const sizes = { "1,1": 8, "0,1": 6, "1,2": 4, "0,2": 3 };
    const outs = {};
    Object.entries(sizes).forEach(([key, n]) => {
      outs[key] = matrix(svg, { rows: n, cols: n, cell: 30, kind: "signed", range: 3, digits: 1, name: "output" });
      outs[key].win = windowOn(outs[key]);
      outs[key].box = { x: -6, y: -30, width: n * 30 + 12, height: n * 30 + 36 };
    });
    image.box = { x: -36, y: -40, width: 312, height: 312 };
    filter.box = { x: -6, y: -30, width: 102, height: 126 };

    // four filters and their maps, small
    const small = matrix(svg, { rows: N, cols: N, cell: 16, kind: "prob", name: "image", numbers: false });
    const filters = NAMES.map((name) => matrix(svg, { rows: 3, cols: 3, cell: 18, kind: "signed", range: 2, name, numbers: false }));
    const maps = NAMES.map(() => matrix(svg, { rows: N, cols: N, cell: 14, kind: "signed", range: 3, name: "after ReLU", numbers: false }));
    small.box = { x: -4, y: -26, width: 136, height: 162 };
    filters.forEach((m) => (m.box = { x: -4, y: -26, width: 62, height: 86 }));
    maps.forEach((m) => (m.box = { x: -4, y: -26, width: 122, height: 146 }));

    // pooling
    const relu = matrix(svg, { rows: N, cols: N, cell: 30, kind: "signed", range: 3, digits: 1, name: "after ReLU" });
    const reluWin = windowOn(relu);
    const pooled = matrix(svg, { rows: N / 2, cols: N / 2, cell: 30, kind: "signed", range: 3, digits: 1, name: "2 × 2 max pool" });
    const pooledWin = windowOn(pooled);
    relu.box = { x: -6, y: -30, width: 252, height: 278 };
    pooled.box = { x: -6, y: -30, width: 132, height: 158 };

    // shifting: the original and the moved image, each with its map
    const pairs = ["original", "moved"].map((name) => ({
      img: matrix(svg, { rows: N, cols: N, cell: 20, kind: "prob", name, numbers: false }),
      map: matrix(svg, { rows: N, cols: N, cell: 20, kind: "signed", range: 3, name: "its map", numbers: false }),
    }));
    pairs.forEach((p) => {
      p.img.box = { x: -4, y: -26, width: 168, height: 194 };
      p.map.box = p.img.box;
    });

    // the trained net: its filters, their maps on the current image, the pooled features and the scores
    const learned = conv.net.F.map((_, q) =>
      matrix(svg, { rows: 3, cols: 3, cell: 18, kind: "signed", range: 2, name: `filter ${q + 1}`, numbers: false })
    );
    const learnedMaps = conv.net.F.map(() =>
      matrix(svg, { rows: N, cols: N, cell: 14, kind: "signed", range: 3, name: "after ReLU", numbers: false })
    );
    learned.forEach((m) => (m.box = filters[0].box));
    learnedMaps.forEach((m) => (m.box = maps[0].box));
    const featBars = bars(svg, { labels: conv.net.F.map((_, q) => `filter ${q + 1}`), width: 120, gap: 24, title: "max of each map", max: 4 });
    const scoreBars = bars(svg, { labels: CV.CLASSES, width: 120, gap: 24, title: "scores", max: 8, format: (v) => fmt(v, 1) });
    featBars.box = { x: -70, y: -34, width: 240, height: 130 };
    scoreBars.box = featBars.box;

    // the linear classifier's templates against the convnet's filters
    const templates = linear.W.map((row, j) =>
      matrix(svg, { rows: N, cols: N, cell: 12, kind: "signed", range: 0.8, name: CV.CLASSES[j], numbers: false })
    );
    templates.forEach((m) => (m.box = { x: -4, y: -26, width: 108, height: 130 }));
    const layout = CV.layout(svg, () => ({
      image,
      filter,
      ...Object.fromEntries(Object.entries(outs).map(([k, m]) => [`out${k}`, m])),
      small,
      ...Object.fromEntries(filters.map((m, q) => [`f${q}`, m])),
      ...Object.fromEntries(maps.map((m, q) => [`m${q}`, m])),
      relu,
      pooled,
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

    // one row per filter: the filter on the left, its map to the right
    const ROW = (q) => ({ [`f${q}`]: [180, q * 150 + 30], [`m${q}`]: [320, q * 150] });

    /* -------------------------------------------- the sweep shared by the "slide" and "size" steps */

    function sweep(t, pad, stride) {
      const ex = test[state.q];
      const f = CV.FILTERS[NAMES[state.filter]];
      const out = CV.conv2d(ex.img, f, { pad, stride });
      const n = out.length;
      const m = outs[`${pad},${stride}`];
      image.set(ex.img);
      filter.set(f);
      m.set(out);
      padRing.style.opacity = pad ? "1" : "0";
      const k = t == null ? n * n + 1 : progress(t, n * n);
      m.reveal(k === 0 ? 0 : k);
      const at = k >= 1 && k <= n * n ? [Math.floor((k - 1) / n), (k - 1) % n] : null;
      m.win.show(at ? at[0] : null, at && at[1]);
      imageWin.show(at ? at[0] * stride - pad : null, at && at[1] * stride - pad, 3);
      layout({ image: [0, 0], filter: [320, 80], [`out${pad},${stride}`]: [470, 0] });
      return { out, at, ex, f };
    }

    // the sum behind one output cell, written out
    function sumAt(ex, f, i, j, pad, stride) {
      const terms = [];
      for (let a = 0; a < 3; a++)
        for (let b = 0; b < 3; b++) {
          const r = i * stride - pad + a;
          const c = j * stride - pad + b;
          const v = r < 0 || c < 0 || r >= N || c >= N ? 0 : ex.img[r][c];
          if (v > 0.05) terms.push(`${fmt(f[a][b], 0)}×${fmt(v, 1)}`);
        }
      return terms.length ? terms.join(" + ") : "every pixel under the window is about 0";
    }

    function argmax2d(M) {
      let best = [0, 0];
      M.forEach((row, r) => row.forEach((v, c) => v > M[best[0]][best[1]] && (best = [r, c])));
      return best;
    }

    /* -------------------------------------------- render */

    const steps = {
      filter() {
        const { out, ex } = sweep(null, 1, 1);
        const m = outs["1,1"];
        const [i, j] = argmax2d(out);
        m.reveal(Infinity);
        m.win.show(i, j);
        imageWin.show(i - 1, j - 1, 3);
        strip(
          `the ${NAMES[state.filter]} filter on ${article(CV.CLASSES[ex.label])} ${CV.CLASSES[ex.label]}: strongest response ${fmt(out[i][j], 2)} at row ${i + 1}, column ${j + 1}`
        );
      },

      slide(t) {
        const { out, at, ex, f } = sweep(t, 1, 1);
        strip(
          at
            ? `output (${at[0] + 1}, ${at[1] + 1}) = ${sumAt(ex, f, at[0], at[1], 1, 1)} ≈ ${fmt(out[at[0]][at[1]], 1)}`
            : "8 × 8 outputs, one per position of the window"
        );
      },

      maps() {
        const ex = test[state.q];
        small.set(ex.img);
        NAMES.forEach((name, q) => {
          filters[q].set(CV.FILTERS[name]);
          maps[q].set(CV.relu2d(CV.conv2d(ex.img, CV.FILTERS[name], { pad: 1 })));
        });
        layout({ small: [0, 230], ...ROW(0), ...ROW(1), ...ROW(2), ...ROW(3) });
        const peaks = NAMES.map((name) => Math.max(...CV.conv2d(ex.img, CV.FILTERS[name], { pad: 1 }).flat()));
        strip(`strongest response per filter: ${NAMES.map((n, q) => `${n} ${fmt(peaks[q], 1)}`).join(" · ")}`);
      },

      size(t) {
        const { pad, stride } = state;
        const { out } = sweep(t, pad, stride);
        const exact = (N - 3 + 2 * pad) / stride + 1;
        strip(
          `(W − F + 2P) / S + 1 = (8 − 3 + ${2 * pad}) / ${stride} + 1 = ${fmt(exact, Number.isInteger(exact) ? 0 : 1)}` +
            (Number.isInteger(exact)
              ? `: a ${out.length} × ${out.length} output`
              : `, rounded down: ${out.length} × ${out.length}, and the ${pad ? "padding's" : "image's"} last row and column are never covered`)
        );
      },

      pool(t) {
        const ex = test[state.q];
        const R = CV.relu2d(CV.conv2d(ex.img, CV.FILTERS[NAMES[state.filter]], { pad: 1 }));
        const P = CV.maxPool(R);
        relu.set(R);
        pooled.set(P);
        const n = N / 2;
        const k = progress(t, n * n);
        pooled.reveal(k);
        const at = k >= 1 && k <= n * n ? [Math.floor((k - 1) / n), (k - 1) % n] : null;
        reluWin.show(at ? 2 * at[0] : null, at && 2 * at[1], 2);
        pooledWin.show(at ? at[0] : null, at && at[1]);
        layout({ relu: [0, 0], pooled: [320, 60] });
        if (!at) return strip("8 × 8 → 4 × 4: a quarter of the numbers, and the strong responses survive");
        const block = [0, 1].flatMap((a) => [0, 1].map((b) => R[2 * at[0] + a][2 * at[1] + b]));
        strip(`max(${block.map((v) => fmt(v, 1)).join(", ")}) = ${fmt(P[at[0]][at[1]], 1)}`);
      },

      shift() {
        const ex = test[state.q];
        const f = CV.FILTERS[NAMES[ex.label]];
        const d = SHIFTS[state.shift];
        const moved = CV.shift(ex.img, 0, d);
        const peaks = [ex.img, moved].map((img, k) => {
          const M = CV.conv2d(img, f, { pad: 1 });
          pairs[k].img.set(img);
          pairs[k].map.set(CV.relu2d(M));
          const at = argmax2d(M);
          pairs[k].map.cellAt(...at);
          return { at, v: M[at[0]][at[1]] };
        });
        pairs[1].img.el.querySelector(".tf-mat-name").textContent = `moved ${d} px right`;
        pairs[0].map.el.querySelector(".tf-mat-name").textContent = `${NAMES[ex.label]} filter`;
        pairs[1].map.el.querySelector(".tf-mat-name").textContent = `${NAMES[ex.label]} filter`;
        layout({ pi0: [0, 0], pm0: [200, 0], pi1: [0, 230], pm1: [200, 230] });
        const sc = shiftedScores(d);
        strip(
          `peak ${fmt(peaks[0].v, 2)} at column ${peaks[0].at[1] + 1} → ${fmt(peaks[1].v, 2)} at column ${peaks[1].at[1] + 1} · ` +
            `whole test set moved ${d} px: k-NN ${pc(sc.knn)} · linear ${pc(sc.linear)} · convnet ${pc(sc.conv)}`
        );
      },

      train() {
        const ex = test[state.q];
        const { maps: M, feats, scores } = CV.convNetForward(conv.net, ex.img);
        conv.net.F.forEach((f, q) => {
          learned[q].set(f);
          learnedMaps[q].set(CV.relu2d(M[q]));
        });
        featBars.set(feats, CV.argmax(feats));
        const guess = CV.argmax(scores);
        scoreBars.set(scores, guess);
        layout({
          ...Object.fromEntries(learned.map((_, q) => [`l${q}`, [q * 150 + 30, 0]])),
          ...Object.fromEntries(learnedMaps.map((_, q) => [`lm${q}`, [q * 150, 110]])),
          featBars: [80, 330],
          scoreBars: [380, 330],
        });
        strip(
          `a ${CV.CLASSES[ex.label]} → ${CV.CLASSES[guess]} ${guess === ex.label ? "✓" : "✗"} · this net gets ${fmt(100 * right(convPredict, test), 0)}% of the 40 test images right`
        );
      },

      params() {
        conv.net.F.forEach((f, q) => learned[q].set(f));
        templates.forEach((m, j) => m.set(CV.unflat(linear.W[j])));
        layout({
          ...Object.fromEntries(templates.map((_, j) => [`t${j}`, [j * 140, 0]])),
          ...Object.fromEntries(learned.map((_, q) => [`l${q}`, [q * 140 + 20, 190]])),
        });
        strip(
          `linear classifier: 4 × 64 weights + 4 biases = 260 parameters, ${fmt(100 * right(linearPredict, test), 1)}% · convnet: 4 × 9 + 4 + 4 × 4 + 4 = 60 parameters, ${fmt(100 * right(convPredict, test), 0)}%`
        );
      },
    };

    const usesImage = ["filter", "slide", "maps", "size", "pool", "shift", "train"];

    function render(step, t) {
      filterIn.wrap.hidden = !["filter", "slide", "size", "pool"].includes(step);
      padIn.wrap.hidden = step !== "size";
      strideIn.wrap.hidden = step !== "size";
      shiftIn.wrap.hidden = step !== "shift";
      const pick = usesImage.includes(step);
      [qLabel, prevQ, nextQ].forEach((el) => (el.style.visibility = pick ? "visible" : "hidden"));
      const ex = test[state.q];
      qLabel.textContent = `test image ${state.q + 1} of ${test.length} · ${article(CV.CLASSES[ex.label])} ${CV.CLASSES[ex.label]}`;
      [image, relu, pooled, ...pairs.map((p) => p.map)].forEach((m) => m.clear());
      [image, ...Object.values(outs)].forEach((m) => m.reveal(Infinity));
      pooled.reveal(Infinity);
      [imageWin, reluWin, pooledWin, ...Object.values(outs).map((m) => m.win)].forEach((w) => w.show(null));
      steps[step](t);
    }

    return { render };
  };
})();
