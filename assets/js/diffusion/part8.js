// Part 8 of the diffusion series: from the toy to images, after Improved DDPM (Nichol and Dhariwal, 2021) and ADM
// (Dhariwal and Nichol, 2021). One scene: a network that learns its reverse variance, what that buys with fewer
// steps, precision and recall, the fidelity–diversity trade-off, and the U-Net with ADM's changes. Every number on
// the toy comes from DM.
(function () {
  "use strict";

  const DM = window.DM;
  const { s, fmt } = window.TF.view;
  const { plot, chart, chunked } = DM.view;
  DM.scenes = DM.scenes || {};

  const N = 600;
  const SS = [10, 20, 50, 100, 200];
  const TAUS = [1, 0.8, 0.6, 0.4, 0.2];
  const narrow = window.matchMedia("(max-width: 991.98px)");
  const beside = (x, y, opts) => (narrow.matches ? [0, 450, opts] : [x, y, opts]);

  /* ---------------------------------------------------------------- the U-Net diagram */

  // DDPM's network for 32 × 32 images: four resolutions, two residual blocks per level, self-attention at 16 × 16,
  // the step t added into every residual block, skip connections across. highlight(set) marks ADM's changes.
  function unet(parent) {
    const g = s("g", { class: "dm-unet tf-obj" });
    const levels = [32, 16, 8, 4];
    const W = 560;
    const rowH = 74;
    const colL = 40;
    const colR = W - 200;
    const nodes = {};
    const box = (x, y, w, hh, label, key, sub) => {
      const r = s("rect", { class: "dm-unet-box", x, y, width: w, height: hh, rx: 4 });
      const tall = hh >= 44;
      const t = s("text", { class: "dm-unet-text", x: x + w / 2, y: y + (tall ? 19 : hh / 2 + 4), "text-anchor": "middle", text: label });
      const parts = [r, t];
      if (tall) parts.push(s("text", { class: "dm-unet-sub", x: x + w / 2, y: y + 35, "text-anchor": "middle", text: sub || "" }));
      const grp = s("g", { class: "dm-unet-node" }, ...parts);
      if (key) nodes[key] = grp;
      return grp;
    };
    const arrow = (x1, y1, x2, y2, cls = "") => s("path", { class: `dm-unet-arrow ${cls}`, d: `M${x1} ${y1}L${x2} ${y2}` });
    const items = [];
    levels.forEach((res, i) => {
      const y = 30 + i * rowH;
      items.push(box(colL, y, 160, 46, `${res}×${res}: 2 res blocks`, `down${res}`, res === 16 ? "+ self-attention" : ""));
      items.push(box(colR, y, 160, 46, `${res}×${res}: 2 res blocks`, `up${res}`, res === 16 ? "+ self-attention" : ""));
      items.push(arrow(colL + 160, y + 23, colR, y + 23, "is-skip"));
      if (i + 1 < levels.length) {
        items.push(arrow(colL + 80, y + 46, colL + 80, y + rowH, "is-down"));
        items.push(arrow(colR + 80, y + rowH, colR + 80, y + 46, "is-up"));
      }
    });
    const yb = 30 + levels.length * rowH;
    items.push(box(colL + 90, yb, W - 260, 40, "middle: res block, attention, res block", "mid"));
    items.push(arrow(colL + 80, yb - rowH + 46, colL + 90, yb + 20, "is-down"));
    items.push(arrow(colR + 80 - 10, yb + 20, colR + 80, yb - rowH + 46, "is-up"));
    items.push(box(colL, -36, 160, 34, "input xₜ (32×32×3)", "in"));
    items.push(box(colR, -36, 160, 34, "output ε̂ (32×32×3)", "out"));
    items.push(arrow(colL + 80, -2, colL + 80, 30));
    items.push(arrow(colR + 80, 30, colR + 80, -2));
    items.push(box(W / 2 - 70, -36, 140, 34, "step t → embedding", "temb"));
    const note = s("text", {
      class: "dm-unet-note",
      x: W / 2,
      y: yb + 66,
      "text-anchor": "middle",
      text: "the embedding of t is added into every residual block",
    });
    const skipNote = s("text", { class: "dm-unet-sub", x: W / 2, y: 30 + 23 - 6, "text-anchor": "middle", text: "skip connection" });
    g.append(...items, note, skipNote);
    parent.append(g);
    return {
      el: g,
      box: { x: -10, y: -50, width: W + 20, height: yb + 90 },
      // keys to mark, and a replacement note under the diagram
      highlight(keys, text, subs = {}) {
        Object.entries(nodes).forEach(([k, n]) => n.classList.toggle("is-on", keys.includes(k)));
        Object.values(nodes).forEach((n) => {
          const t = n.querySelector(".dm-unet-sub");
          if (t) t.textContent = "";
        });
        Object.entries(subs).forEach(([k, v]) => {
          const t = nodes[k] && nodes[k].querySelector(".dm-unet-sub");
          if (t) t.textContent = v;
        });
        note.textContent = text;
      },
    };
  }

  DM.scenes.part8 = function (stage) {
    const { svg, strip } = stage;
    const data = DM.DATASETS.swissroll;
    const sch = DM.schedule("linear", 200);
    const fixed = DM.netModel(DM.loadNet("swissroll-eps"), sch);
    const learned = DM.netModel(DM.loadNet("swissroll-learned"), sch);
    const x0 = DM.sample(data, N, 1).xs;
    const real = DM.sample(data, N, 3).xs; // the reference set for precision and recall
    const realPR = DM.precisionRecall(DM.sample(data, N, 4).xs, real); // what a second real sample scores
    const floor = DM.dataFloor(data, N);
    const toData = (xs) => DM.slicedToData(xs, data);

    const main = plot(svg, { range: 3 });
    const right = plot(svg, { range: 3 });
    const curve = chart(svg, { width: 250, height: 140 });
    const net = unet(svg);
    const layout = DM.layout(svg, () => ({ main, right, curve, net }));

    /* -------------------------------------------- background work */

    const R = {};
    const jobs = [];
    SS.forEach((S) => {
      jobs.push({ key: `fixed-${S}`, make: () => DM.respacedStepper(fixed, sch, DM.gaussian(N, 2), { S, variance: "beta" }) });
      jobs.push({ key: `learned-${S}`, make: () => DM.respacedStepper(learned, sch, DM.gaussian(N, 2), { S, variance: "learned" }) });
    });
    TAUS.forEach((tau) =>
      jobs.push({ key: `tau-${tau}`, make: () => DM.respacedStepper(fixed, sch, DM.gaussian(N, 2), { S: 50, temperature: tau }) })
    );
    const total = jobs.length;
    const bound = { fixed: new Float64Array(201), learned: new Float64Array(201), done: 1 };
    function runBound() {
      chunked(
        () => {
          const to = Math.min(200, bound.done + 8);
          const o = { m: 256, from: bound.done + 1, to };
          DM.boundTerms(fixed, data, sch, { ...o, into: bound.fixed });
          DM.boundTerms(learned, data, sch, { ...o, into: bound.learned, sigma: "learned" });
          bound.done = to;
          return to >= 200 ? null : to / 200;
        },
        null,
        () => {
          stage.busy(null);
          stage.note(`${N} points · fixed-variance and learned-variance networks, 30,000 training steps each`);
          stage.redraw();
        }
      );
    }
    function runNext() {
      const job = jobs.shift();
      if (!job) return runBound();
      const st = job.make();
      stage.busy(`sampling… ${total - jobs.length} of ${total}`);
      chunked(
        () => st.next(10),
        null,
        () => {
          const f = st.frames[st.frames.length - 1];
          R[job.key] = { xs: f, d: toData(f) };
          if (job.key.startsWith("tau")) R[job.key].pr = DM.precisionRecall(f, real);
          stage.redraw();
          runNext();
        }
      );
    }
    runNext();
    const sum = (a) => a.reduce((x, y) => x + y, 0);

    /* -------------------------------------------- render */

    function reset() {
      [main, right].forEach((p) => p.view(3).shade(null).rings([]).arrows([]).marks([]).paths([]).corner("").cloud("b", null).cloud("pts", null));
    }
    const waiting = () => {
      main.title("sampling…");
      strip("sampling…");
      layout({ main: [0, 0] });
    };

    function render(step, t) {
      reset();

      if (step === "variance") {
        // the network's v, averaged over noisy data, at each step
        const vs = [];
        for (let k = 2; k <= 200; k += 6) {
          const v = learned.v(DM.qSample(DM.sample(data, 100, 7).xs, sch, k, k).xt, k);
          vs.push([k, v.reduce((a, b) => a + b, 0) / v.length]);
        }
        curve.title("learned v: 1 is the width β, 0 the posterior width").set({
          series: [{ values: vs, cls: "dm-model" }],
          x: [0, 200],
          y: [0, 1.2],
          yTicks: [0, 1],
          xLabel: "step t",
        });
        const k = Math.max(2, Math.round(2 + t * 198));
        main.title(`x at step ${k}`).cloud("pts", DM.qSample(x0, sch, k, 5).xt, "dm-data");
        strip(
          bound.done < 200
            ? "computing the bound…"
            : `bound, summed over steps: fixed σ² = β ${fmt(sum(bound.fixed), 2)} nats · learned σ² ${fmt(sum(bound.learned), 2)} nats · the learned v sits near β, as part 3's comparison suggested`
        );
        layout({ main: [0, 0, { scale: 0.8 }], curve: beside(400, 100) });
        return;
      }

      if (step === "fewer") {
        const a = SS.filter((S) => R[`fixed-${S}`]).map((S) => [S, R[`fixed-${S}`].d]);
        const b = SS.filter((S) => R[`learned-${S}`]).map((S) => [S, R[`learned-${S}`].d]);
        curve.title("distance: fixed β (red), learned σ² (orange)").set({
          series: [
            { values: a, cls: "dm-model" },
            { values: b, cls: "dm-x0 is-dashed" },
            {
              values: [
                [10, floor],
                [200, floor],
              ],
              cls: "dm-true is-dashed",
              label: "real data",
            },
          ],
          x: [10, 200],
          y: [0, 0.15],
          yTicks: [0, floor, 0.15],
          xLabel: "number of steps",
        });
        const S = SS[Math.min(SS.length - 1, Math.floor(t * SS.length))];
        if (R[`learned-${S}`])
          main.title(`learned variance, ${S} steps`).cloud("pts", x0, "dm-data is-faint").cloud("b", R[`learned-${S}`].xs, "dm-x0 is-strong");
        strip(
          b.length < SS.length
            ? "sampling…"
            : `fixed: ${a.map(([n, d]) => `${n} steps ${fmt(d, 3)}`).join(", ")} · learned: ${b.map(([, d]) => fmt(d, 3)).join(", ")} · real data ${fmt(floor, 3)}`
        );
        layout({ main: [0, 0, { scale: 0.8 }], curve: beside(400, 100) });
        return;
      }

      if (step === "pr") {
        const r = R["tau-1"];
        if (!r) return waiting();
        // a subset of the real points with their k-NN balls, and the samples coloured by whether they land in one
        const k = 3;
        const n = real.length / 2;
        const rad = new Float64Array(n);
        const dd = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) dd[j] = (real[2 * i] - real[2 * j]) ** 2 + (real[2 * i + 1] - real[2 * j + 1]) ** 2;
          dd.sort();
          rad[i] = Math.sqrt(dd[k]);
        }
        const ins = [];
        const outs = [];
        for (let i = 0; i < r.xs.length; i += 2) {
          let hit = false;
          for (let j = 0; j < n && !hit; j++) if (Math.hypot(r.xs[i] - real[2 * j], r.xs[i + 1] - real[2 * j + 1]) <= rad[j]) hit = true;
          (hit ? ins : outs).push(r.xs[i], r.xs[i + 1]);
        }
        main.view(1.6, 0.4, 0.6).title("real points' balls (grey); samples inside (red) and outside (black)");
        main.rings(Array.from({ length: n }, (_, i) => ({ c: [real[2 * i], real[2 * i + 1]], r: rad[i], cls: "dm-noise" })));
        main.cloud("pts", Float64Array.from(ins), "dm-model is-strong", 2.4).cloud("b", Float64Array.from(outs), "dm-ink is-strong", 2.8);
        strip(
          `precision ${fmt(r.pr.precision, 3)}: share of samples inside some real point's ball (radius: distance to its 3rd nearest real neighbour) · recall ${fmt(r.pr.recall, 3)}: the roles swapped · a second real sample: ${fmt(realPR.precision, 3)} and ${fmt(realPR.recall, 3)}`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "tradeoff") {
        const have = TAUS.filter((tau) => R[`tau-${tau}`]);
        if (have.length < TAUS.length) return waiting();
        const tau = TAUS[Math.min(TAUS.length - 1, Math.floor(t * TAUS.length))];
        const r = R[`tau-${tau}`];
        curve.title("precision (red) and recall (blue) against noise scale").set({
          series: [
            { values: TAUS.map((v) => [v, R[`tau-${v}`].pr.precision]), cls: "dm-model" },
            { values: TAUS.map((v) => [v, R[`tau-${v}`].pr.recall]), cls: "dm-data" },
          ],
          x: [1, 0.2],
          y: [0, 1],
          yTicks: [0, 1],
          cursor: tau,
          xLabel: "noise scale τ (1 = the real sampler)",
        });
        main.title(`noise scaled by τ = ${tau}`).cloud("pts", x0, "dm-data is-faint").cloud("b", r.xs, "dm-model is-strong");
        strip(
          `τ = ${tau}: precision ${fmt(r.pr.precision, 3)} · recall ${fmt(r.pr.recall, 3)} · distance to the spiral ${fmt(r.d, 3)} (real data ${fmt(floor, 3)})`
        );
        layout({ main: [0, 0, { scale: 0.8 }], curve: beside(400, 100) });
        return;
      }

      if (step === "unet") {
        net.highlight([], "the embedding of t is added into every residual block", { down16: "+ self-attention", up16: "+ self-attention" });
        strip(
          "DDPM's network for 32 × 32 images: a U-Net with four resolutions, two residual blocks per level, attention at 16 × 16 · 35.7 million parameters"
        );
        layout({ net: [0, 0] });
        return;
      }

      if (step === "adm") {
        net.highlight(
          ["down32", "up32", "down16", "up16", "down8", "up8", "temb"],
          "ADM: t (and the class) scale and shift each block's normalised features (AdaGN)",
          { down32: "+ attention", up32: "+ attention", down16: "+ attention", up16: "+ attention", down8: "+ attention", up8: "+ attention" }
        );
        strip(
          "ADM's changes: attention at 32, 16 and 8 · 64 channels per attention head · BigGAN residual blocks to go up and down · adaptive group norm · wider rather than deeper"
        );
        layout({ net: [0, 0] });
      }
    }

    return { render };
  };
})();
