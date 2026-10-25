// Part 1 of the clustering series: k-means. One scene, ten steps, every number from CL.kmeans on the data shown.
(function () {
  "use strict";

  const CL = window.CL;
  const { h, fmt } = window.TF.view;
  const { scatter, chart } = CL.view;
  CL.scenes = CL.scenes || {};

  const KMAX = 8;
  const pt = (p) => `(${fmt(p[0], 1)}, ${fmt(p[1], 1)})`;

  CL.scenes.part1 = function (stage) {
    const { svg, strip, controls } = stage;
    let o = null;
    let last = { step: null, t: 0 };
    let addPoint = () => {};

    /* -------------------------------------------- controls: a new random start, and k for the last steps */

    const seeds = { main: 1, local: null, pp: 1 };
    const again = h("button", { type: "button", class: "tf-btn", text: "new start" });
    const slider = h("input", { type: "range", min: 1, max: KMAX, step: 1, value: 3, id: "cl1-k" });
    const kOut = h("output", { for: "cl1-k" });
    const kWrap = h("span", { class: "tf-check" }, h("label", { for: "cl1-k", text: "k" }), slider, kOut);
    let kTouched = false;
    controls.append(again, kWrap);
    again.addEventListener("click", () => {
      const which = last.step === "local" ? "local" : last.step === "plusplus" ? "pp" : "main";
      seeds[which] = (seeds[which] ?? 0) + 1;
      if (which === "local") seeds.localPinned = true;
      build(o.data, true);
      render(last.step, last.t);
    });
    slider.addEventListener("input", () => {
      kTouched = true;
      render(last.step, last.t);
    });

    /* -------------------------------------------- build: every run on one dataset */

    function build(data, keepObjects = false) {
      const points = data.points;
      const k = data.k;
      const n = points.length;
      if (!keepObjects) {
        svg.replaceChildren();
        if (!seeds.localPinned) seeds.local = null;
      }
      const plot = keepObjects
        ? o.plot
        : scatter(svg)
            .points(points)
            .onClick((p) => addPoint(p));
      const lineChart = keepObjects ? o.chart : chart(svg, { title: "inertia", width: 240, height: 130, xTitle: "step" });
      const elbowChart = keepObjects ? o.elbow : chart(svg, { title: "inertia", width: 240, height: 100, xTitle: "k" });
      const silChart = keepObjects ? o.sil : chart(svg, { title: "silhouette", width: 240, height: 70, xTitle: "k" });

      const best = CL.bestOf(points, k, 10);
      const main = CL.kmeans(points, k, seeds.main, "random");

      // the first random start (from seed 1) that gets stuck clearly above the best answer
      const stuck = (run) => run.inertia > best.inertia * 1.05;
      const tries = 100;
      let stuckRandom = 0;
      let stuckPP = 0;
      let firstStuck = null;
      for (let sd = 1; sd <= tries; sd++) {
        const r = CL.kmeans(points, k, sd, "random");
        if (stuck(r)) {
          stuckRandom++;
          if (firstStuck == null) firstStuck = sd;
        }
        if (stuck(CL.kmeans(points, k, sd, "plusplus"))) stuckPP++;
      }
      if (seeds.local == null) seeds.local = firstStuck ?? 1;
      const local = CL.kmeans(points, k, seeds.local, "random");
      const pp = CL.kmeans(points, k, seeds.pp, "plusplus");

      const elbow = [];
      for (let kk = 1; kk <= KMAX; kk++) {
        const run = CL.bestOf(points, kk, 5);
        elbow.push({ ...run, silhouette: kk > 1 ? CL.silhouette(points, run.labels).mean : null });
      }
      const truthKnown = data.truth.every((g) => g >= 0);
      o = {
        data,
        points,
        k,
        n,
        best,
        main,
        local,
        pp,
        stuckRandom,
        stuckPP,
        tries,
        rand: CL.randIndex(
          best.labels,
          data.truth.map((g, i) => (g >= 0 ? g : best.labels[i]))
        ),
        truthKnown,
        plot,
        chart: lineChart,
        elbow: elbowChart,
        sil: silChart,
        elbowRuns: elbow,
      };
      if (!kTouched) slider.value = String(k);
    }

    /* -------------------------------------------- render: the whole figure for (step, t) */

    const layout = CL.layout(svg, () => ({ plot: o.plot, chart: o.chart, elbow: o.elbow, sil: o.sil }));
    // Charts sit right of the plot, or under it on phones, where a side-by-side figure would be too small to read.
    const PLOT = [0, 0];
    const narrow = window.TF.view.narrow;
    const side = (row = 0) => (narrow.matches ? [row * 300 + 40, 500] : [520, row ? 250 : 70]);

    // Shows one frame of a Lloyd trace: colours, centres and their cells.
    function showFrame(fr, cells = true) {
      o.plot.colour(fr.labels).style(null).links([]);
      o.plot.centres(fr.centres).cells(cells && fr.labels ? fr.centres : null);
    }

    // The inertia after each assign and update, up to frame f.
    function inertiaChart(run, f, ref) {
      const values = run.frames.slice(1).map((fr, i) => (i + 1 <= f ? fr.inertia : null));
      const labels = run.frames.slice(1).map((fr) => (fr.kind === "assign" ? `a${fr.iter}` : `u${fr.iter}`));
      const series = [{ values, cls: "cl-ink" }];
      if (ref != null) series.push({ values: values.map(() => ref), cls: "cl-ref", label: "best" });
      const top = Math.max(...run.frames.slice(1).map((fr) => fr.inertia), ref ?? 0);
      o.chart.set(series, f - 1, labels, top);
    }

    // Scrubs a trace with t: returns the frame index (1 … frames − 1).
    const frameAt = (run, t) => Math.min(run.frames.length - 1, 1 + Math.floor(t * 1.15 * (run.frames.length - 1)));

    function traceStrip(run, f) {
      const fr = run.frames[f];
      if (fr.kind === "assign")
        return fr.changed === 0
          ? `round ${fr.iter}, assign: no point changes colour, so the centres won't move again. Done. inertia = ${fmt(fr.inertia)}`
          : `round ${fr.iter}, assign: ${fr.changed} point${fr.changed > 1 ? "s" : ""} took a new colour. inertia = ${fmt(fr.inertia)}`;
      return `round ${fr.iter}, update: every centre moved to the mean of its points. inertia = ${fmt(fr.inertia)}`;
    }

    const steps = {
      points() {
        layout({ plot: PLOT });
        o.plot.colour(null).style(null).links([]).centres([]).cells(null);
        o.plot.title("the data");
        strip(`${o.n} points in the plane, and nothing else: no labels, no groups. We ask for k = ${o.k} clusters.`);
      },

      start(t) {
        layout({ plot: PLOT });
        const st = o.main.start;
        const show = Math.min(o.k, Math.floor(t * 1.3 * (o.k + 1)));
        o.plot.colour(null).links([]).cells(null).centres(st.centres, show);
        o.plot.style((i) => (st.picked.slice(0, show).includes(i) ? { ring: true } : null));
        o.plot.title("random start");
        strip(
          show === 0
            ? `Step 0: pick ${o.k} of the points at random to be the first centres.`
            : `centres: ${st.centres
                .slice(0, show)
                .map((c, j) => `c${j + 1} = ${pt(c)}`)
                .join(", ")}`
        );
      },

      assign(t) {
        layout({ plot: PLOT });
        const fr = o.main.frames[1];
        const centres = fr.centres;
        const upTo = Math.floor(V(t * 1.2) * (o.n + 1));
        o.plot.style(null).centres(centres).colour(fr.labels, upTo);
        o.plot.title("assign");
        if (upTo >= o.n) {
          o.plot.links([]).cells(centres);
          strip(`Every point now wears the colour of its nearest centre. The tinted regions show each centre's territory.`);
          return;
        }
        o.plot.cells(null);
        const i = upTo;
        const p = o.points[i];
        const j = fr.labels[i];
        o.plot.links(centres.map((c, m) => [p, c, m === j ? "is-best" : ""]));
        o.plot.style((q) => (q === i ? { r: 7, ring: true } : null));
        strip(`point ${pt(p)}: distance ${centres.map((c, m) => `${fmt(CL.dist(p, c))} to c${m + 1}`).join(", ")} → c${j + 1}`);
      },

      update(t) {
        layout({ plot: PLOT });
        const before = o.main.frames[1];
        const after = o.main.frames[2] || before;
        const moved = t > 0.12;
        o.plot.style(null).colour(before.labels).cells(null);
        o.plot.centres(moved ? after.centres : before.centres);
        o.plot.links(moved ? before.centres.map((c, j) => [c, after.centres[j], "is-trail"]) : []);
        o.plot.title("update");
        const j = Math.min(o.k - 1, Math.floor(V((t - 0.12) / 0.88) * o.k));
        const members = o.points.filter((_, i) => before.labels[i] === j);
        strip(
          !moved
            ? "Step 2: move every centre to the mean (the average position) of the points that chose it."
            : `c${j + 1} = mean of its ${members.length} points = (${fmt(members.reduce((s, p) => s + p[0], 0))}, ${fmt(
                members.reduce((s, p) => s + p[1], 0)
              )}) / ${members.length} = ${pt(after.centres[j])}`
        );
      },

      repeat(t) {
        layout({ plot: PLOT, chart: side() });
        const f = frameAt(o.main, t);
        showFrame(o.main.frames[f]);
        o.plot.title(`round ${o.main.frames[f].iter}`);
        inertiaChart(o.main, f);
        strip(traceStrip(o.main, f));
      },

      done() {
        layout({ plot: PLOT, chart: side() });
        const f = o.main.frames.length - 1;
        showFrame(o.main.frames[f]);
        o.plot.title("converged");
        inertiaChart(o.main, f);
        strip(
          `Converged after ${o.main.iterations} rounds. Final inertia = ${fmt(o.main.inertia)}: the sum of every point's squared distance to its centre.`
        );
      },

      local(t) {
        layout({ plot: PLOT, chart: side() });
        const f = frameAt(o.local, t);
        showFrame(o.local.frames[f]);
        o.plot.title(`another start · round ${o.local.frames[f].iter}`);
        inertiaChart(o.local, f, o.best.inertia);
        const end = f === o.local.frames.length - 1;
        const verdict =
          o.local.inertia > o.best.inertia * 1.05
            ? `Stuck at ${fmt(o.local.inertia)}, against ${fmt(o.best.inertia)} for the best answer.`
            : `This start reaches the best answer, ${fmt(o.best.inertia)}.`;
        strip(end ? `${verdict} ${o.stuckRandom} of ${o.tries} random starts on these points end up stuck.` : traceStrip(o.local, f));
      },

      plusplus(t) {
        layout({ plot: PLOT, chart: side() });
        const st = o.pp.start;
        const rounds = st.rounds;
        const phases = rounds.length + 2; // first pick, each D² draw, then the run
        const ph = Math.min(phases - 1, Math.floor(t * 1.15 * phases));
        o.plot.links([]).cells(null).colour(null);
        o.plot.title("k-means++ start");
        if (ph === 0) {
          o.plot.centres(st.centres, 1).style((i) => (i === st.picked[0] ? { ring: true } : null));
          o.chart.set([{ values: [] }]);
          strip(`k-means++, draw 1: the first centre is a point picked uniformly at random, ${pt(st.centres[0])}.`);
          return;
        }
        if (ph <= rounds.length) {
          const r = rounds[ph - 1];
          const maxP = Math.max(...r.probs);
          o.plot.centres(st.centres, ph + 1);
          o.plot.style((i) => ({ r: 2 + 9 * Math.sqrt(r.probs[i] / maxP), dim: r.probs[i] < maxP * 0.02, ring: i === r.pick }));
          o.chart.set([{ values: [] }]);
          strip(
            `draw ${ph + 1}: each point is picked with probability D(x)² / ΣD². Largest p = ${(maxP * 100).toFixed(1)}%; ` +
              `the drawn point ${pt(o.points[r.pick])} had p = ${(r.probs[r.pick] * 100).toFixed(1)}%.`
          );
          return;
        }
        showFrame(o.pp.frames[o.pp.frames.length - 1]);
        inertiaChart(o.pp, o.pp.frames.length - 1, o.best.inertia);
        strip(
          `From that start, Lloyd needs ${o.pp.iterations} rounds and ends at ${fmt(o.pp.inertia)}. ` +
            `Stuck starts out of ${o.tries}: ${o.stuckRandom} random, ${o.stuckPP} k-means++.`
        );
      },

      choosek(t) {
        layout({ plot: PLOT, elbow: side(0), sil: side(1) });
        if (!kTouched) slider.value = String(Math.min(KMAX, 1 + Math.floor(t * 1.2 * KMAX)));
        const k = Number(slider.value);
        kOut.textContent = String(k);
        const run = o.elbowRuns[k - 1];
        showFrame({ labels: run.labels, centres: run.centres });
        o.plot.title(`k = ${k}`);
        o.elbow.set([{ values: o.elbowRuns.map((r) => r.inertia), cls: "cl-ink" }], k - 1);
        o.sil.set([{ values: o.elbowRuns.map((r) => r.silhouette), cls: "cl-ink" }], k - 1, null, 1);
        strip(
          `k = ${k}: inertia ${fmt(run.inertia)}` +
            (k > 1 ? `, mean silhouette ${fmt(run.silhouette)}` : ", silhouette undefined for one cluster") +
            `. Best silhouette at k = ${bestSilK()}.`
        );
      },

      limits() {
        layout({ plot: PLOT });
        showFrame({ labels: o.best.labels, centres: o.best.centres });
        o.plot.title(`k-means on “${CL.DATASETS[o.data.name].label}”`);
        strip(`k-means (k = ${o.k}, best of 10 starts) agrees with the groups the points were drawn from on ${(o.rand * 100).toFixed(0)}% of pairs.`);
      },
    };

    const bestSilK = () => {
      let best = 2;
      o.elbowRuns.forEach((r, i) => {
        if (r.silhouette != null && r.silhouette > o.elbowRuns[best - 1].silhouette) best = i + 1;
      });
      return best;
    };
    const V = (x) => Math.min(1, Math.max(0, x));

    function render(step, t) {
      if (!o || !steps[step]) return;
      last = { step, t };
      again.hidden = !["start", "assign", "update", "repeat", "done", "local", "plusplus"].includes(step);
      kWrap.hidden = step !== "choosek";
      controls.hidden = again.hidden && kWrap.hidden;
      if (step !== "choosek") kTouched = false;
      steps[step](t);
    }

    return {
      build: (data) => build(data),
      render,
      onAdd: (fn) => (addPoint = fn),
    };
  };
})();
