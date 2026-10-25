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
  };

  CV.figures = figures;
  document.querySelectorAll("[data-cv-figure]").forEach((root) => {
    const make = figures[root.dataset.cvFigure];
    if (!make) return;
    root.querySelector("noscript")?.remove();
    make(root);
  });
})();
