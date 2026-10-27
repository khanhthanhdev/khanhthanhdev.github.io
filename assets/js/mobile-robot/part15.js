// Part 15 of the mobile robots series: path planning and navigation. A costmap that turns the map into where the
// robot may go; A* searching it, compared with Dijkstra and a greedy search; how much the planner should fear
// obstacles; pure pursuit following the plan; and replanning when a chair appears in the way.
(function () {
  "use strict";

  const MR = window.MR;
  const { slider, select } = MR.controls;
  const { rgbOf, mix } = MR.view;
  const m2 = (v) => `${v.toFixed(2)} m`;
  const cm = (v) => `${(v * 100).toFixed(1)} cm`;

  // from the corner by the door to the far side of the dividing wall
  const START = [0.7, 0.8, 0];
  const GOAL = [7.6, 0.8];
  const CHAIR = [5.8, 2.8, 6.4, 3.4];
  const SEEN_AT = 40; // the path index where the robot first sees the chair

  function roomWithChair() {
    const world = MR.room();
    const [x0, y0, x1, y1] = CHAIR;
    const poly = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
    world.shapes.push({ name: "chair", h: 0.9, poly });
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length];
      world.segs.push({ s: [p[0], p[1], q[0], q[1]], h: 0.9 });
    });
    return world;
  }

  MR.scenes.part15 = function (stage) {
    const { svg, controls, strip } = stage;
    const world = MR.room();
    const chairWorld = roomWithChair();
    const R = MR.view.room(svg, world, { title: "the room from above (1 m grid)" });
    R.layer("map"); // under the paths and the robot

    /* ---------------------------------------------- inputs */

    const state = { search: "astar", weight: 4, look: 4, chair: false };
    const searchIn = select(
      "search",
      [
        ["dijkstra", "Dijkstra"],
        ["astar", "A*"],
        ["greedy", "A*, heuristic × 3"],
      ],
      state.search,
      (v) => ((state.search = v), stage.refresh())
    );
    const weightIn = slider("fear of obstacles", 0, 10, state.weight, (v) => ((state.weight = v), stage.refresh()), String, 1);
    const lookIn = slider(
      "lookahead",
      1,
      12,
      state.look,
      (v) => ((state.look = v), stage.refresh()),
      (v) => `${(v / 10).toFixed(1)} m`,
      1
    );
    const chairIn = MR.controls.button("put a chair in the way", () => {
      state.chair = !state.chair;
      chairIn.textContent = state.chair ? "take the chair away" : "put a chair in the way";
      stage.refresh();
    });
    controls.append(searchIn.wrap, weightIn.wrap, lookIn.wrap, chairIn);
    function show(...which) {
      controls.hidden = !which.length;
      [
        [searchIn.wrap, "search"],
        [weightIn.wrap, "weight"],
        [lookIn.wrap, "look"],
        [chairIn, "chair"],
      ].forEach(([el, key]) => (el.style.display = which.includes(key) ? "" : "none"));
    }

    /* ---------------------------------------------- data */

    let cmap = null;
    let chairMap = null;
    const costmap = () => (cmap ??= MR.costmap(world));
    const costmapChair = () => (chairMap ??= MR.costmap(chairWorld));
    const plans = new Map();
    function plan(key, map, from, opts) {
      if (!plans.has(key)) plans.set(key, MR.astar(map, from, GOAL, opts));
      return plans.get(key);
    }
    const HEUR = { dijkstra: 0, astar: 1, greedy: 3 };
    const searchPlan = () => plan(`s:${state.search}`, costmap(), START, { heuristic: HEUR[state.search] });
    const mainPlan = () => plan("s:astar", costmap(), START, {});
    // the closest the path comes to anything, less the robot's radius: the gap the robot's edge keeps
    function clearance(path) {
      const c = costmap();
      let d = Infinity;
      for (const p of path) d = Math.min(d, c.dist[Math.floor(p[1] / c.res) * c.W + Math.floor(p[0] / c.res)]);
      return d - c.robotR;
    }
    const drives = new Map();
    function drive(look) {
      if (!drives.has(look)) drives.set(look, MR.pursue(mainPlan().path, START, { lookahead: look / 10 }));
      return drives.get(look);
    }
    // how far each pose driven is from the path
    function offPath(poses, path) {
      return poses.map((p) => Math.min(...path.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))));
    }

    /* ---------------------------------------------- drawing */

    // lethal cells dark, the inflated band shading from orange to clear as cost falls
    // the colours, read again whenever the theme changes, since the map repaints itself then
    let pal = null;
    let palTheme;
    function palette() {
      const theme = document.documentElement.getAttribute("data-theme");
      if (theme !== palTheme) {
        palTheme = theme;
        pal = { ink: rgbOf("--mr-ink"), hot: rgbOf("--mr-d"), seen: rgbOf("--mr-a"), floor: rgbOf("--mr-floor") };
      }
      return pal;
    }
    function paintCost(c, cells = null) {
      R.painted("map", c.W, c.H, (x, y) => {
        const { ink, hot, seen, floor } = palette();
        const k = y * c.W + x;
        const v = c.cost[k];
        if (v >= 1) return [...ink, 200];
        if (cells && cells[k]) return [...mix(floor, seen, 0.25 + 0.4 * v), 255];
        if (v > 0) return [...hot, Math.round(40 + 170 * v)];
        return [0, 0, 0, 0];
      });
    }
    function expanded(c, order, n) {
      const cells = new Uint8Array(c.W * c.H);
      for (let i = 0; i < n; i++) cells[order[i]] = 1;
      return cells;
    }
    const goal = () => R.dots([GOAL], "is-b", 5);
    function roomOnly() {
      MR.view.arrange(svg, [{ obj: R }]);
    }

    /* ---------------------------------------------- render */

    const steps = {
      costmap() {
        show();
        const c = costmap();
        paintCost(c);
        roomOnly();
        R.set("a", goal());
        R.set("robot", R.robot(START, "is-a", 0.36));
        let lethal = 0;
        let inflated = 0;
        for (const v of c.cost) {
          if (v >= 1) lethal++;
          else if (v > 0) inflated++;
        }
        strip(`${c.W * c.H} cells of 10 cm · ${lethal} lethal · ${inflated} inflated · the rest free`);
      },

      search(t = 0) {
        show("search");
        const c = costmap();
        const A = searchPlan();
        // scroll through the search: the first 80% grows the explored cells, the rest shows the path
        const u = Math.min(1, (t ?? 0) / 0.8);
        const n = Math.max(1, Math.round(u * A.expanded));
        paintCost(c, expanded(c, A.order, n));
        roomOnly();
        R.set("a", u >= 1 ? R.path(A.path, "is-c") : null, goal());
        R.set("robot", R.robot(START, "is-a", 0.36));
        strip(`${n} of ${A.expanded} cells explored${u >= 1 ? ` · path ${m2(A.length)}` : ""}`);
      },

      weight() {
        show("weight");
        const c = costmap();
        const A = plan(`w:${state.weight}`, c, START, { weight: state.weight });
        paintCost(c);
        roomOnly();
        R.set("a", R.path(A.path, "is-c"), goal());
        R.set("robot", R.robot(START, "is-a", 0.36));
        strip(`path ${m2(A.length)} · its edge passes ${cm(clearance(A.path))} from the nearest obstacle`);
      },

      follow() {
        show("look");
        const A = mainPlan();
        const P = drive(state.look);
        const off = offPath(P, A.path);
        const c = costmap();
        paintCost(c);
        roomOnly();
        R.set("a", R.path(A.path, "is-muted is-dash"), R.path(P, "is-a"), goal());
        R.set("robot", R.robot(P[P.length - 1], "is-a", 0.36));
        strip(`${(P.length * 0.05).toFixed(1)} s · ${cm(MR.mean(off))} off the path on average, ${cm(Math.max(...off))} at worst`);
      },

      replan() {
        show("chair");
        const old = mainPlan();
        const here = old.path[SEEN_AT];
        if (!state.chair) {
          paintCost(costmap());
          roomOnly();
          R.set("a", R.path(old.path, "is-c"), goal());
          R.set("robot", R.robot([...here, Math.atan2(old.path[SEEN_AT + 1][1] - here[1], old.path[SEEN_AT + 1][0] - here[0])], "is-a", 0.36));
          strip(`on its way · ${m2(old.length)} planned`);
          return;
        }
        const c = costmapChair();
        const A = plan("chair", c, here, {});
        paintCost(c);
        roomOnly();
        let done = 0;
        for (let i = 1; i <= SEEN_AT; i++) done += Math.hypot(old.path[i][0] - old.path[i - 1][0], old.path[i][1] - old.path[i - 1][1]);
        R.set(
          "a",
          R.path(old.path.slice(SEEN_AT), "is-b is-dash"),
          R.path(old.path.slice(0, SEEN_AT + 1), "is-muted"),
          R.path(A.path, "is-c"),
          R.path(chairWorld.shapes[chairWorld.shapes.length - 1].poly, "is-ink", true),
          goal()
        );
        R.set("robot", R.robot([...here, Math.atan2(A.path[1][1] - here[1], A.path[1][0] - here[0])], "is-a", 0.36));
        strip(`blocked · new plan ${m2(A.length)} from here · ${m2(done + A.length)} in all, not ${m2(old.length)}`);
      },
    };

    return { render: (id, t) => steps[id](t) };
  };
})();
