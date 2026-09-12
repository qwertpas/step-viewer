import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import OcctJS from '@tx-code/occt-js';
import { openCad } from '../src/cad.js';

const [file, snapshot] = process.argv.slice(2);
if (!snapshot) throw new Error('Usage: node scripts/check-cad.mjs model.step original-snapshot.bin');
const baseline = deserialize(readFileSync(snapshot));
const occt = await OcctJS();
const result = openCad(occt, new Uint8Array(readFileSync(file)));
try {
  const ignored = new Set(['timings', 'exactModelId']);
  const fields = (scene) => Object.keys(scene).filter((field) => !ignored.has(field)).sort();
  assert.deepEqual(fields(result), fields(baseline), 'exported scene fields');
  for (const field of fields(baseline)) {
    assert.deepEqual(result[field], baseline[field], field);
  }
  console.log(JSON.stringify({ file, identical: true, stats: result.stats, timings: result.timings }));
} finally {
  occt.ReleaseExactModel(result.exactModelId);
}
