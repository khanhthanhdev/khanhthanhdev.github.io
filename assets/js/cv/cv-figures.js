// Standalone figures for the "Going deeper" sections of the computer vision series. Each
// <figure data-cv-figure="name"> is filled by figures[name]. Every number is computed here, from CV.
(function () {
  "use strict";

  const CV = window.CV;
  const { h, s, fmt } = window.TF.view;
  const { scatter } = window.CL.view;
  const { regions } = CV.view;
  const { select, slider } = CV.controls;

  // A standalone svg holding one scatter plot with decision regions.
  function plotFigure(root, label) {
    const svg = s("svg", { class: "tf-svg cv-fig-svg", viewBox: "-8 -8 456 456", role: "img", "aria-label": label });
    const plot = scatter(svg);
    const tint = regions(plot);
    return { svg, plot, tint };
  }

  const figures = {
    // k-nearest neighbours on 2-D points: the regions each k and distance give every spot of the plane.
    knn2d(root) {
      const data = CV.blobs(2, 20);
      // a few points in the "wrong" place, so k = 1 has islands to draw
      [
        [[6.4, 5.4], 0],
        [[3.6, 4.2], 1],
        [[5.8, 7.6], 2],
      ].forEach(([p, label]) => {
        data.points.push(p);
        data.labels.push(label);
      });
      const train = data.points.map((p, i) => ({ vec: CV.input(p), label: data.labels[i] }));
      const { svg, plot, tint } = plotFigure(root, "Decision regions of k-nearest neighbours on 2-D points");
      plot.points(data.points).colour(data.labels);
      const state = { k: 1, metric: "L2" };
      const caption = h("figcaption");
      function draw() {
        tint.set((x) => CV.vote(CV.ranked(train, x, state.metric), state.k, 3).label);
        const acc = train.filter((ex, i) => {
          const others = train.filter((_, j) => j !== i);
          return CV.vote(CV.ranked(others, ex.vec, state.metric), state.k, 3).label === ex.label;
        }).length;
        caption.textContent = `k = ${state.k}, ${state.metric}. Leave-one-out accuracy (each point classified by all the others): ${acc} of ${train.length}.`;
      }
      const kIn = slider("k", 1, 15, state.k, (v) => {
        state.k = v;
        draw();
      });
      const mIn = select(
        "distance",
        [
          ["L2", "L2"],
          ["L1", "L1"],
        ],
        state.metric,
        (v) => {
          state.metric = v;
          draw();
        }
      );
      root.append(h("div", { class: "cl-fig-row tf-controls" }, kIn.wrap, mIn.wrap), svg, caption);
      draw();
    },

    // Part 2: the softmax of our box's four scores, all multiplied by a factor c.
    softmaxScale(root) {
      const train = CV.split("train");
      const X = train.map((ex) => CV.flat(ex.img));
      const model = CV.trainLinear(
        X,
        train.map((ex) => ex.label),
        4,
        { steps: 400, lr: 0.2, reg: 0.01 }
      ).model;
      const ex = CV.split("test")[35];
      const scores = CV.linearScores(model, CV.flat(ex.img));
      const W = 560;
      const svg = s("svg", {
        class: "cv-fig-svg",
        viewBox: `0 0 ${W} 150`,
        role: "img",
        "aria-label": "Softmax probabilities of four scaled scores",
      });
      const rows = CV.CLASSES.map((c, j) => {
        const y = 14 + j * 32;
        const bar = s("rect", { class: `cv-prob-bar ${CV.view.colour(j)}`, x: 120, y, height: 20, width: 0 });
        const value = s("text", { class: "tf-num", x: 0, y: y + 15 });
        svg.append(s("text", { x: 0, y: y + 15, text: c }), bar, value);
        return { bar, value };
      });
      const sl = slider(
        "c",
        0,
        40,
        10,
        () => draw(),
        (v) => `× ${fmt(v / 10, 1)}`
      );
      const caption = h("figcaption");
      function draw() {
        const c = Number(sl.el.value) / 10;
        const p = CV.softmax(scores.map((v) => c * v));
        p.forEach((pj, j) => {
          rows[j].bar.setAttribute("width", (pj * 360).toFixed(1));
          rows[j].value.setAttribute("x", 126 + pj * 360);
          rows[j].value.textContent = `${fmt(100 * pj, 1)}%`;
        });
        caption.textContent = `scores × ${fmt(c, 1)} = ${scores.map((v) => fmt(c * v)).join(", ")}. Loss for the true class (box): ${fmt(-Math.log(p[ex.label]))}.`;
      }
      root.append(h("div", { class: "cl-fig-row tf-controls" }, sl.wrap), svg, caption);
      draw();
    },
  };

  CV.figures = figures;
  document.querySelectorAll("[data-cv-figure]").forEach((root) => {
    const make = figures[root.dataset.cvFigure];
    if (!make) return;
    root.querySelector("noscript")?.remove();
    make(root);
  });
})();
