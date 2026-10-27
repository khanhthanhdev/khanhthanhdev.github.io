// Part 4 of the mobile robots series: encoders and odometry. How a Hall-effect encoder makes two square waves, how
// quadrature tells forward from back, how counts become millimetres and the millimetres a pose, and how small
// errors in the robot's measurements make that pose drift.
(function () {
  "use strict";

  const MR = window.MR;
  const { s } = MR.view;
  const { slider } = MR.controls;
  const f2 = (v) => v.toFixed(2).replace("-", "−");
  const cm = (v) => `${(v * 100).toFixed(1)} cm`;

  const PPR = MR.ROBOT.ppr; // magnet pole pairs on the motor's disc: pulses per motor turn
  const START = [1, 1, 0];
  const SIDE = 3;

  MR.scenes.part4 = function (stage) {
    const { svg, controls, strip } = stage;
    const world = MR.room();
    const R = MR.view.room(svg, world, { title: "a 3 m square, driven anticlockwise" });
    const P = MR.view.plot(svg, { width: 300, height: 180, xTitle: "distance driven (m)", right: 80 });

    /* ---------------------------------------------- inputs */

    const state = { radius: 0.5, track: 1, slip: 2, dir: 1 };
    const pct = (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
    const radIn = slider(
      "right wheel radius",
      -20,
      20,
      state.radius * 10,
      (v) => ((state.radius = v / 10), stage.refresh()),
      (v) => pct(v / 10),
      1
    );
    const trackIn = slider(
      "track width",
      -50,
      50,
      state.track * 10,
      (v) => ((state.track = v / 10), stage.refresh()),
      (v) => pct(v / 10),
      5
    );
    const slipIn = slider(
      "slip σ",
      0,
      50,
      state.slip * 10,
      (v) => ((state.slip = v / 10), stage.refresh()),
      (v) => `${(v / 10).toFixed(1)}%`,
      5
    );
    const dirIn = MR.controls.button("reverse", () => {
      state.dir = -state.dir;
      dirIn.textContent = state.dir > 0 ? "reverse" : "forward";
      stage.refresh();
    });
    controls.append(radIn.wrap, trackIn.wrap, slipIn.wrap, dirIn);
    function show(...which) {
      controls.hidden = !which.length;
      [
        [radIn.wrap, "radius"],
        [trackIn.wrap, "track"],
        [slipIn.wrap, "slip"],
        [dirIn, "dir"],
      ].forEach(([el, key]) => (el.style.display = which.includes(key) ? "" : "none"));
    }

    /* ---------------------------------------------- the encoder: a magnet disc, two Hall sensors, two waves */

    const enc = MR.view.group(svg, { x: -110, y: -146, width: 660, height: 276 });
    const disc = s("g");
    const sensors = s("g");
    const waves = s("g");
    enc.el.append(disc, sensors, waves);
    {
      // 11 pole pairs: 22 alternating segments
      for (let i = 0; i < 2 * PPR; i++) {
        const a0 = (Math.PI * i) / PPR;
        const a1 = (Math.PI * (i + 1)) / PPR;
        const r0 = 62;
        const r1 = 90;
        const p = (r, a) => `${(r * Math.cos(a)).toFixed(1)} ${(-r * Math.sin(a)).toFixed(1)}`;
        disc.append(
          s("path", {
            class: `mr-solid ${i % 2 ? "is-a" : "is-b"}`,
            d: `M ${p(r0, a0)} L ${p(r1, a0)} A ${r1} ${r1} 0 0 0 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 0 1 ${p(r0, a0)} Z`,
            opacity: 0.75,
          })
        );
      }
      disc.append(s("circle", { class: "mr-floor", r: 58 }), s("circle", { class: "mr-solid is-ink", r: 6 }));
      disc.append(s("text", { class: "tf-small", y: 24, "text-anchor": "middle", text: "motor shaft" }));
      // sensor A at the top; sensor B a quarter of a pole pair further round (plus a whole number of pairs)
      const at = (a, label) => {
        const x = 100 * Math.cos(a);
        const y = -100 * Math.sin(a);
        sensors.append(
          s("rect", { class: "mr-solid is-ink", x: x - 6, y: y - 6, width: 12, height: 12, rx: 2 }),
          s("text", { class: "mr-label is-strong", x: x + 12 * Math.cos(a), y: y - 12 * Math.sin(a) + 4, "text-anchor": "middle", text: label })
        );
      };
      at(Math.PI / 2, "A");
      at(Math.PI / 2 - (Math.PI / PPR) * 2.5, "B");
      enc.el.append(s("text", { class: "tf-mat-title", x: -100, y: -128, text: "a Hall-effect encoder on the motor" }));
    }
    // waves: A and B over 3 pulses of rotation, with a cursor at the current angle
    function drawWaves(turn, showStates) {
      const X0 = 150;
      const W = 380;
      const span = 3; // pulses shown
      const X = (c) => X0 + (c / (4 * span)) * W;
      const nodes = [];
      const yA = -60;
      const yB = 10;
      const hgt = 36;
      const wave = (bit, y0, cls) => {
        let d = "";
        for (let c = 0; c <= 4 * span; c++) {
          const v = MR.quadrature(c)[bit];
          const y = y0 + (v ? 0 : hgt);
          d += c === 0 ? `M ${X(c)} ${y}` : ` H ${X(c)} V ${y}`;
        }
        d += ` H ${X(4 * span)}`;
        return s("path", { class: `mr-wave ${cls}`, d });
      };
      nodes.push(wave(0, yA, "is-a"), wave(1, yB, "is-d"));
      nodes.push(s("text", { class: "mr-label is-a is-strong", x: X0 - 14, y: yA + 22, "text-anchor": "end", text: "A" }));
      nodes.push(s("text", { class: "mr-label is-d is-strong", x: X0 - 14, y: yB + 22, "text-anchor": "end", text: "B" }));
      for (let c = 0; c < 4 * span; c++) {
        if (showStates) {
          const [a, b] = MR.quadrature(c);
          nodes.push(s("text", { class: "tf-small", x: (X(c) + X(c + 1)) / 2, y: yB + hgt + 20, "text-anchor": "middle", text: `${a}${b}` }));
        }
        nodes.push(s("line", { class: "mr-gridline", x1: X(c), x2: X(c), y1: yA - 6, y2: yB + hgt + 6 }));
      }
      const c = MR.clamp(turn, 0, 4 * span - 0.001);
      nodes.push(s("line", { class: "mr-line is-b", x1: X(c), x2: X(c), y1: yA - 14, y2: yB + hgt + 8 }));
      nodes.push(s("text", { class: "tf-mat-title", x: X0, y: yA - 22, text: "the two sensors' signals" }));
      waves.replaceChildren(...nodes);
    }

    /* ---------------------------------------------- data */

    const square = () => MR.square(SIDE);
    const runWith = (o = {}) => MR.drive(square(), { start: START, ...o });
    const endErr = (d) => {
      const a = d.truth[d.truth.length - 1];
      const b = d.odom[d.odom.length - 1];
      return { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), head: MR.deg(MR.wrap(a[2] - b[2])), truth: a, odom: b };
    };

    function drawRun(d, k) {
      R.set("a", R.path(d.odom.slice(0, k + 1), "is-d is-dash"), R.path(d.truth.slice(0, k + 1), "is-a"));
      R.set("robot", R.robot(d.odom[k], "is-d is-ghost", 0.36), R.robot(d.truth[k], "is-a", 0.36));
    }

    /* ---------------------------------------------- render */

    const steps = {
      disc(t) {
        show();
        // the disc turns through 3 pulses as the reader scrolls
        const counts = t * 12;
        const ang = (counts / (4 * PPR)) * 360;
        disc.setAttribute("transform", `rotate(${ang.toFixed(1)})`);
        drawWaves(counts, false);
        MR.view.hideAll(R, P);
        MR.view.arrange(svg, [{ obj: enc }]);
        const [a, b] = MR.quadrature(Math.floor(counts));
        strip(`${PPR} pairs of magnets pass each sensor every motor turn · now A = ${a}, B = ${b} · ${Math.floor(counts / 4)} full pulses so far`);
      },

      quadrature(t) {
        show("dir");
        const counts = state.dir > 0 ? t * 12 : 12 - t * 12;
        disc.setAttribute("transform", `rotate(${((counts / (4 * PPR)) * 360).toFixed(1)})`);
        drawWaves(counts, true);
        MR.view.hideAll(R, P);
        MR.view.arrange(svg, [{ obj: enc }]);
        const c = Math.floor(counts);
        strip(
          `${state.dir > 0 ? "forward: A rises before B" : "backwards: B rises before A"} · states run ${state.dir > 0 ? "00 → 10 → 11 → 01" : "01 → 11 → 10 → 00"} · count ${state.dir > 0 ? c : -(12 - c)} (4 per pulse)`
        );
      },

      resolution() {
        show();
        drawWaves(0, true);
        MR.view.hideAll(R, P);
        MR.view.arrange(svg, [{ obj: enc }]);
        const cpr = MR.ROBOT.cpr;
        const circ = 2 * Math.PI * MR.ROBOT.wheelR;
        strip(
          `${PPR} pulses × 4 edges × 30:1 gearbox = ${cpr} counts per wheel turn · wheel circumference ${(circ * 1000).toFixed(0)} mm · ${((circ / cpr) * 1000).toFixed(3)} mm per count`
        );
      },

      odometry(t) {
        show();
        const d = runWith();
        const k = Math.round(t * (d.t.length - 1));
        drawRun(d, k);
        MR.view.hideAll(enc, P);
        MR.view.arrange(svg, [{ obj: R }]);
        const [nl, nr] = d.ticks[k];
        strip(
          `t = ${d.t[k].toFixed(1)} s · counts left ${nl}, right ${nr} · odometry (${f2(d.odom[k][0])}, ${f2(d.odom[k][1])}, ${Math.round(MR.deg(d.odom[k][2]))}°) · a perfect robot: odometry and truth agree`
        );
      },

      errors(t) {
        show("radius", "track");
        const d = runWith({ radiusR: state.radius / 100, track: state.track / 100 });
        const k = Math.round(Math.max(t, 0.02) * (d.t.length - 1));
        drawRun(d, k);
        MR.view.hideAll(enc, P);
        MR.view.arrange(svg, [{ obj: R }]);
        const e = endErr(d);
        strip(
          `right wheel ${pct(state.radius)}, track ${pct(state.track)} · odometry says back at the start · the robot is really ${cm(e.dist)} away, turned ${e.head.toFixed(1)}°`
        );
      },

      slip(t) {
        show("slip");
        const d = runWith({ slip: state.slip / 100, seed: 3 });
        const k = Math.round(Math.max(t, 0.02) * (d.t.length - 1));
        drawRun(d, k);
        MR.view.hideAll(enc, P);
        MR.view.arrange(svg, [{ obj: R }]);
        const e = endErr(d);
        strip(
          `each wheel slips a random ${state.slip.toFixed(1)}% (σ) of its travel, every 20 ms · after one lap the robot is ${cm(e.dist)} from where odometry thinks, turned ${e.head.toFixed(1)}°`
        );
      },

      growth() {
        show();
        // three laps, with all three errors at once
        const legs = [...square(), ...square(), ...square()];
        const d = MR.drive(legs, { start: START, radiusR: 0.005, track: 0.01, slip: 0.02, seed: 3 });
        const dist = [];
        let acc = 0;
        d.truth.forEach((p, i) => {
          if (i) acc += Math.hypot(p[0] - d.truth[i - 1][0], p[1] - d.truth[i - 1][1]);
          dist.push(acc);
        });
        const err = d.truth.map((p, i) => Math.hypot(p[0] - d.odom[i][0], p[1] - d.odom[i][1]));
        const every = (arr) => arr.filter((_, i) => i % 20 === 0);
        P.title("odometry's position error");
        P.set([{ xs: every(dist), ys: every(err), cls: "is-b" }], { xMax: 36, yMin: 0 });
        const k = d.t.length - 1;
        R.set("a", R.path(d.odom, "is-d is-dash"), R.path(d.truth, "is-a"));
        R.set("robot", R.robot(d.odom[k], "is-d is-ghost", 0.36), R.robot(d.truth[k], "is-a", 0.36));
        MR.view.hideAll(enc);
        MR.view.arrange(svg, [{ obj: R }, { obj: P }]);
        const at = (m) => err[dist.findIndex((x) => x >= m)];
        strip(
          `wheel +0.5%, track +1%, slip 2% · error after 12 m: ${cm(at(12))} · after 24 m: ${cm(at(24))} · after three laps, ${dist[k].toFixed(1)} m: ${cm(err[k])}`
        );
      },
    };

    return { render: (id, t) => steps[id](t) };
  };
})();
