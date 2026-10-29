// Part 9 of the diffusion series: guidance. One scene on three overlapping classes: conditional sampling, the
// gradient of an (exact) noisy classifier, classifier guidance, classifier-free guidance with a network trained with
// condition dropout, and what guidance does to each class: more confident, less varied, pushed away from the others.
// Every number comes from DM.
(function () {
  "use strict";

  const DM = window.DM;
  const { fmt } = window.TF.view;
  const { plot, chart, chunked } = DM.view;
  DM.scenes = DM.scenes || {};

  const PER = 200; // samples per class
  const WS = [0, 0.5, 1, 2, 4, 8];
  const COLOUR = ["dm-data", "dm-model", "dm-true"];
  const narrow = window.matchMedia("(max-width: 991.98px)");
  const beside = (x, y, opts) => (narrow.matches ? [0, 450, opts] : [x, y, opts]);

  DM.scenes.part9 = function (stage) {
    const { svg, strip } = stage;
    const data = DM.DATASETS.classes;
    const sch = DM.schedule("linear", 200);
    const net = DM.loadNet("classes-cfg");
    const cls = Int32Array.from({ length: 3 * PER }, (_, i) => Math.floor(i / PER));
    const { xs: x0, labels } = DM.sample(data, 3 * PER, 1);
    const sd = data.sd[0];
    const exactAll = DM.exactModel(data, sch);
    const exactClass = DM.exactGuided(data, sch, { cls: 0 });

    // p(c | x) for clean data: which class a point most likely came from
    const posterior = (x, y) => {
      const l = data.means.map((m) => -((x - m[0]) ** 2 + (y - m[1]) ** 2) / (2 * sd * sd));
      const top = Math.max(...l);
      const e = l.map((v) => Math.exp(v - top));
      const z = e[0] + e[1] + e[2];
      return e.map((v) => v / z);
    };
    // confidence (mean p(c | x) for the class asked for), spread per class, and how far out each class's samples sit
    function measure(xs, which = cls) {
      let conf = 0;
      let spread = 0;
      let radius = 0;
      for (let c = 0; c < 3; c++) {
        const idx = [];
        for (let i = 0; i < which.length; i++) if (which[i] === c) idx.push(i);
        let mx = 0;
        let my = 0;
        idx.forEach((i) => {
          mx += xs[2 * i];
          my += xs[2 * i + 1];
          conf += posterior(xs[2 * i], xs[2 * i + 1])[c];
        });
        mx /= idx.length;
        my /= idx.length;
        const m = data.means[c];
        radius += (mx * m[0] + my * m[1]) / Math.hypot(m[0], m[1]);
        let v = 0;
        idx.forEach((i) => (v += (xs[2 * i] - mx) ** 2 + (xs[2 * i + 1] - my) ** 2));
        spread += Math.sqrt(v / (2 * idx.length));
      }
      return { conf: conf / which.length, spread: spread / 3, radius: radius / 3 };
    }
    const byClass = (xs, which, c) => {
      const out = [];
      for (let i = 0; i < which.length; i++) if (which[i] === c) out.push(xs[2 * i], xs[2 * i + 1]);
      return Float64Array.from(out);
    };

    const main = plot(svg, { range: 3 });
    const right = plot(svg, { range: 3 });
    const curve = chart(svg, { width: 250, height: 140 });
    const layout = DM.layout(svg, () => ({ main, right, curve }));

    /* -------------------------------------------- background sampling */

    const R = {};
    const jobs = [];
    WS.forEach((w) => {
      jobs.push({
        key: `exact-${w}`,
        make: () => DM.respacedStepper(DM.exactGuided(data, sch, { cls, w }), sch, DM.gaussian(3 * PER, 2), { S: 50 }),
      });
      jobs.push({ key: `net-${w}`, make: () => DM.respacedStepper(DM.netModel(net, sch, { cls, w }), sch, DM.gaussian(3 * PER, 2), { S: 50 }) });
    });
    jobs.push({ key: "net-uncond", make: () => DM.respacedStepper(DM.netModel(net, sch, { cls: null }), sch, DM.gaussian(3 * PER, 2), { S: 50 }) });
    const total = jobs.length;
    function runNext() {
      const job = jobs.shift();
      if (!job) {
        stage.busy(null);
        stage.note(`three classes, ${PER} samples each · 50 sampling steps · exact models and a trained conditional network`);
        return;
      }
      const st = job.make();
      stage.busy(`sampling… ${total - jobs.length} of ${total}`);
      chunked(
        () => st.next(5),
        null,
        () => {
          const xs = st.frames[st.frames.length - 1];
          R[job.key] = { xs, m: job.key === "net-uncond" ? null : measure(xs) };
          stage.redraw();
          runNext();
        }
      );
    }
    runNext();

    /* -------------------------------------------- pieces */

    function reset() {
      [main, right].forEach((p) => {
        p.view(3).shade(null).rings([]).arrows([]).marks([]).paths([]).corner("");
        ["c0", "c1", "c2", "pts", "b"].forEach((k) => p.cloud(k, null));
      });
    }
    const showClasses = (p, xs, which = cls, extra = "is-strong") =>
      [0, 1, 2].forEach((c) => p.cloud(`c${c}`, byClass(xs, which, c), `${COLOUR[c]} ${extra}`, 2.4));
    const centres = (p) => p.marks(data.means.map((m, c) => ({ c: m, label: `class ${c + 1}`, cls: `${COLOUR[c]} is-hollow`, r: 5 })));
    const waiting = () => {
      main.title("sampling…");
      strip("sampling…");
      layout({ main: [0, 0] });
    };
    const grid = (() => {
      const g = [];
      for (let y = -2.7; y <= 2.71; y += 0.3) for (let x = -2.7; x <= 2.71; x += 0.3) g.push(x, y);
      return Float64Array.from(g);
    })();

    /* -------------------------------------------- render */

    function render(step, t) {
      reset();

      if (step === "data") {
        main.title("three classes that overlap");
        showClasses(main, x0, labels, "");
        centres(main);
        const m = measure(x0, labels);
        let other = 0;
        for (let i = 0; i < labels.length; i++) {
          const p = posterior(x0[2 * i], x0[2 * i + 1]);
          if (p.indexOf(Math.max(...p)) !== labels[i]) other++;
        }
        strip(
          `${3 * PER} points · ${fmt((100 * other) / labels.length, 0)}% of them are more likely under another class · average p(class | x) of the true class: ${fmt(m.conf, 2)} · spread per class ${fmt(m.spread, 2)}`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "conditional") {
        const r = R["exact-0"];
        if (!r) return waiting();
        main.title("conditional samples, no guidance (exact model)");
        showClasses(main, r.xs);
        centres(main);
        strip(
          `average p(class | x) of the class asked for: ${fmt(r.m.conf, 3)} (the data: ${fmt(measure(x0, labels).conf, 3)}) · spread per class ${fmt(r.m.spread, 3)} (true: ${sd})`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "classifier") {
        const k = Math.max(2, Math.round(150 - t * 145));
        // ∇ log p_t(class 1 | x) = ∇ log p_t(x | class 1) − ∇ log p_t(x), from the exact noisy densities
        const e1 = exactClass.classModel(0).eps(grid, k);
        const eu = exactAll.eps(grid, k);
        const b = Math.sqrt(1 - sch.alphaBar[k]);
        const g = Float64Array.from(e1, (v, i) => -(v - eu[i]) / b);
        let top = 0;
        for (let i = 0; i < g.length; i += 2) top = Math.max(top, Math.hypot(g[i], g[i + 1]));
        main.title(`∇ log pₜ(class 1 | x) at t = ${k}`);
        // shaded by the exact noisy posterior p_t(class 1 | x): class c at step t is N(√ᾱ μ_c, (ᾱ sd² + 1 − ᾱ) I)
        const ab = sch.alphaBar[k];
        const vt = ab * sd * sd + 1 - ab;
        main.shade((x, y) => {
          const l = data.means.map((m) => -((x - Math.sqrt(ab) * m[0]) ** 2 + (y - Math.sqrt(ab) * m[1]) ** 2) / (2 * vt));
          const top = Math.max(...l);
          const e = l.map((v) => Math.exp(v - top));
          return e[0] / (e[0] + e[1] + e[2]);
        }, 40);
        main.arrows(
          Array.from({ length: grid.length / 2 }, (_, i) => ({
            a: [grid[2 * i], grid[2 * i + 1]],
            b: [grid[2 * i] + (0.28 * g[2 * i]) / top, grid[2 * i + 1] + (0.28 * g[2 * i + 1]) / top],
            cls: "dm-data",
          }))
        );
        centres(main);
        main.corner("arrows scaled to fit");
        strip(
          `the gradient of a noisy classifier's log-probability for class 1 · it points away from the other classes, most strongly where they overlap · step t = ${k}`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "guided" || step === "cfg") {
        const net_ = step === "cfg";
        const have = WS.filter((w) => R[`${net_ ? "net" : "exact"}-${w}`]);
        if (have.length < WS.length) return waiting();
        const w = WS[Math.min(WS.length - 1, Math.floor(t * WS.length))];
        const r = R[`${net_ ? "net" : "exact"}-${w}`];
        main.title(net_ ? `classifier-free guidance, w = ${w} (trained network)` : `classifier guidance, scale s = ${w + 1} (exact classifier)`);
        showClasses(main, r.xs);
        centres(main);
        const series = (prefix, f) => WS.map((v) => [v, f(R[`${prefix}-${v}`].m)]);
        curve.title("confidence (blue), spread (red); exact dashed").set({
          series: [
            { values: series("net", (m) => m.conf), cls: "dm-data" },
            { values: series("exact", (m) => m.conf), cls: "dm-data is-dashed" },
            { values: series("net", (m) => m.spread), cls: "dm-model" },
            { values: series("exact", (m) => m.spread), cls: "dm-model is-dashed" },
          ],
          x: [0, 8],
          y: [0, 1],
          yTicks: [0, sd, 1],
          cursor: w,
          xLabel: net_ ? "guidance weight w" : "scale s − 1",
        });
        strip(
          `${net_ ? `w = ${w}` : `s = ${w + 1}`}: average p(class | x) ${fmt(r.m.conf, 3)} · spread per class ${fmt(r.m.spread, 3)} (data ${sd}) · class centres pushed out to radius ${fmt(r.m.radius, 2)} (data: 1)`
        );
        layout({ main: [0, 0, { scale: 0.8 }], curve: beside(400, 100) });
        return;
      }

      if (step === "train") {
        const u = R["net-uncond"];
        const c = R["net-0"];
        if (!u || !c) return waiting();
        main.title("the network with no class (∅)").cloud("pts", x0, "dm-noise is-faint").cloud("b", u.xs, "dm-ink is-strong", 2.2);
        right.title("the same network, told the class");
        showClasses(right, c.xs);
        strip(
          `one network, trained with the class dropped 20% of the time · no class: distance to the whole data ${fmt(DM.slicedToData(u.xs, data), 3)} · told the class: confidence ${fmt(c.m.conf, 3)}, spread ${fmt(c.m.spread, 3)}`
        );
        layout({ main: [0, 0, { scale: 0.75 }], right: [320, 0, { scale: 0.75 }] });
        return;
      }

      if (step === "outward") {
        const r = R["net-4"];
        if (!r) return waiting();
        const c0 = byClass(r.xs, cls, 0);
        const mean = [0, 1].map((d) => c0.filter((_, i) => i % 2 === d).reduce((a, b) => a + b, 0) / (c0.length / 2));
        main.title("class 1 with w = 4, over class 1's true density");
        main.shade((x, y) => Math.exp(-((x - data.means[0][0]) ** 2 + (y - data.means[0][1]) ** 2) / (2 * sd * sd)), 50);
        main.cloud("c0", c0, "dm-data is-strong", 2.6);
        main.arrows([{ a: data.means[0], b: mean, cls: "dm-ink" }]);
        main.marks([
          { c: data.means[0], label: "true centre", cls: "dm-ink is-hollow", r: 5 },
          { c: mean, label: "mean of guided samples", cls: "dm-ink", r: 4, dy: -12 },
          ...data.means.slice(1).map((m, k) => ({ c: m, label: `class ${k + 2}`, cls: `${COLOUR[k + 1]} is-hollow`, r: 5 })),
        ]);
        strip(
          `guided samples sit ${fmt(Math.hypot(mean[0] - data.means[0][0], mean[1] - data.means[0][1]), 2)} away from the class's true centre, on the side away from the other classes`
        );
        layout({ main: [0, 0] });
      }
    }

    return { render };
  };
})();
