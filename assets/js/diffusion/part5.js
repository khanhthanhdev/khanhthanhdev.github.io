// Part 5 of the diffusion series: scores and Langevin dynamics (Song and Ermon, 2019). One scene on a two-mode
// mixture with weights 70/30: the score field, plain Langevin dynamics and its wrong mode weights, where a learned
// score goes wrong, noise levels that fill the gaps, annealed Langevin dynamics with a trained noise-conditional
// score network, and the link back to DDPM's noise prediction. Every number comes from DM.
(function () {
  "use strict";

  const DM = window.DM;
  const { fmt } = window.TF.view;
  const { plot, chart, at, sub, chunked } = DM.view;
  DM.scenes = DM.scenes || {};

  const N = 500;
  const L = 10;
  const T_LEVEL = 100; // Langevin steps per noise level, as in the paper
  const PLAIN_STEPS = 1000;
  const PLAIN_ALPHA = 0.01;
  const narrow = window.matchMedia("(max-width: 991.98px)");
  const beside = (x, y, opts) => (narrow.matches ? [0, 450, opts] : [x, y, opts]);
  const pct = (v) => `${Math.round(100 * v)}%`;

  DM.scenes.part5 = function (stage) {
    const { svg, strip } = stage;
    const data = DM.DATASETS.twomodes;
    const sch = DM.veSchedule(4, 0.03, L);
    const x0 = DM.sample(data, N, 1).xs;
    const floor = DM.dataFloor(data, N);
    const init = DM.uniform(N, 3, 1);
    const exact = Array.from({ length: L + 1 }, (_, i) => DM.blurred(data, i ? sch.sigma[i] : 0));
    const ncsn = DM.netModel(DM.loadNet("twomodes-ncsn"), sch);
    // the network predicts the noise ε in x̃ = x + σ_i ε; its score is −ε̂ / σ_i
    const netScores = (xs, i) => {
      const e = ncsn.eps(xs, i);
      for (let k = 0; k < e.length; k++) e[k] = -e[k] / sch.sigma[i];
      return e;
    };
    // which mode a point is closer to (the left one carries 70% of the data)
    const leftShare = (xs) => {
      let c = 0;
      const [a, b] = data.means;
      for (let i = 0; i < xs.length; i += 2) if ((xs[i] - a[0]) ** 2 + (xs[i + 1] - a[1]) ** 2 < (xs[i] - b[0]) ** 2 + (xs[i + 1] - b[1]) ** 2) c++;
      return c / (xs.length / 2);
    };

    const main = plot(svg, { range: 3 });
    const right = plot(svg, { range: 3 });
    const share = chart(svg, { width: 250, height: 140 });
    const layout = DM.layout(svg, () => ({ main, right, share }));

    /* -------------------------------------------- the samplers, run in the background one after the other */

    let plain = null;
    let annealed = null;
    let annealedExact = null;
    const jobs = [
      () => {
        const s = DM.langevinStepper((xs) => exact[1].scores(xs), init, { steps: PLAIN_STEPS, alpha: PLAIN_ALPHA, every: 10 });
        return { s, done: () => (plain = s) };
      },
      () => {
        const s = DM.annealedStepper((xs, i) => exact[i].scores(xs), sch, init, { T: T_LEVEL, every: 10 });
        return { s, done: () => (annealedExact = s) };
      },
      () => {
        const s = DM.annealedStepper(netScores, sch, init, { T: T_LEVEL, every: 10 });
        return { s, done: () => (annealed = s) };
      },
    ];
    function runNext() {
      const job = jobs.shift();
      if (!job) {
        stage.busy(null);
        stage.note(`${N} points · two modes, 70% and 30% · ${L} noise levels from ${sch.sigma[1]} to ${sch.sigma[L]}`);
        return;
      }
      const { s, done } = job();
      stage.busy("running Langevin dynamics…");
      chunked(
        () => s.next(40),
        null,
        () => {
          done();
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

    // arrows along a score field: each arrow points along the score; its length grows with the score's size, relative
    // to the field's median size, but is capped, so both the far field (where the score is huge) and the blurred
    // levels (where it is tiny) stay readable
    function field(scores, cls, cap = 0.26) {
      const out = [];
      const sizes = [];
      for (let i = 0; i < grid.length; i += 2) sizes.push(Math.hypot(scores[i], scores[i + 1]));
      const median = sizes.slice().sort((a, b) => a - b)[sizes.length >> 1] || 1;
      for (let i = 0; i < grid.length; i += 2) {
        const g = Math.hypot(scores[i], scores[i + 1]);
        if (g < 1e-12) continue;
        const len = cap * Math.tanh((1.5 * g) / median);
        out.push({ a: [grid[i], grid[i + 1]], b: [grid[i] + (len * scores[i]) / g, grid[i + 1] + (len * scores[i + 1]) / g], cls });
      }
      return out;
    }

    const angle = (a, b) => {
      const c = (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]) || 1);
      return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
    };

    function reset() {
      [main, right].forEach((p) => p.view(3).shade(null).rings([]).arrows([]).marks([]).paths([]).corner("").cloud("b", null).cloud("pts", null));
    }

    function shareChart(frames, every, total, k, title) {
      const v = frames.map((f, j) => [j * every, leftShare(f)]);
      share.title(title).set({
        series: [
          { values: v, cls: "dm-model" },
          {
            values: [
              [0, 0.7],
              [total, 0.7],
            ],
            cls: "dm-true is-dashed",
            label: "70%",
          },
        ],
        x: [0, total],
        y: [0, 1],
        yTicks: [0, 0.7, 1],
        cursor: k,
        xLabel: "Langevin step",
      });
    }

    /* -------------------------------------------- render */

    function render(step, t) {
      reset();

      if (step === "data") {
        main.title("the data: two modes, 70% and 30%").shade(exact[1].pdf, 60).cloud("pts", x0, "dm-data");
        strip(`${N} points · ${pct(leftShare(x0))} of them in the left mode · each mode is a round Gaussian with spread ${data.sd[0]}`);
        layout({ main: [0, 0] });
        return;
      }

      if (step === "score") {
        main
          .title("the score ∇ log p(x)")
          .shade(exact[1].pdf, 60)
          .arrows(field(exact[1].scores(grid), "dm-ink"));
        const p = [0, 0];
        const g = exact[1].score(...p);
        strip(
          `at (0, 0) the score is (${fmt(g[0], 1)}, ${fmt(g[1], 1)}) · far from the data it grows in proportion to the distance · arrows show direction, length capped`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "langevin" || step === "weights") {
        if (!plain) {
          main.title("running…");
          strip("running Langevin dynamics…");
          layout({ main: [0, 0] });
          return;
        }
        const j = step === "weights" ? plain.frames.length - 1 : Math.round(t * (plain.frames.length - 1));
        const k = j * plain.every;
        main.title(`Langevin dynamics, step ${k}`).shade(exact[1].pdf, 60).cloud("pts", plain.frames[j], "dm-model");
        if (step === "langevin") {
          main.paths(
            [3, 40, 77, 150, 260].map((i) => ({
              pts: plain.frames.slice(0, j + 1).map((f) => at(f, i)),
              cls: "dm-ink",
            }))
          );
          strip(`x ← x + (α/2)·∇ log p(x) + √α·z with α = ${PLAIN_ALPHA} · step ${k} of ${PLAIN_STEPS} · started from uniform noise on [−3, 3]²`);
          layout({ main: [0, 0] });
          return;
        }
        shareChart(plain.frames, plain.every, PLAIN_STEPS, PLAIN_STEPS, "share in the left mode");
        strip(
          `after ${PLAIN_STEPS} steps with the exact score: ${pct(leftShare(plain.frames[j]))} in the left mode (should be 70%) · at the start: ${pct(leftShare(init))}`
        );
        layout({ main: [0, 0, { scale: 0.8 }], share: beside(400, 100) });
        return;
      }

      if (step === "learned") {
        const i = 1;
        const truth = exact[i].scores(grid);
        const learned = netScores(Float64Array.from(grid), i);
        // average angle between the two fields in three regions: dense (over 1% of the peak density), thin (down to
        // a millionth of it) and empty
        const sums = [0, 0, 0];
        const counts = [0, 0, 0];
        const top = exact[i].pdf(...data.means[0]);
        for (let k = 0; k < grid.length; k += 2) {
          const a = angle([truth[k], truth[k + 1]], [learned[k], learned[k + 1]]);
          const p = exact[i].pdf(grid[k], grid[k + 1]) / top;
          const r = p > 0.01 ? 0 : p > 1e-6 ? 1 : 2;
          sums[r] += a;
          counts[r]++;
        }
        const avg = (r) => fmt(sums[r] / counts[r], 1);
        main.title(`learned (red) against true (green), σ = ${sch.sigma[i]}`).shade(exact[i].pdf, 60);
        main.arrows([...field(truth, "dm-true is-light"), ...field(learned, "dm-model")]);
        strip(
          `average angle between the learned and true score: ${avg(0)}° where the data is dense, ${avg(1)}° where it is thin, ${avg(2)}° where it is empty`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "noise") {
        const i = Math.max(1, Math.min(L, Math.round(1 + t * (L - 1))));
        main
          .title(`data blurred with σ = ${fmt(sch.sigma[i], 3)}`)
          .shade(exact[i].pdf, 60)
          .arrows(field(exact[i].scores(grid), "dm-ink"));
        const blur = new Float64Array(x0.length);
        const rand = DM.rng(3);
        for (let k = 0; k < x0.length; k++) blur[k] = x0[k] + sch.sigma[i] * rand.normal();
        main.cloud("pts", blur, "dm-data is-faint");
        strip(
          `noise level ${i} of ${L}: x̃ = x + σ·ε with σ = ${fmt(sch.sigma[i], 3)} · the blurred density has no empty regions left once σ is near the gap between the modes`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "annealed") {
        const run = annealed;
        if (!run || !annealedExact) {
          main.title("running…");
          strip("running annealed Langevin dynamics…");
          layout({ main: [0, 0] });
          return;
        }
        const j = Math.round(t * (run.trail.length - 1));
        const { level, xs } = run.trail[j];
        main
          .title(`annealed Langevin, level ${L - level + 1} of ${L}: σ = ${fmt(sch.sigma[level], 3)}`)
          .shade(exact[level].pdf, 60)
          .cloud("pts", xs, "dm-model");
        shareChart(
          run.trail.map((p) => p.xs),
          10,
          L * T_LEVEL,
          j * 10,
          "share in the left mode"
        );
        const fin = run.frames[L];
        strip(
          `step size α = ε·σ²/σ_min² = ${run.alpha(level).toExponential(1)} · now ${pct(leftShare(xs))} in the left mode · at the end: ${pct(leftShare(fin))} with the network, ${pct(leftShare(annealedExact.frames[L]))} with the exact score`
        );
        layout({ main: [0, 0, { scale: 0.8 }], share: beside(400, 100) });
        return;
      }

      if (step === "result") {
        if (!annealed || !plain) {
          strip("running…");
          layout({ main: [0, 0, { scale: 0.75 }], right: [320, 0, { scale: 0.75 }] });
          return;
        }
        const a = plain.frames[plain.frames.length - 1];
        const b = annealed.frames[L];
        main.title("plain Langevin, exact score").cloud("pts", x0, "dm-data is-faint").cloud("b", a, "dm-model is-strong");
        right.title("annealed Langevin, learned score").cloud("pts", x0, "dm-data is-faint").cloud("b", b, "dm-model is-strong");
        strip(
          `left mode: ${pct(leftShare(a))} and ${pct(leftShare(b))} (data: ${pct(leftShare(x0))}) · distance to the true mixture: ${fmt(DM.slicedToData(a, data), 3)} and ${fmt(DM.slicedToData(b, data), 3)} (${N} real data points: ${fmt(floor, 3)}, average of 5 draws)`
        );
        layout({ main: [0, 0, { scale: 0.75 }], right: [320, 0, { scale: 0.75 }] });
        return;
      }

      if (step === "same") {
        // DDPM's network from parts 1–4, read as a score: ∇ log q_t(x) ≈ −ε_θ(x, t) / √(1 − ᾱ_t)
        const vp = DM.schedule("linear", 200);
        const tt = Math.max(2, Math.round(2 + t * 98));
        const net = DM.netModel(DM.loadNet("swissroll-eps"), vp);
        const ex = DM.exactModel(DM.DATASETS.swissroll, vp);
        const e = net.eps(Float64Array.from(grid), tt);
        const b = Math.sqrt(1 - vp.alphaBar[tt]);
        const learned = Float64Array.from(e, (v) => -v / b);
        const truth = new Float64Array(grid.length);
        let ang = 0;
        for (let k = 0; k < grid.length; k += 2) {
          const s = ex.score(grid[k], grid[k + 1], tt);
          truth[k] = s[0];
          truth[k + 1] = s[1];
          ang += angle(s, [learned[k], learned[k + 1]]);
        }
        const ab = vp.alphaBar[tt];
        main.title(`DDPM's network as a score, t = ${tt}`).shade((x, y) => Math.exp(ex.logp(x, y, tt)), 40);
        main.arrows([...field(truth, "dm-true is-light"), ...field(learned, "dm-model")]);
        strip(
          `red: −ε_θ(x, t) / √(1 − ᾱ_t) from the part 4 network · green: the exact score of the noised spiral · average angle between them ${fmt(ang / (grid.length / 2), 1)}° · ᾱ_t = ${fmt(ab, 3)}`
        );
        layout({ main: [0, 0] });
      }
    }

    return { render };
  };
})();
