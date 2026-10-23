// Interactive figures for the "How a language model picks the next word" post.
// Plain DOM + SVG, no framework. Each figure mounts lazily when it nears the viewport.
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const visibleSpace = (s) => s.replace(/ /g, "␣");

  function pct(p) {
    if (p > 0 && p < 0.001) return "<0.1%";
    return `${(p * 100).toFixed(p >= 0.1 || p === 0 ? 0 : 1)}%`;
  }

  // Like pct, but always one decimal place: used where columns of numbers line up.
  const pct1 = (p) => (p > 0 && p < 0.001 ? "<0.1%" : `${(p * 100).toFixed(1)}%`);

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

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, motionQuery.matches ? 0 : ms));

  function sampleIndex(probs) {
    const r = Math.random();
    let acc = 0;
    for (let i = 0; i < probs.length; i++) {
      acc += probs[i];
      if (r < acc) return i;
    }
    for (let i = probs.length - 1; i >= 0; i--) if (probs[i] > 0) return i;
    return 0;
  }

  /* Shared pieces --------------------------------------------------- */

  const label = (text, extra = "") => h("span", { class: `ntk-label ${extra}`.trim(), text });

  const tokenChip = (text, extra = "") => h("span", { class: `ntk-tok ${extra}`.trim(), text: visibleSpace(text) });

  // A teal "?" in the corner that reveals a short note about how to read the figure.
  function helpToggle(text) {
    const note = h("p", { class: "ntk-help-note", hidden: "" }, text);
    const button = h("button", {
      type: "button",
      class: "ntk-help",
      "aria-expanded": "false",
      "aria-label": "How to read this figure",
      text: "?",
      onclick: () => {
        const open = note.hidden;
        note.hidden = !open;
        button.setAttribute("aria-expanded", String(open));
      },
    });
    return { button, note };
  }

  function segmented(options, initial, onChange, ariaLabel) {
    const group = h("div", { class: "ntk-seg", role: "group", "aria-label": ariaLabel });
    const buttons = options.map(([text, value]) =>
      h("button", {
        type: "button",
        "aria-pressed": String(value === initial),
        text,
        onclick: (event) => {
          buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === event.currentTarget)));
          onChange(value);
        },
      })
    );
    group.append(...buttons);
    return group;
  }

  /* ------------------------------------------------------------------ */
  /* Figure 1: scores -> probabilities, temperature, top-k, sampling     */
  /* ------------------------------------------------------------------ */

  // Toy scores (logits), sorted from highest to lowest. Not from a real model.
  const CANDIDATES = [
    ["mat", 3.1],
    ["floor", 2.5],
    ["sofa", 2.0],
    ["bed", 1.8],
    ["roof", 1.1],
    ["keyboard", 0.9],
    ["moon", -0.6],
    ["banana", -1.6],
  ];

  const T_MIN = 0.1;
  const T_MAX = 2;

  function softmax(logits, temperature, topK) {
    const scaled = logits.map((z) => z / temperature);
    const max = Math.max(...scaled);
    const weights = scaled.map((z, i) => (i < topK ? Math.exp(z - max) : 0));
    const total = weights.reduce((a, b) => a + b, 0);
    return weights.map((w) => w / total);
  }

  const entropyBits = (probs) => -probs.reduce((sum, p) => (p > 0 ? sum + p * Math.log2(p) : sum), 0);

  function barList(withScores) {
    const rows = CANDIDATES.map(([token, logit]) => {
      const fill = h("span", { class: "ntk-bar-fill" });
      const value = h("span", { class: "ntk-bar-value" });
      const row = h(
        "li",
        { class: "ntk-bar-row" },
        h("span", { class: "ntk-bar-tok" }, tokenChip(token)),
        withScores ? h("span", { class: "ntk-bar-score", title: "score (logit)", text: logit.toFixed(1) }) : "",
        h("span", { class: "ntk-bar-track" }, fill),
        value
      );
      return { row, fill, value };
    });
    const list = h("ul", { class: `ntk-bars${withScores ? " has-scores" : ""}` }, ...rows.map((r) => r.row));
    return { list, rows };
  }

  // Entropy-vs-temperature chart. Dragging across it sets the temperature.
  function uncertaintyChart(onScrub) {
    const W = 320;
    const H = 210;
    const X0 = 42;
    const X1 = 306;
    const Y0 = 172;
    const Y1 = 18;
    const x = (t) => X0 + ((t - T_MIN) / (T_MAX - T_MIN)) * (X1 - X0);
    const y = (bits) => Y0 - (bits / 3) * (Y0 - Y1);
    const tAt = (px) => clamp(T_MIN + ((px - X0) / (X1 - X0)) * (T_MAX - T_MIN), T_MIN, T_MAX);

    const patternId = `ntk-dots-${Math.random().toString(36).slice(2, 8)}`;
    const curve = s("path", { class: "ntk-curve" });
    const rule = s("line", { class: "ntk-marker-rule", y1: Y1, y2: Y0 });
    const dot = s("circle", { class: "ntk-marker-dot", r: 4.5 });
    const readout = s("text", { class: "ntk-chart-readout", y: Y1 + 2, "text-anchor": "middle" });

    const svg = s(
      "svg",
      { class: "ntk-chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Entropy in bits as temperature goes from 0.1 to 2" },
      s(
        "defs",
        {},
        s(
          "pattern",
          { id: patternId, width: 8, height: 8, patternUnits: "userSpaceOnUse" },
          s("circle", { class: "ntk-grid-dot", cx: 1, cy: 1, r: 0.9 })
        )
      ),
      s("rect", { x: X0, y: Y1, width: X1 - X0, height: Y0 - Y1, fill: `url(#${patternId})` }),
      s("line", { class: "ntk-axis", x1: X0, x2: X0, y1: Y1, y2: Y0 }),
      s("line", { class: "ntk-axis", x1: X0, x2: X1, y1: Y0, y2: Y0 }),
      ...[0, 1, 2, 3].map((b) => s("text", { class: "ntk-tick", x: X0 - 8, y: y(b) + 4, "text-anchor": "end", text: b.toFixed(1) })),
      ...[0.1, 0.5, 1, 1.5, 2].map((t) => s("text", { class: "ntk-tick", x: x(t), y: Y0 + 16, "text-anchor": "middle", text: t.toFixed(1) })),
      s("text", { class: "ntk-axis-title", x: (X0 + X1) / 2, y: H - 4, "text-anchor": "middle", text: "temperature" }),
      s("text", {
        class: "ntk-axis-title",
        x: 12,
        y: (Y0 + Y1) / 2,
        "text-anchor": "middle",
        transform: `rotate(-90 12 ${(Y0 + Y1) / 2})`,
        text: "bits",
      }),
      curve,
      rule,
      dot,
      readout
    );

    const scrubber = s("rect", { class: "ntk-scrubber", x: X0, y: Y1 - 8, width: X1 - X0, height: Y0 - Y1 + 16, fill: "transparent" });
    const scrub = (event) => {
      const box = svg.getBoundingClientRect();
      onScrub(tAt(((event.clientX - box.left) / box.width) * W));
    };
    scrubber.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      scrubber.setPointerCapture(event.pointerId);
      scrub(event);
    });
    scrubber.addEventListener("pointermove", (event) => {
      if (scrubber.hasPointerCapture(event.pointerId)) scrub(event);
    });
    svg.append(scrubber);

    return {
      svg,
      setCurve(entropyAt) {
        const steps = 80;
        let d = "";
        for (let i = 0; i <= steps; i++) {
          const t = T_MIN + (i / steps) * (T_MAX - T_MIN);
          d += `${i ? "L" : "M"}${x(t).toFixed(2)},${y(entropyAt(t)).toFixed(2)} `;
        }
        curve.setAttribute("d", d.trim());
      },
      setMarker(t, bits) {
        const cx = x(t);
        rule.setAttribute("x1", cx);
        rule.setAttribute("x2", cx);
        dot.setAttribute("cx", cx);
        dot.setAttribute("cy", y(bits));
        readout.setAttribute("x", clamp(cx, X0 + 40, X1 - 40));
        readout.textContent = `${bits.toFixed(2)} bits`;
      },
    };
  }

  function mountSoftmax(root) {
    const prompt = root.dataset.prompt || "The cat sat on the";
    const logits = CANDIDATES.map(([, z]) => z);
    const state = { temperature: 1, topK: Infinity, counts: logits.map(() => 0), total: 0 };
    let shown = softmax(logits, state.temperature, state.topK);
    let cancelTween = () => {};
    let busy = false;

    const target = () => softmax(logits, state.temperature, state.topK);

    const help = helpToggle(
      "Each bar is one candidate word. Model Probability is what softmax assigns at the current temperature; Sampled counts what actually came up when you pressed Pick. Drag across the uncertainty chart, or use the slider, to change the temperature."
    );

    const slot = h("span", { class: "ntk-slot", text: "?" });
    const promptBox = h("div", { class: "ntk-prompt-box ntk-prompt-inline" }, `${prompt} `, slot);

    const tempOut = h("output", { class: "ntk-output", text: "1.00" });
    const slider = h("input", {
      type: "range",
      min: String(T_MIN),
      max: String(T_MAX),
      step: "0.05",
      value: "1",
      "aria-label": "Temperature",
      oninput: () => setTemperature(Number(slider.value)),
    });
    const keep = segmented(
      [
        ["all", Infinity],
        ["top 3", 3],
        ["top 1", 1],
      ],
      state.topK,
      (k) => {
        state.topK = k;
        chart.setCurve((t) => entropyBits(softmax(logits, t, state.topK)));
        update();
      },
      "Which words can be picked"
    );

    const model = barList(true);
    const sampled = barList(false);
    const modelSub = h("span", { class: "ntk-sub" });
    const sampledSub = h("span", { class: "ntk-sub" });
    const chart = uncertaintyChart((t) => {
      const snapped = Math.round(t / 0.05) * 0.05;
      slider.value = String(snapped);
      setTemperature(snapped);
    });
    chart.setCurve((t) => entropyBits(softmax(logits, t, state.topK)));

    const panels = h(
      "div",
      { class: "ntk-panels" },
      h("section", { class: "ntk-panel" }, label("Model Probability"), modelSub, model.list),
      h("section", { class: "ntk-panel" }, label("Sampled"), sampledSub, sampled.list),
      h(
        "section",
        { class: "ntk-panel ntk-panel-chart" },
        label("Uncertainty"),
        h("span", { class: "ntk-sub", text: "entropy vs. temperature" }),
        chart.svg
      )
    );

    const pickOne = h("button", { type: "button", class: "ntk-btn ntk-btn-primary", text: "Pick a word", onclick: () => pick() });
    const pickMany = h("button", { type: "button", class: "ntk-btn", text: "Pick 50 times", onclick: () => pickRepeatedly(50) });
    const reset = h("button", { type: "button", class: "ntk-btn", text: "Reset", onclick: () => update() });
    const stats = h("p", { class: "ntk-stats", "aria-live": "polite" });

    function setTemperature(t) {
      state.temperature = clamp(t, T_MIN, T_MAX);
      tempOut.textContent = state.temperature.toFixed(2);
      update();
    }

    function paintModel() {
      const live = target();
      model.rows.forEach((r, i) => {
        r.fill.style.transform = `scaleX(${shown[i]})`;
        r.value.textContent = pct1(live[i]);
        r.row.classList.toggle("is-cut", live[i] === 0);
      });
      modelSub.textContent = `softmax at T = ${state.temperature.toFixed(2)}`;
    }

    function paintSampled() {
      const live = target();
      sampled.rows.forEach((r, i) => {
        const share = state.total ? state.counts[i] / state.total : 0;
        r.fill.style.transform = `scaleX(${share})`;
        r.value.textContent = state.total ? pct1(share) : "–";
        r.row.title = `${state.counts[i]} of ${state.total} picks`;
        r.row.classList.toggle("is-cut", live[i] === 0);
      });
      sampledSub.textContent = state.total ? `${state.total} pick${state.total === 1 ? "" : "s"}` : "no picks yet";
    }

    function paintStats() {
      const live = target();
      const best = live.indexOf(Math.max(...live));
      const bits = entropyBits(live);
      chart.setMarker(state.temperature, bits);
      stats.textContent = `Uncertainty ${bits.toFixed(2)} bits · most likely “${CANDIDATES[best][0]}” (${pct(live[best])})`;
    }

    function update() {
      state.counts.fill(0);
      state.total = 0;
      slot.textContent = "?";
      slot.classList.remove("is-filled");
      const from = shown.slice();
      const to = target();
      cancelTween();
      cancelTween = animate(320, (t) => {
        shown = from.map((p, i) => p + (to[i] - p) * t);
        paintModel();
      });
      paintSampled();
      paintStats();
    }

    function pick() {
      const i = sampleIndex(target());
      state.counts[i] += 1;
      state.total += 1;
      slot.textContent = CANDIDATES[i][0];
      slot.classList.add("is-filled");
      for (const list of [model, sampled]) {
        const row = list.rows[i].row;
        row.classList.remove("is-picked");
        void row.offsetWidth; // restart the flash animation
        row.classList.add("is-picked");
      }
      paintSampled();
    }

    async function pickRepeatedly(n) {
      if (busy) return;
      busy = true;
      pickMany.disabled = true;
      for (let i = 0; i < n; i++) {
        pick();
        await wait(40);
      }
      pickMany.disabled = false;
      busy = false;
    }

    root.replaceChildren(
      help.button,
      h("div", { class: "ntk-block" }, label("Prompt"), promptBox),
      h(
        "div",
        { class: "ntk-toolbar" },
        h("label", { class: "ntk-control" }, h("span", { text: "Temperature" }), slider, tempOut),
        h("div", { class: "ntk-control" }, h("span", { text: "Keep" }), keep)
      ),
      panels,
      h("div", { class: "ntk-toolbar ntk-actions" }, pickOne, pickMany, reset, stats),
      help.note
    );
    paintModel();
    paintSampled();
    paintStats();
  }

  /* ------------------------------------------------------------------ */
  /* Figure 2: a sentence is a path through a tree of choices            */
  /* ------------------------------------------------------------------ */

  function mountTree(root) {
    fetch(root.dataset.src)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => buildTree(root, data))
      .catch(() => {
        root.replaceChildren(h("p", { class: "ntk-error", text: "Could not load this figure. Try reloading the page." }));
      });
  }

  function buildTree(root, data) {
    let path = []; // index of the chosen child at each depth
    let walking = false;

    const help = helpToggle(
      "Click a token to choose it; the next column shows what the model predicts after that choice. The number under each token is its probability given everything to the left. The highlighted ribbon traces your path, and the rollout box below multiplies the probabilities along it."
    );

    const svg = s("svg", { class: "ntk-edges", "aria-hidden": "true" });
    const tree = h("div", { class: "ntk-tree" }, svg);
    const scroller = h("div", { class: "ntk-tree-scroll" }, tree);

    const rolloutMeta = h("span", { class: "ntk-rollout-meta" });
    const rolloutBody = h("p", { class: "ntk-rollout-body", "aria-live": "polite" });
    const rolloutMath = h("p", { class: "ntk-rollout-math" });
    const rollout = h(
      "div",
      { class: "ntk-rollout" },
      h("div", { class: "ntk-rollout-head" }, h("span", { text: "Rollout" }), rolloutMeta),
      rolloutBody,
      rolloutMath
    );

    const walkBtn = h("button", { type: "button", class: "ntk-btn ntk-btn-primary", text: "Let the model write", onclick: () => walk() });
    const resetBtn = h("button", {
      type: "button",
      class: "ntk-btn",
      text: "Reset",
      onclick: () => {
        path = [];
        render(1);
      },
    });

    const nodesOnPath = () => {
      const nodes = [data];
      for (const i of path) nodes.push(nodes[nodes.length - 1].children[i]);
      return nodes;
    };

    function node(child, col, idx) {
      return h(
        "button",
        {
          type: "button",
          class: "ntk-node",
          "data-col": String(col),
          "data-idx": String(idx),
          "aria-pressed": String(path[col - 1] === idx),
          "aria-label": `“${child.token}”, ${pct(child.p)} chance`,
          onclick: () => {
            if (walking) return;
            path = path.slice(0, col - 1).concat(idx);
            render(col + 1, { col, idx });
          },
        },
        tokenChip(child.token, "ntk-anchor"),
        h("span", { class: "ntk-node-p", text: pct1(child.p) })
      );
    }

    // Rebuilds the columns, then draws edges. Edges into columns >= animateFrom are drawn in.
    function render(animateFrom, focus) {
      tree.querySelectorAll(".ntk-col").forEach((c) => c.remove());
      const nodes = nodesOnPath();

      tree.append(
        h("div", { class: "ntk-col ntk-col-prompt" }, label("Prompt"), h("div", { class: "ntk-prompt-box ntk-anchor", text: data.prompt }))
      );
      nodes.forEach((n, depth) => {
        if (!n.children || !n.children.length) return;
        const col = depth + 1;
        const shownMass = n.children.reduce((sum, c) => sum + c.p, 0);
        tree.append(
          h(
            "div",
            { class: "ntk-col" },
            ...n.children.map((child, idx) => node(child, col, idx)),
            h("span", { class: "ntk-more", text: `+ others ${pct(Math.max(0, 1 - shownMass))}` })
          )
        );
      });

      const tokens = nodes.slice(1);
      const leaf = nodes[nodes.length - 1];
      const done = !leaf.children || !leaf.children.length;
      const prob = tokens.reduce((a, n) => a * n.p, 1);
      rolloutMeta.textContent = tokens.length ? `${tokens.length} token${tokens.length === 1 ? "" : "s"} · P = ${pct1(prob)}` : "0 tokens";
      rolloutBody.replaceChildren(
        `${data.prompt}`,
        ...tokens.map((n) => tokenChip(n.token, "is-chosen")),
        h("span", { class: done ? "ntk-ellipsis" : "ntk-caret", text: done ? " […]" : "" })
      );
      rolloutMath.textContent = tokens.length
        ? `${tokens.map((n) => n.p.toFixed(2)).join(" × ")} = ${pct1(prob)}`
        : "Click a token to choose what comes next.";

      if (focus) {
        const target = tree.querySelector(`.ntk-node[data-col="${focus.col}"][data-idx="${focus.idx}"]`);
        if (target) target.focus({ preventScroll: true });
      }
      drawEdges(animateFrom);
      const cols = tree.querySelectorAll(".ntk-col");
      if (animateFrom > 1 && cols.length) {
        cols[cols.length - 1].scrollIntoView({ block: "nearest", inline: "nearest", behavior: motionQuery.matches ? "auto" : "smooth" });
      }
    }

    let cancelDraw = () => {};

    function drawEdges(animateFrom = Infinity) {
      cancelDraw();
      const box = tree.getBoundingClientRect();
      svg.setAttribute("width", String(tree.scrollWidth));
      svg.setAttribute("height", String(tree.scrollHeight));
      svg.replaceChildren();

      const cols = [...tree.querySelectorAll(".ntk-col")];
      const twigs = [];
      const ribbons = [];
      const revealing = [];
      for (let c = 1; c < cols.length; c++) {
        const parent = c === 1 ? cols[0].querySelector(".ntk-anchor") : cols[c - 1].querySelector('.ntk-node[aria-pressed="true"] .ntk-anchor');
        if (!parent) continue;
        const pr = parent.getBoundingClientRect();
        const x1 = pr.right - box.left;
        const y1 = pr.top + pr.height / 2 - box.top;
        const children = nodesOnPath()[c - 1].children;

        cols[c].querySelectorAll(".ntk-node").forEach((el, idx) => {
          const cr = el.querySelector(".ntk-anchor").getBoundingClientRect();
          const x2 = cr.left - box.left;
          const y2 = cr.top + cr.height / 2 - box.top;
          const mx = (x1 + x2) / 2;
          const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
          const p = children[idx].p;
          const strokes =
            path[c - 1] === idx
              ? [
                  s("path", { d, class: "ntk-ribbon is-on-path", "stroke-width": 6 + 9 * p }),
                  s("path", { d, class: "ntk-ribbon-core is-on-path", "stroke-width": 3 + 9 * p }),
                ]
              : [s("path", { d, class: "ntk-twig", "stroke-width": 1 + 5 * p })];
          (path[c - 1] === idx ? ribbons : twigs).push(...strokes);
          if (c >= animateFrom) revealing.push(...strokes);
        });
      }

      revealing.forEach((edge) => {
        edge.setAttribute("pathLength", "1");
        edge.setAttribute("stroke-dasharray", "0 1");
      });
      svg.append(...twigs, ...ribbons); // ribbons on top

      if (revealing.length) {
        cancelDraw = animate(420, (t) => {
          revealing.forEach((edge) => edge.setAttribute("stroke-dasharray", `${t} 1`));
          if (t === 1) revealing.forEach((edge) => edge.removeAttribute("stroke-dasharray"));
        });
      }
    }

    async function walk() {
      if (walking) return;
      walking = true;
      walkBtn.disabled = true;
      resetBtn.disabled = true;
      path = [];
      render(1);
      for (;;) {
        await wait(650);
        const n = nodesOnPath()[path.length];
        if (!n.children || !n.children.length) break;
        const mass = n.children.reduce((sum, c) => sum + c.p, 0);
        path.push(sampleIndex(n.children.map((c) => c.p / mass)));
        render(path.length + 1);
      }
      walking = false;
      walkBtn.disabled = false;
      resetBtn.disabled = false;
    }

    root.replaceChildren(
      help.button,
      h("div", { class: "ntk-title-row" }, label("Next-Token Prediction")),
      scroller,
      rollout,
      h("div", { class: "ntk-toolbar ntk-actions" }, walkBtn, resetBtn),
      help.note
    );
    render(1);

    new ResizeObserver(() => drawEdges()).observe(tree);
    if (document.fonts) document.fonts.ready.then(() => drawEdges());
  }

  /* ------------------------------------------------------------------ */

  const MOUNTERS = { softmax: mountSoftmax, tree: mountTree };

  function mount(root) {
    const fn = MOUNTERS[root.dataset.ntkFigure];
    if (fn && !root.dataset.mounted) {
      root.dataset.mounted = "true";
      fn(root);
    }
  }

  function init() {
    const figures = document.querySelectorAll("[data-ntk-figure]");
    if (!("IntersectionObserver" in window)) {
      figures.forEach(mount);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          mount(entry.target);
        });
      },
      { rootMargin: "300px" }
    );
    figures.forEach((f) => io.observe(f));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
