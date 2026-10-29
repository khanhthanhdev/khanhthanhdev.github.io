// Sticky scrollytelling for the diffusion series, with the same look as the Transformer series (transformer.css).
// Markup (one per figure):
//
//   <section class="tf-scrolly" data-dm-scene="part1">
//     <div class="tf-stage"></div>
//     <div class="tf-steps">
//       <div class="tf-step" data-step="data" data-title="The data" markdown="1">…prose…</div>
//     </div>
//   </section>
//
// A scene (DM.scenes[name]) is a factory: scene(stage) → { render(stepId, t) }. render must be idempotent and set the
// whole figure for a step and a progress t (0 → 1 through the step). Scrolling past a step scrubs t. A scene that
// computes something slow calls stage.busy(text) while it works and stage.busy(null) when done.
(function () {
  "use strict";

  const DM = window.DM;
  const { h, s, fitView, boxOf, place, motionQuery } = window.TF.view;
  DM.scenes = DM.scenes || {};

  const pad2 = (n) => String(n).padStart(2, "0");
  const narrow = window.matchMedia("(max-width: 991.98px)");

  function mount(section) {
    const factory = DM.scenes[section.dataset.dmScene];
    if (!factory || section.dataset.mounted) return;
    section.dataset.mounted = "true";

    const steps = [...section.querySelectorAll(".tf-step")];
    steps.forEach((el) => el.append(h("div", { class: "tf-step-body" }, ...el.childNodes)));
    const stageEl = section.querySelector(".tf-stage");
    const n = steps.length;

    const counter = h("p", { class: "tf-counter", "aria-live": "polite" });
    const prev = h("button", { type: "button", class: "tf-btn", "aria-label": "Previous step", text: "↑" });
    const next = h("button", { type: "button", class: "tf-btn", "aria-label": "Next step", text: "↓" });
    const note = h("p", { class: "tf-note" });
    const svg = s("svg", { class: "tf-svg", role: "img", preserveAspectRatio: "xMidYMid meet", viewBox: "0 0 800 480" });
    const strip = h("p", { class: "tf-strip" });
    const controls = h("div", { class: "tf-controls" });

    let index = -1;
    let progress = -1;

    const stage = {
      svg,
      controls,
      strip: (text) => (strip.textContent = text || ""),
      note: (text) => (note.textContent = text || ""),
      busy(text) {
        section.classList.toggle("is-busy", Boolean(text));
        if (text) note.textContent = text;
      },
      // asks for the current step to be drawn again (after slow work finishes, or a control changes)
      redraw() {
        if (index >= 0) scene.render(steps[index].dataset.step, progress);
      },
      get step() {
        return index >= 0 ? steps[index].dataset.step : null;
      },
    };
    const scene = factory(stage);

    stageEl.replaceChildren(
      h("div", { class: "tf-head" }, counter, h("div", { class: "tf-nav" }, prev, next)),
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

    svg.classList.add("no-anim");
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    sync();
    requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.remove("no-anim")));
  }

  // A scene's layout: places the listed objects ({ el, box }) at [x, y, opts], hides the rest, and fits the view.
  DM.layout = function (svg, objects) {
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

  function init() {
    const sections = document.querySelectorAll(".tf-scrolly[data-dm-scene]");
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

  DM.scrolly = { mount };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
