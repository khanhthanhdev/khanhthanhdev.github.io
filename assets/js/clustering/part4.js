// Part 4 of the clustering series: Gaussian mixtures and the EM algorithm. One scene, nine steps, every number
// from CL.gmm on the data shown.
(function () {
  "use strict";

  const CL = window.CL;
  const { h, fmt } = window.TF.view;
  const { scatter, chart } = CL.view;
  CL.scenes = CL.scenes || {};

  const KMAX = 6;
  const pt = (p) => `(${fmt(p[0], 1)}, ${fmt(p[1], 1)})`;
  const pct = (v) => `${(v * 100).toFixed(0)}%`;
  const covText = (S) => `[[${fmt(S[0][0])}, ${fmt(S[0][1])}], [${fmt(S[1][0])}, ${fmt(S[1][1])}]]`;

  CL.scenes.part4 = function (stage) {
    const { svg, strip, controls } = stage;
    let o = null;
    let last = { step: null, t: 0 };
    let addPoint = () => {};

    /* -------------------------------------------- controls: a new start, and k */

    let seed = 1;
    const again = h("button", { type: "button", class: "tf-btn", text: "new start" });
    const slider = h("input", { type: "range", min: 1, max: KMAX, step: 1, value: 3, id: "cl4-k" });
    const kOut = h("output", { for: "cl4-k" });
    const kWrap = h("span", { class: "tf-check" }, h("label", { for: "cl4-k", text: "k" }), slider, kOut);
    let kTouched = false;
    controls.append(again, kWrap);
    again.addEventListener("click", () => {
      seed += 1;
      o.run = CL.gmm(o.points, o.k, seed);
      render(last.step, last.t);
    });
    slider.addEventListener("input", () => {
      kTouched = true;
      render(last.step, last.t);
    });

    /* -------------------------------------------- build */

    function build(data) {
      svg.replaceChildren();
      seed = 1;
      const points = data.points;
      const plot = scatter(svg)
        .points(points)
        .onClick((p) => addPoint(p));
      const llChart = chart(svg, { title: "log-likelihood", width: 240, height: 130, xTitle: "M step" });
      const bicChart = chart(svg, { title: "BIC (lower is better)", width: 240, height: 130, xTitle: "k" });
      const k = data.k;
      const byK = Array.from({ length: KMAX }, (_, i) => CL.bestGmm(points, i + 1, 5));
      const km = CL.bestOf(points, k, 10);
      o = {
        data,
        points,
        n: points.length,
        k,
        run: CL.gmm(points, k, 1),
        one: byK[0],
        byK,
        bics: byK.map((r) => CL.bic(r, points.length)),
        km,
        plot,
        llChart,
        bicChart,
      };
    }

    /* -------------------------------------------- helpers */

    const layout = CL.layout(svg, () => ({ plot: o.plot, llChart: o.llChart, bicChart: o.bicChart }));
    const narrow = window.TF.view.narrow;
    const side = () => (narrow.matches ? [60, 500] : [540, 90]);
    const frac = (x) => Math.min(1, Math.max(0, x));
    const truth = () => o.data.truth.map((g, i) => (g >= 0 ? g : 0));

    // Colour by the most likely component, faded by how unsure the point is.
    function soft(resp, focus = null) {
      const k = resp[0].length;
      o.plot.colour(resp.map((r) => r.indexOf(Math.max(...r))));
      o.plot.style((i) => {
        const top = Math.max(...resp[i]);
        const alpha = k === 1 ? 1 : 0.2 + (0.8 * (top - 1 / k)) / (1 - 1 / k);
        return i === focus ? { r: 7, ring: true } : { alpha };
      });
    }

    function showParams(params) {
      o.plot.ellipses(params.map((p) => ({ mean: p.mean, cov: p.cov })));
    }

    // Log-likelihood after the start and after every M step, up to frame f.
    function llChart(run, f) {
      const marks = run.frames.map((fr, i) => [fr, i]).filter(([fr]) => fr.kind !== "e");
      const values = marks.map(([fr, i]) => (i <= f ? fr.ll : null));
      const lo = Math.min(...marks.map(([fr]) => fr.ll));
      const hi = Math.max(...marks.map(([fr]) => fr.ll));
      // start the axis just below the lowest value, so the curve uses the whole chart
      const pad = 0.05 * (hi - lo || 1);
      o.llChart.set(
        [{ values, cls: "cl-ink" }],
        values.filter((v) => v != null).length - 1,
        marks.map((_, i) => (i === 0 ? "s" : String(i))),
        hi,
        lo - pad
      );
    }

    const frameAt = (run, t) => Math.min(run.frames.length - 1, 1 + Math.floor(frac(t * 1.15) * (run.frames.length - 1)));

    /* -------------------------------------------- steps */

    const steps = {
      hard() {
        layout({ plot: [0, 0] });
        o.plot.ellipses([]).links([]).style(null).colour(o.km.labels).centres(o.km.centres).cells(o.km.centres).title("k-means");
        strip(
          `k-means (k = ${o.k}, best of 10 starts): agreement with the true groups ${pct(CL.randIndex(o.km.labels, truth()))}. ` +
            `Every point gets one colour, however close it is to a border.`
        );
      },

      gaussian() {
        layout({ plot: [0, 0] });
        const p = o.one.params[0];
        o.plot.centres([]).cells(null).links([]).colour(null).style(null).title("one Gaussian");
        showParams([p]);
        strip(`One Gaussian fitted to all ${o.n} points: mean ${pt(p.mean)}, covariance ${covText(p.cov)}.`);
      },

      mixture() {
        layout({ plot: [0, 0] });
        const st = o.run.frames[0];
        o.plot.centres([]).cells(null).links([]).colour(null).style(null).title(`${o.k} Gaussians, first guess`);
        showParams(st.params);
        strip(
          `Start: means ${st.params.map((p, j) => `μ${j + 1} = ${pt(p.mean)}`).join(", ")}, ` +
            `each with the whole dataset's covariance and weight 1/${o.k}.`
        );
      },

      estep(t) {
        layout({ plot: [0, 0] });
        const fr = o.run.frames[1];
        showParams(fr.params);
        o.plot.centres([]).cells(null).links([]).title("E step");
        const i = Math.min(o.n - 1, Math.floor(frac(t * 1.1) * o.n));
        soft(fr.resp, i);
        strip(`point ${pt(o.points[i])}: ` + fr.resp[i].map((r, j) => `${pct(r)} component ${j + 1}`).join(", "));
      },

      mstep(t) {
        layout({ plot: [0, 0] });
        const before = o.run.frames[1];
        const after = o.run.frames[2] || before;
        const moved = t > 0.12;
        showParams(moved ? after.params : before.params);
        soft(before.resp);
        o.plot.centres([]).cells(null).title("M step");
        o.plot.links(moved ? before.params.map((p, j) => [p.mean, after.params[j].mean, "is-trail"]) : []);
        const j = Math.min(o.k - 1, Math.floor(frac((t - 0.12) / 0.88) * o.k));
        const p = after.params[j];
        strip(
          !moved
            ? "M step: refit each Gaussian to all the points, each point counted by its responsibility."
            : `component ${j + 1}: weight ${fmt(p.weight)} (${fmt(p.weight * o.n, 1)} points' worth), mean ${pt(p.mean)}, covariance ${covText(p.cov)}`
        );
      },

      iterate(t) {
        layout({ plot: [0, 0], llChart: side() });
        const f = frameAt(o.run, t);
        const fr = o.run.frames[f];
        showParams(fr.params);
        soft(fr.resp);
        o.plot.centres([]).cells(null).links([]).title(`round ${fr.iter}`);
        llChart(o.run, f);
        strip(
          fr.kind === "e"
            ? `round ${fr.iter}, E: new responsibilities. log-likelihood = ${fmt(fr.ll)}`
            : `round ${fr.iter}, M: new weights, means and covariances. log-likelihood = ${fmt(fr.ll)}`
        );
      },

      result() {
        layout({ plot: [0, 0], llChart: side() });
        const run = o.run;
        showParams(run.params);
        soft(run.resp);
        o.plot.centres([]).cells(null).links([]).title("converged");
        llChart(run, run.frames.length - 1);
        const unsure = run.resp.filter((r) => Math.max(...r) < 0.9).length;
        strip(
          `Converged after ${run.iterations} rounds, log-likelihood ${fmt(run.ll)}. Agreement with the true groups: ${pct(CL.randIndex(run.labels, truth()))} ` +
            `(k-means: ${pct(CL.randIndex(o.km.labels, truth()))}). ${unsure} point${unsure === 1 ? " is" : "s are"} less than 90% sure.`
        );
      },

      choosek(t) {
        layout({ plot: [0, 0], bicChart: side() });
        if (!kTouched) slider.value = String(Math.min(KMAX, 1 + Math.floor(frac(t * 1.2) * KMAX)));
        const k = Number(slider.value);
        kOut.textContent = String(k);
        const run = o.byK[k - 1];
        showParams(run.params);
        soft(run.resp);
        o.plot.centres([]).cells(null).links([]).title(`k = ${k}`);
        const lo = Math.min(...o.bics);
        o.bicChart.set([{ values: o.bics, cls: "cl-ink" }], k - 1, null, Math.max(...o.bics), lo - 0.05 * (Math.max(...o.bics) - lo || 1));
        strip(`k = ${k}: log-likelihood ${fmt(run.ll)}, BIC ${fmt(o.bics[k - 1])}. Lowest BIC at k = ${o.bics.indexOf(lo) + 1}.`);
      },

      limits() {
        layout({ plot: [0, 0] });
        const run = o.byK[o.k - 1];
        showParams(run.params);
        soft(run.resp);
        o.plot.centres([]).cells(null).links([]).title(`mixture on “${CL.DATASETS[o.data.name].label}”`);
        strip(
          `${o.k} Gaussians (best of 5 starts): agreement ${pct(CL.randIndex(run.labels, truth()))}, k-means ${pct(CL.randIndex(o.km.labels, truth()))}. ` +
            `BIC prefers k = ${o.bics.indexOf(Math.min(...o.bics)) + 1} here.`
        );
      },
    };

    function render(step, t) {
      if (!o || !steps[step]) return;
      last = { step, t };
      again.hidden = !["mixture", "estep", "mstep", "iterate", "result"].includes(step);
      kWrap.hidden = step !== "choosek";
      controls.hidden = again.hidden && kWrap.hidden;
      if (step !== "choosek") kTouched = false;
      steps[step](t);
    }

    return { build, render, onAdd: (fn) => (addPoint = fn) };
  };
})();
