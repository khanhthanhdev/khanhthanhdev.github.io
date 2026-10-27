// Part 9 of the mobile robots series: processing a lidar scan. A scan as a list of ranges, turned into points; the
// smear a moving robot puts in a scan and how deskewing removes it; walls found as straight lines; and ICP, which
// lines two scans up to measure how the robot moved, chained into lidar odometry.
(function () {
  "use strict";

  const MR = window.MR;
  const { slider } = MR.controls;
  const cm = (v) => `${(v * 100).toFixed(1)} cm`;
  const f2 = (v) => v.toFixed(2);

  const POSE = [4.6, 3.6, MR.rad(15)];
  const MOVE = [0.3, 0.1, MR.rad(8)]; // the second scan's pose, seen from the first
  const V = 0.4; // m/s while scanning

  MR.scenes.part9 = function (stage) {
    const { svg, controls, strip } = stage;
    const world = MR.room();
    const R = MR.view.room(svg, world, { title: "the room from above (1 m grid)" });
    const P = MR.view.plot(svg, { width: 420, height: 220, right: 60 });
    // distance from a point to the nearest real surface
    const near = (p) => Math.min(...world.segs.map((sg) => MR.segDist(p, [sg.s[0], sg.s[1]], [sg.s[2], sg.s[3]])));

    /* ---------------------------------------------- inputs */

    const state = { w: 1, deskew: false, line: false };
    const wIn = slider(
      "turning while it scans",
      0,
      30,
      state.w * 10,
      (v) => ((state.w = v / 10), stage.refresh()),
      (v) => `${(v / 10).toFixed(1)} rad/s`,
      1
    );
    const skewIn = MR.controls.button("deskew", () => {
      state.deskew = !state.deskew;
      skewIn.textContent = state.deskew ? "use one pose" : "deskew";
      stage.refresh();
    });
    const lineIn = MR.controls.button("point-to-line", () => {
      state.line = !state.line;
      lineIn.textContent = state.line ? "point-to-point" : "point-to-line";
      stage.refresh();
    });
    controls.append(wIn.wrap, skewIn, lineIn);
    function show(...which) {
      controls.hidden = !which.length;
      [
        [wIn.wrap, "w"],
        [skewIn, "deskew"],
        [lineIn, "line"],
      ].forEach(([el, key]) => (el.style.display = which.includes(key) ? "" : "none"));
    }

    /* ---------------------------------------------- data */

    const SCAN = MR.scan(world, POSE, { n: 360, sd: 0.01, seed: 3 });
    const LOCAL = MR.scanPoints(SCAN);
    const WORLD = MR.scanPoints(SCAN, POSE);
    const P2 = MR.compose(POSE, MOVE);
    const SCAN2 = MR.scanPoints(MR.scan(world, P2, { n: 360, sd: 0.01, seed: 5 }));
    const ICP = { false: MR.icp(SCAN2, LOCAL), true: MR.icp(SCAN2, LOCAL, { line: true }) };

    // lidar odometry around part 4's square, with part 4's wheel errors: scan every 0.2 s, match each scan to the last
    let chain = null;
    function chained() {
      if (chain) return chain;
      const d = MR.drive(MR.square(3), { start: [1, 1, 0], radiusR: 0.005, track: 0.01, slip: 0.02 });
      const N = d.truth.length;
      const ks = [];
      for (let k = 0; k < N; k += 10) ks.push(k);
      if (ks[ks.length - 1] !== N - 1) ks.push(N - 1);
      const run = (line) => {
        let est = d.truth[0].slice();
        const path = [est];
        let prev = null;
        let prevK = 0;
        for (const k of ks) {
          const sc = MR.scanPoints(MR.scan(world, d.truth[k], { n: 180, sd: 0.01, seed: 1000 + k }));
          if (prev) {
            const I = MR.icp(sc, prev, { guess: MR.relative(d.odom[prevK], d.odom[k]), iters: 20, line });
            est = MR.compose(est, I.T);
            path.push(est);
          }
          prev = sc;
          prevK = k;
        }
        return path;
      };
      chain = { d, p2p: run(false), p2l: run(true) };
      return chain;
    }
    const off = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

    /* ---------------------------------------------- render */

    function roomOnly() {
      MR.view.hideAll(P);
      MR.view.arrange(svg, [{ obj: R }]);
    }

    const steps = {
      polar() {
        show();
        MR.view.hideAll(R);
        const xs = SCAN.map((b) => MR.deg(b.a));
        P.title("one scan: range of each beam (m)");
        P.set([{ xs, ys: SCAN.map((b) => (isFinite(b.r) ? b.r : null)), cls: "is-a", dots: true }], {
          xMax: 360,
          yMin: 0,
          yMax: 8,
          xTitle: "beam angle (°)",
        });
        MR.view.arrange(svg, [{ obj: P }]);
        const fin = SCAN.filter((b) => isFinite(b.r)).map((b) => b.r);
        strip(`${SCAN.length} numbers, one per degree · nearest ${f2(Math.min(...fin))} m, furthest ${f2(Math.max(...fin))} m`);
      },

      points() {
        show();
        const i = 40;
        const b = SCAN[i];
        const hit = MR.toWorld(POSE, [b.r * Math.cos(b.a), b.r * Math.sin(b.a)]);
        R.set("a", R.dots(WORLD, "is-b", 1.8), R.line(POSE, hit, "is-a"), R.dot(hit, "is-a", 5));
        R.set("robot", R.robot(POSE, "is-a", 0.36));
        roomOnly();
        const [x, y] = LOCAL[i];
        strip(`beam ${i}: ${i}° and ${f2(b.r)} m → x = r cos θ = ${f2(x)}, y = r sin θ = ${f2(y)} in the lidar's frame`);
      },

      skew() {
        show("w", "deskew");
        const beams = MR.movingScan(world, POSE, V, state.w);
        const pts = MR.skewedPoints(beams, POSE, V, state.w, state.deskew);
        const end = MR.arcStep(POSE, (V - (state.w * MR.ROBOT.track) / 2) * 0.1, (V + (state.w * MR.ROBOT.track) / 2) * 0.1);
        R.set("a", R.dots(pts, state.deskew ? "is-c" : "is-b", 1.8));
        R.set("robot", R.robot(POSE, "is-muted", 0.36), R.robot(end, "is-a", 0.36));
        roomOnly();
        const e = pts.map(near);
        strip(`${state.deskew ? "deskewed" : "from one pose"}: points ${cm(MR.mean(e))} off the walls on average, ${cm(Math.max(...e))} at worst`);
      },

      lines() {
        show();
        const runs = MR.segmentScan(WORLD);
        const lines = runs.flatMap((r) => MR.splitMerge(r));
        const cls = ["is-a", "is-b", "is-c", "is-d", "is-e"];
        R.set(
          "a",
          R.dots(WORLD, "is-muted", 1.4),
          lines.map((l, i) => R.line(l[0], l[1], `is-thick ${cls[i % cls.length]}`))
        );
        R.set("robot", R.robot(POSE, "is-a", 0.36));
        roomOnly();
        strip(
          `${WORLD.length} points → ${runs.length} runs (split where neighbours are over 30 cm apart) → ${lines.length} straight lines, within 5 cm`
        );
      },

      icp(t = 0) {
        show("line");
        const I = ICP[state.line];
        const k = Math.min(I.history.length - 1, Math.floor((t ?? 0) * I.history.length));
        const T = I.history[k];
        const moved = SCAN2.map((p) => MR.toWorld(MR.compose(POSE, T), p));
        R.set("a", R.dots(WORLD, "is-a", 1.8), R.dots(moved, "is-b", 1.8));
        R.set("robot", R.robot(POSE, "is-a", 0.36), R.robot(MR.compose(POSE, T), "is-b", 0.36));
        roomOnly();
        strip(
          `round ${k} of ${I.history.length - 1} · ${cm(Math.hypot(T[0], T[1]))}, ${MR.deg(T[2]).toFixed(1)}° (truth ${cm(Math.hypot(MOVE[0], MOVE[1]))}, 8.0°) · gap ${cm(I.errs[Math.min(k, I.errs.length - 1)])}`
        );
      },

      chain() {
        show("line");
        const c = chained();
        const est = state.line ? c.p2l : c.p2p;
        const T = c.d.truth[c.d.truth.length - 1];
        const O = c.d.odom[c.d.odom.length - 1];
        const E = est[est.length - 1];
        R.set(
          "a",
          R.path(c.d.truth, "is-a"),
          R.path(c.d.odom, "is-d is-dash"),
          R.path(est, state.line ? "is-c" : "is-b"),
          R.dot(E, state.line ? "is-c" : "is-b", 4)
        );
        R.set("robot", R.robot(T, "is-a", 0.36));
        roomOnly();
        strip(
          `after one lap · wheels ${cm(off(T, O))} off · ${state.line ? "point-to-line" : "point-to-point"} ICP ${cm(off(T, E))}, ${MR.deg(MR.wrap(E[2] - T[2])).toFixed(1)}°`
        );
      },
    };

    return { render: (id, t) => steps[id](t) };
  };
})();
