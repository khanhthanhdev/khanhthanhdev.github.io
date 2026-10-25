// Sticky scrollytelling for the computer vision series, with the same look as the Transformer series.
// Markup (one per figure):
//
//   <section class="tf-scrolly" data-cv-scene="part1">
//     <div class="tf-stage"></div>
//     <div class="tf-steps">
//       <div class="tf-step" data-step="pixels" data-title="An image is a grid of numbers" markdown="1">…</div>
//     </div>
//   </section>
//
// A scene (CV.scenes[name]) is a factory: scene(stage) → { render(stepId, t) }. stage has the svg, a toolbar row
// above it and a controls row under it for the scene's own inputs, strip(text) for the formula line, and
// note(text). render must be idempotent: it sets the whole figure for a step and a progress t (0 → 1 through the
// step), and scrolling past a step scrubs t. A scene calls stage.refresh() after its inputs change.
(function () {
  "use strict";

  const CV = window.CV;
  const { h, s, fitView, boxOf, place, motionQuery } = window.TF.view;
  CV.scenes = CV.scenes || {};

  const pad2 = (n) => String(n).padStart(2, "0");
  const narrow = window.matchMedia("(max-width: 991.98px)");

  function mount(section) {
    const factory = CV.scenes[section.dataset.cvScene];
    if (!factory || section.dataset.mounted) return;
    section.dataset.mounted = "true";

    const steps = [...section.querySelectorAll(".tf-step")];
    steps.forEach((el) => el.append(h("div", { class: "tf-step-body" }, ...el.childNodes)));
    const stageEl = section.querySelector(".tf-stage");
    const n = steps.length;

    const counter = h("p", { class: "tf-counter", "aria-live": "polite" });
    const prev = h("button", { type: "button", class: "tf-btn", "aria-label": "Previous step", text: "↑" });
    const next = h("button", { type: "button", class: "tf-btn", "aria-label": "Next step", text: "↓" });
    const toolbar = h("div", { class: "tf-sentence cl-data cv-toolbar" });
    const note = h("p", { class: "tf-note" });
    const svg = s("svg", { class: "tf-svg", role: "img", preserveAspectRatio: "xMidYMid meet", viewBox: "0 0 800 480" });
    const strip = h("p", { class: "tf-strip" });
    const controls = h("div", { class: "tf-controls" });

    let index = -1;
    let progress = -1;
    const stage = {
      svg,
      toolbar,
      controls,
      strip: (text) => (strip.textContent = text || ""),
      note: (text) => (note.textContent = text || ""),
      refresh: () => index >= 0 && scene.render(steps[index].dataset.step, progress),
      // Rebuilds without the gliding transitions, for when the scene swaps in new objects.
      snap(fn) {
        svg.classList.add("no-anim");
        fn();
        requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.remove("no-anim")));
      },
    };
    window.CV.view.defs(svg);
    const scene = factory(stage);

    stageEl.replaceChildren(
      h("div", { class: "tf-head" }, counter, h("div", { class: "tf-nav" }, prev, next)),
      toolbar,
      h("div", { class: "tf-notes" }, note),
      h("div", { class: "tf-canvas" }, svg),
      strip,
      controls
    );

    // The reading line: a step is active once its top passes it. Lower on phones, where the stage covers the top.
    const line = () => window.innerHeight * (narrow.matches ? 0.82 : 0.55);

    function sync() {
      const L = line();
      const tops = steps.map((el) => el.getBoundingClientRect().top);
      let i = 0;
      while (i < n - 1 && tops[i + 1] <= L) i++;
      const end = i < n - 1 ? tops[i + 1] : steps[i].getBoundingClientRect().bottom;
      const t = Math.min(1, Math.max(0, (L - tops[i]) / Math.max(1, end - tops[i])));
      if (i === index && Math.abs(t - progress) < 0.002) return;
      if (i !== index) {
        steps.forEach((el, k) => el.classList.toggle("is-active", k === i));
        counter.replaceChildren(h("b", { text: `${pad2(i + 1)} / ${pad2(n)}` }), ` ${steps[i].dataset.title || ""}`);
        prev.disabled = i === 0;
        next.disabled = i === n - 1;
        section.dataset.step = steps[i].dataset.step;
      }
      index = i;
      progress = t;
      scene.render(steps[i].dataset.step, t);
    }

    let queued = false;
    const queue = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        sync();
      });
    };

    function go(k) {
      const el = steps[Math.max(0, Math.min(n - 1, k))];
      const top = window.scrollY + el.getBoundingClientRect().top - line() + 4;
      window.scrollTo({ top, behavior: motionQuery.matches ? "auto" : "smooth" });
    }
    prev.addEventListener("click", () => go(index - 1));
    next.addEventListener("click", () => go(index + 1));

    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    svg.classList.add("no-anim");
    sync();
    requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.remove("no-anim")));
  }

  // A scene's layout: places the listed objects ({ el, box? }) at [x, y, opts], hides the rest, and fits the view.
  CV.layout = function (svg, objects) {
    return function (spec) {
      const boxes = [];
      Object.entries(objects()).forEach(([key, obj]) => {
        const el = obj && obj.el;
        if (!(el instanceof SVGElement)) return;
        const at = spec[key];
        if (!at) {
          el.style.opacity = "0";
          el.classList.add("is-hidden");
          return;
        }
        place(el, at[0], at[1], at[2]);
        const k = (at[2] && at[2].scale) || 1;
        const b = obj.box;
        boxes.push(b ? { x: at[0] + b.x * k, y: at[1] + b.y * k, width: b.width * k, height: b.height * k } : boxOf(el, at[0], at[1], k));
      });
      fitView(svg, boxes, 20);
    };
  };

  // Small builders for the controls row.
  CV.controls = {
    button(text, onClick) {
      return h("button", { type: "button", class: "tf-btn", text, onclick: onClick });
    },
    select(label, options, value, onChange) {
      const id = `cv-sel-${Math.random().toString(36).slice(2, 8)}`;
      const el = h("select", { class: "cl-select", id }, ...options.map(([v, text]) => h("option", { value: String(v), text })));
      el.value = String(value);
      el.addEventListener("change", () => onChange(el.value));
      return { wrap: h("span", { class: "tf-check" }, h("label", { for: id, text: label }), el), el };
    },
    slider(label, min, max, value, onInput, format = String) {
      const id = `cv-rng-${Math.random().toString(36).slice(2, 8)}`;
      const el = h("input", { type: "range", min, max, step: 1, value, id });
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

  function init() {
    const sections = document.querySelectorAll(".tf-scrolly[data-cv-scene]");
    if (!("IntersectionObserver" in window)) {
      sections.forEach(mount);
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          mount(entry.target);
        }),
      { rootMargin: "400px" }
    );
    sections.forEach((el) => io.observe(el));
  }

  CV.scrolly = { mount };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
