// SVG pieces for the clustering series: a scatter plot with centres, Voronoi cells and connector lines, and a
// small line chart. Built on the helpers in tf-view.js (h, s, place, animate); colours come from clustering.css.
(function () {
  "use strict";

  const CL = window.CL;
  const { s, clamp, fmt } = window.TF.view;

  const SIZE = 440; // the plot is SIZE × SIZE viewBox units for the data square [0, 10]²
  const U = SIZE / CL.BOX;
  const px = (p) => [p[0] * U, (CL.BOX - p[1]) * U];
  const colour = (j) => (j == null || j < 0 ? "cl-none" : `cl-c${j % 8}`);

  /* ---------------------------------------------------------------- Voronoi cells */

  // Keeps the part of a polygon on the side of the line a·x ≤ b (one Sutherland–Hodgman pass).
  function clip(poly, a, b) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const fp = a[0] * p[0] + a[1] * p[1] - b;
      const fq = a[0] * q[0] + a[1] * q[1] - b;
      if (fp <= 0) out.push(p);
      if (fp * fq < 0) {
        const t = fp / (fp - fq);
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    return out;
  }

  // The region of the square closer to centres[j] than to any other centre. Each "closer to c_j than to c_m" is
  // a half-plane, ‖x − c_j‖² ≤ ‖x − c_m‖² ⇔ 2(c_m − c_j)·x ≤ ‖c_m‖² − ‖c_j‖², so the cell is a convex polygon.
  function voronoiCell(centres, j) {
    let poly = [
      [0, 0],
      [CL.BOX, 0],
      [CL.BOX, CL.BOX],
      [0, CL.BOX],
    ];
    const c = centres[j];
    centres.forEach((m, i) => {
      if (i === j || poly.length === 0) return;
      if (m[0] === c[0] && m[1] === c[1]) return;
      poly = clip(poly, [2 * (m[0] - c[0]), 2 * (m[1] - c[1])], m[0] ** 2 + m[1] ** 2 - c[0] ** 2 - c[1] ** 2);
    });
    return poly;
  }

  // The axes of a covariance [[a, b], [b, c]]: its eigenvalues give the squared radii, its first eigenvector the
  // angle of the long axis.
  function ellipse(S) {
    const [a, b, c] = [S[0][0], S[0][1], S[1][1]];
    const mid = (a + c) / 2;
    const half = Math.sqrt(((a - c) / 2) ** 2 + b * b);
    return { rx: Math.sqrt(Math.max(mid + half, 1e-9)), ry: Math.sqrt(Math.max(mid - half, 1e-9)), angle: 0.5 * Math.atan2(2 * b, a - c) };
  }

  /* ---------------------------------------------------------------- scatter plot */

  function scatter(parent, opts = {}) {
    const g = s("g", { class: "cl-plot tf-obj" });
    const frame = s("rect", { class: "cl-frame", x: 0, y: 0, width: SIZE, height: SIZE });
    const cellLayer = s("g", { class: "cl-cells" });
    const linkLayer = s("g", { class: "cl-links" });
    const pointLayer = s("g", { class: "cl-points" });
    const extraLayer = s("g", { class: "cl-extra" });
    const centreLayer = s("g", { class: "cl-centres" });
    const ellipseLayer = s("g", { class: "cl-ellipses" });
    const title = s("text", { class: "tf-mat-title", x: 0, y: -12, text: opts.title || "" });
    g.append(frame, cellLayer, ellipseLayer, linkLayer, pointLayer, extraLayer, centreLayer, title);
    parent.append(g);

    let dots = [];
    let centres = [];
    let cells = [];

    const api = {
      el: g,
      SIZE,
      px,
      title: (text) => (title.textContent = text || ""),
      extra: extraLayer,

      // One circle per point. Rebuilding drops the colours.
      points(points) {
        dots = points.map((p) => {
          const [x, y] = px(p);
          return s("circle", { class: "cl-pt cl-none", cx: x.toFixed(1), cy: y.toFixed(1), r: 5 });
        });
        pointLayer.replaceChildren(...dots);
        return api;
      },

      // labels[i] is a cluster index, or null/−1 for "not assigned yet". upTo colours only the first upTo points.
      colour(labels, upTo = Infinity) {
        // swap only the colour class, so the emphasis set by style() survives
        dots.forEach((d, i) => {
          const keep = [...d.classList].filter((c) => !c.startsWith("cl-c") && c !== "cl-none");
          d.setAttribute("class", `${keep.join(" ")} ${colour(labels && i < upTo ? labels[i] : null)}`);
        });
        return api;
      },

      // Per-point emphasis: a radius, an opacity, and whether to dim, ring or hollow it (noise).
      style(fn) {
        dots.forEach((d, i) => {
          const { r = 5, dim = false, ring = false, noise = false, alpha = null } = fn ? fn(i) || {} : {};
          d.setAttribute("r", r);
          d.style.opacity = alpha == null ? "" : String(alpha);
          d.classList.toggle("is-dim", dim);
          d.classList.toggle("is-ring", ring);
          d.classList.toggle("is-noise", noise);
        });
        return api;
      },

      // Centres as ringed markers that glide (CSS transition on transform) when their position changes.
      centres(list, show = list.length) {
        while (centres.length < list.length) {
          const j = centres.length;
          const el = s(
            "g",
            { class: `cl-centre ${colour(j)}` },
            s("circle", { class: "cl-centre-halo", r: 11 }),
            s("circle", { class: "cl-centre-dot", r: 7 })
          );
          centreLayer.append(el);
          centres.push(el);
        }
        centres.forEach((el, j) => {
          const on = j < list.length && j < show;
          if (j < list.length) {
            const [x, y] = px(list[j]);
            el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
          }
          el.style.opacity = on ? "1" : "0";
        });
        return api;
      },

      // The Voronoi cells of the centres, faintly tinted. Pass null to hide them.
      cells(list) {
        if (!list) {
          cells.forEach((c) => (c.style.opacity = "0"));
          return api;
        }
        while (cells.length < list.length) {
          const el = s("polygon", { class: `cl-cell ${colour(cells.length)}` });
          cellLayer.append(el);
          cells.push(el);
        }
        cells.forEach((el, j) => {
          if (j >= list.length) return (el.style.opacity = "0");
          const poly = voronoiCell(list, j).map(px);
          el.setAttribute("points", poly.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" "));
          el.style.opacity = "1";
        });
        return api;
      },

      // Gaussian components as ellipses at 1 and 2 standard deviations: [{ mean, cov }, …], or [] to hide them.
      ellipses(list) {
        const nodes = [];
        list.forEach(({ mean, cov }, j) => {
          const e = ellipse(cov);
          const [x, y] = px(mean);
          // y points down on screen, so the angle flips
          const transform = `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((-e.angle * 180) / Math.PI).toFixed(1)})`;
          [1, 2].forEach((r) =>
            nodes.push(
              s("ellipse", {
                class: `cl-ellipse ${colour(j)}${r === 1 ? " is-inner" : ""}`,
                rx: (r * e.rx * U).toFixed(1),
                ry: (r * e.ry * U).toFixed(1),
                transform,
              })
            )
          );
          nodes.push(s("circle", { class: `cl-mean ${colour(j)}`, r: 4, cx: x.toFixed(1), cy: y.toFixed(1) }));
        });
        ellipseLayer.replaceChildren(...nodes);
        return api;
      },

      // Lines from points to places: [[from, to, className], …] in data coordinates.
      links(list) {
        linkLayer.replaceChildren(
          ...list.map(([a, b, cls]) => {
            const [x1, y1] = px(a);
            const [x2, y2] = px(b);
            return s("line", { class: `cl-link ${cls || ""}`, x1, y1, x2, y2 });
          })
        );
        return api;
      },

      // Calls fn(point in data coordinates) when the plot is clicked.
      onClick(fn) {
        frame.addEventListener("click", (event) => {
          const m = frame.getScreenCTM();
          if (!m) return;
          const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
          fn([clamp(pt.x / U, 0.15, CL.BOX - 0.15), clamp(CL.BOX - pt.y / U, 0.15, CL.BOX - 0.15)]);
        });
        return api;
      },
    };
    return api;
  }

  /* ---------------------------------------------------------------- line chart */

  // A small chart of one or two series against 1…n. set(series, highlight) redraws it; each series is
  // { values, cls, label }. yMax fixes the top of the axis (default: the largest value).
  function chart(parent, opts) {
    const W = opts.width ?? 260;
    const H = opts.height ?? 150;
    const g = s("g", { class: "cl-chart tf-obj" }, s("rect", { x: -40, y: -30, width: W + 60, height: H + 66, fill: "none" }));
    const title = s("text", { class: "tf-mat-title", x: 0, y: -14, text: opts.title || "" });
    const body = s("g");
    g.append(
      title,
      s("line", { class: "tf-stroke-muted", x1: 0, y1: H, x2: W, y2: H }),
      s("line", { class: "tf-stroke-muted", x1: 0, y1: 0, x2: 0, y2: H }),
      body
    );
    parent.append(g);
    return {
      el: g,
      title: (text) => (title.textContent = text),
      set(series, highlight = null, xLabels = null, yMax = null) {
        const n = Math.max(...series.map((sr) => sr.values.length));
        const top = yMax ?? Math.max(1e-9, ...series.flatMap((sr) => sr.values.filter((v) => v != null)));
        const X = (i) => (n === 1 ? W / 2 : (i * W) / (n - 1));
        const Y = (v) => H - clamp(v / top, 0, 1) * (H - 6);
        const nodes = [];
        series.forEach((sr) => {
          const pts = sr.values.map((v, i) => (v == null ? null : [X(i), Y(v)])).filter(Boolean);
          if (pts.length > 1)
            nodes.push(s("path", { class: `cl-line ${sr.cls || ""}`, d: `M ${pts.map((p) => p.map((v) => v.toFixed(1)).join(" ")).join(" L ")}` }));
          sr.values.forEach((v, i) => {
            if (v == null) return;
            nodes.push(
              s("circle", { class: `cl-mark ${sr.cls || ""}${i === highlight ? " is-focus" : ""}`, cx: X(i), cy: Y(v), r: i === highlight ? 5 : 3 })
            );
          });
          if (sr.label) {
            const lastV = [...sr.values].reverse().find((v) => v != null);
            nodes.push(s("text", { class: `tf-small cl-line-label ${sr.cls || ""}`, x: W + 6, y: Y(lastV) + 4, text: sr.label }));
          }
        });
        const labels = xLabels || Array.from({ length: n }, (_, i) => String(i + 1));
        labels.forEach((text, i) => {
          if (n > 12 && i % 2) return;
          nodes.push(s("text", { class: `tf-small${i === highlight ? " is-focus" : ""}`, x: X(i), y: H + 16, "text-anchor": "middle", text }));
        });
        nodes.push(s("text", { class: "tf-small", x: -6, y: 10, "text-anchor": "end", text: fmt(top, top >= 100 ? 0 : 1) }));
        nodes.push(s("text", { class: "tf-small", x: -6, y: H + 4, "text-anchor": "end", text: "0" }));
        if (opts.xTitle) nodes.push(s("text", { class: "tf-small", x: W / 2, y: H + 34, "text-anchor": "middle", text: opts.xTitle }));
        body.replaceChildren(...nodes);
      },
    };
  }

  /* ---------------------------------------------------------------- dendrogram */

  // The merge tree drawn upside down: leaves along the bottom, each merge a ⊓ joining its two children at the
  // height of the merge. set(tree) draws it; show(count, labels, cutHeight) reveals the first `count` merges,
  // colours the merges inside each cut cluster, and draws the cut line.
  function dendrogram(parent, opts = {}) {
    const W = opts.width ?? 300;
    const H = opts.height ?? 300;
    const g = s("g", { class: "cl-tree tf-obj" }, s("rect", { x: -40, y: -30, width: W + 50, height: H + 50, fill: "none" }));
    const title = s("text", { class: "tf-mat-title", x: 0, y: -14, text: opts.title || "dendrogram" });
    const body = s("g");
    const cut = s("line", { class: "cl-cut", x1: -6, x2: W + 6 });
    const axis = s("g");
    g.append(title, axis, body, cut);
    parent.append(g);
    let tree = null;
    let paths = [];
    let Y = () => 0;
    let top = 1;
    return {
      el: g,
      title: (text) => (title.textContent = text),
      set(next) {
        tree = next;
        const { n, merges, order } = tree;
        top = merges.length ? merges[merges.length - 1].height : 1;
        Y = (v) => H - (v / top) * (H - 8);
        const pos = new Map();
        order.forEach((leaf, i) => pos.set(leaf, [n === 1 ? W / 2 : (i * W) / (n - 1), H]));
        paths = merges.map((m) => {
          const [xa, ya] = pos.get(m.a);
          const [xb, yb] = pos.get(m.b);
          const y = Y(m.height);
          pos.set(m.id, [(xa + xb) / 2, y]);
          return s("path", { d: `M ${xa.toFixed(1)} ${ya.toFixed(1)} V ${y.toFixed(1)} H ${xb.toFixed(1)} V ${yb.toFixed(1)}` });
        });
        body.replaceChildren(...paths);
        axis.replaceChildren(
          s("line", { class: "tf-stroke-muted", x1: -6, y1: 0, x2: -6, y2: H }),
          s("text", { class: "tf-small", x: -10, y: Y(top) + 4, "text-anchor": "end", text: fmt(top, top >= 10 ? 0 : 1) }),
          s("text", { class: "tf-small", x: -10, y: H + 4, "text-anchor": "end", text: "0" }),
          s("text", { class: "tf-small", x: W / 2, y: H + 18, "text-anchor": "middle", text: `${n} points` })
        );
      },
      // count: merges shown; labels: a cluster per point (colours whole subtrees); cutHeight: where to draw the cut
      show(count, labels = null, cutHeight = null, focus = null) {
        if (!tree) return;
        paths.forEach((p, m) => {
          const merge = tree.merges[m];
          p.style.opacity = m < count ? "1" : "0";
          const inside = labels && cutHeight != null && merge.height <= cutHeight + 1e-9;
          p.setAttribute("class", `${inside ? `is-on ${colour(labels[merge.members[0]])}` : ""}${m === focus ? " is-on cl-none is-focus" : ""}`);
        });
        if (cutHeight == null) cut.style.opacity = "0";
        else {
          const y = Y(cutHeight).toFixed(1);
          cut.setAttribute("y1", y);
          cut.setAttribute("y2", y);
          cut.style.opacity = "1";
        }
      },
    };
  }

  CL.view = { SIZE, px, colour, voronoiCell, ellipse, scatter, chart, dendrogram };
})();
