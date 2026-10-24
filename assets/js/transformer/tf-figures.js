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

  const figures = {
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
  };

  document.querySelectorAll("[data-tf-figure]").forEach((root) => {
    const make = figures[root.dataset.tfFigure];
    if (make) make(root);
  });
})();
