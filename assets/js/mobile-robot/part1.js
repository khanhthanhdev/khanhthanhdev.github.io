// Part 1 of the mobile robots series: what a mobile robot is. The sense–think–act loop, the robot's pose in the
// room, its own frame, and the chain of frames (map → odom → base_link → laser) that every ROS robot keeps.
(function () {
  "use strict";

  const MR = window.MR;
  const { s } = MR.view;
  const { slider } = MR.controls;
  const f2 = (v) => v.toFixed(2).replace("-", "−");
  const pt = (p) => `(${f2(p[0])}, ${f2(p[1])})`;

  // the numbers the text quotes
  const POSE = [1.2, 0.9, MR.rad(20)];
  const CORNER = [2.6, 1.6]; // the near corner of the box
  const LASER = [0.08, 0, 0]; // the lidar sits 8 cm ahead of the robot's centre
  const DRIVE = MR.drive([[0.3, 0.22, 6]], { start: POSE });
  const SQUARE = MR.drive(MR.square(2.5), { start: [1, 0.8, 0], radiusR: 0.004, track: 0.01 });

  MR.scenes.part1 = function (stage) {
    const { svg, controls, strip } = stage;
    const world = MR.room();
    const R = MR.view.room(svg, world, { title: "the room from above (1 m grid)" });

    /* ---------------------------------------------- inputs */

    const state = { heading: 20 };
    const head = slider(
      "heading θ",
      -180,
      180,
      state.heading,
      (v) => {
        state.heading = v;
        stage.refresh();
      },
      (v) => `${v}°`,
      5
    );
    controls.append(head.wrap);

    /* ---------------------------------------------- the loop diagram */

    const loop = MR.view.group(svg, { x: -10, y: -40, width: 600, height: 330 });
    {
      const g = loop.el;
      g.append(s("text", { class: "tf-mat-title", x: 0, y: -18, text: "sense → think → act, many times a second" }));
      MR.view.box(g, 0, 20, 170, 150, "", "", "is-a");
      g.append(s("text", { class: "mr-box-title", x: 85, y: 44, "text-anchor": "middle", text: "SENSE" }));
      ["wheel encoders", "IMU (gyro, accel.)", "lidar", "depth camera", "bumpers"].forEach((t, i) =>
        g.append(s("text", { class: "tf-small", x: 85, y: 70 + 20 * i, "text-anchor": "middle", text: t }))
      );
      MR.view.box(g, 210, 20, 170, 150, "", "", "is-e");
      g.append(s("text", { class: "mr-box-title", x: 295, y: 44, "text-anchor": "middle", text: "THINK" }));
      ["where am I?", "what's around me?", "where do I go?", "how do I get there?"].forEach((t, i) =>
        g.append(s("text", { class: "tf-small", x: 295, y: 70 + 22 * i, "text-anchor": "middle", text: t }))
      );
      MR.view.box(g, 420, 20, 170, 150, "", "", "is-b");
      g.append(s("text", { class: "mr-box-title", x: 505, y: 44, "text-anchor": "middle", text: "ACT" }));
      ["motor drivers", "two DC motors", "wheels on the floor"].forEach((t, i) =>
        g.append(s("text", { class: "tf-small", x: 505, y: 70 + 22 * i, "text-anchor": "middle", text: t }))
      );
      MR.view.arrow(g, [172, 95], [208, 95]);
      MR.view.arrow(g, [382, 95], [418, 95]);
      MR.view.box(g, 150, 220, 290, 56, "THE WORLD", "floor, walls, people, slip, noise", "");
      MR.view.arrow(g, [505, 172], [442, 246], "motion");
      MR.view.arrow(g, [148, 246], [85, 172], "measurements");
    }

    /* ---------------------------------------------- the frames tree */

    const tree = MR.view.group(svg, { x: -10, y: -30, width: 250, height: 300 });
    const treeBody = s("g");
    tree.el.append(s("text", { class: "tf-mat-title", x: 0, y: -12, text: "the frames, as a tree" }), treeBody);
    function drawTree(lit, rows) {
      const names = ["map", "odom", "base_link", "laser"];
      const nodes = [];
      names.forEach((n, i) => {
        const y = i * 72;
        const b = MR.view.box(treeBody, 0, y, 110, 34, n, "", lit.includes(n) ? "is-on" : "is-dim");
        nodes.push(b);
        if (i) nodes.push(MR.view.arrow(treeBody, [55, y - 36], [55, y - 2]));
        if (rows[i]) nodes.push(s("text", { class: "tf-small", x: 122, y: y + 21, text: rows[i] }));
      });
      treeBody.replaceChildren(...nodes);
    }

    /* ---------------------------------------------- helpers */

    const S = R.S;
    // the world's x and y axes from the origin
    function worldAxes() {
      return [
        s("path", { class: "mr-arrow-path is-b mr-path", d: `M 0 ${world.h * S} h ${S * 1.2}`, "marker-end": "url(#mr-head)" }),
        s("path", { class: "mr-arrow-path is-c mr-path", d: `M 0 ${world.h * S} v ${-S * 1.2}`, "marker-end": "url(#mr-head)" }),
        R.text([1.3, 0], "x", "is-b mr-label", "start", 4),
        R.text([0, 1.35], "y", "is-c mr-label", "middle", -4),
      ];
    }
    // the robot's own axes: x forward (red), y left (green)
    function robotAxes(pose, len = 0.7) {
      const o = R.px(pose);
      const x = R.px(MR.toWorld(pose, [len, 0]));
      const y = R.px(MR.toWorld(pose, [0, len]));
      return [
        s("line", { class: "mr-line is-b", x1: o[0], y1: o[1], x2: x[0], y2: x[1], "marker-end": "url(#mr-head)" }),
        s("line", { class: "mr-line is-c", x1: o[0], y1: o[1], x2: y[0], y2: y[1], "marker-end": "url(#mr-head)" }),
        R.text(MR.toWorld(pose, [len + 0.15, 0]), "x′", "is-b mr-label", "middle", 4),
        R.text(MR.toWorld(pose, [0, len + 0.15]), "y′", "is-c mr-label", "middle", 4),
      ];
    }
    function poseMarks(pose) {
      const [x, y] = R.px(pose);
      const r = 0.55 * S;
      const a = pose[2];
      const end = [x + r * Math.cos(a), y - r * Math.sin(a)];
      return [
        s("line", { class: "mr-line is-dash", x1: x, y1: y, x2: x, y2: world.h * S }),
        s("line", { class: "mr-line is-dash", x1: x, y1: y, x2: 0, y2: y }),
        s("line", { class: "mr-line is-dash", x1: x, y1: y, x2: x + r * 1.3, y2: y }),
        s("path", {
          class: "mr-path is-thin is-e",
          d: `M ${x + r} ${y} A ${r} ${r} 0 ${Math.abs(a) > Math.PI ? 1 : 0} ${a > 0 ? 0 : 1} ${end[0]} ${end[1]}`,
        }),
        R.text([pose[0], 0], `x = ${f2(pose[0])}`, "", "middle", 15),
        R.text([0, pose[1]], `y = ${f2(pose[1])}`, "", "end", 4),
        R.text(MR.toWorld(pose, [0.8, -0.25]), `θ = ${Math.round(MR.deg(pose[2]))}°`, "is-e mr-label", "start"),
      ];
    }
    const clear = (...names) => names.forEach((n) => R.set(n));

    /* ---------------------------------------------- render */

    const steps = {
      loop() {
        controls.hidden = true;
        MR.view.hideAll(R, tree);
        MR.view.arrange(svg, [{ obj: loop }]);
        strip("one turn of the loop: read the sensors, update what the robot believes, choose wheel speeds, send them");
      },

      pose() {
        controls.hidden = false;
        const pose = [POSE[0], POSE[1], MR.rad(state.heading)];
        clear("a", "b", "c");
        R.set("axes", worldAxes(), poseMarks(pose));
        R.set("robot", R.robot(pose, "is-a", 0.4));
        MR.view.hideAll(loop, tree);
        MR.view.arrange(svg, [{ obj: R }]);
        strip(
          `pose (x, y, θ) = (${f2(pose[0])} m, ${f2(pose[1])} m, ${state.heading}°): three numbers say where the robot is and which way it faces`
        );
      },

      frames() {
        controls.hidden = false;
        const pose = [POSE[0], POSE[1], MR.rad(state.heading)];
        const local = MR.toLocal(pose, CORNER);
        R.set("axes", worldAxes());
        R.set("a", robotAxes(pose));
        R.set("b", R.line(pose, CORNER, "is-dash is-b"), R.dot(CORNER, "is-b", 5), R.text(CORNER, "P", "is-b mr-label is-strong", "start", -8));
        R.set("c");
        R.set("robot", R.robot(pose, "is-a", 0.4));
        MR.view.hideAll(loop, tree);
        MR.view.arrange(svg, [{ obj: R }]);
        strip(`P in the robot's frame: ${pt(local)} · the same P in the room: ${pt(CORNER)} · x′ = c·Δx + s·Δy, y′ = −s·Δx + c·Δy`);
      },

      moving(t) {
        controls.hidden = true;
        const k = Math.round(t * (DRIVE.truth.length - 1));
        const pose = DRIVE.truth[k];
        const local = MR.toLocal(pose, CORNER);
        R.set("axes", worldAxes());
        R.set("a", robotAxes(pose));
        R.set("b", R.line(pose, CORNER, "is-dash is-b"), R.dot(CORNER, "is-b", 5), R.text(CORNER, "P", "is-b mr-label is-strong", "start", -8));
        R.set("c", R.path(DRIVE.truth.slice(0, k + 1), "is-a is-thin"));
        R.set("robot", R.robot(pose, "is-a", 0.4));
        MR.view.hideAll(loop, tree);
        MR.view.arrange(svg, [{ obj: R }]);
        strip(
          `t = ${DRIVE.t[k].toFixed(1)} s · robot at ${pt(pose)}, ${Math.round(MR.deg(pose[2]))}° · P in the robot's frame ${pt(local)} · P in the room ${pt(CORNER)}, always`
        );
      },

      chain() {
        controls.hidden = true;
        const pose = POSE;
        const laser = MR.compose(pose, LASER);
        const inLaser = MR.toLocal(laser, CORNER);
        const inBase = MR.toWorld(LASER, inLaser);
        R.set("axes", worldAxes());
        R.set("a", robotAxes(pose, 0.55));
        R.set("b", R.line(laser, CORNER, "is-dash is-b"), R.dot(CORNER, "is-b", 5), R.text(CORNER, "P", "is-b mr-label is-strong", "start", -8));
        R.set("c");
        R.set("robot", R.robot(pose, "is-a", 0.4), R.dot(laser, "is-d", 3.5));
        drawTree(
          ["map", "odom", "base_link", "laser"],
          ["the room (fixed)", "where odometry started", `the robot: ${pt(pose)}, ${Math.round(MR.deg(pose[2]))}°`, "8 cm ahead of the centre"]
        );
        MR.view.hideAll(loop);
        MR.view.arrange(svg, [{ obj: R }, { obj: tree }]);
        strip(`P from the lidar ${pt(inLaser)} → base_link ${pt(inBase)} → map ${pt(MR.toWorld(pose, inBase))}`);
      },

      drift(t) {
        controls.hidden = true;
        const k = Math.max(1, Math.round(t * (SQUARE.truth.length - 1)));
        const truth = SQUARE.truth[k];
        const odom = SQUARE.odom[k];
        // map → odom: the correction that puts the odometry pose on the true one
        const corr = MR.compose(truth, MR.relative(odom, [0, 0, 0]));
        R.set("axes", worldAxes());
        R.set("a");
        R.set("b");
        R.set(
          "c",
          R.path(SQUARE.odom.slice(0, k + 1), "is-d is-dash"),
          R.path(SQUARE.truth.slice(0, k + 1), "is-a"),
          R.robot(odom, "is-d is-ghost", 0.4)
        );
        R.set("robot", R.robot(truth, "is-a", 0.4));
        drawTree(
          ["map", "odom", "base_link"],
          ["the room (fixed)", `map → odom: (${f2(corr[0])}, ${f2(corr[1])}, ${MR.deg(corr[2]).toFixed(1)}°)`, `odometry says ${pt(odom)}`, ""]
        );
        MR.view.hideAll(loop);
        MR.view.arrange(svg, [{ obj: R }, { obj: tree }]);
        const e = Math.hypot(truth[0] - odom[0], truth[1] - odom[1]);
        strip(
          `driven ${SQUARE.t[k].toFixed(0)} s · true pose ${pt(truth)} (blue) · odometry ${pt(odom)} (orange, dashed) · ${(100 * e).toFixed(0)} cm apart`
        );
      },
    };

    return { render: (id, t) => steps[id](t) };
  };
})();
