// Part 7 of the diffusion series: deterministic sampling. One scene: the probability flow ODE next to the reverse
// SDE from the same noise, the two keeping the same distribution at every time, DDIM against DDPM at few steps, the
// same noise giving the same sample at any step count, encoding a point into noise and back, and exact
// log-likelihoods through the ODE checked against the true density. The network is the one from parts 1–4.
(function () {
  "use strict";

  const DM = window.DM;
  const { fmt } = window.TF.view;
  const { plot, chart, at, chunked } = DM.view;
  DM.scenes = DM.scenes || {};

  const N = 600;
  const SS = [5, 10, 20, 50, 100];
  const FOLLOW = [5, 60, 120, 260, 330, 400, 470, 530];
  const narrow = window.matchMedia("(max-width: 991.98px)");
  const beside = (x, y, opts) => (narrow.matches ? [0, 450, opts] : [x, y, opts]);

  DM.scenes.part7 = function (stage) {
    const { svg, strip } = stage;
    const data = DM.DATASETS.swissroll;
    const sch = DM.schedule("linear", 200);
    const vp = DM.vpSDE();
    const net = DM.netModel(DM.loadNet("swissroll-eps"), sch);
    const score = DM.vpScore(net, vp);
    const exact = DM.exactModel(data, sch);
    const x0 = DM.sample(data, N, 1).xs;
    const xT = DM.gaussian(N, 2);
    const floor = DM.dataFloor(data, N);
    const toData = (xs) => DM.slicedToData(xs, data);
    const toStep = (xs, t) => DM.slicedToData(xs, DM.noisedData(data, vp.alphaBar(t)));

    const main = plot(svg, { range: 3 });
    const right = plot(svg, { range: 3 });
    const curve = chart(svg, { width: 250, height: 140 });
    const layout = DM.layout(svg, () => ({ main, right, curve }));

    /* -------------------------------------------- background work, one job after another */

    const R = {};
    const jobs = [];
    const add = (key, make) => jobs.push({ key, make });
    add("ode", () => DM.reverseStepper(score, vp, xT, { n: 200, mode: "ode" }));
    add("sde", () => DM.reverseStepper(score, vp, xT, { n: 200 }));
    SS.forEach((S) => {
      add(`ddim-${S}`, () => DM.ddimStepper(net, sch, xT, { S, eta: 0 }));
      add(`ddpm-${S}`, () => DM.ddimStepper(net, sch, xT, { S, eta: 1 }));
      add(`euler-${S}`, () => DM.reverseStepper(score, vp, xT, { n: S, mode: "ode" }));
    });
    add("ddim-200", () => DM.ddimStepper(net, sch, xT, { S: 200, eta: 0 }));
    add("ddpm-20b", () => DM.ddimStepper(net, sch, xT, { S: 20, eta: 1, seed: 99 }));
    const total = jobs.length;
    // the likelihood of 40 data points through the ODE, against their exact log density
    const testPts = DM.sample(data, 40, 5).xs;
    function runNext() {
      const job = jobs.shift();
      if (!job) {
        const { logp } = DM.odeLogLikelihood(score, vp, testPts, { n: 200 });
        R.like = Array.from(logp, (v, i) => [exact.logp(testPts[2 * i], testPts[2 * i + 1], 1), v]);
        stage.busy(null);
        stage.note(`${N} points · the part 4 network · DDIM and ODE samplers, no retraining`);
        stage.redraw();
        return;
      }
      const s = job.make();
      stage.busy(`sampling… ${total - jobs.length} of ${total}`);
      chunked(
        () => s.next(10),
        null,
        () => {
          R[job.key] = s;
          stage.redraw();
          runNext();
        }
      );
    }
    runNext();
    const last = (key) => R[key] && R[key].frames[R[key].frames.length - 1];

    /* -------------------------------------------- encoding: the default points, or one the reader clicks */

    const encodeIdx = [17, 233, 402, 580, 470, 90, 300, 520];
    let encodeFrom = Float64Array.from(encodeIdx.flatMap((i) => at(x0, i)));
    let encoded = null;
    function encode() {
      const fwd = DM.ddimInvert(net, sch, encodeFrom, 50);
      const back = DM.ddimStepper(net, sch, fwd[fwd.length - 1], { S: 50 });
      while (back.next(100) != null);
      encoded = { fwd, back: back.frames };
    }
    main.onPoint((p) => {
      if (stage.step !== "invert") return;
      encodeFrom = Float64Array.from(p);
      encode();
      stage.redraw();
    });

    /* -------------------------------------------- pieces */

    function reset() {
      [main, right].forEach((p) => p.view(3).shade(null).rings([]).arrows([]).marks([]).paths([]).corner("").cloud("b", null).cloud("pts", null));
    }
    const waiting = () => {
      main.title("sampling…");
      strip("sampling…");
      layout({ main: [0, 0] });
    };
    const meanMove = (a, b) => {
      let s = 0;
      for (let i = 0; i < a.length; i += 2) s += Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1]);
      return s / (a.length / 2);
    };

    /* -------------------------------------------- render */

    function render(step, t) {
      reset();

      if (step === "ode") {
        if (!R.ode || !R.sde) return waiting();
        const k = Math.round(t * 200);
        const tt = R.ode.times[k];
        main.title(`same noise: ODE (black paths), SDE (red paths), t = ${fmt(tt, 2)}`).cloud("pts", R.ode.frames[k], "dm-data is-faint");
        main.paths([
          ...FOLLOW.slice(0, 5).map((i) => ({ pts: R.sde.frames.slice(Math.max(0, k - 40), k + 1).map((f) => at(f, i)), cls: "dm-model is-faint" })),
          ...FOLLOW.slice(0, 5).map((i) => ({ pts: R.ode.frames.slice(0, k + 1).map((f) => at(f, i)), cls: "dm-ink" })),
        ]);
        strip(`dx = [f(x, t) − ½·g(t)²·∇ log p_t(x)] dt, no noise · 200 Euler steps · the cloud is the ODE's · t = ${fmt(tt, 3)}`);
        layout({ main: [0, 0] });
        return;
      }

      if (step === "marginals") {
        if (!R.ode || !R.sde) return waiting();
        const pts = (run) =>
          run.times.filter((_, k) => k % 10 === 0 || k === 200).map((tt, j) => [tt, toStep(run.frames[Math.min(200, j * 10)], tt)]);
        const a = pts(R.ode);
        const b = pts(R.sde);
        const k = Math.round(t * 200);
        curve.title("distance to the noised data: ODE (blue), SDE (red)").set({
          series: [
            { values: a, cls: "dm-data" },
            { values: b, cls: "dm-model is-dashed" },
          ],
          x: [0, 1],
          y: [0, 0.15],
          yTicks: [0, 0.05, 0.15],
          cursor: R.ode.times[k],
          xLabel: "time t",
        });
        main.title(`ODE at t = ${fmt(R.ode.times[k], 2)}`).cloud("pts", R.ode.frames[k], "dm-data");
        strip(
          `distance to the exact noised data at t = ${fmt(R.ode.times[k], 2)}: ODE ${fmt(toStep(R.ode.frames[k], R.ode.times[k]), 3)}, SDE ${fmt(toStep(R.sde.frames[k], R.sde.times[k]), 3)} (${N} real noised points: about 0.05)`
        );
        layout({ main: [0, 0, { scale: 0.8 }], curve: beside(400, 100) });
        return;
      }

      if (step === "ddim") {
        const a = last("ddim-10");
        const b = last("ddpm-10");
        if (!a || !b) return waiting();
        main.title("DDIM (η = 0), 10 steps").cloud("pts", x0, "dm-data is-faint").cloud("b", a, "dm-model is-strong");
        right.title("DDPM (η = 1), 10 steps").cloud("pts", x0, "dm-data is-faint").cloud("b", b, "dm-x0 is-strong");
        strip(
          `distance to the true spiral: DDIM ${fmt(toData(a), 3)} · DDPM ${fmt(toData(b), 3)} · real data ${fmt(floor, 3)} · same network, same starting noise`
        );
        layout({ main: [0, 0, { scale: 0.75 }], right: [320, 0, { scale: 0.75 }] });
        return;
      }

      if (step === "steps") {
        const series = (prefix) => SS.filter((S) => R[`${prefix}-${S}`]).map((S) => [S, toData(last(`${prefix}-${S}`))]);
        const a = series("ddim");
        const b = series("ddpm");
        const c = series("euler");
        curve.title("DDIM (red), DDPM (orange), Euler ODE (black)").set({
          series: [
            { values: a, cls: "dm-model" },
            { values: b, cls: "dm-x0 is-dashed" },
            { values: c, cls: "dm-ink is-dashed" },
            {
              values: [
                [5, floor],
                [100, floor],
              ],
              cls: "dm-true is-dashed",
              label: "real data",
            },
          ],
          x: [5, 100],
          y: [0, 0.35],
          yTicks: [0, floor, 0.35],
          xLabel: "number of steps",
        });
        const S = SS[Math.min(SS.length - 1, Math.floor(t * SS.length))];
        if (last(`ddim-${S}`))
          main
            .title(`DDIM, ${S} steps`)
            .cloud("pts", x0, "dm-data is-faint")
            .cloud("b", last(`ddim-${S}`), "dm-model is-strong");
        strip(
          a.length < SS.length || c.length < SS.length
            ? "sampling…"
            : `DDIM: ${a.map(([s, d]) => `${s} steps ${fmt(d, 3)}`).join(", ")} · DDPM: ${b.map(([, d]) => fmt(d, 3)).join(", ")} · Euler ODE: ${c.map(([, d]) => fmt(d, 3)).join(", ")}`
        );
        layout({ main: [0, 0, { scale: 0.8 }], curve: beside(400, 100) });
        return;
      }

      if (step === "consistent") {
        const runs = [10, 20, 50, 200].map((S) => last(`ddim-${S}`));
        const sto = [last("ddpm-20"), last("ddpm-20b")];
        if (runs.some((r) => !r) || sto.some((r) => !r)) return waiting();
        main.title("same noise, DDIM with 10, 20, 50, 200 steps").cloud("pts", runs[3], "dm-data is-faint");
        main.paths(FOLLOW.map((i) => ({ pts: runs.map((r) => at(r, i)), cls: "dm-model" })));
        main.marks(FOLLOW.map((i) => ({ c: at(runs[3], i), label: "", cls: "dm-model", r: 3 })));
        strip(
          `average distance between the 20-step and 200-step samples from the same noise: DDIM ${fmt(meanMove(runs[1], runs[3]), 3)} · two DDPM runs (20 steps) from the same noise: ${fmt(meanMove(sto[0], sto[1]), 3)} · the spiral's spread is about 1`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "invert") {
        if (!encoded) encode();
        const m = encodeFrom.length / 2;
        main.title("click to encode a point: forward (black) and back (red)").cloud("pts", x0, "dm-data is-faint");
        main.paths([
          ...Array.from({ length: m }, (_, i) => ({ pts: encoded.fwd.map((f) => at(f, i)), cls: "dm-ink" })),
          ...Array.from({ length: m }, (_, i) => ({ pts: encoded.back.map((f) => at(f, i)), cls: "dm-model is-faint" })),
        ]);
        const end = encoded.back[encoded.back.length - 1];
        const enc = encoded.fwd[encoded.fwd.length - 1];
        main.marks([
          ...Array.from({ length: m }, (_, i) => ({ c: at(encodeFrom, i), label: "", cls: "dm-x0", r: 4 })),
          ...Array.from({ length: m }, (_, i) => ({ c: at(enc, i), label: "", cls: "dm-ink is-hollow", r: 3 })),
        ]);
        const sizes = Array.from({ length: m }, (_, i) => Math.hypot(enc[2 * i], enc[2 * i + 1]));
        strip(
          `50 DDIM steps from the point to noise (hollow circles), then 50 back · average distance between where it started and where it came back: ${fmt(meanMove(encodeFrom, end), 3)} · size of the code${m > 1 ? "s" : ""}: ${sizes.map((v) => fmt(v, 2)).join(", ")} (typical noise: about 1.25)`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "likelihood") {
        if (!R.like) return waiting();
        const xs = R.like.map((p) => p[0]);
        const ys = R.like.map((p) => p[1]);
        const lo = Math.floor(Math.min(...xs, ...ys));
        const hi = Math.ceil(Math.max(...xs, ...ys));
        const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
        curve.title("log-likelihood: model (up) against exact (across)").set({
          series: [
            {
              values: [
                [lo, lo],
                [hi, hi],
              ],
              cls: "dm-true is-dashed",
            },
          ],
          marks: R.like.map((p) => ({ at: p, cls: "dm-model" })),
          x: [lo, hi],
          y: [lo, hi],
          yTicks: [lo, hi],
          xLabel: "exact log p(x), nats",
        });
        main.title("40 test points").cloud("pts", x0, "dm-data is-faint").cloud("b", testPts, "dm-model is-strong", 3.2);
        strip(
          `average log-likelihood of the 40 points: model ${fmt(mean(ys), 3)} nats, exact ${fmt(mean(xs), 3)} nats · 200 Euler steps of the ODE, with the divergence by finite differences`
        );
        layout({ main: [0, 0, { scale: 0.8 }], curve: beside(400, 100) });
      }
    }

    return { render };
  };
})();
