// Part 6 of the mobile robots series: the microcontroller. Why a robot splits its work between a computer and a
// microcontroller, three ways an ESP32 can count encoder edges (polling, interrupts, the PCNT hardware counter), why
// a control loop must keep time, and how much a serial link to the computer can carry.
(function () {
  "use strict";

  const MR = window.MR;
  const { s } = MR.view;
  const { slider } = MR.controls;
  const f1 = (v) => v.toFixed(1);
  const k = (v) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${Math.round(v)}`);

  // top speed: the wheel at 18 rad/s is the motor at 30 × 18 rad/s
  const MOTOR_REV_S = (MR.MOTOR.K * 30) / MR.TAU;
  const HALL = MOTOR_REV_S * 44; // 11 pulses × 4 edges per motor turn
  const OPTICAL = MOTOR_REV_S * 2000; // a 500-line optical encoder: 500 × 4 edges
  const ODOM_BYTES = 724; // a nav_msgs/Odometry message, serialised
  const TICKS_BYTES = 16; // a timestamp and two counts
  const SERIAL = 115200 / 10; // bytes per second over 115,200 baud serial (8 data bits, a start and a stop bit)

  MR.scenes.part6 = function (stage) {
    const { svg, controls, strip } = stage;
    const P = MR.view.plot(svg, { width: 420, height: 230, right: 80 });

    /* ---------------------------------------------- inputs */

    const state = { pollKHz: 10, jitter: 0, isr: 2, mode: "delay", spike: false, rate: 50, odom: true };
    const pollIn = slider(
      "poll rate",
      2,
      40,
      state.pollKHz,
      (v) => ((state.pollKHz = v), stage.refresh()),
      (v) => `${v} kHz`,
      1
    );
    const jitIn = slider(
      "timing jitter",
      0,
      50,
      state.jitter,
      (v) => ((state.jitter = v), stage.refresh()),
      (v) => `${v} µs`,
      5
    );
    const isrIn = slider(
      "time per interrupt",
      5,
      50,
      state.isr * 10,
      (v) => ((state.isr = v / 10), stage.refresh()),
      (v) => `${(v / 10).toFixed(1)} µs`,
      5
    );
    const modeIn = MR.controls.button("use vTaskDelayUntil", () => {
      state.mode = state.mode === "delay" ? "until" : "delay";
      modeIn.textContent = state.mode === "delay" ? "use vTaskDelayUntil" : "use delay";
      stage.refresh();
    });
    const spikeIn = MR.controls.button("Wi-Fi on", () => {
      state.spike = !state.spike;
      spikeIn.textContent = state.spike ? "Wi-Fi off" : "Wi-Fi on";
      stage.refresh();
    });
    const rateIn = slider(
      "rate",
      10,
      100,
      state.rate,
      (v) => ((state.rate = v), stage.refresh()),
      (v) => `${v} Hz`,
      10
    );
    const msgIn = MR.controls.button("send wheel counts", () => {
      state.odom = !state.odom;
      msgIn.textContent = state.odom ? "send wheel counts" : "send odometry";
      stage.refresh();
    });
    controls.append(pollIn.wrap, jitIn.wrap, isrIn.wrap, modeIn, spikeIn, rateIn.wrap, msgIn);
    function show(...which) {
      controls.hidden = !which.length;
      [
        [pollIn.wrap, "poll"],
        [jitIn.wrap, "jitter"],
        [isrIn.wrap, "isr"],
        [modeIn, "mode"],
        [spikeIn, "spike"],
        [rateIn.wrap, "rate"],
        [msgIn, "msg"],
      ].forEach(([el, key]) => (el.style.display = which.includes(key) ? "" : "none"));
    }

    /* ---------------------------------------------- the split: a computer for thinking, a microcontroller for timing */

    // phones get the diagrams in one column, so their text stays readable
    const tall = window.TF.view.narrow.matches;
    const split = MR.view.group(svg, tall ? { x: -10, y: -40, width: 320, height: 540 } : { x: -10, y: -40, width: 580, height: 330 });
    {
      const g = split.el;
      const W = tall ? 300 : 250;
      g.append(s("text", { class: "tf-mat-title", x: 0, y: -16, text: "two computers, two jobs" }));
      MR.view.box(g, 0, 0, W, 56, "Raspberry Pi / Jetson", "Linux, ROS 2: maps, plans, vision", "is-d");
      MR.view.box(g, 0, 130, W, 56, "ESP32", "no OS to speak of: on time, every time", "is-a");
      MR.view.arrow(g, [W * 0.38, 58], [W * 0.38, 128], "", "is-ink");
      MR.view.arrow(g, [W * 0.62, 128], [W * 0.62, 58], "", "is-ink");
      g.append(s("text", { class: "tf-small", x: W * 0.38 - 10, y: 98, "text-anchor": "end", text: "wheel speeds" }));
      g.append(s("text", { class: "tf-small", x: W * 0.62 + 10, y: 98, text: "counts, IMU" }));
      const parts = [
        ["H-bridge → motors", "PWM at 20 kHz", "is-b"],
        ["encoders", "thousands of edges a second", "is-c"],
        ["IMU, bumpers, battery", "I²C, GPIO, ADC", "is-c"],
      ];
      if (tall) {
        parts.forEach(([t, sub, cls], i) => MR.view.box(g, 0, 250 + i * 56, W, 44, t, sub, cls));
        MR.view.arrow(g, [W * 0.38, 188], [W * 0.38, 248], "", "is-ink");
        MR.view.arrow(g, [W * 0.62, 248], [W * 0.62, 188], "", "is-ink");
        g.append(s("text", { class: "tf-small", x: W * 0.38 - 10, y: 222, "text-anchor": "end", text: "duty" }));
        g.append(s("text", { class: "tf-small", x: W * 0.62 + 10, y: 222, text: "edges, readings" }));
      } else {
        parts.forEach(([t, sub, cls], i) => MR.view.box(g, 330, 70 + i * 60, 220, 44, t, sub, cls));
        MR.view.arrow(g, [252, 150], [328, 98], "", "is-ink");
        MR.view.arrow(g, [328, 152], [252, 158], "", "is-ink");
        MR.view.arrow(g, [328, 210], [252, 170], "", "is-ink");
      }
      const y0 = tall ? 440 : 228;
      ["PID loops every 10 ms", "count every edge", "stop the motors if the link goes quiet"].forEach((t, i) =>
        g.append(s("text", { class: "tf-small", x: 0, y: y0 + i * 18, text: t }))
      );
    }

    /* ---------------------------------------------- the link: micro-ROS over serial */

    const link = MR.view.group(svg, tall ? { x: -10, y: -40, width: 320, height: 420 } : { x: -10, y: -40, width: 580, height: 250 });
    const BAR = tall ? 300 : 570;
    {
      const g = link.el;
      g.append(s("text", { class: "tf-mat-title", x: 0, y: -16, text: tall ? "micro-ROS" : "micro-ROS: the ESP32 joins the ROS 2 graph" }));
      const boxes = [
        ["ESP32", "micro-ROS client", "is-a"],
        ["micro-ROS agent", "on the Pi", "is-d"],
        ["ROS 2 nodes", "Nav2, SLAM, …", "is-d"],
      ];
      if (tall) {
        boxes.forEach(([t, sub, cls], i) => MR.view.box(g, 0, i * 90, BAR, 50, t, sub, cls));
        MR.view.arrow(g, [150, 52], [150, 88], "", "is-ink");
        MR.view.arrow(g, [150, 142], [150, 178], "", "is-ink");
        g.append(s("text", { class: "tf-small", x: 160, y: 74, text: "serial" }));
        g.append(s("text", { class: "tf-small", x: 160, y: 164, text: "DDS" }));
      } else {
        boxes.forEach(([t, sub, cls], i) => MR.view.box(g, i * 210, 20, i === 2 ? 150 : 160, 56, t, sub, cls));
        MR.view.arrow(g, [162, 48], [208, 48], "serial", "is-ink");
        MR.view.arrow(g, [372, 48], [418, 48], "DDS", "is-ink");
      }
    }
    const bar = s("g");
    link.el.append(bar);

    /* ---------------------------------------------- render */

    function plotOnly() {
      MR.view.hideAll(split, link);
      MR.view.arrange(svg, [{ obj: P }]);
    }

    const steps = {
      split() {
        show();
        MR.view.hideAll(P, link);
        MR.view.arrange(svg, [{ obj: split }]);
        strip("the computer decides where to go; the microcontroller makes the wheels do it, and counts what they did");
      },

      poll() {
        show("poll", "jitter");
        const rates = Array.from({ length: 61 }, (_, i) => i * 1000);
        const counted = (jitter) =>
          rates.map((cps) => {
            if (!cps) return 100;
            const r = MR.readEncoder(cps, 0.2, "poll", { period: 1 / (state.pollKHz * 1000), jitter: jitter * 1e-6 });
            return (100 * r.read) / r.trueCount;
          });
        const series = [{ xs: rates.map((v) => v / 1000), ys: counted(0), cls: "is-a", label: "on time" }];
        if (state.jitter) series.push({ xs: rates.map((v) => v / 1000), ys: counted(state.jitter), cls: "is-b", label: "with jitter", dy: 12 });
        P.title("edges counted, % of the true count");
        P.set(series, {
          xMax: 60,
          yMin: -50,
          yMax: 100,
          hlines: [{ y: 0, cls: "is-ink" }],
          vlines: [{ x: HALL / 1000, cls: "is-muted", label: "Hall, top speed" }],
          xTitle: "encoder edges per second (thousands)",
        });
        plotOnly();
        const at = MR.readEncoder(HALL, 1, "poll", { period: 1 / (state.pollKHz * 1000), jitter: state.jitter * 1e-6 });
        strip(
          `reading both pins ${state.pollKHz}k times a second${state.jitter ? `, ±${state.jitter} µs late` : ""} · fails above ${state.pollKHz}k edges/s · at the Hall encoder's top speed (${k(HALL)} edges/s) it counts ${f1((100 * at.read) / at.trueCount)}%`
        );
      },

      interrupt() {
        show("isr");
        const rates = Array.from({ length: 61 }, (_, i) => i * 10000);
        P.title("CPU time spent in the encoder interrupt");
        P.set([{ xs: rates.map((v) => v / 1000), ys: rates.map((v) => Math.min(100, v * state.isr * 1e-4)), cls: "is-b" }], {
          xMax: 600,
          yMin: 0,
          yMax: 100,
          vlines: [
            { x: HALL / 1000, cls: "is-muted", label: "Hall" },
            { x: OPTICAL / 1000, cls: "is-muted", label: "optical" },
          ],
          xTitle: "encoder edges per second (thousands)",
        });
        plotOnly();
        strip(
          `${state.isr.toFixed(1)} µs per edge · Hall encoder at top speed: ${f1(HALL * state.isr * 1e-4)}% of a core · 500-line optical encoder: ${f1(Math.min(100, OPTICAL * state.isr * 1e-4))}% · nothing left past ${k(1e6 / state.isr)} edges/s`
        );
      },

      pcnt() {
        show();
        const ts = [];
        const raw = [];
        const total = [];
        for (let i = 0; i <= 600; i++) {
          const t = i * 0.05;
          const c = Math.floor(HALL * t);
          const w = ((((c + 32768) % 65536) + 65536) % 65536) - 32768;
          if (raw.length && w / 1000 < raw[raw.length - 1]) (ts.push(t), raw.push(null), total.push(c / 1000));
          ts.push(t);
          raw.push(w / 1000);
          total.push(c / 1000);
        }
        P.title("count (thousands), wheel at top speed");
        P.set(
          [
            { xs: ts, ys: total, cls: "is-a", label: "true count" },
            { xs: ts, ys: raw, cls: "is-b", label: "16-bit counter" },
          ],
          {
            xMax: 30,
            yMin: -40,
            yMax: 120,
            hlines: [
              { y: 32.767, cls: "is-muted" },
              { y: -32.768, cls: "is-muted" },
            ],
            xTitle: "time (s)",
          }
        );
        plotOnly();
        strip(
          `the PCNT counts in hardware, at no CPU cost · its counter is 16 bits, so at ${k(HALL)} edges/s it wraps every ${f1(65536 / HALL)} s · software adds up the wraps`
        );
      },

      timing() {
        show("mode", "spike");
        const r = MR.loopTiming({ mode: state.mode, spike: state.spike ? 0.004 : 0 });
        const n = r.lengths.length;
        const mean = MR.mean(r.lengths);
        P.title(`length of each 10 ms cycle (ms), ${state.mode === "delay" ? "delay(10)" : "vTaskDelayUntil"}`);
        P.set([{ xs: r.lengths.map((_, i) => i + 1), ys: r.lengths.map((v) => v * 1000), cls: "is-a", dots: true }], {
          xMin: 0,
          xMax: n,
          yMin: 0,
          yMax: 18,
          hlines: [{ y: 10, cls: "is-ink", label: "10 ms" }],
          xTitle: "cycle",
        });
        plotOnly();
        const worst = Math.max(...r.lengths.map((v) => Math.abs(v / 0.01 - 1)));
        strip(
          `average cycle ${(mean * 1000).toFixed(2)} ms · ${r.starts.filter((t) => t < 2).length} cycles in 2 s · dividing counts by a fixed 10 ms, the speed is off by up to ${Math.round(worst * 100)}%`
        );
      },

      link() {
        show("rate", "msg");
        MR.view.hideAll(P, split);
        const bytes = (state.odom ? ODOM_BYTES : TICKS_BYTES) * state.rate;
        const share = bytes / SERIAL;
        const W = BAR;
        const g = s("g", { transform: `translate(0 ${tall ? 300 : 130})` });
        g.append(
          s("text", { class: "tf-small", x: 0, y: -10, text: `115,200 baud carries ${k(SERIAL)} bytes/s` }),
          s("rect", { class: "mr-fill is-muted", x: 0, y: 0, width: W, height: 26 }),
          s("rect", { class: `mr-solid ${share > 1 ? "is-b" : "is-a"}`, x: 0, y: 0, width: Math.min(1, share) * W, height: 26 }),
          s("text", {
            class: "tf-small",
            x: 0,
            y: 48,
            text: `${state.odom ? ODOM_BYTES : TICKS_BYTES} bytes × ${state.rate} Hz = ${k(bytes)} bytes/s: ${Math.round(share * 100)}%`,
          })
        );
        bar.replaceChildren(g);
        MR.view.arrange(svg, [{ obj: link }]);
        strip(
          share > 1
            ? `${share.toFixed(1)}× what the link can carry: messages queue up, arrive late, or are dropped`
            : `fits, with room to spare for the IMU and the commands coming back`
        );
      },
    };

    return { render: (id, t) => steps[id](t) };
  };
})();
