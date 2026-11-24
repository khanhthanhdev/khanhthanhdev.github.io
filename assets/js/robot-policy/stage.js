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
  workcell_extrusion: { metalness: 0.75, roughness: 0.38 },
  workcell_panel: { metalness: 0, roughness: 0.92 },
  workcell_plate: { metalness: 0.3, roughness: 0.55 },
  table: { metalness: 0, roughness: 0.78 },
  table_grommet: { metalness: 0.1, roughness: 0.5 },
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
 * assetData: promise of [nexarm.json, inflated nexarm.bin.gz] from `assetUrl`, started by the caller so the download
 * overlaps loading this module and three.js.
 */
export async function mountStage(container, { assetUrl, policy, assetData }) {
  const [asset, bin] = await assetData;

  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  // Four views render per frame (the stage and three camera feeds), so cap the pixel ratio below retina 2×.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The shadow map is drawn once per frame, before the stage view, and reused by the camera feeds.
  renderer.shadowMap.autoUpdate = false;
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

  // Workcell, oak tabletop and bowls. The table texture repeats `texrepeat` times per metre, as in MuJoCo.
  let dirty = true;
  const table = asset.scene.table;
  const floorSize = 4;
  const floorMat = material(table.material);
  new THREE.TextureLoader().load(`${assetUrl}/${table.texture}`, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(table.texrepeat[0] * floorSize, table.texrepeat[1] * floorSize);
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    floorMat.map = tex;
    floorMat.needsUpdate = true;
    dirty = true;
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorSize, floorSize), floorMat);
  floor.receiveShadow = true;
  scene.add(floor);
  for (const c of asset.scene.cylinders ?? []) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(c.size[0], c.size[0], 2 * c.size[1], 40), material(c.material));
    m.rotation.x = Math.PI / 2;
    m.position.fromArray(c.pos);
    m.receiveShadow = true;
    scene.add(m);
  }
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

  // Lights from the workcell: the ceiling panel inside the frame (soft shadows) and the room fill through the open
  // front, plus a dim hemisphere and rim so the dark links keep their shape in the orbit view.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5048, 0.6));
  for (const l of asset.scene.lights ?? []) {
    const pos = new THREE.Vector3().fromArray(l.pos);
    const at = pos.clone().add(new THREE.Vector3().fromArray(l.dir));
    if (l.type === "directional") {
      const fill = new THREE.DirectionalLight(0xfff8f0, 1.1);
      fill.position.copy(pos);
      fill.target.position.copy(at);
      scene.add(fill, fill.target);
      continue;
    }
    const key = new THREE.SpotLight(0xfff6ec, 3.2, 0, THREE.MathUtils.degToRad(Math.min(l.cutoff, 85)), 0.75, 0);
    key.position.copy(pos);
    key.target.position.copy(at);
    key.castShadow = l.castshadow;
    key.shadow.mapSize.set(small ? 1024 : 1536, small ? 1024 : 1536);
    key.shadow.focus = 0.55;
    key.shadow.camera.near = 0.2;
    key.shadow.camera.far = 1.6;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.012;
    scene.add(key, key.target);
  }
  const rim = new THREE.DirectionalLight(0xffffff, 0.6);
  rim.position.set(-1.2, 1, 1.4);
  scene.add(rim);

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

  // Orbit: dragging the canvas takes the camera off the scripted shots. Drag rotates around the target (z is up),
  // the wheel zooms, right-drag or shift-drag pans. "Reset view" (or a double click) hands it back to the shots.
  const canvas = renderer.domElement;
  const orbit = { manual: false, target: new THREE.Vector3(), r: 1, az: 0, el: 0.5 };
  const takeOver = () => {
    if (orbit.manual) return;
    const off = view.pos.clone().sub(view.target);
    orbit.target.copy(view.target);
    orbit.r = off.length();
    orbit.az = Math.atan2(off.y, off.x);
    orbit.el = Math.asin(THREE.MathUtils.clamp(off.z / orbit.r, -1, 1));
    orbit.manual = true;
    container.classList.add("is-orbiting");
  };
  const orbitGoal = () => {
    const c = Math.cos(orbit.el);
    const off = new THREE.Vector3(c * Math.cos(orbit.az), c * Math.sin(orbit.az), Math.sin(orbit.el)).multiplyScalar(orbit.r);
    return { pos: orbit.target.clone().add(off), target: orbit.target };
  };
  const resetView = () => {
    orbit.manual = false;
    container.classList.remove("is-orbiting");
  };
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    takeOver();
    drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.pan) {
      const s = (orbit.r * 1.6) / Math.max(1, height);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      orbit.target.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
    } else {
      orbit.az -= dx * 0.008;
      orbit.el = THREE.MathUtils.clamp(orbit.el + dy * 0.008, 0.03, 1.5);
    }
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove("is-dragging");
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("dblclick", resetView);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      takeOver();
      orbit.r = THREE.MathUtils.clamp(orbit.r * Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0012)), 0.15, 3.5);
    },
    { passive: false }
  );

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
  el("div", "rp-hud-note", hud, "Drag to rotate · wheel to zoom · right-drag to pan · scripted motion, not a policy rollout");

  let spec = { shot: "hero", cams: true, chunk: true, frustums: false, joints: false };
  let playing = true;
  let camsOn = true;
  let simTime = 0;
  let shotTime = 0;
  let lastChunk = -1;
  let chunkBorn = 0;
  let visible = true;
  let width = 1;
  let height = 1;
  // Camera-feed viewports in canvas pixels, measured once per layout change instead of every frame.
  let camRects = null;

  const resize = () => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    camRects = null;
    dirty = true;
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  ro.observe(camsRow);
  const io = new IntersectionObserver((entries) => (visible = entries[0].isIntersecting));
  io.observe(container);

  // Theme colours are read here, on load and when the theme changes, never inside the render loop.
  const executedColor = new THREE.Color();
  const pendingColor = new THREE.Color();
  const applyTheme = () => {
    const bg = new THREE.Color(css(container, "--rp-stage-bg", "#e9ecef"));
    scene.background = bg;
    scene.fog = new THREE.Fog(bg, 2.2, 5);
    grid.material.color.set(css(container, "--rp-ink", "#18212c"));
    trail.material.color.set(css(container, "--rp-accent", "#e0a40b"));
    accent.set(css(container, "--rp-accent", "#e0a40b"));
    frustums.forEach((f) => f.material.color.copy(accent));
    executedColor.copy(accent);
    pendingColor.set(css(container, "--rp-pending", "#6a7380"));
    dirty = true;
  };
  applyTheme();
  const mo = new MutationObserver(applyTheme);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const state = { q: [0, 0, 0, 0, 0], grip: 0, bowls: {} };
  const dummy = new THREE.Object3D();
  const clock3 = new THREE.Clock();
  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };

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
    setText(chunkText, `chunk ${chunk + 1} · action ${Math.min(into + 1, policy.execute)} of ${policy.execute} run · ${policy.horizon} predicted`);
  }

  function measureCams() {
    const canvasRect = renderer.domElement.getBoundingClientRect();
    camRects = CAMERA_ORDER.map((name) => {
      const r = frames[name].getBoundingClientRect();
      return { name, x: r.left - canvasRect.left, y: canvasRect.bottom - r.bottom, w: r.width, h: r.height };
    }).filter((r) => r.w > 0 && r.h > 0);
  }

  function renderCams() {
    if (!camRects) measureCams();
    if (!camRects.length) return;
    renderer.setScissorTest(true);
    const fog = scene.fog;
    scene.fog = null;
    for (const r of camRects) {
      renderer.setViewport(r.x, r.y, r.w, r.h);
      renderer.setScissor(r.x, r.y, r.w, r.h);
      renderer.render(scene, sensors[r.name]);
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
    if (playing) {
      simTime += dt;
      shotTime += dt;
    }

    // The camera eases towards the current shot. When the motion is paused and the camera has arrived, nothing on
    // screen changes, so the frame is skipped.
    const goal = orbit.manual ? orbitGoal() : (shots[spec.shot] ?? shots.hero)(shotTime);
    const k = 1 - Math.exp(-dt * (orbit.manual ? 14 : 2.6));
    // Within 0.2 mm of the goal counts as arrived.
    const settled = view.pos.distanceToSquared(goal.pos) < 4e-8 && view.target.distanceToSquared(goal.target) < 4e-8;
    if (!playing && !dirty && settled && !drag) return;
    dirty = false;
    view.pos.lerp(goal.pos, k);
    view.target.lerp(goal.target, k);
    camera.position.copy(view.pos);
    camera.lookAt(view.target);

    script.stateAt(simTime, state);
    for (const [name, v] of Object.entries(state.bowls)) bowls[name].position.copy(v);
    robot.tcp(tcp);

    const s = script.subtasks[state.subtask];
    setText(subtaskLabel, s ? `Subtask ${state.subtask + 1}/4 · ${s.name}` : "Ready pose");
    setText(clock, `t = ${state.time.toFixed(1)} s · ${policy.fps} Hz control`);
    if (spec.joints) {
      state.q.forEach((v, i) => setText(jointRows[i], `${v >= 0 ? "+" : ""}${v.toFixed(2)} rad`));
      setText(jointRows[5], `${(state.grip * 1000).toFixed(1)} mm`);
    }

    dots.visible = trail.visible = spec.chunk;
    if (spec.chunk) updateChunk(now);
    frustums.forEach((f) => (f.visible = spec.frustums));

    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    if (spec.cams && camsOn) renderCams();
  }
  frame();

  return {
    play(next) {
      spec = { ...spec, ...next };
      hud.classList.toggle("show-cams", !!spec.cams);
      hud.classList.toggle("show-chunk", !!spec.chunk);
      hud.classList.toggle("show-joints", !!spec.joints);
      container.dataset.beat = spec.beat ?? "";
      camRects = null;
      dirty = true;
    },
    resetView,
    get orbiting() {
      return orbit.manual;
    },
    setCams(on) {
      camsOn = on;
      hud.classList.toggle("hide-cams", !on);
      camRects = null;
      dirty = true;
    },
    setPlaying(on) {
      playing = on;
      dirty = true;
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
