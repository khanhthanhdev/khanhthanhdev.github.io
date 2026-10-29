// Part 11 of the diffusion series: the design space of Karras et al. (2022), "EDM". One scene: every model as a
// denoiser and one ODE in σ, straight trajectories, Euler against Heun, where to put the steps (ρ), the network's
// preconditioning, the training noise distribution, and the whole recipe against the samplers of earlier parts.
// Every number comes from DM.
(function () {
  "use strict";

  const DM = window.DM;
  const { fmt } = window.TF.view;
  const { plot, chart, at, chunked } = DM.view;
  DM.scenes = DM.scenes || {};

  const N = 600;
  const NFES = [17, 35, 79];
  const narrow = window.matchMedia("(max-width: 991.98px)");
  const beside = (x, y, opts) => (narrow.matches ? [0, 450, opts] : [x, y, opts]);

  DM.scenes.part11 = function (stage) {
    const { svg, strip } = stage;
    const data = DM.DATASETS.swissroll;
    const sch = DM.schedule("linear", 200);
    const exactD = DM.exactDenoiser(data);
    const ddpmNet = DM.netModel(DM.loadNet("swissroll-eps"), sch);
    const vpD = DM.vpDenoiser(ddpmNet);
    const edmD = DM.edmDenoiser(DM.loadNet("swissroll-edm"), 1);
    const x0 = DM.sample(data, N, 1).xs;
    const floor = DM.dataFloor(data, N);
    const toData = (xs) => DM.slicedToData(xs, data);

    const main = plot(svg, { range: 3 });
    const right = plot(svg, { range: 3 });
    const curve = chart(svg, { width: 250, height: 140 });
    const layout = DM.layout(svg, () => ({ main, right, curve }));

    /* -------------------------------------------- background work */

    const R = {};
    const jobs = [];
    const noise = DM.gaussian(N, 2);
    // fine trajectories with the exact denoiser, from σ = 5, for the straightness step
    const fewNoise = DM.gaussian(40, 3);
    jobs.push({ key: "paths", make: () => DM.edmStepper(exactD, DM.edmSigmas(200, { sigmaMax: 5 }), fewNoise, { solver: "heun" }) });
    // truncation error against a fine solution, exact denoiser, 200 points
    const errNoise = DM.gaussian(200, 4);
    jobs.push({ key: "ref", make: () => DM.edmStepper(exactD, DM.edmSigmas(256), errNoise, { solver: "heun" }) });
    [8, 16, 32, 64].forEach((nfe) => {
      jobs.push({ key: `euler7-${nfe}`, make: () => DM.edmStepper(exactD, DM.edmSigmas(nfe), errNoise, { solver: "euler" }) });
      const h = Math.round((nfe + 1) / 2);
      [1, 3, 7].forEach((rho) =>
        jobs.push({ key: `heun${rho}-${nfe}`, make: () => DM.edmStepper(exactD, DM.edmSigmas(h, { rho }), errNoise, { solver: "heun" }) })
      );
    });
    // the networks: DDIM (part 7) against EDM's sampler with the DDPM network and with the EDM-trained network
    NFES.forEach((nfe) => {
      const h = Math.round((nfe + 1) / 2);
      jobs.push({ key: `ddim-${nfe}`, make: () => DM.ddimStepper(ddpmNet, sch, noise, { S: nfe }) });
      jobs.push({ key: `vp-${nfe}`, make: () => DM.edmStepper(vpD, DM.edmSigmas(h, { sigmaMin: 0.03 }), noise, { solver: "heun" }) });
      jobs.push({ key: `edm-${nfe}`, make: () => DM.edmStepper(edmD, DM.edmSigmas(h), noise, { solver: "heun" }) });
    });
    const total = jobs.length;
    function runNext() {
      const job = jobs.shift();
      if (!job) {
        stage.busy(null);
        stage.note(`${N} points · the exact denoiser, the part 4 network, and a network trained with EDM's recipe`);
        return;
      }
      const st = job.make();
      stage.busy(`solving… ${total - jobs.length} of ${total}`);
      chunked(
        () => st.next(4),
        null,
        () => {
          R[job.key] = st;
          stage.redraw();
          runNext();
        }
      );
    }
    runNext();
    const last = (k) => R[k] && R[k].frames[R[k].frames.length - 1];
    const err = (k) => {
      const a = last(k);
      const b = last("ref");
      if (!a || !b) return null;
      let e = 0;
      for (let i = 0; i < a.length; i += 2) e += Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1]);
      return e / (a.length / 2);
    };

    /* -------------------------------------------- pieces */

    function reset() {
      [main, right].forEach((p) => p.view(3).shade(null).rings([]).arrows([]).marks([]).paths([]).corner("").cloud("b", null).cloud("pts", null));
    }
    const waiting = () => {
      main.title("solving…");
      strip("solving…");
      layout({ main: [0, 0] });
    };
    // path length over straight-line distance, averaged over the trajectories, with each frame scaled by scale(σ)
    function bend(run, scale) {
      let r = 0;
      const n = run.frames[0].length / 2;
      for (let i = 0; i < n; i++) {
        let L = 0;
        for (let k = 1; k < run.frames.length; k++) {
          const a = run.frames[k - 1];
          const b = run.frames[k];
          const ca = scale(run.sigmas[k - 1]);
          const cb = scale(run.sigmas[k]);
          L += Math.hypot(b[2 * i] * cb - a[2 * i] * ca, b[2 * i + 1] * cb - a[2 * i + 1] * ca);
        }
        const f = run.frames[0];
        const e = run.frames[run.frames.length - 1];
        const c0 = scale(run.sigmas[0]);
        r += L / Math.hypot(e[2 * i] - f[2 * i] * c0, e[2 * i + 1] - f[2 * i + 1] * c0);
      }
      return r / n;
    }

    /* -------------------------------------------- render */

    function render(step, t) {
      reset();

      if (step === "denoiser") {
        const sigma = Math.exp(Math.log(5) - t * (Math.log(5) - Math.log(0.05)));
        const rand = DM.rng(5);
        const xs = Float64Array.from(x0.subarray(0, 400), (v) => v + sigma * rand.normal());
        const d = exactD(xs, sigma);
        main
          .view(Math.max(3, 2.2 * sigma))
          .title(`x = y + σ·n with σ = ${fmt(sigma, 2)}`)
          .cloud("pts", xs, "dm-data is-faint");
        main.arrows(Array.from({ length: 40 }, (_, i) => ({ a: at(xs, i * 5), b: at(d, i * 5), cls: "dm-model is-light" })));
        right.title("D(x; σ): the exact denoiser's answers").cloud("pts", x0, "dm-data is-faint").cloud("b", d, "dm-model is-strong");
        strip(
          `every model in this series is, underneath, a denoiser D(x; σ) ≈ E[y | x] · the ODE is dx/dσ = (x − D(x; σ))/σ · arrows: from noisy points to the denoiser's answer`
        );
        layout({ main: [0, 0, { scale: 0.75 }], right: [320, 0, { scale: 0.75 }] });
        return;
      }

      if (step === "straight") {
        const run = R.paths;
        if (!run) return waiting();
        const vp = (sg) => 1 / Math.sqrt(1 + sg * sg);
        const paths = (scale) =>
          Array.from({ length: 40 }, (_, i) => ({
            pts: run.frames.map((f, k) => [f[2 * i] * scale(run.sigmas[k]), f[2 * i + 1] * scale(run.sigmas[k])]),
            cls: "dm-ink",
          }));
        main.title("VP coordinates: x/√(1 + σ²)").cloud("pts", x0, "dm-data is-faint").paths(paths(vp));
        right
          .view(12)
          .title("EDM coordinates: x itself")
          .cloud("pts", x0, "dm-data is-faint")
          .paths(paths(() => 1));
        right.corner("box ±12");
        strip(
          `the same 40 ODE paths from σ = 5 to 0 · length over straight-line distance: ${fmt(bend(run, vp), 3)} in VP coordinates, ${fmt(
            bend(run, () => 1),
            3
          )} in EDM's · in EDM's, all the bending is at the very end`
        );
        layout({ main: [0, 0, { scale: 0.75 }], right: [320, 0, { scale: 0.75 }] });
        return;
      }

      if (step === "heun" || step === "rho") {
        const nfes = [8, 16, 32, 64];
        const ser = (key) => nfes.filter((n) => err(`${key}-${n}`) != null).map((n) => [n, err(`${key}-${n}`)]);
        if (step === "heun") {
          const e7 = ser("euler7");
          const h7 = ser("heun7");
          curve.title("error: Euler (red), Heun (blue)").set({
            series: [
              { values: e7, cls: "dm-model" },
              { values: h7, cls: "dm-data" },
            ],
            x: [8, 64],
            y: [0.005, 2],
            yLog: true,
            yTicks: [0.01, 0.1, 1],
            xLabel: "denoiser calls",
          });
          main.title("Euler: one slope per step; Heun: the average of two").cloud("pts", x0, "dm-data is-faint");
          if (last("heun7-32")) main.cloud("b", last("heun7-32"), "dm-model is-strong");
          strip(
            e7.length < 4 || h7.length < 4
              ? "solving…"
              : `average distance from the exact ODE solution, by denoiser calls: Euler ${e7.map(([n, e]) => `${n}: ${fmt(e, 3)}`).join(", ")} · Heun ${h7.map(([n, e]) => `${n + 1}: ${fmt(e, 3)}`).join(", ")} · ρ = 7, exact denoiser`
          );
          layout({ main: [0, 0, { scale: 0.8 }], curve: beside(400, 100) });
          return;
        }
        const rhos = [1, 3, 7];
        const pick = rhos[Math.min(2, Math.floor(t * 3))];
        const sig = DM.edmSigmas(18, { rho: pick }).slice(0, 18);
        curve.title(`where 18 steps go with ρ = ${pick} (σ, log scale)`).set({
          series: [{ values: sig.map((sg, i) => [i, sg]), cls: "dm-ink" }],
          marks: sig.map((sg, i) => ({ at: [i, sg], cls: "dm-data" })),
          x: [0, 17],
          y: [0.002, 80],
          yLog: true,
          yTicks: [0.01, 1, 80],
          xLabel: "step",
        });
        const rows = rhos.map((r) => ser(`heun${r}`));
        strip(
          rows.some((r) => r.length < 4)
            ? "solving…"
            : `Heun's error by ρ at 17 / 33 / 65 calls: ${rhos
                .map(
                  (r, k) =>
                    `ρ = ${r}: ${rows[k]
                      .slice(1)
                      .map(([, e]) => fmt(e, 3))
                      .join(" / ")}`
                )
                .join(" · ")}`
        );
        main.title(`ρ = ${pick}, 17 calls`).cloud("pts", x0, "dm-data is-faint");
        if (last(`heun${pick}-16`)) main.cloud("b", last(`heun${pick}-16`), "dm-model is-strong");
        layout({ main: [0, 0, { scale: 0.8 }], curve: beside(400, 100) });
        return;
      }

      if (step === "precond") {
        const xs = [];
        for (let l = -4; l <= 4.4; l += 0.1) xs.push(l);
        const c = (f) => xs.map((l) => [l, f(DM.edmCoef(Math.exp(l), 1))]);
        curve.title("c_skip blue, c_out red, c_in green").set({
          series: [
            { values: c((k) => k.skip), cls: "dm-data" },
            { values: c((k) => k.out), cls: "dm-model" },
            { values: c((k) => k.in), cls: "dm-true" },
          ],
          x: [-4, 4.4],
          y: [0, 1.05],
          yTicks: [0, 1],
          xLabel: "ln σ",
        });
        const k = DM.edmCoef(1, 1);
        strip(
          `D(x; σ) = c_skip·x + c_out·F(c_in·x; c_noise) · at σ = 1: c_skip ${fmt(k.skip, 2)}, c_out ${fmt(k.out, 2)}, c_in ${fmt(k.in, 2)} · the network's input and its training target both have unit variance at every σ`
        );
        main.title("the data, spread σ_data ≈ 1").cloud("pts", x0, "dm-data");
        layout({ main: [0, 0, { scale: 0.8 }], curve: beside(400, 100) });
        return;
      }

      if (step === "noise") {
        // densities over ln σ: EDM's log-normal, and DDPM's uniform t mapped to σ
        const xs = [];
        for (let l = -7; l <= 5.2; l += 0.1) xs.push(l);
        const lognormal = xs.map((l) => [l, Math.exp(-((l - DM.EDM.pMean) ** 2) / (2 * DM.EDM.pStd ** 2)) / (DM.EDM.pStd * Math.sqrt(2 * Math.PI))]);
        // uniform t on [1/200, 1]: density of ln σ is |dt/d ln σ| / (1 − 1/200)
        const vpDens = xs.map((l) => {
          const sg = Math.exp(l);
          const h = 1e-3;
          const dt = (DM.vpTime(sg * Math.exp(h)) - DM.vpTime(sg * Math.exp(-h))) / (2 * h);
          const tt = DM.vpTime(sg);
          return [l, tt < 0.005 || tt > 1 ? 0 : dt / 0.995];
        });
        curve.title("training σ: EDM (red), DDPM (blue)").set({
          series: [
            { values: lognormal, cls: "dm-model" },
            { values: vpDens, cls: "dm-data is-dashed" },
          ],
          x: [-7, 5.2],
          y: [0, 0.45],
          yTicks: [0, 0.4],
          xLabel: "ln σ",
        });
        const sigma = Math.exp(DM.EDM.pMean + DM.EDM.pStd * (2 * t - 1) * 2);
        const rand = DM.rng(6);
        main
          .view(Math.max(3, 2.2 * sigma))
          .title(`training example at σ = ${fmt(sigma, 2)}`)
          .cloud(
            "pts",
            Float64Array.from(x0, (v) => v + sigma * rand.normal()),
            "dm-data"
          );
        strip(
          `EDM draws ln σ ~ N(−1.2, 1.2²): two thirds of training at σ between 0.09 and 1 (one standard deviation either side) · DDPM's uniform t spends much more of its training at very large σ, where the answer is nearly the data's mean`
        );
        layout({ main: [0, 0, { scale: 0.8 }], curve: beside(400, 100) });
        return;
      }

      if (step === "result") {
        const have = NFES.every((n) => last(`ddim-${n}`) && last(`vp-${n}`) && last(`edm-${n}`));
        if (!have) return waiting();
        const ser = (k) => NFES.map((n) => [n, toData(last(`${k}-${n}`))]);
        curve.title("DDIM black, DDPM+Heun red, EDM blue").set({
          series: [
            { values: ser("ddim"), cls: "dm-ink is-dashed" },
            { values: ser("vp"), cls: "dm-model" },
            { values: ser("edm"), cls: "dm-data" },
            {
              values: [
                [17, floor],
                [79, floor],
              ],
              cls: "dm-true is-dashed",
              label: "real data",
            },
          ],
          x: [17, 79],
          y: [0, 0.15],
          yTicks: [0, floor, 0.15],
          xLabel: "network calls",
        });
        const nfe = NFES[Math.min(NFES.length - 1, Math.floor(t * NFES.length))];
        main
          .title(`EDM network and sampler, ${nfe} calls`)
          .cloud("pts", x0, "dm-data is-faint")
          .cloud("b", last(`edm-${nfe}`), "dm-data is-strong");
        strip(
          `at 17 / 35 / 79 network calls · DDIM ${ser("ddim")
            .map(([, d]) => fmt(d, 3))
            .join(" / ")} · DDPM network with EDM's sampler ${ser("vp")
            .map(([, d]) => fmt(d, 3))
            .join(" / ")} · EDM network and sampler ${ser("edm")
            .map(([, d]) => fmt(d, 3))
            .join(" / ")} · real data ${fmt(floor, 3)}`
        );
        layout({ main: [0, 0, { scale: 0.8 }], curve: beside(400, 100) });
      }
    }

    return { render };
  };
})();
