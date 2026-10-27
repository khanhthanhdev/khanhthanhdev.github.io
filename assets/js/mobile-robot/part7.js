// Part 7 of the mobile robots series: the onboard computer. What a Raspberry Pi or a Jetson runs, how the delays
// between a sensor seeing something and the wheels reacting add up, what that latency costs in stopping distance,
// what happens when a node can't keep up with its input, and what the computer costs in battery.
(function () {
  "use strict";

  const MR = window.MR;
  const { s } = MR.view;
  const { slider } = MR.controls;
  const f2 = (v) => v.toFixed(2);
  const cm = (v) => `${Math.round(v * 100)} cm`;

  const BATTERY_WH = 11.1 * 5; // a 3-cell, 5 Ah lithium pack
  const MOTORS_W = 6; // both motors, driving around a flat floor (an assumption, not a measurement)

  MR.scenes.part7 = function (stage) {
    const { svg, controls, strip } = stage;
    const tall = window.TF.view.narrow.matches;
    const P = MR.view.plot(svg, { width: 420, height: 230, right: 90 });

    /* ---------------------------------------------- inputs */

    const state = { proc: 30, speed: 0.5, decel: 1, procQ: 40, keep: false, watts: 15 };
    const procIn = slider(
      "localisation time",
      5,
      200,
      state.proc,
      (v) => ((state.proc = v), stage.refresh()),
      (v) => `${v} ms`,
      5
    );
    const speedIn = slider(
      "speed",
      1,
      20,
      state.speed * 10,
      (v) => ((state.speed = v / 10), stage.refresh()),
      (v) => `${(v / 10).toFixed(1)} m/s`,
      1
    );
    const decelIn = slider(
      "braking",
      2,
      30,
      state.decel * 10,
      (v) => ((state.decel = v / 10), stage.refresh()),
      (v) => `${(v / 10).toFixed(1)} m/s²`,
      1
    );
    const qIn = slider(
      "time per frame",
      10,
      80,
      state.procQ,
      (v) => ((state.procQ = v), stage.refresh()),
      (v) => `${v} ms`,
      1
    );
    const keepIn = MR.controls.button("keep every frame", () => {
      state.keep = !state.keep;
      keepIn.textContent = state.keep ? "keep only the newest" : "keep every frame";
      stage.refresh();
    });
    const wattIn = slider(
      "computer power",
      3,
      60,
      state.watts,
      (v) => ((state.watts = v), stage.refresh()),
      (v) => `${v} W`,
      1
    );
    controls.append(procIn.wrap, speedIn.wrap, decelIn.wrap, qIn.wrap, keepIn, wattIn.wrap);
    function show(...which) {
      controls.hidden = !which.length;
      [
        [procIn.wrap, "proc"],
        [speedIn.wrap, "speed"],
        [decelIn.wrap, "decel"],
        [qIn.wrap, "procQ"],
        [keepIn, "keep"],
        [wattIn.wrap, "watts"],
      ].forEach(([el, key]) => (el.style.display = which.includes(key) ? "" : "none"));
    }

    /* ---------------------------------------------- what runs on the computer */

    const jobs = MR.view.group(svg, tall ? { x: -10, y: -40, width: 320, height: 520 } : { x: -10, y: -40, width: 580, height: 320 });
    {
      const g = jobs.el;
      g.append(s("text", { class: "tf-mat-title", x: 0, y: -16, text: "a typical robot's ROS 2 nodes" }));
      const items = [
        ["lidar driver", "a scan every 100 ms", "is-c"],
        ["camera driver", "a frame every 33 ms", "is-c"],
        ["odometry + IMU fusion", "50 to 100 Hz (part 12)", "is-a"],
        ["localisation or SLAM", "every scan (parts 13, 14)", "is-a"],
        ["planner", "about once a second (part 15)", "is-d"],
        ["controller", "20 Hz: wheel speeds out", "is-d"],
        ["object detection", "a neural network, on a GPU", "is-b"],
        ["micro-ROS agent", "the link to the ESP32", "is-muted"],
      ];
      const W = tall ? 300 : 270;
      items.forEach(([t, sub, cls], i) => {
        const col = tall ? 0 : i % 2;
        const row = tall ? i : Math.floor(i / 2);
        MR.view.box(g, col * 300, row * (tall ? 60 : 66), W, tall ? 48 : 52, t, sub, cls);
      });
    }

    /* ---------------------------------------------- the latency chain */

    const chain = MR.view.group(svg, tall ? { x: -10, y: -40, width: 320, height: 420 } : { x: -10, y: -40, width: 640, height: 300 });
    const chainBody = s("g");
    chain.el.append(s("text", { class: "tf-mat-title", x: 0, y: -16, text: "from seeing to reacting" }), chainBody);
    const stages = () => [
      ["the scan is already old", 50, "is-c"],
      ["USB to the computer", 2, "is-c"],
      ["localisation", state.proc, "is-a"],
      ["wait for the controller", 25, "is-d"],
      ["serial to the ESP32", 5, "is-muted"],
      ["motor responds (τ)", 120, "is-b"],
    ];

    /* ---------------------------------------------- render */

    function plotOnly() {
      MR.view.hideAll(jobs, chain);
      MR.view.arrange(svg, [{ obj: P }]);
    }

    const steps = {
      jobs() {
        show();
        MR.view.hideAll(P, chain);
        MR.view.arrange(svg, [{ obj: jobs }]);
        strip("each box is a separate program, a ROS 2 node, and they all run at once");
      },

      chain() {
        show("proc");
        MR.view.hideAll(P, jobs);
        const st = stages();
        const total = st.reduce((a, x) => a + x[1], 0);
        const nodes = [];
        // one row per stage, each bar's length its time
        const x0 = tall ? 0 : 200;
        const scale = (tall ? 300 : 380) / Math.max(250, ...st.map((x) => x[1]));
        const rowH = tall ? 62 : 40;
        st.forEach(([name, ms, cls], i) => {
          const y = i * rowH;
          nodes.push(
            s("text", { class: "tf-small", x: 0, y: y + (tall ? 12 : 22), text: tall ? `${name}: ${ms} ms` : name }),
            s("rect", { class: `mr-solid ${cls}`, x: x0, y: y + (tall ? 20 : 8), width: Math.max(2, ms * scale), height: 18 })
          );
          if (!tall) nodes.push(s("text", { class: "tf-small", x: x0 + Math.max(2, ms * scale) + 6, y: y + 22, text: `${ms} ms` }));
        });
        nodes.push(s("text", { class: "tf-mat-title", x: 0, y: st.length * rowH + 16, text: `total ${total} ms` }));
        chainBody.replaceChildren(...nodes);
        MR.view.arrange(svg, [{ obj: chain }]);
        strip(`${total} ms from seeing to responding · at 0.5 m/s, ${cm(0.5 * total * 1e-3)} driven blind`);
      },

      stopping() {
        show("speed", "decel");
        const vs = Array.from({ length: 41 }, (_, i) => i * 0.05);
        const lats = [0.05, 0.232, 0.5];
        P.title("stopping distance (m)");
        P.set(
          lats.map((L, i) => ({
            xs: vs,
            ys: vs.map((v) => MR.stopping(v, L, state.decel)),
            cls: ["is-c", "is-a", "is-b"][i],
            label: `${Math.round(L * 1000)} ms`,
          })),
          { xMax: 2, yMin: 0, yMax: 3, vlines: [{ x: state.speed, cls: "is-muted", label: `${state.speed.toFixed(1)} m/s` }], xTitle: "speed (m/s)" }
        );
        plotOnly();
        const d = (L) => MR.stopping(state.speed, L, state.decel);
        strip(
          `at ${state.speed.toFixed(1)} m/s, braking at ${state.decel.toFixed(1)} m/s²: ${cm(d(0.05))} with 50 ms of latency, ${cm(d(0.232))} with 232 ms, ${cm(d(0.5))} with 500 ms`
        );
      },

      queue() {
        show("procQ", "keep");
        const q = MR.frameQueue({ proc: state.procQ / 1000, depth: state.keep ? Infinity : 1 });
        const t = q.map((_, i) => i / 30);
        const kept = q.filter((v) => v != null);
        P.title("age of each result when it's ready (ms)");
        P.set([{ xs: t, ys: q.map((v) => (v == null ? null : v * 1000)), cls: "is-a", dots: true }], {
          xMax: 10,
          yMin: 0,
          yMax: state.keep ? Math.max(100, ...kept.map((v) => v * 1000)) : 150,
          hlines: [{ y: 33.3, cls: "is-ink", label: "33 ms" }],
          xTitle: "time (s)",
        });
        plotOnly();
        strip(
          `30 frames a second, ${state.procQ} ms each · ${kept.length} of ${q.length} processed · the last result is ${Math.round(kept[kept.length - 1] * 1000)} ms old${state.keep ? "" : " · old frames are dropped"}`
        );
      },

      power() {
        show("watts");
        const ws = Array.from({ length: 58 }, (_, i) => i + 3);
        const hours = (w) => BATTERY_WH / (w + MOTORS_W);
        P.title("hours on one charge");
        P.set([{ xs: ws, ys: ws.map(hours), cls: "is-a" }], {
          xMin: 0,
          xMax: 60,
          yMin: 0,
          yMax: 7,
          vlines: [
            { x: 7, cls: "is-muted", label: "7" },
            { x: 25, cls: "is-muted", label: "25" },
          ],
          hlines: [],
          xTitle: "computer power (W)",
        });
        plotOnly();
        strip(
          `55.5 Wh battery, 6 W for the motors · a ${state.watts} W computer: ${f2(hours(state.watts))} h · the computer takes ${Math.round((100 * state.watts) / (state.watts + MOTORS_W))}% of the energy`
        );
      },
    };

    return { render: (id, t) => steps[id](t) };
  };
})();
