// Part 2 of the clustering series: hierarchical (agglomerative) clustering. One scene, nine steps, every number
// from CL.agglomerate on the data shown.
(function () {
  "use strict";

  const CL = window.CL;
  const { h, fmt } = window.TF.view;
  const { scatter, dendrogram } = CL.view;
  CL.scenes = CL.scenes || {};

  const KMAX = 8;
  const pt = (p) => `(${fmt(p[0], 1)}, ${fmt(p[1], 1)})`;

  CL.scenes.part2 = function (stage) {
    const { svg, strip, controls } = stage;
    let o = null;
    let last = { step: null, t: 0 };
    let addPoint = () => {};

    /* -------------------------------------------- controls: the linkage, and k for the cut */

    const linkSelect = h(
      "select",
      { class: "cl-select", id: "cl2-link", "aria-label": "Linkage" },
      ...Object.entries(CL.LINKAGES).map(([value, text]) => h("option", { value, text }))
    );
    const linkWrap = h("span", { class: "tf-check" }, h("label", { for: "cl2-link", text: "linkage" }), linkSelect);
    const slider = h("input", { type: "range", min: 1, max: KMAX, step: 1, value: 3, id: "cl2-k" });
    const kOut = h("output", { for: "cl2-k" });
    const kWrap = h("span", { class: "tf-check" }, h("label", { for: "cl2-k", text: "clusters" }), slider, kOut);
    let kTouched = false;
    controls.append(linkWrap, kWrap);
    linkSelect.addEventListener("change", () => {
      o.tree = o.trees[linkSelect.value];
      o.dendro.set(o.tree);
      render(last.step, last.t);
    });
    slider.addEventListener("input", () => {
      kTouched = true;
      render(last.step, last.t);
    });

    /* -------------------------------------------- build */

    function build(data) {
      svg.replaceChildren();
      const points = data.points;
      const plot = scatter(svg)
        .points(points)
        .onClick((p) => addPoint(p));
      const dendro = dendrogram(svg, { width: 300, height: 300 });
      const trees = {};
      Object.keys(CL.LINKAGES).forEach((L) => (trees[L] = CL.agglomerate(points, L)));
      const tree = trees[linkSelect.value];
      dendro.set(tree);
      const known = data.truth.every((g) => g >= 0);
      o = { data, points, n: points.length, k: data.k, trees, tree, plot, dendro, known };
    }

    /* -------------------------------------------- helpers */

    const layout = CL.layout(svg, () => ({ plot: o.plot, dendro: o.dendro }));
    const narrow = window.TF.view.narrow;
    const side = () => (narrow.matches ? [80, 490] : [520, 80]);
    const linkName = () => CL.LINKAGES[o.tree.linkage];

    // The height halfway between the merges before and after a cut into k clusters.
    function cutHeight(tree, k) {
      const m = tree.merges;
      const count = Math.max(0, tree.n - k);
      if (count === 0) return m[0].height / 2;
      if (count >= m.length) return m[m.length - 1].height * 1.02;
      return (m[count - 1].height + m[count].height) / 2;
    }

    // Draws the state after `count` merges: one line per merge, joining its closest pair of points, and each
    // point coloured by its final cluster (at k) once it is no longer alone.
    function partial(count, k = o.k) {
      const tree = o.tree;
      const final = CL.cutK(tree, k);
      const now = CL.cutAfter(tree, count);
      const sizes = new Map();
      now.forEach((c) => sizes.set(c, (sizes.get(c) || 0) + 1));
      o.plot.colour(final.map((c, i) => (sizes.get(now[i]) > 1 ? c : null)));
      o.plot.links(tree.merges.slice(0, count).map((m) => [o.points[m.pair[0]], o.points[m.pair[1]], "is-trail"]));
      o.plot.centres([]).cells(null);
      return final;
    }

    // The four linkage distances between two groups of points.
    function linkages(A, B) {
      const ds = A.flatMap((i) => B.map((j) => CL.dist(o.points[i], o.points[j])));
      const ma = CL.mean(A.map((i) => o.points[i]));
      const mb = CL.mean(B.map((i) => o.points[i]));
      return {
        single: Math.min(...ds),
        complete: Math.max(...ds),
        average: ds.reduce((s, v) => s + v, 0) / ds.length,
        ward: ((A.length * B.length) / (A.length + B.length)) * CL.dist2(ma, mb),
      };
    }

    const frac = (x) => Math.min(1, Math.max(0, x));
    const plural = (m) => `${m} point${m === 1 ? "" : "s"}`;

    /* -------------------------------------------- steps */

    const steps = {
      alone() {
        layout({ plot: [0, 0], dendro: side() });
        o.plot.colour(null).style(null).links([]).centres([]).cells(null).title("every point is a cluster");
        o.dendro.show(0);
        strip(`${o.n} points, so ${o.n} clusters of one. Hierarchical clustering starts here and only ever merges.`);
      },

      closest() {
        layout({ plot: [0, 0], dendro: side() });
        const m = o.trees.single.merges[0];
        const [i, j] = m.pair;
        o.plot.colour(null).centres([]).cells(null).title("the closest pair");
        o.plot.style((q) => (q === i || q === j ? { r: 7, ring: true } : null));
        o.plot.links([[o.points[i], o.points[j], "is-best"]]);
        o.dendro.show(0);
        strip(
          `Of all ${(o.n * (o.n - 1)) / 2} pairs, the closest is ${pt(o.points[i])} and ${pt(o.points[j])}, ` +
            `${fmt(m.height)} apart. They merge first.`
        );
      },

      merge(t) {
        layout({ plot: [0, 0], dendro: side() });
        const shown = Math.min(8, o.n - 1);
        const count = 1 + Math.min(shown - 1, Math.floor(frac(t * 1.15) * shown));
        partial(count);
        const m = o.tree.merges[count - 1];
        o.plot.style((q) => (m.members.includes(q) ? { r: 6.5, ring: true } : null)).title(`merge ${count}`);
        o.dendro.show(count, null, null, count - 1);
        strip(
          `merge ${count}: ${m.members.length === 2 ? "two points" : `a group of ${m.members.length}`} joined at height ${fmt(m.height)}. ` +
            `${o.n - count} clusters left.`
        );
      },

      linkage() {
        layout({ plot: [0, 0], dendro: side() });
        // the two clusters the chosen linkage joins when 4 are left
        const tree = o.tree;
        const count = Math.max(0, o.n - 4);
        const m = tree.merges[count];
        const A = tree.merges.find((x) => x.id === m.a)?.members || [m.a];
        const B = tree.merges.find((x) => x.id === m.b)?.members || [m.b];
        const d = linkages(A, B);
        let near = null;
        let far = null;
        A.forEach((i) =>
          B.forEach((j) => {
            const v = CL.dist(o.points[i], o.points[j]);
            if (!near || v < near[2]) near = [i, j, v];
            if (!far || v > far[2]) far = [i, j, v];
          })
        );
        o.plot
          .colour(o.points.map((_, i) => (A.includes(i) ? 0 : B.includes(i) ? 1 : null)))
          .centres([])
          .cells(null);
        o.plot.style((i) => (A.includes(i) || B.includes(i) ? null : { dim: true }));
        o.plot.links([
          [o.points[near[0]], o.points[near[1]], "is-best"],
          [o.points[far[0]], o.points[far[1]], ""],
        ]);
        o.plot.title("distance between two groups");
        o.dendro.show(count + 1, null, null, count);
        strip(
          `Blue (${plural(A.length)}) to red (${plural(B.length)}): single ${fmt(d.single)} (solid line) · complete ${fmt(d.complete)} (dashed) · ` +
            `average ${fmt(d.average)} · Ward ${fmt(d.ward)}`
        );
      },

      build(t) {
        layout({ plot: [0, 0], dendro: side() });
        const count = Math.min(o.n - 1, Math.floor(frac(t * 1.15) * (o.n - 1)) + 1);
        partial(count);
        o.plot.style(null).title(`${linkName()} linkage · ${o.n - count} clusters`);
        o.dendro.show(count, null, null, count - 1);
        strip(`merge ${count} of ${o.n - 1}, at height ${fmt(o.tree.merges[count - 1].height)}. ${o.n - count} clusters left.`);
      },

      tree() {
        layout({ plot: [0, 0], dendro: side() });
        partial(o.n - 1);
        o.plot.style(null).title("one cluster");
        o.dendro.show(o.n - 1);
        const hs = o.tree.merges.map((m) => m.height);
        const gaps = hs.slice(1).map((v, i) => v - hs[i]);
        const g = gaps.indexOf(Math.max(...gaps));
        strip(
          `The last three merges happen at heights ${hs
            .slice(-3)
            .map((v) => fmt(v))
            .join(", ")}. ` + `The biggest jump is after merge ${g + 1}, which leaves ${o.n - g - 1} clusters.`
        );
      },

      cut(t) {
        layout({ plot: [0, 0], dendro: side() });
        if (!kTouched) slider.value = String(Math.min(KMAX, 1 + Math.floor(frac(t * 1.2) * KMAX)));
        const k = Number(slider.value);
        kOut.textContent = String(k);
        const labels = CL.cutK(o.tree, k);
        const hcut = cutHeight(o.tree, k);
        o.plot.colour(labels).style(null).links([]).centres([]).cells(null).title(`cut into ${k}`);
        o.dendro.show(o.n - 1, labels, hcut);
        strip(`Cut at height ${fmt(hcut)}: every merge below the line stays, every one above is undone, leaving ${k} cluster${k > 1 ? "s" : ""}.`);
      },

      linkages() {
        layout({ plot: [0, 0], dendro: side() });
        const labels = CL.cutK(o.tree, o.k);
        o.plot.colour(labels).style(null).links([]).centres([]).cells(null).title(`${linkName()} linkage, ${o.k} clusters`);
        o.dendro.show(o.n - 1, labels, cutHeight(o.tree, o.k));
        const truth = o.data.truth.map((g, i) => (g >= 0 ? g : labels[i]));
        const score = (L) => `${CL.LINKAGES[L]} ${(CL.randIndex(CL.cutK(o.trees[L], o.k), truth) * 100).toFixed(0)}%`;
        strip(`Agreement with the true groups (share of pairs): ${Object.keys(CL.LINKAGES).map(score).join(" · ")}`);
      },

      ward() {
        layout({ plot: [0, 0], dendro: side() });
        const tree = o.trees.ward;
        const labels = CL.cutK(tree, o.k);
        const cents = Array.from({ length: o.k }, (_, c) => CL.mean(o.points.filter((_, i) => labels[i] === c)));
        const total = tree.merges.slice(0, o.n - o.k).reduce((s, m) => s + m.height, 0);
        const km = CL.bestOf(o.points, o.k, 10);
        o.plot.colour(labels).style(null).links([]).cells(null).centres(cents).title(`Ward, ${o.k} clusters`);
        o.dendro.set(tree); // this step always shows the Ward tree
        o.dendro.show(o.n - 1, labels, cutHeight(tree, o.k));
        strip(
          `The first ${o.n - o.k} Ward merges cost ${fmt(total)} in total, which is exactly the inertia of these ${o.k} clusters, ` +
            `${fmt(CL.inertia(o.points, labels, cents))}. k-means (best of 10 starts): ${fmt(km.inertia)}.`
        );
      },
    };

    function render(step, t) {
      if (!o || !steps[step]) return;
      // leaving the Ward step puts the chosen linkage's tree back
      if (last.step === "ward" && step !== "ward") o.dendro.set(o.tree);
      last = { step, t };
      linkWrap.hidden = !["merge", "linkage", "build", "tree", "cut", "linkages"].includes(step);
      kWrap.hidden = step !== "cut";
      controls.hidden = linkWrap.hidden && kWrap.hidden;
      if (step !== "cut") kTouched = false;
      steps[step](t);
    }

    return { build, render, onAdd: (fn) => (addPoint = fn) };
  };
})();
