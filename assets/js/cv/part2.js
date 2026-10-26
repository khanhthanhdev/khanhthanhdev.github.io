// Part 2 of the computer vision series: linear classifiers, the SVM and softmax losses, and regularisation, on the
// CIFAR-10 photos. One scene; the classifiers were trained offline (cv-photos.js loads them), and every number shown
// is computed here, by CV (cv-core.js), from them and the photos.
(function () {
  "use strict";

  const CV = window.CV;
  const { h, s, fmt, bars, progress, narrow } = window.TF.view;
  const { scatter } = window.CL.view;
  const { regions, colour, thumb } = CV.view;
  const { button, select } = CV.controls;
  CV.scenes = CV.scenes || {};

  const REGS = [0, 0.1, 1, 10];
  const CLASSES = CV.PHOTOS.classes;
  const name = (label) => CLASSES[label];

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

  CV.scenes.part2 = (stage) => Promise.all([CV.loadPhotos(), CV.loadLinear()]).then(([photos, linear]) => scene(stage, photos, linear));

  // A photo's 3,072 numbers in a row, drawn as one long strip of colours, the first `count` pixels filled in.
  function ribbon(parent, width) {
    const g = s("g", { class: "tf-obj" });
    const title = s("text", { class: "tf-mat-title", x: 0, y: -12 });
    const frame = s("rect", { class: "cv-thumb-frame", x: -1, y: -1, width: width + 2, height: 26 });
    g.append(title, frame);
    parent.append(g);
    let pic = null;
    return {
      el: g,
      box: { x: -6, y: -30, width: width + 12, height: 62 },
      title: (text) => (title.textContent = text),
      set(p, count) {
        const draw = () => {
          const paper = CV.view.rgbOf("--tf-cell");
          return CV.view.paint(p.px.length / 3, 1, (c) => (c < count ? [p.px[3 * c], p.px[3 * c + 1], p.px[3 * c + 2]] : paper));
        };
        if (!pic) {
          pic = CV.view.painted({ x: 0, y: 0, width, height: 24 }, draw);
          g.insertBefore(pic.el, frame);
        } else pic.redraw(draw);
      },
    };
  }

  // A row of weights as a picture: its red, green and blue weights each stretched to 0 … 255, as CS231n draws them.
  function templatePhoto(row) {
    const lo = Math.min(...row);
    const hi = Math.max(...row);
    return { px: Uint8Array.from(row, (v) => Math.round((255 * (v - lo)) / (hi - lo))) };
  }

  function scene(stage, photos, linear) {
    const { svg, toolbar, controls, strip, note } = stage;
    const { train, val, test } = photos;
    const { models, input } = linear;
    const SIDE = CV.PHOTOS.side;
    const PICK = 1; // λ = 0.1, the best on the validation photos
    const predict = (model, p) => CV.argmax(CV.linearScores(model, input(p)));
    // accuracy of a model on a set, worked out once: it doesn't change as the reader scrolls
    const accs = new Map();
    const acc = (model, set) => {
      const key = `${models.indexOf(model)} ${set === train ? "train" : set === val ? "val" : "test"}`;
      if (!accs.has(key)) accs.set(key, set.filter((p) => predict(model, p) === p.label).length / set.length);
      return accs.get(key);
    };
    // a percentage, with a decimal only when it isn't whole
    const pc = (v) => `${fmt(100 * v, Number.isInteger(Math.round(1000 * v) / 10) ? 0 : 1)}%`;
    const perClass = (model, set, j) => set.filter((p) => p.label === j && predict(model, p) === j).length;

    // 2-D: three blobs and the spiral, each with a linear classifier trained on it
    const blobs = CV.blobs(1, 30);
    const spiral = CV.spiral(1, 60, 3);
    const fit2d = (d) => CV.trainLinear(d.points.map(CV.input), d.labels, 3, { steps: 300, lr: 1, reg: 1e-3 }).model;
    const blobModel = fit2d(blobs);
    const spiralModel = fit2d(spiral);
    const acc2d = (model, d) => CV.accuracy((x) => CV.argmax(CV.linearScores(model, x)), d.points.map(CV.input), d.labels);

    /* -------------------------------------------- inputs */

    const state = { q: 28, reg: PICK };
    const qLabel = h("span", { class: "tf-label" });
    const prevQ = button("◀", () => pickQuery(state.q - 1));
    const nextQ = button("▶", () => pickQuery(state.q + 1));
    prevQ.setAttribute("aria-label", "Previous test photo");
    nextQ.setAttribute("aria-label", "Next test photo");
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

    // captions for the pictures sit above them
    const titleOf = (t) => {
      const el = s("text", { class: "tf-mat-title", x: 0, y: -12 });
      t.el.append(el);
      return (text) => (el.textContent = text);
    };
    const image = thumb(svg, { size: 160 });
    const imageTitle = titleOf(image);
    const rowFrame = s("rect", { class: "cv-window" });
    image.el.append(rowFrame);
    const frameRow = (r) => {
      const u = image.size / SIDE;
      rowFrame.style.opacity = r == null ? "0" : "1";
      if (r == null) return;
      rowFrame.setAttribute("x", 0);
      rowFrame.setAttribute("y", r * u);
      rowFrame.setAttribute("width", image.size);
      rowFrame.setAttribute("height", u);
    };
    const row = ribbon(svg, 600);
    const product = thumb(svg, { size: 200 });
    const productTitle = titleOf(product);
    const tpl = CLASSES.map(() => thumb(svg, { size: 80 }));
    const tplTitles = tpl.map(titleOf);
    const bigTpl = CLASSES.map(() => thumb(svg, { size: 150 }));
    const bigTitles = bigTpl.map(titleOf);
    const scoreBars = bars(svg, { labels: CLASSES, width: 150, gap: 26, title: "scores", max: 4, format: (v) => (v == null ? "" : fmt(v)) });
    const lossTable = table(svg, { widths: [80, 70, 120, 80], rows: 4, title: "" });
    const probBars = bars(svg, {
      labels: CLASSES,
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
    image.box = { x: -6, y: -30, width: 172, height: 196 };
    product.box = { x: -6, y: -30, width: 212, height: 236 };
    tpl.forEach((t) => (t.box = { x: -6, y: -30, width: 92, height: 116 }));
    bigTpl.forEach((t) => (t.box = { x: -6, y: -30, width: 162, height: 186 }));
    scoreBars.box = { x: -90, y: -34, width: 300, height: 140 };
    probBars.box = scoreBars.box;
    plot.box = { x: -4, y: -30, width: 448, height: 474 };

    const tplAt = (x0, y0, dy) => Object.fromEntries(tpl.map((_, j) => [`t${j}`, [x0, y0 + j * dy]]));
    const bigAt = { T0: [0, 0], T1: [190, 0], T2: [0, 220], T3: [190, 220] };

    // the steps use λ = 0.1; the regularisation step uses the reader's choice
    const pictures = models.map((m) => m.W.map(templatePhoto));
    let drawn = null;
    function useModel(i = PICK) {
      if (drawn !== i)
        pictures[i].forEach((pic, j) => {
          tpl[j].set(pic, { label: j });
          bigTpl[j].set(pic, { label: j });
          tplTitles[j](CLASSES[j]);
          bigTitles[j](CLASSES[j]);
        });
      drawn = i;
      return models[i];
    }

    /* -------------------------------------------- render */

    const steps = {
      flatten(t) {
        const p = test[state.q];
        image.set(p, { label: p.label });
        imageTitle("test photo, 32 × 32");
        row.title("x: the photo's 1,024 pixels in one row, 3 numbers each");
        const k = progress(t, SIDE);
        row.set(p, Math.min(SIDE, k) * SIDE);
        frameRow(k >= 1 && k <= SIDE ? k - 1 : null);
        layout(narrow.matches ? { image: [140, 0, { scale: 2 }], row: [0, 440] } : { image: [0, 0], row: [0, 240] });
        strip(
          k >= 1 && k <= SIDE
            ? `row ${k} of the photo: 32 pixels × 3 colours become x${fmt((k - 1) * 96 + 1, 0)} … x${fmt(k * 96, 0)}`
            : "1,024 pixels, read row by row, 3 numbers each: one list x of 3,072 numbers. Where a pixel sat is now only its position in the list."
        );
      },

      scores(t) {
        const model = useModel();
        const p = test[state.q];
        const x = input(p);
        const sc = CV.linearScores(model, x);
        const j = Math.min(3, Math.floor(t * 4.4));
        image.set(p, { label: p.label });
        imageTitle("test photo");
        // each pixel's three weight × value terms, added up, so the picture shows where the score comes from
        const terms = Array.from({ length: SIDE }, (_, r) =>
          Array.from({ length: SIDE }, (_, c) => [0, 1, 2].reduce((a, ch) => a + model.W[j][(r * SIDE + c) * 3 + ch] * x[(r * SIDE + c) * 3 + ch], 0))
        );
        // a few pixels dominate; scaling to the 98th percentile keeps the rest visible
        const mags = terms
          .flat()
          .map(Math.abs)
          .sort((a, b) => a - b);
        const range = mags[Math.floor(0.98 * mags.length)];
        product.set(terms, { signed: true, range });
        productTitle(`weight × pixel, ${name(j)}`);
        scoreBars.set(
          sc.map((v, i) => (i <= j ? v : null)),
          j
        );
        tpl.forEach((m, i) => m.mark(i === j ? null : "dim"));
        // on a phone the templates make a row on top, and the scores go underneath
        layout(
          narrow.matches
            ? {
                ...Object.fromEntries(tpl.map((_, i) => [`t${i}`, [i * 112, 0]])),
                image: [0, 170, { scale: 1.25 }],
                product: [234, 170],
                scoreBars: [120, 460],
              }
            : { ...tplAt(0, 0, 116), image: [140, 110], product: [350, 90], scoreBars: [680, 130] }
        );
        const sum = terms.flat();
        const up = sum.filter((v) => v > 0).reduce((a, b) => a + b, 0);
        const down = sum.filter((v) => v < 0).reduce((a, b) => a + b, 0);
        strip(`score(${name(j)}) = Σ weight × pixel + bias = ${fmt(up)} (red) ${fmt(down)} (blue) + ${fmt(model.b[j])} = ${fmt(sc[j])}`);
      },

      templates() {
        useModel();
        layout(bigAt);
        strip(`the weights, drawn as photos · test accuracy ${pc(acc(models[PICK], test))}; k-NN got 53%`);
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
        const model = models[PICK];
        const p = test[state.q];
        const sc = CV.linearScores(model, input(p));
        const hg = CV.hinge(sc, p.label);
        const shown = Math.min(4, Math.floor(t * 5.5));
        lossTable.title(`multiclass SVM loss · true class: ${name(p.label)}`);
        lossTable.set(
          [
            ["class", "score", "s − s_true + 1", "term"],
            ...sc.map((v, j) => [
              name(j),
              fmt(v),
              j === p.label ? "(true class)" : j < shown || shown >= 4 ? fmt(v - sc[p.label] + 1) : "",
              j === p.label ? "" : j < shown || shown >= 4 ? fmt(hg.terms[j]) : "",
            ]),
          ],
          p.label + 1,
          (j) => colour(j)
        );
        image.set(p, { label: p.label });
        imageTitle("test photo");
        layout(narrow.matches ? { image: [90, 0], lossTable: [0, 250] } : { image: [0, 30], lossTable: [230, 60] });
        strip(
          `loss = ${hg.terms
            .map((v, j) => (j === p.label ? null : fmt(v)))
            .filter(Boolean)
            .join(" + ")} = ${fmt(hg.loss)}${hg.loss === 0 ? ": every wrong class is beaten by at least 1, so nothing to fix" : ""}`
        );
      },

      softmax(t) {
        const model = models[PICK];
        const p = test[state.q];
        const sc = CV.linearScores(model, input(p));
        const e = sc.map(Math.exp);
        const z = e.reduce((a, b) => a + b, 0);
        const prob = e.map((v) => v / z);
        const stage_ = t < 0.33 ? 0 : t < 0.66 ? 1 : 2;
        lossTable.title(`softmax · true class: ${name(p.label)}`);
        lossTable.set(
          [
            ["class", "score", "e^score", "probability"],
            ...sc.map((v, j) => [name(j), fmt(v), stage_ >= 1 ? fmt(e[j]) : "", stage_ >= 2 ? fmt(prob[j], 3) : ""]),
          ],
          p.label + 1,
          (j) => colour(j)
        );
        probBars.set(stage_ >= 2 ? prob : prob.map(() => null), p.label);
        image.set(p, { label: p.label });
        imageTitle("test photo");
        layout(
          narrow.matches
            ? { image: [90, 0], lossTable: [0, 250], probBars: [100, 430] }
            : { image: [0, 30], lossTable: [230, 0], probBars: [330, 200] }
        );
        strip(
          stage_ < 1
            ? "scores can be any number. Exponentiate, so they are all positive…"
            : stage_ < 2
              ? `…then divide by their sum, ${fmt(z)}, so they add up to 1.`
              : `loss = −log p(${name(p.label)}) = −log ${fmt(prob[p.label], 3)} = ${fmt(-Math.log(prob[p.label]))}`
        );
      },

      reg() {
        const model = useModel(state.reg);
        layout(bigAt);
        const norm = Math.sqrt(model.W.flat().reduce((a, v) => a + v * v, 0));
        strip(
          `λ = ${REGS[state.reg]}: ‖W‖ = ${fmt(norm)} · training accuracy ${fmt(100 * acc(model, train), 0)}%, validation ${pc(acc(model, val))}`
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
      const p = test[state.q];
      const pred = predict(models[PICK], p);
      qLabel.textContent = `test photo ${state.q + 1} of ${test.length} · a ${name(p.label)}`;
      note(pick ? `the classifier says: ${name(pred)} ${pred === p.label ? "✓" : "✗"}` : "");
      if (step !== "flatten") frameRow(null);
      if (step !== "scores") tpl.forEach((m) => m.mark(null));
      steps[step](t);
    }

    return { render };
  }
})();
