// Part 3 of the mobile robots series: what a sensor is. Kinds of sensor, then the properties every one has: noise
// and bias, what averaging and filtering do to them, an ultrasonic sensor's cone and blind angles, and why a gyro
// and an accelerometer on their own drift away.
(function () {
  "use strict";

  const MR = window.MR;
  const { s } = MR.view;
  const { slider } = MR.controls;
  const f2 = (v) => v.toFixed(2).replace("-", "−");
  const cm = (v) => `${(v * 100).toFixed(1).replace("-", "−")} cm`;

  const TRUTH = 1.5;
  const RATE = 20; // readings per second
  const N = 100;
  const SONAR_AT = [5, 4.5]; // 1.5 m below the top wall

  MR.scenes.part3 = function (stage) {
    const { svg, controls, strip } = stage;
    const world = MR.room();
    const R = MR.view.room(svg, world, { title: "an ultrasonic sensor in the room" });
    const P = MR.view.plot(svg, { width: 420, height: 230, xTitle: "time (s)", right: 90 });

    /* ---------------------------------------------- inputs (each step shows the ones it uses) */

    const state = { sd: 0.02, bias: 0.03, alpha: 0.3, angle: 0 };
    const sdIn = slider(
      "noise σ",
      0,
      50,
      state.sd * 1000,
      (v) => ((state.sd = v / 1000), stage.refresh()),
      (v) => `${(v / 10).toFixed(1)} cm`,
      5
    );
    const biasIn = slider(
      "bias",
      -60,
      60,
      state.bias * 1000,
      (v) => ((state.bias = v / 1000), stage.refresh()),
      (v) => `${(v / 10).toFixed(1)} cm`,
      5
    );
    const alphaIn = slider(
      "α",
      5,
      100,
      state.alpha * 100,
      (v) => ((state.alpha = v / 100), stage.refresh()),
      (v) => (v / 100).toFixed(2),
      5
    );
    const angleIn = slider(
      "angle to the wall",
      -70,
      70,
      state.angle,
      (v) => ((state.angle = v), stage.refresh()),
      (v) => `${v}°`,
      5
    );
    controls.append(sdIn.wrap, biasIn.wrap, alphaIn.wrap, angleIn.wrap);
    function show(...which) {
      controls.hidden = !which.length;
      [
        [sdIn, "sd"],
        [biasIn, "bias"],
        [alphaIn, "alpha"],
        [angleIn, "angle"],
      ].forEach(([inp, key]) => (inp.wrap.style.display = which.includes(key) ? "" : "none"));
    }

    /* ---------------------------------------------- the kinds of sensor */

    const kinds = MR.view.group(svg, { x: -10, y: -40, width: 560, height: 330 });
    {
      const g = kinds.el;
      const col = (x, title, sub, items, cls) => {
        g.append(s("text", { class: "tf-mat-title", x, y: -16, text: title }));
        g.append(s("text", { class: "tf-small", x, y: 0, text: sub }));
        items.forEach(([name, what], i) => MR.view.box(g, x, 18 + i * 56, 250, 44, name, what, cls));
      };
      col(
        0,
        "about the robot itself",
        "proprioceptive",
        [
          ["wheel encoders", "how far each wheel turned"],
          ["gyroscope", "how fast the robot turns"],
          ["accelerometer", "acceleration, and which way is down"],
          ["motor current", "how hard the motors work"],
        ],
        "is-a"
      );
      col(
        300,
        "about the world",
        "exteroceptive",
        [
          ["bumper", "touching something: yes or no"],
          ["ultrasonic, IR range", "distance to one thing ahead"],
          ["lidar", "distances all round, in a plane"],
          ["depth camera", "a distance for every pixel"],
          ["camera", "colour, and nothing about distance"],
        ],
        "is-d"
      );
    }

    /* ---------------------------------------------- data */

    const times = Array.from({ length: N }, (_, i) => (i + 1) / RATE);
    const read = () => MR.readings(TRUTH, N, { bias: state.bias, sd: state.sd, seed: 5 });
    // a wall that jumps from 1.5 m to 1.0 m half way (a person steps in front of the sensor)
    const stepTruth = times.map((t) => (t <= 2.5 ? 1.5 : 1.0));
    const stepNoise = MR.readings(0, N, { sd: 0.02, seed: 6 });

    /* ---------------------------------------------- render */

    function plotOnly() {
      MR.view.hideAll(R, kinds);
      MR.view.arrange(svg, [{ obj: P }]);
    }

    const steps = {
      kinds() {
        show();
        MR.view.hideAll(R, P);
        MR.view.arrange(svg, [{ obj: kinds }]);
        strip("proprioceptive sensors measure the robot; exteroceptive sensors measure the world around it");
      },

      noise() {
        show("sd", "bias");
        const z = read();
        const m = MR.mean(z);
        P.title("readings of a wall 1.50 m away");
        P.set([{ xs: times, ys: z, cls: "is-a", dots: true }], {
          xMax: 5,
          yMin: 1.35,
          yMax: 1.65,
          hlines: [
            { y: TRUTH, cls: "is-ink", label: "true 1.50" },
            { y: m, cls: "is-b", label: `mean ${f2(m)}` },
          ],
        });
        plotOnly();
        strip(`spread (σ) ${cm(MR.std(z))} around a mean of ${f2(m)} m: the noise is random, the ${cm(m - TRUTH)} offset of the mean is bias`);
      },

      average() {
        show("sd", "bias");
        const z = read();
        const run = z.map((_, i) => MR.mean(z.slice(0, i + 1)));
        const n = times.map((_, i) => i + 1);
        const band = (k) => n.map((m) => TRUTH + state.bias + (k * state.sd) / Math.sqrt(m));
        P.title("the average of the first n readings");
        P.set(
          [
            { xs: n, ys: band(2), cls: "is-muted is-thin" },
            { xs: n, ys: band(-2), cls: "is-muted is-thin" },
            { xs: n, ys: run, cls: "is-a", label: "average" },
          ],
          {
            xMin: 1,
            xMax: N,
            yMin: 1.35,
            yMax: 1.65,
            hlines: [{ y: TRUTH, cls: "is-ink", label: "true 1.50" }],
            xTitle: "number of readings averaged",
          }
        );
        plotOnly();
        strip(
          `average of 1: ${f2(run[0])} m · of 4: ${f2(run[3])} · of 16: ${f2(run[15])} · of 100: ${f2(run[99])} · grey: ±2σ/√n · it closes in on 1.50 + bias = ${f2(TRUTH + state.bias)}, not on 1.50`
        );
      },

      filter() {
        show("alpha");
        const z = stepTruth.map((v, i) => v + 0.03 + stepNoise[i]);
        const y = MR.ema(z, state.alpha);
        const settle = y.findIndex((v, i) => i >= 50 && v < 1.03 + 0.025);
        P.title("a person steps in front at 2.5 s");
        P.set(
          [
            { xs: times, ys: z, cls: "is-a", dots: true },
            { xs: times, ys: y, cls: "is-b", label: `filtered` },
          ],
          { xMax: 5, yMin: 0.9, yMax: 1.65, hlines: [] }
        );
        plotOnly();
        const sd = MR.std(y.slice(20, 50));
        strip(
          `α = ${state.alpha.toFixed(2)}: noise left ${cm(sd)} (raw ${cm(MR.std(z.slice(20, 50)))}) · reaches the new distance ${settle < 0 ? "after the window" : `${((settle - 49) / RATE).toFixed(2)} s`} after the step`
        );
      },

      sonar() {
        show("angle");
        const pose = [...SONAR_AT, MR.rad(90 + state.angle)];
        const son = MR.sonar(world, pose);
        const rays = son.hits.map((hh) =>
          R.line(pose, [pose[0] + hh.r * Math.cos(hh.a), pose[1] + hh.r * Math.sin(hh.a)], hh.echo ? "is-c" : "is-muted is-dash")
        );
        const nodes = [...rays];
        if (isFinite(son.r)) nodes.push(R.dot([pose[0] + son.r * Math.cos(son.a), pose[1] + son.r * Math.sin(son.a)], "is-b", 5));
        R.set("a", nodes);
        R.set("robot", R.robot(pose, "is-a", 0.36));
        MR.view.hideAll(P, kinds);
        MR.view.arrange(svg, [{ obj: R }]);
        strip(
          `${state.angle}° from straight on · straight ahead the wall is ${f2(son.ahead)} m away · the sensor reports ${isFinite(son.r) ? `${f2(son.r)} m, the first echo in its cone (red dot)` : "nothing: every ray glanced off the wall"}`
        );
      },

      gyro() {
        show();
        const raw = MR.gyro(60);
        const cal = MR.gyro(60, { calib: 5 });
        const every = (arr) => arr.filter((_, i) => i % 10 === 9);
        P.title("heading, standing still");
        P.set(
          [
            { xs: every(raw.t), ys: every(raw.heading).map(MR.deg), cls: "is-b", label: "raw" },
            { xs: every(cal.t), ys: every(cal.heading).map(MR.deg), cls: "is-c", label: "calibrated", dy: 8 },
          ],
          { xMax: 60, yMin: -5, yMax: 32, hlines: [{ y: 0, cls: "is-ink" }] }
        );
        plotOnly();
        strip(
          `gyro bias 0.5°/s · after 60 s the raw heading says ${MR.deg(raw.heading[raw.heading.length - 1]).toFixed(1)}° · after subtracting the first 5 s of readings, ${MR.deg(cal.heading[cal.heading.length - 1]).toFixed(1)}°`
        );
      },

      accel() {
        show();
        const a = MR.accelDrift(10);
        const every = (arr) => arr.filter((_, i) => i % 5 === 4);
        P.title("position, standing still");
        P.set(
          [
            { xs: every(a.t), ys: every(a.t).map((t) => 0.5 * 0.01 * t * t), cls: "is-muted is-thin", label: "½·b·t²" },
            { xs: every(a.t), ys: every(a.pos), cls: "is-b", label: "integrated twice", dy: -10 },
          ],
          { xMax: 10, yMin: 0, yMax: 0.7, hlines: [] }
        );
        plotOnly();
        strip(
          `bias 0.01 m/s² (about 1 thousandth of g) · position error after 1 s: ${cm(a.pos[99])} · after 5 s: ${cm(a.pos[499])} · after 10 s: ${cm(a.pos[999])}`
        );
      },
    };

    return { render: (id, t) => steps[id](t) };
  };
})();
