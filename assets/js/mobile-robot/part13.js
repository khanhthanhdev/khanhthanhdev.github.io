// Part 13 of the mobile robots series: localisation with particle filters (Monte Carlo localisation). A robot that
// doesn't know where it is, as hundreds of guesses spread over the map; weighing each guess by how well the scan it
// would see matches the real one; resampling until the guesses agree; how many guesses it takes; and recovering when
// the robot is picked up and put down somewhere else.
(function () {
  "use strict";

  const MR = window.MR;
  const { slider } = MR.controls;
  const cm = (v) => `${(v * 100).toFixed(1)} cm`;

  // poses every 30 cm along straight lines, and every 30° when turning on the spot
  function route(start, moves) {
    let p = start.slice();
    const out = [p];
    for (const [kind, amt] of moves) {
      const n = Math.max(1, Math.round(Math.abs(amt) / (kind === "f" ? 0.3 : Math.PI / 6)));
      for (let i = 0; i < n; i++) {
        p = MR.compose(p, kind === "f" ? [amt / n, 0, 0] : [0, 0, amt / n]);
        out.push(p);
      }
    }
    return out;
  }
  // along the middle of the room, then picked up and put down in the far corner, and on from there
  const A = route([0.8, 3.2, 0], [["f", 7]]);
  const B = route(
    [7.8, 0.6, Math.PI / 2],
    [
      ["f", 2.6],
      ["t", Math.PI / 2],
      ["f", 5.5],
    ]
  );
  const POSES = A.concat(B);
  const CARRIED = A.length;

  MR.scenes.part13 = function (stage) {
    const { svg, controls, strip } = stage;
    const world = MR.room();
    const R = MR.view.room(svg, world, { title: "the room from above (1 m grid)" });

    /* ---------------------------------------------- inputs */

    const state = { n: 400, inject: false };
    const nIn = slider("particles", 50, 1000, state.n, (v) => ((state.n = v), stage.refresh()), String, 50);
    const injIn = MR.controls.button("add random particles when lost", () => {
      state.inject = !state.inject;
      injIn.textContent = state.inject ? "don't add any" : "add random particles when lost";
      stage.refresh();
    });
    controls.append(nIn.wrap, injIn);
    function show(...which) {
      controls.hidden = !which.length;
      [
        [nIn.wrap, "n"],
        [injIn, "inject"],
      ].forEach(([el, key]) => (el.style.display = which.includes(key) ? "" : "none"));
    }

    /* ---------------------------------------------- data */

    const runs = new Map();
    function run(opts) {
      const key = JSON.stringify(opts);
      if (!runs.has(key)) runs.set(key, MR.mclRun(world, opts.short ? A : POSES, { carried: [CARRIED], ...opts }));
      return runs.get(key);
    }
    const off = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    // how spread out the particles are: the weighted standard deviation of their positions
    function spread(ps) {
      const m = MR.mclMean(ps);
      return Math.sqrt(ps.reduce((s, q) => s + q.w * ((q.p[0] - m[0]) ** 2 + (q.p[1] - m[1]) ** 2), 0));
    }
    function draw(fr, k, { weighed = false } = {}) {
      const f = fr[k];
      const ps = weighed ? f.weighed : f.ps;
      const n = ps.length;
      const heavy = ps.filter((q) => q.w > 3 / n).map((q) => q.p);
      const light = ps.filter((q) => q.w <= 3 / n).map((q) => q.p);
      R.set(
        "a",
        f.scan ? R.rays(POSES[k], f.scan, { cls: "is-a" }) : null,
        R.dots(light, weighed ? "is-muted" : "is-b", weighed ? 1.4 : 1.8),
        R.dots(heavy, "is-b", 3)
      );
      R.set("robot", R.robot(POSES[k], "is-a", 0.36), k ? R.robot(f.est, "is-c is-ghost", 0.36) : null);
    }
    function roomOnly() {
      MR.view.arrange(svg, [{ obj: R }]);
    }

    /* ---------------------------------------------- render */

    const steps = {
      cloud() {
        show();
        const fr = run({ n: 400 });
        draw(fr, 0);
        roomOnly();
        strip(`${fr[0].ps.length} guesses, anywhere in the room, facing any way · each is equally likely`);
      },

      weigh() {
        show();
        const fr = run({ n: 400 });
        draw(fr, 1, { weighed: true });
        roomOnly();
        const ws = fr[1].weighed.map((q) => q.w).sort((a, b) => b - a);
        const top = ws.slice(0, 20).reduce((a, b) => a + b, 0);
        strip(`one scan of 24 beams · the best 20 guesses carry ${Math.round(100 * top)}% of the weight · effective number ${fr[1].neff.toFixed(0)}`);
      },

      converge(t = 0) {
        show();
        const fr = run({ n: 400 });
        const k = Math.min(CARRIED - 1, Math.round((t ?? 0) * (CARRIED - 1)));
        draw(fr, k);
        roomOnly();
        strip(`scan ${k} · particles spread over ${cm(spread(fr[k].ps))} · best guess ${cm(off(fr[k].est, POSES[k]))} from the truth`);
      },

      count() {
        show("n");
        const fr = run({ n: state.n, short: true });
        const k = fr.length - 1;
        draw(fr, k);
        roomOnly();
        strip(`${state.n} particles · after ${k} scans, the best guess is ${cm(off(fr[k].est, POSES[k]))} from the truth`);
      },

      kidnap(t = 0) {
        show("inject");
        const fr = run(state.inject ? { n: 400, inject: 0.1 } : { n: 400 });
        const k = Math.min(POSES.length - 1, CARRIED - 2 + Math.round((t ?? 0) * (POSES.length - CARRIED + 1)));
        draw(fr, k);
        roomOnly();
        const after = k - CARRIED + 1;
        strip(
          `${after > 0 ? `${after} scan${after > 1 ? "s" : ""} after the move` : "before the move"} · best guess ${cm(off(fr[k].est, POSES[k]))} off${fr[k].lost ? " · lost: the scan fits badly" : ""}`
        );
      },
    };

    return { render: (id, t) => steps[id](t) };
  };
})();
