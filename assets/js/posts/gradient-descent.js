document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));
  const fmt = (x, n = 3) => (Number.isFinite(x) ? x.toFixed(n) : "diverged");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let theme;
  const redraw = [];

  function readTheme() {
    const s = getComputedStyle(document.documentElement);
    theme = {
      bg: s.getPropertyValue("--global-bg-color").trim() || "#fff",
      text: s.getPropertyValue("--global-text-color").trim() || "#222",
      muted: s.getPropertyValue("--global-text-color-light").trim() || "#777",
      border: s.getPropertyValue("--global-divider-color").trim() || "#ddd",
      accent: s.getPropertyValue("--global-theme-color").trim() || "#d14",
      blue: "#3979d8",
      orange: "#ee8a30",
    };
  }

  function canvas(id) {
    const el = $(id);
    return el ? [el, el.getContext("2d")] : [];
  }
  function clear(c, ctx) {
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  function axes(ctx, w, h, pad = 40) {
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, h / 2);
    ctx.lineTo(w - pad, h / 2);
    ctx.moveTo(w / 2, pad);
    ctx.lineTo(w / 2, h - pad);
    ctx.stroke();
  }
  function metric(label, value) {
    return `<span class="metric-item"><small>${label}</small><strong>${value}</strong></span>`;
  }
  function runner(button, step, render, done = () => false) {
    let raf = 0;
    let running = false;
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
      if (button) button.textContent = "Run";
    };
    const tick = () => {
      if (!running) return;
      step();
      render();
      if (done()) stop();
      else raf = requestAnimationFrame(tick);
    };
    button?.addEventListener("click", () => {
      if (running) return stop();
      running = true;
      button.textContent = "Pause";
      tick();
    });
    if (reduced && button) button.title = "Animation available; manual Step is recommended for reduced motion";
    return stop;
  }

  function initBoundary() {
    const [c, ctx] = canvas("gd-boundary-canvas");
    if (!c) return;
    const controls = ["w1", "w2", "b"].map((x) => $("gd-boundary-" + x));
    const points = [
      [-0.75, -0.45, 0],
      [-0.55, -0.75, 0],
      [-0.25, -0.4, 0],
      [-0.65, 0.05, 0],
      [0.3, 0.55, 1],
      [0.65, 0.35, 1],
      [0.5, 0.8, 1],
      [0.85, 0.65, 1],
    ];
    const px = (x) => 55 + ((x + 1) / 2) * (c.width - 110);
    const py = (y) => c.height - 45 - ((y + 1) / 2) * (c.height - 90);
    function render() {
      const [w1, w2, b] = controls.map((control) => Number(control.value));
      controls.forEach((el, i) => ($(el.id + "-value").textContent = fmt([w1, w2, b][i], 1)));
      clear(c, ctx);
      ctx.fillStyle = theme.muted;
      ctx.font = "13px sans-serif";
      ctx.fillText("roundness x₂", 8, 18);
      ctx.fillText("redness x₁", c.width - 95, c.height - 10);
      axes(ctx, c.width, c.height);
      if (Math.abs(w1) + Math.abs(w2) > 1e-8) {
        const intersections = [];
        if (Math.abs(w2) > 1e-8)
          for (const x of [-1, 1]) {
            const y = -(w1 * x + b) / w2;
            if (y >= -1 && y <= 1) intersections.push([x, y]);
          }
        if (Math.abs(w1) > 1e-8)
          for (const y of [-1, 1]) {
            const x = -(w2 * y + b) / w1;
            if (x >= -1 && x <= 1) intersections.push([x, y]);
          }
        if (intersections.length >= 2) {
          ctx.strokeStyle = theme.accent;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(px(intersections[0][0]), py(intersections[0][1]));
          ctx.lineTo(px(intersections[1][0]), py(intersections[1][1]));
          ctx.stroke();
        }
      }
      let correct = 0;
      points.forEach(([x, y, label]) => {
        correct += Number((w1 * x + w2 * y + b >= 0 ? 1 : 0) === label);
        ctx.beginPath();
        ctx.fillStyle = label ? theme.orange : theme.blue;
        ctx.arc(px(x), py(y), 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = theme.bg;
        ctx.stroke();
      });
      $("gd-boundary-status").textContent = `${correct}/${points.length} fruit classified correctly`;
    }
    controls.forEach((el) => el.addEventListener("input", render));
    redraw.push(render);
    render();
  }

  function initActivation() {
    const [c, ctx] = canvas("gd-activation-canvas");
    if (!c) return;
    const input = $("gd-activation-z");
    let kind = "sigmoid";
    const f = (z) => (kind === "sigmoid" ? sigmoid(z) : kind === "tanh" ? Math.tanh(z) : Math.max(0, z));
    function render() {
      const z = +input.value,
        a = f(z);
      clear(c, ctx);
      const X = (x) => 40 + ((x + 5) / 10) * (c.width - 80),
        minY = kind === "relu" ? -1 : -1.25,
        maxY = kind === "relu" ? 5.5 : 1.25,
        Y = (y) => 25 + ((maxY - y) / (maxY - minY)) * (c.height - 50);
      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(-5), Y(0));
      ctx.lineTo(X(5), Y(0));
      ctx.moveTo(X(0), Y(minY));
      ctx.lineTo(X(0), Y(maxY));
      ctx.stroke();
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const x = -5 + i / 20;
        i ? ctx.lineTo(X(x), Y(f(x))) : ctx.moveTo(X(x), Y(f(x)));
      }
      ctx.stroke();
      ctx.fillStyle = theme.orange;
      ctx.beginPath();
      ctx.arc(X(z), Y(a), 7, 0, Math.PI * 2);
      ctx.fill();
      $("gd-activation-z-value").textContent = fmt(z, 2);
      $("gd-activation-status").textContent = `${kind}: a = f(z) = ${fmt(a, 4)}`;
    }
    $("gd-activation-demo")
      .querySelectorAll("[data-activation]")
      .forEach((b) =>
        b.addEventListener("click", () => {
          kind = b.dataset.activation;
          b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("is-active", x === b));
          render();
        })
      );
    input.addEventListener("input", render);
    redraw.push(render);
    render();
  }

  function initCost() {
    const [c, ctx] = canvas("gd-cost-canvas");
    if (!c) return;
    const ai = $("gd-cost-a"),
      yi = $("gd-cost-target");
    function render() {
      const a = +ai.value,
        y = +yi.value,
        cost = (a - y) ** 2;
      clear(c, ctx);
      const X = (x) => 45 + x * (c.width - 80),
        Y = (v) => c.height - 35 - v * (c.height - 65);
      ctx.strokeStyle = theme.border;
      ctx.strokeRect(45, 30, c.width - 80, c.height - 65);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const x = i / 100;
        i ? ctx.lineTo(X(x), Y((x - y) ** 2)) : ctx.moveTo(X(x), Y((x - y) ** 2));
      }
      ctx.stroke();
      ctx.fillStyle = theme.orange;
      ctx.beginPath();
      ctx.arc(X(a), Y(cost), 8, 0, 7);
      ctx.fill();
      $("gd-cost-a-value").textContent = fmt(a, 2);
      $("gd-cost-status").textContent = `C = (${fmt(a, 2)} − ${y})² = ${fmt(cost, 4)}`;
    }
    [ai, yi].forEach((x) => x.addEventListener("input", render));
    redraw.push(render);
    render();
  }

  function initOneD() {
    const [c, ctx] = canvas("gd-one-d-canvas");
    if (!c) return;
    const lr = $("gd-one-d-lr");
    let x = -2.2,
      steps = 0;
    const loss = (v) => (v - 1) ** 2 + 0.15 * Math.sin(3 * v),
      slope = (v) => 2 * (v - 1) + 0.45 * Math.cos(3 * v);
    function render() {
      clear(c, ctx);
      const X = (v) => 45 + ((v + 3) / 6) * (c.width - 80),
        Y = (v) => c.height - 35 - (v / 17) * (c.height - 60);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 240; i++) {
        const v = -3 + i / 40;
        i ? ctx.lineTo(X(v), Y(loss(v))) : ctx.moveTo(X(v), Y(loss(v)));
      }
      ctx.stroke();
      ctx.fillStyle = theme.orange;
      ctx.beginPath();
      ctx.arc(X(x), Y(loss(x)), 8, 0, 7);
      ctx.fill();
      $("gd-one-d-lr-value").textContent = fmt(+lr.value, 2);
      $("gd-one-d-status").innerHTML = metric("step", steps) + metric("x", fmt(x)) + metric("slope", fmt(slope(x))) + metric("loss", fmt(loss(x)));
    }
    const step = () => {
      const next = x - +lr.value * slope(x);
      x = Number.isFinite(next) && Math.abs(next) < 100 ? next : x;
      steps++;
    };
    const stop = runner($("gd-one-d-run"), step, render, () => steps > 500 || Math.abs(slope(x)) < 0.0001);
    $("gd-one-d-step").onclick = () => {
      stop();
      step();
      render();
    };
    $("gd-one-d-reset").onclick = () => {
      stop();
      x = -2.2;
      steps = 0;
      render();
    };
    lr.oninput = render;
    redraw.push(render);
    render();
  }

  function initLandscape() {
    const [c, ctx] = canvas("gd-landscape-canvas");
    if (!c) return;
    const lr = $("gd-landscape-lr"),
      data = [
        [-1, -1.2],
        [-0.5, -0.35],
        [0, 0.55],
        [0.5, 1.2],
        [1, 2.15],
      ];
    const loss = (m, b) => data.reduce((s, [x, y]) => s + (m * x + b - y) ** 2, 0) / data.length;
    const grad = (m, b) =>
      data.reduce(
        (g, [x, y]) => {
          const e = m * x + b - y;
          return [g[0] + (2 * e * x) / data.length, g[1] + (2 * e) / data.length];
        },
        [0, 0]
      );
    const meanX = data.reduce((s, p) => s + p[0], 0) / data.length,
      meanY = data.reduce((s, p) => s + p[1], 0) / data.length;
    const optM = data.reduce((s, p) => s + (p[0] - meanX) * (p[1] - meanY), 0) / data.reduce((s, p) => s + (p[0] - meanX) ** 2, 0),
      optB = meanY - optM * meanX;
    let m, b, trail, steps;
    const X = (v) => ((v + 3) / 6) * c.width,
      Y = (v) => c.height - ((v + 3) / 6) * c.height;
    function render() {
      for (let yy = 0; yy < c.height; yy += 8)
        for (let xx = 0; xx < c.width; xx += 8) {
          const l = Math.min(1, loss(-3 + (6 * xx) / c.width, -3 + (6 * (c.height - yy)) / c.height) / 18);
          ctx.fillStyle = `rgba(238,138,48,${0.08 + l * 0.75})`;
          ctx.fillRect(xx, yy, 8, 8);
        }
      ctx.strokeStyle = theme.text;
      ctx.lineWidth = 2;
      ctx.beginPath();
      trail.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
      ctx.stroke();
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(X(m), Y(b), 7, 0, 7);
      ctx.fill();
      ctx.strokeStyle = theme.blue;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(X(optM) - 8, Y(optB) - 8);
      ctx.lineTo(X(optM) + 8, Y(optB) + 8);
      ctx.moveTo(X(optM) + 8, Y(optB) - 8);
      ctx.lineTo(X(optM) - 8, Y(optB) + 8);
      ctx.stroke();
      $("gd-landscape-lr-value").textContent = fmt(+lr.value, 3);
      $("gd-landscape-status").textContent =
        `step ${steps} · m ${fmt(m)} · b ${fmt(b)} · MSE ${fmt(loss(m, b), 4)} · optimum (${fmt(optM)}, ${fmt(optB)})`;
    }
    const step = () => {
      const g = grad(m, b),
        nm = m - +lr.value * g[0],
        nb = b - +lr.value * g[1];
      if (Number.isFinite(nm + nb) && Math.abs(nm) + Math.abs(nb) < 100) {
        m = nm;
        b = nb;
        trail.push([m, b]);
      }
      steps++;
    };
    const stop = runner($("gd-landscape-run"), step, render, () => steps > 500 || loss(m, b) < 0.002);
    const reset = () => {
      stop();
      m = -2.4;
      b = 2.5;
      trail = [[m, b]];
      steps = 0;
      render();
    };
    $("gd-landscape-step").onclick = () => {
      stop();
      step();
      render();
    };
    $("gd-landscape-reset").onclick = reset;
    lr.oninput = render;
    redraw.push(render);
    reset();
  }

  function initChain() {
    if (!$("gd-chain-demo")) return;
    const ids = ["x", "w", "b"],
      inputs = ids.map((x) => $("gd-chain-" + x)),
      target = $("gd-chain-target");
    function render() {
      const [x, w, b] = inputs.map((input) => Number(input.value)),
        y = +target.value,
        z = w * x + b,
        a = sigmoid(z),
        C = (a - y) ** 2,
        dCda = 2 * (a - y),
        dadz = a * (1 - a),
        dCdb = dCda * dadz,
        dCdw = dCdb * x;
      inputs.forEach((el, i) => ($(el.id + "-value").textContent = fmt([x, w, b][i], 1)));
      $("gd-chain-status").innerHTML =
        metric("z", fmt(z)) +
        metric("a", fmt(a)) +
        metric("C", fmt(C)) +
        metric("∂C/∂a", fmt(dCda)) +
        metric("∂a/∂z", fmt(dadz)) +
        metric("∂z/∂w = x", fmt(x)) +
        metric("∂C/∂w", fmt(dCdw)) +
        metric("∂C/∂b", fmt(dCdb));
    }
    [...inputs, target].forEach((x) => (x.oninput = render));
    render();
  }

  function initNetwork() {
    const [c, ctx] = canvas("gd-network-canvas");
    if (!c) return;
    const lr = $("gd-network-lr"),
      batch = $("gd-network-batch");
    let seed, net, data, index, steps, examplesSeen;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    function reset() {
      stop?.();
      seed = 20260606;
      data = Array.from({ length: 64 }, () => {
        const x = rand() * 2 - 1,
          y = rand() * 2 - 1;
        return [x, y, x * y > 0 ? 1 : 0];
      });
      net = {
        w1: Array.from({ length: 4 }, () => [rand() * 2 - 1, rand() * 2 - 1]),
        b1: [0, 0, 0, 0],
        w2: Array.from({ length: 4 }, () => rand() * 2 - 1),
        b2: 0,
      };
      index = 0;
      steps = 0;
      examplesSeen = 0;
      render();
    }
    const forward = (x, y) => {
      const h = net.w1.map((w, j) => Math.tanh(w[0] * x + w[1] * y + net.b1[j]));
      return { h, a: sigmoid(h.reduce((s, v, j) => s + v * net.w2[j], net.b2)) };
    };
    function stats() {
      let loss = 0,
        correct = 0;
      data.forEach(([x, y, t]) => {
        const a = forward(x, y).a;
        loss += -(t * Math.log(a + 1e-7) + (1 - t) * Math.log(1 - a + 1e-7));
        correct += a >= 0.5 == t;
      });
      return [loss / data.length, correct / data.length];
    }
    function step() {
      const n = Math.min(+batch.value, data.length),
        g = { w1: Array.from({ length: 4 }, () => [0, 0]), b1: [0, 0, 0, 0], w2: [0, 0, 0, 0], b2: 0 };
      for (let q = 0; q < n; q++) {
        const [x, y, t] = data[index++ % data.length],
          { h, a } = forward(x, y),
          dz = a - t;
        g.b2 += dz;
        for (let j = 0; j < 4; j++) {
          g.w2[j] += dz * h[j];
          const dh = dz * net.w2[j] * (1 - h[j] ** 2);
          g.w1[j][0] += dh * x;
          g.w1[j][1] += dh * y;
          g.b1[j] += dh;
        }
      }
      const rate = +lr.value / n;
      for (let j = 0; j < 4; j++) {
        net.w2[j] -= rate * g.w2[j];
        net.b1[j] -= rate * g.b1[j];
        net.w1[j][0] -= rate * g.w1[j][0];
        net.w1[j][1] -= rate * g.w1[j][1];
      }
      net.b2 -= rate * g.b2;
      steps++;
      examplesSeen += n;
      if (index >= data.length) {
        index %= data.length;
        for (let i = data.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [data[i], data[j]] = [data[j], data[i]];
        }
      }
      if (!Object.values(net).flat(3).every(Number.isFinite)) reset();
    }
    function render() {
      const grid = 25,
        cellW = c.width / grid,
        cellH = c.height / grid;
      for (let iy = 0; iy < grid; iy++)
        for (let ix = 0; ix < grid; ix++) {
          const a = forward((ix / (grid - 1)) * 2 - 1, 1 - (iy / (grid - 1)) * 2).a;
          ctx.fillStyle = `rgba(${Math.round(57 + (238 - 57) * a)},${Math.round(121 + (138 - 121) * a)},${Math.round(216 + (48 - 216) * a)},.42)`;
          ctx.fillRect(ix * cellW, iy * cellH, cellW + 1, cellH + 1);
        }
      data.forEach(([x, y, t]) => {
        ctx.fillStyle = t ? theme.orange : theme.blue;
        ctx.strokeStyle = theme.bg;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(((x + 1) / 2) * c.width, ((1 - y) / 2) * c.height, 6, 0, 7);
        ctx.fill();
        ctx.stroke();
      });
      const [s, a] = stats();
      $("gd-network-lr-value").textContent = fmt(+lr.value, 2);
      $("gd-network-status").innerHTML =
        metric("step", steps) +
        metric("epoch", fmt(examplesSeen / data.length, 1)) +
        metric("cross-entropy", fmt(s, 4)) +
        metric("accuracy", fmt(a * 100, 1) + "%");
    }
    let stop = runner(
      $("gd-network-run"),
      () => {
        for (let i = 0; i < 3; i++) step();
      },
      render,
      () => steps > 5000
    );
    $("gd-network-step").onclick = () => {
      stop();
      step();
      render();
    };
    $("gd-network-reset").onclick = reset;
    lr.oninput = render;
    batch.oninput = render;
    redraw.push(render);
    reset();
  }

  readTheme();
  initBoundary();
  initActivation();
  initCost();
  initOneD();
  initLandscape();
  initChain();
  initNetwork();
  new MutationObserver(() => {
    readTheme();
    redraw.forEach((fn) => fn());
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
});
