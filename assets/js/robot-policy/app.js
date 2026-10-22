// Controller for /works/robot-policy/: tabs, the stepped explorers (inference and training), their diagram cameras,
// the resizable splits, KaTeX formulas and the lazily loaded 3D stage. Each inference step drives the diagram and the stage.

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch (e) {
    return null;
  }
  return value;
}

function initTabs(onChange) {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  if (!tabs.length) return;
  const select = (id, focus = false) => {
    tabs.forEach((tab) => {
      const on = tab.getAttribute("aria-controls") === id;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !on;
      if (on && focus) tab.focus();
    });
    history.replaceState(null, "", id === "inference" ? location.pathname : `#${id}`);
    onChange(id);
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab.getAttribute("aria-controls")));
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      select(next.getAttribute("aria-controls"), true);
    });
  });
  const initial = location.hash.slice(1);
  select(tabs.some((t) => t.getAttribute("aria-controls") === initial) ? initial : "inference");
}

// The diagram camera animates the SVG viewBox; preserveAspectRatio keeps the requested region in view.
function initDiagram(host) {
  const svg = host.querySelector("svg");
  const full = svg.getAttribute("viewBox").split(/\s+/).map(Number);
  let view = full.slice();
  let anim = 0;
  const set = (v) => {
    view = v;
    svg.setAttribute("viewBox", v.map((n) => n.toFixed(1)).join(" "));
  };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const fit = (bounds, ms = 700) => {
    const [x, y, w, h] = bounds ?? full;
    const pad = Math.max(w, h) * 0.08;
    const target = [x - pad, y - pad, w + 2 * pad, h + 2 * pad];
    cancelAnimationFrame(anim);
    if (reducedMotion || ms === 0) return set(target);
    const from = view.slice();
    const t0 = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = ease(t);
      set(from.map((v, i) => v + (target[i] - v) * e));
      if (t < 1) anim = requestAnimationFrame(tick);
    };
    anim = requestAnimationFrame(tick);
  };

  const scale = () => {
    const r = host.getBoundingClientRect();
    return Math.min(r.width / view[2], r.height / view[3]);
  };
  const toSvg = (cx, cy) => {
    const pt = svg.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  let drag = null;
  host.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    drag = { x: e.clientX, y: e.clientY, view: view.slice(), moved: 0 };
    host.setPointerCapture(e.pointerId);
  });
  host.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    if (drag.moved < 4) return;
    host.classList.add("is-dragging");
    cancelAnimationFrame(anim);
    const s = scale();
    set([drag.view[0] - dx / s, drag.view[1] - dy / s, drag.view[2], drag.view[3]]);
  });
  const end = () => {
    host.classList.remove("is-dragging");
    setTimeout(() => (drag = null), 0);
  };
  host.addEventListener("pointerup", end);
  host.addEventListener("pointercancel", end);
  host.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      cancelAnimationFrame(anim);
      const f = Math.exp(e.deltaY * 0.0015);
      const p = toSvg(e.clientX, e.clientY);
      const w = Math.min(full[2] * 2, Math.max(full[2] / 12, view[2] * f));
      const k = w / view[2];
      set([p.x - (p.x - view[0]) * k, p.y - (p.y - view[1]) * k, view[2] * k, view[3] * k]);
    },
    { passive: false }
  );

  return { svg, fit, wasDrag: () => drag && drag.moved >= 4 };
}

function initSplitter(split, handle, key) {
  const apply = (f) => {
    const v = Math.min(0.75, Math.max(0.3, f));
    split.style.setProperty("--rp-split", v.toFixed(3));
    return v;
  };
  let frac = apply(Number(store(key)) || 0.6);
  handle.addEventListener("pointerdown", (e) => {
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = split.getBoundingClientRect();
      frac = apply((ev.clientX - r.left) / r.width);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      store(key, String(frac));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up, { once: true });
  });
  handle.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    frac = apply(frac + (e.key === "ArrowRight" ? 0.03 : -0.03));
    store(key, String(frac));
  });
}

// Formulas are TeX in .rp-tex; KaTeX (a deferred classic script) typesets them once, before any step is shown.
// Without KaTeX the TeX source stays visible as text.
function typeset(root) {
  if (!window.katex) return;
  root.querySelectorAll(".rp-tex").forEach((el) => {
    try {
      window.katex.render(el.textContent, el, { displayMode: true, throwOnError: false, output: "html" });
      el.classList.add("is-typeset");
    } catch (err) {
      console.error(err);
    }
  });
}

// One explorer = a diagram whose camera follows a list of steps, plus the card that explains the current step.
function initExplorer(root, { onStep = () => {} } = {}) {
  const items = [...root.querySelectorAll(".rp-step-list > li")];
  typeset(root.querySelector(".rp-step-list"));
  const steps = items.map((li) => ({
    id: li.dataset.id,
    bounds: li.dataset.bounds ? li.dataset.bounds.split(" ").map(Number) : null,
    stage: JSON.parse(li.dataset.stage || "null") ?? {},
    li,
  }));
  const card = root.querySelector(".rp-step-card");
  const dots = [...root.querySelectorAll(".rp-dots button")];
  const playBtn = root.querySelector('[data-role="play"]');
  const diagram = initDiagram(root.querySelector(".rp-diagram"));
  const groups = [...diagram.svg.querySelectorAll("[data-step]")];
  let index = 0;
  let timer = 0;

  function activate(i, { animate = true } = {}) {
    index = (i + steps.length) % steps.length;
    const s = steps[index];
    const count = document.createElement("div");
    count.className = "rp-step-count";
    count.textContent = `Step ${index + 1} of ${steps.length}`;
    const title = document.createElement("h2");
    title.textContent = s.li.querySelector("h3").textContent;
    const rest = [...s.li.children].filter((el) => el.tagName !== "H3").map((el) => el.cloneNode(true));
    card.replaceChildren(count, title, ...rest);
    card.scrollTop = 0;
    dots.forEach((d, k) => (k === index ? d.setAttribute("aria-current", "step") : d.removeAttribute("aria-current")));
    const focus = s.stage.focus ?? s.id;
    let any = false;
    groups.forEach((g) => {
      const on = g.dataset.step.split(" ").includes(focus);
      g.classList.toggle("is-active", on);
      any ||= on;
    });
    diagram.svg.classList.toggle("has-active", any);
    diagram.fit(s.bounds, animate ? 700 : 0);
    onStep(s);
  }

  const setPlaying = (on) => {
    clearInterval(timer);
    playBtn.setAttribute("aria-pressed", String(on));
    playBtn.textContent = on ? "Pause" : "Play";
    if (on) timer = setInterval(() => activate(index + 1), 9000);
  };
  const togglePlay = () => setPlaying(playBtn.getAttribute("aria-pressed") !== "true");

  root.querySelector('[data-role="prev"]').addEventListener("click", () => activate(index - 1));
  root.querySelector('[data-role="next"]').addEventListener("click", () => activate(index + 1));
  root.querySelector('[data-role="fit"]').addEventListener("click", () => diagram.fit(null));
  playBtn.addEventListener("click", togglePlay);
  dots.forEach((d) => d.addEventListener("click", () => activate(Number(d.dataset.index))));
  groups.forEach((g) => {
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    const go = () => {
      const k = steps.findIndex((s) => g.dataset.step.split(" ").includes(s.stage.focus ?? s.id));
      if (k >= 0) activate(k);
    };
    g.addEventListener("click", () => !diagram.wasDrag() && go());
    g.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go()));
  });
  initSplitter(root.querySelector(".rp-split"), root.querySelector(".rp-splitter"), `rp-split-${root.dataset.explorer}`);

  return {
    root,
    current: () => steps[index],
    show: () => requestAnimationFrame(() => activate(index, { animate: false })),
    step: (d) => activate(index + d),
    togglePlay,
    stop: () => setPlaying(false),
  };
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) {
    return false;
  }
}

function initPolicyPage(app) {
  let stage = null;
  const explorers = {};
  explorers.inference = initExplorer(app.querySelector('[data-explorer="inference"]'), {
    onStep: (s) => stage?.play({ beat: s.id, ...s.stage }),
  });
  const training = app.querySelector('[data-explorer="training"]');
  if (training) explorers.training = initExplorer(training);
  let visible = null;

  document.addEventListener("keydown", (e) => {
    if (!visible) return;
    if (e.target.closest("input, textarea, select, [role='tab'], [role='separator']")) return;
    if (e.key === "ArrowRight") visible.step(1);
    else if (e.key === "ArrowLeft") visible.step(-1);
    else if (e.key === " " && (e.target === document.body || e.target === document.documentElement)) {
      e.preventDefault();
      visible.togglePlay();
    }
  });

  // 3D stage: load three.js and the NexArm asset only when the stage is on screen.
  const stageEl = document.getElementById("rp-stage");
  const fallback = document.getElementById("rp-stage-fallback");
  const motionBtn = document.getElementById("rp-motion");
  let loading = false;
  const load = async () => {
    if (loading) return;
    loading = true;
    if (!webglAvailable()) {
      fallback.lastElementChild.textContent = "This browser has WebGL turned off, so the 3D view is unavailable.";
      motionBtn.hidden = true;
      return;
    }
    try {
      const { mountStage } = await import(app.dataset.stageModule);
      stage = await mountStage(stageEl, {
        assetUrl: app.dataset.assetUrl,
        policy: {
          name: app.dataset.name,
          horizon: Number(app.dataset.horizon),
          execute: Number(app.dataset.execute),
          fps: Number(app.dataset.fps),
        },
      });
      fallback.remove();
      const s = explorers.inference.current();
      stage.play({ beat: s.id, ...s.stage });
      if (reducedMotion) {
        stage.setPlaying(false);
        motionBtn.textContent = "Play motion";
        motionBtn.setAttribute("aria-pressed", "true");
      }
    } catch (err) {
      console.error(err);
      fallback.lastElementChild.textContent = "The 3D view could not load. The diagram and steps still work.";
    }
  };
  motionBtn.addEventListener("click", () => {
    if (!stage) return;
    const on = !stage.playing;
    stage.setPlaying(on);
    motionBtn.textContent = on ? "Pause motion" : "Play motion";
    motionBtn.setAttribute("aria-pressed", String(!on));
  });
  const io = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      io.disconnect();
      load();
    }
  });

  initTabs((id) => {
    Object.values(explorers).forEach((x) => x.stop());
    visible = explorers[id] ?? null;
    visible?.show();
    if (id === "inference") io.observe(stageEl);
  });
}

const app = document.getElementById("rp-app");
if (app) initPolicyPage(app);
