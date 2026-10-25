// Part 3 of the clustering series: DBSCAN. One scene, nine steps, every number from CL.dbscan on the data shown.
(function () {
  "use strict";

  const CL = window.CL;
  const { h, s, fmt } = window.TF.view;
  const { scatter, chart, px } = CL.view;
  CL.scenes = CL.scenes || {};

  const pt = (p) => `(${fmt(p[0], 1)}, ${fmt(p[1], 1)})`;
  const U = CL.view.SIZE / CL.BOX;

  CL.scenes.part3 = function (stage) {
    const { svg, strip, controls } = stage;
    let o = null;
    let last = { step: null, t: 0 };
    let addPoint = () => {};

    /* -------------------------------------------- controls: ε and minPts */

    const epsIn = h("input", { type: "range", min: 0.3, max: 2, step: 0.05, value: 1, id: "cl3-eps" });
    const epsOut = h("output", { for: "cl3-eps" });
    const minIn = h("input", { type: "range", min: 2, max: 12, step: 1, value: 5, id: "cl3-min" });
    const minOut = h("output", { for: "cl3-min" });
    controls.append(
      h("span", { class: "tf-check" }, h("label", { for: "cl3-eps", class: "cl-nocaps", text: "ε" }), epsIn, epsOut),
      h("span", { class: "tf-check" }, h("label", { for: "cl3-min", text: "minPts" }), minIn, minOut)
    );
    [epsIn, minIn].forEach((el) =>
      el.addEventListener("input", () => {
        run();
        render(last.step, last.t);
      })
    );

    /* -------------------------------------------- build */

    function build(data) {
      svg.replaceChildren();
      const plot = scatter(svg)
        .points(data.points)
        .onClick((p) => addPoint(p));
      const kchart = chart(svg, { title: "distance to the minPts-th nearest point", width: 240, height: 150, xTitle: "points, sorted" });
      o = { data, points: data.points, n: data.points.length, plot, kchart };
      run();
    }

    // Reruns DBSCAN with the current ε and minPts.
    function run() {
      const eps = Number(epsIn.value);
      const minPts = Number(minIn.value);
      epsOut.textContent = fmt(eps);
      minOut.textContent = String(minPts);
      o.eps = eps;
      o.minPts = minPts;
      o.db = CL.dbscan(o.points, eps, minPts);
      o.kd = CL.kDistances(o.points, minPts);
      const count = (kind) => o.db.kind.filter((k) => k === kind).length;
      o.counts = { core: count("core"), border: count("border"), noise: count("noise") };
      // examples for the ε step: one point of each kind
      o.examples = ["core", "border", "noise"].map((kind) => o.db.kind.indexOf(kind)).filter((i) => i >= 0);
    }

    /* -------------------------------------------- helpers */

    const layout = CL.layout(svg, () => ({ plot: o.plot, kchart: o.kchart }));
    const narrow = window.TF.view.narrow;
    const side = () => (narrow.matches ? [60, 500] : [540, 90]);
    const frac = (x) => Math.min(1, Math.max(0, x));

    // ε-circles around the given points.
    function circles(list) {
      o.plot.extra.replaceChildren(
        ...list.map((i) => {
          const [x, y] = px(o.points[i]);
          return s("circle", { class: "cl-ring-eps", cx: x.toFixed(1), cy: y.toFixed(1), r: (o.eps * U).toFixed(1) });
        })
      );
    }

    // The finished clustering: colours, hollow noise, smaller border points.
    function result() {
      const { labels, kind } = o.db;
      o.plot.colour(labels.map((l) => (l >= 0 ? l : null)));
      o.plot.style((i) => (kind[i] === "noise" ? { noise: true } : kind[i] === "border" ? { r: 3.5 } : null));
      o.plot.links([]).centres([]).cells(null);
    }

    const summary = () =>
      `${o.db.clusters} cluster${o.db.clusters === 1 ? "" : "s"}: ${o.counts.core} core, ${o.counts.border} border and ${o.counts.noise} noise points`;
    const kindOf = (i) => o.db.kind[i];

    /* -------------------------------------------- steps */

    const steps = {
      noise() {
        layout({ plot: [0, 0] });
        circles([]);
        o.plot.colour(null).style(null).links([]).centres([]).cells(null).title("the data");
        const scattered = o.data.truth.filter((g) => g === -2).length;
        strip(
          scattered
            ? `${o.n} points: three blobs, plus ${scattered} points scattered at random that belong to no group at all.`
            : `${o.n} points. Switch back to “blobs and noise” to see the scattered points this step describes.`
        );
      },

      eps(t) {
        layout({ plot: [0, 0] });
        const ex = o.examples;
        const i = ex[Math.min(ex.length - 1, Math.floor(frac(t * 1.1) * ex.length))];
        const nb = o.db.nbrs[i];
        circles([i]);
        o.plot
          .colour(null)
          .links(nb.filter((j) => j !== i).map((j) => [o.points[i], o.points[j], "is-trail"]))
          .centres([])
          .cells(null);
        o.plot.style((q) => (q === i ? { r: 7, ring: true } : nb.includes(q) ? null : { dim: true })).title("one neighbourhood");
        const verdict = kindOf(i) === "core" ? `≥ ${o.minPts}, so it is a core point` : `< ${o.minPts}, so it is not a core point`;
        strip(`${pt(o.points[i])} has ${nb.length} point${nb.length === 1 ? "" : "s"} within ε = ${fmt(o.eps)} (itself included): ${verdict}.`);
      },

      core() {
        layout({ plot: [0, 0] });
        circles(o.points.map((_, i) => i).filter((i) => o.db.core[i]));
        o.plot.colour(null).links([]).centres([]).cells(null).title("core points");
        o.plot.style((i) => (o.db.core[i] ? { r: 6, ring: true } : { dim: true }));
        strip(`${o.counts.core} of ${o.n} points have at least ${o.minPts} points within ε = ${fmt(o.eps)}. They are the core points.`);
      },

      grow(t) {
        layout({ plot: [0, 0] });
        circles([]);
        const v = o.db.visits;
        const upTo = Math.min(v.length, Math.floor(frac(t * 1.15) * (v.length + 1)));
        const labels = new Array(o.n).fill(null);
        v.slice(0, upTo).forEach(([i, c]) => (labels[i] = c));
        o.plot.colour(labels).centres([]).cells(null);
        o.plot.links(
          v
            .slice(0, upTo)
            .filter(([, , from]) => from != null)
            .map(([i, , from]) => [o.points[from], o.points[i], "is-trail"])
        );
        const current = upTo > 0 ? v[upTo - 1] : null;
        o.plot.style((i) => (current && i === current[0] ? { r: 7, ring: true } : labels[i] == null ? { dim: true } : null));
        o.plot.title("growing clusters");
        if (!current) return strip("Start at any core point not yet in a cluster. It starts a new cluster.");
        const [i, c, from] = current;
        strip(
          from == null
            ? `${pt(o.points[i])} is a core point in no cluster yet, so it starts cluster ${c + 1}.`
            : `${pt(o.points[i])} is within ε of ${kindOf(from)} point ${pt(o.points[from])}, so it joins cluster ${c + 1}` +
                (kindOf(i) === "core" ? " and, being core, passes it on." : ", but it is not core, so the cluster stops there.")
        );
      },

      border() {
        layout({ plot: [0, 0] });
        circles([]);
        result();
        o.plot.style((i) => (kindOf(i) === "border" ? { r: 6.5, ring: true } : kindOf(i) === "noise" ? { noise: true, dim: true } : { dim: true }));
        o.plot.title("border points");
        strip(
          `${o.counts.border} border points: within ε of a core point, so in its cluster, but with fewer than ${o.minPts} neighbours of their own.`
        );
      },

      result() {
        layout({ plot: [0, 0] });
        circles([]);
        result();
        o.plot.title("DBSCAN");
        const scattered = o.data.truth.map((g, i) => [g, i]).filter(([g]) => g === -2);
        const caught = scattered.filter(([, i]) => o.db.labels[i] < 0).length;
        strip(`${summary()}.` + (scattered.length ? ` ${caught} of the ${scattered.length} scattered points are marked noise.` : ""));
      },

      shapes() {
        layout({ plot: [0, 0] });
        circles([]);
        result();
        o.plot.title(`DBSCAN on “${CL.DATASETS[o.data.name].label}”`);
        const norm = (l) => (l < 0 ? -1 : l);
        const agree = CL.randIndex(o.db.labels.map(norm), o.data.truth.map(norm));
        strip(`${summary()}. Agreement with the true groups: ${(agree * 100).toFixed(0)}% of pairs (noise counted as one group).`);
      },

      kdist() {
        layout({ plot: [0, 0], kchart: side() });
        circles([]);
        result();
        o.plot.title("DBSCAN");
        const knee = o.kd.filter((v) => v > o.eps).length;
        o.kchart.set(
          [
            { values: o.kd, cls: "cl-ink" },
            { values: o.kd.map(() => o.eps), cls: "cl-ref", label: "ε" },
          ],
          null,
          o.kd.map(() => ""),
          o.kd[0]
        );
        strip(
          `Each point's distance to its ${o.minPts}th-nearest point, largest first. ${knee} point${knee === 1 ? " lies" : "s lie"} above ε = ${fmt(o.eps)}: ` +
            `they can't be core points.`
        );
      },

      density() {
        layout({ plot: [0, 0] });
        circles([]);
        result();
        o.plot.title(`DBSCAN on “${CL.DATASETS[o.data.name].label}”`);
        strip(`ε = ${fmt(o.eps)}, minPts = ${o.minPts}: ${summary()}.`);
      },
    };

    function render(step, t) {
      if (!o || !steps[step]) return;
      last = { step, t };
      controls.hidden = step === "noise";
      steps[step](t);
    }

    return { build, render, onAdd: (fn) => (addPoint = fn) };
  };
})();
