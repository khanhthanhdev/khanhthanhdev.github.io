// Standalone figures for the "Going deeper" sections: plain figures in the text, not part of the scrollytelling.
// Each <figure data-tf-figure="name"> is filled by figures[name].
(function () {
  "use strict";

  const TF = window.TF;
  const V = TF.view;
  const { h, s } = V;

  // Size of the softmax gradient: the Frobenius norm of its Jacobian, diag(p) − p pᵀ. Near 0 when p is one-hot.
  function softmaxGradient(p) {
    let sum = 0;
    for (let i = 0; i < p.length; i++)
      for (let j = 0; j < p.length; j++) {
        const v = (i === j ? p[i] : 0) - p[i] * p[j];
        sum += v * v;
      }
    return Math.sqrt(sum);
  }

  // A histogram of xs over [-range, range] in a small svg panel.
  function histogram(title, range, ticks) {
    const W = 280;
    const H = 120;
    const BINS = 41;
    const svg = s("svg", { class: "tf-svg tf-hist", viewBox: `-10 -28 ${W + 20} ${H + 52}`, role: "img", "aria-label": title });
    const bars = Array.from({ length: BINS }, (_, b) =>
      s("rect", { class: "tf-bar", x: (b * W) / BINS + 0.5, width: W / BINS - 1, y: H, height: 0 })
    );
    svg.append(
      s("text", { class: "tf-axis", x: 0, y: -12, text: title }),
      ...bars,
      s("line", { class: "tf-stroke-muted", x1: 0, y1: H, x2: W, y2: H }),
      ...ticks.map((v) => s("text", { class: "tf-small", x: ((v + range) / (2 * range)) * W, y: H + 16, "text-anchor": "middle", text: V.fmt(v, 0) }))
    );
    return {
      svg,
      set(xs) {
        const counts = new Array(BINS).fill(0);
        xs.forEach((x) => {
          const b = Math.floor(((x + range) / (2 * range)) * BINS);
          counts[V.clamp(b, 0, BINS - 1)]++;
        });
        const max = Math.max(...counts);
        counts.forEach((c, b) => {
          const height = (c / max) * (H - 4);
          bars[b].setAttribute("y", (H - height).toFixed(1));
          bars[b].setAttribute("height", height.toFixed(1));
        });
      },
    };
  }

  // A labelled box for the Figure 2 diagrams. kind picks the tint (see transformer.css); dashed marks it optional.
  function flowBox(x, y, w, hgt, label, kind = "op", dashed = false) {
    return [
      s("rect", { class: `tf-box tf-box-${kind}${dashed ? " tf-box-target" : ""}`, x, y, width: w, height: hgt, rx: 4 }),
      s("text", { class: "tf-block-label", x: x + w / 2, y: y + hgt / 2 + 4, "text-anchor": "middle", text: label }),
    ];
  }

  // An arrow along a path of points, with the head at the last one (which must come from straight below or from
  // the side).
  function flowArrow(points) {
    const [x2, y2] = points[points.length - 1];
    const [x1, y1] = points[points.length - 2];
    const d = `M ${points.map((p) => p.join(" ")).join(" L ")}`;
    const head =
      y1 === y2
        ? `M ${x2 + (x1 < x2 ? -7 : 7)} ${y2 - 4} L ${x2} ${y2} L ${x2 + (x1 < x2 ? -7 : 7)} ${y2 + 4} Z`
        : `M ${x2 - 4} ${y2 + 7} L ${x2} ${y2} L ${x2 + 4} ${y2 + 7} Z`;
    return [s("path", { class: "tf-stroke-muted", d }), s("path", { class: "tf-arrow", d: head })];
  }

  const figures = {
    // The paper's Figure 2 (left): scaled dot-product attention as a flow chart, bottom to top, with the shape of
    // every matrix on its arrow and the matching piece of equation (1) beside each box.
    sdpa(root) {
      const X = 40; // boxes run from X to X + W
      const W = 150;
      const H = 28;
      const cx = X + W / 2;
      const ys = { mm2: 20, soft: 82, mask: 144, scale: 206, mm1: 268 };
      const yIn = 350;
      const xq = cx - 40;
      const xk = cx + 20;
      const xv = X + W + 40;
      const svg = s("svg", {
        class: "tf-svg tf-hist tf-flow",
        viewBox: "-30 -20 470 400",
        role: "img",
        "aria-label": "Scaled dot-product attention: MatMul of Q and K, scale, optional mask, softmax, MatMul with V",
      });
      const note = (y, text) => s("text", { class: "tf-small tf-flow-note", x: xv + 22, y: y + H / 2 + 4, text });
      const shape = (x, y, text) => s("text", { class: "tf-small tf-shape", x: x - 6, y, "text-anchor": "end", text });
      svg.append(
        // inputs
        s("text", { class: "tf-block-label tf-fork-q", x: xq, y: yIn + 14, "text-anchor": "middle", text: "Q" }),
        s("text", { class: "tf-block-label tf-fork-k", x: xk, y: yIn + 14, "text-anchor": "middle", text: "K" }),
        s("text", { class: "tf-block-label tf-fork-v", x: xv, y: yIn + 14, "text-anchor": "middle", text: "V" }),
        ...flowArrow([
          [xq, yIn],
          [xq, ys.mm1 + H],
        ]),
        ...flowArrow([
          [xk, yIn],
          [xk, ys.mm1 + H],
        ]),
        shape(xq, yIn - 18, "n × d_k"),
        s("text", { class: "tf-small tf-shape", x: xv + 6, y: yIn - 18, text: "n × d_v" }),
        // V runs up the right and joins the last MatMul from below
        ...flowArrow([
          [xv, yIn],
          [xv, ys.mm2 + H + 16],
          [cx + 40, ys.mm2 + H + 16],
          [cx + 40, ys.mm2 + H],
        ]),
        // the main line, box to box
        ...flowArrow([
          [cx, ys.mm1],
          [cx, ys.scale + H],
        ]),
        ...flowArrow([
          [cx, ys.scale],
          [cx, ys.mask + H],
        ]),
        ...flowArrow([
          [cx, ys.mask],
          [cx, ys.soft + H],
        ]),
        ...flowArrow([
          [cx, ys.soft],
          [cx, ys.mm2 + H],
        ]),
        ...flowArrow([
          [cx, ys.mm2],
          [cx, ys.mm2 - 22],
        ]),
        shape(cx, ys.mm1 - 12, "n × n"),
        shape(cx, ys.scale - 12, "n × n"),
        shape(cx, ys.mask - 12, "n × n"),
        shape(cx, ys.soft - 12, "n × n, rows sum to 1"),
        shape(cx, ys.mm2 - 8, "n × d_v"),
        ...flowBox(X, ys.mm1, W, H, "MatMul"),
        ...flowBox(X, ys.scale, W, H, "Scale"),
        ...flowBox(X, ys.mask, W, H, "Mask (opt.)", "op", true),
        ...flowBox(X, ys.soft, W, H, "SoftMax", "out"),
        ...flowBox(X, ys.mm2, W, H, "MatMul"),
        note(ys.mm1, "S = Q Kᵀ: every query · every key"),
        note(ys.scale, "S / √d_k: spread back to about 1"),
        note(ys.mask, "+ M: −∞ on future words (part 4)"),
        note(ys.soft, "P = softmax(S), row by row"),
        note(ys.mm2, "P V: weighted mix of values")
      );
      root.replaceChildren(
        svg,
        h("figcaption", {
          text: "The paper's Figure 2 (left), redrawn. Data flows upwards. In this post n = 6 words and d_k = d_v = 4; the paper's base model has d_k = d_v = 64. The only n × n matrices are the scores and the weights: that square is where attention's n² cost lives.",
        })
      );
    },

    // The paper's Figure 2 (right): h heads, each a smaller copy of scaled dot-product attention, then Concat and
    // W_O. The slider changes h with d_model fixed at 512, so the per-head size and the stacks change but the
    // weight count doesn't.
    mha(root) {
      const D = 512;
      const hs = [1, 2, 4, 8, 16];
      const slider = h("input", { type: "range", min: 0, max: hs.length - 1, step: 1, value: 3, id: "tf-mha-fig" });
      const out = h("output", { for: "tf-mha-fig" });
      const svg = s("svg", {
        class: "tf-svg tf-hist tf-flow",
        viewBox: "-30 -40 510 420",
        role: "img",
        "aria-label": "Multi-head attention: linear projections of V, K and Q, h attention heads, concat, linear",
      });
      const body = s("g");
      svg.append(body);
      const note = h("p", { class: "tf-figure-note tf-num" });
      root.replaceChildren(
        h("div", { class: "tf-controls" }, h("label", { for: "tf-mha-fig", text: "heads h" }), slider, out),
        svg,
        note,
        h("figcaption", {
          text: "The paper's Figure 2 (right), redrawn. Each stacked box is h copies with their own weights. More heads means more, smaller questions; d_model and the total number of weights stay fixed.",
        })
      );
      // h copies of a box, offset up and to the right, back ones first
      function stack(x, y, w, hgt, label, kind, n) {
        const depth = Math.min(n, 8) - 1;
        const parts = [];
        for (let k = depth; k >= 1; k--)
          parts.push(s("rect", { class: `tf-box tf-box-${kind} tf-box-back`, x: x + 4 * k, y: y - 4 * k, width: w, height: hgt, rx: 4 }));
        return [...parts, ...flowBox(x, y, w, hgt, label, kind)];
      }
      function render() {
        const nh = hs[Number(slider.value)];
        const dk = D / nh;
        const yIn = 360;
        const yLin = 280;
        const yAtt = 170;
        const yCat = 70;
        const yOut = 0;
        const xs = [60, 200, 340]; // V, K, Q columns
        const shape = (x, y, text) => s("text", { class: "tf-small tf-shape", x: x + 6, y, text });
        const att = { x: 60, w: 360 };
        const cat = { x: 150, w: 160 };
        const cxa = att.x + att.w / 2;
        body.replaceChildren(
          ...["V", "K", "Q"].map((name, i) =>
            s("text", { class: `tf-block-label tf-fork-${name.toLowerCase()}`, x: xs[i] + 40, y: yIn + 14, "text-anchor": "middle", text: name })
          ),
          ...xs.flatMap((x) =>
            flowArrow([
              [x + 40, yIn],
              [x + 40, yLin + 30],
            ])
          ),
          shape(xs[2] + 40, yIn - 14, `n × ${D}`),
          ...xs.flatMap((x) =>
            flowArrow([
              [x + 40, yLin],
              [x + 40, yAtt + 40],
            ])
          ),
          shape(xs[2] + 40, yAtt + 64, `n × ${dk}`),
          ...flowArrow([
            [cxa, yAtt],
            [cxa, yCat + 30],
          ]),
          shape(cxa, yAtt - 40, `${nh} × (n × ${dk})`),
          ...flowArrow([
            [cxa, yCat],
            [cxa, yOut + 30],
          ]),
          shape(cxa, yCat - 16, `n × ${D}`),
          ...flowArrow([
            [cxa, yOut],
            [cxa, yOut - 24],
          ]),
          shape(cxa, yOut - 12, `n × ${D}`),
          ...xs.flatMap((x, i) => stack(x, yLin, 80, 30, `Linear W_${"VKQ"[i]}`, "ffn", nh)),
          ...stack(att.x, yAtt, att.w, 40, "Scaled dot-product attention", "attn", nh),
          ...flowBox(cat.x, yCat, cat.w, 30, "Concat", "op"),
          ...flowBox(cat.x, yOut, cat.w, 30, "Linear W_O", "ffn"),
          s("text", { class: "tf-op", x: att.x + att.w + 40, y: yAtt + 28, text: `h = ${nh}` })
        );
        out.textContent = `${nh} × d_k = ${dk}`;
        const per = 3 * D * dk;
        note.textContent = `Weights: ${nh} heads × 3 × ${D} × ${dk} = ${(nh * per).toLocaleString("en")} for Q, K, V, plus ${(D * D).toLocaleString("en")} for W_O: ${(4 * D * D).toLocaleString("en")} = 4 · ${D}², whatever h is.`;
      }
      slider.addEventListener("input", render);
      render();
    },

    // Why divide by √d_k: dot products of random unit-variance vectors spread out like √d_k, and a softmax over
    // widely spread scores goes one-hot, which leaves almost no gradient.
    dk(root) {
      const dks = [4, 16, 64, 256, 1024];
      const slider = h("input", { type: "range", min: 0, max: dks.length - 1, step: 1, value: 2, id: "tf-dk-fig" });
      const out = h("output", { for: "tf-dk-fig" });
      const raw = histogram("q · k", 96, [-96, -48, 0, 48, 96]);
      const scaled = histogram("q · k / √d_k", 4, [-4, -2, 0, 2, 4]);
      const cells = {};
      const row = (key, label) =>
        h("tr", {}, h("th", { scope: "row", text: label }), ...["sd", "top", "grad"].map((c) => (cells[key + c] = h("td", { class: "tf-num" }))));
      const table = h(
        "table",
        { class: "tf-table" },
        h(
          "thead",
          {},
          h("tr", {}, h("th", { text: "" }), h("th", { text: "spread (std)" }), h("th", { text: "top weight" }), h("th", { text: "gradient size" }))
        ),
        h("tbody", {}, row("raw", "q · k"), row("scaled", "q · k / √d_k"))
      );
      root.replaceChildren(
        h("div", { class: "tf-controls" }, h("label", { for: "tf-dk-fig", text: "d_k" }), slider, out),
        h("div", { class: "tf-hists" }, raw.svg, scaled.svg),
        table,
        h("figcaption", {
          text: "2,000 dot products of random vectors whose numbers have mean 0 and variance 1. Top weight and gradient size are averages over 200 softmaxes of 10 such scores. Gradient size is how much learning signal the softmax passes back: 0 would mean none. The raw panel's axis is fixed, so you can watch it spread.",
        })
      );

      const cache = {};
      function stats(dk) {
        if (cache[dk]) return cache[dk];
        const rand = TF.rng(dk * 7 + 1);
        const dot = () => {
          let d = 0;
          for (let i = 0; i < dk; i++) d += rand.normal() * rand.normal();
          return d;
        };
        const xs = Array.from({ length: 2000 }, dot);
        const sd = (v) => Math.sqrt(v.reduce((a, x) => a + x * x, 0) / v.length);
        const soft = (k) => {
          let top = 0;
          let grad = 0;
          for (let t = 0; t < 200; t++) {
            const p = TF.softmax(xs.slice(t * 10, t * 10 + 10).map((x) => x / k));
            top += Math.max(...p);
            grad += softmaxGradient(p);
          }
          return { top: top / 200, grad: grad / 200 };
        };
        const r = soft(1);
        const sc = soft(Math.sqrt(dk));
        return (cache[dk] = {
          xs,
          raw: { sd: sd(xs), ...r },
          scaled: { sd: sd(xs) / Math.sqrt(dk), ...sc },
        });
      }

      function render() {
        const dk = dks[Number(slider.value)];
        const st = stats(dk);
        out.textContent = `${dk}  (√d_k = ${V.fmt(Math.sqrt(dk), Math.sqrt(dk) % 1 ? 1 : 0)})`;
        raw.set(st.xs);
        scaled.set(st.xs.map((x) => x / Math.sqrt(dk)));
        for (const key of ["raw", "scaled"]) {
          cells[key + "sd"].textContent = V.fmt(st[key].sd, 1);
          cells[key + "top"].textContent = `${Math.round(st[key].top * 100)}%`;
          cells[key + "grad"].textContent = V.fmt(st[key].grad, 2);
        }
      }
      slider.addEventListener("input", render);
      render();
    },

    // Multi-head, grouped-query and multi-query attention: 8 query heads, and a slider for how many key/value
    // heads they share. The cache holds one K and one V per key/value head.
    heads(root) {
      const Q = 8;
      const kvs = [8, 4, 2, 1];
      const names = { 8: "multi-head (MHA)", 4: "grouped-query (GQA)", 2: "grouped-query (GQA)", 1: "multi-query (MQA)" };
      const slider = h("input", { type: "range", min: 0, max: kvs.length - 1, step: 1, value: 1, id: "tf-heads-fig" });
      const out = h("output", { for: "tf-heads-fig" });
      const W = 560;
      const svg = s("svg", {
        class: "tf-svg tf-hist",
        viewBox: "-20 -30 600 220",
        role: "img",
        "aria-label": "Query heads and the key/value heads they read",
      });
      const qx = (i) => (i + 0.5) * (W / Q);
      const linesG = s("g");
      const kvG = s("g");
      svg.append(
        s("text", { class: "tf-axis", x: 0, y: -12, text: "query heads (each with its own W_Q, as in part 2)" }),
        linesG,
        ...Array.from({ length: Q }, (_, i) => s("circle", { class: "tf-head-q", cx: qx(i), cy: 14, r: 12 })),
        kvG,
        s("text", { class: "tf-axis", x: 0, y: 186, text: "key/value heads (what the cache stores)" })
      );
      const note = h("p", { class: "tf-figure-note" });
      root.replaceChildren(
        h("div", { class: "tf-controls" }, h("label", { for: "tf-heads-fig", text: "key/value heads" }), slider, out),
        svg,
        note,
        h("figcaption", {
          text: "Each query head still computes its own attention weights. Query heads in the same group read the same keys and values, so only the key/value heads go in the cache. The sizes are memory arithmetic, not measurements.",
        })
      );
      function render() {
        const kv = kvs[Number(slider.value)];
        const group = Q / kv;
        const kx = (g) => (g + 0.5) * (W / kv);
        linesG.replaceChildren(
          ...Array.from({ length: Q }, (_, i) => s("line", { class: "tf-head-link", x1: qx(i), y1: 26, x2: kx(Math.floor(i / group)), y2: 132 }))
        );
        kvG.replaceChildren(
          ...Array.from({ length: kv }, (_, g) => [
            s("rect", { class: "tf-head-k", x: kx(g) - 22, y: 132, width: 20, height: 34, rx: 3 }),
            s("rect", { class: "tf-head-v", x: kx(g) + 2, y: 132, width: 20, height: 34, rx: 3 }),
          ]).flat()
        );
        out.textContent = `${kv}: ${names[kv]}`;
        note.textContent =
          kv === Q
            ? "Every query head has its own keys and values: 8 K and 8 V per token, per layer. This is the paper's design."
            : `Each group of ${group} query heads shares one K and one V. The cache is ${kv} / ${Q} = ${Math.round((100 * kv) / Q)}% of the multi-head size.`;
      }
      slider.addEventListener("input", render);
      render();
    },

    // How big the KV cache gets for real models: 2 (K and V) × layers × key/value heads × head size × tokens ×
    // sequences × 2 bytes (16-bit numbers). Configs are from each model's published config.json.
    kvcalc(root) {
      const models = [
        { name: "Transformer base (2017)", layers: 6, q: 8, kv: 8, d: 64, context: 512 },
        { name: "Llama 2 7B", layers: 32, q: 32, kv: 32, d: 128, context: 4096 },
        { name: "Llama 2 70B", layers: 80, q: 64, kv: 8, d: 128, context: 4096 },
        { name: "Llama 3 8B", layers: 32, q: 32, kv: 8, d: 128, context: 8192 },
        { name: "Mistral 7B", layers: 32, q: 32, kv: 8, d: 128, window: 4096, context: 32768 },
        { name: "DeepSeek-V2", layers: 60, q: 128, d: 128, latent: 576, context: 131072 },
      ];
      const lengths = [1024, 4096, 8192, 32768, 131072];
      const select = h("select", { id: "tf-kv-model" }, ...models.map((m, i) => h("option", { value: i, text: m.name })));
      select.value = "1";
      const slider = h("input", { type: "range", min: 0, max: lengths.length - 1, step: 1, value: 1, id: "tf-kv-len" });
      const out = h("output", { for: "tf-kv-len" });
      const batch = h("select", { id: "tf-kv-batch" }, ...[1, 8, 32].map((b) => h("option", { value: b, text: String(b) })));
      const cells = {};
      const row = (key, label) =>
        h("tr", {}, h("th", { scope: "row", text: label }), ...["tok", "all"].map((c) => (cells[key + c] = h("td", { class: "tf-num" }))));
      const table = h(
        "table",
        { class: "tf-table" },
        h("thead", {}, h("tr", {}, h("th", { text: "" }), h("th", { text: "per token" }), h("th", { text: "whole cache" }))),
        h("tbody", {}, row("this", "this model"), row("mha", "same model, one K/V per query head"), row("mqa", "same model, one K/V head"))
      );
      const note = h("p", { class: "tf-figure-note" });
      root.replaceChildren(
        h(
          "div",
          { class: "tf-controls tf-controls-wrap" },
          h("label", { for: "tf-kv-model", text: "model" }),
          select,
          h("label", { for: "tf-kv-len", text: "tokens" }),
          slider,
          out,
          h("label", { for: "tf-kv-batch", text: "sequences" }),
          batch
        ),
        table,
        note,
        h("figcaption", {
          text: "16-bit numbers, self-attention cache only. Layer counts and head sizes are from each model's published configuration. DeepSeek-V2 caches a 576-number latent per layer instead of per-head keys and values; Mistral 7B attends only to the last 4,096 tokens, so its cache stops growing there.",
        })
      );
      const bytes = (v) => {
        const units = ["B", "KiB", "MiB", "GiB", "TiB"];
        let k = 0;
        while (v >= 1024 && k < units.length - 1) ((v /= 1024), k++);
        return `${v >= 100 || k === 0 ? Math.round(v) : v.toFixed(v >= 10 ? 1 : 2)} ${units[k]}`;
      };
      function render() {
        const m = models[Number(select.value)];
        const n = lengths[Number(slider.value)];
        const b = Number(batch.value);
        const kept = Math.min(n, m.window ?? Infinity);
        const perToken = (kv) => 2 * m.layers * kv * m.d * 2;
        const own = m.latent ? m.layers * m.latent * 2 : perToken(m.kv);
        out.textContent = n.toLocaleString("en");
        const fill = (key, tok) => {
          cells[key + "tok"].textContent = bytes(tok);
          cells[key + "all"].textContent = bytes(tok * kept * b);
        };
        fill("this", own);
        fill("mha", perToken(m.q));
        fill("mqa", perToken(1));
        const ratio = perToken(m.q) / own;
        note.textContent = m.latent
          ? `Multi-head latent attention: ${m.latent} numbers per token per layer, ${Math.round(ratio)}× less than ${m.q} full key/value heads.`
          : m.kv === m.q
            ? "This model uses plain multi-head attention: every query head keeps its own keys and values."
            : `${m.q} query heads share ${m.kv} key/value heads: ${ratio}× less cache than plain multi-head attention.` +
              (m.window && n > m.window ? ` The window keeps only ${m.window.toLocaleString("en")} tokens.` : "");
        if (n > m.context)
          note.textContent += ` ${m.name} was trained for ${m.context.toLocaleString("en")} tokens at most: past that, this is arithmetic only.`;
      }
      [select, slider, batch].forEach((el) => el.addEventListener("input", render));
      render();
    },

    // Attention patterns as masks: which keys (columns) each query (row) may read, and what that means for the cache.
    masks(root) {
      const N = 10;
      const patterns = [
        {
          id: "full",
          name: "Full",
          ok: () => true,
          text: "Encoder self-attention (parts 1–3): every word reads every word. Nothing is generated, so nothing is cached.",
        },
        {
          id: "causal",
          name: "Causal",
          ok: (i, j) => j <= i,
          text: "Decoder self-attention (part 4) and every GPT-style model: each token reads itself and the past. The cache keeps every token.",
        },
        {
          id: "window",
          name: "Sliding window",
          ok: (i, j) => j <= i && i - j < 4,
          text: "Each token reads only the last 4 (Mistral 7B uses 4,096). The cache keeps only the window, so its size stops growing. Stacked layers still pass information further back, one window per layer.",
        },
        {
          id: "sinks",
          name: "Sinks + window",
          ok: (i, j) => j <= i && (j < 2 || i - j < 3),
          text: "StreamingLLM: a window plus the first few tokens, which models learn to park spare attention on. Dropping them breaks a windowed model; keeping them lets it run on almost forever.",
        },
        {
          id: "prefix",
          name: "Prefix",
          ok: (i, j) => j < 4 || j <= i,
          text: "Prefix LM (T5, UL2): the prompt (first 4) reads itself in both directions, like an encoder; the answer is causal. The prompt's keys and values are cached once.",
        },
      ];
      const C = 22;
      const svg = s("svg", {
        class: "tf-svg tf-hist tf-mask-fig",
        viewBox: `-60 -30 ${N * C + 80} ${N * C + 50}`,
        role: "img",
        "aria-label": "Attention mask",
      });
      const rects = [];
      svg.append(
        s("text", { class: "tf-axis", x: 0, y: -12, text: "keys →" }),
        s("text", { class: "tf-axis", x: -8, y: 14, "text-anchor": "end", text: "queries" }),
        s("text", { class: "tf-axis", x: -8, y: 28, "text-anchor": "end", text: "↓" })
      );
      for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) {
          const r = s("rect", { class: "tf-mask-cell", x: j * C + 1, y: i * C + 1, width: C - 2, height: C - 2, rx: 2 });
          rects.push({ r, i, j });
          svg.append(r);
        }
      const buttons = patterns.map((p, k) => h("button", { type: "button", class: "tf-btn tf-chip", "aria-pressed": "false", text: p.name }));
      const note = h("p", { class: "tf-figure-note" });
      const stats = h("p", { class: "tf-figure-note tf-num" });
      root.replaceChildren(
        h("div", { class: "tf-controls tf-controls-wrap", role: "group", "aria-label": "Attention pattern" }, ...buttons),
        svg,
        stats,
        note
      );
      function show(k) {
        const p = patterns[k];
        buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(i === k)));
        let on = 0;
        rects.forEach(({ r, i, j }) => {
          const ok = p.ok(i, j);
          on += ok;
          r.classList.toggle("is-on", ok);
        });
        const last = Array.from({ length: N }, (_, j) => p.ok(N - 1, j)).filter(Boolean).length;
        stats.textContent = `${on} of ${N * N} pairs computed · the last query reads ${last} keys`;
        note.textContent = p.text;
      }
      buttons.forEach((b, k) => b.addEventListener("click", () => show(k)));
      show(1);
    },
  };

  document.querySelectorAll("[data-tf-figure]").forEach((root) => {
    const make = figures[root.dataset.tfFigure];
    if (make) make(root);
  });
})();
