// Part 1 of the series: self-attention from scratch. One scene, ten steps, every number from TF.encode.
// Uses head 0 of the first encoder layer (the hand-wired one) and no positional encoding, which comes in part 2.
(function () {
  "use strict";

  const TF = window.TF;
  const V = TF.view;
  const { h, s, fmt } = V;
  TF.scenes = TF.scenes || {};

  const C = 30; // cell size
  const TOP = 66;

  TF.scenes.part1 = function (stage) {
    const { svg, strip, controls } = stage;
    let o = null;
    let last = { step: null, t: 0 };
    let hover = null;

    /* -------------------------------------------- scale demo controls (only shown on the "scale" step) */

    const dkSteps = [4, 16, 64, 256, 1024];
    const slider = h("input", { type: "range", min: 0, max: dkSteps.length - 1, step: 1, value: 2, id: "tf1-dk" });
    const dkOut = h("output", { for: "tf1-dk" });
    const divide = h("input", { type: "checkbox", id: "tf1-div" });
    divide.checked = true;
    controls.append(h("label", { for: "tf1-dk", text: "d_k" }), slider, dkOut, h("label", { class: "tf-check" }, divide, " divide by √d_k"));
    [slider, divide].forEach((el) => el.addEventListener("input", () => render(last.step, last.t)));

    // Random q and k with unit-variance entries: the raw dot products spread out like √d_k.
    function demoScores(n, dk) {
      const rand = TF.rng(dk * 31 + n);
      const vec = () => Array.from({ length: dk }, () => rand.normal());
      const q = vec();
      return Array.from({ length: n }, () => TF.dot(q, vec()));
    }

    /* -------------------------------------------- build: every object for one sentence */

    function build(tokens) {
      svg.replaceChildren();
      const words = tokens.map((t) => t.text);
      const n = words.length;
      const enc = TF.encode(tokens, { positional: false, layers: 1 });
      const head = enc.layers[0].attn.heads[0];
      const W = TF.weights.encoder[0].attn.heads[0];

      const yB = TOP + 8 * C + 30; // below an 8-row weight matrix
      const yS = TOP + 4 * C + 30; // below Kᵀ
      const xS = 280;
      const yZ = TOP + n * C + 30; // below V
      svg._fit = null; // the next layout() snaps the view to the new sentence

      const m = (opts) => V.matrix(svg, opts);
      const featureLabels = TF.FEATURES;
      o = {
        words,
        n,
        enc,
        head,
        geo: { yB, yS, xS, yZ },
        rnn: chain(words),
        pairs: arcs(words),
        E: m({ rows: TF.vocab.length, cols: 8, cell: 10, range: 1, name: "E", note: "embedding table" }),
        X: m({ rows: n, cols: 8, name: "X", colLabels: featureLabels, rowLabels: words, range: 1.5 }),
        Wq: m({ rows: 8, cols: 4, name: "W_Q", role: "q", range: 2.5 }),
        Wk: m({ rows: 8, cols: 4, name: "W_K", role: "k", range: 2.5 }),
        Wv: m({ rows: 8, cols: 4, name: "W_V", role: "v", range: 1 }),
        Q: m({ rows: n, cols: 4, name: "Q", role: "q", rowLabels: words, range: 3 }),
        K: m({ rows: n, cols: 4, name: "K", role: "k", rowLabels: words, range: 3 }),
        Vm: m({ rows: n, cols: 4, name: "V", role: "v", rowLabels: words, range: 1.5 }),
        Kt: m({ rows: 4, cols: n, name: "Kᵀ", role: "k", colLabels: words, range: 3 }),
        S: m({ rows: n, cols: n, name: "Q·Kᵀ", rowLabels: words, range: 6 }),
        A: m({ rows: n, cols: n, kind: "prob", name: "weights", rowLabels: words }),
        Z: m({ rows: n, cols: 4, name: "output", rowLabels: words, range: 1.5 }),
        sums: sumColumn(n),
        bars: V.bars(svg, { labels: words, width: 70, gap: C, percent: true }),
        demo: V.bars(svg, { labels: words, width: 80, gap: C, percent: true, title: "random q · k" }),
        lines: V.lines(svg, { left: words, right: words, width: 220, gap: 34, title: "query", rightTitle: "key" }),
        fx: lookupFx(),
      };
      o.E.set(TF.weights.embedding);
      o.X.set(enc.x);
      o.Wq.set(W.Wq);
      o.Wk.set(W.Wk);
      o.Wv.set(W.Wv);
      o.Q.set(head.Q);
      o.K.set(head.K);
      o.Vm.set(head.V);
      o.Kt.set(TF.transpose(head.K));
      o.S.set(head.scores);
      o.A.set(head.weights);
      o.Z.set(head.out);
      o.lines.set(head.weights);
      o.lines.left.forEach((el, i) => {
        el.addEventListener("mouseenter", () => {
          hover = i;
          render(last.step, last.t);
        });
        el.addEventListener("mouseleave", () => {
          hover = null;
          render(last.step, last.t);
        });
      });
    }

    /* -------------------------------------------- small scene-only drawings */

    // An RNN: one memory box per word, each handing its state to the next.
    function chain(words) {
      const n = words.length;
      const gap = Math.min(72, 660 / n);
      const x0 = 400 - (gap * (n - 1)) / 2;
      const g = s("g", { class: "tf-obj" });
      const boxes = [];
      words.forEach((word, i) => {
        const x = x0 + i * gap;
        const box = s("rect", { class: "tf-box", x: x - 18, y: 150, width: 36, height: 30, rx: 4 });
        boxes.push(box);
        g.append(
          box,
          s("text", { class: "tf-small", x, y: 169, "text-anchor": "middle", text: `h${i + 1}` }),
          s("line", { class: "tf-stroke-muted", x1: x, y1: 222, x2: x, y2: 184 }),
          s("path", { class: "tf-arrow", d: `M ${x - 4} 188 L ${x} 181 L ${x + 4} 188 Z` }),
          s("text", { class: "tf-word", x, y: 240, "text-anchor": "middle", text: word })
        );
        if (i < n - 1) {
          const x1 = x + 18;
          const x2 = x + gap - 18;
          g.append(
            s("line", { class: "tf-stroke-muted", x1, y1: 165, x2: x2 - 3, y2: 165 }),
            s("path", { class: "tf-arrow", d: `M ${x2 - 7} 161 L ${x2} 165 L ${x2 - 7} 169 Z` })
          );
        }
      });
      g.append(
        s("text", { class: "tf-caps", x: x0 - 18, y: 120, text: "recurrent network · one step per word" }),
        s("text", {
          class: "tf-small",
          x: x0 - 18,
          y: 290,
          text: `“${words[0]}” reaches “${words[n - 1]}” only after ${n - 1} hand-offs.`,
        })
      );
      svg.append(g);
      return { g, boxes };
    }

    // Every pair of words joined directly by one arc.
    function arcs(words) {
      const n = words.length;
      const gap = Math.min(72, 660 / n);
      const x0 = 400 - (gap * (n - 1)) / 2;
      const y = 330;
      const g = s("g", { class: "tf-obj" });
      const list = [];
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const xi = x0 + i * gap;
          const xj = x0 + j * gap;
          const path = s("path", { class: "tf-arc", d: `M ${xi} ${y - 14} Q ${(xi + xj) / 2} ${y - 14 - (xj - xi) * 0.55} ${xj} ${y - 14}` });
          list.push({ path, i, j });
          g.append(path);
        }
      words.forEach((word, i) => g.append(s("text", { class: "tf-word", x: x0 + i * gap, y, "text-anchor": "middle", text: word })));
      g.append(
        s("text", { class: "tf-caps", x: x0 - 18, y: 60, text: "attention · every pair, one step" }),
        s("text", { class: "tf-small", x: x0 - 18, y: y + 40, text: `${(n * (n - 1)) / 2} pairs, each joined directly, all computed at once.` })
      );
      svg.append(g);
      return { g, list };
    }

    // "Σ = 1.00" beside each row of the weights.
    function sumColumn(n) {
      const g = s("g", { class: "tf-obj" });
      const labels = Array.from({ length: n }, (_, i) => s("text", { class: "tf-small", x: 0, y: i * C + C / 2 + 4, text: "Σ 1.00" }));
      g.append(...labels);
      svg.append(g);
      return { g, labels };
    }

    // The connector from a row of E to a row of X during the lookup.
    function lookupFx() {
      const g = s("g", { class: "tf-obj tf-fx" });
      const line = s("line", { class: "tf-stroke" });
      const label = s("text", { class: "tf-small", "text-anchor": "end" });
      g.append(line, label);
      svg.append(g);
      return { g, line, label };
    }

    /* -------------------------------------------- render: the whole figure for (step, t) */

    const ALL = ["rnn", "pairs", "E", "X", "Wq", "Wk", "Wv", "Q", "K", "Vm", "Kt", "S", "A", "Z", "sums", "bars", "demo", "lines", "fx"];

    // On phones, faded context (opacity below 1) is dropped so the figure that matters gets the room.
    const narrow = window.matchMedia("(max-width: 991.98px)");

    function layout(spec) {
      const boxes = [];
      ALL.forEach((key) => {
        const obj = o[key];
        const el = obj.el || obj.g;
        let at = spec[key];
        if (at && narrow.matches && at[2] && at[2].opacity < 1) at = null;
        if (at) {
          V.place(el, at[0], at[1], at[2]);
          if (key !== "fx") boxes.push(V.boxOf(el, at[0], at[1]));
        } else V.hide(el);
      });
      V.fitView(svg, boxes);
    }

    const idx = (t, count) => Math.floor(V.clamp(t, 0, 1) * (count + 1)); // 0 … count+1
    const quote = (w) => `“${w}”`;

    const steps = {
      rnn(t) {
        layout({ rnn: [0, 0] });
        const k = Math.min(o.n - 1, Math.floor(t * o.n));
        o.rnn.boxes.forEach((b, i) => b.classList.toggle("is-on", i <= k));
        strip(`h${k + 1} = f(h${k}, ${quote(o.words[k])}): the memory so far, squeezed into one vector, carried one word at a time.`);
      },

      pairs(t) {
        layout({ pairs: [0, 0] });
        const k = Math.min(o.n - 1, Math.floor(t * o.n));
        o.pairs.list.forEach(({ path, i, j }) => path.classList.toggle("is-on", i === k || j === k));
        strip(`${quote(o.words[k])} is one step away from all ${o.n - 1} other words.`);
      },

      embed(t) {
        const ex = 110;
        const ey = 50;
        const xx = 360;
        const xy = 130;
        layout({ E: [ex, ey], X: [xx, xy], fx: [0, 0] });
        const k = idx(t, o.n);
        o.X.reveal(Math.min(k, o.n) * 8);
        o.X.focusRows(null);
        if (k === 0 || k > o.n) {
          o.E.row(null);
          o.X.row(null);
          o.fx.g.style.opacity = "0";
          strip(k === 0 ? "Each word has an id: its row number in E." : `X: ${o.n} words × 8 numbers. In this toy, the columns mean something.`);
          return;
        }
        const i = k - 1;
        const id = o.enc.ids[i];
        o.E.row(id);
        o.X.row(i);
        const y1 = ey + id * 10 + 5;
        const y2 = xy + i * C + C / 2;
        o.fx.line.setAttribute("x1", ex + 80 + 4);
        o.fx.line.setAttribute("y1", y1);
        o.fx.line.setAttribute("x2", xx - 70);
        o.fx.line.setAttribute("y2", y2);
        o.fx.label.setAttribute("x", ex - 6);
        o.fx.label.setAttribute("y", y1 + 4);
        o.fx.label.textContent = `${TF.vocab[id]} · ${id}`;
        o.fx.g.style.opacity = "1";
        strip(`${quote(o.words[i])} → id ${id} → row ${id} of E = [${o.enc.x[i].map((v) => fmt(v)).join(", ")}]`);
      },

      query(t) {
        const { yB } = o.geo;
        layout({ X: [90, yB], Wq: [360, TOP], Q: [360, yB, { noRows: true }] });
        o.X.reveal();
        o.X.focusRows(null);
        o.E.row(null);
        V.sweep(o.X, o.Wq, o.Q, t, strip, {
          start: "Q = X · W_Q. Each row of X times each column of W_Q gives one cell of Q.",
          done: "Q: one query per word, 4 numbers each (d_k = 4). It encodes what the word is looking for.",
          cell: (i, j, sum) => `q[${o.words[i]}][${j}] = ${sum}`,
        });
      },

      keyvalue(t) {
        const { yB } = o.geo;
        const nr = { noRows: true };
        layout({ X: [90, yB], Wq: [360, TOP], Q: [360, yB, nr], Wk: [510, TOP], K: [510, yB, nr], Wv: [660, TOP], Vm: [660, yB, nr] });
        o.Q.reveal();
        o.X.clear();
        o.Wq.clear();
        o.Q.clear();
        const total = o.n * 4;
        const k = Math.floor(V.clamp(t * 1.25, 0, 1) * total);
        o.K.reveal(k);
        o.Vm.reveal(k);
        strip(
          k < total
            ? "K = X · W_K and V = X · W_V: the same multiplication with two more weight matrices."
            : "Query: what am I looking for? Key: what do I contain? Value: what do I pass on if picked?"
        );
      },

      scores(t) {
        const { yS, xS } = o.geo;
        layout({ Q: [xS - 4 * C - 70, yS + 44], Kt: [xS, TOP + 44], S: [xS, yS + 44] });
        if (o.S.values !== o.head.scores) o.S.set(o.head.scores, true);
        o.Q.reveal();
        const at = V.sweep(o.Q, o.Kt, o.S, t, strip, {
          start: "Scores = Q · Kᵀ: every query against every key. Kᵀ is K turned on its side.",
          done: `A big score means a good match. Look at row ${quote(o.words[argmaxRow()])}.`,
          cell: (i, j, sum) => `q[${o.words[i]}] · k[${o.words[j]}] = ${sum}`,
        });
        if (!at) o.S.clear();
      },

      scale(t) {
        const { yS, xS } = o.geo;
        layout({ Q: [xS - 4 * C - 70, yS + 44, { opacity: 0.25 }], Kt: [xS, TOP + 44, { opacity: 0.25 }], S: [xS, yS + 44], demo: [690, yS + 44] });
        o.Q.clear();
        o.Kt.clear();
        o.S.clear();
        o.S.reveal();
        if (t > 0.15 && o.S.values !== o.head.scaled) o.S.set(o.head.scaled, true);
        if (t <= 0.15 && o.S.values !== o.head.scores) o.S.set(o.head.scores, true);
        const dk = dkSteps[Number(slider.value)];
        dkOut.textContent = String(dk);
        const raw = demoScores(o.n, dk);
        const used = divide.checked ? raw.map((v) => v / Math.sqrt(dk)) : raw;
        const p = TF.softmax(used);
        const top = Math.max(...p);
        o.demo.set(p, p.indexOf(top));
        strip(
          `Here d_k = 4, so every score is divided by √4 = 2. Demo (right): random q, k with d_k = ${dk}, ` +
            `${divide.checked ? `divided by ${fmt(Math.sqrt(dk), 1)}` : "not divided"}: the top word gets ${(top * 100).toFixed(0)}%.`
        );
      },

      softmax(t) {
        const { yS, xS } = o.geo;
        const n = o.n;
        layout({
          Q: [xS - 4 * C - 70, yS + 44, { opacity: 0.25 }],
          Kt: [xS, TOP + 44, { opacity: 0.25 }],
          A: [xS, yS + 44],
          sums: [xS + n * C + 8, yS + 44],
          bars: [700, yS + 44],
        });
        o.A.clear();
        const k = idx(t, n);
        o.A.reveal(Math.min(k, n) * n);
        o.sums.labels.forEach((el, i) => (el.style.opacity = i < k ? "1" : "0"));
        const i = hover ?? Math.min(Math.max(k - 1, 0), n - 1);
        o.A.row(k === 0 ? null : i);
        o.bars.set(o.head.weights[i], o.head.weights[i].indexOf(Math.max(...o.head.weights[i])));
        const row = o.head.scaled[i];
        strip(
          k === 0
            ? "softmax(x)ᵢ = eˣⁱ / Σⱼ eˣʲ, applied to each row on its own."
            : `row ${quote(o.words[i])}: softmax(${row.map((v) => fmt(v)).join(", ")}) = ${o.head.weights[i].map((v) => fmt(v)).join(", ")}`
        );
      },

      output(t) {
        const { yZ } = o.geo;
        const n = o.n;
        const x = 90 + n * C + 30;
        layout({ A: [90, yZ], Vm: [x, TOP], Z: [x, yZ, { noRows: true }] });
        o.A.reveal();
        V.sweep(o.A, o.Vm, o.Z, t, strip, {
          start: "Output = weights · V. Each output row mixes the value rows, in the amounts in its weights row.",
          done: "Each word now carries a blend of what the words it attended to had to say.",
          cell: (i, j, sum) => `out[${o.words[i]}][${j}] = ${sum}`,
        });
      },

      lines(t) {
        layout({ lines: [300, TOP + 40] });
        const k = Math.floor(V.clamp(t * 1.4, 0, 1) * (o.n + 1)) - 1;
        const focus = hover ?? (k >= 0 && k < o.n ? k : null);
        o.lines.focus(focus);
        if (focus == null) {
          strip("Hover a word on the left to see where it looks. Or change the sentence above.");
          return;
        }
        const w = o.head.weights[focus];
        const order = w.map((v, j) => [v, j]).sort((a, b) => b[0] - a[0]);
        strip(
          `${quote(o.words[focus])} looks at ` +
            order
              .slice(0, 3)
              .map(([v, j]) => `${o.words[j]} ${(v * 100).toFixed(0)}%`)
              .join(", ")
        );
      },
    };

    function argmaxRow() {
      // the row whose best weight is largest: the clearest match to point at
      let best = 0;
      let bestV = -1;
      o.head.weights.forEach((row, i) => {
        const v = Math.max(...row);
        if (v > bestV) [best, bestV] = [i, v];
      });
      return best;
    }

    function render(step, t) {
      if (!o || !steps[step]) return;
      last = { step, t };
      controls.hidden = step !== "scale";
      steps[step](t);
    }

    return { viewBox: "0 0 800 560", build, render };
  };
})();
