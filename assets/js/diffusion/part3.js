// Part 3 of the diffusion series: the reverse process and the variational bound. One scene: the true reverse step
// for one noisy point, the forward posterior when x₀ is known, the true step as an average of posteriors, the
// network's Gaussian against them, and the bound's terms over every step. Every number comes from DM.
(function () {
  "use strict";

  const DM = window.DM;
  const { fmt } = window.TF.view;
  const { plot, chart, at, sub, chunked } = DM.view;
  DM.scenes = DM.scenes || {};

  const N = 800;
  const T = 200;
  const ZT = 40; // the step we look at
  const DRAWS = 40; // possible x₀ for one x_t
  const narrow = window.matchMedia("(max-width: 991.98px)");
  const beside = (x, y, opts) => (narrow.matches ? [0, 450, opts] : [x, y, opts]);
  const pt = (p, d = 2) => `(${fmt(p[0], d)}, ${fmt(p[1], d)})`;

  DM.scenes.part3 = function (stage) {
    const { svg, controls, strip } = stage;
    const data = DM.DATASETS.swissroll;
    const sch = DM.schedule("linear", T);
    const x0s = DM.sample(data, N, 1).xs;
    const fwd = DM.forwardChain(x0s, sch, 11);
    const exact = DM.exactModel(data, sch);
    const model = DM.netModel(DM.loadNet("swissroll-eps"), sch);

    const main = plot(svg, { range: 3 });
    const side = plot(svg, { range: 0.6 });
    const terms = chart(svg, { width: 260, height: 150, xTitle: "step t" });
    const layout = DM.layout(svg, () => ({ main, side, terms }));

    /* -------------------------------------------- the point we look at; "new point" picks another */

    let who = 17;
    let P = null;
    function pickPoint() {
      const x0 = at(x0s, who);
      const xt = at(fwd[ZT], who);
      const parts = DM.trueReverse(data, sch, ZT, xt);
      const trueM = DM.mixtureMoments(parts).mean;
      const post = DM.posterior(x0, xt, sch, ZT);
      const rand = DM.rng(who + 3);
      const draws = Array.from({ length: DRAWS }, () => exact.sampleX0(xt[0], xt[1], ZT, rand));
      const posts = draws.map((d) => DM.posterior(d, xt, sch, ZT));
      const avg = [0, 1].map((k) => posts.reduce((sum, p) => sum + p.mean[k], 0) / DRAWS);
      // the network's step: μ_θ = (x_t − β/√(1 − ᾱ) ε_θ) / √α, variance β
      const e = model.eps(Float64Array.from(xt), ZT);
      const k = sch.beta[ZT] / Math.sqrt(1 - sch.alphaBar[ZT]);
      const ia = 1 / Math.sqrt(sch.alpha[ZT]);
      const muNet = [ia * (xt[0] - k * e[0]), ia * (xt[1] - k * e[1])];
      const klOne = DM.kl2(post.mean, post.variance, muNet, sch.beta[ZT]);
      const klAvg = posts.reduce((sum, p) => sum + DM.kl2(p.mean, p.variance, muNet, sch.beta[ZT]), 0) / DRAWS;
      // the same averages with the exact model's mean, the best any network with this variance can do
      const eEx = exact.eps(Float64Array.from(xt), ZT);
      const muEx = [ia * (xt[0] - k * eEx[0]), ia * (xt[1] - k * eEx[1])];
      const klAvgEx = posts.reduce((sum, p) => sum + DM.kl2(p.mean, p.variance, muEx, sch.beta[ZT]), 0) / DRAWS;
      P = { x0, xt, parts, trueM, post, draws, posts, avg, muNet, muEx, klOne, klAvg, klAvgEx };
    }
    pickPoint();

    const again = h("button", { type: "button", class: "tf-btn", text: "new point" });
    again.addEventListener("click", () => {
      who = (who * 37 + 101) % N;
      pickPoint();
      stage.redraw();
    });
    controls.append(again);

    /* -------------------------------------------- the bound's terms, a few steps per frame */

    const netTerms = new Float64Array(T + 1);
    const exTerms = new Float64Array(T + 1);
    const exTilde = new Float64Array(T + 1);
    let doneTo = 1;
    stage.busy("computing the bound for every step…");
    chunked(
      () => {
        const to = Math.min(T, doneTo + 8);
        const opts = { m: 256, from: doneTo + 1, to };
        DM.boundTerms(model, data, sch, { ...opts, into: netTerms });
        DM.boundTerms(exact, data, sch, { ...opts, into: exTerms });
        DM.boundTerms(exact, data, sch, { ...opts, into: exTilde, sigma: "tilde" });
        doneTo = to;
        return doneTo >= T ? null : doneTo / T;
      },
      (p) => stage.busy(`computing the bound for every step… ${Math.round(100 * p)}%`),
      () => {
        stage.busy(null);
        stage.note(`${N} points · ${T} steps · looking at step ${ZT}`);
        stage.redraw();
      }
    );
    const total = (a) => a.reduce((x, y) => x + y, 0);
    const series = (a) => {
      const v = [];
      for (let t = 2; t <= doneTo; t++) v.push([t, Math.max(a[t], 1e-6)]);
      return v;
    };

    /* -------------------------------------------- pieces */

    function zoom(r = 0.45) {
      side.view(r, P.xt[0], P.xt[1]).shade(null).rings([]).marks([]).paths([]).arrows([]).cloud("pts", null);
      side.corner(`width ±${fmt(r, 2)}`);
    }
    const heat = () => side.shade((x, y) => DM.mixturePdf(P.parts, x, y), 56);
    const ringPair = (c, v, cls) => [
      { c, r: Math.sqrt(v), cls },
      { c, r: 2 * Math.sqrt(v), cls: `${cls} is-dashed` },
    ];

    /* -------------------------------------------- render */

    function render(step, t) {
      main.view(3).shade(null).rings([]).arrows([]).marks([]).paths([]).corner("").cloud("b", null);

      if (step === "goal") {
        main
          .title(`x${sub(ZT)}`)
          .cloud("pts", fwd[ZT], "dm-data is-faint")
          .marks([{ c: P.xt, label: "xₜ", cls: "dm-ink is-hollow" }]);
        zoom();
        heat();
        side.title(`the target: q(x${sub(ZT - 1)} | x${sub(ZT)})`).marks([{ c: P.xt, label: "xₜ", cls: "dm-ink is-hollow", r: 4 }]);
        strip(
          `one noisy point at t = ${ZT}: ${pt(P.xt)} · the true reverse step is centred at ${pt(P.trueM, 3)} · it depends on the whole data distribution`
        );
        layout({ main: [0, 0], side: beside(450, 40, { scale: 0.8 }) });
        return;
      }

      if (step === "posterior") {
        main.title("knowing where it started").cloud("pts", x0s, "dm-data is-faint");
        main.marks([
          { c: P.x0, label: "x₀", cls: "dm-x0" },
          { c: P.xt, label: "xₜ", cls: "dm-ink is-hollow" },
        ]);
        main.paths([{ pts: [P.x0, P.xt], cls: "dm-x0" }]);
        zoom();
        side.title(`q(x${sub(ZT - 1)} | x${sub(ZT)}, x₀)`).rings(ringPair(P.post.mean, P.post.variance, "dm-x0 is-filled"));
        side.marks([
          { c: P.xt, label: "xₜ", cls: "dm-ink is-hollow", r: 4 },
          { c: P.post.mean, label: "μ̃", cls: "dm-x0", r: 4 },
        ]);
        strip(
          `μ̃ = ${fmt(P.post.c0, 4)}·x₀ + ${fmt(P.post.ct, 4)}·xₜ = ${pt(P.post.mean, 3)} · width √β̃ = ${fmt(Math.sqrt(P.post.variance), 4)} (one forward step adds √β = ${fmt(Math.sqrt(sch.beta[ZT]), 4)})`
        );
        layout({ main: [0, 0], side: beside(450, 40, { scale: 0.8 }) });
        return;
      }

      if (step === "average") {
        main.title(`${DRAWS} places x₀ could have been`).cloud("pts", x0s, "dm-data is-faint");
        main.cloud("b", Float64Array.from(P.draws.flat()), "dm-x0 is-strong", 3);
        main.marks([{ c: P.xt, label: "xₜ", cls: "dm-ink is-hollow" }]);
        zoom();
        heat();
        side.title(`one posterior per possible x₀, over the true step`);
        side.rings(P.posts.map((p) => ({ c: p.mean, r: Math.sqrt(p.variance), cls: "dm-x0" })));
        side.marks([
          { c: P.trueM, label: "true mean", cls: "dm-true", r: 4 },
          { c: P.xt, label: "", cls: "dm-ink is-hollow", r: 4 },
        ]);
        strip(`mean of the ${DRAWS} posterior centres ${pt(P.avg, 3)} · centre of the true reverse step ${pt(P.trueM, 3)}`);
        layout({ main: [0, 0], side: beside(450, 40, { scale: 0.8 }) });
        return;
      }

      if (step === "model") {
        main
          .title(`x${sub(ZT)}`)
          .cloud("pts", fwd[ZT], "dm-data is-faint")
          .marks([{ c: P.xt, label: "xₜ", cls: "dm-ink is-hollow" }]);
        zoom();
        heat();
        side.title("the network's step (red) against one posterior (orange)");
        side.rings([...ringPair(P.muNet, sch.beta[ZT], "dm-model"), ...ringPair(P.post.mean, P.post.variance, "dm-x0")]);
        side.marks([
          { c: P.muNet, label: "μθ", cls: "dm-model", r: 4 },
          { c: P.post.mean, label: "μ̃", cls: "dm-x0", r: 4, dy: 16 },
        ]);
        strip(
          `KL(posterior ‖ network) for this x₀: ${fmt(P.klOne, 3)} nats · averaged over the ${DRAWS} possible x₀: ${fmt(P.klAvg, 3)} · with the exact best mean: ${fmt(P.klAvgEx, 3)}`
        );
        layout({ main: [0, 0], side: beside(450, 40, { scale: 0.8 }) });
        return;
      }

      if (step === "terms" || step === "variance") {
        const k = Math.max(2, Math.round(2 + t * (T - 2)));
        const top = Math.max(1, ...netTerms.slice(2, doneTo + 1));
        if (step === "terms") {
          terms.title("Lₜ₋₁: network (red), best (green)").set({
            series: [
              { values: series(netTerms), cls: "dm-model" },
              { values: series(exTerms), cls: "dm-true is-dashed" },
            ],
            x: [0, T],
            y: [1e-4, top],
            yLog: true,
            yTicks: [1e-4, 1e-2, 1],
            cursor: k,
          });
          main.title(`x${sub(k)}`).cloud("pts", fwd[k], "dm-data");
          strip(
            doneTo < T
              ? "computing…"
              : `t = ${k}: L_${k - 1} = ${fmt(netTerms[k], 4)} nats (best ${fmt(exTerms[k], 4)}) · sum over all steps: network ${fmt(total(netTerms), 2)}, best possible ${fmt(total(exTerms), 2)} · steps 2 to 10 hold ${fmt((100 * total(netTerms.slice(2, 11))) / total(netTerms), 0)}%`
          );
          layout({ main: [0, 0, { scale: 0.8 }], terms: beside(400, 100) });
          return;
        }
        terms.title("best Lₜ₋₁: σ² = β (green), β̃ (orange)").set({
          series: [
            { values: series(exTerms), cls: "dm-true" },
            { values: series(exTilde), cls: "dm-x0 is-dashed" },
          ],
          x: [0, T],
          y: [1e-4, Math.max(1, ...exTilde.slice(2, doneTo + 1))],
          yLog: true,
          yTicks: [1e-4, 1e-2, 1],
          cursor: k,
        });
        strip(
          doneTo < T
            ? "computing…"
            : `t = ${k}: σ² = β gives ${fmt(exTerms[k], 4)}, σ² = β̃ gives ${fmt(exTilde[k], 4)} · totals ${fmt(total(exTerms), 2)} and ${fmt(total(exTilde), 2)} nats`
        );
        layout({ terms: [0, 0] });
      }
    }

    return { render };
  };

  const h = (...args) => window.TF.view.h(...args);
})();
