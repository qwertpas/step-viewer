import test from "node:test";
import assert from "node:assert/strict";
import { CadSession } from "../src/cad-session.js";
import { packCad, unpackCad } from "../src/cad-transfer.js";
import { CadClient } from "../src/cad-client.js";
import { CadWorker } from "../src/cad-worker.js";

function model(id = 1) {
  return {
    success: true, exactModelId: id,
    exactGeometryBindings: [{ geometryId: "part", exactShapeHandle: id * 10 }],
    rootNodes: [{ name: "Assembly", meshes: [0], children: [] }],
    geometries: [{
      id: "part", color: { r: 0.5, g: 0.6, b: 0.7 },
      positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 20, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 2]), triangleToFaceMap: new Int32Array([7]),
      faces: [{ id: 7, firstIndex: 0, indexCount: 3, edgeIndices: [0] }],
      edges: [{ id: 4, points: new Float32Array([0, 0, 0, 10, 0, 0]), ownerFaceIds: [7] }],
      vertices: [{ id: 2, position: [10, 0, 0] }],
    }],
  };
}

test("one transferred slab preserves geometry, topology and exact handles without detaching the cache", () => {
  const source = model();
  const cached = packCad(source);
  const outgoing = { ...cached, buffer: cached.buffer.slice(0) };
  const received = structuredClone(outgoing, { transfer: [outgoing.buffer] });
  assert.equal(outgoing.buffer.byteLength, 0);
  const result = unpackCad(received);
  assert.deepEqual(result, source);
  const geometry = result.geometries[0];
  const views = [geometry.positions, geometry.normals, geometry.indices, geometry.triangleToFaceMap, geometry.edges[0].points];
  assert.ok(views.every((view) => view.buffer === received.buffer));
  assert.deepEqual(unpackCad(cached), source);
  geometry.positions[0] = 99;
  assert.equal(unpackCad(cached).geometries[0].positions[0], 0);
});

function session() {
  const released = [];
  let imports = 0;
  const occt = {
    OpenExactStepModel(bytes) { return bytes[0] === 0 ? { success: false } : model(++imports); },
    ReleaseExactModel(id) { released.push(id); },
    MeasureExactRadius(id, handle) { return { ok: true, radius: id, handle }; },
  };
  return { cad: new CadSession(occt), occt, released, imports: () => imports };
}

const selection = { refs: [{ handle: 10, kind: "face", id: 7 }] };

function useWorker(t, Worker) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: Worker });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "Worker", previous);
    else delete globalThis.Worker;
  });
}

test("opening is transactional and failures preserve the active model's exact measurements", () => {
  const { cad, released } = session();
  const first = cad.open(new Uint8Array([1]), "first");
  assert.throws(() => cad.query("measure", selection), /No CAD model/);
  cad.commit(first.exactModelId);
  assert.equal(cad.query("measure", selection).radius.radius, 1);
  assert.throws(() => cad.open(new Uint8Array([0]), "invalid"), /No solid CAD/);
  assert.equal(cad.query("measure", selection).radius.radius, 1);
  const next = cad.open(new Uint8Array([2]), "next");
  assert.equal(cad.query("measure", selection).radius.radius, 1);
  assert.throws(() => cad.open(new Uint8Array([3]), "too-soon"), /waiting to be displayed/);
  cad.discard(next.exactModelId);
  assert.deepEqual(released, [2]);
  assert.equal(cad.query("measure", selection).radius.radius, 1);
  const replacement = cad.open(new Uint8Array([3]), "replacement");
  cad.commit(replacement.exactModelId);
  assert.deepEqual(released, [2, 1]);
  assert.equal(cad.query("measure", selection).radius.radius, 3);
  assert.throws(() => cad.commit(first.exactModelId), /no longer available/);
});

test("identical content reopens without importing and retains valid handles after discard", () => {
  const { cad, released, imports } = session();
  cad.commit(cad.open(new Uint8Array([1]), "same-content").exactModelId);
  const progress = [];
  const cached = cad.open(new Uint8Array([1]), "same-content", (stage) => progress.push(stage));
  assert.equal(cached.cached, true);
  assert.deepEqual(progress, ["cache"]);
  assert.equal(imports(), 1);
  cad.discard(cached.exactModelId);
  cad.commit(cached.exactModelId);
  assert.deepEqual(released, []);
  assert.equal(cad.query("measure", selection).radius.radius, cached.exactModelId);
});

test("client progress keeps the request pending and worker failure rejects every waiting request", async (t) => {
  class Worker {
    postMessage(message, transfer) { this.message = message; this.transfer = transfer; }
    terminate() { this.terminated = true; }
  }
  useWorker(t, Worker);
  const client = new CadClient();
  const progress = [];
  const first = client.request("open", { buffer: new ArrayBuffer(4) }, (stage) => progress.push(stage));
  const worker = client.worker;
  const id = worker.message.id;
  worker.onmessage({ data: { id, progress: "mesh" } });
  assert.deepEqual(progress, ["mesh"]);
  assert.equal(client.pending.size, 1);
  worker.onmessage({ data: { id, result: packCad(model()), packed: true } });
  assert.deepEqual(await first, model());
  const measure = client.request("measure", selection);
  const plane = client.request("plane", { ref: selection.refs[0] });
  worker.onerror();
  await assert.rejects(measure, /CAD reader stopped/);
  await assert.rejects(plane, /CAD reader stopped/);
  assert.equal(worker.terminated, true);
  assert.equal(client.pending.size, 0);
  await assert.rejects(client.request("open", {}), /CAD reader stopped/);
});

test("worker serializes opening and committing, recovers from invalid files, and transfers cached models", async () => {
  const { occt, released, imports } = session();
  let initialize;
  const messages = [];
  const worker = new CadWorker(new Promise((resolve) => { initialize = resolve; }), (message, transfer) => {
    messages.push(structuredClone(message, { transfer }));
  });
  const opened = worker.request({ id: 1, type: "open", buffer: new Uint8Array([1]).buffer });
  const committed = worker.request({ id: 2, type: "commit", modelId: 1 });
  await Promise.resolve();
  assert.deepEqual(messages, [{ id: 1, progress: "initialize" }]);
  initialize(occt);
  await Promise.all([opened, committed]);
  const first = messages.find((message) => message.id === 1 && message.result);
  assert.equal(first.packed, true);
  assert.match(first.result.hash, /^[a-f0-9]{64}$/);
  assert.ok(messages.findIndex((message) => message === first) < messages.findIndex((message) => message.id === 2));
  assert.deepEqual(unpackCad(first.result).geometries, model().geometries);
  const invalid = worker.request({ id: 3, type: "open", buffer: new Uint8Array([0]).buffer });
  const measure = worker.request({ id: 4, type: "measure", ...selection });
  await Promise.all([invalid, measure]);
  assert.match(messages.find((message) => message.id === 3 && message.error).error, /No solid CAD/);
  assert.equal(messages.find((message) => message.id === 4).result.radius.radius, 1);
  await worker.request({ id: 5, type: "open", buffer: new Uint8Array([1]).buffer });
  const cached = messages.find((message) => message.id === 5 && message.result);
  assert.equal(cached.result.cached, true);
  assert.equal(cached.result.hash, first.result.hash);
  assert.deepEqual(unpackCad(cached.result).geometries, model().geometries);
  assert.equal(imports(), 1);
  assert.deepEqual(released, []);
});

test("a failed worker transfer releases the prepared model and leaves the previous exact model available", async () => {
  const { occt, released } = session();
  const messages = [];
  const worker = new CadWorker(Promise.resolve(occt), (message) => {
    if (message.id === 3 && message.result) throw new Error("Could not transfer geometry");
    messages.push(message);
  });
  await worker.request({ id: 1, type: "open", buffer: new Uint8Array([1]).buffer });
  await worker.request({ id: 2, type: "commit", modelId: 1 });
  await worker.request({ id: 3, type: "open", buffer: new Uint8Array([2]).buffer });
  assert.match(messages.find((message) => message.id === 3 && message.error).error, /Could not transfer/);
  assert.deepEqual(released, [2]);
  await worker.request({ id: 4, type: "measure", ...selection });
  assert.equal(messages.find((message) => message.id === 4).result.radius.radius, 1);
});

test("failed CAD initialization closes the client so the next open can retry with a fresh worker", async (t) => {
  const { occt } = session();
  let attempts = 0;
  class Worker {
    constructor() {
      const importer = ++attempts === 1 ? Promise.reject(new Error("Failed to fetch CAD reader")) : Promise.resolve(occt);
      this.cad = new CadWorker(importer, (message, transfer) => {
        if (!this.terminated) this.onmessage({ data: structuredClone(message, { transfer }) });
      });
    }
    postMessage(message) { this.cad.request(message); }
    terminate() { this.terminated = true; }
  }
  useWorker(t, Worker);
  let client = new CadClient();
  const opening = client.request("open", { buffer: new Uint8Array([1]).buffer });
  const waiting = client.request("measure", selection);
  await assert.rejects(opening, /Failed to fetch CAD reader/);
  await assert.rejects(waiting, /Failed to fetch CAD reader/);
  assert.equal(client.worker.terminated, true);
  assert.equal(client.pending.size, 0);
  assert.ok(client.error);
  if (client.error) client = new CadClient();
  const result = await client.request("open", { buffer: new Uint8Array([1]).buffer });
  await client.request("commit", { modelId: result.exactModelId });
  assert.equal((await client.request("measure", selection)).radius.radius, result.exactModelId);
  assert.equal(attempts, 2);
  client.close();
});
