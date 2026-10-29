// Part 6 of the diffusion series: one picture with stochastic differential equations (Song et al., 2021). One
// scene: Brownian motion as the limit of smaller and smaller steps, DDPM's chain as the VP SDE, Song and Ermon's
// ladder as the VE SDE, the reverse-time SDE's drift, sampling with it, and predictor–corrector sampling at a range
// of step counts. The network is the one from parts 1–4, read as a score. Every number comes from DM.
(function () {
  "use strict";

  const DM = window.DM;
  const { fmt } = window.TF.view;
  const { plot, chart, at, chunked } = DM.view;
  DM.scenes = DM.scenes || {};

  const N = 600;
  const STEPS = [10, 20, 50, 100, 200];
  const narrow = window.matchMedia("(max-width: 991.98px)");
  const beside = (x, y, opts) => (narrow.matches ? [0, 450, opts] : [x, y, opts]);

  DM.scenes.part6 = function (stage) {
    const { svg, strip } = stage;
    const data = DM.DATASETS.swissroll;
    const sch = DM.schedule("linear", 200);
    const vp = DM.vpSDE();
    const ve = DM.veSDE(0.03, 5);
    const x0 = DM.sample(data, N, 1).xs;
    const chain = DM.forwardChain(x0, sch, 11);
    const vpPath = DM.forwardSDE(x0, vp, 1000, 13);
    const vePath = DM.forwardSDE(x0, ve, 1000, 14);
    const score = DM.vpScore(DM.netModel(DM.loadNet("swissroll-eps"), sch), vp);
    const floor = DM.dataFloor(data, N);
    const toData = (xs) => DM.slicedToData(xs, data);
    const toStep = (xs, t) => DM.slicedToData(xs, DM.noisedData(data, vp.alphaBar(t)));

    const main = plot(svg, { range: 3 });
    const right = plot(svg, { range: 3 });
    const curve = chart(svg, { width: 250, height: 140, xTitle: "number of steps" });
    const layout = DM.layout(svg, () => ({ main, right, curve }));

    /* -------------------------------------------- Brownian motion: the same 1-second walk cut into finer steps */

    const walkers = 6;
    const walkRand = DM.rng(9);
    const fine = 256;
    const incr = Array.from({ length: walkers }, () => Array.from({ length: fine }, () => [walkRand.normal(), walkRand.normal()]));
    // a walk with n steps sums blocks of the fine increments, so all resolutions show the same underlying path
    function walk(w, n) {
      const per = fine / n;
      const pts = [[0, 0]];
      let x = 0;
      let y = 0;
      for (let k = 0; k < n; k++) {
        let dx = 0;
        let dy = 0;
        for (let j = 0; j < per; j++) {
          dx += incr[w][k * per + j][0];
          dy += incr[w][k * per + j][1];
        }
        x += dx / Math.sqrt(fine);
        y += dy / Math.sqrt(fine);
        pts.push([x, y]);
      }
      return pts;
    }
    const ends = (() => {
      const xs = DM.gaussian(N, 31); // the end of a 1-second walk is N(0, I), whatever the step size
      return xs;
    })();

    /* -------------------------------------------- the samplers, in the background */

    const runs = {}; // "em-200" etc. → final cloud; "em-200-frames" for the full run
    const jobs = [];
    jobs.push({ key: "em-200", opts: { n: 200 }, keepFrames: true });
    STEPS.forEach((n) => {
      if (n !== 200) jobs.push({ key: `em-${n}`, opts: { n } });
      jobs.push({ key: `pc-${n}`, opts: { n, corrector: 1, snr: 0.16 } });
    });
    const total = jobs.length;
    function runNext() {
      const job = jobs.shift();
      if (!job) {
        stage.busy(null);
        stage.note(`${N} points · VP SDE with β from 0.1 to 20 · the part 4 network as the score`);
        return;
      }
      const s = DM.reverseStepper(score, vp, DM.gaussian(N, 2), job.opts);
      stage.busy(`sampling with the reverse SDE… ${total - jobs.length} of ${total}`);
      chunked(
        () => s.next(10),
        null,
        () => {
          runs[job.key] = s.frames[s.frames.length - 1];
          runs[`${job.key}-evals`] = s.evals;
          if (job.keepFrames) runs[`${job.key}-frames`] = s;
          stage.redraw();
          runNext();
        }
      );
    }
    runNext();

    /* -------------------------------------------- pieces */

    const grid = (() => {
      const g = [];
      for (let y = -2.7; y <= 2.71; y += 0.3) for (let x = -2.7; x <= 2.71; x += 0.3) g.push(x, y);
      return Float64Array.from(g);
    })();

    function reset() {
      [main, right].forEach((p) => p.view(3).shade(null).rings([]).arrows([]).marks([]).paths([]).corner("").cloud("b", null).cloud("pts", null));
    }

    /* -------------------------------------------- render */

    function render(step, t) {
      reset();

      if (step === "walk") {
        const n = 2 ** Math.round(1 + t * 7); // 2 … 256 steps
        main.title(`a 1-second random walk in ${n} steps`);
        main.cloud("b", ends, "dm-noise is-faint");
        main.paths(Array.from({ length: walkers }, (_, w) => ({ pts: walk(w, n), cls: "dm-ink" })));
        main.rings([{ c: [0, 0], r: 1, cls: "dm-ink is-dashed" }]);
        strip(
          `${n} steps of √(1/${n})·z each · each walk ends at N(0, I) whatever the number of steps (grey: ${N} endpoints) · as the steps shrink, the walk becomes Brownian motion`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "vp") {
        const k = Math.round(t * 200);
        const tt = k / 200;
        const sdeCloud = vpPath[Math.round(tt * 1000)];
        main
          .title(`t = ${fmt(tt, 2)}: 200-step chain (blue), SDE in 1,000 steps (orange)`)
          .cloud("pts", chain[k], "dm-data")
          .cloud("b", sdeCloud, "dm-x0");
        strip(
          `dx = −½β(t)·x dt + √β(t) dw with β(t) = ${fmt(vp.beta(tt), 2)} · distance to the exact noised data: chain ${fmt(toStep(chain[k], tt), 3)}, SDE ${fmt(toStep(sdeCloud, tt), 3)} (${N} real noised points: about 0.05)`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "ve") {
        const tt = Math.round(t * 100) / 100;
        const j = Math.round(tt * 1000);
        const sv = ve.sigma(tt);
        main.title(`VP at t = ${fmt(tt, 2)}`).cloud("pts", vpPath[j], "dm-data");
        right
          .view(Math.max(3, 3 * sv))
          .title(`VE at t = ${fmt(tt, 2)}`)
          .cloud("pts", vePath[j], "dm-model");
        const m1 = DM.moments(vpPath[j]);
        const m2 = DM.moments(vePath[j]);
        right.corner(`box ±${fmt(Math.max(3, 3 * sv), 1)}`);
        strip(
          `spread: VP ${fmt((m1.sd[0] + m1.sd[1]) / 2, 2)} (stays near 1) · VE ${fmt((m2.sd[0] + m2.sd[1]) / 2, 2)} (σ(t) = ${fmt(sv, 2)} of noise added, nothing shrunk)`
        );
        layout({ main: [0, 0, { scale: 0.75 }], right: [320, 0, { scale: 0.75 }] });
        return;
      }

      if (step === "drift") {
        const tt = Math.max(0.02, 1 - t * 0.98);
        const s = score(Float64Array.from(grid), tt);
        const b = vp.beta(tt);
        // the reverse drift, as a velocity backwards in time: −[f − g² s] = ½β x + β s
        const v = new Float64Array(grid.length);
        let longest = 0;
        for (let i = 0; i < grid.length; i++) {
          v[i] = 0.5 * b * grid[i] + b * s[i];
        }
        for (let i = 0; i < grid.length; i += 2) longest = Math.max(longest, Math.hypot(v[i], v[i + 1]));
        const scale = 0.28 / longest;
        main
          .title(`the reverse drift at t = ${fmt(tt, 2)}`)
          .cloud("b", DM.qSample(x0, sch, Math.max(1, Math.round(tt * 200)), 5).xt, "dm-data is-faint");
        main.arrows(
          Array.from({ length: grid.length / 2 }, (_, k) => ({
            a: [grid[2 * k], grid[2 * k + 1]],
            b: [grid[2 * k] + scale * v[2 * k], grid[2 * k + 1] + scale * v[2 * k + 1]],
            cls: "dm-model",
          }))
        );
        main.corner("arrows scaled to fit");
        strip(
          `reverse time: dx = [f(x, t) − g(t)²·∇ log p_t(x)] dt + g(t) dw̄ · here f = −½β x and g² = β = ${fmt(b, 2)} · the arrows are ½β·x + β·s(x, t), the pull back towards the data`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "reverse") {
        const run = runs["em-200-frames"];
        if (!run) {
          main.title("sampling…");
          strip("sampling with the reverse SDE…");
          layout({ main: [0, 0] });
          return;
        }
        const k = Math.round(t * 200);
        const tt = run.times[k];
        main.title(`reverse SDE, t = ${fmt(tt, 2)}`).cloud("pts", run.frames[k], "dm-model");
        main.paths([5, 120, 260, 400, 530].map((i) => ({ pts: run.frames.slice(Math.max(0, k - 30), k + 1).map((f) => at(f, i)), cls: "dm-ink" })));
        strip(
          k < 200
            ? `Euler–Maruyama, 200 steps of dt = ${fmt(run.times[0] - run.times[1], 4)} · distance to the exact noised data at this t: ${fmt(toStep(run.frames[k], tt), 3)}`
            : `done · distance to the true spiral ${fmt(toData(run.frames[k]), 3)} (${N} real data points: ${fmt(floor, 3)}, average of 5 draws)`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "pc") {
        const a = runs["em-20"];
        const b = runs["pc-20"];
        if (!a || !b) {
          main.title("sampling…");
          strip("sampling…");
          layout({ main: [0, 0, { scale: 0.75 }], right: [320, 0, { scale: 0.75 }] });
          return;
        }
        main.title("predictor only, 20 steps").cloud("pts", x0, "dm-data is-faint").cloud("b", a, "dm-model is-strong");
        right.title("predictor + 1 corrector, 20 steps").cloud("pts", x0, "dm-data is-faint").cloud("b", b, "dm-x0 is-strong");
        strip(
          `distance to the true spiral: ${fmt(toData(a), 3)} with ${runs["em-20-evals"]} network calls, ${fmt(toData(b), 3)} with ${runs["pc-20-evals"]} · real data: ${fmt(floor, 3)} · corrector: Langevin with r = 0.16`
        );
        layout({ main: [0, 0, { scale: 0.75 }], right: [320, 0, { scale: 0.75 }] });
        return;
      }

      if (step === "steps") {
        const em = STEPS.filter((n) => runs[`em-${n}`]).map((n) => [n, toData(runs[`em-${n}`])]);
        const pc = STEPS.filter((n) => runs[`pc-${n}`]).map((n) => [n, toData(runs[`pc-${n}`])]);
        const top = Math.max(0.1, ...em.map((p) => p[1]), ...pc.map((p) => p[1]));
        curve.title("distance: no corrector (red), corrector (orange)").set({
          series: [
            { values: em, cls: "dm-model" },
            { values: pc, cls: "dm-x0 is-dashed" },
            {
              values: [
                [10, floor],
                [200, floor],
              ],
              cls: "dm-true is-dashed",
              label: "real data",
            },
          ],
          x: [10, 200],
          y: [0, top],
          yTicks: [0, floor, top],
        });
        const pick = STEPS[Math.min(STEPS.length - 1, Math.floor(t * STEPS.length))];
        const cloud = runs[`em-${pick}`];
        if (cloud) main.title(`predictor only, ${pick} steps`).cloud("pts", x0, "dm-data is-faint").cloud("b", cloud, "dm-model is-strong");
        strip(
          em.length < STEPS.length
            ? "sampling…"
            : `predictor only: ${em.map(([n, d]) => `${n} steps ${fmt(d, 3)}`).join(" · ")} · with a corrector: ${pc.map(([n, d]) => fmt(d, 3)).join(", ")}`
        );
        layout({ main: [0, 0, { scale: 0.8 }], curve: beside(400, 100) });
      }
    }

    return { render };
  };
})();
