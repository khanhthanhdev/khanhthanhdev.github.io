document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("ml-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const runButton = document.getElementById("btn-run");
  const stepButton = document.getElementById("btn-step");
  const resetButton = document.getElementById("btn-reset");
  const lrInput = document.getElementById("slider-lr");
  const noiseInput = document.getElementById("slider-noise");
  const lrValue = document.getElementById("val-lr");
  const noiseValue = document.getElementById("val-noise");
  const metricEpoch = document.getElementById("metric-epoch");
  const metricLoss = document.getElementById("metric-loss");
  const metricM = document.getElementById("metric-m");
  const metricB = document.getElementById("metric-b");

  let points = [];
  let model = { m: -0.8, b: 8.3 };
  let optimum = { m: 0, b: 0 };
  let epoch = 0;
  let running = false;
  let raf = null;
  let theme = {};

  canvas.width = 920;
  canvas.height = 430;

  function readTheme() {
    const s = getComputedStyle(document.documentElement);
    theme = {
      accent: s.getPropertyValue("--global-theme-color").trim() || "#ff5722",
      text: s.getPropertyValue("--global-text-color").trim() || "#222",
      muted: s.getPropertyValue("--global-text-color-light").trim() || "#666",
      border: s.getPropertyValue("--global-divider-color").trim() || "#ddd",
      bg: s.getPropertyValue("--global-bg-color").trim() || "#fff",
      card: s.getPropertyValue("--global-card-bg").trim() || "#fff",
      opt: "#2196f3",
    };
  }

  function fmt(value, digits = 3) {
    return Number.isFinite(value) ? value.toFixed(digits) : "diverged";
  }

  function noise(seed) {
    return (Math.sin(seed * 12.9898) * 43758.5453) % 1;
  }

  function makeData() {
    const amount = Number(noiseInput.value);
    points = Array.from({ length: 16 }, (_, i) => {
      const x = 0.75 + i * 0.58;
      return { x, y: 1.7 + 0.62 * x + (noise(i + 3) - 0.5) * amount * 2.2 };
    });
    optimum = closedForm();
    resetModel();
  }

  function closedForm() {
    const n = points.length;
    const sx = points.reduce((sum, p) => sum + p.x, 0);
    const sy = points.reduce((sum, p) => sum + p.y, 0);
    const sxx = points.reduce((sum, p) => sum + p.x * p.x, 0);
    const sxy = points.reduce((sum, p) => sum + p.x * p.y, 0);
    const d = n * sxx - sx * sx;
    return { m: (n * sxy - sx * sy) / d, b: (sxx * sy - sx * sxy) / d };
  }

  function loss() {
    return points.reduce((sum, p) => sum + (model.m * p.x + model.b - p.y) ** 2, 0) / points.length;
  }

  function trainStep() {
    const lr = Number(lrInput.value);
    let dm = 0;
    let db = 0;

    for (const p of points) {
      const err = model.m * p.x + model.b - p.y;
      dm += err * p.x;
      db += err;
    }

    model.m -= lr * (2 / points.length) * dm;
    model.b -= lr * (2 / points.length) * db;
    epoch += 1;
    render();
  }

  function resetModel() {
    stop();
    model = { m: -0.8, b: 8.3 };
    epoch = 0;
    render();
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    runButton.innerHTML = '<i class="fa-solid fa-play"></i> Run';
    raf = null;
  }

  function tick() {
    if (!running) return;
    for (let i = 0; i < 4; i++) trainStep();
    const currentLoss = loss();
    if (epoch >= 1200 || currentLoss < 0.001 || !Number.isFinite(currentLoss) || currentLoss > 1000000) {
      stop();
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function line(modelLike) {
    return {
      x1: plotX(0),
      y1: plotY(modelLike.b),
      x2: plotX(10),
      y2: plotY(modelLike.m * 10 + modelLike.b),
    };
  }

  const pad = { top: 24, right: 28, bottom: 44, left: 50 };
  const plotW = canvas.width - pad.left - pad.right;
  const plotH = canvas.height - pad.top - pad.bottom;
  const plotX = (x) => pad.left + (x / 10) * plotW;
  const plotY = (y) => pad.top + plotH - (y / 10) * plotH;

  function render() {
    readTheme();
    lrValue.textContent = fmt(Number(lrInput.value), 3);
    noiseValue.textContent = fmt(Number(noiseInput.value), 2);
    metricEpoch.textContent = String(epoch);
    metricLoss.textContent = fmt(loss(), 3);
    metricM.textContent = fmt(model.m, 3);
    metricB.textContent = fmt(model.b, 3);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = theme.border;
    ctx.fillStyle = theme.muted;
    ctx.lineWidth = 1;
    ctx.font = "12px sans-serif";
    for (let i = 0; i <= 10; i += 1) {
      ctx.beginPath();
      ctx.moveTo(plotX(i), pad.top);
      ctx.lineTo(plotX(i), pad.top + plotH);
      ctx.moveTo(pad.left, plotY(i));
      ctx.lineTo(pad.left + plotW, plotY(i));
      ctx.stroke();
      ctx.fillText(String(i), plotX(i) - 3, pad.top + plotH + 20);
      ctx.fillText(String(i), pad.left - 25, plotY(i) + 4);
    }

    ctx.strokeStyle = theme.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.stroke();

    drawResiduals();
    drawLine(optimum, theme.opt, [8, 6], 2);
    drawLine(model, theme.accent, [], 3);

    for (const p of points) {
      ctx.beginPath();
      ctx.fillStyle = theme.text;
      ctx.strokeStyle = theme.bg;
      ctx.lineWidth = 2;
      ctx.arc(plotX(p.x), plotY(p.y), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawLine(modelLike, color, dash, width) {
    const l = line(modelLike);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();
    ctx.restore();
  }

  function drawResiduals() {
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1.5;
    for (const p of points) {
      ctx.beginPath();
      ctx.moveTo(plotX(p.x), plotY(p.y));
      ctx.lineTo(plotX(p.x), plotY(model.m * p.x + model.b));
      ctx.stroke();
    }
  }

  runButton.addEventListener("click", () => {
    running = !running;
    runButton.innerHTML = running ? '<i class="fa-solid fa-pause"></i> Pause' : '<i class="fa-solid fa-play"></i> Run';
    if (running) tick();
  });
  stepButton.addEventListener("click", () => {
    stop();
    trainStep();
  });
  resetButton.addEventListener("click", makeData);
  lrInput.addEventListener("input", render);
  noiseInput.addEventListener("input", makeData);

  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  makeData();
});
