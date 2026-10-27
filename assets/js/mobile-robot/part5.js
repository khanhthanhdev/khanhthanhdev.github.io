// Part 5 of the mobile robots series: motors and PID control. How a DC motor's speed follows its voltage, how PWM
// makes a voltage from a switch, why driving the motor open loop fails under load, and how P, I and D terms (and
// anti-windup) make a wheel hold the speed it was asked for.
(function () {
  "use strict";

  const MR = window.MR;
  const { slider } = MR.controls;
  const f2 = (v) => v.toFixed(2).replace("-", "−");
  const pct = (v) => `${(v * 100).toFixed(1)}%`;

  const TARGET = 10; // rad/s at the wheel: 0.35 m/s
  const SUPPLY = 12; // volts

  MR.scenes.part5 = function (stage) {
    const { svg, controls, strip } = stage;
    const S = MR.view.plot(svg, { width: 420, height: 160, xTitle: "time (s)", right: 60 });
    const D = MR.view.plot(svg, { width: 420, height: 110, xTitle: "time (s)", right: 60 });

    /* ---------------------------------------------- inputs */

    const state = { duty: 0.5, kp: 0.1, ki: 1, kd: 0.002, noise: 0.5, windup: true };
    const dutyIn = slider(
      "duty",
      0,
      100,
      state.duty * 100,
      (v) => ((state.duty = v / 100), stage.refresh()),
      (v) => `${v}%`,
      5
    );
    const kpIn = slider(
      "Kp",
      0,
      200,
      state.kp * 100,
      (v) => ((state.kp = v / 100), stage.refresh()),
      (v) => (v / 100).toFixed(2),
      1
    );
    const kiIn = slider(
      "Ki",
      0,
      40,
      state.ki * 10,
      (v) => ((state.ki = v / 10), stage.refresh()),
      (v) => (v / 10).toFixed(1),
      1
    );
    const kdIn = slider(
      "Kd",
      0,
      10,
      state.kd * 1000,
      (v) => ((state.kd = v / 1000), stage.refresh()),
      (v) => (v / 1000).toFixed(3),
      1
    );
    const noiseIn = slider(
      "speed noise σ",
      0,
      100,
      state.noise * 100,
      (v) => ((state.noise = v / 100), stage.refresh()),
      (v) => `${(v / 100).toFixed(2)} rad/s`,
      5
    );
    const windIn = MR.controls.button("turn anti-windup off", () => {
      state.windup = !state.windup;
      windIn.textContent = state.windup ? "turn anti-windup off" : "turn anti-windup on";
      stage.refresh();
    });
    controls.append(dutyIn.wrap, kpIn.wrap, kiIn.wrap, kdIn.wrap, noiseIn.wrap, windIn);
    function show(...which) {
      controls.hidden = !which.length;
      [
        [dutyIn.wrap, "duty"],
        [kpIn.wrap, "kp"],
        [kiIn.wrap, "ki"],
        [kdIn.wrap, "kd"],
        [noiseIn.wrap, "noise"],
        [windIn, "windup"],
      ].forEach(([el, key]) => (el.style.display = which.includes(key) ? "" : "none"));
    }
    /* ---------------------------------------------- render */

    const loadLine = [{ x: 1, cls: "is-muted", label: "load" }];
    // speed above, duty below, sharing the time axis
    function both(r, label, o = {}) {
      S.title(`wheel speed (rad/s), ${label}`);
      S.set([{ xs: r.t, ys: r.speed, cls: "is-a" }], {
        xMax: o.xMax ?? 2,
        yMin: 0,
        yMax: o.yMax ?? 14,
        hlines: [{ y: TARGET, cls: "is-ink", label: "target" }],
        vlines: o.vlines ?? loadLine,
      });
      D.title("duty");
      D.set([{ xs: r.t, ys: r.duty, cls: "is-b" }], { xMax: o.xMax ?? 2, yMin: 0, yMax: 1, vlines: o.vlines ?? loadLine });
      MR.view.arrange(svg, [{ obj: S, gap: 24 }, { obj: D }], { stack: true });
    }
    const run = (o) => MR.pidRun({ target: TARGET, ...o });

    const steps = {
      dcmotor() {
        show();
        const curves = [0.25, 0.5, 1].map((d) => MR.pidRun({ open: true, target: MR.MOTOR.K * d, load: 0, seconds: 1 }));
        MR.view.hideAll(D);
        S.title("wheel speed after switching on (rad/s)");
        S.set(
          curves.map((r, i) => ({ xs: r.t, ys: r.speed, cls: ["is-c", "is-a", "is-b"][i], label: `${[25, 50, 100][i]}%` })),
          { xMax: 1, yMin: 0, yMax: 20, vlines: [{ x: MR.MOTOR.tau, cls: "is-muted", label: "τ" }] }
        );
        MR.view.arrange(svg, [{ obj: S }]);
        strip(
          `top speeds ${f2(curves[0].end)}, ${f2(curves[1].end)} and ${f2(curves[2].end)} rad/s · 63% of the way there after τ = ${MR.MOTOR.tau} s`
        );
      },

      pwm() {
        show("duty");
        // three 50 µs periods of a 20 kHz PWM signal
        const xs = [];
        const ys = [];
        for (let k = 0; k < 3; k++) {
          const on = state.duty * 50;
          xs.push(k * 50, k * 50 + on, k * 50 + on, k * 50 + 50);
          ys.push(SUPPLY, SUPPLY, 0, 0);
          if (k < 2) (xs.push(k * 50 + 50), ys.push(SUPPLY));
        }
        if (state.duty === 0) ys.fill(0);
        MR.view.hideAll(D);
        S.title("voltage across the motor (V)");
        S.set([{ xs, ys, cls: "is-b" }], {
          xMax: 150,
          yMin: 0,
          yMax: 14,
          hlines: [{ y: state.duty * SUPPLY, cls: "is-a", label: `average ${(state.duty * SUPPLY).toFixed(1)} V` }],
          vlines: [],
          xTitle: "time (µs)",
        });
        MR.view.arrange(svg, [{ obj: S }]);
        strip(
          `on for ${(state.duty * 50).toFixed(1)} µs of every 50 · the motor feels the average, ${(state.duty * SUPPLY).toFixed(1)} V, and turns at ${f2(state.duty * MR.MOTOR.K)} rad/s`
        );
      },

      open() {
        show();
        const r = run({ open: true });
        both(r, "open loop");
        strip(`duty fixed at ${pct(TARGET / MR.MOTOR.K)} · reaches ${f2(r.settled)} rad/s · the load at 1 s slows it to ${f2(r.end)}, for good`);
      },

      p() {
        show("kp");
        const r = run({ kp: state.kp });
        both(r, `P ${state.kp.toFixed(2)}`);
        const wobble = MR.std(r.speed.slice(50, 100)) > 0.05;
        strip(
          `Kp ${state.kp.toFixed(2)} · ${wobble ? "it rattles: each correction overshoots the last" : `settles at ${f2(r.settled)} rad/s, ${f2(TARGET - r.settled)} short`} · under load ${f2(r.end)}`
        );
      },

      pi() {
        show("kp", "ki");
        const r = run({ kp: state.kp, ki: state.ki });
        both(r, "PI");
        strip(
          `Kp ${state.kp.toFixed(2)}, Ki ${state.ki.toFixed(1)} · ${r.rise == null ? "never reaches 90%" : `90% of the target in ${f2(r.rise)} s`} · overshoot ${pct(r.overshoot)} · the load pulls it to ${f2(r.dip)}, then back to ${f2(r.end)}`
        );
      },

      pid() {
        show("kd", "noise");
        const r = run({ kp: 0.1, ki: 1, kd: state.kd, noise: state.noise });
        both(r, "PID");
        strip(`Kp 0.10, Ki 1.0 · overshoot ${pct(r.overshoot)} · before the load, the duty jitters by ${pct(MR.std(r.duty.slice(50, 100)))} (σ)`);
      },

      windup() {
        show("windup");
        const r = run({ kp: 0.1, ki: 1, load: 0, seconds: 3, stall: [0.5, 1], antiWindup: state.windup });
        const after = r.speed.filter((_, i) => r.t[i] > 1);
        const back = r.t.findIndex((x, i) => x > 1 && r.speed.slice(i).every((v) => Math.abs(v - TARGET) < 0.5));
        both(r, state.windup ? "anti-windup" : "no anti-windup", {
          xMax: 3,
          yMax: 20,
          vlines: [
            { x: 0.5, cls: "is-muted", label: "stuck" },
            { x: 1, cls: "is-muted", label: "free" },
          ],
        });
        strip(`stuck from 0.5 to 1 s · peaks at ${f2(Math.max(...after))} rad/s · within 5% of the target from ${back < 0 ? "–" : f2(r.t[back])} s`);
      },
    };

    return { render: (id, t) => steps[id](t) };
  };
})();
