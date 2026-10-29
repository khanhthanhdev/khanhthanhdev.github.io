// Part 12 of the diffusion series: where it went next. One scene: straight training paths (flow matching and
// rectified flow), why the learned paths still bend, reflow, sampling in one or two steps, the consistency idea
// behind one-step models, and the diffusion transformer. Every number on the toy comes from DM.
(function () {
  "use strict";

  const DM = window.DM;
  const { s, fmt } = window.TF.view;
  const { plot, chart, at, chunked } = DM.view;
  DM.scenes = DM.scenes || {};

  const N = 600;
  const NS = [1, 2, 4, 8, 16];
  const FOLLOW = [5, 60, 120, 260, 330, 400, 470, 530];
  const narrow = window.matchMedia("(max-width: 991.98px)");
  const beside = (x, y, opts) => (narrow.matches ? [0, 450, opts] : [x, y, opts]);

  // The diffusion transformer of Peebles and Xie (2023), as boxes.
  function dit(parent) {
    const g = s("g", { class: "dm-unet tf-obj" });
    const items = [];
    const boxAt = (x, y, w, h, a, b) => {
      items.push(s("rect", { class: "dm-unet-box", x, y, width: w, height: h, rx: 4 }));
      items.push(s("text", { class: "dm-unet-text", x: x + w / 2, y: y + 19, "text-anchor": "middle", text: a }));
      if (b) items.push(s("text", { class: "dm-unet-sub", x: x + w / 2, y: y + 35, "text-anchor": "middle", text: b }));
    };
    const arrow = (x1, y1, x2, y2) => items.push(s("path", { class: "dm-unet-arrow", d: `M${x1} ${y1}L${x2} ${y2}` }));
    boxAt(120, 0, 260, 46, "noisy latent", "32 × 32 × 4 (a 256 × 256 image)");
    boxAt(120, 76, 260, 46, "patchify: 2 × 2 patches", "256 tokens, plus position embeddings");
    boxAt(120, 152, 260, 74, "N transformer blocks", "self-attention and MLP, each with");
    items.push(s("text", { class: "dm-unet-sub", x: 250, y: 210, "text-anchor": "middle", text: "adaLN-Zero conditioning" }));
    boxAt(400, 160, 150, 58, "t and class", "embedded, summed");
    boxAt(120, 256, 260, 46, "linear decoder", "back to 32 × 32 × 4");
    boxAt(120, 332, 260, 46, "predicted noise", "(and variance)");
    arrow(250, 46, 250, 76);
    arrow(250, 122, 250, 152);
    arrow(400, 189, 380, 189);
    arrow(250, 226, 250, 256);
    arrow(250, 302, 250, 332);
    g.append(...items);
    parent.append(g);
    return { el: g, box: { x: 100, y: -10, width: 470, height: 400 } };
  }

  DM.scenes.part12 = function (stage) {
    const { svg, strip } = stage;
    const data = DM.DATASETS.swissroll;
    const sch = DM.schedule("linear", 200);
    const vp = DM.vpSDE();
    const flow = DM.flowModel(DM.loadNet("swissroll-flow"));
    const reflow = DM.flowModel(DM.loadNet("swissroll-reflow"));
    const ddpmScore = DM.vpScore(DM.netModel(DM.loadNet("swissroll-eps"), sch), vp);
    const x0 = DM.sample(data, N, 1).xs;
    const noise = DM.gaussian(N, 2);
    const floor = DM.dataFloor(data, N);
    const toData = (xs) => DM.slicedToData(xs, data);

    const main = plot(svg, { range: 3 });
    const right = plot(svg, { range: 3 });
    const curve = chart(svg, { width: 250, height: 140 });
    const tr = dit(svg);
    const layout = DM.layout(svg, () => ({ main, right, curve, tr }));

    /* -------------------------------------------- background work */

    const R = {};
    const jobs = [];
    jobs.push({ key: "flow-50", make: () => DM.flowStepper(flow, noise, { n: 50 }) });
    jobs.push({ key: "reflow-50", make: () => DM.flowStepper(reflow, noise, { n: 50 }) });
    jobs.push({ key: "ode-100", make: () => DM.reverseStepper(ddpmScore, vp, noise, { n: 100, mode: "ode" }) });
    NS.forEach((n) => {
      jobs.push({ key: `flow-${n}`, make: () => DM.flowStepper(flow, noise, { n }) });
      jobs.push({ key: `reflow-${n}`, make: () => DM.flowStepper(reflow, noise, { n }) });
      jobs.push({ key: `diff-${n}`, make: () => DM.reverseStepper(ddpmScore, vp, noise, { n, mode: "ode" }) });
    });
    const total = jobs.length;
    function runNext() {
      const job = jobs.shift();
      if (!job) {
        stage.busy(null);
        stage.note(`${N} points · flow and reflow networks of the same size as part 4's, Euler steps`);
        return;
      }
      const st = job.make();
      stage.busy(`sampling… ${total - jobs.length} of ${total}`);
      chunked(
        () => st.next(10),
        null,
        () => {
          R[job.key] = st;
          stage.redraw();
          runNext();
        }
      );
    }
    runNext();
    const last = (k) => R[k] && R[k].frames[R[k].frames.length - 1];
    // total path length over total straight-line distance, over all points (a ratio of sums, so points whose noise
    // starts right next to their sample don't dominate)
    function bend(frames) {
      let L = 0;
      let C = 0;
      const n = frames[0].length / 2;
      const a = frames[0];
      const z = frames[frames.length - 1];
      for (let i = 0; i < n; i++) {
        for (let k = 1; k < frames.length; k++)
          L += Math.hypot(frames[k][2 * i] - frames[k - 1][2 * i], frames[k][2 * i + 1] - frames[k - 1][2 * i + 1]);
        C += Math.hypot(z[2 * i] - a[2 * i], z[2 * i + 1] - a[2 * i + 1]);
      }
      return L / C;
    }

    function reset() {
      [main, right].forEach((p) => p.view(3).shade(null).rings([]).arrows([]).marks([]).paths([]).corner("").cloud("b", null).cloud("pts", null));
    }
    const waiting = () => {
      main.title("sampling…");
      strip("sampling…");
      layout({ main: [0, 0] });
    };
    const trail = (frames, i) => frames.map((f) => at(f, i));
    // the points whose paths cover the most ground, so the paths are visible
    const longest = (frames, k = 8) => {
      const a = frames[0];
      const b = frames[frames.length - 1];
      return Array.from({ length: a.length / 2 }, (_, i) => i)
        .sort((p, q) => Math.hypot(b[2 * q] - a[2 * q], b[2 * q + 1] - a[2 * q + 1]) - Math.hypot(b[2 * p] - a[2 * p], b[2 * p + 1] - a[2 * p + 1]))
        .slice(0, k);
    };

    /* -------------------------------------------- render */

    function render(step, t) {
      reset();

      if (step === "lines") {
        // the training paths for a few (data, noise) pairs: straight for flow matching, curved for VP diffusion
        const pairs = FOLLOW.map((i) => [at(x0, i), at(noise, i)]);
        const vpPath = ([y, z]) => {
          const pts = [];
          for (let k = 0; k <= 40; k++) {
            const ab = vp.alphaBar(k / 40);
            pts.push([Math.sqrt(ab) * y[0] + Math.sqrt(1 - ab) * z[0], Math.sqrt(ab) * y[1] + Math.sqrt(1 - ab) * z[1]]);
          }
          return pts;
        };
        main.title("training paths: flow matching (red), VP diffusion (blue)").cloud("pts", x0, "dm-data is-faint");
        main.paths([...pairs.map((p) => ({ pts: vpPath(p), cls: "dm-data" })), ...pairs.map(([y, z]) => ({ pts: [y, z], cls: "dm-model" }))]);
        main.marks([
          ...pairs.map(([y]) => ({ c: y, label: "", cls: "dm-ink", r: 3 })),
          ...pairs.map(([, z]) => ({ c: z, label: "", cls: "dm-ink is-hollow", r: 3 })),
        ]);
        strip(
          "x_t = (1 − t)·y + t·z: a straight line from a data point y to a noise point z, at constant speed · the network learns the velocity z − y · diffusion's √ᾱ·y + √(1 − ᾱ)·z curves"
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "flow") {
        const run = R["flow-50"];
        if (!run) return waiting();
        main.view(4);
        right.view(4);
        const k = Math.round(t * 50);
        main.title(`flow matching, ${k} of 50 Euler steps`).cloud("pts", x0, "dm-data is-faint").cloud("b", run.frames[k], "dm-model is-strong");
        main.paths(longest(run.frames).map((i) => ({ pts: trail(run.frames.slice(0, k + 1), i), cls: "dm-ink" })));
        strip(
          k < 50
            ? `x ← x − v(x, t)·Δt from t = 1 to 0 · step ${k}`
            : `done · distance to the true spiral ${fmt(toData(last("flow-50")), 3)} (real data ${fmt(floor, 3)})`
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "bend") {
        const a = R["flow-50"];
        const b = R["ode-100"];
        if (!a || !b) return waiting();
        main.view(4);
        right.view(4);
        const pick = longest(a.frames);
        main
          .title("learned flow paths")
          .cloud("pts", x0, "dm-data is-faint")
          .paths(pick.map((i) => ({ pts: trail(a.frames, i), cls: "dm-model" })));
        right
          .title("diffusion's ODE paths (part 7)")
          .cloud("pts", x0, "dm-data is-faint")
          .paths(pick.map((i) => ({ pts: trail(b.frames, i), cls: "dm-data" })));
        strip(
          `total path length over total straight-line distance: flow ${fmt(bend(a.frames), 3)} · diffusion ODE ${fmt(bend(b.frames), 3)} · each training path is straight, but they cross, and the network learns their average`
        );
        layout({ main: [0, 0, { scale: 0.75 }], right: [320, 0, { scale: 0.75 }] });
        return;
      }

      if (step === "reflow") {
        const a = R["flow-50"];
        const b = R["reflow-50"];
        if (!a || !b) return waiting();
        main.view(4);
        right.view(4);
        const pick = longest(a.frames);
        main
          .title("first flow")
          .cloud("pts", x0, "dm-data is-faint")
          .paths(pick.map((i) => ({ pts: trail(a.frames, i), cls: "dm-model" })));
        right
          .title("after one reflow")
          .cloud("pts", x0, "dm-data is-faint")
          .paths(pick.map((i) => ({ pts: trail(b.frames, i), cls: "dm-x0" })));
        strip(
          `total path length over total straight-line distance: ${fmt(bend(a.frames), 3)} before, ${fmt(bend(b.frames), 3)} after · reflow trains on the first flow's own (noise, sample) pairs, which no longer cross`
        );
        layout({ main: [0, 0, { scale: 0.75 }], right: [320, 0, { scale: 0.75 }] });
        return;
      }

      if (step === "onestep") {
        const have = NS.every((n) => last(`flow-${n}`) && last(`reflow-${n}`) && last(`diff-${n}`));
        if (!have) return waiting();
        const ser = (k) => NS.map((n) => [n, toData(last(`${k}-${n}`))]);
        curve.title("ODE blue, flow red, reflow orange").set({
          series: [
            { values: ser("diff"), cls: "dm-data is-dashed" },
            { values: ser("flow"), cls: "dm-model" },
            { values: ser("reflow"), cls: "dm-x0" },
            {
              values: [
                [1, floor],
                [16, floor],
              ],
              cls: "dm-true is-dashed",
              label: "real data",
            },
          ],
          x: [1, 16],
          y: [0, 1],
          yTicks: [0, 1],
          xLabel: "Euler steps",
        });
        const n = NS[Math.min(NS.length - 1, Math.floor(t * NS.length))];
        main
          .title(`reflow, ${n} step${n > 1 ? "s" : ""}`)
          .cloud("pts", x0, "dm-data is-faint")
          .cloud("b", last(`reflow-${n}`), "dm-x0 is-strong");
        strip(
          `1 / 2 / 4 / 8 / 16 steps · diffusion ODE ${ser("diff")
            .map(([, d]) => fmt(d, 3))
            .join(" / ")} · flow ${ser("flow")
            .map(([, d]) => fmt(d, 3))
            .join(" / ")} · reflow ${ser("reflow")
            .map(([, d]) => fmt(d, 3))
            .join(" / ")}`
        );
        layout({ main: [0, 0, { scale: 0.8 }], curve: beside(400, 100) });
        return;
      }

      if (step === "consistency") {
        const b = R["ode-100"];
        if (!b) return waiting();
        main.view(4);
        right.view(4);
        // one ODE path, several points on it, all mapped to the same end
        const i = longest(b.frames, 1)[0];
        const path = trail(b.frames, i);
        const end = path[path.length - 1];
        const picks = [0, 30, 55, 75, 90].map((k) => path[k]);
        main.title("a consistency model maps every point of a path to its end").cloud("pts", x0, "dm-data is-faint");
        main.paths([{ pts: path, cls: "dm-ink" }]);
        main.arrows(picks.map((p) => ({ a: p, b: end, cls: "dm-model is-light" })));
        main.marks([
          ...picks.map((p) => ({ c: p, label: "", cls: "dm-ink is-hollow", r: 4 })),
          { c: end, label: "the sample", cls: "dm-model", r: 5 },
        ]);
        strip(
          "f(x_t, t) = the end of the ODE path through x_t, for every t · trained so that neighbouring points on a path give the same answer · then f(noise, T) samples in one network call"
        );
        layout({ main: [0, 0] });
        return;
      }

      if (step === "dit") {
        strip("DiT: a latent diffusion model (part 10) with the U-Net replaced by a vision transformer · DiT-XL/2: FID 2.27 on ImageNet 256 × 256");
        layout({ tr: [0, 0] });
      }
    }

    return { render };
  };
})();
