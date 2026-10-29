// Part 4 of the diffusion series: DDPM. One scene: the three things a network can predict, the bound rewritten
// in terms of the noise, a network trained live in the browser with L_simple, Algorithm 2 sampling, and the
// shipped networks compared (predict ε against predict x₀, flat weights against the bound's weights).
(function () {
  "use strict";

  const DM = window.DM;
  const { h, fmt } = window.TF.view;
  const { plot, chart, at, sub, chunked } = DM.view;
  DM.scenes = DM.scenes || {};

  const N = 800;
  const T = 200;
  const ZT = 40;
  const TRAIN_STEPS = 4000;
  const PREVIEW = 400; // points sampled to show the live network's progress
  const FLOOR = 0.456; // L_simple of the exact model (DM.exactModel) on this data: the lowest any network can reach
  const narrow = window.matchMedia("(max-width: 991.98px)");
  const beside = (x, y, opts) => (narrow.matches ? [0, 450, opts] : [x, y, opts]);
  const pt = (p, d = 2) => `(${fmt(p[0], d)}, ${fmt(p[1], d)})`;

  DM.scenes.part4 = function (stage) {
    const { svg, controls, strip } = stage;
    const data = DM.DATASETS.swissroll;
    const sch = DM.schedule("linear", T);
    const x0s = DM.sample(data, N, 1).xs;
    const floor = DM.dataFloor(data, N);
    const shipped = {
      eps: DM.netModel(DM.loadNet("swissroll-eps"), sch),
      x0: DM.netModel(DM.loadNet("swissroll-x0"), sch),
      vlb: DM.netModel(DM.loadNet("swissroll-vlb"), sch),
    };

    const main = plot(svg, { range: 3 });
    const right = plot(svg, { range: 3 });
    const lossChart = chart(svg, { width: 250, height: 140, xTitle: "training step" });
    const weightChart = chart(svg, { width: 250, height: 140, xTitle: "step t" });
    const layout = DM.layout(svg, () => ({ main, right, lossChart, weightChart }));

    /* -------------------------------------------- sampling the shipped networks (one at a time, in the background) */

    const runs = {}; // name → frames
    const queue = [];
    let running = false;
    function sampleAll() {
      if (running || !queue.length) return;
      running = true;
      const name = queue.shift();
      const stepper = DM.ddpmStepper(shipped[name], sch, DM.gaussian(N, 2), { seed: 42 });
      chunked(
        () => stepper.next(10),
        null,
        () => {
          runs[name] = stepper.frames;
          running = false;
          stage.redraw();
          sampleAll();
        }
      );
    }
    queue.push("eps", "x0", "vlb");
    sampleAll();

    /* -------------------------------------------- live training */

    let net = null;
    let trainer = null;
    let losses = [];
    let preview = null;
    let training = false;
    let target = "eps";
    let cancelPreview = () => {};
    let nextPreview = 500;

    const go = h("button", { type: "button", class: "tf-btn", text: "train" });
    const reset = h("button", { type: "button", class: "tf-btn", text: "reset" });
    const pickTarget = h(
      "select",
      { class: "dm-select", "aria-label": "What the network predicts" },
      h("option", { value: "eps", text: "predict ε" }),
      h("option", { value: "x0", text: "predict x₀" })
    );
    controls.append(go, reset, pickTarget);

    function fresh() {
      net = DM.createNet(7);
      trainer = DM.trainer(net, data, sch, { steps: TRAIN_STEPS, target, batch: 128, seed: 8 });
      losses = [];
      preview = null;
      nextPreview = 500;
      cancelPreview();
    }
    fresh();

    function samplePreview() {
      cancelPreview();
      const snap = DM.netModel({ layers: net.layers, w: Float64Array.from(net.w), target: net.target }, sch);
      const stepper = DM.ddpmStepper(snap, sch, DM.gaussian(PREVIEW, 3), { seed: 4 });
      const stepAt = trainer.opt.step;
      cancelPreview = chunked(
        () => stepper.next(25),
        null,
        () => {
          preview = { xs: stepper.frames[0], step: stepAt };
          stage.redraw();
        }
      );
    }

    function loop() {
      if (!training) return;
      const start = performance.now();
      while (performance.now() - start < 12 && trainer.opt.step < TRAIN_STEPS) losses.push(trainer.step());
      const k = trainer.opt.step;
      if (k >= nextPreview || k >= TRAIN_STEPS) {
        samplePreview();
        nextPreview += 500;
      }
      if (k >= TRAIN_STEPS) {
        training = false;
        go.textContent = "done";
        go.disabled = true;
      }
      stage.redraw();
      if (training) requestAnimationFrame(loop);
    }

    go.addEventListener("click", () => {
      training = !training;
      go.textContent = training ? "pause" : "train";
      if (training) requestAnimationFrame(loop);
      else samplePreview();
    });
    reset.addEventListener("click", () => {
      training = false;
      go.textContent = "train";
      go.disabled = false;
      fresh();
      stage.redraw();
    });
    pickTarget.addEventListener("change", () => {
      target = pickTarget.value;
      reset.click();
    });

    const smooth = (arr, every = 25) => {
      const out = [];
      for (let i = every; i <= arr.length; i += every) {
        let s = 0;
        for (let j = i - every; j < i; j++) s += arr[j];
        out.push([i, s / every]);
      }
      return out;
    };

    /* -------------------------------------------- the example point */

    const who = 17;
    const ex = (() => {
      const x0 = at(x0s, who);
      const rand = DM.rng(5);
      const eps = [rand.normal(), rand.normal()];
      const a = Math.sqrt(sch.alphaBar[ZT]);
      const b = Math.sqrt(1 - sch.alphaBar[ZT]);
      const xt = [a * x0[0] + b * eps[0], a * x0[1] + b * eps[1]];
      const post = DM.posterior(x0, xt, sch, ZT);
      return { x0, eps, xt, a, b, post };
    })();

    /* -------------------------------------------- render */

    function setControls(step) {
      const live = step === "train";
      [go, reset, pickTarget].forEach((el) => (el.hidden = !live));
    }

    function render(step, t) {
      setControls(step);
      [main, right].forEach((p) => p.view(3).shade(null).rings([]).arrows([]).marks([]).paths([]).corner("").cloud("b", null));

      if (step === "three") {
        const { x0, eps, xt, a, b, post } = ex;
        const base = [a * x0[0], a * x0[1]];
        main.view(1.4, xt[0], xt[1] - 0.4);
        main.title(`one training example at t = ${ZT}`).cloud("pts", x0s, "dm-data is-faint");
        main.paths([{ pts: [x0, base], cls: "dm-ink is-faint" }]);
        main.arrows([{ a: base, b: xt, cls: "dm-model" }]);
        main.rings([{ c: base, r: b, cls: "dm-ink is-dashed" }]);
        main.marks([
          { c: x0, label: "x₀", cls: "dm-x0" },
          { c: base, label: "√ᾱₜ x₀", cls: "dm-ink", r: 3 },
          { c: xt, label: "xₜ", cls: "dm-ink is-hollow" },
          { c: post.mean, label: "μ̃", cls: "dm-true", r: 3, dy: 16 },
        ]);
        strip(
          `x₀ = ${pt(x0)} · ε = ${pt(eps)} · xₜ = ${fmt(a, 3)}·x₀ + ${fmt(b, 3)}·ε = ${pt(xt)} · the red arrow is √(1 − ᾱₜ)·ε · μ̃ = ${pt(post.mean)}`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "weights") {
        const lam = [];
        for (let k = 1; k <= T; k++) lam.push([k, sch.beta[k] / (2 * sch.alpha[k] * (1 - sch.alphaBar[k]))]);
        const mean = lam.reduce((s, p) => s + p[1], 0) / T;
        weightChart.title("weight on ‖ε − εθ‖² per step").set({
          series: [
            { values: lam.map(([k, v]) => [k, v / mean]), cls: "dm-true", label: "bound" },
            {
              values: [
                [1, 1],
                [T, 1],
              ],
              cls: "dm-model is-dashed",
              label: "L_simple",
            },
          ],
          x: [0, T],
          y: [0, 12],
          yTicks: [0, 1, 12],
        });
        const k = Math.max(1, Math.round(t * T));
        main.title(`x${sub(k)}`).cloud("pts", DM.qSample(x0s, sch, k, 5).xt, "dm-data");
        strip(
          `the bound weighs step t by β_t / (2α_t(1 − ᾱ_t)), here rescaled to average 1: from ${fmt(lam[0][1] / mean, 2)} at t = 1 down to ${fmt(Math.min(...lam.map((p) => p[1])) / mean, 2)} · L_simple uses 1 everywhere`
        );
        layout({ main: [0, 0, { scale: 0.8 }], weightChart: beside(400, 100) });
        return;
      }

      if (step === "train") {
        const k = trainer.opt.step;
        main.title(preview ? `samples after ${preview.step} training steps` : "the data (press train)");
        if (preview) main.cloud("pts", x0s, "dm-data is-faint").cloud("b", preview.xs, "dm-model is-strong", 2.4);
        else main.cloud("pts", x0s, "dm-data");
        const curve = smooth(losses);
        lossChart.title(`L_simple while training (${target === "eps" ? "ε" : "x₀"} target)`).set({
          series: [
            { values: curve, cls: "dm-model" },
            ...(target === "eps"
              ? [
                  {
                    values: [
                      [0, FLOOR],
                      [TRAIN_STEPS, FLOOR],
                    ],
                    cls: "dm-true is-dashed",
                    label: "floor",
                  },
                ]
              : []),
          ],
          x: [0, TRAIN_STEPS],
          y: [0, target === "eps" ? 1.2 : 1],
          yTicks: target === "eps" ? [0, FLOOR, 1.2] : [0, 1],
        });
        const last = curve.length ? curve[curve.length - 1][1] : null;
        const d = preview ? DM.slicedToData(preview.xs, data) : null;
        strip(
          `step ${k} of ${TRAIN_STEPS} · batch 128 · loss ${last == null ? "–" : fmt(last, 3)}` +
            (target === "eps" ? ` (best possible ${FLOOR})` : "") +
            (d == null ? "" : ` · samples' distance to the data ${fmt(d, 3)}`)
        );
        layout({ main: [0, 0, { scale: 0.8 }], lossChart: beside(400, 100) });
        return;
      }

      if (step === "sample") {
        const frames = runs.eps;
        if (!frames) {
          main.title("sampling…").cloud("pts", null);
          strip("running the shipped network…");
          layout({ main: [0, 0] });
          return;
        }
        const k = Math.max(1, Math.round((1 - t) * T));
        const e = shipped.eps.eps(Float64Array.from(at(frames[k], 0)), k);
        main.title(`Algorithm 2: x${sub(k)} → x${sub(k - 1)}`).cloud("pts", frames[k - 1], "dm-model");
        const p = at(frames[k], 0);
        const q = at(frames[k - 1], 0);
        main.marks([
          { c: p, label: `x${sub(k)}`, cls: "dm-ink is-hollow" },
          { c: q, label: "", cls: "dm-ink", r: 3 },
        ]);
        strip(
          `one point: x_${k - 1} = (x_${k} − ${fmt(sch.beta[k] / Math.sqrt(1 - sch.alphaBar[k]), 4)}·εθ) / ${fmt(Math.sqrt(sch.alpha[k]), 4)} + ${fmt(k > 1 ? Math.sqrt(sch.beta[k]) : 0, 4)}·z · εθ = ${pt(e)} · ${pt(p, 3)} → ${pt(q, 3)}`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "targets" || step === "simple") {
        const [a, b] = step === "targets" ? ["eps", "x0"] : ["eps", "vlb"];
        const name = { eps: "predict ε, L_simple", x0: "predict x₀", vlb: "predict ε, bound's weights" };
        if (!runs[a] || !runs[b]) {
          main.title("sampling…").cloud("pts", null);
          right.title("").cloud("pts", null);
          strip("running the shipped networks…");
          layout({ main: [0, 0, { scale: 0.75 }], right: [320, 0, { scale: 0.75 }] });
          return;
        }
        main.title(name[a]).cloud("pts", x0s, "dm-data is-faint").cloud("b", runs[a][0], "dm-model is-strong");
        right.title(name[b]).cloud("pts", x0s, "dm-data is-faint").cloud("b", runs[b][0], "dm-x0 is-strong");
        strip(
          `distance of ${N} samples to the true spiral: ${name[a]} ${fmt(DM.slicedToData(runs[a][0], data), 3)} · ${name[b]} ${fmt(DM.slicedToData(runs[b][0], data), 3)} · ${N} real data points: ${fmt(floor, 3)} (average of 5 draws)`
        );
        layout({ main: [0, 0, { scale: 0.75 }], right: [320, 0, { scale: 0.75 }] });
      }
    }

    stage.note(`${N} points · ${T} steps · networks of ${DM.paramCount().toLocaleString("en")} weights`);
    return { render };
  };
})();
