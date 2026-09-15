import test from "node:test";
import assert from "node:assert/strict";
import OcctJS from "@tx-code/occt-js";
import { Matrix4, Vector3 } from "three";
import { openCad } from "../src/cad.js";
import { buildParts } from "../src/model.js";
import { componentTree, componentFile } from "../src/download.js";
import { unpackCad } from "../src/cad-transfer.js";
import { CadSession } from "../src/cad-session.js";

const occt = await OcctJS();
const spec = {
  version: 1, units: "mm",
  profile: { start: [0, 0], segments: [[10, 0], [10, 20], [0, 20], [0, 0]].map((end) => ({ kind: "line", end })) },
  extrusion: { depth: 30 },
};
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`);

function fixture(t) {
  const exact = occt.OpenExactExtrudedShape(spec, {});
  t.after(() => occt.ReleaseExactModel(exact.exactModelId));
  const body = (name, x) => ({ name, handle: exact.exactGeometryBindings[0].exactShapeHandle,
    transform: new Matrix4().makeTranslation(x, 0, 0).toArray(),
    color: { r: 0.8, g: 0.2, b: 0.1 }, faces: [{ id: 1, color: { r: 0.1, g: 0.2, b: 0.9 } }], children: [] });
  const tree = { name: "Machine", children: [
    { name: "Moving assembly", children: [body("Plate A", 40), body("Plate B", 70)] },
    body("Other plate", 100),
  ] };
  tree.children[0].children[1].transform = new Matrix4().makeTranslation(90, 0, 0).multiply(new Matrix4().makeRotationZ(Math.PI / 2)).toArray();
  const exported = occt.ExportExactStepModel(exact.exactModelId, tree);
  assert.equal(exported.success, true, exported.error);
  const session = new CadSession(occt);
  const opened = session.open(exported.content, "fixture");
  session.commit(opened.exactModelId);
  t.after(() => occt.ReleaseExactModel(opened.exactModelId));
  return { session, ...buildParts(unpackCad(opened), "Machine.step") };
}

function reopen(t, session, tree) {
  const bytes = session.query("export", { tree });
  assert.match(new TextDecoder().decode(bytes), /^ISO-10303-21;/);
  const model = openCad(occt, bytes);
  t.after(() => occt.ReleaseExactModel(model.exactModelId));
  return { ...buildParts(model, "export.step"), modelId: model.exactModelId };
}

test("STEP subtree export preserves nested names, exact geometry, colors and occurrence positions", (t) => {
  const { session, root, parts } = fixture(t);
  assert.equal(parts.length, 3);
  const branch = root.children[0].children.find((node) => node.name === "Moving assembly");
  assert.ok(branch);
  // Hidden parts are still included; section/display state must not change exports.
  parts.forEach((part) => { part.surface.visible = false; });
  const result = reopen(t, session, componentTree(branch, parts));
  assert.equal(result.parts.length, 2);
  assert.equal(result.root.children[0].name, "Moving assembly");
  assert.deepEqual(result.parts.map((part) => part.name), ["Plate A", "Plate B"]);
  for (const [i, part] of result.parts.entries()) {
    close(part.bounds.min.x, 40 + 30 * i);
    const size = part.bounds.getSize(new Vector3());
    [size.x, size.y, size.z].forEach((value, axis) => close(value, (i === 0 ? [10, 20, 30] : [20, 10, 30])[axis]));
    close(part.data.faces.find((face) => face.id === 2).color.r, 0.8);
    close(part.data.faces.find((face) => face.id === 1).color.b, 0.9);
    const area = occt.MeasureExactFaceArea(result.modelId, part.handle, "face", 1);
    assert.equal(area.ok, true);
    close(area.value, 300);
  }
});

test("a single occurrence exports only that body in its assembly position", (t) => {
  const { session, parts } = fixture(t);
  const result = reopen(t, session, componentTree({ name: "One plate", meshes: [1], children: [] }, parts));
  assert.equal(result.parts.length, 1);
  close(result.parts[0].bounds.min.x, 70);
  assert.equal(result.root.children[0].name, "One plate");
});

test("export errors leave the loaded model available", (t) => {
  const { session, root, parts } = fixture(t);
  assert.throws(() => session.query("export", { tree: { name: "Empty", children: [] } }), /No components/);
  const tree = componentTree({ name: "Bad", meshes: [0] }, parts);
  tree.handle = 999999;
  assert.throws(() => session.query("export", { tree }));
  assert.equal(reopen(t, session, componentTree(root.children[0], parts)).parts.length, 3);
});

test("branches include their own bodies and nested bodies while omitting empty groups", (t) => {
  const { session, parts } = fixture(t);
  const tree = componentTree({ name: "Mixed branch", meshes: [0], children: [
    { name: "Nested plate", meshes: [1], children: [] },
    { name: "Empty group", meshes: [], children: [] },
  ] }, parts);
  assert.equal(tree.children.length, 2);
  assert.equal(reopen(t, session, tree).parts.length, 2);
});

test("component filenames are safe and retain STEP bytes", async () => {
  const file = componentFile(new Uint8Array([1, 2, 3]), 'Bracket / left:1.stp');
  assert.equal(file.name, 'Bracket _ left_1.step');
  assert.equal(file.type, 'application/step');
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), new Uint8Array([1, 2, 3]));
});
