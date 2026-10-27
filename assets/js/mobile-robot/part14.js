// Part 14 of the mobile robots series: SLAM, building the map while finding the robot in it. An occupancy grid
// built scan by scan from known poses; the same map from drifting odometry; from scan matching, which drifts less;
// closing the loop with a pose graph when the robot sees its start again; and what one wrong loop closure does.
(function () {
  "use strict";

  const MR = window.MR;
  const { rgbOf, mix } = MR.view;
  const cm = (v) => `${(v * 100).toFixed(1)} cm`;
  const dist = (v) => (v < 1 ? cm(v) : `${v.toFixed(2)} m`);
  const pc = (v) => `${Math.round(100 * v)}%`;

  // part 12's lap of the room, with its 5% wheel noise and no beacons; a keyframe every half second
  const START = [0.8, 3.2, 0];
  const LEGS = [];
  for (const side of [8.2, 2.2, 8.2, 2.2]) LEGS.push([0.3, 0, side / 0.3], [0, 0.6, Math.PI / 2 / 0.6]);
  const EVERY = 5;
  const W_EDGE = [100, 100, 400];
  const SCAN = { n: 180, sd: 0.03 }; // a cheaper lidar than part 9's

  MR.scenes.part14 = function (stage) {
    const { svg, controls, strip } = stage;
    const world = MR.room();
    const R = MR.view.room(svg, world, { title: "the room from above (1 m grid)" });
    R.layer("map"); // under the paths and the robot

    /* ---------------------------------------------- inputs */

    const state = { closed: false };
    const loopIn = MR.controls.button("close the loop", () => {
      state.closed = !state.closed;
      loopIn.textContent = state.closed ? "undo the loop closure" : "close the loop";
      stage.refresh();
    });
    controls.append(loopIn);
    function show(...which) {
      controls.hidden = !which.length;
      loopIn.style.display = which.includes("loop") ? "" : "none";
    }

    /* ---------------------------------------------- data */

    const off = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let data = null;
    function lap() {
      if (data) return data;
      const d = MR.ekfRun(LEGS, { start: START, beacons: false });
      const N = d.truth.length;
      const ks = [];
      for (let k = 0; k < N; k += EVERY) ks.push(k);
      if (ks[ks.length - 1] !== N - 1) ks.push(N - 1);
      const truth = ks.map((k) => d.truth[k]);
      const odom = ks.map((k) => d.odom[k]);
      const scans = truth.map((p, i) => MR.scan(world, p, { ...SCAN, seed: 500 + i }));
      const pts = scans.map((s) => MR.scanPoints(s));
      // scan matching between each keyframe and the one before: lidar odometry, as in part 9
      const edges = [];
      const icp = [odom[0].slice()];
      for (let i = 1; i < ks.length; i++) {
        const I = MR.icp(pts[i], pts[i - 1], { guess: MR.relative(odom[i - 1], odom[i]), iters: 20, line: true });
        edges.push({ i: i - 1, j: i, z: I.T, w: W_EDGE });
        icp.push(MR.compose(icp[i - 1], I.T));
      }
      // the loop closure: the last scan matched against the first
      const last = ks.length - 1;
      const L = MR.icp(pts[last], pts[0], { guess: MR.relative(icp[0], icp[last]), iters: 30, line: true });
      const loop = { i: 0, j: last, z: L.T, w: W_EDGE };
      const graph = MR.poseGraph(icp, [...edges, loop], 10);
      // a wrong one: the middle of the lap, at the far end of the room, taken for the start
      const mid = Math.round(ks.length / 2);
      const wrong = MR.poseGraph(icp, [...edges, loop, { i: 0, j: mid, z: L.T, w: W_EDGE }], 10);
      data = { truth, odom, scans, icp, graph: graph.X, costs: graph.costs, loopFit: L.errs[L.errs.length - 1], wrong: wrong.X, mid, last };
      return data;
    }
    const maps = new Map();
    function mapOf(key, poses, n = poses.length) {
      const k = `${key}:${n}`;
      if (!maps.has(k)) maps.set(k, MR.mapFrom(world, poses.slice(0, n), lap().scans.slice(0, n)));
      return maps.get(k);
    }

    /* ---------------------------------------------- drawing */

    // unknown cells are left clear, free ones tinted, occupied ones dark, by how sure the map is
    // the colours, read again whenever the theme changes, since the map repaints itself then
    let pal = null;
    let palTheme;
    function palette() {
      const theme = document.documentElement.getAttribute("data-theme");
      if (theme !== palTheme) {
        palTheme = theme;
        pal = { ink: rgbOf("--mr-ink"), free: mix(rgbOf("--mr-floor"), rgbOf("--mr-a"), 0.12) };
      }
      return pal;
    }
    function paintMap(g) {
      R.painted("map", g.W, g.H, (c, r) => {
        const { ink, free } = palette();
        const p = MR.occProb(g.L[r * g.W + c]);
        if (p > 0.5) return [...ink, Math.round(255 * Math.min(1, (p - 0.5) * 2.5))];
        if (p < 0.5) return [...free, Math.round(255 * Math.min(1, (0.5 - p) * 4))];
        return [0, 0, 0, 0];
      });
    }
    function counts(g) {
      let free = 0;
      let occ = 0;
      for (const l of g.L) {
        const p = MR.occProb(l);
        if (p < 0.35) free++;
        else if (p > 0.65) occ++;
      }
      return { free, occ };
    }
    const score = (g) => MR.mapScore(world, g).share;
    const meanErr = (X) => MR.mean(X.map((p, i) => off(p, lap().truth[i])));
    const worstErr = (X) => Math.max(...X.map((p, i) => off(p, lap().truth[i])));

    /* ---------------------------------------------- render */

    const steps = {
      grid(t = 0) {
        show();
        const D = lap();
        const n = Math.max(1, Math.min(D.truth.length, 1 + Math.round((t ?? 0) * (D.truth.length - 1))));
        const g = mapOf("truth", D.truth, n);
        paintMap(g);
        R.set("a", R.rays(D.truth[n - 1], D.scans[n - 1], { cls: "is-a" }), n > 1 ? R.path(D.truth.slice(0, n), "is-a") : null);
        MR.view.arrange(svg, [{ obj: R }]);
        R.set("robot", R.robot(D.truth[n - 1], "is-a", 0.36));
        const c = counts(g);
        strip(`${n} scan${n > 1 ? "s" : ""} · ${c.free.toLocaleString("en")} cells free, ${c.occ} occupied, the rest unknown`);
      },

      odom() {
        show();
        const D = lap();
        const g = mapOf("odom", D.odom);
        paintMap(g);
        R.set("a", R.path(D.truth, "is-a"), R.path(D.odom, "is-d is-dash"));
        MR.view.arrange(svg, [{ obj: R }]);
        R.set("robot", R.robot(D.odom[D.last], "is-d is-ghost", 0.36), R.robot(D.truth[D.last], "is-a", 0.36));
        strip(`odometry ends ${dist(off(D.odom[D.last], D.truth[D.last]))} off · ${pc(score(g))} of the map's walls are real`);
      },

      match() {
        show();
        const D = lap();
        const g = mapOf("icp", D.icp);
        paintMap(g);
        R.set("a", R.path(D.truth, "is-a"), R.path(D.icp, "is-c"));
        MR.view.arrange(svg, [{ obj: R }]);
        R.set("robot", R.robot(D.icp[D.last], "is-c is-ghost", 0.36), R.robot(D.truth[D.last], "is-a", 0.36));
        strip(`scan matching ends ${cm(off(D.icp[D.last], D.truth[D.last]))} off · ${pc(score(g))} of the map's walls are real`);
      },

      loop() {
        show("loop");
        const D = lap();
        const X = state.closed ? D.graph : D.icp;
        const g = mapOf(state.closed ? "graph" : "icp", X);
        paintMap(g);
        const nodes = X.filter((_, i) => i % 4 === 0);
        R.set("a", R.path(D.truth, "is-a"), R.path(X, "is-c"), R.dots(nodes, "is-c", 2.5), R.line(X[0], X[D.last], "is-e is-dash"));
        MR.view.arrange(svg, [{ obj: R }]);
        R.set("robot", R.robot(X[D.last], "is-c is-ghost", 0.36), R.robot(D.truth[D.last], "is-a", 0.36));
        strip(`${state.closed ? "loop closed" : "open loop"} · worst pose ${cm(worstErr(X))} off · ${pc(score(g))} of the map's walls are real`);
      },

      wrong() {
        show();
        const D = lap();
        const g = mapOf("wrong", D.wrong);
        paintMap(g);
        R.set(
          "a",
          R.path(D.truth, "is-a"),
          R.path(D.wrong, "is-c"),
          R.line(D.truth[0], D.truth[D.mid], "is-b is-dash"),
          R.dots([D.truth[0], D.truth[D.mid]], "is-b", 4)
        );
        MR.view.arrange(svg, [{ obj: R }]);
        R.set("robot", R.robot(D.truth[D.last], "is-a", 0.36));
        strip(`one wrong loop closure · poses ${dist(meanErr(D.wrong))} off on average · ${pc(score(g))} of walls real`);
      },
    };

    return { render: (id, t) => steps[id](t) };
  };
})();
