// Reusable SVG pieces for the Transformer series: matrices, matrix-multiply sweeps, attention lines and bars.
// Plain DOM + SVG, no framework. Colours come from CSS custom properties (transformer.css), so dark mode is free.
// Placement uses CSS transforms on <g> elements, so a step change glides objects to their new spots.
(function () {
  "use strict";

  const TF = window.TF;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const narrow = window.matchMedia("(max-width: 991.98px)");

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smoothstep = (t) => t * t * (3 - 2 * t);

  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    node.append(...children);
    return node;
  }

  function s(tag, attrs = {}, ...children) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "text") node.textContent = value;
      else node.setAttribute(key, String(value));
    }
    node.append(...children);
    return node;
  }

  // Runs step(t) with eased t from 0 to 1 over `duration` ms. Returns a cancel function.
  function animate(duration, step) {
    if (motionQuery.matches) {
      step(1);
      return () => {};
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = clamp((now - start) / duration, 0, 1);
      step(smoothstep(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }

  // Two decimals with a true minus sign; −∞ for masked scores.
  function fmt(v, digits = 2) {
    if (v === -Infinity) return "−∞";
    const r = Number(v).toFixed(digits);
    return (Number(r) === 0 ? (0).toFixed(digits) : r).replace("-", "−");
  }

  // "0.57×1.20 + 0.13×(−0.40) + …": the dot product written out, for the formula strip.
  function terms(a, b) {
    return a.map((x, k) => `${fmt(x)}×${b[k] < 0 ? `(${fmt(b[k])})` : fmt(b[k])}`).join(" + ");
  }

  // Moves a <g> with a CSS transform; opacity 0 also turns off pointer events (see transformer.css).
  // noRows hides a matrix's row labels, for when it sits right of another matrix that already names the rows.
  function place(el, x, y, opts = {}) {
    const k = opts.scale ?? 1;
    el.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    el.style.opacity = String(opts.opacity ?? 1);
    el.classList.toggle("is-hidden", (opts.opacity ?? 1) === 0);
    el.classList.toggle("is-dim", Boolean(opts.dim));
    el.classList.toggle("no-rows", Boolean(opts.noRows));
  }
  const hide = (el) => {
    el.style.opacity = "0";
    el.classList.add("is-hidden");
  };

  // Glides the SVG viewBox to fit the given boxes ({x, y, width, height} in viewBox units), so each step fills
  // the stage. Snaps instead of gliding while the svg has .no-anim (a rebuild).
  // minWidth keeps a small figure from being blown up past a comfortable size.
  function fitView(svg, boxes, pad = 16, minWidth = narrow.matches ? 0 : 560) {
    if (!boxes.length) return;
    let x0 = Math.min(...boxes.map((b) => b.x)) - pad;
    const y0 = Math.min(...boxes.map((b) => b.y)) - pad;
    let x1 = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
    const y1 = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
    if (x1 - x0 < minWidth) {
      const grow = (minWidth - (x1 - x0)) / 2;
      x0 -= grow;
      x1 += grow;
    }
    const target = [x0, y0, x1 - x0, y1 - y0];
    // when a 30-unit cell would render under 24 px, its 9.5-unit digits are unreadable: hide them (the strip has the numbers)
    const k = Math.min(svg.clientWidth / target[2], svg.clientHeight / target[3]) || 1;
    svg.classList.toggle("is-tiny", 30 * k < 24);
    const state = svg._fit || (svg._fit = { now: target, to: null, cancel: () => {} });
    if (state.to && state.to.every((v, k) => Math.abs(v - target[k]) < 1)) return;
    state.cancel();
    state.to = target;
    const from = state.now;
    const apply = (box) => {
      state.now = box;
      svg.setAttribute("viewBox", box.map((v) => v.toFixed(1)).join(" "));
    };
    if (svg.classList.contains("no-anim")) return apply(target);
    state.cancel = animate(650, (t) => apply(from.map((v, k) => v + (target[k] - v) * t)));
  }

  // The box an object placed with place() covers, in viewBox units.
  function boxOf(el, x, y, k = 1) {
    const b = el.getBBox();
    return { x: x + b.x * k, y: y + b.y * k, width: b.width * k, height: b.height * k };
  }

  // A scene's layout function. objects() returns the scene's current named objects (each with .el or .g). Each
  // call places the listed ones at [x, y, placeOpts], fades the rest out and zooms the view to fit. On phones,
  // faded context (opacity below 1) is dropped so the figure that matters gets the room. Keys in noFit are placed
  // but don't count towards the view (connector lines and the like).
  function stage(svg, objects, noFit = []) {
    return function layout(spec) {
      const o = objects();
      const boxes = [];
      Object.keys(o).forEach((key) => {
        const obj = o[key];
        const el = obj && (obj.el || obj.g);
        if (!(el instanceof SVGElement)) return;
        let at = spec[key];
        if (at && narrow.matches && at[2] && at[2].opacity < 1) at = null;
        if (!at) return hide(el);
        place(el, at[0], at[1], at[2]);
        if (!noFit.includes(key)) boxes.push(boxOf(el, at[0], at[1], at[2] && at[2].scale));
      });
      fitView(svg, boxes);
    };
  }

  /* ---------------------------------------------------------------- matrix */

  // A grid of cells. kind: "signed" (blue below zero, red above), "prob" (paper to ink, 0 to 1) or "plain".
  // rowLabels sit left of the grid, colLabels above it (rotated, so feature names fit).
  function matrix(parent, opts) {
    const { rows, cols } = opts;
    const cell = opts.cell ?? 32;
    const kind = opts.kind ?? "signed";
    const range = opts.range ?? 2;
    const numbers = opts.numbers ?? cell >= 28;
    const width = cols * cell;
    const height = rows * cell;

    const g = s("g", { class: `tf-mat tf-role-${opts.role ?? "none"}` });
    const title = s("text", { class: "tf-mat-title", x: 0, y: -(opts.colLabels ? 44 : 10) });
    title.append(
      s("tspan", { class: "tf-mat-name", text: opts.name ?? "" }),
      s("tspan", { class: "tf-mat-shape", dx: 8, text: `${rows} × ${cols}` })
    );
    if (opts.note) title.append(s("tspan", { class: "tf-mat-note", dx: 8, text: opts.note }));
    g.append(title);

    const cellsG = s("g", { class: "tf-cells" });
    const cells = [];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const rect = s("rect", { x: j * cell, y: i * cell, width: cell, height: cell });
        const text = numbers ? s("text", { x: j * cell + cell / 2, y: i * cell + cell / 2 + 3.5, "text-anchor": "middle" }) : null;
        const c = s("g", { class: "tf-cell" }, rect, ...(text ? [text] : []));
        cells.push({ g: c, rect, text, i, j });
        cellsG.append(c);
      }
    }
    g.append(cellsG, s("rect", { class: "tf-mat-frame", x: 0, y: 0, width, height }));

    const rowLabelEls = (opts.rowLabels || []).map((label, i) =>
      s("text", { class: "tf-axis tf-axis-row", x: -8, y: i * cell + cell / 2 + 4, "text-anchor": "end", "data-i": i, text: label })
    );
    const colLabelEls = (opts.colLabels || []).map((label, j) =>
      s("text", {
        class: "tf-axis tf-axis-col",
        transform: `translate(${j * cell + cell / 2 + 3}, -6) rotate(-55)`,
        text: label,
      })
    );
    g.append(...rowLabelEls, ...colLabelEls);

    const hlRow = s("rect", { class: "tf-hl", x: -2, width: width + 4, height: cell + 4 });
    const hlCol = s("rect", { class: "tf-hl", y: -2, width: cell + 4, height: height + 4 });
    const hlCell = s("rect", { class: "tf-hl tf-hl-cell", width: cell + 4, height: cell + 4 });
    [hlRow, hlCol, hlCell].forEach((r) => r.classList.add("is-off"));
    g.append(hlRow, hlCol, hlCell);
    parent.append(g);

    let values = null;
    let shown = Infinity;
    let cancel = () => {};

    function paint(M) {
      cells.forEach((c, k) => {
        const v = M[c.i][c.j];
        const empty = k >= shown;
        c.g.classList.toggle("is-empty", empty);
        if (empty) {
          c.rect.style.fill = "";
          if (c.text) c.text.textContent = "";
          return;
        }
        let p = 0;
        if (v === -Infinity) {
          c.rect.style.fill = "var(--tf-masked)";
        } else if (kind === "prob") {
          p = clamp(v, 0, 1);
          c.rect.style.fill = `color-mix(in srgb, var(--tf-prob) ${(p * 100).toFixed(1)}%, var(--tf-cell))`;
        } else if (kind === "signed") {
          p = clamp(Math.abs(v) / range, 0, 1);
          c.rect.style.fill = `color-mix(in srgb, var(${v < 0 ? "--tf-neg" : "--tf-pos"}) ${(p * 85).toFixed(1)}%, var(--tf-cell))`;
        } else {
          c.rect.style.fill = "var(--tf-cell)";
        }
        c.g.classList.toggle("is-strong", p > 0.6);
        c.g.classList.toggle("is-masked", v === -Infinity);
        if (c.text) c.text.textContent = kind === "prob" && v !== -Infinity ? fmt(v) : fmt(v, opts.digits ?? 2);
      });
    }

    const api = {
      el: g,
      width,
      height,
      cell,
      rows,
      cols,
      get values() {
        return values;
      },
      // tween: glide from the previous values (same shape only).
      set(M, tween = false) {
        cancel();
        const from = values;
        values = M;
        if (!tween || !from || from.length !== M.length) return paint(M);
        cancel = animate(500, (t) =>
          paint(M.map((row, i) => row.map((v, j) => (v === -Infinity || from[i][j] === -Infinity ? v : from[i][j] + (v - from[i][j]) * t))))
        );
      },
      // Only the first k cells (row by row) are filled; the rest are drawn empty. Used by the sweeps.
      reveal(k = Infinity) {
        if (k === shown) return;
        shown = k;
        if (values) paint(values);
      },
      row(i) {
        hlRow.classList.toggle("is-off", i == null);
        if (i != null) hlRow.setAttribute("y", i * cell - 2);
      },
      col(j) {
        hlCol.classList.toggle("is-off", j == null);
        if (j != null) hlCol.setAttribute("x", j * cell - 2);
      },
      cellAt(i, j) {
        hlCell.classList.toggle("is-off", i == null);
        if (i != null) {
          hlCell.setAttribute("x", j * cell - 2);
          hlCell.setAttribute("y", i * cell - 2);
        }
      },
      clear() {
        api.row(null);
        api.col(null);
        api.cellAt(null);
      },
      // Fades every row except the given ones (null shows all).
      focusRows(list) {
        cells.forEach((c) => c.g.classList.toggle("is-faded", list != null && !list.includes(c.i)));
        rowLabelEls.forEach((el, i) => el.classList.toggle("is-faded", list != null && !list.includes(i)));
      },
      // Calls fn(i) when a row label is hovered, focused or tapped, and fn(null) when the pointer or focus leaves.
      onRow(fn) {
        rowLabelEls.forEach((el, i) => pick(el, i, fn));
        g.classList.add("has-rows");
      },
      place: (x, y, o) => place(g, x, y, o),
      hide: () => hide(g),
    };
    hide(g);
    return api;
  }

  // Hover, keyboard focus and tap all pick the same item; on phones (no hover) a tap keeps it picked.
  function pick(el, i, fn) {
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.addEventListener("mouseenter", () => fn(i));
    el.addEventListener("mouseleave", () => fn(null));
    el.addEventListener("focus", () => fn(i));
    el.addEventListener("blur", () => fn(null));
    el.addEventListener("click", () => fn(i));
  }

  // Maps a step's progress t (0 → 1) to a count 0 … count + 1. The sweep runs over the first 80% of the step and
  // the last 20% holds the finished state (count + 1), since t only reaches 1 as the next step takes over.
  function progress(t, count, hold = 0.2) {
    const u = clamp(t / (1 - hold), 0, 1);
    return u >= 1 ? count + 1 : Math.floor(u * (count + 1));
  }

  // Sweeps C = A·B cell by cell as t goes 0 → 1: the current row of A, column of B and cell of C light up,
  // and the formula strip writes out the dot product. Returns the active (i, j) or null when done.
  function sweep(A, B, C, t, strip, label) {
    const n = C.rows * C.cols;
    const k = progress(t, n);
    C.reveal(k);
    if (k === 0 || k > n) {
      A.clear();
      B.clear();
      C.clear();
      if (strip) strip(k > n ? label.done : label.start);
      return null;
    }
    const i = Math.floor((k - 1) / C.cols);
    const j = (k - 1) % C.cols;
    A.clear();
    B.clear();
    A.row(i);
    B.col(j);
    C.cellAt(i, j);
    if (strip) {
      const a = A.values[i];
      const b = B.values.map((row) => row[j]);
      strip(label.cell(i, j, `${terms(a, b)} = ${fmt(C.values[i][j])}`));
    }
    return [i, j];
  }

  /* ---------------------------------------------------------------- attention lines */

  // Query words on the left, key words on the right, one line per pair with width set by the attention weight.
  function lines(parent, opts) {
    const n = opts.left.length;
    const m = opts.right.length;
    const gap = opts.gap ?? 30;
    const width = opts.width ?? 260;
    const g = s("g", { class: `tf-lines ${opts.className ?? ""}` });
    const linkG = s("g");
    const links = [];
    for (let i = 0; i < n; i++)
      for (let j = 0; j < m; j++) {
        const line = s("line", { x1: 0, y1: i * gap, x2: width, y2: j * gap });
        links.push({ line, i, j });
        linkG.append(line);
      }
    const left = opts.left.map((label, i) =>
      s("text", { class: "tf-word tf-word-left", x: -10, y: i * gap + 4, "text-anchor": "end", "data-i": i, text: label })
    );
    const right = opts.right.map((label, j) => s("text", { class: "tf-word", x: width + 10, y: j * gap + 4, text: label }));
    const dots = [
      ...opts.left.map((_, i) => s("circle", { class: "tf-dot", cx: 0, cy: i * gap, r: 2.5 })),
      ...opts.right.map((_, j) => s("circle", { class: "tf-dot", cx: width, cy: j * gap, r: 2.5 })),
    ];
    g.append(linkG, ...dots, ...left, ...right);
    if (opts.title) g.append(s("text", { class: "tf-mat-title", x: -10, y: -22, "text-anchor": "end", text: opts.title }));
    if (opts.rightTitle) g.append(s("text", { class: "tf-mat-title", x: width + 10, y: -22, text: opts.rightTitle }));
    parent.append(g);

    let weights = null;
    let focus = null;
    function paint() {
      if (!weights) return;
      links.forEach(({ line, i, j }) => {
        const w = weights[i][j];
        const off = focus != null && focus !== i;
        line.style.strokeWidth = (0.4 + 7 * w).toFixed(2);
        line.style.opacity = off ? "0.04" : (0.08 + 0.92 * w).toFixed(3);
      });
      left.forEach((el, i) => el.classList.toggle("is-focus", focus === i));
      right.forEach((el, j) => {
        const w = focus == null ? 0 : weights[focus][j];
        el.classList.toggle("is-focus", focus != null && w === Math.max(...weights[focus]));
      });
    }
    const api = {
      el: g,
      left,
      height: (Math.max(n, m) - 1) * gap,
      width,
      set(W) {
        weights = W;
        paint();
      },
      focus(i) {
        focus = i;
        paint();
      },
      onPick(fn) {
        left.forEach((el, i) => pick(el, i, fn));
      },
      place: (x, y, o) => place(g, x, y, o),
      hide: () => hide(g),
    };
    hide(g);
    return api;
  }

  /* ---------------------------------------------------------------- bars */

  // Horizontal bars, one per label. kind "prob" draws 0..1; "signed" draws around a centre line.
  function bars(parent, opts) {
    const gap = opts.gap ?? 24;
    const width = opts.width ?? 200;
    // an invisible frame at full size, so the bounding box doesn't change as the bars grow
    const g = s("g", { class: "tf-bars" }, s("rect", { x: 0, y: 0, width: width + 44, height: opts.labels.length * gap, fill: "none" }));
    if (opts.title) g.append(s("text", { class: "tf-mat-title", x: 0, y: -14, text: opts.title }));
    const rows = opts.labels.map((label, i) => {
      const y = i * gap;
      const bar = s("rect", { class: "tf-bar", x: 0, y: y + 3, height: gap - 8, width: 0 });
      const value = s("text", { class: "tf-bar-value", x: 0, y: y + gap / 2 + 3 });
      const name = s("text", { class: "tf-word", x: -8, y: y + gap / 2 + 3, "text-anchor": "end", text: label });
      g.append(bar, value, name);
      return { bar, value, name };
    });
    parent.append(g);
    const api = {
      el: g,
      height: opts.labels.length * gap,
      set(values, highlight) {
        const max = opts.max ?? 1;
        values.forEach((v, i) => {
          const w = clamp(v / max, 0, 1) * width;
          rows[i].bar.setAttribute("width", w.toFixed(1));
          rows[i].value.setAttribute("x", (w + 6).toFixed(1));
          rows[i].value.textContent = opts.percent ? `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%` : fmt(v);
          rows[i].bar.classList.toggle("is-focus", i === highlight);
        });
      },
      place: (x, y, o) => place(g, x, y, o),
      hide: () => hide(g),
    };
    hide(g);
    return api;
  }

  TF.view = { h, s, animate, clamp, fmt, terms, place, hide, fitView, boxOf, stage, matrix, progress, sweep, lines, bars, motionQuery, narrow };
})();
