import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const site = (path) => new URL(`../_site/${path}`, import.meta.url);
const repo = (path) => new URL(`../${path}`, import.meta.url);

for (const model of ["act", "turbovla"]) {
  test(`${model} page renders every step, its diagram group and all three panels`, async () => {
    const html = await readFile(site(`works/robot-policy/${model}/index.html`), "utf8");
    const steps = [...html.matchAll(/<li data-id="([a-z-]+)"/g)].map((match) => match[1]);
    const groups = new Set([...html.matchAll(/data-step="([a-z ]+)"/g)].flatMap((match) => match[1].split(" ")));

    assert.ok(steps.length >= 5, `${model} has ${steps.length} steps`);
    for (const id of steps.filter((id) => id !== "overview")) assert.ok(groups.has(id), `diagram group for ${id}`);
    for (const id of ["inference", "training", "results"]) assert.match(html, new RegExp(`<section id="?${id}"?`));
    assert.match(html, /<svg[^>]*view[bB]ox="0 0 \d+ \d+"/);
    assert.match(html, /robot-policy\/app\.js/);
  });
}

test("index lists every policy page", async () => {
  const html = await readFile(site("works/robot-policy/index.html"), "utf8");

  assert.match(html, /href="?\/works\/robot-policy\/act\/"?/);
  assert.match(html, /href="?\/works\/robot-policy\/turbovla\/"?/);
});

// The minifier cannot parse ES modules and rewrites var() inside calc(), so these files must ship as written.
test("robot-policy modules and stylesheet are published without minification", async () => {
  for (const file of ["js/robot-policy/app.js", "js/robot-policy/stage.js", "js/robot-policy/nexarm.js", "css/robot-policy.css"]) {
    const [source, built] = await Promise.all([readFile(repo(`assets/${file}`), "utf8"), readFile(site(`assets/${file}`), "utf8")]);
    assert.equal(built, source, file);
  }
});

// .gitignore drops any path containing "vendor", so the three.js build must live elsewhere and be tracked.
test("three.js bundle is tracked and served", async () => {
  const { execFileSync } = await import("node:child_process");
  const path = "assets/js/robot-policy/lib/three.module.min.js";
  const tracked = execFileSync("git", ["ls-files", "--error-unmatch", path], { cwd: repo("").pathname }).toString();
  assert.match(tracked, /three\.module\.min\.js/);
  assert.equal((await readFile(site(path))).length, (await readFile(repo(path))).length);
});

test("NexArm asset decodes and the scripted motion reaches every IK target", async () => {
  const { buildRobot, buildScript, decodeGeometry } = await import("../assets/js/robot-policy/nexarm.js");
  const asset = JSON.parse(await readFile(repo("assets/robot/nexarm/nexarm.json"), "utf8"));
  const buffer = await readFile(repo("assets/robot/nexarm/nexarm.bin"));
  const bin = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  let triangles = 0;
  for (const entry of Object.values(asset.meshes)) {
    const geometry = decodeGeometry(entry, bin);
    triangles += geometry.index.count / 3;
    assert.ok(Number.isFinite(geometry.boundingSphere.radius));
  }
  assert.ok(triangles > 10_000 && triangles < 60_000, `${triangles} triangles`);

  const robot = buildRobot(asset);
  const script = buildScript(robot, asset);
  assert.ok(script.ikError < 0.001, `worst IK error ${(script.ikError * 1000).toFixed(2)} mm`);
  assert.ok(script.duration > 10);
});
