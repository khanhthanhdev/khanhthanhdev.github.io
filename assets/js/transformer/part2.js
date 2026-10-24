// Part 2 of the series: positional encoding and multi-head attention. One scene, eight steps.
// Uses both heads of the first encoder layer; positions are switched off for the first step to show what is missing.
(function () {
  "use strict";

  const TF = window.TF;
  const V = TF.view;
  const { h, s, fmt } = V;
  TF.scenes = TF.scenes || {};

  const C = 30; // cell size
  const TOP = 66;
  const D = TF.config.dModel;
  const DIMS = Array.from({ length: D }, (_, d) => `${d % 2 ? "cos" : "sin"} ω${"₀₁₂₃"[Math.floor(d / 2)]}`);
  const omega = (d) => Math.pow(10000, -(2 * Math.floor(d / 2)) / D);
  const peAt = (pos, d) => (d % 2 ? Math.cos(pos * omega(d)) : Math.sin(pos * omega(d)));

  // 1234 → "1.2 K"; plain below a thousand.
  function big(v) {
    const units = [
      [1e12, "T"],
      [1e9, "B"],
      [1e6, "M"],
      [1e3, "K"],
    ];
    for (const [k, u] of units) if (v >= k) return `${(v / k).toFixed(v >= 10 * k ? 0 : 1)} ${u}`;
    return String(Math.round(v));
  }

  TF.scenes.part2 = function (stage) {
    const { svg, strip, controls } = stage;
    let o = null;
    let last = { step: null, t: 0 };
    let hover = null;
    const layout = V.stage(svg, () => o);

    /* -------------------------------------------- cost step controls */

    const lengths = [16, 64, 256, 512, 1024, 4096, 16384];
    const nSlider = h("input", { type: "range", min: 0, max: lengths.length - 1, step: 1, value: 2, id: "tf2-n" });
    const nOut = h("output", { for: "tf2-n" });
    controls.append(h("label", { for: "tf2-n", text: "words n" }), nSlider, nOut, h("span", { class: "tf-label", text: "d = 512" }));
    nSlider.addEventListener("input", () => render(last.step, last.t));

    /* -------------------------------------------- build */

    function build(tokens) {
      svg.replaceChildren();
      svg._fit = null;
      const words = tokens.map((t) => t.text);
      const n = words.length;
      const reversed = tokens.slice().reverse();
      const flat = TF.encode(tokens, { positional: false, layers: 1 });
      const flatRev = TF.encode(reversed, { positional: false, layers: 1 });
      const pos = TF.encode(tokens, { layers: 1 });
      const posRev = TF.encode(reversed, { layers: 1 });
      const layer = pos.layers[0];
      const m = (opts) => V.matrix(svg, opts);
      const positions = words.map((_, i) => `pos ${i}`);

      o = {
        words,
        n,
        flat,
        flatRev,
        pos,
        posRev,
        layer,
        outA: m({ rows: n, cols: D, name: "attention out", rowLabels: words, range: 1 }),
        outB: m({ rows: n, cols: D, name: "reversed sentence", rowLabels: words.slice().reverse(), range: 1 }),
        links: links(n),
        waves: waves(n),
        PE: m({ rows: n, cols: D, name: "PE", colLabels: DIMS, rowLabels: positions, range: 1 }),
        X: m({ rows: n, cols: D, name: "X", colLabels: TF.FEATURES, rowLabels: words, range: 1.5 }),
        PEb: m({ rows: n, cols: D, name: "PE", colLabels: DIMS, range: 1 }),
        Xp: m({ rows: n, cols: D, name: "X + PE", rowLabels: words, range: 1.5 }),
        ops: opSigns(),
        circles: circles(n),
        A1: m({ rows: n, cols: n, kind: "prob", name: "head 1", note: "hand-wired", rowLabels: words, colLabels: words }),
        A2: m({ rows: n, cols: n, kind: "prob", name: "head 2", note: "random", rowLabels: words, colLabels: words }),
        Z1: m({ rows: n, cols: 4, name: "head 1", rowLabels: words, range: 1 }),
        Z2: m({ rows: n, cols: 4, name: "head 2", range: 1 }),
        Cat: m({ rows: n, cols: D, name: "concat", rowLabels: words, range: 1 }),
        Wo: m({ rows: D, cols: D, name: "W_O", range: 1 }),
        Out: m({ rows: n, cols: D, name: "output", range: 1 }),
        table: costTable(),
        work: V.bars(svg, { labels: ["attention", "recurrent"], width: 240, gap: 30, title: "multiply-adds per layer", format: big }),
        wait: V.bars(svg, { labels: ["attention", "recurrent"], width: 240, gap: 30, title: "steps that must wait", format: big }),
      };
      o.PE.set(pos.pe);
      o.PEb.set(pos.pe);
      o.X.set(pos.E);
      o.Xp.set(pos.x);
      o.A1.set(layer.attn.heads[0].weights);
      o.A2.set(layer.attn.heads[1].weights);
      o.Z1.set(layer.attn.heads[0].out);
      o.Z2.set(layer.attn.heads[1].out);
      o.Cat.set(layer.attn.concat);
      o.Wo.set(TF.weights.encoder[0].attn.Wo);
      o.Out.set(layer.attn.out);
      const pick = (i) => {
        hover = i;
        render(last.step, last.t);
      };
      o.A1.onRow(pick);
      o.A2.onRow(pick);
    }

    /* -------------------------------------------- scene-only drawings */

    // Lines joining each word's output row to the same word's row in the reversed sentence.
    function links(n) {
      const g = s("g", { class: "tf-obj" });
      const list = Array.from({ length: n }, () => s("line", { class: "tf-link" }));
      g.append(...list);
      svg.append(g);
      return { g, list };
    }

    // One small wave per dimension of the positional encoding, with a dot at each word's position.
    function waves(n) {
      const g = s("g", { class: "tf-obj" });
      const span = TF.config.maxLen - 1;
      const dx = 30;
      const rowH = 38;
      const amp = 12;
      const dots = [];
      g.append(s("text", { class: "tf-caps", x: 0, y: -18, text: "one wave per column · x = position" }));
      for (let d = 0; d < D; d++) {
        const y0 = d * rowH + amp;
        let path = "";
        for (let p = 0; p <= span * 10; p++) {
          const x = (p / 10) * dx;
          path += `${p ? "L" : "M"} ${x.toFixed(1)} ${(y0 - amp * peAt(p / 10, d)).toFixed(1)} `;
        }
        g.append(
          s("line", { class: "tf-stroke-muted", x1: 0, y1: y0, x2: span * dx, y2: y0, "stroke-dasharray": "2 3" }),
          s("path", { class: "tf-wave", d: path }),
          s("text", { class: "tf-axis", x: -10, y: y0 + 4, "text-anchor": "end", text: DIMS[d] })
        );
        dots.push(
          Array.from({ length: n }, (_, p) => {
            const dot = s("circle", { class: "tf-wave-dot", cx: p * dx, cy: y0 - amp * peAt(p, d), r: 3.5 });
            g.append(dot);
            return dot;
          })
        );
      }
      const marker = s("line", { class: "tf-marker-line", x1: 0, y1: -6, x2: 0, y2: D * rowH });
      g.append(marker);
      for (let p = 0; p <= span; p++) g.append(s("text", { class: "tf-small", x: p * dx, y: D * rowH + 14, "text-anchor": "middle", text: p }));
      svg.append(g);
      return { g, dots, marker, dx };
    }

    function opSigns() {
      const g = s("g", { class: "tf-obj" });
      const plus = s("text", { class: "tf-op", "text-anchor": "middle", text: "+" });
      const eq = s("text", { class: "tf-op", "text-anchor": "middle", text: "=" });
      g.append(plus, eq);
      svg.append(g);
      return { g, plus, eq };
    }

    // Two frequency pairs of the encoding drawn as points on a circle: (sin, cos) of pos · ω.
    function circles(n) {
      const g = s("g", { class: "tf-obj" });
      const r = 100;
      const rings = [0, 1].map((pair, c) => {
        const cx = 130 + c * 300;
        const cy = 140;
        const w = omega(2 * pair);
        const at = (p) => [cx + r * Math.sin(p * w), cy - r * Math.cos(p * w)];
        const ring = s("g");
        ring.append(
          s("circle", { class: "tf-stroke-muted", cx, cy, r }),
          s("text", { class: "tf-axis", x: cx, y: cy + r + 34, "text-anchor": "middle", text: `${DIMS[2 * pair]}, ${DIMS[2 * pair + 1]}` }),
          s("text", { class: "tf-small", x: cx, y: cy + r + 50, "text-anchor": "middle", text: `ω = ${w >= 0.1 ? w.toFixed(1) : w} rad per step` })
        );
        const spoke = s("line", { class: "tf-stroke", x1: cx, y1: cy });
        const nextSpoke = s("line", { class: "tf-stroke-muted", x1: cx, y1: cy, "stroke-dasharray": "3 3" });
        ring.append(spoke, nextSpoke);
        const dots = Array.from({ length: n }, (_, p) => {
          const [x, y] = at(p);
          const dot = s("circle", { class: "tf-wave-dot", cx: x, cy: y, r: 4 });
          ring.append(dot);
          return dot;
        });
        // labels for the first and last positions only: the slow ring packs its dots too close for all of them
        [0, n - 1].forEach((p) => {
          const [x, y] = at(p);
          const out = 1 + 16 / r;
          ring.append(s("text", { class: "tf-small", x: cx + (x - cx) * out, y: cy + (y - cy) * out + 4, "text-anchor": "middle", text: p }));
        });
        g.append(ring);
        return { at, spoke, nextSpoke, dots };
      });
      svg.append(g);
      return { g, rings };
    }

    // Table 1 of the paper, trimmed to three layer types.
    function costTable() {
      const g = s("g", { class: "tf-obj" });
      const cols = [0, 140, 290, 420];
      const rows = [
        ["layer", "work per layer", "sequential steps", "path length"],
        ["self-attention", "O(n²·d)", "O(1)", "O(1)"],
        ["recurrent", "O(n·d²)", "O(n)", "O(n)"],
        ["convolutional", "O(k·n·d²)", "O(1)", "O(logₖ n)"],
      ];
      rows.forEach((row, r) =>
        row.forEach((text, c) => g.append(s("text", { class: r ? (c ? "tf-mono" : "tf-word") : "tf-caps", x: cols[c], y: r * 28, text })))
      );
      g.append(s("line", { class: "tf-stroke-muted", x1: 0, y1: 10, x2: 530, y2: 10 }));
      g.append(
        s("text", { class: "tf-small", x: 0, y: 4 * 28 + 6, text: "From Table 1 of the paper. n = words, d = numbers per word, k = kernel width." })
      );
      svg.append(g);
      return { g };
    }

    /* -------------------------------------------- render */

    const quote = (w) => `“${w}”`;
    const setOnce = (mat, M) => mat.values !== M && mat.set(M, true);

    // Places the two output matrices and joins matching rows; returns the largest gap between matching rows.
    function compare(A, B) {
      const n = o.n;
      const xA = 90;
      const xB = xA + D * C + 170;
      layout({ outA: [xA, TOP], outB: [xB, TOP], links: [0, 0] });
      setOnce(o.outA, A);
      setOnce(o.outB, B);
      let worst = 0;
      o.links.list.forEach((line, i) => {
        const j = n - 1 - i;
        const gap = Math.max(...A[i].map((v, k) => Math.abs(v - B[j][k])));
        worst = Math.max(worst, gap);
        line.setAttribute("x1", xA + D * C + 6);
        line.setAttribute("y1", TOP + i * C + C / 2);
        line.setAttribute("x2", xB - 66);
        line.setAttribute("y2", TOP + j * C + C / 2);
        line.classList.toggle("is-diff", gap > 1e-9);
      });
      return worst;
    }

    const steps = {
      shuffle() {
        const worst = compare(o.flat.layers[0].attn.out, o.flatRev.layers[0].attn.out);
        strip(`No positions: each word's row is the same whichever order the words come in. Largest difference: ${fmt(worst)}.`);
      },

      waves(t) {
        layout({ waves: [90, TOP + 20], PE: [480, TOP + 44] });
        const k = Math.min(o.n - 1, Math.floor(V.clamp(t / 0.8, 0, 0.999) * o.n));
        o.waves.marker.setAttribute("x1", k * o.waves.dx);
        o.waves.marker.setAttribute("x2", k * o.waves.dx);
        o.waves.dots.forEach((row) => row.forEach((dot, p) => dot.classList.toggle("is-on", p === k)));
        o.PE.row(k);
        strip(`PE[${k}] = [${o.pos.pe[k].map((v) => fmt(v)).join(", ")}]: the heights of all 8 waves at position ${k}.`);
      },

      addpe(t) {
        const y = TOP + 44;
        const x2 = 90 + D * C + 50;
        const x3 = x2 + D * C + 90;
        layout({ X: [90, y], PEb: [x2, y], Xp: [x3, y], ops: [0, 0] });
        const mid = y + (o.n * C) / 2 + 8;
        o.ops.plus.setAttribute("x", x2 - 25);
        o.ops.plus.setAttribute("y", mid);
        o.ops.eq.setAttribute("x", x3 - 45);
        o.ops.eq.setAttribute("y", mid);
        const k = V.progress(t, o.n);
        o.Xp.reveal(Math.min(k, o.n) * D);
        [o.X, o.PEb, o.Xp].forEach((mat) => mat.row(k >= 1 && k <= o.n ? k - 1 : null));
        PEstrip(k);
      },

      order() {
        const worst = compare(o.pos.layers[0].attn.out, o.posRev.layers[0].attn.out);
        strip(`With positions added, the same word in a different place gets a different row. Largest difference: ${fmt(worst)}.`);
      },

      rotate(t) {
        layout({ circles: [40, TOP] });
        const k = Math.min(o.n - 1, Math.floor(V.clamp(t / 0.8, 0, 0.999) * o.n));
        o.circles.rings.forEach((ring) => {
          const [x, y] = ring.at(k);
          const [nx, ny] = ring.at(k + 1);
          ring.spoke.setAttribute("x2", x);
          ring.spoke.setAttribute("y2", y);
          ring.nextSpoke.setAttribute("x2", nx);
          ring.nextSpoke.setAttribute("y2", ny);
          ring.dots.forEach((dot, p) => dot.classList.toggle("is-on", p === k));
        });
        strip(
          `Position ${k} → ${k + 1}: the point turns by the same angle wherever it starts. So "one word later" is always the same rotation, which a weight matrix can learn.`
        );
      },

      heads(t) {
        const n = o.n;
        layout({ A1: [90, TOP + 44], A2: [90 + n * C + 110, TOP + 44] });
        const k = V.progress(t, n);
        const i = hover ?? (k >= 1 && k <= n ? k - 1 : null);
        o.A1.row(i);
        o.A2.row(i);
        if (i == null) {
          strip("Each head has its own W_Q, W_K and W_V, so each one asks its own question of the same words.");
          return;
        }
        const best = (W) => {
          const j = W[i].indexOf(Math.max(...W[i]));
          return `${o.words[j]} ${(W[i][j] * 100).toFixed(0)}%`;
        };
        strip(`${quote(o.words[i])}: head 1 looks most at ${best(o.layer.attn.heads[0].weights)}, head 2 at ${best(o.layer.attn.heads[1].weights)}.`);
      },

      concat(t) {
        const yB = TOP + D * C + 40;
        const xR = 90 + D * C + 30;
        const apart = t < 0.15;
        if (t < 0.3) {
          layout({ Z1: [90, yB], Z2: [90 + 4 * C + (apart ? 40 : 0), yB] });
          o.Cat.reveal();
          strip("Each head gives n × 4 numbers. Put the two side by side and we are back to n × 8.");
          return;
        }
        layout({ Cat: [90, yB], Wo: [xR, TOP], Out: [xR, yB, { noRows: true }] });
        V.sweep(o.Cat, o.Wo, o.Out, (t - 0.3) / 0.7, strip, {
          start: "MultiHead = Concat(head₁, head₂) · W_O. One more weight matrix mixes what the heads found.",
          done: "Same shape as X again: one row of 8 numbers per word. The paper uses 8 heads of 64 numbers each, so 8 × 64 = 512.",
          cell: (i, j, sum) => `out[${o.words[i]}][${j}] = ${sum}`,
        });
      },

      cost() {
        layout({ table: [60, TOP], work: [160, TOP + 190], wait: [160, TOP + 300] });
        const n = lengths[Number(nSlider.value)];
        const d = 512;
        nOut.textContent = String(n);
        const work = [n * n * d, n * d * d];
        o.work.set(work, work[0] < work[1] ? 0 : 1, Math.max(...work));
        o.wait.set([1, n], 0, n);
        strip(
          `n = ${n}: attention does ${big(work[0])} multiply-adds, recurrence ${big(work[1])}. ` +
            (n < d ? "Attention is cheaper while n is less than d" : "Past n = d attention costs more") +
            `, and it never waits: recurrence takes ${n} steps one after another.`
        );
      },
    };

    function PEstrip(k) {
      if (k === 0) return strip("X + PE: each word's row plus its position's row, number by number.");
      if (k > o.n) return strip("The sum still carries the word (most of the size) and now also its place.");
      const i = k - 1;
      strip(`${quote(o.words[i])} at pos ${i}: ${o.pos.E[i].map((v, j) => `${fmt(v)}+${fmt(o.pos.pe[i][j])}`).join(", ")}`);
    }

    function render(step, t) {
      if (!o || !steps[step]) return;
      if (step !== last.step) hover = null;
      last = { step, t };
      controls.hidden = step !== "cost";
      steps[step](t);
    }

    return { viewBox: "0 0 800 560", build, render };
  };
})();
