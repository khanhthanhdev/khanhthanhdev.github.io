// Part 1 of the computer vision series: image classification with nearest neighbours. One scene, every number
// computed by CV (cv-core.js) on the tiny images shown.
(function () {
  "use strict";

  const CV = window.CV;
  const { fmt, matrix, bars, progress } = window.TF.view;
  const { gallery, thumb, colour } = CV.view;
  const { chart } = window.CL.view;
  const { button, select, slider } = CV.controls;
  CV.scenes = CV.scenes || {};

  const KMAX = 15;
  const SHIFT_EXAMPLE = 6; // a diagonal stroke whose nearest neighbour changes class when it moves 1 pixel
  const name = (label) => CV.CLASSES[label];

  CV.scenes.part1 = function (stage) {
    const { svg, toolbar, controls, strip, note } = stage;
    const train = CV.split("train").map((ex) => ({ ...ex, vec: CV.flat(ex.img) }));
    const val = CV.split("val");
    const test = CV.split("test");

    /* -------------------------------------------- inputs: which test image, k, distance, shift */

    const state = { q: 3, k: 3, metric: "L1", shift: 1 };
    const qLabel = document.createElement("span");
    qLabel.className = "tf-label";
    const prevQ = button("◀", () => pickQuery(state.q - 1));
    const nextQ = button("▶", () => pickQuery(state.q + 1));
    prevQ.setAttribute("aria-label", "Previous test image");
    nextQ.setAttribute("aria-label", "Next test image");
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
    const shiftIn = slider(
      "shift right",
      -3,
      3,
      state.shift,
      (v) => {
        state.shift = v;
        stage.refresh();
      },
      (v) => `${v} px`
    );
    controls.append(kIn.wrap, metricIn.wrap, shiftIn.wrap);
    const showControls = (...on) =>
      [
        ["k", kIn],
        ["metric", metricIn],
        ["shift", shiftIn],
      ].forEach(([key, c]) => (c.wrap.hidden = !on.includes(key)));

    function pickQuery(i) {
      state.q = (i + test.length) % test.length;
      stage.refresh();
    }

    /* -------------------------------------------- objects */

    const query = matrix(svg, { rows: 8, cols: 8, cell: 30, kind: "prob", name: "test image" });
    const other = matrix(svg, { rows: 8, cols: 8, cell: 30, kind: "prob", name: "training image" });
    const diff = matrix(svg, { rows: 8, cols: 8, cell: 30, kind: "prob", name: "|difference|" });
    const gal = gallery(svg, train, { cols: 8, size: 34, captions: true, title: "training set · 64 images" });
    const qThumb = thumb(svg, { size: 96 });
    const sThumb = thumb(svg, { size: 96 });
    const votes = bars(svg, { labels: CV.CLASSES, width: 120, gap: 24, title: "votes", format: (v) => String(v) });
    const valChart = chart(svg, { title: "validation accuracy (%)", width: 340, height: 170, xTitle: "k" });
    const objects = () => ({ query, other, diff, gal, qThumb, sThumb, votes, valChart });
    const layout = CV.layout(svg, objects);
    [query, other, diff].forEach((m) => (m.box = { x: -6, y: -30, width: 252, height: 278 }));
    qThumb.box = { x: -6, y: -14, width: 108, height: 130 };
    sThumb.box = qThumb.box;
    votes.box = { x: -84, y: -34, width: 250, height: 136 };
    valChart.box = { x: -40, y: -30, width: 420, height: 236 };

    // the validation curve does not depend on the reader's inputs, so it is computed once
    const curves = ["L1", "L2"].map((m) => Array.from({ length: KMAX }, (_, i) => 100 * CV.knnAccuracy(train, val, i + 1, m)));

    const byLabel = train.map((_, i) => i).sort((a, b) => train[a].label - train[b].label || a - b);
    const order = (img, metric = state.metric) => CV.ranked(train, CV.flat(img), metric);

    /* -------------------------------------------- render */

    const steps = {
      pixels() {
        const img = test[state.q].img;
        query.set(img);
        query.reveal();
        layout({ query: [0, 0] });
        strip(`This image is 8 × 8 = 64 numbers. Brightest pixel ${fmt(Math.max(...img.flat()))}, darkest ${fmt(Math.min(...img.flat()))}.`);
      },

      classes(t) {
        gal.arrange(byLabel).decorate(() => ({}));
        gal.title("training set · 64 images, 16 of each class");
        layout({ gal: [0, 0] });
        const shown = Math.min(3, Math.floor(t * 4));
        strip(`Four classes: ${CV.CLASSES.slice(0, shown + 1).join(", ")}${shown < 3 ? ", …" : ""}. The colour tab on each image is its label.`);
      },

      compare(t) {
        const img = test[state.q].img;
        const nearest = order(img, "L1")[0];
        const other_ = train[nearest.i].img;
        const D = img.map((row, r) => row.map((v, c) => Math.abs(v - other_[r][c])));
        query.set(img);
        other.set(other_);
        diff.set(D);
        const k = progress(t, 64);
        diff.reveal(k);
        query.reveal();
        other.reveal();
        layout({ query: [0, 0], other: [290, 0], diff: [580, 0] });
        if (k === 0 || k > 64) {
          query.cellAt(null);
          other.cellAt(null);
          diff.cellAt(null);
          strip(`L1 distance = sum of all 64 |differences| = ${fmt(nearest.d)}`);
          return;
        }
        const r = Math.floor((k - 1) / 8);
        const c = (k - 1) % 8;
        [query, other, diff].forEach((m) => m.cellAt(r, c));
        const running = D.flat()
          .slice(0, k)
          .reduce((a, b) => a + b, 0);
        strip(`pixel (${r + 1}, ${c + 1}): |${fmt(img[r][c])} − ${fmt(other_[r][c])}| = ${fmt(D[r][c])}   ·   running total ${fmt(running)}`);
      },

      nearest() {
        const img = test[state.q].img;
        const o = order(img, "L1");
        const rank = new Map(o.map((r, k) => [r.i, k]));
        gal.arrange(o.map((r) => r.i)).decorate((i) => ({ caption: fmt(o[rank.get(i)].d, 1), mark: rank.get(i) === 0 ? "ring" : null }));
        gal.title("nearest first (L1 distance)");
        qThumb.set(img, { label: null }).caption("");
        layout({ qThumb: [0, 0], gal: [150, 0] });
        const best = o[0];
        strip(
          `nearest: a ${name(best.label)} at distance ${fmt(best.d)} → predict "${name(best.label)}". ` +
            `The truth is "${name(test[state.q].label)}"${best.label === test[state.q].label ? " ✓" : " ✗"}.`
        );
      },

      knn() {
        const img = test[state.q].img;
        const o = order(img);
        const rank = new Map(o.map((r, k) => [r.i, k]));
        const v = CV.vote(o, state.k);
        gal.arrange(o.map((r) => r.i)).decorate((i) => ({
          caption: fmt(o[rank.get(i)].d, 1),
          mark: rank.get(i) < state.k ? "ring" : "dim",
        }));
        gal.title(`nearest first (${state.metric}) · ${state.k} ringed`);
        qThumb.set(img).caption("");
        votes.set(v.counts, v.label, Math.max(1, state.k));
        layout({ qThumb: [0, 0], votes: [84, 190], gal: [260, 0] });
        strip(
          `${state.k} nearest: ${o
            .slice(0, Math.min(state.k, 7))
            .map((r) => name(r.label))
            .join(", ")}${state.k > 7 ? ", …" : ""} → most votes: "${name(v.label)}"${v.label === test[state.q].label ? " ✓" : " ✗"}`
        );
      },

      validate(t) {
        const best = (series) => series.indexOf(Math.max(...series));
        const n = Math.max(1, Math.min(KMAX, Math.ceil(t * 1.25 * KMAX)));
        valChart.set(
          [
            { values: curves[0].map((v, i) => (i < n ? v : null)), cls: "cl-ink", label: "L1" },
            { values: curves[1].map((v, i) => (i < n ? v : null)), cls: "cl-ref", label: "L2" },
          ],
          best(curves[0]),
          null,
          100,
          0
        );
        layout({ valChart: [0, 0] });
        const kb = best(curves[0]) + 1;
        const testAcc = 100 * CV.knnAccuracy(train, test, kb, "L1");
        strip(
          n < KMAX
            ? `k = ${n}: ${fmt(curves[0][n - 1], 0)}% (L1), ${fmt(curves[1][n - 1], 0)}% (L2) of the 32 validation images right`
            : `best on validation: k = ${kb}, ${fmt(curves[0][kb - 1], 0)}%. Then, once, on the 40 test images: ${fmt(testAcc, 0)}%.`
        );
      },

      shift() {
        const base = test[SHIFT_EXAMPLE];
        const img = CV.shift(base.img, 0, state.shift);
        const o = order(img, "L1");
        const o0 = order(base.img, "L1");
        const rank = new Map(o.map((r, k) => [r.i, k]));
        gal.arrange(o.map((r) => r.i)).decorate((i) => ({ caption: fmt(o[rank.get(i)].d, 1), mark: rank.get(i) === 0 ? "ring" : null }));
        gal.title(`nearest to the moved image (L1)`);
        qThumb.set(base.img).caption(`original → ${name(o0[0].label)}`);
        sThumb.set(img).caption(`moved ${state.shift} px → ${name(o[0].label)}`);
        layout({ qThumb: [0, 0], sThumb: [0, 160], gal: [150, 0] });
        const d = CV.l1(CV.flat(base.img), CV.flat(img));
        strip(
          `the same stroke, moved ${state.shift} px: ${fmt(d)} away from itself in L1. ` +
            `Its nearest training image is now a ${name(o[0].label)} (${fmt(o[0].d)}).`
        );
      },
    };

    // which inputs each step uses
    const uses = { knn: ["k", "metric"], shift: ["shift"] };

    function render(step, t) {
      showControls(...(uses[step] || []));
      const fixed = step === "shift" || step === "validate" || step === "classes";
      [qLabel, prevQ, nextQ].forEach((el) => (el.style.visibility = fixed ? "hidden" : "visible"));
      qLabel.textContent = `test image ${state.q + 1} of ${test.length} · a ${name(test[state.q].label)}`;
      note(fixed ? "" : "use ◀ ▶ to try another test image");
      if (step !== "compare") [query, other, diff].forEach((m) => m.cellAt(null));
      steps[step](t);
    }

    return { render };
  };
})();
