// Part 2 of the computer vision series: linear classifiers, the SVM and softmax losses, and regularisation. One
// scene; every number is computed by CV (cv-core.js) on the images and points shown.
(function () {
  "use strict";

  const CV = window.CV;
  const { h, s, fmt, matrix, bars, progress } = window.TF.view;
  const { scatter } = window.CL.view;
  const { regions, colour } = CV.view;
  const { button, select } = CV.controls;
  CV.scenes = CV.scenes || {};

  const REGS = [0, 0.01, 0.1, 1];
  const name = (label) => CV.CLASSES[label];

  // A small table of text: rows of cells, the first column left-aligned and the rest right-aligned.
  function table(parent, opts) {
    const widths = opts.widths;
    const rowH = 24;
    const g = s("g", { class: "tf-obj cv-table" });
    const title = s("text", { class: "tf-mat-title", x: 0, y: -18, text: opts.title || "" });
    const body = s("g");
    g.append(title, body);
    parent.append(g);
    const total = widths.reduce((a, b) => a + b, 0);
    return {
      el: g,
      box: { x: -6, y: -34, width: total + 12, height: 34 + rowH * (opts.rows + 1) + 8 },
      title: (text) => (title.textContent = text || ""),
      // rows: [[cell, …], …], the first is the header; focus: index of a row to emphasise; cls(i) → class per row
      set(rows, focus = null, cls = () => "") {
        const nodes = [];
        rows.forEach((row, i) => {
          let x = 0;
          row.forEach((cell, j) => {
            const right = j > 0;
            nodes.push(
              s("text", {
                class: `${i === 0 ? "tf-small" : "tf-num"} ${i === focus ? "is-focus" : ""} ${i > 0 && j === 0 ? `cv-tag ${cls(i - 1)}` : ""}`,
                x: right ? x + widths[j] - 6 : x,
                y: i * rowH,
                "text-anchor": right ? "end" : "start",
                text: cell,
              })
            );
            x += widths[j];
          });
        });
        nodes.push(s("line", { class: "tf-stroke-muted", x1: 0, y1: 8, x2: total, y2: 8 }));
        body.replaceChildren(...nodes);
      },
    };
  }

  CV.scenes.part2 = function (stage) {
    const { svg, toolbar, controls, strip, note } = stage;
    const train = CV.split("train");
    const val = CV.split("val");
    const test = CV.split("test");
    const X = train.map((ex) => CV.flat(ex.img));
    const y = train.map((ex) => ex.label);

    // one model per regularisation strength; λ = 0.01 is the one the steps use
    const models = REGS.map((reg) => CV.trainLinear(X, y, 4, { steps: 400, lr: 0.2, reg }).model);
    const acc = (model, set) =>
      CV.accuracy(
        (x) => CV.argmax(CV.linearScores(model, x)),
        set.map((ex) => CV.flat(ex.img)),
        set.map((ex) => ex.label)
      );
    const templatesOf = (model) => model.W.map((row) => CV.unflat(row));

    // 2-D: three blobs and the spiral, each with a linear classifier trained on it
    const blobs = CV.blobs(1, 30);
    const spiral = CV.spiral(1, 60, 3);
    const fit2d = (d) => CV.trainLinear(d.points.map(CV.input), d.labels, 3, { steps: 300, lr: 1, reg: 1e-3 }).model;
    const blobModel = fit2d(blobs);
    const spiralModel = fit2d(spiral);
    const acc2d = (model, d) => CV.accuracy((x) => CV.argmax(CV.linearScores(model, x)), d.points.map(CV.input), d.labels);

    /* -------------------------------------------- inputs */

    const state = { q: 35, reg: 1 };
    const qLabel = h("span", { class: "tf-label" });
    const prevQ = button("◀", () => pickQuery(state.q - 1));
    const nextQ = button("▶", () => pickQuery(state.q + 1));
    prevQ.setAttribute("aria-label", "Previous test image");
    nextQ.setAttribute("aria-label", "Next test image");
    toolbar.append(qLabel, prevQ, nextQ);
    const regIn = select(
      "λ",
      REGS.map((r, i) => [i, String(r)]),
      state.reg,
      (v) => {
        state.reg = Number(v);
        stage.refresh();
      }
    );
    regIn.wrap.querySelector("label").classList.add("cl-nocaps");
    controls.append(regIn.wrap);
    function pickQuery(i) {
      state.q = (i + test.length) % test.length;
      stage.refresh();
    }

    /* -------------------------------------------- objects */

    const image = matrix(svg, { rows: 8, cols: 8, cell: 30, kind: "prob", name: "image" });
    const row = matrix(svg, { rows: 1, cols: 64, cell: 9, kind: "prob", name: "x, the image as one row", numbers: false });
    const product = matrix(svg, { rows: 8, cols: 8, cell: 30, kind: "signed", range: 0.8, name: "weight × pixel" });
    const tpl = CV.CLASSES.map((c) => matrix(svg, { rows: 8, cols: 8, cell: 14, kind: "signed", range: 0.8, name: c, numbers: false }));
    const bigTpl = CV.CLASSES.map((c) => matrix(svg, { rows: 8, cols: 8, cell: 24, kind: "signed", range: 0.8, name: c, numbers: false }));
    const scoreBars = bars(svg, { labels: CV.CLASSES, width: 150, gap: 26, title: "scores", max: 3, format: (v) => (v == null ? "" : fmt(v)) });
    const lossTable = table(svg, { widths: [96, 70, 120, 70], rows: 4, title: "" });
    const probBars = bars(svg, {
      labels: CV.CLASSES,
      width: 150,
      gap: 26,
      title: "probabilities",
      format: (v) => (v == null ? "" : `${fmt(100 * v, 0)}%`),
    });
    const plot = scatter(svg);
    const tint = regions(plot);

    const objects = () => ({
      image,
      row,
      product,
      scoreBars,
      lossTable,
      probBars,
      plot,
      ...Object.fromEntries(tpl.map((m, j) => [`t${j}`, m])),
      ...Object.fromEntries(bigTpl.map((m, j) => [`T${j}`, m])),
    });
    const layout = CV.layout(svg, objects);
    [image, product].forEach((m) => (m.box = { x: -6, y: -30, width: 252, height: 278 }));
    row.box = { x: -6, y: -30, width: 590, height: 44 };
    tpl.forEach((m) => (m.box = { x: -4, y: -26, width: 120, height: 142 }));
    bigTpl.forEach((m) => (m.box = { x: -4, y: -26, width: 200, height: 222 }));
    scoreBars.box = { x: -90, y: -34, width: 300, height: 140 };
    probBars.box = scoreBars.box;
    plot.box = { x: -4, y: -30, width: 448, height: 474 };

    const tplAt = (x0, y0, dy = 150) => Object.fromEntries(tpl.map((_, j) => [`t${j}`, [x0, y0 + j * dy]]));

    // the steps use λ = 0.01; the regularisation step uses the reader's choice
    function useModel(i = 1) {
      const model = models[i];
      const T = templatesOf(model);
      tpl.forEach((m, j) => m.set(T[j]));
      bigTpl.forEach((m, j) => m.set(T[j]));
      return model;
    }

    /* -------------------------------------------- render */

    const steps = {
      flatten(t) {
        const img = test[state.q].img;
        image.set(img);
        row.set([CV.flat(img)]);
        const k = progress(t, 8);
        row.reveal(Math.min(64, k * 8));
        image.row(k >= 1 && k <= 8 ? k - 1 : null);
        layout({ image: [0, 0], row: [0, 330] });
        strip(
          k >= 1 && k <= 8
            ? `row ${k} of the image becomes x${k * 8 - 7} … x${k * 8}`
            : "64 pixels, read row by row, make one list x of 64 numbers. Where a pixel sat is now only its position in the list."
        );
      },

      scores(t) {
        const model = useModel();
        const img = test[state.q].img;
        const x = CV.flat(img);
        const sc = CV.linearScores(model, x);
        const j = Math.min(3, Math.floor(t * 4.4));
        image.set(img);
        product.set(img.map((r, a) => r.map((v, b) => v * model.W[j][a * 8 + b])));
        product.reveal();
        // negative scores get no bar, only their number
        scoreBars.set(
          sc.map((v, i) => (i <= j ? v : null)),
          j
        );
        tpl.forEach((m, i) => m.focusRows(i === j ? null : [-1]));
        layout({ ...tplAt(0, 0, 140), image: [160, 0], product: [440, 0], scoreBars: [530, 330] });
        const top = x
          .map((v, i) => [v * model.W[j][i], i])
          .sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]))
          .slice(0, 2);
        strip(
          `score(${name(j)}) = Σ weight × pixel + bias = ${fmt(sc[j] - model.b[j])} + (${fmt(model.b[j])}) = ${fmt(sc[j])}` +
            `   ·   biggest terms: ${top.map(([v]) => fmt(v)).join(", ")}`
        );
      },

      templates() {
        useModel();
        tpl.forEach((m) => m.focusRows(null));
        layout({ T0: [0, 0], T1: [230, 0], T2: [0, 250], T3: [230, 250] });
        strip(`red: ink here raises the score · blue: ink here lowers it. Test accuracy ${fmt(100 * acc(models[1], test), 1)}%; k-NN got 80%.`);
      },

      geometry() {
        plot.points(blobs.points).colour(blobs.labels).style(null);
        tint.set((x) => CV.argmax(CV.linearScores(blobModel, x)));
        plot.title("three blobs · a linear classifier");
        layout({ plot: [0, 0] });
        strip(
          `each region is where one class's score is highest; every border is straight. ${fmt(100 * acc2d(blobModel, blobs), 0)}% of points right.`
        );
      },

      svm(t) {
        const model = models[1];
        const ex = test[state.q];
        const sc = CV.linearScores(model, CV.flat(ex.img));
        const hg = CV.hinge(sc, ex.label);
        const shown = Math.min(4, Math.floor(t * 5.5));
        lossTable.title(`multiclass SVM loss · true class: ${name(ex.label)}`);
        lossTable.set(
          [
            ["class", "score", "s − s_true + 1", "term"],
            ...sc.map((v, j) => [
              name(j),
              fmt(v),
              j === ex.label ? "(true class)" : j < shown || shown >= 4 ? fmt(v - sc[ex.label] + 1) : "",
              j === ex.label ? "" : j < shown || shown >= 4 ? fmt(hg.terms[j]) : "",
            ]),
          ],
          ex.label + 1,
          (j) => colour(j)
        );
        image.set(ex.img);
        layout({ image: [0, 0], lossTable: [300, 60] });
        strip(
          `loss = ${hg.terms
            .map((v, j) => (j === ex.label ? null : fmt(v)))
            .filter(Boolean)
            .join(" + ")} = ${fmt(hg.loss)}${hg.loss === 0 ? ": every wrong class is beaten by at least 1, so nothing to fix" : ""}`
        );
      },

      softmax(t) {
        const model = models[1];
        const ex = test[state.q];
        const sc = CV.linearScores(model, CV.flat(ex.img));
        const e = sc.map(Math.exp);
        const z = e.reduce((a, b) => a + b, 0);
        const p = e.map((v) => v / z);
        const stage_ = t < 0.33 ? 0 : t < 0.66 ? 1 : 2;
        lossTable.title(`softmax · true class: ${name(ex.label)}`);
        lossTable.set(
          [
            ["class", "score", "e^score", "probability"],
            ...sc.map((v, j) => [name(j), fmt(v), stage_ >= 1 ? fmt(e[j]) : "", stage_ >= 2 ? fmt(p[j], 3) : ""]),
          ],
          ex.label + 1,
          (j) => colour(j)
        );
        probBars.set(stage_ >= 2 ? p : p.map(() => null), ex.label);
        image.set(ex.img);
        layout({ image: [0, 0], lossTable: [300, 0], probBars: [400, 200] });
        strip(
          stage_ < 1
            ? "scores can be any number. Exponentiate, so they are all positive…"
            : stage_ < 2
              ? `…then divide by their sum, ${fmt(z)}, so they add up to 1.`
              : `loss = −log p(${name(ex.label)}) = −log ${fmt(p[ex.label], 3)} = ${fmt(-Math.log(p[ex.label]))}`
        );
      },

      reg() {
        const model = useModel(state.reg);
        tpl.forEach((m) => m.focusRows(null));
        const norm = Math.sqrt(model.W.flat().reduce((a, v) => a + v * v, 0));
        layout({ T0: [0, 0], T1: [230, 0], T2: [0, 250], T3: [230, 250] });
        strip(
          `λ = ${REGS[state.reg]}: ‖W‖ = ${fmt(norm)} · training accuracy ${fmt(100 * acc(model, train), 0)}%, validation ${fmt(100 * acc(model, val), 0)}%`
        );
      },

      spiral() {
        plot.points(spiral.points).colour(spiral.labels).style(null);
        tint.set((x) => CV.argmax(CV.linearScores(spiralModel, x)));
        plot.title("a spiral · the best linear classifier");
        layout({ plot: [0, 0] });
        strip(`straight borders can't follow the arms: ${fmt(100 * acc2d(spiralModel, spiral), 0)}% of points right, against 33% for guessing.`);
      },
    };

    const usesImage = ["flatten", "scores", "svm", "softmax"];

    function render(step, t) {
      regIn.wrap.hidden = step !== "reg";
      const pick = usesImage.includes(step);
      [qLabel, prevQ, nextQ].forEach((el) => (el.style.visibility = pick ? "visible" : "hidden"));
      const ex = test[state.q];
      const pred = CV.argmax(CV.linearScores(models[1], CV.flat(ex.img)));
      qLabel.textContent = `test image ${state.q + 1} of ${test.length} · a ${name(ex.label)}`;
      note(pick ? `the classifier says: ${name(pred)} ${pred === ex.label ? "✓" : "✗"}` : "");
      if (step !== "flatten") image.row(null);
      steps[step](t);
    }

    return { render };
  };
})();
