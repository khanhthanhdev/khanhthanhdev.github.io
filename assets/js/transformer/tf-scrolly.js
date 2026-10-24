// Sticky scrollytelling for the Transformer series. Markup (one per figure):
//
//   <section class="tf-scrolly" data-tf-scene="part1" data-sentence="the cat sat on the mat">
//     <div class="tf-stage"></div>
//     <div class="tf-steps">
//       <div class="tf-step" data-step="embed" data-title="Words become rows" markdown="1">…prose…</div>
//     </div>
//   </section>
//
// A scene (TF.scenes[name]) is a factory: scene(stage) → { viewBox, build(tokens), render(stepId, t) }.
// render must be idempotent: it sets the whole figure for a step and a progress t (0 → 1 through the step), and
// CSS transitions make step changes glide. Scrolling past a step scrubs t, which drives the cell-by-cell sweeps.
(function () {
  "use strict";

  const TF = window.TF;
  const { h, s, motionQuery } = TF.view;
  TF.scenes = TF.scenes || {};

  const pad2 = (n) => String(n).padStart(2, "0");
  const narrow = window.matchMedia("(max-width: 991.98px)");

  function mount(section) {
    const factory = TF.scenes[section.dataset.tfScene];
    if (!factory || section.dataset.mounted) return;
    section.dataset.mounted = "true";

    const steps = [...section.querySelectorAll(".tf-step")];
    // wrap each step's prose so it can stay pinned (desktop) while the step's sweep plays
    steps.forEach((el) => el.append(h("div", { class: "tf-step-body" }, ...el.childNodes)));
    const stageEl = section.querySelector(".tf-stage");
    const n = steps.length;

    // stage chrome: counter + title, sentence box, the drawing, the formula strip, scene controls
    const counter = h("p", { class: "tf-counter", "aria-live": "polite" });
    const prev = h("button", { type: "button", class: "tf-btn", "aria-label": "Previous step", text: "↑" });
    const next = h("button", { type: "button", class: "tf-btn", "aria-label": "Next step", text: "↓" });
    const input = h("input", {
      type: "text",
      class: "tf-input",
      value: section.dataset.sentence || "the cat sat on the mat",
      "aria-label": "Sentence to run through the model",
      spellcheck: "false",
      autocomplete: "off",
    });
    const note = h("p", { class: "tf-note" });
    const wordsBtn = h("button", { type: "button", class: "tf-link", "aria-expanded": "false", text: "words it knows" });
    const wordList = h("p", { class: "tf-wordlist", hidden: "" }, TF.vocab.filter((w) => !w.startsWith("<")).join(" · "));
    wordsBtn.addEventListener("click", () => {
      const open = wordList.hasAttribute("hidden");
      wordList.toggleAttribute("hidden", !open);
      wordsBtn.setAttribute("aria-expanded", String(open));
    });
    const svg = s("svg", { class: "tf-svg", role: "img", preserveAspectRatio: "xMidYMid meet" });
    const strip = h("p", { class: "tf-strip" });
    const controls = h("div", { class: "tf-controls" });

    const scene = factory({ svg, controls, strip: (text) => (strip.textContent = text || "") });
    svg.setAttribute("viewBox", scene.viewBox || "0 0 800 600");

    stageEl.replaceChildren(
      h("div", { class: "tf-head" }, counter, h("div", { class: "tf-nav" }, prev, next)),
      h("label", { class: "tf-sentence" }, h("span", { class: "tf-label", text: "Sentence" }), input),
      h("div", { class: "tf-notes" }, note, wordsBtn),
      wordList,
      h("div", { class: "tf-canvas" }, svg),
      strip,
      controls
    );

    let tokens = [];
    let index = -1;
    let progress = -1;

    function setSentence(text) {
      const next = TF.tokenize(text);
      if (next.length < 2) {
        note.textContent = "Type at least two words.";
        return;
      }
      tokens = next;
      const unknown = [...new Set(tokens.filter((t) => !t.known).map((t) => t.text))];
      note.textContent = unknown.length
        ? `${unknown.join(", ")} ${unknown.length > 1 ? "are" : "is"} not in the toy vocabulary, so ${unknown.length > 1 ? "they become" : "it becomes"} <unk>.`
        : `${tokens.length} tokens · up to ${TF.config.maxLen}`;
      // redraw without the glide, then let transitions back on
      svg.classList.add("no-anim");
      scene.build(tokens);
      if (index >= 0) scene.render(steps[index].dataset.step, progress);
      requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.remove("no-anim")));
    }

    let typing = 0;
    input.addEventListener("input", () => {
      clearTimeout(typing);
      typing = setTimeout(() => setSentence(input.value), 250);
    });

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

    // Jumping lands just past a step's top, so its sweep starts from the beginning.
    function go(k) {
      const el = steps[Math.max(0, Math.min(n - 1, k))];
      const top = window.scrollY + el.getBoundingClientRect().top - line() + 4;
      window.scrollTo({ top, behavior: motionQuery.matches ? "auto" : "smooth" });
    }
    prev.addEventListener("click", () => go(index - 1));
    next.addEventListener("click", () => go(index + 1));

    setSentence(input.value);
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    sync();
  }

  function init() {
    const sections = document.querySelectorAll(".tf-scrolly[data-tf-scene]");
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

  TF.scrolly = { mount };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
