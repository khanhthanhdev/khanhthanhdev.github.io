// Part 10 of the mobile robots series: ROS 2. A robot's software as a graph of nodes passing messages on topics;
// reliable and best-effort delivery over a lossy link; how deep a subscriber's queue should be; how the map → odom
// transform hides odometry's drift; and why every message carries the time it was measured.
(function () {
  "use strict";

  const MR = window.MR;
  const { s } = MR.view;
  const { slider } = MR.controls;
  const cm = (v) => `${(v * 100).toFixed(1)} cm`;
  const ms = (v) => `${Math.round(v * 1000)} ms`;

  const POSE = [4.6, 3.6, MR.rad(15)];
  const V = 0.4; // m/s
  const W = 1; // rad/s, while the scan is being transformed
  const START = [1, 1, 0]; // where the lap starts, and the odom frame with it

  MR.scenes.part10 = function (stage) {
    const { svg, controls, strip } = stage;
    const tall = window.TF.view.narrow.matches;
    const world = MR.room();
    const R = MR.view.room(svg, world, { title: "the room from above (1 m grid)" });
    const P = MR.view.plot(svg, { width: 420, height: 220, right: 60 });

    /* ---------------------------------------------- inputs */

    const state = { loss: 10, reliable: false, depth: 10, late: 50 };
    const lossIn = slider(
      "messages lost on Wi-Fi",
      0,
      40,
      state.loss,
      (v) => ((state.loss = v), stage.refresh()),
      (v) => `${v}%`,
      1
    );
    const relIn = MR.controls.button("reliable", () => {
      state.reliable = !state.reliable;
      relIn.textContent = state.reliable ? "best effort" : "reliable";
      stage.refresh();
    });
    const depthIn = slider("history depth", 1, 20, state.depth, (v) => ((state.depth = v), stage.refresh()), String, 1);
    const lateIn = slider(
      "looked up late",
      0,
      200,
      state.late,
      (v) => ((state.late = v), stage.refresh()),
      (v) => `${v} ms`,
      5
    );
    controls.append(lossIn.wrap, relIn, depthIn.wrap, lateIn.wrap);
    function show(...which) {
      controls.hidden = !which.length;
      [
        [lossIn.wrap, "loss"],
        [relIn, "reliable"],
        [depthIn.wrap, "depth"],
        [lateIn.wrap, "late"],
      ].forEach(([el, key]) => (el.style.display = which.includes(key) ? "" : "none"));
    }

    /* ---------------------------------------------- the node graph */

    const EDGES = [
      ["lidar driver", "/scan", "SLAM or AMCL"],
      ["micro-ROS agent", "/odom", "EKF"],
      ["EKF", "tf: odom → base_link", "SLAM or AMCL"],
      ["SLAM or AMCL", "/map, tf: map → odom", "Nav2"],
      ["Nav2", "/cmd_vel", "micro-ROS agent"],
    ];
    const graph = MR.view.group(svg, tall ? { x: -10, y: -40, width: 320, height: 470 } : { x: -10, y: -40, width: 640, height: 380 });
    {
      const g = graph.el;
      g.append(s("text", { class: "tf-mat-title", x: 0, y: -16, text: "nodes (boxes) and the topics between them" }));
      if (tall) {
        // one row per topic: publisher → subscriber
        EDGES.forEach(([a, topic, b], i) => {
          const y = i * 88;
          MR.view.box(g, 0, y + 16, 130, 40, a, "", "is-a");
          MR.view.box(g, 170, y + 16, 130, 40, b, "", "is-d");
          g.append(s("text", { class: "tf-small", x: 150, y: y + 8, "text-anchor": "middle", text: topic }));
          MR.view.arrow(g, [132, y + 36], [168, y + 36]);
        });
      } else {
        const B = {
          lidar: [0, 0],
          slam: [235, 0],
          nav: [470, 140],
          ekf: [235, 170],
          agent: [235, 300],
          esp: [0, 300],
        };
        const bw = 170;
        const bh = 46;
        MR.view.box(g, ...B.lidar, bw, bh, "lidar driver", "", "is-c");
        MR.view.box(g, ...B.slam, bw, bh, "SLAM or AMCL", "where am I?", "is-a");
        MR.view.box(g, ...B.nav, bw, bh, "Nav2", "plan and follow a route", "is-d");
        MR.view.box(g, ...B.ekf, bw, bh, "EKF", "odometry + IMU", "is-a");
        MR.view.box(g, ...B.agent, bw, bh, "micro-ROS agent", "", "is-muted");
        MR.view.box(g, ...B.esp, bw, bh, "ESP32", "wheels, encoders", "is-muted");
        const mid = (b, dx = bw / 2, dy = bh / 2) => [b[0] + dx, b[1] + dy];
        MR.view.arrow(g, mid(B.lidar, bw + 2), mid(B.slam, -2), "/scan");
        MR.view.arrow(g, mid(B.agent, bw / 2, -2), mid(B.ekf, bw / 2, bh + 2));
        g.append(s("text", { class: "tf-small", x: B.agent[0] + bw / 2 + 8, y: 258, text: "/odom" }));
        MR.view.arrow(g, mid(B.ekf, bw / 2, -2), mid(B.slam, bw / 2, bh + 2));
        g.append(s("text", { class: "tf-small", x: B.slam[0] + bw / 2 + 8, y: 104, text: "tf: odom → base_link" }));
        MR.view.arrow(g, mid(B.slam, bw + 2, bh), mid(B.nav, 40, -2));
        g.append(s("text", { class: "tf-small", x: 470, y: 62, text: "/map, tf: map → odom" }));
        MR.view.arrow(g, mid(B.nav, 40, bh + 2), mid(B.agent, bw + 2, bh / 2));
        g.append(s("text", { class: "tf-small", x: 470, y: 260, text: "/cmd_vel" }));
        MR.view.arrow(g, mid(B.agent, -2), mid(B.esp, bw + 2), "serial");
      }
    }

    /* ---------------------------------------------- the drive for the tf step */

    let lap = null;
    function drive() {
      if (!lap) lap = MR.drive(MR.square(3), { start: START, radiusR: 0.005, track: 0.01, slip: 0.02 });
      return lap;
    }
    // a frame's x (red) and y (green) axes, drawn at a pose
    function axes(pose, name, len = 0.6) {
      const o = R.px(pose);
      const x = R.px(MR.toWorld(pose, [len, 0]));
      const y = R.px(MR.toWorld(pose, [0, len]));
      return [
        s("line", { class: "mr-line is-b", x1: o[0], y1: o[1], x2: x[0], y2: x[1], "marker-end": "url(#mr-head)" }),
        s("line", { class: "mr-line is-c", x1: o[0], y1: o[1], x2: y[0], y2: y[1], "marker-end": "url(#mr-head)" }),
        R.text(MR.toWorld(pose, [len + 0.1, 0]), name, "mr-label", "start", 4),
      ];
    }

    /* ---------------------------------------------- render */

    function plotOnly() {
      MR.view.hideAll(R, graph);
      MR.view.arrange(svg, [{ obj: P }]);
    }
    function roomOnly() {
      MR.view.hideAll(P, graph);
      MR.view.arrange(svg, [{ obj: R }]);
    }

    const steps = {
      graph() {
        show();
        MR.view.hideAll(P, R);
        MR.view.arrange(svg, [{ obj: graph }]);
        strip("a publisher doesn't know who listens · a subscriber doesn't know who sends");
      },

      qos() {
        show("loss", "reliable");
        const mode = state.reliable ? "reliable" : "best_effort";
        const lat = MR.qos(mode, { loss: state.loss / 100 });
        const got = lat.filter((v) => v != null);
        P.title("delay of each scan (ms)");
        P.set(
          [{ xs: lat.map((_, i) => i / 10), ys: lat.map((v) => (v == null ? null : v * 1000)), cls: state.reliable ? "is-d" : "is-a", dots: true }],
          {
            xMax: 10,
            yMin: 0,
            yMax: 120,
            xTitle: "time (s)",
          }
        );
        plotOnly();
        strip(
          `${state.reliable ? "reliable" : "best effort"} · ${lat.length - got.length} of ${lat.length} lost · mean delay ${(MR.mean(got) * 1000).toFixed(1)} ms, worst ${ms(Math.max(...got))}`
        );
      },

      depth() {
        show("depth");
        const q = MR.frameQueue({ proc: 0.04, depth: state.depth });
        const kept = q.filter((v) => v != null);
        P.title("age of each result when it's ready (ms)");
        P.set([{ xs: q.map((_, i) => i / 30), ys: q.map((v) => (v == null ? null : v * 1000)), cls: "is-a", dots: true }], {
          xMax: 10,
          yMin: 0,
          yMax: 500,
          xTitle: "time (s)",
        });
        plotOnly();
        strip(`depth ${state.depth} · ${kept.length} of ${q.length} frames used · results ${ms(MR.mean(kept))} old on average`);
      },

      tf(t = 0) {
        show();
        const d = drive();
        const k = Math.min(d.truth.length - 1, Math.round((t ?? 0) * (d.truth.length - 1)));
        const truth = d.truth[k];
        const odom = d.odom[k];
        // odom → base_link: the odometry, in a frame that starts where the robot started. map → odom is what makes it
        // land on the truth: map→odom ∘ odom→base_link = map→base_link
        const ob = MR.relative(START, odom);
        const mo = MR.compose(truth, MR.relative(ob, [0, 0, 0]));
        const moved = MR.relative(START, mo);
        const shown = (path) => path.slice(0, k + 1).filter((_, i) => i % 4 === 0 || i === k);
        R.set(
          "a",
          R.path(shown(d.odom), "is-d is-dash"),
          R.path(shown(d.truth), "is-a"),
          axes([0, 0, 0], "map"),
          axes(mo, "odom"),
          R.robot(odom, "is-d is-ghost", 0.36)
        );
        R.set("robot", R.robot(truth, "is-a", 0.36));
        roomOnly();
        strip(
          `${d.t[k].toFixed(0)} s · odometry ${cm(Math.hypot(odom[0] - truth[0], odom[1] - truth[1]))} off · odom frame moved ${cm(Math.hypot(moved[0], moved[1]))}, ${MR.deg(moved[2]).toFixed(1)}°`
        );
      },

      stamp() {
        show("late");
        const dt = state.late / 1000;
        const later = MR.arcStep(POSE, (V - (W * MR.ROBOT.track) / 2) * dt, (V + (W * MR.ROBOT.track) / 2) * dt);
        const local = MR.scanPoints(MR.scan(world, POSE, { n: 360, sd: 0.01, seed: 3 }));
        const right = local.map((p) => MR.toWorld(POSE, p));
        const wrong = local.map((p) => MR.toWorld(later, p));
        const e = right.map((p, i) => Math.hypot(p[0] - wrong[i][0], p[1] - wrong[i][1]));
        R.set("a", R.dots(right, "is-muted", 1.6), R.dots(wrong, "is-b", 1.8));
        R.set("robot", R.robot(later, "is-muted", 0.36), R.robot(POSE, "is-a", 0.36));
        roomOnly();
        strip(`turning at 1 rad/s · ${state.late} ms late: points ${cm(MR.mean(e))} off on average, ${cm(Math.max(...e))} at worst`);
      },
    };

    return { render: (id, t) => steps[id](t) };
  };
})();
