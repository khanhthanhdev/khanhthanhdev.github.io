// Part 1 of the diffusion series: the idea. One scene: the Swiss roll is noised step by step into a Gaussian, the
// true reverse step is shown to be Gaussian only when the step is small, and a trained network plays the chain
// backwards. Every number comes from DM on the points shown.
(function () {
  "use strict";

  const DM = window.DM;
  const { h, fmt } = window.TF.view;
  const { plot, chart, at, chunked } = DM.view;
  DM.scenes = DM.scenes || {};

  const N = 800; // points in the cloud
  const T = 200;
  const ZOOM_T = 40; // the step whose reverse kernel steps 5 and 6 look at
  const narrow = window.matchMedia("(max-width: 991.98px)");
  // a second panel goes right of the main plot, or under it on phones
  const beside = (x, y, opts) => (narrow.matches ? [0, 450, opts] : [x, y, opts]);
  const pt = (p, d = 2) => `(${fmt(p[0], d)}, ${fmt(p[1], d)})`;

  DM.scenes.part1 = function (stage) {
    const { svg, controls, strip } = stage;
    const data = DM.DATASETS.swissroll;
    const sch = DM.schedule("linear", T);
    const x0 = DM.sample(data, N, 1).xs;
    const fwd = DM.forwardChain(x0, sch, 11);
    const fresh = DM.gaussian(N, 77); // a fresh standard Gaussian sample, to compare the end of the chain with
    const followers = [17, 233, 402, 611, 700];
    const net = DM.loadNet("swissroll-eps");
    const model = DM.netModel(net, sch);

    // reference clouds for "how close is the reverse chain to the forward chain at step t"
    const refAt = (t) => DM.qSample(DM.sample(data, N, 5).xs, sch, t, 900 + t).xt;

    /* -------------------------------------------- objects */

    const main = plot(svg, { range: 3, title: "the plane" });
    const side = plot(svg, { range: 0.6, title: "" });
    const fade = chart(svg, { title: "how much of x₀ is left", width: 250, height: 130, xTitle: "step t" });
    const fit = chart(svg, { title: "distance to the noised data at step t", width: 250, height: 130, xTitle: "step t" });
    const layout = DM.layout(svg, () => ({ main, side, fade, fit }));

    /* -------------------------------------------- the reverse chain, computed a few steps per frame */

    let seed = 2;
    let rev = null; // frames[t] once complete
    let revFit = null;
    let cancel = () => {};
    function sampleReverse() {
      cancel();
      rev = null;
      revFit = null;
      const stepper = DM.ddpmStepper(model, sch, DM.gaussian(N, seed), { seed: seed + 40 });
      stage.busy("sampling 800 points through 200 steps…");
      cancel = chunked(
        () => stepper.next(8),
        (p) => stage.busy(`sampling 800 points through 200 steps… ${Math.round(100 * p)}%`),
        () => {
          rev = stepper.frames;
          revFit = [];
          for (let t = 0; t <= T; t += 10) revFit.push([t, DM.sliced(rev[t], refAt(t), 32)]);
          stage.busy(null);
          stage.note(note());
          stage.redraw();
        }
      );
    }

    const again = h("button", { type: "button", class: "tf-btn", text: "new noise" });
    again.addEventListener("click", () => {
      seed += 1;
      sampleReverse();
    });
    controls.append(again);
    const note = () => `${N} points · ${T} steps · network with ${DM.paramCount().toLocaleString("en")} weights`;
    stage.note(note());
    sampleReverse();

    /* -------------------------------------------- pieces */

    const pathsUpTo = (frames, t0, t1) =>
      followers.map((i) => {
        const pts = [];
        const step = t1 >= t0 ? 1 : -1;
        for (let t = t0; step > 0 ? t <= t1 : t >= t1; t += step) pts.push(at(frames[t], i));
        return { pts, cls: "dm-ink" };
      });

    const gaussRings = [
      { c: [0, 0], r: 1, cls: "dm-ink is-dashed" },
      { c: [0, 0], r: 2, cls: "dm-ink is-dashed" },
    ];

    function fadeChart(t) {
      const a = [];
      const b = [];
      for (let k = 0; k <= T; k += 2) {
        a.push([k, Math.sqrt(sch.alphaBar[k])]);
        b.push([k, Math.sqrt(1 - sch.alphaBar[k])]);
      }
      fade.set({
        series: [
          { values: a, cls: "dm-data", label: "√ᾱₜ (signal)" },
          { values: b, cls: "dm-noise", label: "√(1−ᾱₜ) (noise)" },
        ],
        x: [0, T],
        y: [0, 1],
        cursor: t,
      });
    }

    // The true reverse kernel at follower 0, step ZOOM_T, jumping back k steps: shading, best single Gaussian, gap.
    function kernel(k) {
      const xt = at(fwd[ZOOM_T], followers[0]);
      const parts = DM.trueReverse(data, sch, ZOOM_T, xt, ZOOM_T - k);
      const { mean, cov } = DM.mixtureMoments(parts);
      const gap = DM.gaussianGap(parts, 1500);
      const sd = Math.sqrt((cov[0] + cov[2]) / 2);
      return { xt, parts, mean, cov, gap, sd };
    }
    const kernels = new Map();
    const kernelAt = (k) => {
      if (!kernels.has(k)) kernels.set(k, kernel(k));
      return kernels.get(k);
    };

    function drawKernel(k) {
      const K = kernelAt(k);
      const r = Math.max(0.15, 3.2 * K.sd);
      side
        .view(r, K.mean[0], K.mean[1])
        .shade((x, y) => DM.mixturePdf(K.parts, x, y), 56)
        .cloud("pts", null)
        .rings([
          { c: K.mean, r: K.sd, cls: "dm-true" },
          { c: K.mean, r: 2 * K.sd, cls: "dm-true is-dashed" },
        ])
        .marks([{ c: K.xt, label: "xₜ", cls: "dm-ink is-hollow", r: 4 }])
        .paths([])
        .arrows([]);
      side.title(k === 1 ? `q(x${sub(ZOOM_T - 1)} | x${sub(ZOOM_T)}), zoomed in` : `q(x${sub(ZOOM_T - k)} | x${sub(ZOOM_T)}), zoomed in`);
      side.corner(`width ±${fmt(r, 2)}`);
      return K;
    }

    /* -------------------------------------------- render */

    function render(step, t) {
      main.view(3).shade(null).rings([]).arrows([]).marks([]).paths([]).corner("");
      main.cloud("fresh", null).cloud("model", null);
      side.corner("");

      if (step === "data") {
        main.title("the data: x₀").cloud("pts", x0, "dm-data");
        const m = DM.moments(x0);
        strip(`${N} points from the Swiss roll · mean ${pt(m.mean)} · spread ${pt(m.sd)} · every point is just a pair of numbers`);
        layout({ main: [0, 0] });
        return;
      }

      if (step === "step") {
        // zoom on one point and follow its first steps
        const i = followers[0];
        const steps = 1 + Math.round(t * 9);
        const p0 = at(fwd[0], i);
        let ext = 0.12;
        for (let k = 0; k <= 10; k++) ext = Math.max(ext, Math.abs(fwd[k][2 * i] - p0[0]), Math.abs(fwd[k][2 * i + 1] - p0[1]));
        main.view(1.25 * ext, p0[0], p0[1]).title(`one point, ${steps} step${steps > 1 ? "s" : ""} (zoomed in)`);
        main.cloud("pts", fwd[steps], "dm-data is-faint", 2.2);
        const trail = [];
        for (let k = 0; k <= steps; k++) trail.push(at(fwd[k], i));
        main.paths([{ pts: trail, cls: "dm-ink" }]).marks([
          { c: p0, label: "x₀", cls: "dm-data" },
          { c: at(fwd[steps], i), label: `x${sub(steps)}`, cls: "dm-ink is-hollow", r: 4 },
        ]);
        main.corner(`box width ${fmt(2.5 * ext, 2)}`);
        const p1 = at(fwd[1], i);
        const a = Math.sqrt(1 - sch.beta[1]);
        const b = Math.sqrt(sch.beta[1]);
        const eps = [(p1[0] - a * p0[0]) / b, (p1[1] - a * p0[1]) / b];
        strip(`x₁ = √(1 − β₁)·x₀ + √β₁·ε with β₁ = ${fmt(sch.beta[1], 4)}: ${fmt(a, 4)}·${pt(p0, 3)} + ${fmt(b, 4)}·${pt(eps)} = ${pt(p1, 3)}`);
        layout({ main: [0, 0] });
        return;
      }

      if (step === "forward") {
        const k = Math.round(t * T);
        main.title(`x${sub(k)}: after ${k} step${k === 1 ? "" : "s"}`).cloud("pts", fwd[k], "dm-data");
        main.paths(pathsUpTo(fwd, Math.max(0, k - 25), k));
        fadeChart(k);
        const m = DM.moments(fwd[k]);
        strip(
          `t = ${k} · β_t = ${fmt(sch.beta[Math.max(1, k)], 4)} · ᾱ_t = ${fmt(sch.alphaBar[k], 4)} · cloud spread ${pt(m.sd)} · mean ${pt(m.mean)}`
        );
        layout({ main: [0, 0], fade: beside(470, 120) });
        return;
      }

      if (step === "noise") {
        main.title(`x${sub(T)}: after all ${T} steps`).cloud("pts", fwd[T], "dm-data");
        main.cloud("fresh", t > 0.3 ? fresh : null, "dm-noise is-faint").rings(gaussRings);
        const m = DM.moments(fwd[T]);
        const d = DM.sliced(fwd[T], fresh);
        const dd = DM.sliced(fresh, DM.gaussian(N, 78));
        strip(
          `mean ${pt(m.mean)} · spread ${pt(m.sd)} · distance to a fresh N(0, I) sample ${fmt(d, 3)} (two fresh samples: ${fmt(dd, 3)}) · rings at 1 and 2`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "small" || step === "big") {
        const k = step === "small" ? 1 : Math.max(1, Math.round(1 + t * (ZOOM_T - 1)));
        main.title(`x${sub(ZOOM_T)}`).cloud("pts", fwd[ZOOM_T], "dm-data is-faint");
        const K = drawKernel(k);
        main.marks([{ c: K.xt, label: "xₜ", cls: "dm-ink is-hollow", r: 5 }]);
        main.rings([{ c: K.mean, r: Math.max(0.03, 2 * K.sd), cls: "dm-true" }]);
        strip(
          `step back ${k} from t = ${ZOOM_T} · spread of the true answer ${fmt(K.sd, 3)} · how far from one Gaussian (KL to the best fit): ${fmt(K.gap, 3)} nats`
        );
        layout({ main: [0, 0], side: beside(450, 40, { scale: 0.8 }) });
        return;
      }

      if (step === "learn") {
        const k = Math.max(1, Math.round(T - t * (T - 5)));
        main.title(`what the network says at t = ${k}`).cloud("pts", fwd[k], "dm-data is-faint");
        // a grid of x_t: arrow from x_t to the predicted mean of x_{t−1}, drawn longer so it can be seen
        const grid = [];
        for (let gy = -2.6; gy <= 2.61; gy += 0.4) for (let gx = -2.6; gx <= 2.61; gx += 0.4) grid.push(gx, gy);
        const xs = Float64Array.from(grid);
        const e = model.eps(xs, k);
        const c = sch.beta[k] / Math.sqrt(1 - sch.alphaBar[k]);
        const ia = 1 / Math.sqrt(sch.alpha[k]);
        const moves = [];
        let longest = 0;
        for (let i = 0; i < xs.length; i += 2) {
          const dx = ia * (xs[i] - c * e[i]) - xs[i];
          const dy = ia * (xs[i + 1] - c * e[i + 1]) - xs[i + 1];
          longest = Math.max(longest, Math.hypot(dx, dy));
          moves.push([dx, dy]);
        }
        const scale = 0.35 / longest; // the longest arrow is drawn 0.35 long, so arrows are readable at every step
        const arrows = moves.map(([dx, dy], j) => ({
          a: [xs[2 * j], xs[2 * j + 1]],
          b: [xs[2 * j] + scale * dx, xs[2 * j + 1] + scale * dy],
          cls: "dm-model",
        }));
        main.arrows(arrows).corner(`arrows drawn ${fmt(scale, 0)}× longer`);
        strip(
          `the network takes (x, y, t) and returns where x_{t−1} should be on average · longest real move at t = ${k}: ${fmt(longest, 4)} · β_t = ${fmt(sch.beta[k], 4)}`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "reverse" || step === "compare") {
        if (!rev) {
          main.title("sampling…").cloud("pts", null);
          strip("running the network…");
          layout({ main: [0, 0] });
          return;
        }
        if (step === "reverse") {
          const k = Math.round((1 - t) * T);
          main.title(`sampling: x${sub(k)}`).cloud("pts", rev[k], "dm-model");
          main.paths(pathsUpTo(rev, Math.min(T, k + 25), k));
          const d = DM.sliced(rev[k], refAt(k), 32);
          fit.set({
            series: [{ values: revFit, cls: "dm-model", label: "" }],
            x: [0, T],
            y: [0, Math.max(0.2, ...revFit.map((p) => p[1]))],
            cursor: k,
          });
          strip(`t = ${k} · distance from the sampled cloud to the data noised to the same step: ${fmt(d, 3)}`);
          layout({ main: [0, 0], fit: beside(470, 120) });
          return;
        }
        main.title("samples (red) on top of the data (blue)").cloud("pts", x0, "dm-data is-faint").cloud("model", rev[0], "dm-model is-strong");
        const ref = DM.sample(data, N, 9).xs;
        strip(
          `distance from the samples to the data: ${fmt(DM.sliced(rev[0], ref), 3)} · from one data sample to another: ${fmt(DM.sliced(x0, ref), 3)} · from pure noise to the data: ${fmt(DM.sliced(fresh, ref), 3)}`
        );
        layout({ main: [0, 0] });
      }
    }

    return { render };
  };

  // subscript digits, for labels like x₄₀
  const SUB = "₀₁₂₃₄₅₆₇₈₉";
  function sub(n) {
    return String(n)
      .split("")
      .map((d) => SUB[Number(d)] || d)
      .join("");
  }
  DM.sub = sub;
})();
