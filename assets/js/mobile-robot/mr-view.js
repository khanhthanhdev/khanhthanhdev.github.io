// SVG pieces for the "Mobile robots from scratch" series: the room seen from above, the robot, paths, scans, grids
// painted as pixel images, and a helper that sets figures side by side on wide screens and stacked on phones. Built
// on tf-view.js (h, s, place, fitView); colours come from CSS custom properties (mobile-robot.css), and every painted
// grid repaints itself when the reader switches between light and dark mode.
(function () {
  "use strict";

  const MR = window.MR;
  const { h, s, place, fitView, narrow } = window.TF.view;

  /* ---------------------------------------------------------------- colours and painting */

  function rgbOf(name) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const hex = v.startsWith("#") ? v.slice(1) : "888888";
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  }
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

  const repaints = new Set();
  new MutationObserver(() => repaints.forEach((fn) => fn())).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  // Paints a w × h grid (fn(col, row) → [r, g, b, a?], row 0 at the top) into a data URL.
  function paint(w, hgt, fn) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = hgt;
    const ctx = canvas.getContext("2d");
    const data = ctx.createImageData(w, hgt);
    for (let r = 0; r < hgt; r++)
      for (let c = 0; c < w; c++) {
        const px = fn(c, r);
        const k = 4 * (r * w + c);
        data.data[k] = px[0];
        data.data[k + 1] = px[1];
        data.data[k + 2] = px[2];
        data.data[k + 3] = px[3] ?? 255;
      }
    ctx.putImageData(data, 0, 0);
    return canvas.toDataURL();
  }

  // An <image> that repaints itself: draw() returns a data URL, called now and on every theme change.
  function painted(parent, attrs, draw) {
    const el = s("image", { preserveAspectRatio: "none", class: "mr-pixels", ...attrs });
    let current = draw;
    const run = () => el.setAttribute("href", current());
    const onTheme = () => (el.isConnected ? run() : repaints.delete(onTheme));
    repaints.add(onTheme);
    parent.append(el);
    run();
    return {
      el,
      redraw(next) {
        if (next) current = next;
        run();
      },
    };
  }

  /* ---------------------------------------------------------------- the room from above */

  const fx = (v) => v.toFixed(1);
  const pathD = (pts, close = false) => (pts.length ? `M ${pts.map((p) => `${fx(p[0])} ${fx(p[1])}`).join(" L ")}${close ? " Z" : ""}` : "");

  // The room at S svg units per metre, y up. Layers are drawn in the order they're first asked for; set(name, nodes)
  // replaces one layer's contents, so a render can redraw what changed and leave the rest.
  function room(parent, world, opts = {}) {
    const S = opts.S ?? 48;
    const g = s("g", { class: "mr-room tf-obj" });
    const px = (p) => [p[0] * S, (world.h - p[1]) * S];
    const floor = s("rect", { class: "mr-floor", x: 0, y: 0, width: world.w * S, height: world.h * S });
    const base = s("g");
    const layers = {};
    const top = s("g");
    g.append(floor, base, top);
    if (opts.title) g.append(s("text", { class: "tf-mat-title", x: 0, y: -10, text: opts.title }));
    parent.append(g);

    function drawWorld(show = true) {
      base.replaceChildren();
      if (!show) return;
      if (opts.grid !== false) {
        const lines = [];
        for (let x = 1; x < world.w; x++) lines.push(`M ${x * S} 0 V ${world.h * S}`);
        for (let y = 1; y < world.h; y++) lines.push(`M 0 ${y * S} H ${world.w * S}`);
        base.append(s("path", { class: "mr-metre", d: lines.join(" ") }));
      }
      world.shapes.forEach((sh) => base.append(s("path", { class: "mr-shape", d: pathD(sh.poly.map(px), true) })));
      base.append(s("rect", { class: "mr-wall", x: 0, y: 0, width: world.w * S, height: world.h * S }));
    }
    drawWorld(opts.walls !== false);

    const api = {
      el: g,
      S,
      px,
      world,
      box: { x: -6, y: opts.title ? -28 : -6, width: world.w * S + 12, height: world.h * S + (opts.title ? 34 : 12) },
      showWorld: drawWorld,
      layer(name) {
        if (!layers[name]) {
          layers[name] = s("g", { class: `mr-layer-${name}` });
          top.append(layers[name]);
        }
        return layers[name];
      },
      set(name, ...nodes) {
        api.layer(name).replaceChildren(...nodes.flat().filter(Boolean));
      },
      // drawing helpers in metres
      path(pts, cls = "", close = false) {
        return s("path", { class: `mr-path ${cls}`, d: pathD(pts.map(px), close) });
      },
      dots(pts, cls = "", r = 2) {
        return s("path", {
          class: `mr-dots ${cls}`,
          "stroke-width": r * 2,
          d: pts
            .map((p) => {
              const [x, y] = px(p);
              return `M ${fx(x)} ${fx(y)} h 0.01`;
            })
            .join(" "),
        });
      },
      dot(p, cls = "", r = 4) {
        const [x, y] = px(p);
        return s("circle", { class: `mr-dot ${cls}`, cx: x, cy: y, r });
      },
      line(a, b, cls = "") {
        const [x1, y1] = px(a);
        const [x2, y2] = px(b);
        return s("line", { class: `mr-line ${cls}`, x1, y1, x2, y2 });
      },
      text(p, text, cls = "", anchor = "middle", dy = 0) {
        const [x, y] = px(p);
        return s("text", { class: `tf-small ${cls}`, x, y: y + dy, "text-anchor": anchor, text });
      },
      robot(pose, cls = "", size = 0.36) {
        return robot(px, S, pose, cls, size);
      },
      // rays from a pose to each scan hit (misses drawn to `max` and faded)
      rays(pose, sc, { max = 8, misses = false, cls = "" } = {}) {
        const o = px(pose);
        const d = [];
        sc.forEach((b) => {
          if (!isFinite(b.r) && !misses) return;
          const e = px(MR.toWorld(pose, [Math.min(b.r, max) * Math.cos(b.a), Math.min(b.r, max) * Math.sin(b.a)]));
          d.push(`M ${fx(o[0])} ${fx(o[1])} L ${fx(e[0])} ${fx(e[1])}`);
        });
        return s("path", { class: `mr-ray ${cls}`, d: d.join(" ") });
      },
      ellipse(c, P, cls = "", k = 2) {
        const [a, b, ang] = MR.ellipse2(P, k);
        const [x, y] = px(c);
        return s("ellipse", {
          class: `mr-ellipse ${cls}`,
          cx: x,
          cy: y,
          rx: Math.max(0.5, a * S),
          ry: Math.max(0.5, b * S),
          transform: `rotate(${(-ang * 180) / Math.PI} ${x} ${y})`,
        });
      },
      // a grid over the room painted cell by cell: fn(col, row) → [r, g, b, a] with row 0 at the bottom (y = 0)
      painted(name, W, H, fn) {
        const layerEl = api.layer(name);
        layerEl.replaceChildren();
        return painted(layerEl, { x: 0, y: 0, width: world.w * S, height: world.h * S }, () => paint(W, H, (c, r) => fn(c, H - 1 - r)));
      },
      onClick(fn) {
        floor.style.cursor = "crosshair";
        floor.addEventListener("click", (ev) => {
          const pt = g.ownerSVGElement.createSVGPoint();
          pt.x = ev.clientX;
          pt.y = ev.clientY;
          const loc = pt.matrixTransform(g.getScreenCTM().inverse());
          fn([loc.x / S, world.h - loc.y / S]);
        });
      },
    };
    return api;
  }

  // The robot from above: a disc with two wheels and a nose showing its heading.
  function robot(px, S, pose, cls = "", size = 0.36) {
    const [x, y] = px(pose);
    const r = (size / 2) * S;
    const g = s("g", { class: `mr-robot ${cls}`, transform: `translate(${fx(x)} ${fx(y)}) rotate(${fx((-pose[2] * 180) / Math.PI)})` });
    g.append(
      s("rect", { class: "mr-wheel", x: -r * 0.45, y: -r - 2.5, width: r * 0.9, height: 3.5, rx: 1 }),
      s("rect", { class: "mr-wheel", x: -r * 0.45, y: r - 1, width: r * 0.9, height: 3.5, rx: 1 }),
      s("circle", { class: "mr-body", r }),
      s("path", { class: "mr-nose", d: `M ${fx(r * 0.85)} 0 L ${fx(-r * 0.25)} ${fx(-r * 0.45)} L ${fx(-r * 0.25)} ${fx(r * 0.45)} Z` })
    );
    return g;
  }

  /* ---------------------------------------------------------------- layout */

  // Places objects side by side (wide screens) or stacked (phones) and fits the view around them. items are
  // { obj, gap? } where obj has .el and .box (its extent at the origin); `fixed` items give [x, y] themselves.
  function arrange(svg, items, { gap = 44, stack = narrow.matches, pad = 14 } = {}) {
    let at = 0;
    const boxes = [];
    items.forEach((it) => {
      if (!it) return;
      const b = it.obj.box;
      const x = stack ? -b.x : at - b.x;
      const y = stack ? at - b.y : -b.y;
      place(it.obj.el, x, y, it.opts || {});
      boxes.push({ x: x + b.x, y: y + b.y, width: b.width, height: b.height });
      at += (stack ? b.height : b.width) + (it.gap ?? gap);
    });
    // centre narrower items across a stack
    if (stack) {
      const wMax = Math.max(...boxes.map((b) => b.width));
      items.forEach((it, i) => {
        if (!it) return;
        const b = boxes[i];
        const dx = (wMax - b.width) / 2;
        if (dx > 1) {
          place(it.obj.el, b.x - it.obj.box.x + dx, b.y - it.obj.box.y, it.opts || {});
          b.x += dx;
        }
      });
    }
    fitView(svg, boxes, pad, 0);
  }
  // Hides objects not in the current layout.
  function hideAll(...objs) {
    objs.forEach((o) => {
      if (!o) return;
      o.el.style.opacity = "0";
      o.el.classList.add("is-hidden");
    });
  }

  /* ---------------------------------------------------------------- small charts */

  // A time-series chart with real axes: set(series, { xMax, yMin, yMax, marks }) where each series is
  // { xs, ys, cls, label }. Gaps (null) break a line. Unlike the clustering chart, x is a real number.
  function plot(parent, opts = {}) {
    // on phones a plot is drawn narrower, so its text stays readable once the stage is scaled to the screen
    const W = narrow.matches ? Math.min(opts.width ?? 280, 250) : (opts.width ?? 280);
    const H = narrow.matches ? Math.min(opts.height ?? 160, 170) : (opts.height ?? 160);
    const g = s("g", { class: "mr-plot tf-obj" });
    const title = s("text", { class: "tf-mat-title", x: 0, y: -12, text: opts.title || "" });
    const body = s("g");
    g.append(title, body);
    parent.append(g);
    const api = {
      el: g,
      W,
      H,
      box: { x: -44, y: -30, width: W + 44 + Math.min(opts.right ?? 60, narrow.matches ? 64 : Infinity), height: H + 30 + (opts.xTitle ? 40 : 24) },
      title: (t) => (title.textContent = t),
      set(series, o = {}) {
        const xMin = o.xMin ?? 0;
        const xMax = o.xMax ?? Math.max(...series.flatMap((sr) => sr.xs));
        const ysAll = series.flatMap((sr) => sr.ys.filter((v) => v != null && isFinite(v)));
        const yMin = o.yMin ?? Math.min(0, ...ysAll);
        const yMax = o.yMax ?? Math.max(1e-9, ...ysAll);
        const X = (v) => ((v - xMin) / (xMax - xMin || 1)) * W;
        const Y = (v) => H - MR.clamp((v - yMin) / (yMax - yMin || 1), -0.02, 1.02) * H;
        const nodes = [];
        // grid lines and ticks
        const ticks = (lo, hi, n) => {
          const step = niceStep((hi - lo) / n);
          const out = [];
          for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < 1e-12 ? 0 : v);
          return out;
        };
        // enough decimals to tell ticks apart: 0.25 needs two, 0.5 one, 5 none
        const digits = (step) => {
          for (let d = 0; d < 4; d++) if (Math.abs(step * 10 ** d - Math.round(step * 10 ** d)) < 1e-6) return d;
          return 4;
        };
        const yt = ticks(yMin, yMax, o.yTicks ?? 4);
        const xt = ticks(xMin, xMax, o.xTicks ?? 5);
        const yd = digits(yt[1] - yt[0] || 1);
        const xd = digits(xt[1] - xt[0] || 1);
        yt.forEach((v) => {
          nodes.push(s("line", { class: "mr-gridline", x1: 0, x2: W, y1: Y(v), y2: Y(v) }));
          nodes.push(s("text", { class: "tf-small", x: -6, y: Y(v) + 4, "text-anchor": "end", text: fmtN(v, yd) }));
        });
        xt.forEach((v) => nodes.push(s("text", { class: "tf-small", x: X(v), y: H + 16, "text-anchor": "middle", text: fmtN(v, xd) })));
        nodes.push(s("line", { class: "tf-stroke-muted", x1: 0, y1: H, x2: W, y2: H }));
        nodes.push(s("line", { class: "tf-stroke-muted", x1: 0, y1: 0, x2: 0, y2: H }));
        (o.hlines || []).forEach(({ y, cls, label }) => {
          nodes.push(s("line", { class: `mr-hline ${cls || ""}`, x1: 0, x2: W, y1: Y(y), y2: Y(y) }));
          if (label) nodes.push(s("text", { class: `tf-small mr-label ${cls || ""}`, x: W + 6, y: Y(y) + 4, text: label }));
        });
        (o.vlines || []).forEach(({ x, cls, label }) => {
          nodes.push(s("line", { class: `mr-hline ${cls || ""}`, x1: X(x), x2: X(x), y1: 0, y2: H }));
          if (label) nodes.push(s("text", { class: `tf-small mr-label ${cls || ""}`, x: X(x) + 4, y: 10, text: label }));
        });
        series.forEach((sr) => {
          const segs = [];
          let cur = [];
          sr.xs.forEach((x, i) => {
            const y = sr.ys[i];
            if (y == null || !isFinite(y) || x > xMax + 1e-9) {
              if (cur.length) segs.push(cur);
              cur = [];
            } else cur.push([X(x), Y(y)]);
          });
          if (cur.length) segs.push(cur);
          if (sr.dots) segs.flat().forEach((p) => nodes.push(s("circle", { class: `mr-plot-dot ${sr.cls || ""}`, cx: p[0], cy: p[1], r: 2.2 })));
          else segs.forEach((pts) => nodes.push(s("path", { class: `mr-plot-line ${sr.cls || ""}`, d: pathD(pts) })));
          if (sr.label) {
            const last = segs.flat().pop();
            if (last)
              nodes.push(
                s("text", { class: `tf-small mr-label ${sr.cls || ""}`, x: Math.min(W, last[0]) + 6, y: last[1] + 4 + (sr.dy || 0), text: sr.label })
              );
          }
        });
        const xTitle = o.xTitle ?? opts.xTitle;
        if (xTitle) nodes.push(s("text", { class: "tf-small", x: W / 2, y: H + 34, "text-anchor": "middle", text: xTitle }));
        body.replaceChildren(...nodes);
      },
    };
    return api;
  }
  function niceStep(raw) {
    const p = 10 ** Math.floor(Math.log10(raw || 1));
    const m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  const fmtN = (v, d) => v.toFixed(d).replace("-", "−");

  // A block diagram box with a title and an optional second line, for hardware and software diagrams.
  function box(parent, x, y, w, hgt, text, sub = "", cls = "") {
    const g = s("g", { class: `mr-box ${cls}`, transform: `translate(${x} ${y})` });
    g.append(
      s("rect", { width: w, height: hgt, rx: 5 }),
      s("text", { class: "mr-box-title", x: w / 2, y: sub ? hgt / 2 - 3 : hgt / 2 + 4, "text-anchor": "middle", text })
    );
    if (sub) g.append(s("text", { class: "tf-small", x: w / 2, y: hgt / 2 + 13, "text-anchor": "middle", text: sub }));
    parent.append(g);
    return g;
  }
  // An arrow from a to b (svg units), with an optional label at its middle.
  function arrow(parent, a, b, label = "", cls = "") {
    const g = s("g", { class: `mr-arrow ${cls}` });
    g.append(s("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], "marker-end": "url(#mr-head)" }));
    if (label) g.append(s("text", { class: "tf-small", x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 - 5, "text-anchor": "middle", text: label }));
    parent.append(g);
    return g;
  }
  function defs(svg) {
    svg.append(
      s(
        "defs",
        {},
        s(
          "marker",
          {
            id: "mr-head",
            viewBox: "0 0 10 10",
            refX: 9,
            refY: 5,
            markerWidth: 8,
            markerHeight: 8,
            markerUnits: "userSpaceOnUse",
            orient: "auto-start-reverse",
          },
          s("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "mr-head" })
        )
      )
    );
  }

  // A freestanding group with a known box, for scene-specific drawings.
  function group(parent, box, cls = "") {
    const g = s("g", { class: `tf-obj ${cls}` });
    parent.append(g);
    return { el: g, box };
  }

  // Small builders for the controls row.
  MR.scenes = MR.scenes || {};
  MR.figures = MR.figures || {};
  let uid = 0;
  MR.controls = {
    button(text, onClick) {
      return h("button", { type: "button", class: "tf-btn", text, onclick: onClick });
    },
    select(label, options, value, onChange) {
      const id = `mr-sel-${++uid}`;
      const el = h("select", { class: "cl-select", id }, ...options.map(([v, text]) => h("option", { value: String(v), text })));
      el.value = String(value);
      el.addEventListener("change", () => onChange(el.value));
      return { wrap: h("span", { class: "tf-check" }, h("label", { for: id, text: label }), el), el };
    },
    slider(label, min, max, value, onInput, format = String, step = 1) {
      const id = `mr-rng-${++uid}`;
      const el = h("input", { type: "range", min, max, step, value, id });
      const out = h("output", { for: id, text: format(value) });
      el.addEventListener("input", () => {
        out.textContent = format(Number(el.value));
        onInput(Number(el.value));
      });
      return {
        wrap: h("span", { class: "tf-check" }, h("label", { for: id, text: label }), el, out),
        el,
        set(v) {
          el.value = String(v);
          out.textContent = format(v);
        },
      };
    },
  };

  MR.view = { rgbOf, mix, paint, painted, pathD, room, robot, arrange, hideAll, plot, box, arrow, defs, group, h, s };
})();
