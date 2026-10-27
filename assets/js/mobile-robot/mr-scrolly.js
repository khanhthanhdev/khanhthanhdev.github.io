// Sticky scrollytelling for the "Mobile robots from scratch" series, with the same look as the other series.
// Markup (one per figure):
//
//   <section class="tf-scrolly" data-mr-scene="part1">
//     <div class="tf-stage"></div>
//     <div class="tf-steps">
//       <div class="tf-step" data-step="pose" data-title="Where is the robot?" markdown="1">…</div>
//     </div>
//   </section>
//
// A scene (MR.scenes[name]) is a factory: scene(stage) → { render(stepId, t) }. stage has the svg, a controls row
// under it for the scene's own inputs, strip(text) for the formula line and note(text). render must be idempotent:
// it sets the whole figure for a step and a progress t (0 → 1 through the step); scrolling past a step scrubs t. A
// scene calls stage.refresh() after its inputs change.
//
// Standalone figures: <figure class="tf-figure" data-mr-figure="name"> is filled by MR.figures[name](root).
(function () {
  "use strict";

  const MR = window.MR;
  const { h, s, motionQuery } = window.TF.view;
  MR.scenes = MR.scenes || {};
  MR.figures = MR.figures || {};

  const pad2 = (n) => String(n).padStart(2, "0");
  const narrow = window.matchMedia("(max-width: 991.98px)");

  function mount(section) {
    const factory = MR.scenes[section.dataset.mrScene];
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
    const svg = s("svg", { class: "tf-svg mr-svg", role: "img", preserveAspectRatio: "xMidYMid meet", viewBox: "0 0 800 480" });
    const strip = h("p", { class: "tf-strip" });
    const controls = h("div", { class: "tf-controls" });

    let index = -1;
    let progress = -1;
    const stage = {
      svg,
      controls,
      strip: (text) => (strip.textContent = text || ""),
      note: (text) => (note.textContent = text || ""),
      refresh: () => index >= 0 && scene.render(steps[index].dataset.step, progress),
      step: () => (index >= 0 ? steps[index].dataset.step : null),
    };
    MR.view.defs(svg);
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
      const changed = i !== index;
      index = i;
      progress = t;
      if (changed) {
        // a new step snaps into place; scrubbing within a step glides
        svg.classList.add("no-anim");
        scene.render(steps[i].dataset.step, t);
        requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.remove("no-anim")));
      } else scene.render(steps[i].dataset.step, t);
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
    let wasNarrow = narrow.matches;
    window.addEventListener("resize", () => {
      // crossing the phone breakpoint changes the layout: render the step again from scratch
      if (narrow.matches !== wasNarrow) {
        wasNarrow = narrow.matches;
        index = -1;
      }
      queue();
    });
    sync();
  }

  function init() {
    const sections = document.querySelectorAll(".tf-scrolly[data-mr-scene]");
    if (!("IntersectionObserver" in window)) sections.forEach(mount);
    else {
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
    document.querySelectorAll("[data-mr-figure]").forEach((root) => {
      const make = MR.figures[root.dataset.mrFigure];
      if (!make) return;
      root.querySelector("noscript")?.remove();
      make(root);
    });
  }

  MR.scrolly = { mount };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
