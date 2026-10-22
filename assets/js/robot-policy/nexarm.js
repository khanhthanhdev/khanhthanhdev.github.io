// NexArm kinematics and the scripted bowl-stacking motion used by the robot-policy stage.
// Pure three.js math with no DOM, so it also runs under Node for tests.
import * as THREE from "./lib/three.module.min.js";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export const ARM_JOINTS = [
  "joint_1_base_to_link_1",
  "joint_2_link_1_to_link_2",
  "joint_3_link_2_to_link_3",
  "joint_4_link_3_to_link_4",
  "joint_5_link_4_to_link_5",
];
export const ARM_LABELS = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll"];
const JAW_JOINTS = ["left_jaw_slide_joint", "right_jaw_slide_joint"];
const PINION_JOINT = "gripper_pinion_joint";

// `ready` keyframe from nexarm.xml, and the gripper range of right_jaw_slide_joint.
export const READY = [0, -0.0154, 0.3197, 1.0655, 0];
export const GRIP_OPEN = 0.0255;
const GRIP_HOLD = 0.0018;

// Bowl dimensions from generate_stack_bowls_dataset.py, measured from bowl.stl.
const RIM_RADIUS = 0.0615;
const PINCH_ABOVE_ORIGIN = 0.012;
const NEST_STEP = 0.014;
const HOVER_Z = 0.14;

export function decodeGeometry(entry, bin) {
  const n = entry.vertexCount;
  const q = new Int16Array(bin, entry.position.offset, n * 3);
  const position = new Float32Array(n * 3);
  for (let i = 0; i < position.length; i++) {
    const a = i % 3;
    position[i] = (q[i] + 32768) * entry.scale[a] + entry.min[a];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(new Int8Array(bin, entry.normal.offset, n * 3), 3, true));
  const Index = entry.wideIndex ? Uint32Array : Uint16Array;
  geometry.setIndex(new THREE.BufferAttribute(new Index(bin, entry.index.offset, entry.indexCount), 1));
  geometry.computeBoundingSphere();
  return geometry;
}

// MuJoCo cameras look down -z with xyaxes giving the frame's x and y; three.js uses the same convention.
export function mujocoCamera(spec, aspect = 4 / 3) {
  const camera = new THREE.PerspectiveCamera(spec.fovy, aspect, 0.01, 6);
  const x = new THREE.Vector3().fromArray(spec.xyaxes, 0).normalize();
  const y = new THREE.Vector3().fromArray(spec.xyaxes, 3).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  y.crossVectors(z, x);
  camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  camera.position.fromArray(spec.pos);
  camera.name = spec.name;
  return camera;
}

// Every NexArm body sits at the origin and its meshes are in mount coordinates, so each joint
// rotates (or slides) about its own `pos`: pivot = T(pos) · R(q) · T(-pos).
export function buildRobot(asset, { geometry = () => null, material = () => null } = {}) {
  const joints = {};
  const sites = {};
  const cameras = {};

  function body(spec, parent) {
    const group = new THREE.Group();
    group.name = spec.name;
    group.position.fromArray(spec.pos);
    const [w, x, y, z] = spec.quat;
    group.quaternion.set(x, y, z, w);
    parent.add(group);

    let attach = group;
    if (spec.joint) {
      const j = spec.joint;
      const pivot = new THREE.Group();
      pivot.position.fromArray(j.pos);
      const inner = new THREE.Group();
      inner.position.set(-j.pos[0], -j.pos[1], -j.pos[2]);
      group.add(pivot);
      pivot.add(inner);
      joints[j.name] = {
        type: j.type,
        axis: new THREE.Vector3().fromArray(j.axis).normalize(),
        origin: new THREE.Vector3().fromArray(j.pos),
        range: j.range,
        pivot,
      };
      attach = inner;
    }
    for (const g of spec.geoms) {
      const geo = geometry(g.mesh);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, material(g.material));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = g.mesh;
      attach.add(mesh);
    }
    for (const s of spec.sites) {
      const site = new THREE.Object3D();
      site.name = s.name;
      site.position.fromArray(s.pos);
      attach.add(site);
      sites[s.name] = site;
    }
    for (const c of spec.cameras) {
      const camera = mujocoCamera(c);
      attach.add(camera);
      cameras[c.name] = camera;
    }
    for (const child of spec.children) body(child, attach);
  }

  const root = new THREE.Group();
  root.name = "nexarm";
  body(asset.robot, root);

  function setJoint(name, q) {
    const j = joints[name];
    if (!j) return;
    if (j.type === "slide") j.pivot.position.copy(j.origin).addScaledVector(j.axis, q);
    else j.pivot.quaternion.setFromAxisAngle(j.axis, q);
  }

  const tip = new THREE.Vector3();
  const front = new THREE.Vector3();
  return {
    root,
    joints,
    sites,
    cameras,
    pose(q, grip = GRIP_OPEN) {
      ARM_JOINTS.forEach((name, i) => setJoint(name, q[i] ?? 0));
      JAW_JOINTS.forEach((name) => setJoint(name, grip));
      setJoint(PINION_JOINT, (grip / GRIP_OPEN) * 2.2);
      root.updateMatrixWorld(true);
    },
    tcp(out = new THREE.Vector3()) {
      return sites.pinch_site.getWorldPosition(out);
    },
    toolAxis(out = new THREE.Vector3()) {
      sites.pinch_site.getWorldPosition(tip);
      sites.gripper_frame.getWorldPosition(front);
      return out.subVectors(front, tip).normalize();
    },
  };
}

function solve4(A, b) {
  const n = 4;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / d;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / (M[r][r] || 1e-12);
  }
  return x;
}

// Damped least squares over pan, lift, elbow and wrist_flex. The residual is 3 position terms plus
// the tool-axis error weighted by `w`, so position wins when both cannot be met.
export function solveIK(robot, target, axis, seed, { roll = 0, w = 0.06, lambda = 0.01, iterations = 220 } = {}) {
  const q = seed.slice(0, 4);
  const limits = ARM_JOINTS.slice(0, 4).map((name) => robot.joints[name].range);
  const p = new THREE.Vector3();
  const a = new THREE.Vector3();
  const residual = (qq) => {
    robot.pose([...qq, roll]);
    robot.tcp(p);
    robot.toolAxis(a);
    return [target.x - p.x, target.y - p.y, target.z - p.z, w * (axis.x - a.x), w * (axis.y - a.y), w * (axis.z - a.z)];
  };
  const h = 1e-4;
  let r = residual(q);
  for (let it = 0; it < iterations; it++) {
    if (Math.hypot(...r) < 2e-6) break;
    const J = [];
    for (let k = 0; k < 4; k++) {
      const qh = q.slice();
      qh[k] += h;
      const rk = residual(qh);
      J.push(r.map((v, i) => (v - rk[i]) / h));
    }
    const A = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => J[i].reduce((s, v, m) => s + v * J[j][m], 0)));
    for (let i = 0; i < 4; i++) A[i][i] += lambda * lambda;
    const g = [0, 1, 2, 3].map((i) => J[i].reduce((s, v, m) => s + v * r[m], 0));
    const dq = solve4(A, g);
    for (let k = 0; k < 4; k++) {
      const [lo, hi] = limits[k];
      q[k] = Math.min(hi, Math.max(lo, q[k] + Math.max(-0.25, Math.min(0.25, dq[k]))));
    }
    r = residual(q);
  }
  return { q: [...q, roll], error: Math.hypot(r[0], r[1], r[2]) };
}

const smooth = (s) => s * s * (3 - 2 * s);

// The bowl-stacking task from the NexArm simulation: blue goes onto red, then black onto blue.
// The jaws close across the rim wall, so the grasp point is on the rim's side, tangential to the arm.
export function buildScript(robot, asset) {
  const start = Object.fromEntries(asset.scene.bowls.map((b) => [b.name, new THREE.Vector3().fromArray(b.pos)]));
  const down = new THREE.Vector3(0, 0, -1);
  const grasp = (center) => {
    const u = new THREE.Vector2(center.x, center.y).normalize();
    return new THREE.Vector3(center.x - u.y * RIM_RADIUS, center.y + u.x * RIM_RADIUS, center.z + PINCH_ABOVE_ORIGIN);
  };
  const above = (v, z = HOVER_Z) => new THREE.Vector3(v.x, v.y, z);
  const nest = (level) => start.bowl_red.clone().add(new THREE.Vector3(0, 0, NEST_STEP * level));

  const moves = [];
  const subtasks = [
    { name: "Pick the blue bowl", bowl: "bowl_blue", from: start.bowl_blue, to: nest(1) },
    { name: "Place blue on red", place: true, bowl: "bowl_blue", to: nest(1) },
    { name: "Pick the black bowl", bowl: "bowl_black", from: start.bowl_black, to: nest(2) },
    { name: "Place black on blue", place: true, bowl: "bowl_black", to: nest(2) },
  ];
  moves.push({ joints: READY, grip: GRIP_OPEN, dur: 1.2, subtask: -1 });
  subtasks.forEach((s, i) => {
    if (!s.place) {
      const g = grasp(s.from);
      moves.push({ p: above(g), grip: GRIP_OPEN, dur: 1.5, subtask: i });
      moves.push({ p: g, grip: GRIP_OPEN, dur: 1.0, subtask: i });
      moves.push({ p: g, grip: GRIP_HOLD, dur: 0.5, subtask: i, attach: s.bowl });
      moves.push({ p: above(g), grip: GRIP_HOLD, dur: 0.9, subtask: i });
    } else {
      const g = grasp(s.to);
      moves.push({ p: above(g), grip: GRIP_HOLD, dur: 1.5, subtask: i });
      moves.push({ p: g, grip: GRIP_HOLD, dur: 1.0, subtask: i });
      moves.push({ p: g, grip: GRIP_OPEN, dur: 0.5, subtask: i, detach: s.bowl, onto: s.to });
      moves.push({ p: above(g), grip: GRIP_OPEN, dur: 0.8, subtask: i });
    }
  });
  moves.push({ joints: READY, grip: GRIP_OPEN, dur: 1.6, subtask: -1 });
  moves.push({ joints: READY, grip: GRIP_OPEN, dur: 0.8, subtask: -1 });

  let seed = READY.slice(0, 4);
  let worst = 0;
  let t = 0;
  for (const m of moves) {
    if (m.p) {
      const sol = solveIK(robot, m.p, down, seed);
      m.q = sol.q;
      worst = Math.max(worst, sol.error);
      seed = sol.q;
    } else {
      m.q = m.joints.slice();
    }
    t += m.dur;
    m.t = t;
  }
  const duration = t;

  // Each bowl follows the tool while held: offset from the tool at grasp time, turned with the pan joint.
  const tcp = new THREE.Vector3();
  const holds = [];
  moves.forEach((m, i) => {
    if (!m.attach) return;
    robot.pose(m.q, m.grip);
    robot.tcp(tcp);
    const release = moves.findIndex((n, k) => k > i && n.detach === m.attach);
    holds.push({
      bowl: m.attach,
      from: m.t,
      to: moves[release - 1].t,
      offset: start[m.attach].clone().sub(tcp),
      pan: m.q[0],
      onto: moves[release].onto,
    });
  });

  const out = { q: [0, 0, 0, 0, 0], grip: GRIP_OPEN, subtask: -1, bowls: {} };
  const rot = new THREE.Vector3();
  function stateAt(time, target = out) {
    const tm = ((time % duration) + duration) % duration;
    let k = moves.findIndex((m) => m.t > tm);
    if (k < 0) k = moves.length - 1;
    const b = moves[k];
    const a = moves[k - 1] ?? moves[moves.length - 1];
    const s = smooth(Math.min(1, Math.max(0, (tm - (b.t - b.dur)) / b.dur)));
    for (let i = 0; i < 5; i++) target.q[i] = a.q[i] + (b.q[i] - a.q[i]) * s;
    target.grip = a.grip + (b.grip - a.grip) * s;
    target.subtask = b.subtask;
    target.time = tm;
    robot.pose(target.q, target.grip);
    robot.tcp(tcp);
    for (const name of Object.keys(start)) {
      const v = target.bowls[name] ?? (target.bowls[name] = new THREE.Vector3());
      v.copy(start[name]);
      for (const h of holds) {
        if (h.bowl !== name || tm < h.from) continue;
        if (tm <= h.to) {
          rot.copy(h.offset).applyAxisAngle(new THREE.Vector3(0, 0, -1), target.q[0] - h.pan);
          v.copy(tcp).add(rot);
        } else {
          v.copy(h.onto);
        }
      }
    }
    return target;
  }

  // Tool positions sampled at the control rate, used to draw predicted action chunks.
  function sampleTcp(fps) {
    const n = Math.ceil(duration * fps);
    const path = new Float32Array(n * 3);
    const tmp = { q: [0, 0, 0, 0, 0], bowls: {} };
    for (let i = 0; i < n; i++) {
      stateAt(i / fps, tmp);
      robot.tcp(tcp).toArray(path, i * 3);
    }
    return path;
  }

  return { duration, moves, subtasks, stateAt, sampleTcp, ikError: worst };
}
