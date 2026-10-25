// Part 3 of the series: one encoder block. Residual connections, LayerNorm, the position-wise feed-forward network,
// and stacking blocks. Everything comes from TF.encode with positions on and two layers.
(function () {
  "use strict";

  const TF = window.TF;
  const V = TF.view;
  const { s, fmt } = V;
  TF.scenes = TF.scenes || {};

  const C = 30; // cell size
  const TOP = 66;
  const D = TF.config.dModel;
  const FF = TF.config.dFF;

  TF.scenes.part3 = function (stage) {
    const { svg, strip } = stage;
    let o = null;
    let last = { step: null, t: 0 };
    let hover = null;
    const layout = V.stage(svg, () => o);

    /* -------------------------------------------- build */

    function build(tokens) {
      svg.replaceChildren();
      svg._fit = null;
      const words = tokens.map((t) => t.text);
      const n = words.length;
      const enc = TF.encode(tokens, { layers: 2 });
      const L = enc.layers[0];
      const m = (opts) => V.matrix(svg, { cell: C, range: 2, ...opts });

      o = {
        words,
        n,
        enc,
        L,
        diagram: V.block(svg, {
          rows: [
            { id: "attn", label: "Multi-head attention", kind: "attn", fork: "qkv", note: `${TF.config.heads} heads · d_k = ${TF.config.dK}` },
            { id: "norm1", label: "Add & Norm", kind: "norm", skip: "attn" },
            { id: "ffn", label: "Feed forward", kind: "ffn", note: `${D} → ${FF} → ${D}` },
            { id: "norm2", label: "Add & Norm", kind: "norm", skip: "ffn" },
          ],
          foot: [
            { id: "embed", label: "Input embedding", kind: "embed" },
            { id: "pe", kind: "pe" },
          ],
          input: "words",
          output: "to the next block",
          shape: `${n} × ${D}`,
          repeat: "× N",
        }),
        // residual
        RX: m({ rows: n, cols: D, name: "X", note: "block input", rowLabels: words }),
        RA: m({ rows: n, cols: D, name: "attention(X)" }),
        RS: m({ rows: n, cols: D, name: "X + attention(X)" }),
        ops1: opSigns(),
        // layer norm
        NS: m({ rows: n, cols: D, name: "sum", rowLabels: words }),
        stats: statColumns(n),
        NN: m({ rows: n, cols: D, name: "LayerNorm(sum)", rowLabels: words }),
        line: numberLine(),
        // feed-forward, first half
        FN: m({ rows: n, cols: D, name: "x", rowLabels: words }),
        W1: m({ rows: D, cols: FF, name: "W₁", range: 1 }),
        Hd: m({ rows: n, cols: FF, name: "x · W₁", range: 2 }),
        // feed-forward, second half
        FA: m({ rows: n, cols: FF, name: "ReLU(x · W₁)", rowLabels: words, range: 2 }),
        W2: m({ rows: FF, cols: D, name: "W₂", range: 1 }),
        FO: m({ rows: n, cols: D, name: "FFN(x)" }),
        // second add & norm
        AN: m({ rows: n, cols: D, name: "x", rowLabels: words }),
        AF: m({ rows: n, cols: D, name: "FFN(x)" }),
        AS: m({ rows: n, cols: D, name: "Add & Norm" }),
        ops2: opSigns(),
        // stack
        S0: m({ rows: n, cols: D, cell: 16, name: "X + PE", rowLabels: words }),
        S1: m({ rows: n, cols: D, cell: 16, name: "block 1 out" }),
        S2: m({ rows: n, cols: D, cell: 16, name: "block 2 out" }),
        flow: flow(n),
      };
      o.RX.set(L.input);
      o.RA.set(L.attn.out);
      o.RS.set(L.norm1.sum);
      o.NS.set(L.norm1.sum);
      o.NN.set(L.norm1.out);
      o.FN.set(L.norm1.out);
      o.W1.set(TF.weights.encoder[0].ffn.W1);
      o.Hd.set(L.ffn.hidden);
      o.FA.set(L.ffn.active);
      o.W2.set(TF.weights.encoder[0].ffn.W2);
      o.FO.set(L.ffn.out);
      o.AN.set(L.norm1.out);
      o.AF.set(L.ffn.out);
      o.AS.set(L.norm2.sum);
      o.S0.set(enc.x);
      o.S1.set(L.out);
      o.S2.set(enc.layers[1].out);
      o.stats.set(L.norm1.mean, L.norm1.variance);
      const pick = (i) => {
        hover = i;
        render(last.step, last.t);
      };
      o.NS.onRow(pick);
      o.NN.onRow(pick);
    }

    /* -------------------------------------------- scene-only drawings */

    function opSigns() {
      const g = s("g", { class: "tf-obj" });
      const plus = s("text", { class: "tf-op", "text-anchor": "middle", text: "+" });
      const eq = s("text", { class: "tf-op", "text-anchor": "middle", text: "=" });
      g.append(plus, eq);
      svg.append(g);
      return { g, plus, eq };
    }

    // "mean" and "variance" columns beside the sum matrix.
    function statColumns(n) {
      const g = s("g", { class: "tf-obj" });
      g.append(s("text", { class: "tf-caps", x: 0, y: -10, text: "mean" }), s("text", { class: "tf-caps", x: 62, y: -10, text: "variance" }));
      const cells = Array.from({ length: n }, (_, i) => {
        const y = i * C + C / 2 + 4;
        const mean = s("text", { class: "tf-mono", x: 0, y });
        const variance = s("text", { class: "tf-mono", x: 62, y });
        g.append(mean, variance);
        return { mean, variance };
      });
      svg.append(g);
      return {
        g,
        cells,
        set(mean, variance) {
          cells.forEach((c, i) => {
            c.mean.textContent = fmt(mean[i]);
            c.variance.textContent = fmt(variance[i]);
          });
        },
        show(k, focus) {
          cells.forEach((c, i) => {
            c.mean.style.opacity = c.variance.style.opacity = i < k ? (focus == null || focus === i ? "1" : "0.3") : "0";
          });
        },
      };
    }

    // One row of numbers as dots on a line, before and after LayerNorm, with each row's mean marked.
    function numberLine() {
      const g = s("g", { class: "tf-obj" });
      const unit = 60;
      const x = (v) => V.clamp(v, -3.4, 3.4) * unit;
      const rowY = [0, 50];
      [-3, -2, -1, 0, 1, 2, 3].forEach((v) =>
        g.append(
          s("line", { class: "tf-stroke-muted", x1: v * unit, y1: -14, x2: v * unit, y2: 64, "stroke-dasharray": v ? "1 3" : "none" }),
          s("text", { class: "tf-small", x: v * unit, y: 82, "text-anchor": "middle", text: fmt(v, 0) })
        )
      );
      const labels = ["before", "after"].map((text, r) =>
        s("text", { class: "tf-caps", x: -3.4 * unit - 14, y: rowY[r] + 4, "text-anchor": "end", text })
      );
      const means = rowY.map((y) => s("line", { class: "tf-marker-line", y1: y - 12, y2: y + 12 }));
      const dots = rowY.map((y) => Array.from({ length: D }, () => s("circle", { class: "tf-wave-dot", cy: y, r: 4.5 })));
      g.append(...labels, ...means, ...dots.flat());
      svg.append(g);
      return {
        g,
        set(before, after) {
          [before, after].forEach((row, r) => {
            row.forEach((v, j) => dots[r][j].setAttribute("cx", x(v)));
            const mean = row.reduce((a, b) => a + b, 0) / row.length;
            means[r].setAttribute("x1", x(mean));
            means[r].setAttribute("x2", x(mean));
          });
          dots[1].forEach((d) => d.classList.add("is-on"));
        },
      };
    }

    // X → block 1 → block 2: arrows and boxes between the three small matrices.
    function flow(n) {
      const g = s("g", { class: "tf-obj" });
      const h = n * 16;
      [0, 1].forEach((b) => {
        const x = 128 + 30 + b * 330;
        g.append(
          s("line", { class: "tf-stroke-muted", x1: x - 22, y1: h / 2, x2: x + 150, y2: h / 2 }),
          s("path", { class: "tf-arrow", d: `M ${x + 144} ${h / 2 - 4} L ${x + 152} ${h / 2} L ${x + 144} ${h / 2 + 4} Z` }),
          s("rect", { class: "tf-box", x: x + 6, y: h / 2 - 22, width: 118, height: 44, rx: 4 }),
          s("text", { class: "tf-block-label", x: x + 65, y: h / 2 + 4, "text-anchor": "middle", text: `encoder block ${b + 1}` })
        );
      });
      svg.append(g);
      return { g };
    }

    /* -------------------------------------------- render */

    const quote = (w) => `“${w}”`;
    const setOnce = (mat, M) => mat.values !== M && mat.set(M, true);
    const row = (M, i) => `[${M[i].map((v) => fmt(v)).join(", ")}]`;

    // A + B = S, row by row: places the three matrices and the signs, returns the row index being added (or null).
    function addRows(A, B, S, ops, t) {
      const y = TOP + 20;
      const x2 = 90 + D * C + 50;
      const x3 = x2 + D * C + 60;
      const n = o.n;
      const spec = {};
      spec[key(A)] = [90, y];
      spec[key(B)] = [x2, y];
      spec[key(S)] = [x3, y];
      spec[key(ops)] = [0, 0];
      layout(spec);
      const mid = y + (n * C) / 2 + 8;
      ops.plus.setAttribute("x", x2 - 25);
      ops.plus.setAttribute("y", mid);
      ops.eq.setAttribute("x", x3 - 30);
      ops.eq.setAttribute("y", mid);
      const k = V.progress(t, n);
      S.reveal(Math.min(k, n) * D);
      const i = k >= 1 && k <= n ? k - 1 : null;
      [A, B, S].forEach((mat) => mat.row(i));
      return { k, i };
    }
    const key = (obj) => Object.keys(o).find((k) => o[k] === obj);

    const steps = {
      block(t) {
        layout({ diagram: [300, TOP + 70] });
        const ids = ["attn", "norm1", "ffn", "norm2"];
        const k = Math.min(ids.length - 1, Math.floor(V.clamp(t / 0.8, 0, 0.999) * ids.length));
        o.diagram.set(ids[k]);
        strip(
          [
            "Sublayer 1: multi-head attention, from parts 1 and 2. Words share information.",
            "Add & Norm: add the input back (the side path), then normalise each row.",
            "Sublayer 2: a small feed-forward network, run on each word on its own.",
            "Add & Norm again. The output has the same shape as the input, so blocks stack.",
          ][k]
        );
      },

      residual(t) {
        const { k, i } = addRows(o.RX, o.RA, o.RS, o.ops1, t);
        if (i == null)
          return strip(
            k === 0
              ? "The residual connection: add the sublayer's input to its output, x + Sublayer(x)."
              : "Each word keeps its own vector and adds what attention found on top. Nothing has to be re-learned from scratch."
          );
        strip(`${quote(o.words[i])}: ${row(o.L.input, i)} + ${row(o.L.attn.out, i)}`);
      },

      norm(t) {
        const y = TOP + 20;
        const n = o.n;
        const h = n * C;
        // on phones the result goes under the sum instead of beside it, so the figure stays readable
        const [xN, yN] = V.narrow.matches ? [90, y + h + 60] : [90 + D * C + 190, y];
        layout({ NS: [90, y], stats: [90 + D * C + 14, y], NN: [xN, yN], line: [300, yN + h + 80] });
        const k = V.progress(t, n);
        const i = hover ?? (k >= 1 && k <= n ? k - 1 : n > 2 ? 2 : 0);
        o.stats.show(Math.max(k, hover != null ? n : 0), i);
        o.NN.reveal(Math.min(Math.max(k, hover != null ? n : 0), n) * D);
        o.NS.row(i);
        o.NN.row(i);
        o.line.set(o.L.norm1.sum[i], o.L.norm1.out[i]);
        const mean = o.L.norm1.mean[i];
        const variance = o.L.norm1.variance[i];
        strip(
          `${quote(o.words[i])}: mean ${fmt(mean)}, variance ${fmt(variance)}. Subtract the mean, divide by √(variance + ε) = ${fmt(Math.sqrt(variance + 1e-5))}.`
        );
      },

      ffn1(t) {
        const yB = TOP + D * C + 40;
        const x = 90 + D * C + 30;
        layout({ FN: [90, yB], W1: [x, TOP], Hd: [x, yB, { noRows: true }] });
        if (t < 0.72) {
          setOnce(o.Hd, o.L.ffn.hidden);
          V.sweep(o.FN, o.W1, o.Hd, t / 0.72, strip, {
            start: "First layer: multiply each word's 8 numbers by W₁ (8 × 16). Every word grows to 16 numbers.",
            done: "16 numbers per word. The paper grows 512 to 2048: four times wider, like ours (8 → 16).",
            cell: (i, j, sum) => `h[${o.words[i]}][${j}] = ${sum}`,
          });
          return;
        }
        o.FN.clear();
        o.W1.clear();
        o.Hd.clear();
        o.Hd.reveal();
        setOnce(o.Hd, o.L.ffn.active);
        const zeros = o.L.ffn.hidden.flat().filter((v) => v < 0).length;
        strip(`ReLU(x) = max(0, x): every negative number becomes 0. Here ${zeros} of ${o.n * FF} numbers are cut.`);
      },

      ffn2(t) {
        const yB = TOP + FF * C + 40;
        const x = 90 + FF * C + 30;
        layout({ FA: [90, yB], W2: [x, TOP], FO: [x, yB, { noRows: true }] });
        V.sweep(o.FA, o.W2, o.FO, t, strip, {
          start: "Second layer: multiply by W₂ (16 × 8) to shrink back to 8 numbers per word.",
          done: "FFN(x) = max(0, x W₁ + b₁) W₂ + b₂, the paper's equation (2). The same weights are used for every word.",
          cell: (i, j, sum) => `ffn[${o.words[i]}][${j}] = ${sum}`,
        });
      },

      addnorm2(t) {
        const { k, i } = addRows(o.AN, o.AF, o.AS, o.ops2, Math.min(1, t / 0.7));
        const normed = t >= 0.72;
        setOnce(o.AS, normed ? o.L.norm2.out : o.L.norm2.sum);
        if (normed) return strip("Then LayerNorm, row by row. This is the block's output: the same n × 8 shape that came in.");
        if (i == null) return strip(k === 0 ? "The second residual: x + FFN(x), then LayerNorm again." : "Added. Now normalise each row.");
        strip(`${quote(o.words[i])}: ${row(o.L.norm1.out, i)} + ${row(o.L.ffn.out, i)}`);
      },

      stack(t) {
        const k = Math.min(2, Math.floor(V.clamp(t / 0.8, 0, 0.999) * 3));
        layout({ S0: [0, TOP], S1: [330, TOP, { dim: k < 1 }], S2: [660, TOP, { dim: k < 2 }], flow: [0, TOP] });
        strip(
          [
            "Block 1 gets X + PE…",
            "…and its output, the same shape, goes straight into block 2…",
            "…and so on. Our toy stacks 2 blocks with different weights; the paper stacks N = 6.",
          ][k]
        );
      },
    };

    function render(step, t) {
      if (!o || !steps[step]) return;
      if (step !== last.step) hover = null;
      last = { step, t };
      steps[step](t);
    }

    return { viewBox: "0 0 800 560", build, render };
  };
})();
