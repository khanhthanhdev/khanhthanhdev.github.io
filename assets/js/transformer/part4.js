// Part 4 of the series: the decoder. Masked self-attention, cross-attention, the output layer, the generation loop
// and the training recipe. The toy task is copying: the encoder reads the sentence and the decoder is fed the
// same sentence shifted right, the way the paper trains on translation pairs.
(function () {
  "use strict";

  const TF = window.TF;
  const V = TF.view;
  const { s, fmt } = V;
  TF.scenes = TF.scenes || {};

  const C = 30; // cell size
  const TOP = 66;
  const D = TF.config.dModel;
  const TOPK = 8; // words shown in the output bars
  const WARMUP = 4000;
  const LAST_STEP = 40000; // the learning-rate plot runs to here
  const pct = (p) => `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`;

  TF.scenes.part4 = function (stage) {
    const { svg, strip, controls } = stage;
    let o = null;
    let last = { step: null, t: 0 };
    let hover = null;
    const layout = V.stage(svg, () => o);
    controls.hidden = true;

    /* -------------------------------------------- build */

    function build(tokens) {
      svg.replaceChildren();
      svg._fit = null;
      const words = tokens.map((t) => t.text);
      const n = words.length;
      const memory = TF.encode(tokens).out;
      // teacher forcing: the decoder reads <s> + the target without its last word, and predicts the target
      const prefixIds = [TF.vocabIndex["<s>"], ...tokens.slice(0, -1).map((t) => t.id)];
      const prefix = prefixIds.map((id) => TF.vocab[id]);
      const dec = TF.decode(prefixIds, memory);
      const L = dec.layers[0];
      const target = tokens[n - 1].id;
      const top = dec.probs
        .map((p, id) => ({ p, id }))
        .sort((a, b) => b.p - a.p)
        .slice(0, TOPK);
      const lossIds = [target, ...top.map((r) => r.id).filter((id) => id !== target)].slice(0, TOPK);
      const smooth = TF.smoothTarget(target, TF.vocab.length);
      const gen = TF.generate(tokens, 6);
      const m = (opts) => V.matrix(svg, { cell: C, range: 2, ...opts });
      const lastRow = dec.out[n - 1];

      o = {
        words,
        n,
        prefix,
        dec,
        L,
        target,
        top,
        lossIds,
        smooth,
        gen,
        lastRow,
        // overview
        enc: V.block(svg, {
          rows: [
            { id: "attn", label: "Self-attention", kind: "sub" },
            { id: "norm1", label: "Add & Norm", kind: "norm", skip: "attn" },
            { id: "ffn", label: "Feed forward", kind: "sub" },
            { id: "norm2", label: "Add & Norm", kind: "norm", skip: "ffn" },
          ],
          title: "Encoder",
          input: "source + PE",
          output: "to the decoder",
          repeat: "× N",
        }),
        decB: V.block(svg, {
          rows: [
            { id: "self", label: "Masked self-attention", kind: "sub" },
            { id: "norm1", label: "Add & Norm", kind: "norm", skip: "self" },
            { id: "cross", label: "Cross-attention", kind: "sub" },
            { id: "norm2", label: "Add & Norm", kind: "norm", skip: "cross" },
            { id: "ffn", label: "Feed forward", kind: "sub" },
            { id: "norm3", label: "Add & Norm", kind: "norm", skip: "ffn" },
          ],
          side: { id: "cross", label: "K, V" },
          title: "Decoder",
          input: "output so far + PE",
          output: "linear → softmax → next word",
          repeat: "× N",
        }),
        link: memoryLink(),
        // shift right
        shiftRows: shiftRows(prefix, words),
        // mask
        MS: m({ rows: n, cols: n, name: "scores", rowLabels: prefix, colLabels: prefix, range: 3 }),
        MM: m({ rows: n, cols: n, name: "+ mask", colLabels: prefix, range: 3 }),
        MW: m({ rows: n, cols: n, name: "softmax", colLabels: prefix, kind: "prob" }),
        // cross-attention
        XL: V.lines(svg, { left: prefix, right: words, width: 200, title: "decoder: queries", rightTitle: "encoder: keys, values" }),
        XW: m({ rows: n, cols: n, name: "weights", rowLabels: prefix, colLabels: words, kind: "prob" }),
        // output layer
        LR: m({ rows: 1, cols: D, name: "last row", note: `at “${prefix[n - 1]}”`, rowLabels: [prefix[n - 1]] }),
        ET: m({ rows: D, cols: TF.vocab.length, cell: 14, numbers: false, name: "Eᵀ", note: "the embedding table, reused" }),
        PB: V.bars(svg, { labels: top.map((r) => TF.vocab[r.id]), width: 260, format: pct, title: "softmax: next word" }),
        // generation
        genRows: genRows(gen),
        // loss
        TB: V.bars(svg, { labels: lossIds.map((id) => TF.vocab[id]), width: 160, format: pct, title: "target (smoothed)" }),
        QB: V.bars(svg, { labels: lossIds.map((id) => TF.vocab[id]), width: 160, format: pct, title: "model" }),
        // learning rate
        plot: lrPlot(),
      };

      const h0 = L.self.heads[0];
      o.MS.set(h0.scaled);
      o.MM.set(h0.masked);
      o.MW.set(h0.weights);
      o.XW.set(L.cross.heads[0].weights);
      o.XL.set(L.cross.heads[0].weights);
      o.LR.set([lastRow]);
      o.ET.set(TF.transpose(TF.weights.embedding));
      o.PB.set(
        top.map((r) => r.p),
        0,
        Math.max(top[0].p * 1.15, 0.05)
      );
      o.TB.set(lossIds.map((id) => smooth[id]));
      o.QB.set(lossIds.map((id) => dec.probs[id]));
      const pick = (i) => {
        hover = i;
        render(last.step, last.t);
      };
      o.XW.onRow(pick);
      o.XL.onPick(pick);
    }

    /* -------------------------------------------- scene-only drawings */

    // The encoder's output feeding the decoder's cross-attention. Drawn in stage coordinates (placed at 0, 0).
    function memoryLink() {
      const g = s("g", { class: "tf-obj" });
      const path = s("path", { class: "tf-residual tf-side" });
      g.append(path);
      svg.append(g);
      return {
        g,
        set(d) {
          path.setAttribute("d", d);
        },
      };
    }

    // Decoder input (shifted right) over the target, with an arrow from each input to the word it must predict.
    function shiftRows(prefix, words) {
      const g = s("g", { class: "tf-obj" });
      const w = 74;
      const arrows = [];
      g.append(
        s("text", { class: "tf-caps", x: -14, y: 4, "text-anchor": "end", text: "decoder reads" }),
        s("text", { class: "tf-caps", x: -14, y: 104, "text-anchor": "end", text: "must predict" })
      );
      prefix.forEach((word, i) => {
        const x = i * w;
        const a = s("g");
        a.append(
          s("line", { class: "tf-stroke-muted", x1: x + 30, y1: 18, x2: x + 30, y2: 78 }),
          s("path", { class: "tf-arrow", d: `M ${x + 26} ${72} L ${x + 30} ${80} L ${x + 34} ${72} Z` })
        );
        arrows.push(a);
        g.append(
          s("rect", { class: "tf-box", x, y: -14, width: 60, height: 28, rx: 4 }),
          s("text", { class: "tf-word", x: x + 30, y: 4, "text-anchor": "middle", text: word }),
          s("rect", { class: "tf-box tf-box-target", x, y: 86, width: 60, height: 28, rx: 4 }),
          s("text", { class: "tf-word", x: x + 30, y: 104, "text-anchor": "middle", text: words[i] }),
          a
        );
      });
      svg.append(g);
      return {
        g,
        show(k) {
          arrows.forEach((a, i) => (a.style.opacity = i < k ? "1" : "0.12"));
        },
      };
    }

    // One line per generation step: the words so far → the word the model picks.
    function genRows(gen) {
      const g = s("g", { class: "tf-obj" });
      g.append(
        s("text", { class: "tf-caps", x: 0, y: -20, text: "step" }),
        s("text", { class: "tf-caps", x: 60, y: -20, text: "decoder input" }),
        s("text", { class: "tf-caps", x: 400, y: -20, text: "picks" })
      );
      const rows = gen.steps.map((st, k) => {
        const y = k * 40;
        const r = s("g");
        r.append(
          s("text", { class: "tf-mono", x: 0, y: y + 4, text: String(k + 1) }),
          s("text", { class: "tf-mono", x: 60, y: y + 4, text: st.prefix.map((id) => TF.vocab[id]).join(" ") }),
          s("text", { class: "tf-op tf-op-small", x: 370, y: y + 5, text: "→" }),
          s("text", { class: "tf-word tf-word-pick", x: 400, y: y + 4, text: TF.vocab[st.next] })
        );
        g.append(r);
        return r;
      });
      svg.append(g);
      return {
        g,
        show(k) {
          rows.forEach((r, i) => (r.style.opacity = i < k ? "1" : "0"));
        },
      };
    }

    // The paper's learning-rate schedule, eq. (3): a straight climb for 4000 steps, then 1/√step.
    function lrPlot() {
      const g = s("g", { class: "tf-obj" });
      const W = 520;
      const H = 240;
      const yMax = 0.0008;
      const x = (step) => (step / LAST_STEP) * W;
      const y = (lr) => H - (lr / yMax) * H;
      const pts = [];
      for (let k = 0; k <= 400; k++) {
        const step = (k / 400) * LAST_STEP;
        pts.push(`${x(step).toFixed(1)},${y(TF.learningRate(step, 512, WARMUP)).toFixed(1)}`);
      }
      g.append(
        s("line", { class: "tf-stroke-muted", x1: 0, y1: H, x2: W, y2: H }),
        s("line", { class: "tf-stroke-muted", x1: 0, y1: 0, x2: 0, y2: H }),
        s("line", { class: "tf-stroke-muted", x1: x(WARMUP), y1: 0, x2: x(WARMUP), y2: H, "stroke-dasharray": "2 4" }),
        s("text", { class: "tf-small", x: x(WARMUP) + 6, y: 12, text: `warmup = ${WARMUP} steps` }),
        s("text", { class: "tf-caps", x: 0, y: -14, text: "learning rate" }),
        s("text", { class: "tf-caps", x: W, y: H + 34, "text-anchor": "end", text: "training step" }),
        s("polyline", { class: "tf-wave", points: pts.join(" ") })
      );
      [0, 10000, 20000, 30000, 40000].forEach((v) =>
        g.append(s("text", { class: "tf-small", x: x(v), y: H + 16, "text-anchor": "middle", text: v ? `${v / 1000}k` : "0" }))
      );
      [0, 0.0004, 0.0008].forEach((v) =>
        g.append(s("text", { class: "tf-small", x: -8, y: y(v) + 4, "text-anchor": "end", text: v ? v.toFixed(4) : "0" }))
      );
      const dot = s("circle", { class: "tf-wave-dot is-on", r: 5 });
      g.append(dot);
      svg.append(g);
      return {
        g,
        at(step) {
          dot.setAttribute("cx", x(step));
          dot.setAttribute("cy", y(TF.learningRate(step, 512, WARMUP)));
        },
      };
    }

    /* -------------------------------------------- render */

    const quote = (w) => `“${w}”`;
    const word = (id) => TF.vocab[id];

    // Both stacks side by side, bottoms aligned, with the encoder's output running into cross-attention.
    // On phones only one stack fits at a readable size: `only` picks it ("enc" or "dec"); the decoder's own
    // "K, V" arrow stands in for the link.
    function overview(encOn, decOn, only) {
      const yD = TOP + 70;
      const yE = yD + 330 - 212; // decoder stack is 330 tall, encoder 212
      const xE = 40;
      const xD = 460;
      if (V.narrow.matches) layout(only === "enc" ? { enc: [xE, yE] } : { decB: [xD, yD] });
      else layout({ enc: [xE, yE], decB: [xD, yD], link: [0, 0] });
      const yCross = yD + o.decB.boxes.cross.y + o.decB.boxes.cross.height / 2;
      o.link.set(`M ${xE + 100} ${yE - 40} V ${yD - 40} H ${xD - 120} V ${yCross} H ${xD - 70}`);
      o.enc.set(encOn);
      o.decB.set(decOn);
    }

    const steps = {
      overview(t) {
        const parts = [
          [["attn", "norm1", "ffn", "norm2"], null, "The encoder from part 3 reads the whole source sentence once."],
          [null, "self", "The decoder's first sublayer is self-attention with a mask: a word can't look at later words."],
          [null, "cross", "The second is cross-attention: queries from the decoder, keys and values from the encoder."],
          [null, "ffn", "Then the same feed-forward network as the encoder, each with Add & Norm around it."],
        ];
        const k = Math.min(parts.length - 1, Math.floor(V.clamp(t / 0.8, 0, 0.999) * parts.length));
        overview(parts[k][0], parts[k][1], k === 0 ? "enc" : "dec");
        strip(parts[k][2]);
      },

      shift(t) {
        layout({ shiftRows: [120, TOP + 60] });
        const k = V.progress(t, o.n);
        o.shiftRows.show(k);
        if (k === 0) return strip("Training: the decoder's input is the target sentence moved one place right, starting with <s>.");
        if (k > o.n) return strip("Every position is trained at once, in one pass. That's teacher forcing.");
        const i = k - 1;
        strip(`Reading ${o.prefix.slice(0, i + 1).join(" ")}, it must predict ${quote(o.words[i])}.`);
      },

      mask(t) {
        const n = o.n;
        const y = TOP + 50;
        const w = n * C;
        const a = V.progress(t, 2 * n);
        // phones show two of the three grids: scores and mask first, then mask and softmax
        if (!V.narrow.matches) layout({ MS: [90, y], MM: [90 + w + 50, y], MW: [90 + 2 * (w + 50), y] });
        else if (a <= n) layout({ MS: [90, y], MM: [90 + w + 50, y] });
        else layout({ MM: [90, y], MW: [90 + w + 50, y] });
        const masked = Math.min(a, n);
        const soft = V.clamp(a - n, 0, n);
        o.MM.reveal(masked * n);
        o.MW.reveal(soft * n);
        const i = a >= 1 && a <= 2 * n ? (a - 1) % n : null;
        o.MS.row(a >= 1 && a <= n ? i : null);
        o.MM.row(i != null && a <= n ? i : null);
        o.MW.row(a > n && a <= 2 * n ? i : null);
        if (a === 0) return strip("The decoder's self-attention scores, exactly as in part 1. But position i must not see positions after i.");
        if (a > 2 * n) return strip("Upper triangle: zero weight. Each word only looks at itself and the words before it.");
        if (a <= n) {
          const later = o.prefix.slice(i + 1);
          return strip(
            later.length
              ? `Row ${quote(o.prefix[i])}: add −∞ to the scores for ${later.map(quote).join(", ")}, the words it hasn't written yet.`
              : `Row ${quote(o.prefix[i])}: the last word may see everything before it. Nothing to mask.`
          );
        }
        strip(`softmax of row ${quote(o.prefix[i])}: e^(−∞) = 0, so every weight right of the diagonal is exactly 0.`);
      },

      cross(t) {
        const y = TOP + 50;
        layout({ XL: [120, y], XW: [520, y - 15] });
        const i = hover ?? Math.min(o.n - 1, Math.floor(V.clamp(t / 0.8, 0, 0.999) * o.n));
        o.XL.focus(i);
        o.XW.focusRows([i]);
        o.XW.row(i);
        const w = o.L.cross.heads[0].weights[i];
        const j = w.indexOf(Math.max(...w));
        strip(
          `${quote(o.prefix[i])} asks the encoder's words: most weight (${pct(w[j])}) goes to ${quote(o.words[j])}. Random weights, so no meaning yet.`
        );
      },

      logits(t) {
        const yE = TOP + 80;
        const yB = yE + D * 14 + 70;
        layout({ LR: [90, TOP], ET: [90, yE], PB: [180, yB] });
        const best = o.top[0].id;
        o.ET.col(t > 0.3 ? best : null);
        o.LR.row(t > 0.3 ? 0 : null);
        if (t <= 0.3)
          return strip(
            `Take the decoder's last row and score every word in the vocabulary: logits = row · Eᵀ, one number per word (${TF.vocab.length}).`
          );
        const terms = V.terms(o.lastRow, TF.weights.embedding[best]);
        strip(`logit(${quote(word(best))}) = ${fmt(o.dec.logits[best])}, the top score. Softmax turns the logits into probabilities. ${terms}`);
      },

      generate(t) {
        layout({ genRows: [60, TOP + 50] });
        const steps = o.gen.steps.length;
        const k = V.progress(t, steps);
        o.genRows.show(k);
        if (k === 0) return strip("To write a sentence: start with <s>, pick the likeliest word, append it, and run the decoder again.");
        if (k > steps) return strip(`Untrained, so it writes nonsense: “${o.gen.output.map(word).join(" ")}”. The loop is the point.`);
        const st = o.gen.steps[k - 1];
        strip(`Step ${k}: the decoder reads ${st.prefix.map(word).join(" ")} and picks ${quote(word(st.next))} (${pct(st.step.probs[st.next])}).`);
      },

      loss(t) {
        layout({ TB: [100, TOP + 40], QB: V.narrow.matches ? [100, TOP + 40 + o.TB.height + 60] : [430, TOP + 40] });
        const p = o.dec.probs[o.target];
        const ce = TF.crossEntropy(o.dec.probs, o.smooth);
        if (t < 0.4)
          return strip(
            `Label smoothing: the target puts 90% on ${quote(word(o.target))} and spreads the other 10% thinly over all ${TF.vocab.length - 1} other words.`
          );
        strip(
          `Loss = ${fmt(ce)}: the model gives ${quote(word(o.target))} only ${pct(p)}. Training nudges every weight to raise it. (−Σ target × log model)`
        );
      },

      warmup(t) {
        layout({ plot: [90, TOP + 30] });
        const step = Math.round(V.clamp(t / 0.85, 0, 1) * LAST_STEP);
        o.plot.at(step);
        const lr = TF.learningRate(step, 512, WARMUP);
        strip(
          `step ${step.toLocaleString("en")}: learning rate ${lr.toFixed(6)}. ${step < WARMUP ? "Warming up: growing linearly." : "Decaying like 1/√step."}`
        );
      },

      recap() {
        overview(["attn", "norm1", "ffn", "norm2"], ["self", "norm1", "cross", "norm2", "ffn", "norm3"], "dec");
        strip("The whole Transformer: the paper's Figure 1, built from the pieces of this series.");
      },
    };

    function render(step, t) {
      if (!o || !steps[step]) return;
      if (step !== last.step) {
        hover = null;
        o.XL.focus(null);
        o.XW.focusRows(null);
      }
      last = { step, t };
      steps[step](t);
    }

    return { viewBox: "0 0 800 560", build, render };
  };
})();
