// Part 3 of the computer vision series: optimisation. A classifier with two weights, so its whole loss landscape
// fits on screen, and the paths random search, gradient descent, SGD, momentum and Adam take across it.
(function () {
  "use strict";

  const CV = window.CV;
  const { s, fmt } = window.TF.view;
  const { chart } = window.CL.view;
  const { surface } = CV.view;
  const { select } = CV.controls;
  CV.scenes = CV.scenes || {};

  const STEPS = 60;
  const WIN = { x: [-2.5, 4.5], y: [-4.5, 2.5] };
  const RATES = [0.5, 2, 8, 12];
  const BATCHES = [1, 8, 32];
  const w2 = (w) => `(${fmt(w[0])}, ${fmt(w[1])})`;

  CV.scenes.part3 = function (stage) {
    const { svg, controls, strip, note } = stage;
    const data = CV.valleyData();
    const best = CV.valleyMin(data);
    const loss = (w) => CV.valleyLoss(data, w).loss;

    /* -------------------------------------------- inputs: start point, learning rate, batch size */

    const state = { start: [2.6, -3.5], lr: 1, batch: 1 };
    const lrIn = select(
      "learning rate",
      RATES.map((r, i) => [i, String(r)]),
      state.lr,
      (v) => {
        state.lr = Number(v);
        stage.refresh();
      }
    );
    const batchIn = select(
      "batch size",
      BATCHES.map((b, i) => [i, String(b)]),
      state.batch,
      (v) => {
        state.batch = Number(v);
        stage.refresh();
      }
    );
    controls.append(lrIn.wrap, batchIn.wrap);

    /* -------------------------------------------- objects */

    const surf = surface(svg, loss, WIN, { size: 400, title: "loss for every (w₁, w₂)", max: 2 });
    surf.onClick((w) => {
      state.start = w;
      runs = null;
      stage.refresh();
    });
    const lossChart = chart(svg, { title: "loss", width: 260, height: 170, xTitle: "step" });
    lossChart.box = { x: -40, y: -30, width: 330, height: 256 };
    // the legend sits under the chart's x axis title
    const legend = s("text", { class: "tf-small", x: 0, y: 222 });
    lossChart.el.append(legend);
    const layout = CV.layout(svg, () => ({ surf, lossChart }));
    const SIDE = [480, 110];

    // every run from the current start, computed when first needed
    let runs = null;
    function all() {
      if (runs) return runs;
      const opts = { start: state.start, steps: STEPS };
      runs = {
        rates: RATES.map((lr) => CV.optimise(data, "gd", { ...opts, lr })),
        sgd: BATCHES.map((batch) => CV.optimise(data, "sgd", { ...opts, lr: 2, batch })),
        momentum: CV.optimise(data, "momentum", { ...opts, lr: 0.25 }),
        adam: CV.optimise(data, "adam", { ...opts, lr: 0.1 }),
      };
      const r = CV.rng(7);
      runs.random = Array.from({ length: 100 }, () => [WIN.x[0] + (WIN.x[1] - WIN.x[0]) * r.next(), WIN.y[0] + (WIN.y[1] - WIN.y[0]) * r.next()]);
      return runs;
    }

    const xLabels = Array.from({ length: STEPS + 1 }, (_, i) => (i % 10 === 0 ? String(i) : ""));
    const upTo = (t) => Math.min(STEPS, Math.floor(t * 1.25 * STEPS));
    // series: [{ run, cls, label }]; shows each up to step n
    function plotLosses(series, n) {
      legend.replaceChildren(...series.map(({ cls, label }, i) => s("tspan", { class: `cv-legend ${cls}`, dx: i ? 14 : 0, text: `— ${label}` })));
      lossChart.set(
        series.map(({ run, cls }) => ({ values: run.losses.map((v, i) => (i <= n ? v : null)), cls })),
        null,
        xLabels,
        1,
        0.4
      );
    }

    /* -------------------------------------------- render */

    const steps = {
      landscape() {
        surf.draw([
          { path: [state.start], marker: true, dots: false },
          { path: [], star: best.w },
        ]);
        layout({ surf: [0, 0] });
        strip(`start ${w2(state.start)}: loss ${fmt(loss(state.start), 3)} · lowest point ★ ${w2(best.w)}: loss ${fmt(best.loss, 3)}`);
      },

      random(t) {
        const R = all().random;
        const n = Math.max(1, Math.min(100, Math.ceil(t * 1.25 * 100)));
        const tried = R.slice(0, n);
        const k = tried.reduce((b, w, i) => (loss(w) < loss(tried[b]) ? i : b), 0);
        surf.draw([
          { path: tried, dots: "only" },
          { path: [tried[k]], marker: true, dots: false },
          { path: [], star: best.w },
        ]);
        layout({ surf: [0, 0] });
        strip(`${n} random tries · best so far ${w2(tried[k])}, loss ${fmt(loss(tried[k]), 3)} (lowest possible ${fmt(best.loss, 3)})`);
      },

      gradient() {
        const { grad } = CV.valleyLoss(data, state.start);
        const h = 1e-4;
        const num = [0, 1].map((i) => {
          const a = state.start.slice();
          a[i] += h;
          return (loss(a) - loss(state.start)) / h;
        });
        const scale = 8; // the arrow is the step a learning rate of 8 would take
        const tip = (g) => [state.start[0] - scale * g[0], state.start[1] - scale * g[1]];
        surf.draw([
          { path: [state.start], marker: true, dots: false },
          { path: [], arrow: [state.start, tip(grad)] },
          { path: [], arrow: [state.start, tip(num)], cls: "is-num" },
          { path: [], star: best.w },
        ]);
        layout({ surf: [0, 0] });
        strip(
          `gradient by calculus (∂L/∂w₁, ∂L/∂w₂) = (${fmt(grad[0], 4)}, ${fmt(grad[1], 4)}) · by nudging each weight 0.0001: (${fmt(num[0], 4)}, ${fmt(num[1], 4)})`
        );
      },

      descent(t) {
        const run = all().rates[1];
        const n = upTo(t);
        surf.draw([
          { path: run.path, upTo: n, marker: true },
          { path: [], star: best.w },
        ]);
        plotLosses([{ run, cls: "cv-o0", label: "lr 2" }], n);
        layout({ surf: [0, 0], lossChart: SIDE });
        strip(`step ${n}: w = ${w2(run.path[n])}, loss ${fmt(run.losses[n], 3)}`);
      },

      rate(t) {
        const R = all().rates;
        const run = R[state.lr];
        const n = upTo(t);
        surf.draw([
          { path: run.path, upTo: n, marker: true, cls: "cv-o1" },
          { path: [], star: best.w },
        ]);
        const series = [{ run, cls: "cv-o1", label: `lr ${RATES[state.lr]}` }];
        if (state.lr !== 1) series.unshift({ run: R[1], cls: "cv-o0", label: "lr 2" });
        plotLosses(series, n);
        layout({ surf: [0, 0], lossChart: SIDE });
        strip(
          `learning rate ${RATES[state.lr]}, step ${n}: loss ${fmt(run.losses[n], 3)}${run.losses[n] > run.losses[Math.max(0, n - 1)] + 1e-9 ? " (up!)" : ""}`
        );
      },

      sgd(t) {
        const run = all().sgd[state.batch];
        const n = upTo(t);
        surf.draw([
          { path: all().rates[1].path, upTo: n, dots: false, cls: "cv-o0" },
          { path: run.path, upTo: n, marker: true, cls: "cv-o1" },
          { path: [], star: best.w },
        ]);
        plotLosses(
          [
            { run: all().rates[1], cls: "cv-o0", label: "full" },
            { run, cls: "cv-o1", label: `batch ${BATCHES[state.batch]}` },
          ],
          n
        );
        layout({ surf: [0, 0], lossChart: SIDE });
        strip(`each step looks at ${BATCHES[state.batch]} of the ${data.X.length} points · step ${n}: loss ${fmt(run.losses[n], 3)}`);
      },

      momentum(t) {
        const R = all();
        const n = upTo(t);
        surf.draw([
          { path: R.rates[1].path, upTo: n, dots: false, cls: "cv-o0" },
          { path: R.momentum.path, upTo: n, marker: true, cls: "cv-o2" },
          { path: [], star: best.w },
        ]);
        plotLosses(
          [
            { run: R.rates[1], cls: "cv-o0", label: "gd" },
            { run: R.momentum, cls: "cv-o2", label: "momentum" },
          ],
          n
        );
        layout({ surf: [0, 0], lossChart: SIDE });
        strip(`step ${n}: plain ${fmt(R.rates[1].losses[n], 3)} · momentum ${fmt(R.momentum.losses[n], 3)}`);
      },

      adam(t) {
        const R = all();
        const n = upTo(t);
        surf.draw([
          { path: R.rates[1].path, upTo: n, dots: false, cls: "cv-o0" },
          { path: R.momentum.path, upTo: n, dots: false, cls: "cv-o2" },
          { path: R.adam.path, upTo: n, marker: true, cls: "cv-o3" },
          { path: [], star: best.w },
        ]);
        plotLosses(
          [
            { run: R.rates[1], cls: "cv-o0", label: "gd" },
            { run: R.momentum, cls: "cv-o2", label: "mom." },
            { run: R.adam, cls: "cv-o3", label: "adam" },
          ],
          n
        );
        layout({ surf: [0, 0], lossChart: SIDE });
        const within = (run) => run.losses.findIndex((v) => v < best.loss + 0.01);
        const said = (run) => (within(run) < 0 ? `not within ${STEPS} steps` : `step ${within(run)}`);
        strip(`within 0.01 of the lowest loss: gd ${said(R.rates[1])} · momentum ${said(R.momentum)} · Adam ${said(R.adam)}`);
      },
    };

    function render(step, t) {
      lrIn.wrap.hidden = step !== "rate";
      batchIn.wrap.hidden = step !== "sgd";
      note(step === "random" ? "" : "click the landscape to start somewhere else");
      steps[step](t);
    }

    return { render };
  };
})();
