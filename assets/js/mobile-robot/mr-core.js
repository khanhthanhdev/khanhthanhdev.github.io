// The simulated robot for the "Mobile robots from scratch" series: one room, one differential-drive robot, and every
// algorithm the series builds (encoders, odometry, PID, lidar, Kalman and particle filters, mapping, scan matching,
// pose graphs, planning). Plain functions on plain arrays, seeded so every page computes the same numbers, and
// usable from Node (module.exports) so the numbers quoted in the text come from this exact code.
(function (root) {
  "use strict";

  /* ---------------------------------------------------------------- numbers */

  const TAU = 2 * Math.PI;
  const wrap = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const deg = (r) => (r * 180) / Math.PI;
  const rad = (d) => (d * Math.PI) / 180;
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const std = (xs) => {
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  };

  // mulberry32: a small seeded generator. next() is uniform on [0, 1), gauss() a standard normal (Box–Muller).
  function rng(seed = 1) {
    let a = seed >>> 0;
    let spare = null;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const gauss = (mu = 0, sd = 1) => {
      if (spare != null) {
        const v = spare;
        spare = null;
        return mu + sd * v;
      }
      const u = Math.max(1e-12, next());
      const v = next();
      const m = Math.sqrt(-2 * Math.log(u));
      spare = m * Math.sin(TAU * v);
      return mu + sd * m * Math.cos(TAU * v);
    };
    return { next, gauss };
  }

  /* ---------------------------------------------------------------- poses and frames */

  // A pose is [x, y, θ]: metres, metres, radians anticlockwise from the x axis.
  // A point given in the robot's frame (x forward, y left) as a point in the world.
  function toWorld(pose, p) {
    const c = Math.cos(pose[2]);
    const s = Math.sin(pose[2]);
    return [pose[0] + c * p[0] - s * p[1], pose[1] + s * p[0] + c * p[1]];
  }
  // A world point in the robot's frame.
  function toLocal(pose, p) {
    const c = Math.cos(pose[2]);
    const s = Math.sin(pose[2]);
    const dx = p[0] - pose[0];
    const dy = p[1] - pose[1];
    return [c * dx + s * dy, -s * dx + c * dy];
  }
  // Pose composition a ⊕ b (b expressed in a's frame), and the relative pose of b seen from a (a ⊖ b).
  const compose = (a, b) => [...toWorld(a, b), wrap(a[2] + b[2])];
  const relative = (a, b) => [...toLocal(a, b), wrap(b[2] - a[2])];

  /* ---------------------------------------------------------------- the room */

  // A 10 m × 6 m room with a few things in it. Walls are segments [x1, y1, x2, y2]; shapes are the closed polygons the
  // figures fill, with a height for the depth camera.
  function room() {
    const shapes = [
      { name: "box", h: 0.8, poly: rectPoly(2.6, 1.6, 3.8, 2.6) },
      { name: "table", h: 0.75, poly: rectPoly(1.0, 4.3, 2.3, 5.2) },
      { name: "pillar", h: 2.4, poly: circlePoly(7.6, 4.2, 0.35, 10) },
      { name: "wall", h: 2.4, poly: rectPoly(6.0, 0, 6.15, 2.6) },
      { name: "cabinet", h: 1.2, poly: rectPoly(9.4, 1.0, 10, 2.2) },
    ];
    const segs = [
      [0, 0, 10, 0],
      [10, 0, 10, 6],
      [10, 6, 0, 6],
      [0, 6, 0, 0],
    ].map((s) => ({ s, h: 2.4 }));
    shapes.forEach((sh) => {
      sh.poly.forEach((p, i) => {
        const q = sh.poly[(i + 1) % sh.poly.length];
        segs.push({ s: [p[0], p[1], q[0], q[1]], h: sh.h });
      });
    });
    return { w: 10, h: 6, wallH: 2.4, shapes, segs };
  }
  function rectPoly(x0, y0, x1, y1) {
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
  }
  function circlePoly(cx, cy, r, n) {
    return Array.from({ length: n }, (_, i) => [cx + r * Math.cos((TAU * i) / n), cy + r * Math.sin((TAU * i) / n)]);
  }

  // Distance along a ray from (x, y) at angle a to the first wall, or Infinity. Returns the hit segment too.
  function rayHit(world, x, y, a, max = Infinity) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = max;
    let seg = null;
    for (const w of world.segs) {
      const [x1, y1, x2, y2] = w.s;
      const ex = x2 - x1;
      const ey = y2 - y1;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((x1 - x) * ey - (y1 - y) * ex) / den;
      const u = ((x1 - x) * dy - (y1 - y) * dx) / den;
      if (t > 1e-9 && u >= 0 && u <= 1 && t < best) {
        best = t;
        seg = w;
      }
    }
    return { r: best, seg };
  }
  const ray = (world, x, y, a, max) => rayHit(world, x, y, a, max).r;

  // Is a point inside the room and outside every shape (with a margin)?
  function free(world, p, margin = 0) {
    if (p[0] < margin || p[1] < margin || p[0] > world.w - margin || p[1] > world.h - margin) return false;
    for (const sh of world.shapes) if (inPoly(sh.poly, p) || nearPoly(sh.poly, p, margin)) return false;
    return true;
  }
  function inPoly(poly, p) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function segDist(p, a, b) {
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const t = clamp(((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1), 0, 1);
    return Math.hypot(p[0] - a[0] - t * ex, p[1] - a[1] - t * ey);
  }
  function nearPoly(poly, p, margin) {
    if (margin <= 0) return false;
    return poly.some((a, i) => segDist(p, a, poly[(i + 1) % poly.length]) < margin);
  }

  /* ---------------------------------------------------------------- the robot */

  // A small differential-drive robot, sized like the hobby kits people build: 70 mm wheels 220 mm apart, and hobby
  // gear motors whose Hall encoders give 11 pulses per motor turn, read on all 4 edges, through a 1:30 gearbox.
  const ROBOT = {
    wheelR: 0.035,
    track: 0.22,
    ppr: 11,
    gear: 30,
    get cpr() {
      return this.ppr * 4 * this.gear; // counts per wheel turn: 1,320
    },
  };

  // Wheel speeds (m/s) from a body twist (v forward m/s, ω rad/s), and back.
  const wheels = (v, w, L = ROBOT.track) => [v - (w * L) / 2, v + (w * L) / 2];
  const twist = (vl, vr, L = ROBOT.track) => [(vl + vr) / 2, (vr - vl) / L];

  // Moves a pose by wheel travels dl and dr (metres) on an exact arc. The midpoint form of the same step is what
  // most robots run; the arc form is exact for constant wheel speeds.
  function arcStep(pose, dl, dr, L = ROBOT.track) {
    const ds = (dl + dr) / 2;
    const dth = (dr - dl) / L;
    const [x, y, th] = pose;
    if (Math.abs(dth) < 1e-9) return [x + ds * Math.cos(th), y + ds * Math.sin(th), th];
    const R = ds / dth;
    return [x + R * (Math.sin(th + dth) - Math.sin(th)), y - R * (Math.cos(th + dth) - Math.cos(th)), wrap(th + dth)];
  }
  function midStep(pose, dl, dr, L = ROBOT.track) {
    const ds = (dl + dr) / 2;
    const dth = (dr - dl) / L;
    const m = pose[2] + dth / 2;
    return [pose[0] + ds * Math.cos(m), pose[1] + ds * Math.sin(m), wrap(pose[2] + dth)];
  }

  // The instantaneous centre of rotation for wheel speeds vl, vr: signed radius from the robot's centre (to its left).
  function icr(vl, vr, L = ROBOT.track) {
    if (Math.abs(vr - vl) < 1e-9) return Infinity;
    return ((vr + vl) / (vr - vl)) * (L / 2);
  }

  // A driving plan: a list of [v, ω, seconds] legs. square(side) is the classic UMBmark test: a square driven
  // anticlockwise, stopping to turn on the spot at each corner.
  function square(side = 3, v = 0.3, w = 1.0) {
    const legs = [];
    for (let k = 0; k < 4; k++) legs.push([v, 0, side / v], [0, w, Math.PI / 2 / w]);
    return legs;
  }

  // Drives a plan for real and by odometry. The real robot has its own true wheel radii and track (errors relative to
  // the nominal ones the odometry uses) and may slip; its encoders count whole ticks. Returns the true poses, the
  // odometry poses, the cumulative ticks and the times, every dt seconds.
  function drive(legs, opts = {}) {
    const dt = opts.dt ?? 0.02;
    const start = opts.start ?? [1, 1, 0];
    const R = ROBOT.wheelR;
    const rl = R * (1 + (opts.radiusL ?? 0));
    const rr = R * (1 + (opts.radiusR ?? 0));
    const Ltrue = ROBOT.track * (1 + (opts.track ?? 0));
    const slip = opts.slip ?? 0;
    const r = rng(opts.seed ?? 3);
    const cpr = ROBOT.cpr;
    let truth = start.slice();
    let odom = start.slice();
    let angL = 0; // true wheel angles (rad)
    let angR = 0;
    let ticksL = 0;
    let ticksR = 0;
    const out = { truth: [truth], odom: [odom], ticks: [[0, 0]], t: [0], twist: [[0, 0]] };
    let time = 0;
    for (const [v0, w0, dur] of legs) {
      // whole time steps; the speeds are scaled so the leg still covers exactly v·dur and turns exactly ω·dur
      const n = Math.max(1, Math.round(dur / dt));
      const k = dur / (n * dt);
      // wheel angular speeds that would give (v, ω) on the nominal robot
      const [vl, vr] = wheels(v0 * k, w0 * k);
      for (let i = 0; i < n; i++) {
        const dAL = (vl / R) * dt;
        const dAR = (vr / R) * dt;
        angL += dAL;
        angR += dAR;
        // the ground moves under the wheel by its true radius, less any slip
        const sl = slip ? 1 - Math.abs(r.gauss(0, slip)) : 1;
        const sr = slip ? 1 - Math.abs(r.gauss(0, slip)) : 1;
        truth = arcStep(truth, dAL * rl * sl, dAR * rr * sr, Ltrue);
        // the encoders count whole ticks of wheel angle
        const nl = Math.floor((angL / TAU) * cpr);
        const nr = Math.floor((angR / TAU) * cpr);
        const dl = ((nl - ticksL) / cpr) * TAU * R;
        const dr = ((nr - ticksR) / cpr) * TAU * R;
        ticksL = nl;
        ticksR = nr;
        odom = (opts.midpoint ? midStep : arcStep)(odom, dl, dr);
        time += dt;
        out.truth.push(truth);
        out.odom.push(odom);
        out.ticks.push([ticksL, ticksR]);
        out.t.push(time);
        out.twist.push(twist(dl / dt, dr / dt));
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------- quadrature encoders */

  // The two channels at a count: A and B are square waves a quarter cycle apart (Gray code 00, 10, 11, 01).
  function quadrature(count) {
    const s = ((count % 4) + 4) % 4;
    return [s === 1 || s === 2 ? 1 : 0, s >= 2 ? 1 : 0];
  }
  // Decoding: the change between two successive (A, B) states. +1, −1, 0, or null when both bits flipped (a step was
  // missed and the direction is unknown).
  const STATE = { "0,0": 0, "1,0": 1, "1,1": 2, "0,1": 3 };
  function decode(prev, cur) {
    const d = (STATE[cur] - STATE[prev] + 4) % 4;
    return d === 0 ? 0 : d === 1 ? 1 : d === 3 ? -1 : null;
  }

  // Reads an encoder spinning at `cps` counts per second for `seconds`, the way a microcontroller might: by polling
  // its two pins every `period` seconds (± jitter), or with an interrupt on every edge that costs `isr` seconds of
  // CPU. Returns the true count, the count read, how many steps were lost, and the share of CPU used.
  function readEncoder(cps, seconds, method, opts = {}) {
    const r = rng(opts.seed ?? 11);
    const trueCount = Math.floor(cps * seconds);
    if (method === "pcnt") return { trueCount, read: trueCount, lost: 0, cpu: 0 };
    if (method === "interrupt") {
      const isr = opts.isr ?? 2e-6;
      const cpu = cps * isr;
      // an edge that arrives while the previous handler is still running waits; past 100% load, edges pile up
      const read = cpu < 1 ? trueCount : Math.floor(trueCount / cpu);
      return { trueCount, read, lost: trueCount - read, cpu: Math.min(1, cpu) };
    }
    const period = opts.period ?? 1e-4;
    const jitter = opts.jitter ?? 0;
    let t = 0;
    let read = 0;
    let lost = 0;
    let prev = quadrature(0).join();
    while (t < seconds) {
      t += Math.max(1e-7, period + r.gauss(0, jitter));
      const cur = quadrature(Math.floor(cps * Math.min(t, seconds))).join();
      const d = decode(prev, cur);
      if (d == null) lost += 2;
      else {
        // a jump of three steps looks like one step backwards
        read += d;
        if (d === -1) lost += 4;
      }
      prev = cur;
    }
    return { trueCount, read, lost: Math.max(0, trueCount - read), cpu: (opts.pollCost ?? 0.5e-6) / period };
  }

  // A control loop on a microcontroller, cycle by cycle. With "delay" it does its work, then sleeps a fixed `period`,
  // so every cycle lasts period + work; with "until" it sleeps until the next multiple of `period`. Every
  // `spikeEvery` cycles another task (Wi-Fi, say) holds the CPU when the loop should wake, delaying it by `spike` s.
  // Returns each cycle's start time and length.
  function loopTiming({ cycles = 200, period = 0.01, work = 0.0013, workSd = 0.0003, mode = "until", spike = 0, spikeEvery = 25, seed = 4 } = {}) {
    const r = rng(seed);
    const starts = [];
    let wake = 0;
    for (let i = 0; i < cycles; i++) {
      const start = wake + (spike && i % spikeEvery === spikeEvery - 1 ? spike : 0);
      starts.push(start);
      const busy = Math.max(0, work + r.gauss(0, workSd));
      wake = mode === "delay" ? start + busy + period : Math.max((i + 1) * period, start + busy);
    }
    const lengths = starts.slice(1).map((v, i) => v - starts[i]);
    return { starts: starts.slice(0, -1), lengths };
  }

  /* ---------------------------------------------------------------- sensors and noise */

  // n readings of a range sensor looking at a wall `truth` metres away, with a fixed bias and Gaussian noise.
  function readings(truth, n, { bias = 0, sd = 0.01, seed = 5, quant = 0 } = {}) {
    const r = rng(seed);
    return Array.from({ length: n }, () => {
      const v = truth + bias + r.gauss(0, sd);
      return quant ? Math.round(v / quant) * quant : v;
    });
  }

  // A gyro on a robot standing still: rate readings (rad/s) with a bias, white noise and a slowly wandering bias,
  // integrated into a heading. calibrate subtracts the mean of the first `calib` seconds.
  function gyro(seconds, { rate = 100, bias = rad(0.5), sd = rad(0.1), walk = rad(0.002), seed = 9, calib = 0 } = {}) {
    const r = rng(seed);
    const dt = 1 / rate;
    let b = bias;
    let heading = 0;
    const raw = [];
    const t = [];
    const headingOf = [];
    const n = Math.round(seconds * rate);
    const all = [];
    for (let i = 0; i < n; i++) {
      b += r.gauss(0, walk * Math.sqrt(dt));
      all.push(b + r.gauss(0, sd));
    }
    const offset = calib ? mean(all.slice(0, Math.round(calib * rate))) : 0;
    for (let i = 0; i < n; i++) {
      const g = all[i] - offset;
      raw.push(g);
      heading += g * dt;
      t.push((i + 1) * dt);
      headingOf.push(heading);
    }
    return { raw, t, heading: headingOf };
  }

  // An ultrasonic range finder: it sends a cone of sound (±half degrees) and reports the first echo. A wall hit at
  // more than `maxIncidence` from straight on reflects the sound away (specular) and sends no echo back.
  function sonar(world, pose, { half = rad(15), rays = 31, maxIncidence = rad(40), max = 4 } = {}) {
    let best = Infinity;
    let bestA = null;
    const hits = [];
    for (let i = 0; i < rays; i++) {
      const a = pose[2] - half + (2 * half * i) / (rays - 1);
      const { r, seg } = rayHit(world, pose[0], pose[1], a, max);
      if (!seg) {
        hits.push({ a, r: max, echo: false });
        continue;
      }
      const [x1, y1, x2, y2] = seg.s;
      // angle between the ray and the wall's normal
      const nx = -(y2 - y1);
      const ny = x2 - x1;
      const inc = Math.acos(Math.abs(Math.cos(a) * nx + Math.sin(a) * ny) / Math.hypot(nx, ny));
      const echo = inc <= maxIncidence;
      hits.push({ a, r, echo, inc });
      if (echo && r < best) {
        best = r;
        bestA = a;
      }
    }
    return { r: best, a: bestA, hits, ahead: ray(world, pose[0], pose[1], pose[2], 50) };
  }

  // An accelerometer on a robot standing still, integrated twice into a position: a bias and white noise turn into a
  // position error that grows with the square of time.
  function accelDrift(seconds, { rate = 100, bias = 0.01, sd = 0.02, seed = 13 } = {}) {
    const r = rng(seed);
    const dt = 1 / rate;
    let v = 0;
    let x = 0;
    const t = [];
    const pos = [];
    const n = Math.round(seconds * rate);
    for (let i = 0; i < n; i++) {
      const a = bias + r.gauss(0, sd);
      v += a * dt;
      x += v * dt;
      t.push((i + 1) * dt);
      pos.push(x);
    }
    return { t, pos };
  }

  // An exponential moving average: y ← y + α (x − y).
  function ema(xs, alpha) {
    let y = xs[0];
    return xs.map((x) => (y += alpha * (x - y)));
  }

  /* ---------------------------------------------------------------- motors and PID */

  // A DC gear motor and wheel as a first-order system: τ dω/dt = K·u − ω − load, with u the PWM duty in [−1, 1],
  // K the no-load speed at full duty (rad/s at the wheel) and τ the time constant. A PID controller (or none) sets u
  // every dt to reach `target` rad/s; at `loadAt` seconds a load (a ramp, a carpet) slows the wheel by `load` rad/s.
  // During `stall` ([from, to] seconds) the wheel is held still, as if jammed against a doorstep. antiWindup stops the
  // integral growing while the output is saturated.
  const MOTOR = { K: 18, tau: 0.12 };
  function pidRun({
    kp = 0,
    ki = 0,
    kd = 0,
    open = false,
    target = 10,
    seconds = 2,
    dt = 0.01,
    load = 4,
    loadAt = 1,
    noise = 0,
    seed = 2,
    stall = null,
    antiWindup = true,
  } = {}) {
    const r = rng(seed);
    let w = 0;
    let integral = 0;
    let prevErr = 0;
    let prevMeas = 0;
    const t = [];
    const speed = [];
    const duty = [];
    const sub = 10; // the motor is simulated 10× finer than the controller runs
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) {
      const time = i * dt;
      const meas = w + (noise ? r.gauss(0, noise) : 0);
      const err = target - meas;
      let u;
      if (open) u = target / MOTOR.K;
      else {
        // derivative on the measurement, so a change of target doesn't kick
        const deriv = i ? -(meas - prevMeas) / dt : 0;
        const tryI = integral + err * dt;
        u = kp * err + ki * tryI + kd * deriv;
        // anti-windup: only integrate while the output isn't saturated
        if (!antiWindup || (u > -1 && u < 1)) integral = tryI;
        u = clamp(kp * err + ki * integral + kd * deriv, -1, 1);
      }
      prevErr = err;
      prevMeas = meas;
      const L = time >= loadAt ? load : 0;
      for (let k = 0; k < sub; k++) w += ((MOTOR.K * u - w - L) / MOTOR.tau) * (dt / sub);
      if (stall && time >= stall[0] && time < stall[1]) w = 0;
      t.push(time + dt);
      speed.push(w);
      duty.push(u);
    }
    // summary numbers for the text
    const before = speed.filter((_, i) => t[i] < loadAt);
    const rise = t[speed.findIndex((v) => v >= 0.9 * target)] ?? null;
    const peak = Math.max(...before);
    const settled = speed[Math.floor(loadAt / dt) - 1];
    const end = speed[speed.length - 1];
    const dip = Math.min(...speed.filter((_, i) => t[i] >= loadAt));
    return { t, speed, duty, rise, overshoot: Math.max(0, (peak - target) / target), settled, end, dip, prevErr };
  }

  /* ---------------------------------------------------------------- lidar */

  // One 360° scan from a pose: n beams, anticlockwise from straight ahead, each { a (robot frame), r }. Beams that hit
  // nothing within `max` come back as r = Infinity. sd is the range noise (metres); propSd the share of range added
  // as noise (triangulation sensors get worse with distance).
  function scan(world, pose, { n = 360, max = 8, min = 0.1, sd = 0, propSd = 0, seed = 7, fov = TAU, start = 0, dropout = 0 } = {}) {
    const r = rng(seed);
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = start + (fov * i) / n;
      let d = ray(world, pose[0], pose[1], pose[2] + a, max + 1);
      if (d > max || d < min || (dropout && r.next() < dropout)) d = Infinity;
      else d += r.gauss(0, sd + propSd * d * d);
      out.push({ a, r: d });
    }
    return out;
  }
  // A scan's hits as points in the robot frame (or in the world, given the pose).
  function scanPoints(sc, pose = null) {
    const pts = [];
    sc.forEach((b) => {
      if (!isFinite(b.r)) return;
      const p = [b.r * Math.cos(b.a), b.r * Math.sin(b.a)];
      pts.push(pose ? toWorld(pose, p) : p);
    });
    return pts;
  }

  // A scan taken while the robot moves: beam i is measured at time i/n of the rotation period, from the pose the robot
  // has then. The driver stamps the whole scan with one pose; `deskew` re-projects each beam from its own pose.
  function movingScan(world, pose, v, w, { n = 360, period = 0.1, max = 8 } = {}) {
    const beams = [];
    for (let i = 0; i < n; i++) {
      const dt = (period * i) / n;
      const p = arcStep(pose, (v - (w * ROBOT.track) / 2) * dt, (v + (w * ROBOT.track) / 2) * dt);
      const a = (TAU * i) / n;
      const d = ray(world, p[0], p[1], p[2] + a, max + 1);
      beams.push({ a, r: d > max ? Infinity : d, dt });
    }
    return beams;
  }
  // The points of a moving scan in the world: assuming every beam left from `stamp` (naive), or from the pose
  // odometry gives for its own time (deskewed).
  function skewedPoints(beams, startPose, v, w, deskew) {
    const pts = [];
    beams.forEach((b) => {
      if (!isFinite(b.r)) return;
      const from = deskew ? arcStep(startPose, (v - (w * ROBOT.track) / 2) * b.dt, (v + (w * ROBOT.track) / 2) * b.dt) : startPose;
      pts.push(toWorld(from, [b.r * Math.cos(b.a), b.r * Math.sin(b.a)]));
    });
    return pts;
  }

  // Splits an ordered scan into runs at range jumps, then each run into straight lines (split and merge).
  function segmentScan(pts, gap = 0.3) {
    const runs = [];
    let cur = [];
    pts.forEach((p, i) => {
      if (i && Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > gap) {
        if (cur.length) runs.push(cur);
        cur = [];
      }
      cur.push(p);
    });
    if (cur.length) runs.push(cur);
    // the scan wraps around: join the last run to the first if they touch
    if (runs.length > 1) {
      const a = runs[runs.length - 1];
      const b = runs[0];
      const p = a[a.length - 1];
      const q = b[0];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= gap) runs[0] = runs.pop().concat(b);
    }
    return runs;
  }
  function splitMerge(run, tol = 0.05, minPts = 4) {
    const lines = [];
    (function split(lo, hi) {
      if (hi - lo + 1 < minPts) return;
      const a = run[lo];
      const b = run[hi];
      let far = -1;
      let at = lo;
      for (let i = lo + 1; i < hi; i++) {
        const d = segDist(run[i], a, b);
        if (d > far) {
          far = d;
          at = i;
        }
      }
      if (far > tol) {
        split(lo, at);
        split(at, hi);
      } else lines.push([a, b, hi - lo + 1]);
    })(0, run.length - 1);
    return lines;
  }

  /* ---------------------------------------------------------------- linear algebra (small and dense) */

  function solve(A, b) {
    // Gaussian elimination with partial pivoting; A is n × n (copied), b length n.
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      const d = M[c][c] || 1e-12;
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / d;
        if (!f) continue;
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let sum = M[r][n];
      for (let k = r + 1; k < n; k++) sum -= M[r][k] * x[k];
      x[r] = sum / (M[r][r] || 1e-12);
    }
    return x;
  }
  const matMul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
  const transpose = (A) => A[0].map((_, j) => A.map((row) => row[j]));
  const matAdd = (A, B) => A.map((row, i) => row.map((v, j) => v + B[i][j]));
  function inv(A) {
    const n = A.length;
    return transpose(
      A.map((_, j) =>
        solve(
          A,
          A.map((__, i) => (i === j ? 1 : 0))
        )
      )
    );
  }

  /* ---------------------------------------------------------------- Kalman filters */

  // One step of a 1-D Kalman filter: predict by `move` with variance q, then fuse a measurement z with variance r.
  function kf1(mu, varr, move, q, z, r) {
    const pm = mu + move;
    const pv = varr + q;
    if (z == null) return { mu: pm, v: pv, gain: 0, pm, pv };
    const k = pv / (pv + r);
    return { mu: pm + k * (z - pm), v: (1 - k) * pv, gain: k, pm, pv };
  }

  // Known beacons the robot can measure range and bearing to (a UWB or reflector setup, or landmarks a camera knows).
  const BEACONS = [
    [0.4, 5.6],
    [5.0, 5.6],
    [9.6, 5.6],
    [9.6, 0.4],
    [0.4, 0.4],
  ];

  // An extended Kalman filter on [x, y, θ] driving `legs`: predict from noisy wheel odometry, correct with noisy
  // range-and-bearing to the beacons within `range` every `every` seconds. Returns truth, odometry, the estimate and
  // its covariance at each step.
  function ekfRun(legs, opts = {}) {
    const dt = opts.dt ?? 0.1;
    const r = rng(opts.seed ?? 21);
    const odoSd = opts.odoSd ?? 0.05; // share of each step's travel
    const rangeSd = opts.rangeSd ?? 0.15;
    const bearSd = opts.bearSd ?? rad(4);
    const every = opts.every ?? 1;
    const use = opts.beacons ?? true;
    const reach = opts.range ?? 4.5;
    let truth = (opts.start ?? [1, 1, 0]).slice();
    let odom = truth.slice();
    let x = truth.slice();
    let P = [
      [0.01, 0, 0],
      [0, 0.01, 0],
      [0, 0, 0.001],
    ];
    const out = { truth: [truth], odom: [odom], est: [x], P: [P], seen: [[]], t: [0] };
    let time = 0;
    let sinceFix = 0;
    for (const [v0, w0, dur] of legs) {
      const n = Math.max(1, Math.round(dur / dt));
      const k = dur / (n * dt);
      for (let i = 0; i < n; i++) {
        // the true motion, and what the wheels report of it
        const [vl, vr] = wheels(v0 * k, w0 * k);
        const dl = vl * dt;
        const dr = vr * dt;
        truth = arcStep(truth, dl, dr);
        const ml = dl + r.gauss(0, odoSd * Math.abs(dl) + 1e-4);
        const mr = dr + r.gauss(0, odoSd * Math.abs(dr) + 1e-4);
        odom = arcStep(odom, ml, mr);
        // predict
        const ds = (ml + mr) / 2;
        const dth = (mr - ml) / ROBOT.track;
        const m = x[2] + dth / 2;
        x = [x[0] + ds * Math.cos(m), x[1] + ds * Math.sin(m), wrap(x[2] + dth)];
        const F = [
          [1, 0, -ds * Math.sin(m)],
          [0, 1, ds * Math.cos(m)],
          [0, 0, 1],
        ];
        const sl = (odoSd * Math.abs(ml) + 1e-4) ** 2;
        const sr = (odoSd * Math.abs(mr) + 1e-4) ** 2;
        // wheel noise mapped into the pose
        const V = [
          [Math.cos(m) / 2, Math.cos(m) / 2],
          [Math.sin(m) / 2, Math.sin(m) / 2],
          [-1 / ROBOT.track, 1 / ROBOT.track],
        ];
        const Q = matMul(
          matMul(V, [
            [sl, 0],
            [0, sr],
          ]),
          transpose(V)
        );
        P = matAdd(matMul(matMul(F, P), transpose(F)), Q);
        time += dt;
        sinceFix += dt;
        const seen = [];
        if (use && sinceFix >= every - 1e-9) {
          sinceFix = 0;
          BEACONS.forEach((b, j) => {
            const dx = b[0] - truth[0];
            const dy = b[1] - truth[1];
            const q = Math.hypot(dx, dy);
            if (q > reach) return;
            const z = [q + r.gauss(0, rangeSd), wrap(Math.atan2(dy, dx) - truth[2] + r.gauss(0, bearSd))];
            const ex = b[0] - x[0];
            const ey = b[1] - x[1];
            const qq = ex * ex + ey * ey;
            const sq = Math.sqrt(qq);
            const zh = [sq, wrap(Math.atan2(ey, ex) - x[2])];
            const H = [
              [-ex / sq, -ey / sq, 0],
              [ey / qq, -ex / qq, -1],
            ];
            const Rm = [
              [rangeSd ** 2, 0],
              [0, bearSd ** 2],
            ];
            const S = matAdd(matMul(matMul(H, P), transpose(H)), Rm);
            const K = matMul(matMul(P, transpose(H)), inv(S));
            const y = [z[0] - zh[0], wrap(z[1] - zh[1])];
            const dxv = K.map((row) => row[0] * y[0] + row[1] * y[1]);
            x = [x[0] + dxv[0], x[1] + dxv[1], wrap(x[2] + dxv[2])];
            const KH = matMul(K, H);
            P = matMul(
              [0, 1, 2].map((a) => [0, 1, 2].map((c) => (a === c ? 1 : 0) - KH[a][c])),
              P
            );
            seen.push(j);
          });
        }
        out.truth.push(truth);
        out.odom.push(odom);
        out.est.push(x);
        out.P.push(P);
        out.seen.push(seen);
        out.t.push(time);
      }
    }
    return out;
  }

  // The 2-σ ellipse of the x, y block of a covariance: [semi-axis a, semi-axis b, angle].
  function ellipse2(P, k = 2) {
    const a = P[0][0];
    const b = P[0][1];
    const c = P[1][1];
    const tr = (a + c) / 2;
    const d = Math.sqrt(Math.max(0, ((a - c) / 2) ** 2 + b * b));
    return [k * Math.sqrt(Math.max(0, tr + d)), k * Math.sqrt(Math.max(0, tr - d)), 0.5 * Math.atan2(2 * b, a - c)];
  }

  /* ---------------------------------------------------------------- particle filter (Monte Carlo localisation) */

  // Particles are { p: [x, y, θ], w }. Each step: move every particle by the odometry step plus noise, weigh it by how
  // well the scan it would see matches the real one, and resample when the weights get uneven.
  function mclInit(world, n, r, around = null) {
    const ps = [];
    while (ps.length < n) {
      const p = around
        ? [around[0] + r.gauss(0, 0.3), around[1] + r.gauss(0, 0.3), wrap(around[2] + r.gauss(0, 0.2))]
        : [r.next() * world.w, r.next() * world.h, (r.next() * 2 - 1) * Math.PI];
      if (free(world, p, 0.12)) ps.push({ p, w: 1 / n });
    }
    return ps;
  }
  function mclMove(ps, step, r, { trans = 0.1, rot = 0.05 } = {}) {
    const d = Math.hypot(step[0], step[1]);
    return ps.map(({ p, w }) => ({
      p: compose(p, [
        step[0] + r.gauss(0, trans * d + 0.005),
        step[1] + r.gauss(0, trans * d + 0.005),
        step[2] + r.gauss(0, rot * Math.abs(step[2]) + 0.01),
      ]),
      w,
    }));
  }
  function mclWeigh(world, ps, sc, { sd = 0.2, maxR = 8 } = {}) {
    const beams = sc.filter((b) => isFinite(b.r));
    const logs = ps.map(({ p }) => {
      if (!free(world, p, 0.05)) return -1e9;
      let s = 0;
      for (const b of beams) {
        const e = Math.min(1.5, ray(world, p[0], p[1], p[2] + b.a, maxR + 1) - b.r);
        s += -0.5 * (e / sd) ** 2;
      }
      return s;
    });
    const top = Math.max(...logs);
    const ws = logs.map((l) => Math.exp(l - top));
    const sum = ws.reduce((a, b) => a + b, 0);
    return ps.map((q, i) => ({ p: q.p, w: ws[i] / sum }));
  }
  // Low-variance (systematic) resampling: one random offset, n evenly spaced pointers into the cumulative weights.
  function resample(ps, r) {
    const n = ps.length;
    const out = [];
    let c = ps[0].w;
    let i = 0;
    const u0 = r.next() / n;
    for (let m = 0; m < n; m++) {
      const u = u0 + m / n;
      while (u > c && i < n - 1) c += ps[++i].w;
      out.push({ p: ps[i].p.slice(), w: 1 / n });
    }
    return out;
  }
  const neff = (ps) => 1 / ps.reduce((s, q) => s + q.w * q.w, 0);
  function mclMean(ps) {
    let x = 0;
    let y = 0;
    let c = 0;
    let s = 0;
    ps.forEach(({ p, w }) => {
      x += w * p[0];
      y += w * p[1];
      c += w * Math.cos(p[2]);
      s += w * Math.sin(p[2]);
    });
    return [x, y, Math.atan2(s, c)];
  }
  // The whole run: a path of poses the robot really takes; at each one it gets an odometry step and a scan.
  function mclRun(world, poses, opts = {}) {
    const r = rng(opts.seed ?? 31);
    const n = opts.n ?? 400;
    const beams = opts.beams ?? 24;
    let ps = mclInit(world, n, r, opts.around ?? null);
    const frames = [{ ps, est: mclMean(ps), neff: n }];
    for (let k = 1; k < poses.length; k++) {
      const step = relative(poses[k - 1], poses[k]);
      ps = mclMove(ps, step, r, opts.noise);
      const sc = scan(world, opts.kidnap && k >= opts.kidnap[0] ? compose(opts.kidnap[1], relative(poses[opts.kidnap[0]], poses[k])) : poses[k], {
        n: beams,
        sd: 0.03,
        seed: 100 + k,
      });
      ps = mclWeigh(world, ps, sc, { sd: opts.sd ?? 0.25 });
      const est = mclMean(ps);
      const ne = neff(ps);
      frames.push({ weighed: ps, est, neff: ne, scan: sc });
      if (ne < n / 2) ps = resample(ps, r);
      // a few fresh random particles let the filter recover from a wrong answer (the "augmented" MCL idea)
      if (opts.inject) {
        const fresh = mclInit(world, Math.round(n * opts.inject), r);
        ps = ps
          .slice(0, n - fresh.length)
          .concat(fresh)
          .map((q) => ({ p: q.p, w: 1 / n }));
      }
      frames[frames.length - 1].ps = ps;
    }
    return frames;
  }

  /* ---------------------------------------------------------------- occupancy grids */

  // A grid of log-odds, res metres per cell, over the room. Each scan marks the cells along every beam free and the
  // cell at its end occupied.
  const L_OCC = 0.85;
  const L_FREE = -0.4;
  const L_MAX = 5;
  function grid(world, res = 0.05) {
    const W = Math.round(world.w / res);
    const H = Math.round(world.h / res);
    return { res, W, H, L: new Float32Array(W * H) };
  }
  function integrate(g, pose, sc, { max = 8 } = {}) {
    const cx = (x) => Math.floor(x / g.res);
    const [x0, y0] = [cx(pose[0]), cx(pose[1])];
    sc.forEach((b) => {
      const hit = isFinite(b.r);
      const d = hit ? b.r : max;
      const e = toWorld(pose, [d * Math.cos(b.a), d * Math.sin(b.a)]);
      const x1 = cx(e[0]);
      const y1 = cx(e[1]);
      // Bresenham's line from the robot's cell to the beam's end cell
      let x = x0;
      let y = y0;
      const dx = Math.abs(x1 - x0);
      const dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        if (x === x1 && y === y1) break;
        if (x >= 0 && y >= 0 && x < g.W && y < g.H) {
          const k = y * g.W + x;
          g.L[k] = Math.max(-L_MAX, g.L[k] + L_FREE);
        }
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y += sy;
        }
      }
      if (hit && x1 >= 0 && y1 >= 0 && x1 < g.W && y1 < g.H) {
        const k = y1 * g.W + x1;
        g.L[k] = Math.min(L_MAX, g.L[k] + L_OCC);
      }
    });
    return g;
  }
  const occProb = (l) => 1 - 1 / (1 + Math.exp(l));
  function mapFrom(world, poses, scans, res = 0.05) {
    const g = grid(world, res);
    poses.forEach((p, i) => integrate(g, p, scans[i]));
    return g;
  }
  // How well a map matches the true room: of the cells the map calls occupied (p > 0.65), the share within one cell of
  // a real wall.
  function mapScore(world, g) {
    let occ = 0;
    let good = 0;
    for (let y = 0; y < g.H; y++)
      for (let x = 0; x < g.W; x++) {
        if (occProb(g.L[y * g.W + x]) < 0.65) continue;
        occ++;
        const p = [(x + 0.5) * g.res, (y + 0.5) * g.res];
        if (world.segs.some((w) => segDist(p, [w.s[0], w.s[1]], [w.s[2], w.s[3]]) < g.res * 1.5)) good++;
      }
    return { occ, good, share: occ ? good / occ : 0 };
  }

  /* ---------------------------------------------------------------- scan matching (ICP) */

  // Point-to-point ICP in 2-D: finds the rigid motion [x, y, θ] that moves the points `src` onto `dst`. Each round
  // pairs every source point with its nearest destination point, drops pairs further apart than `reject`, and solves
  // for the best rotation and translation in closed form. Returns the motion, and the history of the mean error.
  // With `line`, it measures each pair's error along the destination surface's normal instead (point-to-line ICP),
  // so two scans that sampled the same wall at different points still agree.
  function icp(src, dst, { guess = [0, 0, 0], iters = 30, reject = 0.5, line = false } = {}) {
    if (line) return icpLine(src, dst, { guess, iters, reject });
    let T = guess.slice();
    const errs = [];
    const history = [T.slice()];
    for (let it = 0; it < iters; it++) {
      const moved = src.map((p) => toWorld(T, p));
      const pairs = [];
      let sumE = 0;
      moved.forEach((p, i) => {
        let best = Infinity;
        let bj = -1;
        for (let j = 0; j < dst.length; j++) {
          const d = (p[0] - dst[j][0]) ** 2 + (p[1] - dst[j][1]) ** 2;
          if (d < best) {
            best = d;
            bj = j;
          }
        }
        if (Math.sqrt(best) < reject) {
          pairs.push([p, dst[bj]]);
          sumE += Math.sqrt(best);
        }
      });
      errs.push(pairs.length ? sumE / pairs.length : Infinity);
      if (pairs.length < 3) break;
      const ma = [mean(pairs.map((q) => q[0][0])), mean(pairs.map((q) => q[0][1]))];
      const mb = [mean(pairs.map((q) => q[1][0])), mean(pairs.map((q) => q[1][1]))];
      let sxx = 0;
      let sxy = 0;
      pairs.forEach(([a, b]) => {
        const ax = a[0] - ma[0];
        const ay = a[1] - ma[1];
        const bx = b[0] - mb[0];
        const by = b[1] - mb[1];
        sxx += ax * bx + ay * by;
        sxy += ax * by - ay * bx;
      });
      const dth = Math.atan2(sxy, sxx);
      const c = Math.cos(dth);
      const s = Math.sin(dth);
      const step = [mb[0] - (c * ma[0] - s * ma[1]), mb[1] - (s * ma[0] + c * ma[1]), dth];
      T = compose(step, T);
      history.push(T.slice());
      if (Math.abs(dth) < 1e-6 && Math.hypot(step[0], step[1]) < 1e-6) break;
    }
    return { T, errs, history };
  }

  // dst must be in scan order, so each point's neighbours give the surface's direction there.
  function icpLine(src, dst, { guess, iters, reject }) {
    const normals = dst.map((q, j) => {
      const a = dst[Math.max(0, j - 1)];
      const b = dst[Math.min(dst.length - 1, j + 1)];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      // no surface direction across a gap or at an end
      if (!len || len > 0.3) return null;
      return [-dy / len, dx / len];
    });
    let T = guess.slice();
    const errs = [];
    const history = [T.slice()];
    for (let it = 0; it < iters; it++) {
      const H = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];
      const g = [0, 0, 0];
      let sumE = 0;
      let used = 0;
      src.forEach((p0) => {
        const p = toWorld(T, p0);
        let best = Infinity;
        let bj = -1;
        for (let j = 0; j < dst.length; j++) {
          const d = (p[0] - dst[j][0]) ** 2 + (p[1] - dst[j][1]) ** 2;
          if (d < best) {
            best = d;
            bj = j;
          }
        }
        const n = normals[bj];
        if (!n || Math.sqrt(best) > reject) return;
        const q = dst[bj];
        const r = n[0] * (p[0] - q[0]) + n[1] * (p[1] - q[1]);
        // the residual's change for a small move [dx, dy, dθ] (the turn about the origin)
        const J = [n[0], n[1], -n[0] * p[1] + n[1] * p[0]];
        for (let a = 0; a < 3; a++) {
          g[a] += J[a] * r;
          for (let b = 0; b < 3; b++) H[a][b] += J[a] * J[b];
        }
        sumE += Math.abs(r);
        used++;
      });
      errs.push(used ? sumE / used : Infinity);
      if (used < 3) break;
      const d = solve(
        H,
        g.map((v) => -v)
      );
      if (!d) break;
      T = compose(d, T);
      history.push(T.slice());
      if (Math.abs(d[2]) < 1e-7 && Math.hypot(d[0], d[1]) < 1e-7) break;
    }
    return { T, errs, history };
  }

  /* ---------------------------------------------------------------- pose graphs */

  // Gauss–Newton on a 2-D pose graph. nodes: poses; edges: { i, j, z (j seen from i), w: [wx, wy, wθ] }. The first
  // node is held fixed. Returns the optimised poses and the total squared error before and after each round.
  function poseGraph(nodes, edges, iters = 10) {
    let X = nodes.map((p) => p.slice());
    const n = X.length;
    const cost = () =>
      edges.reduce((s, e) => {
        const r = relative(X[e.i], X[e.j]);
        const d = [r[0] - e.z[0], r[1] - e.z[1], wrap(r[2] - e.z[2])];
        return s + e.w[0] * d[0] ** 2 + e.w[1] * d[1] ** 2 + e.w[2] * d[2] ** 2;
      }, 0);
    const costs = [cost()];
    for (let it = 0; it < iters; it++) {
      const N = 3 * n;
      const Hm = Array.from({ length: N }, () => new Float64Array(N));
      const b = new Float64Array(N);
      edges.forEach((e) => {
        const a = X[e.i];
        const c = X[e.j];
        const ca = Math.cos(a[2]);
        const sa = Math.sin(a[2]);
        const dx = c[0] - a[0];
        const dy = c[1] - a[1];
        const r = [ca * dx + sa * dy - e.z[0], -sa * dx + ca * dy - e.z[1], wrap(c[2] - a[2] - e.z[2])];
        // Jacobians of the residual with respect to pose i (A) and pose j (B)
        const A = [
          [-ca, -sa, -sa * dx + ca * dy],
          [sa, -ca, -ca * dx - sa * dy],
          [0, 0, -1],
        ];
        const B = [
          [ca, sa, 0],
          [-sa, ca, 0],
          [0, 0, 1],
        ];
        const blocks = [
          [e.i, A],
          [e.j, B],
        ];
        blocks.forEach(([p, J1]) => {
          for (let u = 0; u < 3; u++) {
            let g = 0;
            for (let k = 0; k < 3; k++) g += J1[k][u] * e.w[k] * r[k];
            b[3 * p + u] -= g;
          }
          blocks.forEach(([q, J2]) => {
            for (let u = 0; u < 3; u++)
              for (let v = 0; v < 3; v++) {
                let s = 0;
                for (let k = 0; k < 3; k++) s += J1[k][u] * e.w[k] * J2[k][v];
                Hm[3 * p + u][3 * q + v] += s;
              }
          });
        });
      });
      // hold node 0 fixed
      for (let u = 0; u < 3; u++) Hm[u][u] += 1e9;
      const dx = solve(
        Hm.map((row) => Array.from(row)),
        Array.from(b)
      );
      X = X.map((p, k) => [p[0] + dx[3 * k], p[1] + dx[3 * k + 1], wrap(p[2] + dx[3 * k + 2])]);
      costs.push(cost());
      if (Math.abs(costs[costs.length - 2] - costs[costs.length - 1]) < 1e-9) break;
    }
    return { X, costs };
  }

  /* ---------------------------------------------------------------- planning */

  // A costmap on a grid: lethal inside obstacles, then an inflated cost that falls off with distance from them, the
  // way Nav2's inflation layer works. robotR: the robot's radius (cells closer than this are lethal too).
  function costmap(world, { res = 0.1, robotR = 0.18, inflate = 0.5 } = {}) {
    const W = Math.round(world.w / res);
    const H = Math.round(world.h / res);
    const dist = new Float32Array(W * H);
    const cost = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const p = [(x + 0.5) * res, (y + 0.5) * res];
        let d = Infinity;
        for (const w of world.segs) d = Math.min(d, segDist(p, [w.s[0], w.s[1]], [w.s[2], w.s[3]]));
        if (!free(world, p)) d = 0;
        dist[y * W + x] = d;
        cost[y * W + x] = d <= robotR ? 1 : d < robotR + inflate ? 0.9 * Math.exp((-3 * (d - robotR)) / inflate) : 0;
      }
    return { res, W, H, dist, cost, robotR, inflate };
  }
  // A* on the costmap, 8-connected. Each move costs its length times (1 + weight·cost); lethal cells are walls.
  // Returns the path of cell centres (metres), the number of cells expanded, and the expansion order.
  function astar(cm, start, goal, { weight = 4, heuristic = 1 } = {}) {
    const { W, H, res } = cm;
    const idx = (p) => Math.floor(p[1] / res) * W + Math.floor(p[0] / res);
    const s = idx(start);
    const gl = idx(goal);
    const g = new Float64Array(W * H).fill(Infinity);
    const from = new Int32Array(W * H).fill(-1);
    const closed = new Uint8Array(W * H);
    const gx = gl % W;
    const gy = Math.floor(gl / W);
    const hOf = (k) => heuristic * Math.hypot((k % W) - gx, Math.floor(k / W) - gy);
    // a binary heap of [f, cell]
    const heap = [];
    const push = (f, k) => {
      heap.push([f, k]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    g[s] = 0;
    push(hOf(s), s);
    const order = [];
    const moves = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, Math.SQRT2],
      [1, -1, Math.SQRT2],
      [-1, 1, Math.SQRT2],
      [-1, -1, Math.SQRT2],
    ];
    while (heap.length) {
      const [, k] = pop();
      if (closed[k]) continue;
      closed[k] = 1;
      order.push(k);
      if (k === gl) break;
      const x = k % W;
      const y = Math.floor(k / W);
      for (const [mx, my, len] of moves) {
        const nx = x + mx;
        const ny = y + my;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (closed[nk] || cm.cost[nk] >= 1) continue;
        const ng = g[k] + len * (1 + weight * cm.cost[nk]);
        if (ng < g[nk]) {
          g[nk] = ng;
          from[nk] = k;
          push(ng + hOf(nk), nk);
        }
      }
    }
    const path = [];
    if (from[gl] >= 0 || gl === s) for (let k = gl; k >= 0; k = from[k]) path.unshift([((k % W) + 0.5) * res, (Math.floor(k / W) + 0.5) * res]);
    let length = 0;
    for (let i = 1; i < path.length; i++) length += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    return { path, expanded: order.length, order, length };
  }
  // Pure pursuit: drive towards the point on the path one lookahead distance ahead. Returns the poses driven.
  function pursue(path, start, { lookahead = 0.4, v = 0.3, dt = 0.05, maxW = 2, tol = 0.1, maxSteps = 2000 } = {}) {
    let pose = start.slice();
    const poses = [pose];
    let near = 0;
    for (let s = 0; s < maxSteps; s++) {
      const goal = path[path.length - 1];
      if (Math.hypot(goal[0] - pose[0], goal[1] - pose[1]) < tol) break;
      // move the "nearest" pointer forward along the path, then look ahead from it
      while (
        near < path.length - 1 &&
        Math.hypot(path[near + 1][0] - pose[0], path[near + 1][1] - pose[1]) <= Math.hypot(path[near][0] - pose[0], path[near][1] - pose[1])
      )
        near++;
      let k = near;
      while (k < path.length - 1 && Math.hypot(path[k][0] - pose[0], path[k][1] - pose[1]) < lookahead) k++;
      const target = toLocal(pose, path[k]);
      const l2 = target[0] ** 2 + target[1] ** 2;
      const curv = (2 * target[1]) / Math.max(1e-6, l2);
      const w = clamp(v * curv, -maxW, maxW);
      const vv = Math.abs(w) >= maxW ? maxW / Math.abs(curv || 1e-6) : v;
      const [vl, vr] = wheels(vv, w);
      pose = arcStep(pose, vl * dt, vr * dt);
      poses.push(pose);
    }
    return poses;
  }

  /* ---------------------------------------------------------------- depth cameras */

  // A pinhole depth camera at `pose`, `height` metres above the floor, looking level. Renders a W × H depth image (the
  // z distance along the camera's axis, Infinity for nothing within `max`) of the room's walls, shapes (as boxes of
  // their height) and floor.
  function depthImage(world, pose, { W = 64, H = 40, hfov = rad(87), height = 0.3, max = 6 } = {}) {
    const f = W / 2 / Math.tan(hfov / 2);
    const img = [];
    for (let v = 0; v < H; v++) {
      const row = [];
      for (let u = 0; u < W; u++) {
        // camera frame: x right, y down, z forward
        const xc = (u + 0.5 - W / 2) / f;
        const yc = (v + 0.5 - H / 2) / f;
        // in the world: forward is the robot's heading, right is −left
        const a = pose[2] - Math.atan(xc);
        const cosA = Math.cos(Math.atan(xc));
        // horizontal distance along the ray per unit z, and the height change per unit z
        let best = Infinity;
        // walls and shapes: the first hit whose height is above the ray's height there
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        for (const w of world.segs) {
          const [x1, y1, x2, y2] = w.s;
          const ex = x2 - x1;
          const ey = y2 - y1;
          const den = dx * ey - dy * ex;
          if (Math.abs(den) < 1e-12) continue;
          const t = ((x1 - pose[0]) * ey - (y1 - pose[1]) * ex) / den;
          const uu = ((x1 - pose[0]) * dy - (y1 - pose[1]) * dx) / den;
          if (t <= 1e-6 || uu < 0 || uu > 1) continue;
          const z = t * cosA; // depth along the axis
          const hAt = height - yc * z;
          if (hAt >= 0 && hAt <= w.h && z < best) best = z;
        }
        // the floor, for rays pointing down
        if (yc > 0) {
          const z = height / yc;
          if (z < best) best = z;
        }
        row.push(best <= max ? best : Infinity);
      }
      img.push(row);
    }
    return { img, f, W, H, height };
  }
  // Back-projects a depth image into points in the world (x, y on the floor plan, z height).
  function cloud(cam, pose, step = 1) {
    const pts = [];
    for (let v = 0; v < cam.H; v += step)
      for (let u = 0; u < cam.W; u += step) {
        const z = cam.img[v][u];
        if (!isFinite(z)) continue;
        const x = ((u + 0.5 - cam.W / 2) / cam.f) * z;
        const y = ((v + 0.5 - cam.H / 2) / cam.f) * z;
        const p = toWorld(pose, [z, -x]);
        pts.push([p[0], p[1], cam.height - y, z]);
      }
    return pts;
  }
  // Stereo: depth from disparity, and how depth error grows with depth for a given disparity error.
  const stereoDepth = (f, b, d) => (f * b) / d;
  const stereoError = (f, b, z, dd) => (z * z * dd) / (f * b);

  /* ---------------------------------------------------------------- networks (ROS 2 QoS) */

  // Messages published at `hz` for `seconds` over a link that loses each packet with probability `loss`. Best effort
  // just drops lost ones; reliable resends after `retry` seconds until one arrives. Returns per-message latencies
  // (null for dropped) on top of the link's base latency.
  function qos(mode, { hz = 10, seconds = 10, loss = 0.1, base = 0.004, retry = 0.02, seed = 41 } = {}) {
    const r = rng(seed);
    const lat = [];
    const n = Math.round(hz * seconds);
    let busyUntil = 0; // reliable delivery is in order: a late message holds up the ones behind it
    for (let i = 0; i < n; i++) {
      const sent = i / hz;
      if (mode === "best_effort") {
        lat.push(r.next() < loss ? null : base + Math.abs(r.gauss(0, base / 4)));
        continue;
      }
      let t = 0;
      while (r.next() < loss) t += retry;
      let arrive = sent + t + base + Math.abs(r.gauss(0, base / 4));
      arrive = Math.max(arrive, busyUntil);
      busyUntil = arrive;
      lat.push(arrive - sent);
    }
    return lat;
  }

  // Camera frames arriving at `fps` for a node that takes `proc` seconds (± procSd) per frame. Frames wait in a queue
  // of `depth` (the oldest is dropped when it's full; Infinity keeps everything). Returns, for each frame, the time
  // from capture to the end of its processing, or null if it was dropped.
  function frameQueue({ fps = 30, proc = 0.04, procSd = 0.005, depth = Infinity, seconds = 10, seed = 12 } = {}) {
    const r = rng(seed);
    const n = Math.round(fps * seconds);
    const out = new Array(n).fill(null);
    const queue = [];
    let free = 0; // when the node finishes its current frame
    let next = 0; // next frame to arrive
    // events in time order: whenever the node is free, it takes the oldest waiting frame
    while (next < n || queue.length) {
      const arrive = next < n ? next / fps : Infinity;
      if (queue.length && free <= arrive) {
        const k = queue.shift();
        const start = Math.max(free, k / fps);
        free = start + Math.max(0.001, proc + r.gauss(0, procSd));
        out[k] = free - k / fps;
      } else {
        queue.push(next++);
        if (queue.length > depth) queue.shift();
      }
    }
    return out;
  }

  // Distance a robot covers before it can stop: blind travel during the latency, then braking.
  const stopping = (v, latency, decel) => v * latency + (v * v) / (2 * decel);

  const MR = {
    TAU,
    wrap,
    clamp,
    deg,
    rad,
    mean,
    std,
    rng,
    toWorld,
    toLocal,
    compose,
    relative,
    room,
    ray,
    rayHit,
    free,
    segDist,
    ROBOT,
    wheels,
    twist,
    arcStep,
    midStep,
    icr,
    square,
    drive,
    quadrature,
    decode,
    readEncoder,
    loopTiming,
    readings,
    gyro,
    sonar,
    accelDrift,
    ema,
    MOTOR,
    pidRun,
    scan,
    scanPoints,
    movingScan,
    skewedPoints,
    segmentScan,
    splitMerge,
    solve,
    kf1,
    BEACONS,
    ekfRun,
    ellipse2,
    mclInit,
    mclMove,
    mclWeigh,
    resample,
    neff,
    mclMean,
    mclRun,
    grid,
    integrate,
    occProb,
    mapFrom,
    mapScore,
    icp,
    poseGraph,
    costmap,
    astar,
    pursue,
    depthImage,
    cloud,
    stereoDepth,
    stereoError,
    qos,
    frameQueue,
    stopping,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MR;
  else {
    root.MR = MR;
    root.TF = root.TF || {};
  }
})(typeof window !== "undefined" ? window : globalThis);
