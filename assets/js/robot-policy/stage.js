// Three.js stage for /works/robot-policy/: the NexArm in its bowl-stacking workcell, with the three
// policy cameras rendered into the HUD and the current action chunk drawn ahead of the gripper.
import * as THREE from "./lib/three.module.min.js";
import { buildRobot, buildScript, decodeGeometry, mujocoCamera, ARM_LABELS } from "./nexarm.js";

const OVERLAY = 1;
const CAMERA_ORDER = ["front", "top", "wrist"];

const LOOK = {
  black_metal: { metalness: 0.55, roughness: 0.42 },
  dark_bracket: { metalness: 0.4, roughness: 0.5 },
  aluminum: { metalness: 0.9, roughness: 0.28 },
  accent_blue: { metalness: 0.15, roughness: 0.38 },
  gripper_jaw: { metalness: 0.1, roughness: 0.65 },
  gear_brass: { metalness: 0.85, roughness: 0.3 },
  workcell_extrusion: { metalness: 0.7, roughness: 0.4 },
  workcell_panel: { metalness: 0, roughness: 0.92 },
  workcell_plate: { metalness: 0.8, roughness: 0.35 },
};

const css = (el, name, fallback) => getComputedStyle(el).getPropertyValue(name).trim() || fallback;

function studioEnvironment(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0.18, 0.19, 0.21);
  const panel = (w, h, intensity, pos, look) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.set(...pos);
    m.lookAt(...look);
    scene.add(m);
  };
  panel(4, 4, 2.2, [0, 0, 3], [0, 0, 0]);
  panel(2.5, 1.5, 1.6, [3, -1, 1.2], [0, 0, 0.5]);
  panel(2.5, 1.5, 0.9, [-2, 3, 1], [0, 0, 0.5]);
  panel(6, 0.6, 1.2, [0, -3.5, 0.8], [0, 0, 0.6]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0.04).texture;
  pmrem.dispose();
  return texture;
}

function frustum(camera, depth, color) {
  const h = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * depth;
  const w = h * camera.aspect;
  const c = [
    [-w, -h, -depth],
    [w, -h, -depth],
    [w, h, -depth],
    [-w, h, -depth],
  ];
  const pts = [];
  for (const p of c) pts.push(0, 0, 0, ...p);
  for (let i = 0; i < 4; i++) pts.push(...c[i], ...c[(i + 1) % 4]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
  lines.layers.set(OVERLAY);
  return lines;
}

function el(tag, cls, parent, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

/**
 * Mount the stage into `container`.
 * policy: { name, horizon, execute, fps } (chunk length, actions run before re-planning, control rate)
 */
export async function mountStage(container, { assetUrl, policy }) {
  const [asset, bin] = await Promise.all([
    fetch(`${assetUrl}/nexarm.json`).then((r) => r.json()),
    fetch(`${assetUrl}/nexarm.bin`).then((r) => r.arrayBuffer()),
  ]);

  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "rp-stage-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 0.75;

  const geometries = new Map();
  const geometry = (name) => {
    if (!geometries.has(name)) geometries.set(name, decodeGeometry(asset.meshes[name], bin));
    return geometries.get(name);
  };
  const materials = new Map();
  const material = (name) => {
    if (!materials.has(name)) {
      const rgba = asset.materials[name] ?? [0.5, 0.5, 0.5, 1];
      const color = new THREE.Color().setRGB(rgba[0], rgba[1], rgba[2], THREE.SRGBColorSpace);
      const look = LOOK[name] ?? (name.startsWith("mat_bowl") ? { metalness: 0, roughness: 0.36 } : { metalness: 0.2, roughness: 0.6 });
      materials.set(name, new THREE.MeshStandardMaterial({ color, ...look }));
    }
    return materials.get(name);
  };

  // Workcell, floor and bowls.
  const floorMat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), floorMat);
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(1.2, 24);
  grid.rotation.x = Math.PI / 2;
  grid.position.set(0, -0.2, 0.0005);
  grid.layers.set(OVERLAY);
  grid.material.transparent = true;
  grid.material.opacity = 0.18;
  scene.add(grid);
  const box = new THREE.BoxGeometry(2, 2, 2);
  for (const b of asset.scene.boxes) {
    const m = new THREE.Mesh(box, material(b.material));
    m.position.fromArray(b.pos);
    m.scale.fromArray(b.size);
    m.castShadow = b.material !== "workcell_panel";
    m.receiveShadow = true;
    scene.add(m);
  }
  const bowls = {};
  for (const b of asset.scene.bowls) {
    const m = new THREE.Mesh(geometry(b.mesh), material(b.material));
    m.castShadow = m.receiveShadow = true;
    m.position.fromArray(b.pos);
    bowls[b.name] = m;
    scene.add(m);
  }

  const robot = buildRobot(asset, { geometry, material });
  scene.add(robot.root);
  const script = buildScript(robot, asset);

  // Policy cameras: the two fixed workcell cameras and the wrist camera on cam_mount.
  const sensors = {};
  for (const c of asset.scene.cameras) {
    sensors[c.name] = mujocoCamera(c);
    scene.add(sensors[c.name]);
  }
  sensors.wrist = robot.cameras.wrist;
  const accent = new THREE.Color(css(container, "--rp-accent", "#e0a40b"));
  const frustums = Object.values(sensors).map((cam) => {
    const f = frustum(cam, cam.name === "wrist" ? 0.09 : 0.22, accent);
    cam.add(f);
    return f;
  });

  // Lights.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404858, 0.55));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.1);
  key.position.set(0.9, -1.1, 1.8);
  key.target.position.set(0, -0.15, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -0.7, right: 0.7, top: 0.7, bottom: -0.7, near: 0.5, far: 4 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.6);
  fill.position.set(-1, -1.5, 0.8);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(-1.2, 1, 1.4);
  scene.add(fill, rim);

  // Action chunk: one dot per predicted action; the executed prefix is drawn in the accent colour.
  const maxDots = Math.max(1, policy.horizon);
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0042, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), maxDots);
  dots.layers.set(OVERLAY);
  dots.frustumCulled = false;
  scene.add(dots);
  const trailPts = new Float32Array(maxDots * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPts, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55 }));
  trail.layers.set(OVERLAY);
  trail.frustumCulled = false;
  scene.add(trail);
  const path = script.sampleTcp(policy.fps);
  const pathLen = path.length / 3;

  // Main camera and shots.
  const camera = new THREE.PerspectiveCamera(36, 1, 0.02, 20);
  camera.layers.enable(OVERLAY);
  const focus = new THREE.Vector3(-0.02, -0.18, 0.1);
  const tcp = new THREE.Vector3();
  const shots = {
    hero: (t) => {
      // Pull back on narrow stages so the whole workcell stays in frame.
      const r = 0.82 * Math.max(1, 1.3 / camera.aspect);
      const a = -0.62 + 0.18 * Math.sin(t * 0.12);
      return { pos: new THREE.Vector3(r * Math.cos(a), -0.18 + r * Math.sin(a), 0.62 * r), target: focus };
    },
    front: () => ({ pos: sensors.front.position.clone().add(new THREE.Vector3(0.04, -0.02, 0.02)), target: new THREE.Vector3(0, -0.2, 0.06) }),
    top: () => ({ pos: new THREE.Vector3(0.16, -0.26, 0.9), target: new THREE.Vector3(-0.01, -0.22, 0.03) }),
    side: () => ({ pos: new THREE.Vector3(0.78, 0.04, 0.3), target: new THREE.Vector3(-0.02, -0.12, 0.16) }),
    gripper: () => ({ pos: tcp.clone().add(new THREE.Vector3(0.2, -0.16, 0.12)), target: tcp.clone() }),
    chunk: () => ({ pos: tcp.clone().add(new THREE.Vector3(0.34, -0.1, 0.26)), target: tcp.clone().add(new THREE.Vector3(-0.04, -0.03, -0.04)) }),
  };
  const view = { pos: new THREE.Vector3(0.6, -0.6, 0.45), target: focus.clone() };

  // HUD.
  const hud = el("div", "rp-hud", container);
  const status = el("div", "rp-hud-status", hud);
  const subtaskLabel = el("div", "rp-hud-subtask", status);
  const clock = el("div", "rp-hud-clock", status);
  const chunkMeter = el("div", "rp-hud-chunk", hud);
  const chunkBar = el("div", "rp-hud-chunk-bar", chunkMeter);
  const chunkFill = el("span", "", chunkBar);
  const chunkText = el("div", "rp-hud-chunk-text", chunkMeter);
  const camsRow = el("div", "rp-hud-cams", hud);
  const frames = {};
  for (const name of CAMERA_ORDER) {
    const f = el("div", "rp-hud-cam", camsRow);
    el("span", "rp-hud-cam-label", f, name);
    frames[name] = f;
  }
  const jointsBox = el("div", "rp-hud-joints", hud);
  const jointRows = ARM_LABELS.concat("gripper").map((label) => {
    const row = el("div", "rp-hud-joint", jointsBox);
    el("span", "", row, label);
    return el("b", "", row);
  });
  el("div", "rp-hud-note", hud, "Scripted motion in the NexArm sim scene · not a policy rollout");

  let spec = { shot: "hero", cams: true, chunk: true, frustums: false, joints: false };
  let playing = true;
  let simTime = 0;
  let lastChunk = -1;
  let chunkBorn = 0;
  let visible = true;
  let width = 1;
  let height = 1;

  const resize = () => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  const io = new IntersectionObserver((entries) => (visible = entries[0].isIntersecting));
  io.observe(container);

  const applyTheme = () => {
    const bg = new THREE.Color(css(container, "--rp-stage-bg", "#e9ecef"));
    scene.background = bg;
    scene.fog = new THREE.Fog(bg, 2.2, 5);
    floorMat.color.set(css(container, "--rp-stage-floor", "#d9dde2"));
    grid.material.color.set(css(container, "--rp-ink", "#18212c"));
    trail.material.color.set(css(container, "--rp-accent", "#e0a40b"));
    accent.set(css(container, "--rp-accent", "#e0a40b"));
    frustums.forEach((f) => f.material.color.copy(accent));
  };
  applyTheme();
  const mo = new MutationObserver(applyTheme);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const state = { q: [0, 0, 0, 0, 0], grip: 0, bowls: {} };
  const dummy = new THREE.Object3D();
  const executedColor = new THREE.Color();
  const pendingColor = new THREE.Color();
  const clock3 = new THREE.Clock();

  function updateChunk(now) {
    const step = Math.floor(simTime * policy.fps);
    const chunk = Math.floor(step / policy.execute);
    if (chunk !== lastChunk) {
      lastChunk = chunk;
      chunkBorn = now;
    }
    const start = chunk * policy.execute;
    const into = step - start;
    const reveal = Math.min(1, (now - chunkBorn) / 0.35);
    executedColor.set(css(container, "--rp-accent", "#e0a40b"));
    pendingColor.set(css(container, "--rp-pending", "#6a7380"));
    for (let k = 0; k < maxDots; k++) {
      const i = (start + k) % pathLen;
      dummy.position.fromArray(path, i * 3);
      const shown = k / maxDots <= reveal && k >= into;
      dummy.scale.setScalar(shown ? (k < policy.execute ? 1 : 0.7) : 0.0001);
      dummy.updateMatrix();
      dots.setMatrixAt(k, dummy.matrix);
      dots.setColorAt(k, k < policy.execute ? executedColor : pendingColor);
      trailPts.set(path.subarray(i * 3, i * 3 + 3), k * 3);
    }
    dots.instanceMatrix.needsUpdate = true;
    dots.instanceColor.needsUpdate = true;
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.setDrawRange(0, Math.max(0, Math.floor(maxDots * reveal)));
    chunkFill.style.width = `${(100 * Math.min(into, policy.execute)) / policy.execute}%`;
    chunkText.textContent = `chunk ${chunk + 1} · action ${Math.min(into + 1, policy.execute)} of ${policy.execute} run · ${policy.horizon} predicted`;
  }

  function renderCams() {
    const canvasRect = renderer.domElement.getBoundingClientRect();
    renderer.setScissorTest(true);
    const fog = scene.fog;
    scene.fog = null;
    for (const name of CAMERA_ORDER) {
      const r = frames[name].getBoundingClientRect();
      if (!r.width) continue;
      const x = r.left - canvasRect.left;
      const y = canvasRect.bottom - r.bottom;
      renderer.setViewport(x, y, r.width, r.height);
      renderer.setScissor(x, y, r.width, r.height);
      renderer.render(scene, sensors[name]);
    }
    scene.fog = fog;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
  }

  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock3.getDelta());
    if (!visible || document.hidden) return;
    const now = performance.now() / 1000;
    if (playing) simTime += dt;

    script.stateAt(simTime, state);
    for (const [name, v] of Object.entries(state.bowls)) bowls[name].position.copy(v);
    robot.tcp(tcp);

    const s = script.subtasks[state.subtask];
    subtaskLabel.textContent = s ? `Subtask ${state.subtask + 1}/4 · ${s.name}` : "Ready pose";
    clock.textContent = `t = ${state.time.toFixed(1)} s · ${policy.fps} Hz control`;
    if (spec.joints) {
      state.q.forEach((v, i) => (jointRows[i].textContent = `${v >= 0 ? "+" : ""}${v.toFixed(2)} rad`));
      jointRows[5].textContent = `${(state.grip * 1000).toFixed(1)} mm`;
    }

    dots.visible = trail.visible = spec.chunk;
    if (spec.chunk) updateChunk(now);
    frustums.forEach((f) => (f.visible = spec.frustums));

    const goal = (shots[spec.shot] ?? shots.hero)(now);
    const k = 1 - Math.exp(-dt * 2.6);
    view.pos.lerp(goal.pos, k);
    view.target.lerp(goal.target, k);
    camera.position.copy(view.pos);
    camera.lookAt(view.target);

    renderer.render(scene, camera);
    if (spec.cams) renderCams();
  }
  frame();

  return {
    play(next) {
      spec = { ...spec, ...next };
      hud.classList.toggle("show-cams", !!spec.cams);
      hud.classList.toggle("show-chunk", !!spec.chunk);
      hud.classList.toggle("show-joints", !!spec.joints);
      container.dataset.beat = spec.beat ?? "";
    },
    setPlaying(on) {
      playing = on;
    },
    get playing() {
      return playing;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      renderer.dispose();
    },
  };
}
