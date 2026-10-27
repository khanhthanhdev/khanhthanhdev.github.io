// Part 12 of the mobile robots series: sensor fusion with Kalman filters. Two uncertain guesses combined into one
// better one; predict and correct, repeated down a corridor; the extended Kalman filter fusing odometry with beacons
// in the room, with its uncertainty ellipse; how much the filter depends on what it can see; and what tuning its
// noise wrongly does.
(function () {
  "use strict";

  const MR = window.MR;
  const { slider } = MR.controls;
  const cm = (v) => `${(v * 100).toFixed(1)} cm`;
  const f2 = (v) => v.toFixed(2);

  // a rectangle round the room, clear of the furniture
  const START = [0.8, 3.2, 0];
  const LEGS = [];
  for (const side of [8.2, 2.2, 8.2, 2.2]) LEGS.push([0.3, 0, side / 0.3], [0, 0.6, Math.PI / 2 / 0.6]);
  const PRED = { mu: 2.0, sd: 0.2 }; // the 1-D example: where odometry says the robot is
  const MEAS = 2.3; // and where a range measurement says

  MR.scenes.part12 = function (stage) {
    const { svg, controls, strip } = stage;
    const world = MR.room();
    const R = MR.view.room(svg, world, { title: "the room from above (1 m grid)" });
    const P = MR.view.plot(svg, { width: 420, height: 220, right: 60 });

    /* ---------------------------------------------- inputs */

    const state = { zSd: 10, every: 10, range: 45, tune: 0 };
    const zIn = slider(
      "measurement σ",
      2,
      40,
      state.zSd,
      (v) => ((state.zSd = v), stage.refresh()),
      (v) => `${v} cm`,
      1
    );
    const everyIn = slider(
      "measure every",
      1,
      21,
      state.every,
      (v) => ((state.every = v), stage.refresh()),
      (v) => (v > 20 ? "never" : `${v} steps`),
      1
    );
    const rangeIn = slider(
      "beacon range",
      0,
      60,
      state.range,
      (v) => ((state.range = v), stage.refresh()),
      (v) => `${(v / 10).toFixed(1)} m`,
      5
    );
    const tuneIn = slider(
      "filter's wheel noise",
      -10,
      10,
      state.tune,
      (v) => ((state.tune = v), stage.refresh()),
      (v) => `×${f2(10 ** (v / 10))}`,
      1
    );
    controls.append(zIn.wrap, everyIn.wrap, rangeIn.wrap, tuneIn.wrap);
    function show(...which) {
      controls.hidden = !which.length;
      [
        [zIn.wrap, "z"],
        [everyIn.wrap, "every"],
        [rangeIn.wrap, "range"],
        [tuneIn.wrap, "tune"],
      ].forEach(([el, key]) => (el.style.display = which.includes(key) ? "" : "none"));
    }

    /* ---------------------------------------------- data */

    const off = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const runs = new Map();
    function run(opts) {
      const key = JSON.stringify(opts);
      if (!runs.has(key)) runs.set(key, MR.ekfRun(LEGS, { start: START, ...opts }));
      return runs.get(key);
    }
    // the share of steps where the truth is inside the filter's 2-σ ellipse
    function inside(r) {
      let n = 0;
      r.est.forEach((e, i) => {
        const [a, b, ang] = MR.ellipse2(r.P[i]);
        const dx = r.truth[i][0] - e[0];
        const dy = r.truth[i][1] - e[1];
        const u = Math.cos(ang) * dx + Math.sin(ang) * dy;
        const v = -Math.sin(ang) * dx + Math.cos(ang) * dy;
        if ((u / a) ** 2 + (v / b) ** 2 <= 1) n++;
      });
      return n / r.est.length;
    }
    const errs = (r) => r.est.map((e, i) => off(e, r.truth[i]));
    const beacons = () => R.dots(MR.BEACONS, "is-e", 6);
    // the whole run: truth, odometry, the estimate, and its ellipse every 4 s
    function drawRun(r, upTo = r.est.length - 1) {
      const thin = (path) => path.slice(0, upTo + 1).filter((_, i) => i % 3 === 0 || i === upTo);
      const ells = [];
      for (let i = 40; i < upTo; i += 40) ells.push(R.ellipse(r.est[i], r.P[i], "is-c"));
      R.set(
        "a",
        R.path(thin(r.odom), "is-d is-dash"),
        R.path(thin(r.truth), "is-a"),
        R.path(thin(r.est), "is-c"),
        ...ells,
        R.ellipse(r.est[upTo], r.P[upTo], "is-c"),
        ...r.seen[upTo].map((j) => R.line(r.est[upTo], MR.BEACONS[j], "is-e is-dash")),
        beacons()
      );
      R.set("robot", R.robot(r.truth[upTo], "is-a", 0.36));
    }
    function roomOnly() {
      MR.view.hideAll(P);
      MR.view.arrange(svg, [{ obj: R }]);
    }

    /* ---------------------------------------------- render */

    const steps = {
      fuse() {
        show("z");
        const zSd = state.zSd / 100;
        const k = MR.kf1(PRED.mu, PRED.sd ** 2, 0, 0, MEAS, zSd ** 2);
        const sd = Math.sqrt(k.v);
        const xs = Array.from({ length: 301 }, (_, i) => 1.2 + i * 0.006);
        const pdf = (m, s) => xs.map((x) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI)));
        const top = 1 / (Math.min(sd, zSd) * Math.sqrt(2 * Math.PI));
        P.title("how likely each position is");
        P.set(
          [
            { xs, ys: pdf(PRED.mu, PRED.sd), cls: "is-d" },
            { xs, ys: pdf(MEAS, zSd), cls: "is-e" },
            { xs, ys: pdf(k.mu, sd), cls: "is-c is-thick" },
          ],
          { xMin: 1.2, xMax: 3, yMin: 0, yMax: top * 1.1, xTitle: "position along the corridor (m)" }
        );
        MR.view.hideAll(R);
        MR.view.arrange(svg, [{ obj: P }]);
        strip(`gain ${f2(k.gain)} · fused: ${f2(k.mu)} m, σ ${cm(sd)} · better than either alone`);
      },

      corridor() {
        show("every");
        const every = state.every > 20 ? Infinity : state.every;
        const c = MR.kfCorridor({ every });
        const xs = c.truth;
        const n = xs.length - 1;
        P.title("error (cm), and the filter's ±2σ");
        P.set(
          [
            { xs, ys: c.odom.map((o, i) => 100 * (o - xs[i])), cls: "is-d", label: "odometry" },
            { xs, ys: c.mu.map((m, i) => 100 * (m - xs[i])), cls: "is-c", label: "filter", dy: 12 },
            { xs, ys: c.sd.map((s) => 200 * s), cls: "is-muted is-dash" },
            { xs, ys: c.sd.map((s) => -200 * s), cls: "is-muted is-dash" },
          ],
          { xMax: 10, yMin: -40, yMax: 40, hlines: [{ y: 0, cls: "is-ink" }], xTitle: "distance driven (m)" }
        );
        MR.view.hideAll(R);
        MR.view.arrange(svg, [{ obj: P }]);
        strip(`after 10 m · odometry ${cm(Math.abs(c.odom[n] - xs[n]))} off · filter ${cm(Math.abs(c.mu[n] - xs[n]))} off, σ ${cm(c.sd[n])}`);
      },

      ekf(t = 0) {
        show();
        const r = run({});
        const k = Math.min(r.est.length - 1, Math.round((t ?? 0) * (r.est.length - 1)));
        drawRun(r, k);
        roomOnly();
        const [a] = MR.ellipse2(r.P[k]);
        strip(
          `${r.t[k].toFixed(0)} s · odometry ${cm(off(r.odom[k], r.truth[k]))} off · filter ${cm(off(r.est[k], r.truth[k]))} off, ellipse ±${cm(a)}`
        );
      },

      range() {
        show("range");
        const r = run({ range: state.range / 10 });
        drawRun(r);
        roomOnly();
        const e = errs(r);
        strip(`beacons seen within ${(state.range / 10).toFixed(1)} m · filter ${cm(MR.mean(e))} off on average, ${cm(Math.max(...e))} at worst`);
      },

      tune() {
        show("tune");
        const r = run({ assumeOdoSd: 0.05 * 10 ** (state.tune / 10) });
        drawRun(r);
        roomOnly();
        strip(`${cm(MR.mean(errs(r)))} off on average · the truth is inside the ellipse ${Math.round(100 * inside(r))}% of the time`);
      },
    };

    return { render: (id, t) => steps[id](t) };
  };
})();
