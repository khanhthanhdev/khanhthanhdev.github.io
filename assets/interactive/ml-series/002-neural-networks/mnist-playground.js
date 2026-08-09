(() => {
  "use strict";

  const IMAGE_URL = "https://storage.googleapis.com/learnjs-data/model-builder/mnist_images.png";
  const LABEL_URL = "https://storage.googleapis.com/learnjs-data/model-builder/mnist_labels_uint8";
  const IMAGE_SIZE = 28 * 28;
  const CLASS_COUNT = 10;
  const ROC_COLORS = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#4f46e5", "#65a30d", "#c026d3"];

  const elements = {
    trainingSplit: document.querySelector("#training-split"),
    trainingSplitValue: document.querySelector("#training-split-value"),
    sampleCount: document.querySelector("#sample-count"),
    layerSizes: document.querySelector("#layer-sizes"),
    activation: document.querySelector("#activation"),
    outputActivation: document.querySelector("#output-activation"),
    cost: document.querySelector("#cost"),
    learningRate: document.querySelector("#learning-rate"),
    momentum: document.querySelector("#momentum"),
    batchSize: document.querySelector("#batch-size"),
    epochs: document.querySelector("#epochs"),
    train: document.querySelector("#train"),
    stop: document.querySelector("#stop"),
    status: document.querySelector("#status"),
    metricEpoch: document.querySelector("#metric-epoch"),
    metricTrain: document.querySelector("#metric-train"),
    metricValidation: document.querySelector("#metric-validation"),
    metricLoss: document.querySelector("#metric-loss"),
    metricAuc: document.querySelector("#metric-auc"),
    chart: document.querySelector("#metrics-chart"),
    chartDescription: document.querySelector("#chart-description"),
    chartLegend: document.querySelector("#chart-legend"),
    chartTabs: [...document.querySelectorAll(".chart-tab")],
    drawingBoard: document.querySelector("#drawing-board"),
    clearDrawing: document.querySelector("#clear-drawing"),
    prediction: document.querySelector("#prediction"),
    probabilities: document.querySelector("#probabilities"),
  };

  const state = {
    rawImages: null,
    rawLabels: null,
    loadedCount: 0,
    model: null,
    training: false,
    history: [],
    roc: [],
    chartView: "accuracy",
    predictionTimer: null,
  };

  function setStatus(message, error = false) {
    elements.status.textContent = message;
    elements.status.dataset.state = error ? "error" : "normal";
  }

  function percent(value, digits = 1) {
    return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "—";
  }

  function readNumber(input, minimum, maximum, name) {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
    }
    return value;
  }

  function readSettings() {
    const layers = elements.layerSizes.value
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value));

    if (layers.length < 2 || layers[0] !== IMAGE_SIZE || layers.at(-1) !== CLASS_COUNT) {
      throw new Error("Layer sizes must begin with 784 and end with 10.");
    }
    if (layers.length > 5 || layers.some((size) => !Number.isInteger(size) || size < 1 || size > 784)) {
      throw new Error("Use at most three hidden layers, each containing 1–784 units.");
    }

    return {
      layers,
      trainingSplit: Number(elements.trainingSplit.value) / 100,
      sampleCount: Number(elements.sampleCount.value),
      activation: elements.activation.value,
      outputActivation: elements.outputActivation.value,
      cost: elements.cost.value,
      learningRate: readNumber(elements.learningRate, 0.0001, 1, "Learning rate"),
      momentum: readNumber(elements.momentum, 0, 0.99, "Momentum"),
      batchSize: Number(elements.batchSize.value),
      epochs: readNumber(elements.epochs, 1, 20, "Epochs"),
    };
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("The MNIST image file could not be downloaded."));
      image.src = url;
    });
  }

  async function loadData(requiredCount) {
    if (state.loadedCount >= requiredCount) return;
    setStatus("Downloading the MNIST images and labels…");

    const [image, labelResponse] = await Promise.all([loadImage(IMAGE_URL), fetch(LABEL_URL)]);
    if (!labelResponse.ok) throw new Error(`The MNIST labels request failed (${labelResponse.status}).`);
    const allLabels = new Uint8Array(await labelResponse.arrayBuffer());
    const images = new Float32Array(requiredCount * IMAGE_SIZE);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const chunkSize = 1000;
    canvas.width = image.width;

    for (let start = 0; start < requiredCount; start += chunkSize) {
      const count = Math.min(chunkSize, requiredCount - start);
      canvas.height = count;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, start, image.width, count, 0, 0, image.width, count);
      const pixels = context.getImageData(0, 0, image.width, count).data;
      const targetOffset = start * IMAGE_SIZE;
      for (let i = 0; i < count * IMAGE_SIZE; i += 1) {
        images[targetOffset + i] = pixels[i * 4] / 255;
      }
      setStatus(`Preparing MNIST examples… ${Math.round(((start + count) / requiredCount) * 100)}%`);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    state.rawImages = images;
    state.rawLabels = allLabels.slice(0, requiredCount * CLASS_COUNT);
    state.loadedCount = requiredCount;
  }

  function createModel(settings) {
    const model = tf.sequential();
    const hidden = settings.layers.slice(1, -1);

    hidden.forEach((units, index) => {
      model.add(
        tf.layers.dense({
          units,
          activation: settings.activation,
          inputShape: index === 0 ? [IMAGE_SIZE] : undefined,
          kernelInitializer: "glorotUniform",
        })
      );
    });
    model.add(
      tf.layers.dense({
        units: CLASS_COUNT,
        activation: settings.outputActivation,
        inputShape: hidden.length === 0 ? [IMAGE_SIZE] : undefined,
      })
    );
    model.compile({
      optimizer: tf.train.momentum(settings.learningRate, settings.momentum),
      loss: settings.cost,
      metrics: ["accuracy"],
    });
    return model;
  }

  function makeDataset(settings) {
    return tf.tidy(() => {
      const xs = tf.tensor2d(state.rawImages.subarray(0, settings.sampleCount * IMAGE_SIZE), [settings.sampleCount, IMAGE_SIZE]);
      const ys = tf.tensor2d(state.rawLabels.subarray(0, settings.sampleCount * CLASS_COUNT), [settings.sampleCount, CLASS_COUNT]);
      const indices = tf.tensor1d(Int32Array.from(tf.util.createShuffledIndices(settings.sampleCount)), "int32");
      const shuffledX = tf.gather(xs, indices);
      const shuffledY = tf.gather(ys, indices);
      const trainCount = Math.floor(settings.sampleCount * settings.trainingSplit);
      return {
        trainX: shuffledX.slice([0, 0], [trainCount, IMAGE_SIZE]),
        trainY: shuffledY.slice([0, 0], [trainCount, CLASS_COUNT]),
        validationX: shuffledX.slice([trainCount, 0], [settings.sampleCount - trainCount, IMAGE_SIZE]),
        validationY: shuffledY.slice([trainCount, 0], [settings.sampleCount - trainCount, CLASS_COUNT]),
      };
    });
  }

  function metric(logs, ...names) {
    for (const name of names) {
      if (Number.isFinite(logs[name])) return logs[name];
    }
    return NaN;
  }

  async function calculateRoc(model, xs, ys) {
    setStatus("Calculating one-vs-rest ROC curves…");
    const predictionTensor = model.predict(xs);
    const [predictions, labels] = await Promise.all([predictionTensor.array(), ys.array()]);
    predictionTensor.dispose();

    return Array.from({ length: CLASS_COUNT }, (_, digit) => {
      const pairs = predictions.map((row, index) => ({ score: row[digit], positive: labels[index][digit] === 1 }));
      pairs.sort((a, b) => b.score - a.score);
      const positives = pairs.reduce((sum, pair) => sum + Number(pair.positive), 0);
      const negatives = pairs.length - positives;
      let truePositives = 0;
      let falsePositives = 0;
      let previousFpr = 0;
      let previousTpr = 0;
      let auc = 0;
      const points = [{ x: 0, y: 0 }];

      pairs.forEach((pair, index) => {
        if (pair.positive) truePositives += 1;
        else falsePositives += 1;
        const fpr = falsePositives / negatives;
        const tpr = truePositives / positives;
        auc += (fpr - previousFpr) * (tpr + previousTpr) * 0.5;
        previousFpr = fpr;
        previousTpr = tpr;
        if (index % Math.max(1, Math.floor(pairs.length / 150)) === 0 || index === pairs.length - 1) points.push({ x: fpr, y: tpr });
      });
      return { digit, auc, points };
    });
  }

  function resetMetrics(settings) {
    state.history = [];
    state.roc = [];
    elements.metricEpoch.textContent = `0 / ${settings.epochs}`;
    elements.metricTrain.textContent = "—";
    elements.metricValidation.textContent = "—";
    elements.metricLoss.textContent = "—";
    elements.metricAuc.textContent = "—";
    drawChart();
  }

  async function train() {
    if (state.training) return;
    let settings;
    try {
      settings = readSettings();
    } catch (error) {
      setStatus(error.message, true);
      return;
    }

    state.training = true;
    elements.train.disabled = true;
    elements.stop.disabled = false;
    resetMetrics(settings);
    let dataset;

    try {
      await tf.ready();
      await loadData(settings.sampleCount);
      dataset = makeDataset(settings);
      if (state.model) state.model.dispose();
      state.model = createModel(settings);
      setStatus(`Training ${settings.layers.join(" → ")} on ${dataset.trainX.shape[0].toLocaleString()} examples…`);

      await state.model.fit(dataset.trainX, dataset.trainY, {
        epochs: settings.epochs,
        batchSize: settings.batchSize,
        validationData: [dataset.validationX, dataset.validationY],
        shuffle: true,
        callbacks: {
          onEpochEnd: async (epoch, logs) => {
            const entry = {
              epoch: epoch + 1,
              accuracy: metric(logs, "acc", "accuracy"),
              validationAccuracy: metric(logs, "val_acc", "val_accuracy"),
              loss: logs.loss,
              validationLoss: logs.val_loss,
            };
            state.history.push(entry);
            elements.metricEpoch.textContent = `${entry.epoch} / ${settings.epochs}`;
            elements.metricTrain.textContent = percent(entry.accuracy);
            elements.metricValidation.textContent = percent(entry.validationAccuracy);
            elements.metricLoss.textContent = Number(entry.validationLoss).toFixed(3);
            setStatus(`Epoch ${entry.epoch}/${settings.epochs} complete.`);
            drawChart();
            await tf.nextFrame();
          },
        },
      });

      state.roc = await calculateRoc(state.model, dataset.validationX, dataset.validationY);
      const macroAuc = state.roc.reduce((sum, curve) => sum + curve.auc, 0) / CLASS_COUNT;
      elements.metricAuc.textContent = macroAuc.toFixed(3);
      setStatus(state.model.stopTraining ? "Training stopped. The current model is ready to test." : "Training complete. Draw a digit below.");
      drawChart();
      if (hasDrawing()) predictDrawing();
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Training failed. Check the browser console for details.", true);
    } finally {
      if (dataset) Object.values(dataset).forEach((tensor) => tensor.dispose());
      state.training = false;
      elements.train.disabled = false;
      elements.stop.disabled = true;
    }
  }

  function stopTraining() {
    if (state.model && state.training) {
      state.model.stopTraining = true;
      setStatus("Stopping after the current batch…");
    }
  }

  function chartTheme() {
    const styles = getComputedStyle(document.documentElement);
    return {
      background: styles.getPropertyValue("--figure-bg").trim(),
      text: styles.getPropertyValue("--figure-text").trim(),
      muted: styles.getPropertyValue("--figure-muted").trim(),
      border: styles.getPropertyValue("--figure-border").trim(),
      accent: styles.getPropertyValue("--figure-accent").trim(),
      accent2: styles.getPropertyValue("--figure-accent-2").trim(),
    };
  }

  function prepareCanvas(canvas) {
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { context, width, height };
  }

  function drawAxes(context, bounds, yMaximum, yLabelFormatter) {
    const theme = chartTheme();
    context.strokeStyle = theme.border;
    context.fillStyle = theme.muted;
    context.lineWidth = 1;
    context.font = "10px system-ui, sans-serif";
    context.textAlign = "right";
    context.textBaseline = "middle";

    for (let step = 0; step <= 4; step += 1) {
      const value = (yMaximum * step) / 4;
      const y = bounds.bottom - (value / yMaximum) * bounds.height;
      context.beginPath();
      context.moveTo(bounds.left, y);
      context.lineTo(bounds.right, y);
      context.stroke();
      context.fillText(yLabelFormatter(value), bounds.left - 8, y);
    }
  }

  function drawSeries(context, values, color, xScale, yScale, dashed = false) {
    if (!values.length) return;
    context.save();
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.lineJoin = "round";
    context.setLineDash(dashed ? [6, 4] : []);
    context.beginPath();
    values.forEach((point, index) => {
      const x = xScale(point.x);
      const y = yScale(point.y);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
  }

  function renderLegend(items) {
    elements.chartLegend.innerHTML = items
      .map((item) => `<span class="legend-item"><i class="legend-swatch" style="background:${item.color}"></i>${item.label}</span>`)
      .join("");
  }

  function drawLearningChart(context, bounds, view, theme) {
    const isAccuracy = view === "accuracy";
    const maximumEpoch = Math.max(1, state.history.length, Number(elements.epochs.value));
    const allLosses = state.history.flatMap((entry) => [entry.loss, entry.validationLoss]).filter(Number.isFinite);
    const yMaximum = isAccuracy ? 1 : Math.max(1, ...allLosses) * 1.05;
    drawAxes(context, bounds, yMaximum, (value) => (isAccuracy ? `${Math.round(value * 100)}%` : value.toFixed(2)));
    const xScale = (value) => bounds.left + ((value - 1) / Math.max(1, maximumEpoch - 1)) * bounds.width;
    const yScale = (value) => bounds.bottom - (value / yMaximum) * bounds.height;
    const trainKey = isAccuracy ? "accuracy" : "loss";
    const validationKey = isAccuracy ? "validationAccuracy" : "validationLoss";
    drawSeries(
      context,
      state.history.map((entry) => ({ x: entry.epoch, y: entry[trainKey] })),
      theme.accent2,
      xScale,
      yScale
    );
    drawSeries(
      context,
      state.history.map((entry) => ({ x: entry.epoch, y: entry[validationKey] })),
      theme.accent,
      xScale,
      yScale
    );
    renderLegend([
      { label: "Training", color: theme.accent2 },
      { label: "Validation", color: theme.accent },
    ]);
  }

  function drawRocChart(context, bounds) {
    drawAxes(context, bounds, 1, (value) => value.toFixed(2));
    const xScale = (value) => bounds.left + value * bounds.width;
    const yScale = (value) => bounds.bottom - value * bounds.height;
    drawSeries(
      context,
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      chartTheme().muted,
      xScale,
      yScale,
      true
    );
    state.roc.forEach((curve) => drawSeries(context, curve.points, ROC_COLORS[curve.digit], xScale, yScale));
    renderLegend(
      state.roc.length
        ? state.roc.map((curve) => ({ label: `${curve.digit}: ${curve.auc.toFixed(3)}`, color: ROC_COLORS[curve.digit] }))
        : [{ label: "ROC curves appear after training", color: chartTheme().muted }]
    );
  }

  function drawChart() {
    const { context, width, height } = prepareCanvas(elements.chart);
    const theme = chartTheme();
    context.fillStyle = theme.background;
    context.fillRect(0, 0, width, height);
    const bounds = { left: 48, right: width - 18, top: 16, bottom: height - 30 };
    bounds.width = bounds.right - bounds.left;
    bounds.height = bounds.bottom - bounds.top;

    if (state.chartView === "roc") drawRocChart(context, bounds);
    else drawLearningChart(context, bounds, state.chartView, theme);
  }

  function selectChartView(view) {
    state.chartView = view;
    const descriptions = {
      accuracy: "Training and validation accuracy after each epoch.",
      loss: "Training and validation cost after each epoch; lower is better.",
      roc: "One-vs-rest ROC curves. Legend values are AUC scores for digits 0–9.",
    };
    elements.chartDescription.textContent = descriptions[view];
    elements.chartTabs.forEach((tab) => {
      const active = tab.dataset.view === view;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-pressed", String(active));
    });
    drawChart();
  }

  const drawingContext = elements.drawingBoard.getContext("2d", { willReadFrequently: true });
  let drawing = false;
  let lastPoint = null;

  function clearDrawing() {
    drawingContext.fillStyle = "#000";
    drawingContext.fillRect(0, 0, elements.drawingBoard.width, elements.drawingBoard.height);
    elements.prediction.textContent = state.model ? "Draw a digit" : "Train the model first";
    renderProbabilities(Array(CLASS_COUNT).fill(0));
  }

  function drawingPoint(event) {
    const rect = elements.drawingBoard.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * elements.drawingBoard.width,
      y: ((event.clientY - rect.top) / rect.height) * elements.drawingBoard.height,
    };
  }

  function startDrawing(event) {
    event.preventDefault();
    drawing = true;
    lastPoint = drawingPoint(event);
    elements.drawingBoard.setPointerCapture(event.pointerId);
  }

  function continueDrawing(event) {
    if (!drawing) return;
    event.preventDefault();
    const point = drawingPoint(event);
    drawingContext.strokeStyle = "#fff";
    drawingContext.lineWidth = 22;
    drawingContext.lineCap = "round";
    drawingContext.lineJoin = "round";
    drawingContext.beginPath();
    drawingContext.moveTo(lastPoint.x, lastPoint.y);
    drawingContext.lineTo(point.x, point.y);
    drawingContext.stroke();
    lastPoint = point;
    schedulePrediction();
  }

  function endDrawing() {
    drawing = false;
    lastPoint = null;
    schedulePrediction();
  }

  function hasDrawing() {
    const pixels = drawingContext.getImageData(0, 0, elements.drawingBoard.width, elements.drawingBoard.height).data;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 16) return true;
    return false;
  }

  function preprocessDrawing() {
    const width = elements.drawingBoard.width;
    const height = elements.drawingBoard.height;
    const pixels = drawingContext.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (pixels[(y * width + x) * 4] > 20) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX < minX) return null;

    const sourceWidth = maxX - minX + 1;
    const sourceHeight = maxY - minY + 1;
    const scale = 20 / Math.max(sourceWidth, sourceHeight);
    const targetWidth = sourceWidth * scale;
    const targetHeight = sourceHeight * scale;
    const small = document.createElement("canvas");
    small.width = 28;
    small.height = 28;
    const context = small.getContext("2d", { willReadFrequently: true });
    context.fillStyle = "#000";
    context.fillRect(0, 0, 28, 28);
    context.drawImage(
      elements.drawingBoard,
      minX,
      minY,
      sourceWidth,
      sourceHeight,
      (28 - targetWidth) / 2,
      (28 - targetHeight) / 2,
      targetWidth,
      targetHeight
    );
    const result = new Float32Array(IMAGE_SIZE);
    const reducedPixels = context.getImageData(0, 0, 28, 28).data;
    for (let i = 0; i < IMAGE_SIZE; i += 1) result[i] = reducedPixels[i * 4] / 255;
    return result;
  }

  function renderProbabilities(values) {
    const best = values.indexOf(Math.max(...values));
    elements.probabilities.innerHTML = values
      .map(
        (value, digit) => `<div class="probability-row" data-best="${digit === best && value > 0}">
          <span>${digit}</span>
          <div class="probability-track"><div class="probability-fill" style="width:${Math.max(0, Math.min(100, value * 100))}%"></div></div>
          <span class="probability-value">${percent(value, 1)}</span>
        </div>`
      )
      .join("");
  }

  async function predictDrawing() {
    if (!state.model || state.training) return;
    const values = preprocessDrawing();
    if (!values) return;
    const probabilities = tf.tidy(() => {
      const input = tf.tensor2d(values, [1, IMAGE_SIZE]);
      const output = state.model.predict(input);
      return Array.from(output.dataSync());
    });
    const best = probabilities.indexOf(Math.max(...probabilities));
    elements.prediction.textContent = `${best} · ${percent(probabilities[best], 1)}`;
    renderProbabilities(probabilities);
  }

  function schedulePrediction() {
    window.clearTimeout(state.predictionTimer);
    state.predictionTimer = window.setTimeout(predictDrawing, 120);
  }

  elements.trainingSplit.addEventListener("input", () => {
    elements.trainingSplitValue.textContent = `${elements.trainingSplit.value}%`;
  });
  elements.epochs.addEventListener("input", () => {
    if (!state.training) elements.metricEpoch.textContent = `0 / ${elements.epochs.value}`;
  });
  elements.train.addEventListener("click", train);
  elements.stop.addEventListener("click", stopTraining);
  elements.chartTabs.forEach((tab) => tab.addEventListener("click", () => selectChartView(tab.dataset.view)));
  elements.clearDrawing.addEventListener("click", clearDrawing);
  elements.drawingBoard.addEventListener("pointerdown", startDrawing);
  elements.drawingBoard.addEventListener("pointermove", continueDrawing);
  elements.drawingBoard.addEventListener("pointerup", endDrawing);
  elements.drawingBoard.addEventListener("pointercancel", endDrawing);
  window.addEventListener("resize", drawChart);

  clearDrawing();
  drawChart();
})();
