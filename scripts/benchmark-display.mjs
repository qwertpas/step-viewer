import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { arch, cpus, loadavg, platform, tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deserialize } from "node:v8";
import * as THREE from "three";
import * as current from "../src/model.js";
import { pickSurfaces } from "../src/section-math.js";
import { sectionShape } from "../src/section-shape.js";

const [snapshot, checkout, count = "5"] = process.argv.slice(2);
const rounds = Number(count);
if (!snapshot || !checkout || !Number.isInteger(rounds) || rounds < 1 || !global.gc) {
  throw new Error("Usage: node --expose-gc scripts/benchmark-display.mjs snapshot.bin baseline-checkout [rounds]");
}
const project = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = await mkdtemp(join(tmpdir(), "step-display-"));

function measure(before, after, operations = 1) {
  const samples = { baseline: [], current: [] };
  before(); after();
  for (let i = 0; i < rounds; i++) {
    const order = [["baseline", before], ["current", after]];
    if (i % 2) order.reverse();
    for (const [name, run] of order) {
      global.gc();
      const start = performance.now();
      run();
      samples[name].push((performance.now() - start) / operations);
    }
  }
  const stats = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const medianMs = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    return { medianMs, minMs: sorted[0], maxMs: sorted.at(-1), samplesMs: values };
  };
  const baseline = stats(samples.baseline), optimized = stats(samples.current);
  return { operations, baseline, current: optimized, speedup: baseline.medianMs / optimized.medianMs };
}

function compareHits(before, after) {
  assert.equal(before.length, after.length);
  for (let i = 0; i < before.length; i++) {
    const a = before[i], b = after[i];
    assert.equal(a.hit?.object.userData.partIndex, b.hit?.object.userData.partIndex, `pick ${i}: part`);
    assert.equal(a.hit?.faceIndex, b.hit?.faceIndex, `pick ${i}: triangle`);
    if (a.hit) assert.ok(Math.abs(a.hit.distance - b.hit.distance) < 1e-7, `pick ${i}: distance`);
    if (Number.isFinite(a.limit)) assert.ok(Math.abs(a.limit - b.limit) < 1e-7, `pick ${i}: cap`);
    else assert.equal(a.limit, b.limit, `pick ${i}: cap`);
  }
}

function area(shape) {
  let total = 0;
  const p = shape.fill;
  for (let i = 0; i < p.length; i += 9) {
    total += Math.abs((p[i + 3] - p[i]) * (p[i + 7] - p[i + 1]) - (p[i + 6] - p[i]) * (p[i + 4] - p[i + 1])) / 2;
  }
  return total;
}

function compareSections(before, after) {
  let maxAreaError = 0;
  assert.equal(before.length, after.length);
  for (let i = 0; i < before.length; i++) {
    const a = before[i], b = after[i];
    assert.equal(a.open, b.open, `section ${i}: open contours`);
    assert.equal(a.loops, b.loops, `section ${i}: closed contours`);
    const error = Math.abs(area(a) - area(b)) / Math.max(area(a), 1);
    assert.ok(error < 1e-5, `section ${i}: relative area error ${error}`);
    maxAreaError = Math.max(maxAreaError, error);
  }
  return maxAreaError;
}

try {
  // Both source versions use this project's dependency versions; the checkout remains untouched.
  await cp(join(resolve(checkout), "src"), join(temporary, "src"), { recursive: true });
  await writeFile(join(temporary, "package.json"), '{"type":"module"}');
  await symlink(join(project, "node_modules"), join(temporary, "node_modules"), "dir");
  const module = (name) => import(pathToFileURL(join(temporary, "src", name)).href);
  const baseline = await module("model.js");
  const { pickSurfaces: oldPick } = await module("section-math.js");
  const { sectionShape: oldSection } = await module("section-shape.js");
  const source = deserialize(await readFile(resolve(snapshot)));
  const data = { ...source, geometries: source.geometries.map((part) => ({
    ...part, positions: new Float32Array(part.positions), normals: new Float32Array(part.normals), indices: new Uint32Array(part.indices),
  })) };
  const filename = basename(snapshot, ".bin") + ".step";
  const oldModel = baseline.buildParts(data, filename), model = current.buildParts(data, filename);
  const before = oldModel.parts, after = model.parts;
  assert.equal(before.length, after.length);
  assert.deepEqual(oldModel.root, model.root, "component tree and names");
  const bounds = baseline.visibleBounds(before), nextBounds = current.visibleBounds(after);
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  assert.ok(bounds.min.distanceTo(nextBounds.min) < 1e-10 * Math.max(size.length(), 1));
  assert.ok(bounds.max.distanceTo(nextBounds.max) < 1e-10 * Math.max(size.length(), 1));
  for (let i = 0; i < before.length; i++) {
    const a = before[i], b = after[i];
    assert.equal(a.name, b.name); assert.equal(a.handle, b.handle); assert.deepEqual(a.transform, b.transform);
    for (const name of ["position", "normal"]) {
      assert.deepEqual(a.surface.geometry.attributes[name].array, b.surface.geometry.attributes[name].array, `part ${i}: ${name}`);
    }
    assert.deepEqual(a.surface.geometry.index.array, b.surface.geometry.index.array, `part ${i}: triangles`);
    assert.deepEqual(a.surface.geometry.groups, b.surface.geometry.groups, `part ${i}: material groups`);
    assert.deepEqual(a.surface.material.map((m) => m.color.toArray()), b.surface.material.map((m) => m.color.toArray()), `part ${i}: colors`);
    assert.deepEqual(a.edge.geometry.attributes.position.array, b.edge.geometry.attributes.position.array, `part ${i}: edges`);
    assert.deepEqual(a.edgeIds, b.edgeIds, `part ${i}: edge identities`);
  }

  const rays = [];
  for (let axis = 0; axis < 3; axis++) for (let i = 0; i < 14; i++) for (let j = 0; j < 11; j++) {
    const origin = center.clone().setComponent(axis, bounds.max.getComponent(axis) + size.length());
    const x = (axis + 1) % 3, y = (axis + 2) % 3;
    origin.setComponent(x, bounds.min.getComponent(x) + size.getComponent(x) * (i + 0.321) / 14);
    origin.setComponent(y, bounds.min.getComponent(y) + size.getComponent(y) * (j + 0.623) / 11);
    rays.push(new THREE.Raycaster(origin, new THREE.Vector3().setComponent(axis, -1)));
  }
  const picks = (fn, parts, planes = []) => rays.map((ray) => fn(ray, parts, planes));
  const planes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), center.z)];
  compareHits(picks(oldPick, before), picks(pickSurfaces, after));
  compareHits(picks(oldPick, before, planes), picks(pickSurfaces, after, planes));

  const cuts = [];
  for (let axis = 0; axis < 3; axis++) for (const fraction of [0.23, 0.5, 0.77]) {
    const normal = new THREE.Vector3().setComponent(axis, 1);
    const origin = center.clone().setComponent(axis, bounds.min.getComponent(axis) + fraction * size.getComponent(axis));
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
    const toPlane = new THREE.Matrix4().compose(origin,
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal), new THREE.Vector3(1, 1, 1)).invert();
    for (let i = 0; i < after.length; i++) {
      if (after[i].bounds.intersectsPlane(plane)) cuts.push({ i, transform: toPlane.clone().multiply(after[i].surface.matrixWorld) });
    }
  }
  assert.ok(cuts.length, "model has no intersecting section candidates");
  const sections = (fn, parts) => cuts.map((cut) => fn(parts[cut.i].surface.geometry, cut.transform));
  const maxAreaError = compareSections(sections(oldSection, before), sections(sectionShape, after));
  const dense = new THREE.TorusKnotGeometry(10, 3, 800, 100);
  const denseTransform = new THREE.Matrix4().makeRotationY(0.7).setPosition(0, 0, 1.23);
  compareSections([oldSection(dense, denseTransform)], [sectionShape(dense, denseTransform)]);
  process.stderr.write(`Verified ${after.length} parts, ${rays.length * 2} picks and ${cuts.length} sections. Measuring ${rounds} alternating rounds.\n`);

  const fits = (fn, parts) => { for (let i = 0; i < 50; i++) fn(parts); };
  const report = {
    measuredAt: new Date().toISOString(),
    snapshot: resolve(snapshot), baseline: resolve(checkout), current: project,
    environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0].model, loadAverage: loadavg(), three: THREE.REVISION },
    rounds, units: "milliseconds per operation; samples exclude explicit pre-run GC",
    checks: { parts: after.length, unique: source.geometries.length, triangles: source.geometries.reduce((n, g) => n + g.indices.length / 3, 0),
      picks: rays.length * 2, sections: cuts.length, maxAreaError },
    build: measure(() => baseline.buildParts(data, filename), () => current.buildParts(data, filename)),
    picking: measure(() => picks(oldPick, before), () => picks(pickSurfaces, after), rays.length),
    clippedPicking: measure(() => picks(oldPick, before, planes), () => picks(pickSurfaces, after, planes), rays.length),
    section: measure(() => sections(oldSection, before), () => sections(sectionShape, after), cuts.length),
    fitting: measure(() => fits(baseline.visibleBounds, before), () => fits(current.visibleBounds, after), 50),
    denseSection: measure(() => oldSection(dense, denseTransform), () => sectionShape(dense, denseTransform)),
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
