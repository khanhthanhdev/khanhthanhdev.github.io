// Part 2 of the mobile robots series: wheels and kinematics. How two wheel speeds become one motion of the robot:
// straight lines, arcs about the instantaneous centre of rotation, turning on the spot, the sideways motion a
// differential drive can't make, and what happens when the motion is added up in coarse time steps.
(function () {
  "use strict";

  const MR = window.MR;
  const { s } = MR.view;
  const { slider } = MR.controls;
  const f2 = (v) => v.toFixed(2).replace("-", "−");
  const L = MR.ROBOT.track;

  // A patch of floor 4 m × 3 m, empty, drawn larger than the room so the wheels show.
  const FLOOR = { w: 4, h: 3, shapes: [], segs: [] };
  const START = [1.0, 1.0, 0];
  const SECONDS = 4;

  // The path for constant wheel speeds, in fine exact steps.
  function run(vl, vr, start = START, seconds = SECONDS, dt = 0.02) {
    let p = start.slice();
    const out = [p];
    for (let t = 0; t < seconds - 1e-9; t += dt) {
      p = MR.arcStep(p, vl * dt, vr * dt);
      out.push(p);
    }
    return out;
  }
  // A circle driven with three ways of adding up the steps: Euler (move, then turn), midpoint, and the exact arc.
  function integrate(kind, v, w, dt, seconds) {
    let p = START.slice();
    const out = [p];
    const n = Math.round(seconds / dt);
    dt = seconds / n;
    for (let i = 0; i < n; i++) {
      const [vl, vr] = MR.wheels(v, w);
      if (kind === "euler") p = [p[0] + v * dt * Math.cos(p[2]), p[1] + v * dt * Math.sin(p[2]), p[2] + w * dt];
      else if (kind === "mid") p = MR.midStep(p, vl * dt, vr * dt);
      else p = MR.arcStep(p, vl * dt, vr * dt);
      out.push(p);
    }
    return out;
  }

  MR.scenes.part2 = function (stage) {
    const { svg, controls, strip } = stage;
    const R = MR.view.room(svg, FLOOR, { S: 120, title: "a patch of floor (1 m grid)", walls: true });

    /* ---------------------------------------------- inputs */

    const state = { vl: 0.2, vr: 0.4 };
    const ms = (v) => `${v.toFixed(2)} m/s`;
    const left = slider(
      "left wheel",
      -0.5,
      0.5,
      state.vl,
      (v) => {
        state.vl = v;
        stage.refresh();
      },
      ms,
      0.05
    );
    const right = slider(
      "right wheel",
      -0.5,
      0.5,
      state.vr,
      (v) => {
        state.vr = v;
        stage.refresh();
      },
      ms,
      0.05
    );
    controls.append(left.wrap, right.wrap);
    function lock(vl, vr) {
      // steps with fixed wheel speeds show them on the sliders but don't follow them
      left.set(vl);
      right.set(vr);
      left.el.disabled = right.el.disabled = true;
    }
    function unlock() {
      left.set(state.vl);
      right.set(state.vr);
      left.el.disabled = right.el.disabled = false;
    }

    /* ---------------------------------------------- drawing */

    // The robot drawn to scale with its wheel speed arrows.
    function bot(pose, vl, vr, cls = "is-a") {
      const S = R.S;
      const nodes = [R.robot(pose, cls, 0.3)];
      [
        [vl, L / 2],
        [vr, -L / 2],
      ].forEach(([v, side]) => {
        const a = MR.toWorld(pose, [0, side]);
        const b = MR.toWorld(pose, [v * 1.2, side]);
        if (Math.abs(v) > 1e-6) nodes.push(R.line(a, b, "is-d mr-vel"));
        nodes.push(R.dot(a, "is-d", 2.5));
      });
      void S;
      return nodes;
    }
    function icrMarks(pose, vl, vr) {
      const r = MR.icr(vl, vr);
      if (!isFinite(r)) return [];
      const c = MR.toWorld(pose, [0, r]);
      return [
        R.line(MR.toWorld(pose, [0, L / 2]), c, "is-dash is-e"),
        R.line(MR.toWorld(pose, [0, -L / 2]), c, "is-dash is-e"),
        R.dot(c, "is-e", 4),
        R.text(c, "ICR", "is-e mr-label is-strong", "start", -8),
      ];
    }

    /* ---------------------------------------------- render */

    function drive(vl, vr, t, label) {
      const path = run(vl, vr);
      const k = Math.round(t * (path.length - 1));
      const pose = path[k];
      R.set("a", R.path(path, "is-a is-thin is-dash"), R.path(path.slice(0, k + 1), "is-a"));
      R.set("b", icrMarks(pose, vl, vr));
      R.set("robot", bot(pose, vl, vr));
      MR.view.arrange(svg, [{ obj: R }]);
      const [v, w] = MR.twist(vl, vr);
      const r = MR.icr(vl, vr);
      strip(
        `${label}vₗ = ${f2(vl)}, vᵣ = ${f2(vr)} m/s → v = ${f2(v)} m/s, ω = ${f2(w)} rad/s (${Math.round(MR.deg(w))}°/s)` +
          (isFinite(r) ? `, R = ${f2(r)} m` : ", R = ∞ (straight)")
      );
    }

    const steps = {
      wheels() {
        lock(0.3, 0.3);
        controls.hidden = false;
        R.set("a");
        R.set(
          "b",
          R.line(MR.toWorld(START, [0, L / 2]), MR.toWorld(START, [0, -L / 2]), "is-dash"),
          R.text(MR.toWorld(START, [-0.1, 0.25]), "L = 0.22 m", "", "middle")
        );
        R.set("robot", bot(START, 0.3, 0.3));
        MR.view.arrange(svg, [{ obj: R }]);
        strip("two driven wheels, L = 0.22 m apart, each pushing the robot forward at its own speed (orange arrows)");
      },
      straight: (t) => {
        lock(0.3, 0.3);
        drive(0.3, 0.3, t, "");
      },
      arc: (t) => {
        unlock();
        drive(state.vl, state.vr, t, "");
      },
      spin: (t) => {
        lock(-0.2, 0.2);
        drive(-0.2, 0.2, t, "");
      },
      sideways() {
        lock(0, 0);
        // to end up 0.5 m to the left, facing the same way: turn left, drive, turn right
        const legs = [
          [0, 1, Math.PI / 2],
          [0.25, 0, 2],
          [0, -1, Math.PI / 2],
        ];
        const d = MR.drive(legs, { start: [1.5, 1.0, 0] });
        R.set("a", R.path(d.truth, "is-a"));
        R.set(
          "b",
          R.line([1.5, 1.0], [1.5, 1.5], "is-b is-dash"),
          R.text([1.55, 1.25], "sideways: impossible", "is-b mr-label", "start"),
          R.robot([1.5, 1.0, 0], "is-a is-ghost", 0.3)
        );
        R.set("robot", R.robot(d.truth[d.truth.length - 1], "is-a", 0.3));
        MR.view.arrange(svg, [{ obj: R }]);
        const end = d.truth[d.truth.length - 1];
        strip(
          `turn 90° left, drive 0.50 m, turn 90° right: the robot ends at (${f2(end[0])}, ${f2(end[1])}), ${Math.round(MR.deg(end[2]))}°, in ${d.t[d.t.length - 1].toFixed(1)} s`
        );
      },
      steps(t) {
        // half a circle of radius 0.5 m in 5 s, added up in steps of 0.1 s, then 0.5 s, then 1 s as the reader scrolls
        const v = 0.1 * Math.PI;
        const w = Math.PI / 5;
        lock(...MR.wheels(v, w).map((x) => Math.round(x * 100) / 100));
        const dts = [0.1, 0.5, 1.0];
        const dt = dts[Math.min(2, Math.floor(t * 3))];
        const exact = integrate("arc", v, w, 0.02, 5);
        const euler = integrate("euler", v, w, dt, 5);
        const mid = integrate("mid", v, w, dt, 5);
        R.set("a", R.path(exact, "is-ink is-thin"), R.path(euler, "is-b"), R.path(mid, "is-c is-dash"));
        R.set("b", R.dots(euler, "is-b", 2.5), R.dots(mid, "is-c", 2.5));
        R.set("robot", R.robot(START, "is-a", 0.3));
        MR.view.arrange(svg, [{ obj: R }]);
        const end = exact[exact.length - 1];
        const gap = (p) => Math.hypot(p[0] - end[0], p[1] - end[1]) * 100;
        strip(
          `dt = ${dt} s, ${Math.round(5 / dt)} steps for half a circle of radius 0.50 m · Euler (red) ends ${gap(euler[euler.length - 1]).toFixed(1)} cm from the true end · midpoint (green) ${gap(mid[mid.length - 1]).toFixed(1)} cm`
        );
      },
    };

    return { render: (id, t) => steps[id](t) };
  };
})();
