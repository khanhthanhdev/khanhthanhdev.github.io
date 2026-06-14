/**
 * Interactive Gradient Descent Simulation
 * With loss contour, weight trajectory, gradient magnitude charts
 */

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements ---
  const canvas = document.getElementById("ml-canvas");
  const ctx = canvas.getContext("2d");
  const contourCanvas = document.getElementById("contour-canvas");
  const contourCtx = contourCanvas.getContext("2d");

  const btnStep = document.getElementById("btn-step");
  const btnRun = document.getElementById("btn-run");
  const btnClosedForm = document.getElementById("btn-closed-form");
  const btnReset = document.getElementById("btn-reset");
  const btnClear = document.getElementById("btn-clear");

  const sliderLr = document.getElementById("slider-lr");
  const valLr = document.getElementById("val-lr");
  const sliderSpeed = document.getElementById("slider-speed");
  const valSpeed = document.getElementById("val-speed");

  const metricEpoch = document.getElementById("metric-epoch");
  const metricLoss = document.getElementById("metric-loss");
  const metricM = document.getElementById("metric-m");
  const metricB = document.getElementById("metric-b");

  const selectPreset = document.getElementById("select-preset");

  // --- State ---
  let points = [];
  let w1 = 0.0;
  let w0 = 0.0;
  let epoch = 0;
  let lossHistory = [];
  let weightHistory = []; // [{w1, w0}]
  let gradMagHistory = [];

  let isTraining = false;
  let animationFrameId = null;
  let lossChart = null;
  let weightChart = null;
  let gradChart = null;

  // --- Theme ---
  let themeColor = "#ff5722";
  let textColor = "#212121";
  let dividerColor = "#e0e0e0";
  let bgColor = "#ffffff";
  let isDark = false;

  canvas.width = 800;
  canvas.height = 450;
  contourCanvas.width = 400;
  contourCanvas.height = 400;

  function readTheme() {
    const s = getComputedStyle(document.documentElement);
    themeColor = s.getPropertyValue("--global-theme-color").trim() || "#ff5722";
    textColor = s.getPropertyValue("--global-text-color").trim() || "#212121";
    dividerColor = s.getPropertyValue("--global-divider-color").trim() || "#e0e0e0";
    bgColor = s.getPropertyValue("--global-bg-color").trim() || "#ffffff";
    isDark = document.documentElement.getAttribute("data-theme") === "dark";
  }

  function hexToRgba(hex, a) {
    let c;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
      c = hex.substring(1).split("");
      if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
      c = "0x" + c.join("");
      return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
    }
    return hex;
  }

  function updateTheme() {
    readTheme();
    [lossChart, weightChart, gradChart].forEach((ch) => {
      if (!ch) return;
      ch.options.scales.x.grid.color = dividerColor;
      ch.options.scales.y.grid.color = dividerColor;
      ch.options.scales.x.ticks.color = textColor;
      ch.options.scales.y.ticks.color = textColor;
      if (ch.options.scales.x.title) ch.options.scales.x.title.color = textColor;
      if (ch.options.scales.y.title) ch.options.scales.y.title.color = textColor;
      ch.options.plugins.legend.labels.color = textColor;
    });
    if (lossChart) {
      lossChart.data.datasets[0].borderColor = themeColor;
      lossChart.data.datasets[0].backgroundColor = hexToRgba(themeColor, 0.12);
    }
    if (weightChart) {
      weightChart.data.datasets[0].borderColor = themeColor;
      weightChart.data.datasets[1].borderColor = "#2196f3";
    }
    if (gradChart) {
      gradChart.data.datasets[0].borderColor = "#9c27b0";
      gradChart.data.datasets[0].backgroundColor = "rgba(156,39,176,0.12)";
    }
    [lossChart, weightChart, gradChart].forEach((ch) => ch && ch.update("none"));
    draw();
    drawContour();
  }

  // --- Coordinate Mapping ---
  function toCanvas(mx, my) {
    const p = 50;
    const w = canvas.width - 2 * p;
    const h = canvas.height - 2 * p;
    return { x: p + (mx / 10) * w, y: p + h - (my / 10) * h };
  }

  function toMath(cx, cy) {
    const p = 50;
    const w = canvas.width - 2 * p;
    const h = canvas.height - 2 * p;
    return {
      x: Math.max(0, Math.min(10, ((cx - p) / w) * 10)),
      y: Math.max(0, Math.min(10, ((p + h - cy) / h) * 10)),
    };
  }

  // --- Closed-form (Normal Equation) ---
  function closedForm() {
    if (points.length < 2) return null;
    const n = points.length;
    let sx = 0,
      sy = 0,
      sxx = 0,
      sxy = 0;
    points.forEach((p) => {
      sx += p.x;
      sy += p.y;
      sxx += p.x * p.x;
      sxy += p.x * p.y;
    });
    const d = n * sxx - sx * sx;
    if (Math.abs(d) < 1e-9) return null;
    return { w1: (n * sxy - sx * sy) / d, w0: (sxx * sy - sx * sxy) / d };
  }

  // --- Draw main canvas ---
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const p = 50;
    const w = canvas.width - 2 * p;
    const h = canvas.height - 2 * p;

    // Grid
    ctx.strokeStyle = dividerColor;
    ctx.lineWidth = 1;
    ctx.fillStyle = textColor;
    ctx.font = "11px sans-serif";
    for (let i = 0; i <= 10; i++) {
      const sx = toCanvas(i, 0),
        ex = toCanvas(i, 10);
      ctx.beginPath();
      ctx.moveTo(sx.x, sx.y);
      ctx.lineTo(ex.x, ex.y);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(i, sx.x, sx.y + 6);

      const sy = toCanvas(0, i),
        ey = toCanvas(10, i);
      ctx.beginPath();
      ctx.moveTo(sy.x, sy.y);
      ctx.lineTo(ey.x, ey.y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(i, sy.x - 6, sy.y);
    }

    // Axes
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p, p);
    ctx.lineTo(p, p + h);
    ctx.lineTo(p + w, p + h);
    ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("x", p + w / 2, p + h + 22);
    ctx.save();
    ctx.translate(12, p + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("y", 0, 0);
    ctx.restore();

    // Closed-form line (dashed blue)
    const cf = closedForm();
    if (cf) {
      ctx.save();
      ctx.strokeStyle = "#2196f3";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      const a = toCanvas(0, cf.w0),
        b2 = toCanvas(10, cf.w1 * 10 + cf.w0);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.stroke();
      ctx.restore();
    }

    // GD line (solid theme)
    if (points.length > 0 || w1 !== 0 || w0 !== 0) {
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 2.5;
      const a = toCanvas(0, w0),
        b2 = toCanvas(10, w1 * 10 + w0);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.stroke();

      // Residuals
      if (points.length < 60) {
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        points.forEach((pt) => {
          const py = w1 * pt.x + w0;
          const c1 = toCanvas(pt.x, pt.y),
            c2 = toCanvas(pt.x, py);
          ctx.beginPath();
          ctx.moveTo(c1.x, c1.y);
          ctx.lineTo(c2.x, c2.y);
          ctx.stroke();
        });
        ctx.setLineDash([]);
      }
    }

    // Points
    points.forEach((pt) => {
      const c = toCanvas(pt.x, pt.y);
      ctx.fillStyle = themeColor;
      ctx.strokeStyle = isDark ? "#fff" : "#333";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  // --- Loss Contour with GD Path ---
  function computeLossAt(mw1, mw0) {
    if (points.length === 0) return 0;
    let s = 0;
    points.forEach((pt) => {
      const e = mw1 * pt.x + mw0 - pt.y;
      s += e * e;
    });
    return s / points.length;
  }

  function drawContour() {
    const cw = contourCanvas.width,
      ch = contourCanvas.height;
    contourCtx.clearRect(0, 0, cw, ch);

    if (points.length < 2) {
      contourCtx.fillStyle = textColor;
      contourCtx.font = "13px sans-serif";
      contourCtx.textAlign = "center";
      contourCtx.fillText("Add ≥ 2 points to see loss surface", cw / 2, ch / 2);
      return;
    }

    const cf = closedForm();
    const centerW1 = cf ? cf.w1 : 0;
    const centerW0 = cf ? cf.w0 : 0;
    const rangeW1 = 3;
    const rangeW0 = 4;
    const w1Min = centerW1 - rangeW1,
      w1Max = centerW1 + rangeW1;
    const w0Min = centerW0 - rangeW0,
      w0Max = centerW0 + rangeW0;

    // Compute loss grid
    const res = 100;
    const losses = [];
    let maxL = 0;
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const mw1 = w1Min + (i / (res - 1)) * (w1Max - w1Min);
        const mw0 = w0Min + (j / (res - 1)) * (w0Max - w0Min);
        const l = computeLossAt(mw1, mw0);
        losses.push(l);
        if (l > maxL) maxL = l;
      }
    }

    // Draw heatmap
    const imgData = contourCtx.createImageData(res, res);
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const l = losses[j * res + i];
        const t = Math.min(1, Math.sqrt(l / (maxL + 1e-6)));
        const idx = (j * res + i) * 4;
        if (isDark) {
          imgData.data[idx] = Math.floor(30 + t * 180);
          imgData.data[idx + 1] = Math.floor(30 + (1 - t) * 100);
          imgData.data[idx + 2] = Math.floor(60 + (1 - t) * 140);
        } else {
          imgData.data[idx] = Math.floor(240 - t * 200);
          imgData.data[idx + 1] = Math.floor(248 - t * 200);
          imgData.data[idx + 2] = 255;
        }
        imgData.data[idx + 3] = 255;
      }
    }

    // Scale up
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = res;
    tmpCanvas.height = res;
    tmpCanvas.getContext("2d").putImageData(imgData, 0, 0);
    contourCtx.imageSmoothingEnabled = true;
    contourCtx.drawImage(tmpCanvas, 0, 0, cw, ch);

    // Axis labels
    contourCtx.fillStyle = textColor;
    contourCtx.font = "11px sans-serif";
    contourCtx.textAlign = "center";
    contourCtx.fillText(`w₁: [${w1Min.toFixed(1)}, ${w1Max.toFixed(1)}]`, cw / 2, ch - 4);
    contourCtx.save();
    contourCtx.translate(10, ch / 2);
    contourCtx.rotate(-Math.PI / 2);
    contourCtx.fillText(`w₀: [${w0Min.toFixed(1)}, ${w0Max.toFixed(1)}]`, 0, 0);
    contourCtx.restore();

    // Helper to convert param space -> pixel
    function toPixel(mw1v, mw0v) {
      return {
        x: ((mw1v - w1Min) / (w1Max - w1Min)) * cw,
        y: ((mw0v - w0Min) / (w0Max - w0Min)) * ch,
      };
    }

    // Optimal point
    if (cf) {
      const op = toPixel(cf.w1, cf.w0);
      contourCtx.fillStyle = "#2196f3";
      contourCtx.beginPath();
      contourCtx.arc(op.x, op.y, 6, 0, Math.PI * 2);
      contourCtx.fill();
      contourCtx.strokeStyle = "#fff";
      contourCtx.lineWidth = 1.5;
      contourCtx.beginPath();
      contourCtx.arc(op.x, op.y, 6, 0, Math.PI * 2);
      contourCtx.stroke();
    }

    // GD path
    if (weightHistory.length > 1) {
      contourCtx.strokeStyle = themeColor;
      contourCtx.lineWidth = 1.5;
      contourCtx.beginPath();
      const first = toPixel(weightHistory[0].w1, weightHistory[0].w0);
      contourCtx.moveTo(first.x, first.y);
      for (let i = 1; i < weightHistory.length; i++) {
        const pt = toPixel(weightHistory[i].w1, weightHistory[i].w0);
        contourCtx.lineTo(pt.x, pt.y);
      }
      contourCtx.stroke();

      // Current position marker
      const last = weightHistory[weightHistory.length - 1];
      const lp = toPixel(last.w1, last.w0);
      contourCtx.fillStyle = themeColor;
      contourCtx.beginPath();
      contourCtx.arc(lp.x, lp.y, 4, 0, Math.PI * 2);
      contourCtx.fill();
    } else {
      // Draw starting point
      const sp = toPixel(w1, w0);
      contourCtx.fillStyle = themeColor;
      contourCtx.beginPath();
      contourCtx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
      contourCtx.fill();
    }
  }

  // --- ML Math ---
  function calcLoss() {
    if (points.length === 0) return 0;
    let s = 0;
    points.forEach((pt) => {
      const e = w1 * pt.x + w0 - pt.y;
      s += e * e;
    });
    return s / points.length;
  }

  function trainStep() {
    if (points.length === 0) return;
    const lr = parseFloat(sliderLr.value);
    let dw1 = 0,
      dw0 = 0;
    const n = points.length;
    points.forEach((pt) => {
      const diff = w1 * pt.x + w0 - pt.y;
      dw1 += pt.x * diff;
      dw0 += diff;
    });
    dw1 = (2 / n) * dw1;
    dw0 = (2 / n) * dw0;

    w1 -= lr * dw1;
    w0 -= lr * dw0;
    epoch++;

    const loss = calcLoss();
    const gradMag = Math.sqrt(dw1 * dw1 + dw0 * dw0);
    lossHistory.push(loss);
    weightHistory.push({ w1, w0 });
    gradMagHistory.push(gradMag);

    updateMetrics(loss);
    updateCharts();
  }

  function updateMetrics(loss) {
    metricEpoch.textContent = epoch;
    metricLoss.textContent = loss.toFixed(4);
    metricM.textContent = w1.toFixed(3);
    metricB.textContent = w0.toFixed(3);
  }

  function updateCharts() {
    const maxPts = 400;
    const skip = lossHistory.length > maxPts ? Math.ceil(lossHistory.length / maxPts) : 1;

    function thin(arr) {
      if (skip === 1) return arr;
      return arr.filter((_, i) => i % skip === 0);
    }

    const labels = thin(lossHistory.map((_, i) => i + 1));
    lossChart.data.labels = labels;
    lossChart.data.datasets[0].data = thin(lossHistory);
    lossChart.update("none");

    weightChart.data.labels = labels;
    weightChart.data.datasets[0].data = thin(weightHistory.map((w) => w.w1));
    weightChart.data.datasets[1].data = thin(weightHistory.map((w) => w.w0));
    weightChart.update("none");

    gradChart.data.labels = labels;
    gradChart.data.datasets[0].data = thin(gradMagHistory);
    gradChart.update("none");
  }

  // --- Animation ---
  let lastTime = 0;
  function loop(ts) {
    if (!isTraining) return;
    const interval = 1000 / parseInt(sliderSpeed.value);
    if (ts - lastTime >= interval) {
      trainStep();
      draw();
      if (epoch % 10 === 0) drawContour();
      lastTime = ts;
    }
    animationFrameId = requestAnimationFrame(loop);
  }

  function startTraining() {
    if (points.length === 0) return alert("Add data points first.");
    isTraining = true;
    btnRun.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
    btnRun.classList.remove("playground-btn-primary");
    btnRun.classList.add("playground-btn-secondary");
    lastTime = performance.now();
    animationFrameId = requestAnimationFrame(loop);
  }

  function stopTraining() {
    isTraining = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    btnRun.innerHTML = '<i class="fa-solid fa-play"></i> Run GD';
    btnRun.classList.add("playground-btn-primary");
    btnRun.classList.remove("playground-btn-secondary");
    drawContour(); // Final contour update
  }

  function resetModel() {
    stopTraining();
    w1 = 0;
    w0 = 0;
    epoch = 0;
    lossHistory = [];
    weightHistory = [];
    gradMagHistory = [];
    weightHistory.push({ w1: 0, w0: 0 });
    updateMetrics(calcLoss());
    updateCharts();
    draw();
    drawContour();
  }

  function clearAll() {
    stopTraining();
    points = [];
    w1 = 0;
    w0 = 0;
    epoch = 0;
    lossHistory = [];
    weightHistory = [];
    gradMagHistory = [];
    updateMetrics(0);
    updateCharts();
    draw();
    drawContour();
  }

  // --- Interactions ---
  canvas.addEventListener("mousedown", (e) => {
    const r = canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left) * (canvas.width / r.width);
    const cy = (e.clientY - r.top) * (canvas.height / r.height);
    const m = toMath(cx, cy);

    const idx = points.findIndex((pt) => Math.hypot(pt.x - m.x, pt.y - m.y) < 0.35);
    if (idx !== -1) points.splice(idx, 1);
    else points.push(m);

    if (isTraining) stopTraining();
    epoch = 0;
    lossHistory = [];
    weightHistory = [{ w1, w0 }];
    gradMagHistory = [];
    updateMetrics(calcLoss());
    updateCharts();
    draw();
    drawContour();
  });

  btnStep.addEventListener("click", () => {
    stopTraining();
    if (!points.length) return;
    trainStep();
    draw();
    drawContour();
  });
  btnRun.addEventListener("click", () => {
    isTraining ? stopTraining() : startTraining();
  });
  btnClosedForm.addEventListener("click", () => {
    stopTraining();
    const sol = closedForm();
    if (!sol) return alert("Need ≥ 2 non-collinear points.");
    w1 = sol.w1;
    w0 = sol.w0;
    epoch = 0;
    lossHistory = [];
    weightHistory = [{ w1, w0 }];
    gradMagHistory = [];
    updateMetrics(calcLoss());
    updateCharts();
    draw();
    drawContour();
  });
  btnReset.addEventListener("click", resetModel);
  btnClear.addEventListener("click", clearAll);

  sliderLr.addEventListener("input", () => {
    valLr.textContent = sliderLr.value;
  });
  sliderSpeed.addEventListener("input", () => {
    valSpeed.textContent = sliderSpeed.value;
  });

  // --- Presets ---
  const presets = {
    clean: [
      { x: 1, y: 1.5 },
      { x: 2, y: 2.3 },
      { x: 3, y: 3.1 },
      { x: 4, y: 4.2 },
      { x: 5, y: 5.0 },
      { x: 6, y: 5.8 },
      { x: 7, y: 6.9 },
      { x: 8, y: 7.7 },
      { x: 9, y: 8.5 },
    ],
    noisy: [
      { x: 1, y: 2.5 },
      { x: 1.5, y: 1.2 },
      { x: 2.5, y: 3.6 },
      { x: 3.2, y: 2.1 },
      { x: 4, y: 4.8 },
      { x: 5, y: 3.9 },
      { x: 5.8, y: 6.2 },
      { x: 6.5, y: 5.1 },
      { x: 7.2, y: 7.8 },
      { x: 8.5, y: 6.9 },
      { x: 9, y: 8.8 },
    ],
    outliers: [
      { x: 1, y: 1.5 },
      { x: 2, y: 2.2 },
      { x: 3, y: 2.9 },
      { x: 4, y: 3.8 },
      { x: 5, y: 4.5 },
      { x: 6, y: 5.2 },
      { x: 7, y: 6.1 },
      { x: 2, y: 8.5 },
      { x: 8, y: 1.2 },
    ],
  };

  selectPreset.addEventListener("change", () => {
    const v = selectPreset.value;
    if (v && presets[v]) {
      clearAll();
      points = JSON.parse(JSON.stringify(presets[v]));
      weightHistory = [{ w1: 0, w0: 0 }];
      updateMetrics(calcLoss());
      updateCharts();
      draw();
      drawContour();
    }
  });

  // --- Chart.js Initialization ---
  function makeChartOpts(xLabel, yLabel) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: textColor, font: { size: 11 } } } },
      scales: {
        x: { title: { display: true, text: xLabel, color: textColor }, grid: { color: dividerColor }, ticks: { color: textColor, maxTicksLimit: 8 } },
        y: {
          title: { display: true, text: yLabel, color: textColor },
          grid: { color: dividerColor },
          ticks: { color: textColor },
          beginAtZero: true,
        },
      },
    };
  }

  lossChart = new Chart(document.getElementById("loss-chart").getContext("2d"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "MSE Loss",
          data: [],
          borderColor: themeColor,
          backgroundColor: hexToRgba(themeColor, 0.12),
          borderWidth: 1.5,
          fill: true,
          pointRadius: 0,
          tension: 0.1,
        },
      ],
    },
    options: makeChartOpts("Epoch", "Loss"),
  });

  weightChart = new Chart(document.getElementById("weight-chart").getContext("2d"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "w₁ (slope)", data: [], borderColor: themeColor, borderWidth: 1.5, pointRadius: 0, tension: 0.1, fill: false },
        { label: "w₀ (bias)", data: [], borderColor: "#2196f3", borderWidth: 1.5, pointRadius: 0, tension: 0.1, fill: false },
      ],
    },
    options: makeChartOpts("Epoch", "Value"),
  });

  gradChart = new Chart(document.getElementById("grad-chart").getContext("2d"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "‖∇L‖",
          data: [],
          borderColor: "#9c27b0",
          backgroundColor: "rgba(156,39,176,0.12)",
          borderWidth: 1.5,
          fill: true,
          pointRadius: 0,
          tension: 0.1,
        },
      ],
    },
    options: makeChartOpts("Epoch", "Gradient Magnitude"),
  });

  // --- Init ---
  points = JSON.parse(JSON.stringify(presets.noisy));
  weightHistory = [{ w1: 0, w0: 0 }];

  setTimeout(() => {
    updateTheme();
  }, 80);

  const obs = new MutationObserver(() => updateTheme());
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
});
