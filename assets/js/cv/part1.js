// Part 1 of the computer vision series: image classification with nearest neighbours, on real CIFAR-10 photos.
// One scene, every number computed by CV (cv-core.js) on the photos shown.
(function () {
  "use strict";

  const CV = window.CV;
  const { s, fmt, matrix, bars, progress } = window.TF.view;
  const { gallery, thumb } = CV.view;
  const { chart } = window.CL.view;
  const { button, select, slider } = CV.controls;
  CV.scenes = CV.scenes || {};

  const KMAX = 15;
  const FOOLED = 36; // a plane whose own copy, moved 2 pixels, is further away than a photo of a frog
  const SIDE = CV.PHOTOS.side;
  const PATCH = 4; // the patch of pixels whose numbers the first step prints
  const name = (label) => CV.PHOTOS.classes[label];

  CV.scenes.part1 = (stage) => CV.loadPhotos().then((photos) => scene(stage, photos));

  function scene(stage, { train, val, test }) {
    const { svg, toolbar, controls, strip, note } = stage;
    const C = CV.PHOTOS.classes.length;

    /* -------------------------------------------- inputs: which test photo, k, distance */

    const state = { q: 4, k: 3, metric: "L1" };
    const qLabel = document.createElement("span");
    qLabel.className = "tf-label";
    const prevQ = button("◀", () => pickQuery(state.q - 1));
    const nextQ = button("▶", () => pickQuery(state.q + 1));
    prevQ.setAttribute("aria-label", "Previous test photo");
    nextQ.setAttribute("aria-label", "Next test photo");
    toolbar.append(qLabel, prevQ, nextQ);
    const kIn = slider("k", 1, KMAX, state.k, (v) => {
      state.k = v;
      stage.refresh();
    });
    const metricIn = select(
      "distance",
      [
        ["L1", "L1 (sum of |differences|)"],
        ["L2", "L2 (straight line)"],
      ],
      state.metric,
      (v) => {
        state.metric = v;
        stage.refresh();
      }
    );
    controls.append(kIn.wrap, metricIn.wrap);

    function pickQuery(i) {
      state.q = (i + test.length) % test.length;
      stage.refresh();
    }

    /* -------------------------------------------- objects */

    // a frame drawn over a thumbnail: a patch, or one row of pixels
    function frameOn(t) {
      const rect = s("rect", { class: "cv-window" });
      t.el.append(rect);
      const u = t.size / SIDE;
      return (r, c, h, w) => {
        rect.style.opacity = r == null ? "0" : "1";
        if (r == null) return;
        rect.setAttribute("x", c * u);
        rect.setAttribute("y", r * u);
        rect.setAttribute("width", w * u);
        rect.setAttribute("height", h * u);
      };
    }

    const big = thumb(svg, { size: 256 });
    const bigFrame = frameOn(big);
    const channels = ["red", "green", "blue"].map((c) => matrix(svg, { rows: PATCH, cols: PATCH, cell: 34, kind: "plain", digits: 0, name: c }));
    // the comparison: test photo, a training photo, and their difference
    const pair = [0, 1, 2].map(() => thumb(svg, { size: 192 }));
    const pairFrames = pair.map(frameOn);
    // the training set: 12 of each class on the classes step, the nearest 24 afterwards
    const SHOW = 12;
    const gal = gallery(svg, train, { cols: 12, size: 40, gapX: 8, slots: SHOW * C, title: "" });
    const near = gallery(svg, train, { cols: 8, size: 48, gapX: 10, slots: 24, captions: true, title: "" });
    const qThumb = thumb(svg, { size: 112 });
    const votes = bars(svg, { labels: CV.PHOTOS.classes, width: 120, gap: 24, title: "votes", format: (v) => String(v) });
    const valChart = chart(svg, { title: "validation accuracy (%)", width: 340, height: 170, xTitle: "k" });
    // the two curves end too close to label, so a legend sits under the x axis title
    valChart.el.append(s("text", { class: "tf-small", x: 0, y: 222, text: "— L1    - - L2" }));
    const edits = [0, 1, 2, 3, 4].map(() => thumb(svg, { size: 112 }));

    const objects = () => ({
      big,
      ...Object.fromEntries(channels.map((m, i) => [`ch${i}`, m])),
      ...Object.fromEntries(pair.map((t, i) => [`p${i}`, t])),
      gal,
      near,
      qThumb,
      votes,
      valChart,
      ...Object.fromEntries(edits.map((t, i) => [`e${i}`, t])),
    });
    const layout = CV.layout(svg, objects);
    big.box = { x: -6, y: -30, width: 268, height: 292 };
    channels.forEach((m) => (m.box = { x: -6, y: -30, width: PATCH * 34 + 12, height: PATCH * 34 + 36 }));
    pair.forEach((t) => (t.box = { x: -6, y: -30, width: 204, height: 228 }));
    qThumb.box = { x: -6, y: -30, width: 124, height: 166 };
    edits.forEach((t) => (t.box = { x: -6, y: -30, width: 124, height: 166 }));
    votes.box = { x: -84, y: -34, width: 250, height: 136 };
    valChart.box = { x: -40, y: -30, width: 420, height: 236 };
    // captions for the big pictures sit above them
    const titleOf = (t) => {
      const el = s("text", { class: "tf-mat-title", x: 0, y: -12 });
      t.el.append(el);
      return (text) => (el.textContent = text);
    };
    const bigTitle = titleOf(big);
    const pairTitles = pair.map(titleOf);
    const qTitle = titleOf(qThumb);
    const editTitles = edits.map(titleOf);

    // the validation curve does not depend on the reader's inputs, so it is computed once
    // each validation photo is ranked once per distance, and every k votes from that one ranking
    const curves = ["L1", "L2"].map((m) => {
      const ranks = val.map((p) => CV.ranked(train, p.vec, m));
      return Array.from({ length: KMAX }, (_, i) => (100 * val.filter((p, n) => CV.vote(ranks[n], i + 1).label === p.label).length) / val.length);
    });

    // 12 of each class first, grouped by class, then the rest
    const byLabel = Array.from({ length: C }, (_, j) => train.map((_, i) => i).filter((i) => train[i].label === j));
    const classOrder = [...byLabel.flatMap((list) => list.slice(0, SHOW)), ...byLabel.flatMap((list) => list.slice(SHOW))];
    // a photo's training photos, nearest first: worked out once per photo and distance, not on every frame
    const orders = new Map();
    const order = (p, metric = state.metric) => {
      if (!orders.has(p)) orders.set(p, {});
      const memo = orders.get(p);
      return (memo[metric] ??= CV.ranked(train, p.vec, metric));
    };

    // the edits behind the last step: moved, darkened and covered copies, each about as far from the original
    const base = test[FOOLED];
    const moved = CV.shiftPhoto(base, 0, 2);
    const dMoved = CV.l1(base.vec, moved.vec);
    const sum = base.vec.reduce((a, b) => a + b, 0);
    const darker = CV.photo(
      Uint8Array.from(base.px, (v) => Math.round(v * (1 - dMoved / sum))),
      base.label
    );
    const covered = (() => {
      // the black square, centred, whose distance comes closest to the moved copy's
      let best = null;
      for (let size = 1; size <= SIDE; size++) {
        const px = Uint8Array.from(base.px);
        const r0 = SIDE / 2 - Math.floor(size / 2);
        for (let r = r0; r < r0 + size; r++) for (let c = r0; c < r0 + size; c++) px.fill(0, (r * SIDE + c) * 3, (r * SIDE + c) * 3 + 3);
        const p = CV.photo(px, base.label);
        const d = CV.l1(base.vec, p.vec);
        if (!best || Math.abs(d - dMoved) < Math.abs(best.d - dMoved)) best = { p, d };
      }
      return best.p;
    })();

    /* -------------------------------------------- render */

    const steps = {
      pixels() {
        const p = test[state.q];
        big.set(p);
        bigTitle("a test photo, 32 × 32 pixels");
        const r0 = SIDE / 2 - PATCH / 2;
        bigFrame(r0, r0, PATCH, PATCH);
        channels.forEach((m, ch) =>
          m.set(Array.from({ length: PATCH }, (_, r) => Array.from({ length: PATCH }, (_, c) => p.px[((r0 + r) * SIDE + r0 + c) * 3 + ch])))
        );
        layout({ big: [0, 0], ch0: [320, 0], ch1: [500, 0], ch2: [410, 190] });
        strip(
          `the framed 4 × 4 patch, as numbers: one each for red, green and blue per pixel, 0 to 255 · the whole photo: 32 × 32 × 3 = 3,072 numbers`
        );
      },

      classes(t) {
        gal.arrange(classOrder).decorate(() => ({}));
        gal.title(`training set · 320 photos, 80 of each class · 12 of each shown`);
        layout({ gal: [0, 0] });
        const shown = Math.min(C - 1, Math.floor(t * (C + 1)));
        strip(
          `Four classes: ${CV.PHOTOS.classes.slice(0, shown + 1).join(", ")}${shown < C - 1 ? ", …" : ""}. The colour tab on each photo is its label.`
        );
      },

      compare(t) {
        const p = test[state.q];
        const nearest = order(p, "L1")[0];
        const other = train[nearest.i];
        // per pixel, the |differences| of its three colours, averaged, as a grey picture: dark = very different
        const D = Array.from({ length: SIDE }, (_, r) =>
          Array.from(
            { length: SIDE },
            (_, c) => [0, 1, 2].reduce((a, ch) => a + Math.abs(p.vec[(r * SIDE + c) * 3 + ch] - other.vec[(r * SIDE + c) * 3 + ch]), 0) / 3
          )
        );
        pair[0].set(p);
        pair[1].set(other);
        pair[2].set(D);
        pairTitles[0]("test photo");
        pairTitles[1]("a training photo");
        pairTitles[2]("|difference|");
        layout({ p0: [0, 0], p1: [250, 0], p2: [500, 0] });
        const k = progress(t, SIDE);
        if (k === 0 || k > SIDE) {
          pairFrames.forEach((f) => f(null));
          strip(`L1 distance = the sum of all 3,072 |differences| = ${fmt(nearest.d, 1)}`);
          return;
        }
        pairFrames.forEach((f) => f(k - 1, 0, 1, SIDE));
        const running = D.slice(0, k).reduce((a, row) => a + row.reduce((b, v) => b + 3 * v, 0), 0);
        strip(`rows 1 to ${k} of 32: running total ${fmt(running, 1)}`);
      },

      nearest() {
        const p = test[state.q];
        const o = order(p, "L1");
        const rank = new Map(o.map((r, k) => [r.i, k]));
        near.arrange(o.map((r) => r.i)).decorate((i) => ({ caption: fmt(o[rank.get(i)].d, 0), mark: rank.get(i) === 0 ? "ring" : null }));
        near.title("the 24 nearest training photos (L1 distance)");
        qThumb.set(p);
        qTitle("test photo");
        layout({ qThumb: [0, 0], near: [170, 0] });
        const best = o[0];
        strip(
          `nearest: a ${name(best.label)} at distance ${fmt(best.d, 1)} → predict "${name(best.label)}". ` +
            `The truth is "${name(p.label)}"${best.label === p.label ? " ✓" : " ✗"}.`
        );
      },

      knn() {
        const p = test[state.q];
        const o = order(p);
        const rank = new Map(o.map((r, k) => [r.i, k]));
        const v = CV.vote(o, state.k, C);
        near.arrange(o.map((r) => r.i)).decorate((i) => ({
          caption: fmt(o[rank.get(i)].d, state.metric === "L1" ? 0 : 2),
          mark: rank.get(i) < state.k ? "ring" : "dim",
        }));
        near.title(`nearest first (${state.metric}) · ${state.k} ringed`);
        qThumb.set(p);
        qTitle("test photo");
        votes.set(v.counts, v.label, Math.max(1, state.k));
        layout({ qThumb: [0, 0], votes: [84, 220], near: [270, 0] });
        strip(
          `${state.k} nearest: ${o
            .slice(0, Math.min(state.k, 7))
            .map((r) => name(r.label))
            .join(", ")}${state.k > 7 ? ", …" : ""} → most votes: "${name(v.label)}"${v.label === p.label ? " ✓" : " ✗"}`
        );
      },

      validate(t) {
        const best = (series) => series.indexOf(Math.max(...series));
        const n = Math.max(1, Math.min(KMAX, Math.ceil(t * 1.25 * KMAX)));
        valChart.set(
          [
            { values: curves[0].map((v, i) => (i < n ? v : null)), cls: "cl-ink" },
            { values: curves[1].map((v, i) => (i < n ? v : null)), cls: "cl-ref" },
          ],
          best(curves[0]),
          null,
          100,
          0
        );
        layout({ valChart: [0, 0] });
        const kb = best(curves[0]) + 1;
        const testAcc = (100 * test.filter((p) => CV.vote(order(p, "L1"), kb).label === p.label).length) / test.length;
        strip(
          n < KMAX
            ? `k = ${n}: ${fmt(curves[0][n - 1], 0)}% (L1), ${fmt(curves[1][n - 1], 0)}% (L2) of the ${val.length} validation photos right`
            : `best on validation: k = ${kb}, ${fmt(curves[0][kb - 1], 0)}%. Then, once, on the ${test.length} test photos: ${fmt(testAcc, 0)}%.`
        );
      },

      fooled() {
        const nearest = order(base, "L1")[0];
        const shown = [
          [base, "original"],
          [moved, `moved 2 px · ${fmt(dMoved, 0)}`],
          [darker, `darker · ${fmt(CV.l1(base.vec, darker.vec), 0)}`],
          [covered, `covered · ${fmt(CV.l1(base.vec, covered.vec), 0)}`],
          [train[nearest.i], `a ${name(nearest.label)} · ${fmt(nearest.d, 0)}`],
        ];
        shown.forEach(([p, title], i) => {
          edits[i].set(p, { label: i === 4 ? p.label : null });
          editTitles[i](title);
        });
        layout({ e0: [0, 0], e1: [0, 200], e2: [150, 200], e3: [300, 200], e4: [300, 0] });
        strip(
          `L1 distance: the three edits are about ${fmt(dMoved, 0)} from the original; a training ${name(nearest.label)} is only ${fmt(nearest.d, 0)}`
        );
      },
    };

    // which inputs each step uses
    const uses = { knn: ["k", "metric"] };

    function render(step, t) {
      kIn.wrap.hidden = !(uses[step] || []).includes("k");
      metricIn.wrap.hidden = !(uses[step] || []).includes("metric");
      const fixed = step === "fooled" || step === "validate" || step === "classes";
      [qLabel, prevQ, nextQ].forEach((el) => (el.style.visibility = fixed ? "hidden" : "visible"));
      qLabel.textContent = `test photo ${state.q + 1} of ${test.length} · a ${name(test[state.q].label)}`;
      note(fixed ? "" : "use ◀ ▶ to try another test photo");
      if (step !== "compare") pairFrames.forEach((f) => f(null));
      steps[step](t);
    }

    return { render };
  }
})();
