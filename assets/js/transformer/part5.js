// Part 5 of the series: inference. How the trained decoder writes without redoing work: the KV cache, cross-attention
// keys and values computed once, one new row per step, and what the cache costs in memory. Every number comes from
// TF.decodeStep, which is checked against the full decode() in the tests.
(function () {
  "use strict";

  const TF = window.TF;
  const V = TF.view;
  const { s, fmt } = V;
  TF.scenes = TF.scenes || {};

  const C = 30; // cell size
  const TOP = 66;
  const D = TF.config.dModel;
  const DK = TF.config.dK;
  const STEPS = 6; // tokens to generate
  const pct = (p) => `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`;
  const quote = (w) => `“${w}”`;

  TF.scenes.part5 = function (stage) {
    const { svg, strip, controls } = stage;
    let o = null;
    const layout = V.stage(svg, () => o);
    controls.hidden = true;

    /* -------------------------------------------- build */

    function build(tokens) {
      svg.replaceChildren();
      svg._fit = null;
      const words = tokens.map((t) => t.text);
      const n = words.length;
      const gen = TF.generateCached(tokens, STEPS);
      const full = TF.generate(tokens, STEPS);
      const T = gen.steps.length;
      const fed = gen.steps.map((st) => TF.vocab[st.step.id]); // the token fed in at each step: <s>, then each pick
      const cache = gen.cache.layers;
      const S = Math.min(3, T - 1); // the step drawn in detail
      const at = gen.steps[S].step.layers[0].selfHeads[0];
      const W0 = TF.weights.decoder[0];
      const m = (opts) => V.matrix(svg, { cell: C, range: 2, ...opts });
      const small = (opts) => V.matrix(svg, { cell: 14, numbers: false, range: 2, ...opts });

      o = {
        words,
        n,
        gen,
        full,
        T,
        fed,
        S,
        at,
        // no cache vs cache
        work: workGrid(fed),
        // prefill: the encoder output becomes cross-attention keys, once
        MEM: m({ rows: n, cols: D, name: "encoder output", rowLabels: words }),
        WK: m({ rows: D, cols: DK, name: "W_K", role: "k", note: "cross, head 1" }),
        CK: m({ rows: n, cols: DK, name: "K", role: "k", note: "kept" }),
        CV: m({ rows: n, cols: DK, name: "V", role: "v", note: "kept" }),
        // one new row
        XR: m({ rows: 1, cols: D, name: "x", note: `“${fed[S]}” + PE(${S})`, rowLabels: [fed[S]] }),
        WQ: m({ rows: D, cols: DK, name: "W_Q", role: "q", note: "self, head 1" }),
        QR: m({ rows: 1, cols: DK, name: "q", role: "q" }),
        KR: m({ rows: 1, cols: DK, name: "k", role: "k" }),
        VR: m({ rows: 1, cols: DK, name: "v", role: "v" }),
        // the caches
        KC: m({ rows: T, cols: DK, name: "K cache", role: "k", rowLabels: fed }),
        VC: m({ rows: T, cols: DK, name: "V cache", role: "v", rowLabels: fed }),
        WR: m({ rows: 1, cols: T, name: "weights", kind: "prob", colLabels: fed }),
        OUT: m({ rows: 1, cols: DK, name: "out", note: "to W_O, as before" }),
        // same answer
        cmp: compareRows(gen, full),
        // every layer, every head
        all: cache.flatMap((L, l) =>
          L.self.flatMap((c, hd) => [
            small({ rows: T, cols: DK, name: `L${l + 1} H${hd + 1} K`, role: "k" }),
            small({ rows: T, cols: DK, name: "V", role: "v" }),
          ])
        ),
      };
      // V.stage only places named objects: give each small cache a key of its own
      o.all.forEach((mat, k) => (o[`all${k}`] = mat));

      const c0 = cache[0].cross[0];
      o.MEM.set(gen.memory);
      o.WK.set(TF.weights.decoder[0].cross.heads[0].Wk);
      o.CK.set(c0.K);
      o.CV.set(c0.V);
      o.XR.set([TF.add([TF.weights.embedding[gen.steps[S].step.id]], [TF.positionalEncoding(S + 1)[S]])[0]]);
      o.WQ.set(W0.self.heads[0].Wq);
      o.QR.set(at.q);
      o.KR.set([at.k]);
      o.VR.set([at.v]);
      o.KC.set(cache[0].self[0].K);
      o.VC.set(cache[0].self[0].V);
      o.WR.set([[...at.weights[0], ...new Array(T - at.weights[0].length).fill(0)]]);
      o.OUT.set(at.out);
      cache.forEach((L, l) =>
        L.self.forEach((c, hd) => {
          o.all[(l * L.self.length + hd) * 2].set(c.K);
          o.all[(l * L.self.length + hd) * 2 + 1].set(c.V);
        })
      );
    }

    /* -------------------------------------------- scene-only drawings */

    // One row per generation step, one cell per position the decoder computes in that step. Without a cache, step k
    // recomputes positions 1 … k; with one, only the diagonal (the new token) is computed.
    function workGrid(fed) {
      const g = s("g", { class: "tf-obj" });
      const T = fed.length;
      const cells = [];
      g.append(s("text", { class: "tf-caps", x: 0, y: -48, text: "positions computed at each step" }));
      fed.forEach((w, j) =>
        g.append(s("text", { class: "tf-axis", x: j * C + C / 2, y: -10, "text-anchor": "middle", text: w.length > 6 ? w.slice(0, 5) + "…" : w }))
      );
      for (let k = 0; k < T; k++) {
        g.append(s("text", { class: "tf-axis tf-axis-row", x: -8, y: k * C + C / 2 + 4, "text-anchor": "end", text: `step ${k + 1}` }));
        for (let j = 0; j <= k; j++) {
          const r = s("rect", { class: "tf-work", x: j * C + 1, y: k * C + 1, width: C - 2, height: C - 2, rx: 3 });
          if (j === k) r.classList.add("is-new");
          cells.push({ r, k, j });
          g.append(r);
        }
      }
      const total = s("text", { class: "tf-mono", x: 0, y: T * C + 28 });
      g.append(total);
      svg.append(g);
      return {
        g,
        // k: steps shown so far; cached: only the new cell of each step is work
        show(k, cached) {
          cells.forEach((c) => {
            c.r.style.opacity = c.k < k ? "1" : "0";
            c.r.classList.toggle("is-skipped", cached && c.j < c.k);
          });
          const rows = cached ? Math.min(k, T) : (Math.min(k, T) * (Math.min(k, T) + 1)) / 2;
          total.textContent = `${rows} rows of keys and values computed`;
        },
      };
    }

    // The word picked at each step and its probability, from the full pass and from the cached step, side by side.
    function compareRows(gen, full) {
      const g = s("g", { class: "tf-obj" });
      const cols = [0, 60, 170, 290, 400];
      ["step", "reads", "picks", "full pass", "with cache"].forEach((t, i) => g.append(s("text", { class: "tf-caps", x: cols[i], y: -20, text: t })));
      gen.steps.forEach((st, k) => {
        const y = k * 36 + 4;
        const a = full.steps[k].step.probs[full.steps[k].next];
        const b = st.step.probs[st.next];
        g.append(
          s("text", { class: "tf-mono", x: cols[0], y, text: String(k + 1) }),
          s("text", { class: "tf-mono", x: cols[1], y, text: TF.vocab[st.step.id] }),
          s("text", { class: "tf-word tf-word-pick", x: cols[2], y, text: TF.vocab[st.next] }),
          s("text", { class: "tf-mono", x: cols[3], y, text: a.toFixed(6) }),
          s("text", { class: "tf-mono", x: cols[4], y, text: b.toFixed(6) })
        );
      });
      svg.append(g);
      return { g };
    }

    /* -------------------------------------------- render */

    const steps = {
      loop(t) {
        layout({ work: [110, TOP + 60] });
        const k = V.progress(t, o.T);
        o.work.show(k, false);
        if (k === 0) return strip("Part 4's loop: to write each new word, run the decoder on everything written so far.");
        if (k > o.T) return strip(`${o.T} words, ${(o.T * (o.T + 1)) / 2} rows of work. All but ${o.T} of them were done before.`);
        strip(
          k === 1
            ? "Step 1: the decoder reads <s> alone. One position, one row."
            : `Step ${k}: ${k} positions again, to get one new word. Rows 1 to ${k - 1} come out exactly as last time.`
        );
      },

      cache(t) {
        layout({ work: [110, TOP + 60] });
        o.work.show(o.T, t > 0.15);
        if (t <= 0.15) return strip("The faded cells repeat work: with a mask, old positions can't change when a new word arrives.");
        strip(`Keep each position's keys and values, and compute only the new one: ${o.T} rows instead of ${(o.T * (o.T + 1)) / 2}.`);
      },

      prefill(t) {
        const y = TOP + 50;
        const narrow = V.narrow.matches;
        const w = D * C;
        layout(
          narrow
            ? { MEM: [90, y], WK: [90, y + o.n * C + 70], CK: [90 + DK * C + 50, y + o.n * C + 70] }
            : { MEM: [90, y], WK: [90 + w + 50, y], CK: [90 + w + 50 + DK * C + 50, y], CV: [90 + w + 50 + 2 * (DK * C + 40), y] }
        );
        V.sweep(o.MEM, o.WK, o.CK, t, strip, {
          start: "Cross-attention reads the encoder's output, which never changes while writing. So its K and V are made once, up front.",
          cell: (i, j, sum) => `K[${quote(o.words[i])}, ${j + 1}] = ${sum}`,
          done: "Same for V. Every step reuses both. Decoder-only models have no encoder, so no cross-attention cache.",
        });
      },

      newrow(t) {
        const y = TOP + 40;
        const xr = 90;
        const yW = y + 90;
        const xo = xr + DK * C + 70;
        layout({ XR: [xr, y], WQ: [xr, yW], QR: [xo, yW], KR: [xo, yW + 80], VR: [xo, yW + 160] });
        const done = V.sweep(o.XR, o.WQ, o.QR, t * 1.25, null, {});
        const k = V.progress(t * 1.25, DK);
        o.KR.reveal(k > DK ? Infinity : 0);
        o.VR.reveal(k > DK ? Infinity : 0);
        if (k === 0) return strip(`Step ${o.S + 1}: the decoder gets one token, ${quote(o.fed[o.S])}, at position ${o.S}. Just one row goes in.`);
        if (k > DK) return strip("k and v come out the same way, from W_K and W_V. Each is one row of 4 numbers.");
        const [, j] = done;
        strip(
          `q[${j + 1}] = ${V.terms(
            o.XR.values[0],
            o.WQ.values.map((r) => r[j])
          )} = ${fmt(o.QR.values[0][j])}`
        );
      },

      append(t) {
        const y = TOP + 40;
        layout(V.narrow.matches ? { KC: [110, y], VC: [110, y + o.T * C + 60] } : { KC: [110, y], VC: [110 + DK * C + 120, y] });
        const k = Math.max(1, Math.min(o.T, V.progress(t, o.T)));
        o.KC.reveal(k * DK);
        o.VC.reveal(k * DK);
        o.KC.row(k - 1);
        o.VC.row(k - 1);
        strip(
          k === 1
            ? "Step 1: the cache starts with the k and v of <s>."
            : `Step ${k}: ${quote(o.fed[k - 1])} adds one row to each cache. The ${k - 1} rows above are reused as they are.`
        );
      },

      attend(t) {
        const S = o.S;
        const y = TOP + 50;
        const narrow = V.narrow.matches;
        const xK = 110;
        const yK = y + 80;
        const xV = xK + DK * C + 110;
        layout(
          narrow
            ? { QR: [xK, y], KC: [xK, yK], WR: [xK, yK + o.T * C + 80], VC: [xV, yK], OUT: [xK, yK + o.T * C + 160] }
            : { QR: [xK, y], KC: [xK, yK], VC: [xV, yK], WR: [xV + DK * C + 110, yK], OUT: [xV + DK * C + 110, yK + 110] }
        );
        o.KC.reveal((S + 1) * DK);
        o.VC.reveal((S + 1) * DK);
        o.KC.row(null);
        o.VC.row(null);
        const k = V.progress(t, S + 1);
        o.WR.reveal(Math.min(k, S + 1));
        o.OUT.reveal(k > S + 1 ? Infinity : 0);
        o.WR.cellAt(k >= 1 && k <= S + 1 ? 0 : null, k - 1);
        o.KC.row(k >= 1 && k <= S + 1 ? k - 1 : null);
        if (k === 0)
          return strip(`The new query attends over all ${S + 1} cached keys, its own included. No mask needed: the cache holds no future.`);
        if (k > S + 1) return strip("out = Σ weight × cached v: one row of 4. W_O, Add & Norm, cross-attention and the FFN run on one row too.");
        const j = k - 1;
        strip(`q · k(${quote(o.fed[j])}) / √4 = ${fmt(o.at.scaled[0][j])}, after softmax ${pct(o.at.weights[0][j])}.`);
      },

      same() {
        layout({ cmp: [80, TOP + 60] });
        let diff = 0;
        o.gen.steps.forEach((st, k) => st.step.probs.forEach((p, w) => (diff = Math.max(diff, Math.abs(p - o.full.steps[k].step.probs[w])))));
        strip(`Same words, same probabilities. Largest difference over every word and step: ${diff}.`);
      },

      memory() {
        const spec = {};
        const per = o.all.length / 2; // caches = layers × heads
        const cols = V.narrow.matches ? 2 : 4;
        o.all.forEach((_, k) => {
          const c = Math.floor(k / 2);
          const x = 110 + (c % cols) * 230 + (k % 2) * 110;
          const y = TOP + 60 + Math.floor(c / cols) * (o.T * 14 + 70);
          spec[`all${k}`] = [x, y];
        });
        layout(spec);
        const each = 2 * per * DK;
        strip(`${per} caches, each a K and a V: ${each} numbers per token. Real models keep hundreds of thousands.`);
      },
    };

    function render(step, t) {
      if (!o || !steps[step]) return;
      steps[step](t);
    }

    return { viewBox: "0 0 800 560", build, render };
  };
})();
