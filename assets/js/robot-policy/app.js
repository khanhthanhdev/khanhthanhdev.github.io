// Controller for /works/robot-policy/: theme, tabs, the step rail, the pipeline diagram's camera,
// the resizable split and the lazily loaded 3D stage. Each step drives both views at once.

const THEMES = ["light", "dark", "system"];
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

function initTheme() {
  const button = document.getElementById("rp-theme");
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = (setting) => {
    const theme = setting === "system" ? (media.matches ? "dark" : "light") : setting;
    document.documentElement.setAttribute("data-theme-setting", setting);
    document.documentElement.setAttribute("data-theme", theme);
    if (button) button.textContent = setting;
  };
  let setting = store("theme") || "light";
  apply(setting);
  button?.addEventListener("click", () => {
    setting = THEMES[(THEMES.indexOf(setting) + 1) % THEMES.length];
    store("theme", setting);
    apply(setting);
  });
  media.addEventListener("change", () => setting === "system" && apply(setting));
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

function initSplitter(split, handle) {
  const apply = (f) => {
    const v = Math.min(0.72, Math.max(0.28, f));
    split.style.setProperty("--rp-split", v.toFixed(3));
    return v;
  };
  let frac = apply(Number(store("rp-split")) || 0.5);
  handle.addEventListener("pointerdown", (e) => {
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = split.getBoundingClientRect();
      frac = apply((ev.clientX - r.left) / r.width);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      store("rp-split", String(frac));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up, { once: true });
  });
  handle.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    frac = apply(frac + (e.key === "ArrowRight" ? 0.03 : -0.03));
    store("rp-split", String(frac));
  });
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
  const steps = [...document.querySelectorAll("#rp-steps > li")].map((li) => ({
    id: li.dataset.id,
    bounds: li.dataset.bounds ? li.dataset.bounds.split(" ").map(Number) : null,
    stage: JSON.parse(li.dataset.stage || "{}"),
    title: li.querySelector("h3").textContent,
    body: li.querySelector(".rp-step-body").innerHTML,
    shapes: li.querySelector(".rp-step-shapes")?.textContent ?? "",
  }));
  const card = document.getElementById("rp-step-card");
  const dots = [...document.querySelectorAll("#rp-dots button")];
  const playBtn = document.getElementById("rp-play");
  const diagram = initDiagram(document.getElementById("rp-diagram"));
  const groups = [...diagram.svg.querySelectorAll("[data-step]")];
  let index = 0;
  let stage = null;
  let timer = 0;

  function activate(i, { animate = true } = {}) {
    index = (i + steps.length) % steps.length;
    const s = steps[index];
    card.innerHTML =
      `<div class="rp-step-count">Step ${index + 1} of ${steps.length}</div>` +
      `<h2></h2><div>${s.body}</div>` +
      (s.shapes ? `<div class="rp-step-shapes"></div>` : "");
    card.querySelector("h2").textContent = s.title;
    if (s.shapes) card.querySelector(".rp-step-shapes").textContent = s.shapes;
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
    stage?.play({ beat: s.id, ...s.stage });
  }

  const setPlaying = (on) => {
    clearInterval(timer);
    playBtn.setAttribute("aria-pressed", String(on));
    playBtn.textContent = on ? "Pause" : "Play";
    if (on) timer = setInterval(() => activate(index + 1), 8000);
  };

  document.getElementById("rp-prev").addEventListener("click", () => activate(index - 1));
  document.getElementById("rp-next").addEventListener("click", () => activate(index + 1));
  document.getElementById("rp-fit").addEventListener("click", () => diagram.fit(null));
  playBtn.addEventListener("click", () => setPlaying(playBtn.getAttribute("aria-pressed") !== "true"));
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
  document.addEventListener("keydown", (e) => {
    if (document.getElementById("inference").hidden) return;
    if (e.target.closest("input, textarea, select, [role='tab'], [role='separator']")) return;
    if (e.key === "ArrowRight") activate(index + 1);
    else if (e.key === "ArrowLeft") activate(index - 1);
    else if (e.key === " " && (e.target === document.body || e.target === document.documentElement)) {
      e.preventDefault();
      setPlaying(playBtn.getAttribute("aria-pressed") !== "true");
    }
  });

  initSplitter(document.getElementById("rp-split"), document.getElementById("rp-splitter"));

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
      stage.play({ beat: steps[index].id, ...steps[index].stage });
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
    if (id === "inference") {
      io.observe(stageEl);
      requestAnimationFrame(() => activate(index, { animate: false }));
    } else {
      setPlaying(false);
    }
  });
}

initTheme();
const app = document.getElementById("rp-app");
if (app) initPolicyPage(app);
