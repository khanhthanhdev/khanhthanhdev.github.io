// Part 11 of the mobile robots series: depth cameras. A depth image as a picture of distances; stereo depth from
// disparity and its error that grows with the square of the distance; why matching needs texture, and how a
// projector supplies it; back-projecting pixels into a point cloud; and the low obstacles a 2-D lidar can't see.
(function () {
  "use strict";

  const MR = window.MR;
  const { s, paint, painted, rgbOf, mix } = MR.view;
  const { slider } = MR.controls;
  const cm = (v) => `${(v * 100).toFixed(1)} cm`;
  const f2 = (v) => v.toFixed(2);

  const POSE = [1.0, 2.1, 0];
  const IMG = { W: 96, H: 60 }; // the depth image, in pixels
  const HFOV = MR.rad(87);
  const STEREO_F = 424 / Math.tan(HFOV / 2); // focal length in pixels, for an image 848 pixels wide
  const LIDAR_H = 0.2; // the lidar's beam, above the floor (m)
  const ROBOT_H = 0.5; // anything lower than this is in the robot's way (m)
  const FLOOR = 0.03; // points lower than this are floor (m)

  // part 1's room, with a toy on the floor: 8 cm high, below the lidar's beam
  function roomWithToy() {
    const world = MR.room();
    const toy = [
      [1.9, 2.25],
      [2.1, 2.25],
      [2.1, 2.45],
      [1.9, 2.45],
    ];
    world.shapes.push({ name: "toy", h: 0.08, poly: toy });
    toy.forEach((p, i) => {
      const q = toy[(i + 1) % toy.length];
      world.segs.push({ s: [p[0], p[1], q[0], q[1]], h: 0.08 });
    });
    return world;
  }

  MR.scenes.part11 = function (stage) {
    const { svg, controls, strip } = stage;
    const tall = window.TF.view.narrow.matches;
    const world = roomWithToy();
    const R = MR.view.room(svg, world, { title: "the room from above (1 m grid)" });
    const P = MR.view.plot(svg, { width: 420, height: tall ? 200 : 150, right: 60 });
    const Q = MR.view.plot(svg, { width: 420, height: tall ? 160 : 120, right: 60 });

    /* ---------------------------------------------- inputs */

    const state = { base: 5, kind: "texture" };
    const baseIn = slider(
      "baseline",
      2,
      20,
      state.base,
      (v) => ((state.base = v), stage.refresh()),
      (v) => `${v} cm`,
      1
    );
    const kindIn = MR.controls.select(
      "surface",
      [
        ["texture", "patterned"],
        ["blank", "plain wall"],
        ["dots", "plain wall + projector"],
      ],
      state.kind,
      (v) => ((state.kind = v), stage.refresh())
    );
    controls.append(baseIn.wrap, kindIn.wrap);
    function show(...which) {
      controls.hidden = !which.length;
      [
        [baseIn.wrap, "base"],
        [kindIn.wrap, "kind"],
      ].forEach(([el, key]) => (el.style.display = which.includes(key) ? "" : "none"));
    }

    /* ---------------------------------------------- data */

    const CAM = MR.depthImage(world, POSE, IMG);
    const CLOUD = MR.cloud(CAM, POSE);
    const kindOf = (p) => (p[2] < FLOOR ? "floor" : p[2] < ROBOT_H ? "low" : "high");
    // the lidar's beam is a flat slice at LIDAR_H: it only hits what reaches that high
    const LIDAR = MR.scanPoints(MR.scan({ ...world, segs: world.segs.filter((sg) => sg.h >= LIDAR_H) }, POSE, { n: 360, sd: 0.01, seed: 3 }), POSE);
    const onToy = (p) => p[0] > 1.85 && p[0] < 2.15 && p[1] > 2.2 && p[1] < 2.5;

    /* ---------------------------------------------- the depth image */

    const SC = 5; // svg units per pixel
    const pic = MR.view.group(svg, { x: -10, y: -40, width: IMG.W * SC + 20, height: IMG.H * SC + 110 });
    {
      const g = pic.el;
      g.append(s("text", { class: "tf-mat-title", x: 0, y: -16, text: `the depth image, ${IMG.W} × ${IMG.H} pixels` }));
      const near = 0.5;
      const far = 6;
      const colour = (z) => {
        if (!isFinite(z)) return [...rgbOf("--mr-floor"), 255];
        return [...mix(rgbOf("--mr-d"), rgbOf("--mr-a"), Math.min(1, Math.max(0, (z - near) / (far - near)))), 255];
      };
      painted(g, { x: 0, y: 0, width: IMG.W * SC, height: IMG.H * SC }, () => paint(IMG.W, IMG.H, (c, r) => colour(CAM.img[r][c])));
      g.append(s("rect", { x: 0, y: 0, width: IMG.W * SC, height: IMG.H * SC, style: "fill: none; stroke: var(--tf-muted)" }));
      // the centre pixel
      const cx = (IMG.W / 2) * SC;
      const cy = (IMG.H / 2) * SC;
      g.append(
        s("circle", { class: "mr-line is-ink", cx, cy, r: 7, fill: "none" }),
        s("text", { class: "tf-small", x: cx + 12, y: cy - 8, text: `${f2(CAM.img[IMG.H / 2][IMG.W / 2])} m` })
      );
      // the colour scale
      const y0 = IMG.H * SC + 30;
      painted(g, { x: 0, y: y0, width: 240, height: 14 }, () => paint(60, 1, (c) => colour(near + ((far - near) * c) / 59)));
      g.append(
        s("text", { class: "tf-small", x: 0, y: y0 + 32, text: `${near} m` }),
        s("text", { class: "tf-small", x: 240, y: y0 + 32, "text-anchor": "end", text: `${far} m` }),
        s("rect", { x: 270, y: y0, width: 14, height: 14, style: "fill: var(--mr-floor); stroke: var(--tf-muted)" }),
        s("text", { class: "tf-small", x: 292, y: y0 + 12, text: "no reading" })
      );
    }

    /* ---------------------------------------------- render */

    // the edges of the camera's view, out to the first wall
    const fov = () =>
      [1, -1].map((side) => {
        const a = POSE[2] + (side * HFOV) / 2;
        const d = MR.ray(world, POSE[0], POSE[1], a, 6);
        return R.line(POSE, [POSE[0] + d * Math.cos(a), POSE[1] + d * Math.sin(a)], "is-dash is-muted");
      });
    function roomOnly() {
      MR.view.hideAll(P, Q, pic);
      MR.view.arrange(svg, [{ obj: R }]);
    }

    const steps = {
      image() {
        show();
        MR.view.hideAll(P, Q, R);
        MR.view.arrange(svg, [{ obj: pic }]);
        const fin = CAM.img.flat().filter(isFinite);
        strip(`each pixel is a distance · ${fin.length} of ${IMG.W * IMG.H} have one · the box ahead is ${f2(CAM.img[IMG.H / 2][IMG.W / 2])} m away`);
      },

      stereo() {
        show("base");
        const b = state.base / 100;
        const zs = Array.from({ length: 51 }, (_, i) => 0.2 + i * 0.1);
        const err = (z) => 100 * MR.stereoError(STEREO_F, b, z, 0.1);
        P.title("depth error, σ (cm)");
        P.set([{ xs: zs, ys: zs.map(err), cls: "is-b" }], { xMin: 0, xMax: 5, yMin: 0, yMax: 10, xTitle: "distance (m)" });
        MR.view.hideAll(Q, R, pic);
        MR.view.arrange(svg, [{ obj: P }]);
        strip(
          `${state.base} cm apart · 1.60 m gives ${((STEREO_F * b) / 1.6).toFixed(1)} px of disparity · error ${cm(err(1) / 100)} at 1 m, ${cm(err(4) / 100)} at 4 m`
        );
      },

      match() {
        show("kind");
        const m = MR.stereoRow(state.kind);
        const xs = m.left.map((_, i) => i);
        P.title("brightness along one row of each image");
        P.set(
          [
            { xs, ys: m.left, cls: "is-a", label: "left" },
            { xs, ys: m.right, cls: "is-d", label: "right", dy: 12 },
          ],
          {
            xMax: 200,
            yMin: 0,
            yMax: 1.1,
            vlines: [
              { x: 93, cls: "is-muted" },
              { x: 107, cls: "is-muted" },
            ],
            xTitle: "pixel",
          }
        );
        Q.title("how badly each shift matches");
        Q.set([{ xs: m.cost.map((_, k) => k), ys: m.cost, cls: "is-b", dots: true }], {
          xMax: 40,
          yMin: 0,
          yMax: Math.max(0.1, ...m.cost) * 1.1,
          vlines: [{ x: m.best, cls: "is-ink", label: `${m.best} px` }],
          xTitle: "disparity tried (px)",
        });
        MR.view.hideAll(R, pic);
        MR.view.arrange(svg, [{ obj: P, gap: 24 }, { obj: Q }], { stack: true });
        strip(
          `best match ${m.best} px (truth 14) → ${f2(MR.stereoDepth(STEREO_F, 0.05, m.best || 0.5))} m · next best is ${m.ratio.toFixed(1)}× worse`
        );
      },

      cloud() {
        show();
        const by = { floor: [], low: [], high: [] };
        CLOUD.forEach((p) => by[kindOf(p)].push(p));
        R.set("a", R.dots(by.floor, "is-muted", 1), R.dots(by.high, "is-a", 1.2), R.dots(by.low, "is-b", 1.4), ...fov());
        R.set("robot", R.robot(POSE, "is-a", 0.36));
        roomOnly();
        strip(`${CLOUD.length} points · ${by.floor.length} floor · ${by.low.length} in the robot's way (red) · ${by.high.length} above it`);
      },

      low() {
        show();
        const low = CLOUD.filter((p) => kindOf(p) === "low");
        R.set("a", R.dots(low, "is-b", 1.4), R.dots(LIDAR, "is-c", 2), ...fov());
        R.set("robot", R.robot(POSE, "is-a", 0.36));
        roomOnly();
        strip(`the toy, 8 cm high · lidar points on it: ${LIDAR.filter(onToy).length} · depth camera points: ${low.filter(onToy).length}`);
      },
    };

    return { render: (id, t) => steps[id](t) };
  };
})();
