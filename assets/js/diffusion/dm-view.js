// SVG pieces for the diffusion series: a square plot of the plane with point clouds, rings, arrows, paths and a
// density shading, plus a small line chart. Built on the helpers in tf-view.js (h, s, place); colours come from
// diffusion.css, so dark mode is free. A cloud of a thousand points is drawn as one <path>, so redrawing it on
// every scroll event stays cheap.
(function () {
  "use strict";

  const DM = window.DM;
  const { s, clamp, fmt } = window.TF.view;

  const SIZE = 400; // a plot is SIZE × SIZE viewBox units

  /* ---------------------------------------------------------------- plot */

  let clipCount = 0;

  // A plot of the square [−R, R]². Layers, bottom to top: frame, axes, shading, rings, paths, clouds, arrows, marks.
  function plot(parent, opts = {}) {
    let R = opts.range ?? 3;
    let U = SIZE / (2 * R);
    let cx = 0;
    let cy = 0;
    const px = (x, y) => [(x - cx + R) * U, (R - (y - cy)) * U];

    const g = s("g", { class: "dm-plot tf-obj" });
    const clipId = `dm-clip-${++clipCount}`;
    const frame = s("rect", { class: "dm-frame", x: 0, y: 0, width: SIZE, height: SIZE });
    const axes = s("g", { class: "dm-axes" });
    const shade = s("g", { class: "dm-shade" });
    const rings = s("g", { class: "dm-rings" });
    const paths = s("g", { class: "dm-paths" });
    const clouds = s("g", { class: "dm-clouds" });
    const arrows = s("g", { class: "dm-arrows" });
    const marks = s("g", { class: "dm-marks" });
    const inner = s("g", { "clip-path": `url(#${clipId})` }, axes, shade, rings, paths, clouds, arrows, marks);
    const title = s("text", { class: "tf-mat-title", x: 0, y: -12, text: opts.title || "" });
    const corner = s("text", { class: "tf-small dm-corner", x: SIZE - 6, y: SIZE - 8, "text-anchor": "end" });
    g.append(s("clipPath", { id: clipId }, s("rect", { x: 0, y: 0, width: SIZE, height: SIZE })), frame, inner, corner, title);
    parent.append(g);

    const named = new Map(); // cloud name → path

    function drawAxes() {
      const [x0, y0] = px(0, 0);
      const ticks = [];
      for (let v = Math.ceil(cx - R); v <= Math.floor(cx + R); v++) {
        if (v === 0) continue;
        const [x] = px(v, 0);
        ticks.push(s("line", { class: "dm-tick", x1: x, y1: 0, x2: x, y2: SIZE }));
      }
      for (let v = Math.ceil(cy - R); v <= Math.floor(cy + R); v++) {
        if (v === 0) continue;
        const [, y] = px(0, v);
        ticks.push(s("line", { class: "dm-tick", x1: 0, y1: y, x2: SIZE, y2: y }));
      }
      axes.replaceChildren(
        ...ticks,
        s("line", { class: "dm-axis", x1: x0, y1: 0, x2: x0, y2: SIZE }),
        s("line", { class: "dm-axis", x1: 0, y1: y0, x2: SIZE, y2: y0 })
      );
    }
    drawAxes();

    // One <path> of small circles. xs is flat [x, y, …]; upTo limits how many are drawn.
    function dotsPath(xs, r, upTo = Infinity) {
      const n = Math.min(xs.length / 2, upTo);
      const d = new Array(n);
      const r2 = (2 * r).toFixed(1);
      const rs = r.toFixed(1);
      for (let i = 0; i < n; i++) {
        const [x, y] = px(xs[2 * i], xs[2 * i + 1]);
        if (x < -10 || y < -10 || x > SIZE + 10 || y > SIZE + 10) continue;
        d[i] = `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${rs} ${rs} 0 1 0 ${r2} 0a${rs} ${rs} 0 1 0 -${r2} 0`;
      }
      return d.join("");
    }

    const api = {
      el: g,
      box: { x: -4, y: -30, width: SIZE + 8, height: SIZE + 34 },
      SIZE,
      px,
      get range() {
        return R;
      },
      title(text) {
        title.textContent = text || "";
        return api;
      },
      corner(text) {
        corner.textContent = text || "";
        return api;
      },

      // Re-centres and re-scales the view: the plot shows [x − r, x + r] × [y − r, y + r].
      view(r, x = 0, y = 0) {
        if (r === R && x === cx && y === cy) return api;
        R = r;
        U = SIZE / (2 * R);
        cx = x;
        cy = y;
        drawAxes();
        return api;
      },

      // A named cloud of points: cls picks the colour (diffusion.css), r the dot radius. Pass null to hide it.
      cloud(name, xs, cls = "dm-data", r = 2.2, upTo = Infinity) {
        let p = named.get(name);
        if (!p) {
          p = s("path", { class: `dm-cloud ${cls}` });
          named.set(name, p);
          clouds.append(p);
        }
        p.setAttribute("class", `dm-cloud ${cls}`);
        if (!xs) {
          p.setAttribute("d", "");
          return api;
        }
        p.setAttribute("d", dotsPath(xs, r, upTo));
        return api;
      },

      // Circles in data units: [{ c: [x, y], r, cls }]. Used for Gaussians drawn at 1 and 2 standard deviations.
      rings(list) {
        rings.replaceChildren(
          ...list.map(({ c, r, cls }) => {
            const [x, y] = px(c[0], c[1]);
            return s("circle", { class: `dm-ring ${cls || ""}`, cx: x.toFixed(1), cy: y.toFixed(1), r: Math.max(0.5, r * U).toFixed(1) });
          })
        );
        return api;
      },

      // Polylines in data units: [{ pts: [[x, y], …], cls }].
      paths(list) {
        paths.replaceChildren(
          ...list.map(({ pts, cls }) =>
            s("path", {
              class: `dm-path ${cls || ""}`,
              d: `M${pts
                .map(([x, y]) =>
                  px(x, y)
                    .map((v) => v.toFixed(1))
                    .join(" ")
                )
                .join("L")}`,
            })
          )
        );
        return api;
      },

      // Arrows from a to b in data units: [{ a: [x, y], b: [x, y], cls }]. Arrowheads scale with length, so a
      // field of short arrows stays readable.
      arrows(list) {
        const nodes = [];
        list.forEach(({ a, b, cls }) => {
          const [x1, y1] = px(a[0], a[1]);
          const [x2, y2] = px(b[0], b[1]);
          const L = Math.hypot(x2 - x1, y2 - y1);
          if (L < 0.5) return;
          const hd = Math.min(7, 0.4 * L);
          const ux = (x2 - x1) / L;
          const uy = (y2 - y1) / L;
          const bx = x2 - ux * hd;
          const by = y2 - uy * hd;
          const f = (v) => v.toFixed(1);
          nodes.push(
            s("path", {
              class: `dm-arrow ${cls || ""}`,
              d: `M${f(x1)} ${f(y1)}L${f(bx)} ${f(by)}M${f(x2)} ${f(y2)}L${f(bx - uy * hd * 0.5)} ${f(by + ux * hd * 0.5)}L${f(bx + uy * hd * 0.5)} ${f(by - ux * hd * 0.5)}Z`,
            })
          );
        });
        arrows.replaceChildren(...nodes);
        return api;
      },

      // Labelled markers: [{ c: [x, y], label, cls, r }].
      marks(list) {
        marks.replaceChildren(
          ...list.flatMap(({ c, label, cls, r = 5, dx = 8, dy = -8 }) => {
            const [x, y] = px(c[0], c[1]);
            const nodes = [s("circle", { class: `dm-mark ${cls || ""}`, cx: x.toFixed(1), cy: y.toFixed(1), r })];
            if (label) nodes.push(s("text", { class: `dm-mark-label ${cls || ""}`, x: (x + dx).toFixed(1), y: (y + dy).toFixed(1), text: label }));
            return nodes;
          })
        );
        return api;
      },

      // Shades the plot by a density: fn(x, y) ≥ 0 on an n × n grid, drawn as 8 bands of rising opacity (one
      // <path> each, so the colour follows the theme). Pass null to clear it.
      shade(fn, n = 64, cls = "dm-heat") {
        if (!fn) {
          shade.replaceChildren();
          return api;
        }
        const vals = new Float64Array(n * n);
        let top = 0;
        const step = (2 * R) / n;
        for (let j = 0; j < n; j++)
          for (let i = 0; i < n; i++) {
            const v = fn(cx - R + (i + 0.5) * step, cy + R - (j + 0.5) * step);
            vals[j * n + i] = v;
            if (v > top) top = v;
          }
        const bands = Array.from({ length: 8 }, () => []);
        const cell = SIZE / n;
        for (let j = 0; j < n; j++)
          for (let i = 0; i < n; i++) {
            const b = Math.min(7, Math.floor((vals[j * n + i] / (top || 1)) * 8.999) - 1);
            if (b < 0) continue;
            bands[b].push(`M${(i * cell).toFixed(1)} ${(j * cell).toFixed(1)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`);
          }
        shade.replaceChildren(...bands.map((d, b) => s("path", { class: cls, d: d.join(""), "fill-opacity": ((b + 1) / 8) * 0.85 })));
        return api;
      },

      // Calls fn([x, y]) in data units when the plot is clicked or dragged on.
      onPoint(fn) {
        let down = false;
        const at = (event) => {
          const m = frame.getScreenCTM();
          if (!m) return;
          const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
          fn([cx - R + clamp(pt.x, 0, SIZE) / U, cy + R - clamp(pt.y, 0, SIZE) / U]);
        };
        frame.addEventListener("pointerdown", (event) => {
          down = true;
          frame.setPointerCapture?.(event.pointerId);
          at(event);
        });
        frame.addEventListener("pointermove", (event) => down && at(event));
        frame.addEventListener("pointerup", () => (down = false));
        frame.addEventListener("pointercancel", () => (down = false));
        frame.classList.add("is-pickable");
        return api;
      },
    };
    return api;
  }

  /* ---------------------------------------------------------------- chart */

  // A line chart. set({ series, x: [x0, x1], y: [y0, y1], cursor, log }) redraws it. Each series is
  // { values: [[x, y], …], cls, label }. cursor draws a vertical line at that x. yLog plots log10(y).
  function chart(parent, opts = {}) {
    const W = opts.width ?? 280;
    const H = opts.height ?? 140;
    const g = s("g", { class: "dm-chart tf-obj" });
    const title = s("text", { class: "tf-mat-title", x: 0, y: -14, text: opts.title || "" });
    const body = s("g");
    g.append(
      s("rect", { x: -44, y: -32, width: W + 100, height: H + 74, fill: "none" }),
      title,
      s("line", { class: "tf-stroke-muted", x1: 0, y1: H, x2: W, y2: H }),
      s("line", { class: "tf-stroke-muted", x1: 0, y1: 0, x2: 0, y2: H }),
      body
    );
    parent.append(g);
    const api = {
      el: g,
      box: { x: -44, y: -32, width: W + 100, height: H + 74 },
      title: (text) => (title.textContent = text || ""),
      set({ series, x, y, cursor = null, yLog = false, xLabel = opts.xTitle, yTicks = null, marks = [] }) {
        const tf = (v) => (yLog ? Math.log10(Math.max(v, 1e-12)) : v);
        const [x0, x1] = x;
        const [y0, y1] = y.map(tf);
        const X = (v) => ((v - x0) / (x1 - x0 || 1)) * W;
        const Y = (v) => H - clamp((tf(v) - y0) / (y1 - y0 || 1), -0.02, 1.02) * H;
        const nodes = [];
        series.forEach((sr) => {
          const pts = sr.values.filter((p) => p && Number.isFinite(p[1]));
          if (pts.length > 1)
            nodes.push(
              s("path", {
                class: `dm-line ${sr.cls || ""}`,
                d: `M${pts.map(([a, b]) => `${X(a).toFixed(1)} ${Y(b).toFixed(1)}`).join("L")}`,
              })
            );
          if (sr.label && pts.length) {
            const [a, b] = pts[pts.length - 1];
            nodes.push(s("text", { class: `tf-small dm-line-label ${sr.cls || ""}`, x: X(a) + 6, y: Y(b) + 4, text: sr.label }));
          }
        });
        marks.forEach(({ at, cls }) => nodes.push(s("circle", { class: `dm-dot ${cls || ""}`, cx: X(at[0]), cy: Y(at[1]), r: 4 })));
        if (cursor != null) nodes.push(s("line", { class: "dm-cursor", x1: X(cursor), y1: -4, x2: X(cursor), y2: H }));
        const fy = (v) => (yLog ? `1e${Math.round(v)}` : fmt(v, Math.abs(v) >= 10 ? 0 : Math.abs(v) >= 1 ? 1 : 2));
        (yTicks || [y[0], y[1]]).forEach((v) =>
          nodes.push(s("text", { class: "tf-small", x: -6, y: Y(v) + 4, "text-anchor": "end", text: yLog ? fy(tf(v)) : fy(v) }))
        );
        nodes.push(
          s("text", { class: "tf-small", x: 0, y: H + 16, "text-anchor": "middle", text: fmt(x0, 0) }),
          s("text", { class: "tf-small", x: W, y: H + 16, "text-anchor": "middle", text: fmt(x1, 0) })
        );
        if (xLabel) nodes.push(s("text", { class: "tf-small", x: W / 2, y: H + 32, "text-anchor": "middle", text: xLabel }));
        body.replaceChildren(...nodes);
        return api;
      },
    };
    return api;
  }

  /* ---------------------------------------------------------------- shared helpers */

  // Points i of a flat cloud as [x, y].
  const at = (xs, i) => [xs[2 * i], xs[2 * i + 1]];

  // The k points of a cloud to follow by eye: spread around the data, fixed for a dataset.
  function followers(xs, k = 6, seed = 4) {
    const rand = DM.rng(seed);
    const n = xs.length / 2;
    return Array.from({ length: k }, () => rand.int(n));
  }

  // Runs work() a chunk at a time between frames until it returns null; onDone fires at the end. Returns a cancel.
  function chunked(work, onProgress, onDone) {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const p = work();
      if (p == null) return onDone && onDone();
      onProgress && onProgress(p);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => (alive = false);
  }

  DM.view = { SIZE, plot, chart, at, followers, chunked };
})();
