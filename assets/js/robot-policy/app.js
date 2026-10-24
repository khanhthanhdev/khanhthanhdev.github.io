// Controller for /works/robot-policy/: tabs, the reading pane whose scroll picks the step, the diagram cameras that follow
// it, the resizable split, KaTeX formulas and the lazily loaded 3D stage. The step under the reading line drives the
// diagram camera and (for inference) the stage on the left.

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

// Panels are #panel-<name> and the URL carries #<name>, so the browser never jumps to a panel on load: the reading
// pane and the window keep their own scroll.
function initTabs(onChange) {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  if (!tabs.length) return;
  const nameOf = (tab) => tab.getAttribute("aria-controls").replace(/^panel-/, "");
  const select = (name, focus = false) => {
    tabs.forEach((tab) => {
      const on = nameOf(tab) === name;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !on;
      if (on && focus) tab.focus();
    });
    history.replaceState(null, "", name === "inference" ? location.pathname : `#${name}`);
    onChange(name);
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(nameOf(tab)));
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      select(nameOf(tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]), true);
    });
  });
  const initial = location.hash.slice(1);
  select(tabs.some((t) => nameOf(t) === initial) ? initial : "inference");
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
  const frame = (bounds) => {
    const [x, y, w, h] = bounds ?? full;
    const pad = Math.max(w, h) * 0.08;
    return [x - pad, y - pad, w + 2 * pad, h + 2 * pad];
  };
  // Scroll-linked camera: t = 0 frames `from`, t = 1 frames `to`.
  const between = (from, to, t) => {
    cancelAnimationFrame(anim);
    const a = frame(from);
    const b = frame(to);
    const e = ease(Math.min(1, Math.max(0, t)));
    set(a.map((v, i) => v + (b[i] - v) * e));
  };
  const fit = (bounds, ms = 800) => {
    const target = frame(bounds);
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
  // Touch scrolls the page (it drives the steps on narrow screens); mouse and pen drag the diagram.
  host.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" || e.button !== 0 || e.target.closest("button")) return;
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
      // A plain wheel scrolls the reading pane (see initReader); ctrl/⌘ + wheel (and trackpad pinch) zooms.
      if (!e.ctrlKey && !e.metaKey) return;
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

  return { svg, fit, between, wasDrag: () => drag && drag.moved >= 4 };
}

// A draggable divider that sets `prop` (a 0–1 fraction) on `box`. Arrow keys nudge it; a double click restores `start`.
function initSplitter(box, handle, key, { prop = "--rp-split", axis = "x", start = 0.56, min = 0.2, max = 0.85 } = {}) {
  const apply = (f) => {
    const v = Math.min(max, Math.max(min, f));
    box.style.setProperty(prop, v.toFixed(3));
    handle.setAttribute("aria-valuenow", String(Math.round(v * 100)));
    return v;
  };
  let frac = apply(Number(store(key)) || start);
  const keys = axis === "x" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add("rp-resizing");
    const move = (ev) => {
      const r = box.getBoundingClientRect();
      frac = apply(axis === "x" ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      document.body.classList.remove("rp-resizing");
      store(key, String(frac));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up, { once: true });
    handle.addEventListener("pointercancel", up, { once: true });
  });
  handle.addEventListener("keydown", (e) => {
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    frac = apply(frac + (e.key === keys[1] ? 0.03 : -0.03));
    store(key, String(frac));
  });
  handle.addEventListener("dblclick", () => {
    frac = apply(start);
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
  fitFormulas(root);
}

// A formula wider than the reading pane is scaled down to fit, to at most 70 % of its size; past that it scrolls.
// Panels hidden behind another tab measure 0 wide, so each formula is fitted again whenever its width changes.
function fitFormulas(root) {
  const fit = (el) => {
    const w = el.clientWidth;
    if (!w || Number(el.dataset.fitWidth) === w) return;
    el.dataset.fitWidth = w;
    el.style.removeProperty("--fit");
    const d = el.querySelector(".katex-display");
    if (d && d.scrollWidth > d.clientWidth) el.style.setProperty("--fit", Math.max(0.7, d.clientWidth / d.scrollWidth).toFixed(3));
  };
  const els = root.querySelectorAll(".rp-tex.is-typeset");
  if (!("ResizeObserver" in window)) return els.forEach(fit);
  const ro = new ResizeObserver((entries) => entries.forEach((e) => fit(e.target)));
  els.forEach((el) => ro.observe(el));
  // KaTeX's webfonts can arrive after the first measurement; fit again once they have.
  document.fonts?.ready.then(() =>
    els.forEach((el) => {
      delete el.dataset.fitWidth;
      fit(el);
    })
  );
}

// Page numbers with gaps: always the first and last step and the neighbours of the current one, e.g. ‹ 1 2 3 … 6 7 ›.
function pageList(current, n) {
  const keep = new Set([0, n - 1, current - 1, current, current + 1]);
  if (current <= 2) [0, 1, 2, 3].forEach((k) => keep.add(k));
  if (current >= n - 3) [n - 4, n - 3, n - 2, n - 1].forEach((k) => keep.add(k));
  const ks = [...keep].filter((k) => k >= 0 && k < n).sort((x, y) => x - y);
  const out = [];
  ks.forEach((k, j) => {
    if (j && k - ks[j - 1] === 2) out.push(k - 1);
    else if (j && k - ks[j - 1] > 2) out.push(null);
    out.push(k);
  });
  return out;
}

// While a step crosses the reading line, the first HOLD of its height keeps the camera on its block and the rest zooms
// toward the next step's block, which arrives as that step reaches the line.
const HOLD = 0.55;
const pad2 = (k) => String(k).padStart(2, "0");

// The reading pane scrolls on its own on wide screens; on narrow ones the page scrolls under a sticky visual.
// The reading line sits 30% down the part of the text that is visible.
function initReader(app) {
  const pane = app.querySelector(".rp-read-scroll");
  const visual = app.querySelector(".rp-visual");
  const foot = app.querySelector(".rp-read-foot");
  const paneScrolls = () => getComputedStyle(pane).overflowY !== "visible";
  // Narrow screens measure from where the sticky visual ends once it is pinned, so a jump computed while it is still
  // scrolling into place lands where sync() will read it.
  const line = () => {
    const [a, b] = paneScrolls()
      ? [pane.getBoundingClientRect().top, pane.getBoundingClientRect().bottom]
      : [(parseFloat(getComputedStyle(visual).top) || 0) + visual.offsetHeight, innerHeight - foot.offsetHeight];
    return a + (b - a) * 0.3;
  };
  // Scroll so that `el` sits just above the reading line. The glide is driven here rather than by
  // behavior: "smooth", which some browsers drop on an element right after an instant scroll.
  let glide = 0;
  const stop = () => cancelAnimationFrame(glide);
  ["wheel", "touchstart", "keydown"].forEach((t) => window.addEventListener(t, stop, { passive: true }));
  const scrollTo = (el) => {
    const inPane = paneScrolls();
    const get = () => (inPane ? pane.scrollTop : window.scrollY);
    const set = (y) => (inPane ? (pane.scrollTop = y) : window.scrollTo(0, y));
    const from = get();
    const to = from + el.getBoundingClientRect().top - line() + 4;
    stop();
    if (reducedMotion) return set(to);
    const ms = Math.min(900, 300 + Math.abs(to - from) * 0.25);
    const t0 = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      set(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) glide = requestAnimationFrame(tick);
    };
    glide = requestAnimationFrame(tick);
  };
  const toTop = () => {
    if (paneScrolls()) pane.scrollTop = 0;
    const top = app.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(app).scrollMarginTop) || 0);
    if (window.scrollY > top) window.scrollTo({ top, behavior: "auto" });
  };
  // A plain wheel over the visual reads on, so the whole window scrolls the steps.
  visual.addEventListener(
    "wheel",
    (e) => {
      // The 3D view zooms on the wheel and marks the event handled.
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || !paneScrolls()) return;
      e.preventDefault();
      pane.scrollBy({ top: e.deltaY * (e.deltaMode === 1 ? 16 : 1) });
    },
    { passive: false }
  );
  return { pane, line, scrollTo, toTop };
}

// One explorer = the steps of a panel plus the diagram whose camera follows them. `controls` are the shared pager,
// counter and progress bar in the reading pane's foot; only the visible explorer writes to them.
function initExplorer(list, host, reader, controls, { onStep = () => {} } = {}) {
  const items = [...list.children];
  typeset(list);
  const steps = items.map((li) => ({
    id: li.dataset.id,
    title: li.querySelector("h2").textContent.trim(),
    bounds: li.dataset.bounds ? li.dataset.bounds.split(" ").map(Number) : null,
    stage: JSON.parse(li.dataset.stage || "null") ?? {},
    li,
  }));
  const n = steps.length;
  const diagram = initDiagram(host);
  const groups = [...diagram.svg.querySelectorAll("[data-step]")];
  // build order for the step's figure: children arrive one stagger step apart in document (reading) order
  groups.forEach((g) => [...g.children].forEach((c, k) => c.style.setProperty("--i", k)));
  let index = -1;
  let shown = false;

  function render() {
    if (!shown || index < 0) return;
    controls.pages.replaceChildren(
      ...pageList(index, n).map((k) => {
        const li = document.createElement("li");
        if (k === null) {
          li.className = "rp-gap";
          li.textContent = "…";
          li.setAttribute("aria-hidden", "true");
          return li;
        }
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = String(k + 1);
        b.dataset.index = String(k);
        b.setAttribute("aria-label", `Step ${k + 1}: ${steps[k].title}`);
        if (k === index) b.setAttribute("aria-current", "step");
        li.append(b);
        return li;
      })
    );
    controls.prev.disabled = index === 0;
    controls.next.disabled = index === n - 1;
    const next = steps[index + 1];
    controls.now.replaceChildren(
      Object.assign(document.createElement("b"), { textContent: `${pad2(index + 1)} / ${pad2(n)}` }),
      ` ${steps[index].title}`,
      ...(next ? [Object.assign(document.createElement("span"), { textContent: ` → ${next.title}` })] : [])
    );
  }

  function activate(i) {
    if (i === index) return;
    index = i;
    const s = steps[index];
    items.forEach((li, k) => li.classList.toggle("is-active", k === index));
    const focus = s.stage.focus ?? s.id;
    let any = false;
    groups.forEach((g) => {
      const on = g.dataset.step.split(" ").includes(focus);
      g.classList.toggle("is-active", on);
      any ||= on;
    });
    diagram.svg.classList.toggle("has-active", any);
    render();
    onStep(s);
  }

  function sync() {
    const L = reader.line();
    const tops = items.map((li) => li.getBoundingClientRect().top);
    let i = 0;
    while (i < n - 1 && tops[i + 1] <= L) i++;
    const end = i < n - 1 ? tops[i + 1] : items[i].getBoundingClientRect().bottom;
    const f = Math.min(1, Math.max(0, (L - tops[i]) / Math.max(1, end - tops[i])));
    const t = i < n - 1 ? (f - HOLD) / (1 - HOLD) : 0;
    diagram.between(steps[i].bounds, steps[Math.min(i + 1, n - 1)].bounds, t);
    activate(i);
    controls.bar.style.transform = `scaleX(${((i + f) / n).toFixed(4)})`;
  }

  const go = (k) => reader.scrollTo(items[Math.min(n - 1, Math.max(0, k))]);
  host.querySelector('[data-role="fit"]').addEventListener("click", () => diagram.fit(null));
  groups.forEach((g) => {
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    const jump = () => {
      const k = steps.findIndex((s) => g.dataset.step.split(" ").includes(s.stage.focus ?? s.id));
      if (k >= 0) go(k);
    };
    g.addEventListener("click", () => !diagram.wasDrag() && jump());
    g.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), jump()));
  });

  return {
    current: () => steps[Math.max(0, index)],
    sync,
    go,
    step: (d) => go(index + d),
    show(on) {
      shown = on;
      if (on) {
        sync();
        render();
      }
    },
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
  let tab = "inference";
  const reader = initReader(app);
  const controls = {
    pages: app.querySelector(".rp-pages"),
    prev: app.querySelector('[data-role="prev"]'),
    next: app.querySelector('[data-role="next"]'),
    now: app.querySelector(".rp-now"),
    bar: app.querySelector(".rp-progress span"),
  };
  const explorers = {};
  for (const name of ["inference", "training"]) {
    const list = app.querySelector(`[data-steps="${name}"]`);
    const host = app.querySelector(`.rp-diagram[data-for="${name}"]`);
    if (!list || !host) continue;
    explorers[name] = initExplorer(list, host, reader, controls, {
      onStep: (s) => name === "inference" && tab === "inference" && stage?.play({ beat: s.id, ...s.stage }),
    });
  }
  let visible = null;
  const playForTab = () => {
    if (!stage || !explorers.inference) return;
    // Results shows the whole loop running, as in the overview step.
    const s = tab === "results" ? { id: "overview", stage: {} } : explorers.inference.current();
    stage.play({ beat: s.id, ...s.stage });
  };

  controls.prev.addEventListener("click", () => visible?.step(-1));
  controls.next.addEventListener("click", () => visible?.step(1));
  controls.pages.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-index]");
    if (b) visible?.go(Number(b.dataset.index));
  });
  initSplitter(app, app.querySelector(".rp-splitter"), "rp-split");
  initSplitter(app.querySelector(".rp-visual"), app.querySelector(".rp-rowsplit"), "rp-rows", {
    prop: "--rp-rows",
    axis: "y",
    start: 0.5,
    min: 0.15,
    max: 0.85,
  });

  // Contents: the steps and headings of the open panel.
  const contents = app.querySelector(".rp-contents");
  const buildContents = (panel) => {
    const targets = [...panel.querySelectorAll(".rp-steps > li > h2, .rp-article > h2, .rp-article > h3")];
    contents.querySelector("ol").replaceChildren(
      ...targets.map((h) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = h.textContent.trim();
        b.addEventListener("click", () => {
          contents.open = false;
          reader.scrollTo(h.closest("li") ?? h);
        });
        li.append(b);
        return li;
      })
    );
  };
  document.addEventListener("click", (e) => contents.open && !contents.contains(e.target) && (contents.open = false));

  document.addEventListener("keydown", (e) => {
    if (!visible) return;
    if (e.target.closest("input, textarea, select, summary, [role='tab'], [role='separator']")) return;
    if (e.key === "ArrowRight") visible.step(1);
    else if (e.key === "ArrowLeft") visible.step(-1);
  });
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      visible?.sync();
    });
  };
  reader.pane.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  // 3D stage: load three.js and the NexArm asset only when the stage is on screen.
  const stageEl = document.getElementById("rp-stage");
  const fallback = document.getElementById("rp-stage-fallback");
  const motionBtn = document.getElementById("rp-motion");
  const camsBtn = document.getElementById("rp-cams");
  const resetBtn = document.getElementById("rp-reset-view");
  let loading = false;
  const load = async () => {
    if (loading) return;
    loading = true;
    if (!webglAvailable()) {
      fallback.lastElementChild.textContent = "This browser has WebGL turned off, so the 3D view is unavailable.";
      motionBtn.hidden = camsBtn.hidden = true;
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
      stage.setCams(camsBtn.getAttribute("aria-pressed") !== "true");
      playForTab();
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
  camsBtn.addEventListener("click", () => {
    const hide = camsBtn.getAttribute("aria-pressed") !== "true";
    camsBtn.setAttribute("aria-pressed", String(hide));
    camsBtn.textContent = hide ? "Show cameras" : "Hide cameras";
    store("rp-cams", hide ? "off" : "on");
    stage?.setCams(!hide);
  });
  if (store("rp-cams") === "off") camsBtn.click();
  resetBtn.addEventListener("click", () => stage?.resetView());
  const io = new IntersectionObserver((entries) => {
    if (entries.some((en) => en.isIntersecting)) {
      io.disconnect();
      load();
    }
  });

  initTabs((id) => {
    tab = id;
    app.dataset.tab = id;
    reader.toTop();
    buildContents(document.getElementById(`panel-${id}`));
    Object.entries(explorers).forEach(([name, ex]) => ex.show(name === id));
    visible = explorers[id] ?? null;
    if (id !== "training") io.observe(stageEl);
    playForTab();
  });
}

const app = document.getElementById("rp-app");
if (app) initPolicyPage(app);
