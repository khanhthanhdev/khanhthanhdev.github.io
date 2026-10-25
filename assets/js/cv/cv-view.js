// SVG pieces for the "Deep learning for computer vision" series: image thumbnails and galleries, decision regions
// and loss surfaces painted as pixel images, and computational graphs. Built on tf-view.js (h, s, place) and the
// clustering series' scatter plot and line chart (cl-view.js); colours come from CSS custom properties, and every
// painted image repaints itself when the reader switches between light and dark mode.
(function () {
  "use strict";

  const CV = window.CV;
  const { s, fmt, place } = window.TF.view;

  /* ---------------------------------------------------------------- colours */

  // A CSS colour variable as [r, g, b]. Only hex values are used by the series' palettes.
  function rgbOf(name) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const hex = v.startsWith("#") ? v.slice(1) : "888888";
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  }
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

  // Everything painted onto a canvas registers a repaint, run again when the theme changes.
  const repaints = new Set();
  new MutationObserver(() => repaints.forEach((fn) => fn())).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  // Paints a w × h grid of colours (fn(col, row) → [r, g, b]) into a data URL.
  function paint(w, h, fn) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const data = ctx.createImageData(w, h);
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        const [R, G, B] = fn(c, r);
        const k = 4 * (r * w + c);
        data.data[k] = R;
        data.data[k + 1] = G;
        data.data[k + 2] = B;
        data.data[k + 3] = 255;
      }
    ctx.putImageData(data, 0, 0);
    return canvas.toDataURL();
  }

  // An <image> that repaints itself: draw() returns a data URL and is called now and on every theme change.
  function painted(attrs, draw) {
    const el = s("image", { preserveAspectRatio: "none", class: "cv-pixels", ...attrs });
    let current = draw;
    const run = () => {
      if (!el.isConnected && repaints.size > 200) return repaints.delete(run);
      el.setAttribute("href", current());
    };
    repaints.add(run);
    run();
    return {
      el,
      redraw(next) {
        if (next) current = next;
        run();
      },
    };
  }

  /* ---------------------------------------------------------------- images */

  // One grey image as a picture: ink from --tf-prob on --tf-cell, the same colours as a "prob" matrix.
  function greyURL(img) {
    const paper = rgbOf("--tf-cell");
    const ink = rgbOf("--tf-prob");
    return paint(img[0].length, img.length, (c, r) => mix(paper, ink, Math.max(0, Math.min(1, img[r][c]))));
  }

  // A signed image (a template or a filter): blue below zero, red above, scaled so ±range is full colour.
  function signedURL(img, range) {
    const paper = rgbOf("--tf-cell");
    const neg = rgbOf("--tf-neg");
    const pos = rgbOf("--tf-pos");
    return paint(img[0].length, img.length, (c, r) => {
      const v = img[r][c];
      return mix(paper, v < 0 ? neg : pos, Math.min(1, Math.abs(v) / range) * 0.85);
    });
  }

  // A small framed picture of an image with an optional caption under it and a class-coloured tab on top.
  function thumb(parent, opts = {}) {
    const size = opts.size ?? 40;
    const g = s("g", { class: "cv-thumb tf-obj" });
    const frame = s("rect", { class: "cv-thumb-frame", x: -1, y: -1, width: size + 2, height: size + 2 });
    const tab = s("rect", { class: "cv-thumb-tab", x: 0, y: -6, width: size, height: 4 });
    const ring = s("rect", { class: "cv-thumb-ring", x: -4, y: -9, width: size + 8, height: size + 13, rx: 3 });
    const caption = s("text", { class: "tf-small cv-thumb-caption", x: size / 2, y: size + 13, "text-anchor": "middle" });
    let pic = null;
    g.append(ring, frame, tab, caption);
    parent.append(g);
    const api = {
      el: g,
      size,
      set(img, { signed = false, range = 1, label = null } = {}) {
        const draw = () => (signed ? signedURL(img, range) : greyURL(img));
        if (!pic) {
          pic = painted({ x: 0, y: 0, width: size, height: size }, draw);
          g.insertBefore(pic.el, tab);
        } else pic.redraw(draw);
        tab.setAttribute("class", `cv-thumb-tab ${label == null ? "is-off" : CV.view.colour(label)}`);
        return api;
      },
      caption(text) {
        caption.textContent = text ?? "";
        return api;
      },
      // state: null, "ring" (picked) or "dim"
      mark(state) {
        g.classList.toggle("is-ring", state === "ring");
        g.classList.toggle("is-dim", state === "dim");
        return api;
      },
      place: (x, y, o) => place(g, x, y, o),
    };
    return api;
  }

  // A grid of thumbnails, one per example. arrange(order) moves them so order[slot] = example index; they glide.
  function gallery(parent, examples, opts = {}) {
    const cols = opts.cols ?? 8;
    const size = opts.size ?? 34;
    const gapX = opts.gapX ?? 12;
    const gapY = opts.gapY ?? (opts.captions ? 30 : 16);
    const g = s("g", { class: "cv-gallery tf-obj" });
    const title = s("text", { class: "tf-mat-title", x: 0, y: -16, text: opts.title || "" });
    g.append(title);
    parent.append(g);
    const thumbs = examples.map((ex) => thumb(g, { size }).set(ex.img, { label: ex.label }));
    const slot = (k) => [(k % cols) * (size + gapX), Math.floor(k / cols) * (size + gapY)];
    const rows = Math.ceil(examples.length / cols);
    const api = {
      el: g,
      thumbs,
      box: { x: -6, y: -32, width: cols * (size + gapX) - gapX + 12, height: rows * (size + gapY) + 30 },
      title: (text) => (title.textContent = text || ""),
      arrange(order = examples.map((_, i) => i)) {
        order.forEach((i, k) => {
          const [x, y] = slot(k);
          thumbs[i].el.style.transform = `translate(${x}px, ${y}px)`;
        });
        return api;
      },
      // fn(i) → { caption, mark } for every thumbnail
      decorate(fn) {
        thumbs.forEach((t, i) => {
          const d = fn ? fn(i) || {} : {};
          t.caption(d.caption ?? "").mark(d.mark ?? null);
        });
        return api;
      },
    };
    return api.arrange();
  }

  /* ---------------------------------------------------------------- decision regions */

  // Tints a scatter plot (cl-view) by the class predict(input point) gives every spot: a RES × RES pixel image
  // laid under the points. Pass null to hide it.
  const RES = 90;
  function regions(plot) {
    const layer = s("g", { class: "cv-regions" });
    plot.el.insertBefore(layer, plot.el.querySelector(".cl-cells"));
    let img = null;
    let cache = null;
    return {
      set(predict) {
        if (!predict) {
          layer.style.opacity = "0";
          return;
        }
        layer.style.opacity = "1";
        cache = [];
        for (let r = 0; r < RES; r++)
          for (let c = 0; c < RES; c++) {
            const p = [((c + 0.5) / RES) * CV.BOX, CV.BOX - ((r + 0.5) / RES) * CV.BOX];
            cache.push(predict(CV.input(p)));
          }
        const labels = cache;
        const draw = () => {
          const paper = rgbOf("--tf-paper");
          const tints = Array.from({ length: 8 }, (_, j) => mix(paper, rgbOf(`--cl-${j}`), 0.22));
          return paint(RES, RES, (c, r) => tints[labels[r * RES + c] % 8]);
        };
        if (!img) {
          img = painted({ x: 0, y: 0, width: plot.SIZE, height: plot.SIZE }, draw);
          layer.append(img.el);
        } else img.redraw(draw);
      },
    };
  }

  /* ---------------------------------------------------------------- loss surface */

  // A loss over two weights, painted as bands that darken towards the minimum, with an SVG layer on top for
  // paths. win = { x: [lo, hi], y: [lo, hi] } in weight units; f(w) → loss.
  function surface(parent, f, win, opts = {}) {
    const SIZE = opts.size ?? 400;
    const N = 120;
    const g = s("g", { class: "cv-surface tf-obj" });
    const title = s("text", { class: "tf-mat-title", x: 0, y: -12, text: opts.title || "" });
    const frame = s("rect", { class: "cl-frame", x: 0, y: 0, width: SIZE, height: SIZE });
    const top = s("g");
    const X = (w1) => ((w1 - win.x[0]) / (win.x[1] - win.x[0])) * SIZE;
    const Y = (w2) => SIZE - ((w2 - win.y[0]) / (win.y[1] - win.y[0])) * SIZE;
    const values = [];
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const w = [win.x[0] + ((c + 0.5) / N) * (win.x[1] - win.x[0]), win.y[1] - ((r + 0.5) / N) * (win.y[1] - win.y[0])];
        values.push(f(w));
      }
    const lo = Math.min(...values);
    const hi = opts.max ?? Math.max(...values);
    // bands on a square-root scale, so the floor of the valley gets as many bands as its walls
    const level = (v) => Math.min(1, Math.sqrt(Math.max(0, (v - lo) / (hi - lo))));
    const BANDS = 14;
    const pic = painted({ x: 0, y: 0, width: SIZE, height: SIZE }, () => {
      const paper = rgbOf("--tf-paper");
      const deep = rgbOf("--tf-accent");
      return paint(N, N, (c, r) => {
        const b = Math.floor(level(values[r * N + c]) * BANDS) / BANDS;
        return mix(paper, deep, 0.8 * (1 - b) ** 1.4);
      });
    });
    pic.el.classList.add("is-smooth");
    const ticks = s("g");
    const tick = (v, axis) => {
      const at = axis === "x" ? X(v) : Y(v);
      return axis === "x"
        ? s("text", { class: "tf-small", x: at, y: SIZE + 16, "text-anchor": "middle", text: fmt(v, 0) })
        : s("text", { class: "tf-small", x: -6, y: at + 4, "text-anchor": "end", text: fmt(v, 0) });
    };
    for (let v = Math.ceil(win.x[0]); v <= win.x[1]; v++) ticks.append(tick(v, "x"));
    for (let v = Math.ceil(win.y[0]); v <= win.y[1]; v++) ticks.append(tick(v, "y"));
    ticks.append(
      s("text", { class: "tf-small cv-axis-name", x: SIZE / 2, y: SIZE + 34, "text-anchor": "middle", text: "w₁" }),
      s("text", { class: "tf-small cv-axis-name", x: -30, y: SIZE / 2, "text-anchor": "middle", text: "w₂" })
    );
    g.append(frame, pic.el, s("rect", { class: "cv-surface-edge", x: 0, y: 0, width: SIZE, height: SIZE }), ticks, top, title);
    const clipId = `cv-clip-${Math.random().toString(36).slice(2, 8)}`;
    g.append(s("clipPath", { id: clipId }, s("rect", { x: 0, y: 0, width: SIZE, height: SIZE })));
    top.setAttribute("clip-path", `url(#${clipId})`);
    parent.append(g);
    const inside = (v, r) => Math.max(r[0] - 100, Math.min(r[1] + 100, v));
    const pt = (w) => [X(inside(w[0], win.x)), Y(inside(w[1], win.y))];
    return {
      el: g,
      box: { x: -44, y: -30, width: SIZE + 50, height: SIZE + 72 },
      SIZE,
      X,
      Y,
      title: (text) => (title.textContent = text || ""),
      // layers: [{ path: [[w1, w2], …], cls, upTo, dots, marker }]; marker draws a ringed dot at the last point
      draw(layers) {
        const nodes = [];
        layers.forEach((L) => {
          const path = L.path.slice(0, (L.upTo ?? L.path.length - 1) + 1);
          if (L.dots === "only") {
            path.forEach((w) => {
              const [x, y] = pt(w);
              nodes.push(s("circle", { class: `cv-try ${L.cls || ""}`, cx: x.toFixed(1), cy: y.toFixed(1), r: 3 }));
            });
          } else if (path.length > 1) {
            nodes.push(
              s("path", {
                class: `cv-path ${L.cls || ""}`,
                d: `M ${path
                  .map((w) =>
                    pt(w)
                      .map((v) => v.toFixed(1))
                      .join(" ")
                  )
                  .join(" L ")}`,
              })
            );
            if (L.dots !== false)
              path.forEach((w) => {
                const [x, y] = pt(w);
                nodes.push(s("circle", { class: `cv-path-dot ${L.cls || ""}`, cx: x.toFixed(1), cy: y.toFixed(1), r: 2.4 }));
              });
          }
          if (L.marker && path.length) {
            const [x, y] = pt(path[path.length - 1]);
            nodes.push(s("circle", { class: `cv-marker ${L.cls || ""}`, cx: x.toFixed(1), cy: y.toFixed(1), r: 6 }));
          }
          if (L.arrow) {
            const [x1, y1] = pt(L.arrow[0]);
            const [x2, y2] = pt(L.arrow[1]);
            nodes.push(s("line", { class: `cv-arrow ${L.cls || ""}`, x1, y1, x2, y2, "marker-end": "url(#cv-head)" }));
          }
          if (L.star) {
            const [x, y] = pt(L.star);
            nodes.push(s("text", { class: "cv-star", x, y: y + 6, "text-anchor": "middle", text: "★" }));
          }
        });
        top.replaceChildren(...nodes);
      },
      // Calls fn(w) when the surface is clicked.
      onClick(fn) {
        frame.style.pointerEvents = "none";
        pic.el.style.cursor = "crosshair";
        pic.el.addEventListener("click", (event) => {
          const m = pic.el.getScreenCTM();
          if (!m) return;
          const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
          fn([win.x[0] + (p.x / SIZE) * (win.x[1] - win.x[0]), win.y[0] + (1 - p.y / SIZE) * (win.y[1] - win.y[0])]);
        });
      },
    };
  }

  // The arrowhead used by surface arrows and graph edges; added once per svg.
  function defs(svg) {
    if (svg.querySelector("#cv-head")) return;
    svg.append(
      s(
        "defs",
        {},
        s(
          "marker",
          { id: "cv-head", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" },
          s("path", { class: "cv-head", d: "M 0 0 L 10 5 L 0 10 z" })
        )
      )
    );
  }

  /* ---------------------------------------------------------------- computational graphs */

  // A graph laid out left to right. nodes: [{ id, label, at: [x, y] }] (CV.forward/backward fill value and grad);
  // edges are read from node.inputs. show(values, grads, focus) writes the numbers: values[id] above each edge
  // leaving a node (green, forward) and grads[id] under it (red, backward). Missing entries are left blank.
  function graph(parent, nodes, opts = {}) {
    const g = s("g", { class: "cv-graph tf-obj" });
    const title = s("text", { class: "tf-mat-title", x: 0, y: -24, text: opts.title || "" });
    g.append(title);
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const R = 20;
    const edgeEls = [];
    nodes.forEach((n) =>
      (n.inputs || []).forEach((src) => {
        const a = byId[src].at;
        const b = n.at;
        const line = s("line", { class: "cv-edge", x1: a[0] + R, y1: a[1], x2: b[0] - R - 2, y2: b[1], "marker-end": "url(#cv-head)" });
        g.append(line);
        edgeEls.push({ from: src, to: n.id, line });
      })
    );
    // the output gets an edge of its own, so its value and gradient have somewhere to go
    const outNode = nodes[nodes.length - 1];
    const tail = s("line", { class: "cv-edge", x1: outNode.at[0] + R, y1: outNode.at[1], x2: outNode.at[0] + R + 50, y2: outNode.at[1] });
    g.append(tail);
    const labelEls = {};
    nodes.forEach((n) => {
      const input = n.op === "input";
      const node = s(
        "g",
        { class: `cv-node${input ? " is-input" : ""}` },
        input
          ? s("text", { class: "cv-node-name", x: n.at[0] - 4, y: n.at[1] + 4, "text-anchor": "end", text: n.label })
          : s("circle", { cx: n.at[0], cy: n.at[1], r: R }),
        input ? "" : s("text", { class: "cv-node-op", x: n.at[0], y: n.at[1] + 4, "text-anchor": "middle", text: n.label })
      );
      const fwd = s("text", { class: "cv-fwd", "text-anchor": "middle" });
      const bwd = s("text", { class: "cv-bwd", "text-anchor": "middle" });
      g.append(node, fwd, bwd);
      // numbers sit on the edge leaving the node, a little past the node
      const x = n.at[0] + (input ? 26 : R + 26);
      fwd.setAttribute("x", x);
      fwd.setAttribute("y", n.at[1] - 7);
      bwd.setAttribute("x", x);
      bwd.setAttribute("y", n.at[1] + 17);
      labelEls[n.id] = { node, fwd, bwd };
    });
    parent.append(g);
    return {
      el: g,
      title: (text) => (title.textContent = text || ""),
      show(values = {}, grads = {}, focus = null) {
        nodes.forEach((n) => {
          const L = labelEls[n.id];
          L.fwd.textContent = values[n.id] == null ? "" : fmt(values[n.id]);
          L.bwd.textContent = grads[n.id] == null ? "" : fmt(grads[n.id]);
          L.node.classList.toggle("is-focus", focus === n.id);
        });
        edgeEls.forEach((e) => e.line.classList.toggle("is-focus", focus === e.to || focus === e.from));
      },
    };
  }

  CV.view = { rgbOf, paint, painted, greyURL, signedURL, thumb, gallery, regions, surface, defs, graph, colour: (j) => `cl-c${j % 8}` };
})();
