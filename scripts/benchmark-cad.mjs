import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { arch, cpus, loadavg, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { openCad } from "../src/cad.js";

const [file, originalPackage, count = "3"] = process.argv.slice(2);
const rounds = Number(count);
if (!file || !originalPackage || !Number.isInteger(rounds) || rounds < 1 || !global.gc) {
  throw new Error("Usage: node --expose-gc scripts/benchmark-cad.mjs model.step original-runtime-package [rounds]");
}

const require = createRequire(import.meta.url);
const bytes = new Uint8Array(await readFile(resolve(file)));
const hash = (data) => createHash("sha256").update(data).digest("hex");
const fileHash = hash(bytes);
const environment = { node: process.version, v8: process.versions.v8, platform: platform(), arch: arch(), cpu: cpus()[0].model, loadAverage: loadavg() };
const runtimes = {};
const samples = [];

for (const [name, entry] of [
  ["original", require.resolve(resolve(originalPackage))],
  ["optimized", require.resolve("@tx-code/occt-js")],
]) {
  const wasm = await readFile(join(dirname(entry), "occt-js.wasm"));
  const { default: factory } = await import(pathToFileURL(entry).href);
  const phases = [];
  const print = (message) => process.stderr.write(`[${name}] ${message}\n`);
  const wasmHash = hash(wasm);
  global.gc();
  const start = performance.now();
  const module = await factory({ wasmBinary: wasm, print, printErr: print, onProgress: (stage) => phases.push(stage) });
  const initializeMs = performance.now() - start;
  runtimes[name] = { module, phases, entry, wasmBytes: wasm.length, wasmHash, initializeMs };
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    minMs: sorted[0], maxMs: sorted.at(-1), samplesMs: values,
  };
}

function measure(name, phase, round) {
  const runtime = runtimes[name];
  runtime.phases.length = 0;
  global.gc();
  let result;
  try {
    const start = performance.now();
    result = openCad(runtime.module, bytes);
    const openMs = performance.now() - start;
    const instances = (nodes) => nodes.reduce((sum, node) => sum + node.meshes.length + instances(node.children), 0);
    const sample = {
      runtime: name, phase, round, openMs,
      timings: result.timings, phases: [...runtime.phases], stats: result.stats,
      displayedBodies: instances(result.rootNodes), uniqueGeometries: result.geometries.length,
      triangles: result.geometries.reduce((sum, geometry) => sum + geometry.indices.length / 3, 0),
    };
    const first = samples[0];
    if (first) {
      for (const field of ["stats", "displayedBodies", "uniqueGeometries", "triangles"]) {
        assert.deepEqual(sample[field], first[field], `${name}: ${field}`);
      }
    }
    samples.push(sample);
    process.stderr.write(`${phase} ${round}: ${name} ${(openMs / 1000).toFixed(3)} s\n`);
  } finally {
    if (result) assert.equal(runtime.module.ReleaseExactModel(result.exactModelId).ok, true);
    assert.equal(runtime.module.GetExactModelDiagnostics().liveExactModelCount, 0, `${name}: retained models after import`);
  }
}

// Keep first imports visible, but exclude them from warmed comparisons.
measure("original", "first", 0);
measure("optimized", "first", 0);
for (let round = 1; round <= rounds; round++) {
  const order = round % 2 ? ["original", "optimized"] : ["optimized", "original"];
  for (const name of order) measure(name, "warm", round);
}
assert.equal(hash(bytes), fileHash, "CAD import changed the input bytes");

const summaries = {};
for (const name of Object.keys(runtimes)) {
  const measured = samples.filter((sample) => sample.runtime === name && sample.phase === "warm");
  const fields = [...new Set(measured.flatMap((sample) => Object.keys(sample.timings)))];
  summaries[name] = {
    open: summarize(measured.map((sample) => sample.openMs)),
    timings: Object.fromEntries(fields.map((field) => [field, summarize(measured.map((sample) => sample.timings[field]))])),
  };
}
console.log(JSON.stringify({
  measuredAt: new Date().toISOString(), file: resolve(file), fileBytes: bytes.length, fileHash, rounds,
  benchmark: "CAD kernel WebAssembly in Node.js; milliseconds",
  initialization: "Factory initialization using preloaded WASM bytes; JavaScript module loading and file I/O excluded.",
  strategy: "One persistent runtime per version. First imports warm each runtime and are reported separately. Alternating measured order, GC before each import, exact models released afterward. No worker or active-file cache.",
  excludes: ["file read", "explicit garbage collection", "model release", "worker messaging", "mesh packing", "scene construction", "browser first paint", "network transfer"],
  environment: { ...environment, loadAverageAtEnd: loadavg() },
  runtimes: Object.fromEntries(Object.entries(runtimes).map(([name, { module, phases, ...metadata }]) => [name, metadata])),
  identicalRuntime: runtimes.original.wasmHash === runtimes.optimized.wasmHash,
  summaries, speedup: summaries.original.open.medianMs / summaries.optimized.open.medianMs, samples,
}, null, 2));
