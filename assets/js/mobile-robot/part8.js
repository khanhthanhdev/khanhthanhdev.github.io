// Part 8 of the mobile robots series: how a lidar measures. Time of flight with a pulse, triangulation with a
// camera and its error that grows with the square of the distance, phase-shift ranging and its ambiguity, how a
// spinning head turns one range finder into a scan, and where scans have holes.
(function () {
  "use strict";

  const MR = window.MR;
  const { s } = MR.view;
  const { slider } = MR.controls;
  const C = 299792458; // m/s
  const f2 = (v) => v.toFixed(2);
  const cm = (v) => `${(v * 100).toFixed(1)} cm`;

  const POSE = [4.6, 3.6, MR.rad(15)];
  const SAMPLE_RATE = 4000; // range measurements per second
  // triangulation: focal length (pixels), baseline (m), how finely the laser spot can be located (pixels)
  const TRI = { f: 700, dx: 0.1 };

  MR.scenes.part8 = function (stage) {
    const { svg, controls, strip } = stage;
    const world = MR.room();
    const R = MR.view.room(svg, world, { title: "one turn of the lidar" });
    const P = MR.view.plot(svg, { width: 420, height: 220, right: 90 });

    /* ---------------------------------------------- inputs */

    const state = { d: 4, base: 5, freq: 10, hz: 10, drop: 5, sd: 2 };
    const dIn = slider(
      "distance",
      5,
      200,
      state.d * 10,
      (v) => ((state.d = v / 10), stage.refresh()),
      (v) => `${(v / 10).toFixed(1)} m`,
      1
    );
    const baseIn = slider(
      "baseline",
      2,
      15,
      state.base,
      (v) => ((state.base = v), stage.refresh()),
      (v) => `${v} cm`,
      1
    );
    const freqIn = slider(
      "modulation",
      5,
      100,
      state.freq,
      (v) => ((state.freq = v), stage.refresh()),
      (v) => `${v} MHz`,
      5
    );
    const hzIn = slider(
      "rotation",
      5,
      20,
      state.hz,
      (v) => ((state.hz = v), stage.refresh()),
      (v) => `${v} Hz`,
      1
    );
    const dropIn = slider(
      "lost returns",
      0,
      40,
      state.drop,
      (v) => ((state.drop = v), stage.refresh()),
      (v) => `${v}%`,
      1
    );
    const sdIn = slider(
      "range noise σ",
      0,
      50,
      state.sd * 10,
      (v) => ((state.sd = v / 10), stage.refresh()),
      (v) => `${(v / 10).toFixed(1)} cm`,
      5
    );
    controls.append(dIn.wrap, baseIn.wrap, freqIn.wrap, hzIn.wrap, dropIn.wrap, sdIn.wrap);
    function show(...which) {
      controls.hidden = !which.length;
      [
        [dIn.wrap, "d"],
        [baseIn.wrap, "base"],
        [freqIn.wrap, "freq"],
        [hzIn.wrap, "hz"],
        [dropIn.wrap, "drop"],
        [sdIn.wrap, "sd"],
      ].forEach(([el, key]) => (el.style.display = which.includes(key) ? "" : "none"));
    }

    /* ---------------------------------------------- the kinds of lidar */

    const tall = window.TF.view.narrow.matches;
    const kinds = MR.view.group(svg, tall ? { x: -10, y: -40, width: 320, height: 440 } : { x: -10, y: -40, width: 580, height: 300 });
    {
      const g = kinds.el;
      g.append(s("text", { class: "tf-mat-title", x: 0, y: -16, text: "how the beam gets around" }));
      const items = [
        ["2-D spinning", "one beam, a turning head: a flat slice", "is-a"],
        ["3-D spinning", "16 to 128 beams stacked, one head", "is-d"],
        ["MEMS mirror", "a tiny tilting mirror sweeps the beam", "is-c"],
        ["flash", "light the whole scene, a sensor of pixels", "is-c"],
        ["optical phased array", "steer the beam with no moving part", "is-muted"],
      ];
      items.forEach(([t, sub, cls], i) => MR.view.box(g, 0, i * (tall ? 80 : 56), tall ? 300 : 560, tall ? 64 : 46, t, sub, cls));
    }

    /* ---------------------------------------------- render */

    function plotOnly() {
      MR.view.hideAll(R, kinds);
      MR.view.arrange(svg, [{ obj: P }]);
    }

    const steps = {
      tof() {
        show("d");
        // the emitted pulse at 0 and its echo after 2d/c, weaker with distance, with detector noise
        const r = MR.rng(Math.round(state.d * 10));
        const tEcho = (2 * state.d) / C;
        const amp = Math.min(1, 1 / (state.d * state.d));
        const ts = [];
        const out = [];
        const back = [];
        const span = Math.max(40e-9, tEcho * 1.4);
        for (let i = 0; i <= 400; i++) {
          const t = (i / 400) * span - 5e-9;
          ts.push(t * 1e9);
          out.push(Math.exp(-((t / 2e-9) ** 2)));
          back.push(0.7 * amp * Math.exp(-(((t - tEcho) / 2e-9) ** 2)) + r.gauss(0, 0.004));
        }
        P.title("light at the lidar (relative)");
        P.set(
          [
            { xs: ts, ys: out, cls: "is-muted", label: "sent" },
            { xs: ts, ys: back.map((v) => v / (0.7 * amp)), cls: "is-a", label: "echo, scaled", dy: 12 },
          ],
          {
            xMin: -5,
            xMax: span * 1e9 - 5,
            yMin: -0.2,
            yMax: 1.2,
            vlines: [{ x: tEcho * 1e9, cls: "is-b", label: `${(tEcho * 1e9).toFixed(1)} ns` }],
            xTitle: "time (ns)",
          }
        );
        plotOnly();
        strip(`${state.d.toFixed(1)} m: back after ${(tEcho * 1e9).toFixed(1)} ns · the echo is ${(1 / amp).toFixed(0)}× weaker than at 1 m`);
      },

      triangulation() {
        show("base");
        const b = state.base / 100;
        const zs = Array.from({ length: 81 }, (_, i) => 0.1 + i * 0.1);
        const err = (z) => MR.stereoError(TRI.f, b, z, TRI.dx);
        P.title("range error, σ (cm)");
        P.set(
          [
            { xs: zs, ys: zs.map((z) => 100 * err(z)), cls: "is-b", label: "triangulation" },
            { xs: zs, ys: zs.map(() => 1.5), cls: "is-a", label: "time of flight", dy: 12 },
          ],
          { xMax: 8, yMin: 0, yMax: 20, xTitle: "distance (m)" }
        );
        plotOnly();
        strip(`${state.base} cm baseline · error ${cm(err(1))} at 1 m, ${cm(err(3))} at 3 m, ${cm(err(8))} at 8 m`);
      },

      phase() {
        show("d", "freq");
        const f = state.freq * 1e6;
        const amb = C / (2 * f);
        const phi = ((4 * Math.PI * f * state.d) / C) % MR.TAU;
        const reads = (phi / MR.TAU) * amb;
        const ts = Array.from({ length: 301 }, (_, i) => (i / 300) * (2 / f));
        P.title("brightness of the light (relative)");
        P.set(
          [
            { xs: ts.map((t) => t * 1e9), ys: ts.map((t) => 0.5 + 0.5 * Math.sin(MR.TAU * f * t)), cls: "is-muted", label: "sent" },
            { xs: ts.map((t) => t * 1e9), ys: ts.map((t) => 0.5 + 0.4 * Math.sin(MR.TAU * f * t - phi)), cls: "is-a", label: "received", dy: 12 },
          ],
          { xMax: (2 / f) * 1e9, yMin: 0, yMax: 1.1, xTitle: "time (ns)" }
        );
        plotOnly();
        strip(
          `shifted ${MR.deg(phi).toFixed(0)}° · repeats every ${f2(amb)} m · ${state.d.toFixed(1)} m reads as ${f2(reads)} m${Math.abs(reads - state.d) > 0.01 ? ": wrong" : ""}`
        );
      },

      spin() {
        show("hz");
        const n = Math.round(SAMPLE_RATE / state.hz);
        const sc = MR.scan(world, POSE, { n, max: 8, sd: 0.01, seed: 3 });
        const pts = MR.scanPoints(sc, POSE);
        R.set("a", R.rays(POSE, sc, { cls: "is-a" }), R.dots(pts, "is-b", 1.6));
        R.set("robot", R.robot(POSE, "is-a", 0.36));
        MR.view.hideAll(P, kinds);
        MR.view.arrange(svg, [{ obj: R }]);
        const step = 360 / n;
        strip(`${n} points a turn, ${step.toFixed(2)}° apart · ${cm(5 * MR.rad(step))} apart on a wall 5 m away`);
      },

      holes() {
        show("drop", "sd");
        const sc = MR.scan(world, POSE, { n: 400, max: 8, sd: state.sd / 100, dropout: state.drop / 100, seed: 4 });
        const pts = MR.scanPoints(sc, POSE);
        R.set("a", R.dots(pts, "is-b", 2));
        R.set("robot", R.robot(POSE, "is-a", 0.36));
        MR.view.hideAll(P, kinds);
        MR.view.arrange(svg, [{ obj: R }]);
        const lost = sc.filter((b) => !isFinite(b.r)).length;
        strip(`${lost} of ${sc.length} beams came back with nothing`);
      },

      kinds() {
        show();
        MR.view.hideAll(P, R);
        MR.view.arrange(svg, [{ obj: kinds }]);
        strip("they range the same ways, and differ in how they point the beam");
      },
    };

    return { render: (id, t) => steps[id](t) };
  };
})();
