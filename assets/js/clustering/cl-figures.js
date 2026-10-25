// Standalone figures for the "Going deeper" sections of the clustering series. Each <figure data-cl-figure="name">
// is filled by figures[name]. Every number is computed here, from CL.
(function () {
  "use strict";

  const CL = window.CL;
  const { h, s, fmt } = window.TF.view;

  const figures = {
    // Six numbers on a line and a movable centre: the sum of squared distances is a parabola, lowest at the mean.
    mean(root) {
      const xs = [1, 2, 2.5, 4, 7, 8.5];
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      const cost = (c) => xs.reduce((sum, x) => sum + (x - c) ** 2, 0);
      const W = 560;
      const X = (v) => 20 + (v / 10) * (W - 40);
      const H = 150; // parabola panel height
      const top = cost(10);
      const Y = (v) => 40 + H - (v / top) * H;
      const svg = s("svg", {
        class: "cl-fig-svg",
        viewBox: `0 0 ${W} 250`,
        role: "img",
        "aria-label": "Sum of squared distances against the position of the centre",
      });
      const curve = Array.from({ length: 101 }, (_, i) => {
        const c = i / 10;
        return `${X(c).toFixed(1)} ${Y(cost(c)).toFixed(1)}`;
      });
      const marker = s("circle", { class: "cl-mark is-focus", r: 5 });
      const centre = s("g", { class: "cl-c1" }, s("circle", { class: "cl-centre-halo", r: 9 }), s("circle", { class: "cl-centre-dot", r: 5 }));
      const readout = s("text", { class: "tf-small", x: 20, y: 20 });
      svg.append(
        s("path", { class: "cl-line", d: `M ${curve.join(" L ")}` }),
        s("line", { class: "cl-link", x1: X(m), y1: 40, x2: X(m), y2: 222 }),
        s("text", { class: "tf-small", x: X(m) + 6, y: 52, text: `mean ${fmt(m)}` }),
        s("line", { class: "tf-stroke-muted", x1: 20, y1: 222, x2: W - 20, y2: 222 }),
        ...xs.map((x) => s("circle", { class: "cl-pt cl-c0", cx: X(x), cy: 222, r: 5 })),
        centre,
        marker,
        readout
      );
      const slider = h("input", { type: "range", min: 0, max: 100, value: 75, "aria-label": "Centre position" });
      const out = h("output", { class: "tf-num" });
      function draw() {
        const c = Number(slider.value) / 10;
        centre.setAttribute("transform", `translate(${X(c)} 222)`);
        marker.setAttribute("cx", X(c));
        marker.setAttribute("cy", Y(cost(c)));
        out.textContent = `centre ${fmt(c, 1)}`;
        readout.textContent = `Σ (x − centre)² = ${fmt(cost(c))}   =   ${fmt(cost(m))} at the mean  +  6 × (${fmt(c, 1)} − ${fmt(m)})²`;
      }
      slider.addEventListener("input", draw);
      root.append(h("div", { class: "cl-fig-row" }, h("label", { class: "tf-label", text: "centre" }), slider, out), svg);
      draw();
    },

    // 200 runs from random starts and 200 from k-means++ starts on the default points: where do they end?
    starts(root) {
      const data = CL.dataset("blobs", 1);
      const runs = 200;
      const finals = (init) => Array.from({ length: runs }, (_, i) => CL.kmeans(data.points, data.k, i + 1, init).inertia);
      const groups = [
        { name: "random start", values: finals("random") },
        { name: "k-means++ start", values: finals("plusplus") },
      ];
      const best = Math.min(...groups.flatMap((g) => g.values));
      // runs that end at the same inertia (to 2 decimals) share a bar
      const keys = [...new Set(groups.flatMap((g) => g.values.map((v) => v.toFixed(2))))].sort((a, b) => a - b);
      const W = 600;
      const rowH = 22;
      const barW = 300;
      const rows = keys.reduce((sum, key) => sum + groups.filter((g) => g.values.some((v) => v.toFixed(2) === key)).length, 0);
      const svg = s("svg", {
        class: "cl-fig-svg",
        viewBox: `0 0 ${W} ${30 + rows * rowH + keys.length * 6}`,
        role: "img",
        "aria-label": "Final inertia of 200 runs from each kind of start",
      });
      let y = 24;
      svg.append(
        s("text", { class: "tf-small", x: 0, y: 12, text: "final inertia" }),
        s("text", { class: "tf-small", x: 120, y: 12, text: `runs out of ${runs}` })
      );
      keys.forEach((key) => {
        svg.append(s("text", { class: "tf-num tf-small", x: 0, y: y + 15, text: key + (Number(key) === Number(best.toFixed(2)) ? " (best)" : "") }));
        groups.forEach((g, gi) => {
          const count = g.values.filter((v) => v.toFixed(2) === key).length;
          if (!count) return;
          const w = (count / runs) * barW;
          svg.append(
            s("rect", { class: `cl-bar-${gi}`, x: 120, y: y + 3, width: Math.max(w, 1.5), height: rowH - 8 }),
            s("text", { class: "tf-small", x: 120 + w + 6, y: y + 14, text: `${count} ${gi ? "k-means++" : "random"}` })
          );
          y += rowH;
        });
        y += 6;
      });
      const stuck = (g) => g.values.filter((v) => v > best * 1.05).length;
      root.append(
        svg,
        h("figcaption", {
          text: `Stuck above the best inertia (${fmt(best)}): ${stuck(groups[0])} of ${runs} random starts, ${stuck(groups[1])} of ${runs} k-means++ starts.`,
        })
      );
    },
  };

  document.querySelectorAll("[data-cl-figure]").forEach((root) => {
    const make = figures[root.dataset.clFigure];
    if (!make) return;
    root.querySelector("noscript")?.remove();
    make(root);
  });
})();
