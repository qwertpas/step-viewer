import test from "node:test";
import assert from "node:assert/strict";
import OcctJS from "@tx-code/occt-js";
import { Matrix4 } from "three";
import { measureCad, openCad } from "../src/cad.js";

const occt = await OcctJS();
const identity = new Matrix4().toArray();
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const ref = (model, kind, id, transform = identity) => ({ handle: model.exactGeometryBindings[0].exactShapeHandle, kind, id, transform });
const boxSpec = {
  version: 1, units: "mm",
  profile: { start: [0, 0], segments: [[10, 0], [10, 20], [0, 20], [0, 0]].map((end) => ({ kind: "line", end })) },
  extrusion: { depth: 30 },
};
const cylinderSpec = {
  version: 1, units: "mm",
  profile: { plane: "XZ", closure: "explicit", start: [0, 0], segments: [[5, 0], [5, 20], [0, 20], [0, 0]].map((end) => ({ kind: "line", end })) },
  revolve: { angleDeg: 360 },
};

function facesAt(model, axis, value) {
  return model.geometries[0].faces.filter((face) => {
    const area = occt.MeasureExactFaceArea(model.exactModelId, ref(model, "face", face.id).handle, "face", face.id);
    return area.ok && Math.abs(area.localCentroid[axis] - value) < 1e-8;
  });
}

test("exact face distances and area match a 10 × 20 × 30 mm solid", () => {
  const model = occt.OpenExactExtrudedShape(boxSpec, {});
  assert.equal(model.success, true);
  try {
    for (const [axis, size] of [10, 20, 30].entries()) {
      const a = ref(model, "face", facesAt(model, axis, 0)[0].id);
      const b = ref(model, "face", facesAt(model, axis, size)[0].id);
      const result = measureCad(occt, model.exactModelId, [a, b]);
      close(result.distance.value, size);
      close(Math.hypot(...result.distance.pointA.map((v, i) => v - result.distance.pointB[i])), size);
    }
    const a = ref(model, "face", facesAt(model, 0, 0)[0].id);
    close(measureCad(occt, model.exactModelId, [a]).area.value, 600);
    const moved = { ...a, transform: new Matrix4().makeTranslation(47.123456789, 0, 0).toArray() };
    close(measureCad(occt, model.exactModelId, [a, moved]).distance.value, 47.123456789);
    close(measureCad(occt, model.exactModelId, [a, a]).distance.value, 0);
  } finally { occt.ReleaseExactModel(model.exactModelId); }
});

test("diameters and circle spacing remain exact at different display tessellations", () => {
  const counts = [];
  for (const deflection of [0.5, 0.0005]) {
    const model = occt.OpenExactRevolvedShape(cylinderSpec, { linearDeflectionType: "absolute_value", linearDeflection: deflection, angularDeflection: deflection === 0.5 ? 1 : 0.05 });
    assert.equal(model.success, true);
    try {
      const geometry = model.geometries[0];
      counts.push(geometry.indices.length);
      const circles = geometry.edges.filter((edge) => occt.GetExactGeometryType(model.exactModelId, ref(model, "edge", edge.id).handle, "edge", edge.id).family === "circle");
      assert.equal(circles.length, 2);
      const refs = circles.map((edge) => ref(model, "edge", edge.id));
      // Destroy display data: measurements must still use the retained B-rep.
      geometry.positions.fill(999);
      geometry.indices.fill(0);
      const radius = measureCad(occt, model.exactModelId, [refs[0]]).radius;
      close(radius.radius, 5);
      close(radius.diameter, 10);
      const pair = measureCad(occt, model.exactModelId, refs);
      close(pair.distance.value, 20);
      assert.ok(pair.centers);
      const length = occt.MeasureExactEdgeLength(model.exactModelId, refs[0].handle, "edge", refs[0].id);
      close(length.value, Math.PI * 10);
    } finally { occt.ReleaseExactModel(model.exactModelId); }
  }
  assert.notEqual(counts[0], counts[1]);
});

test("invalid selections and released models fail without mesh estimates", () => {
  const model = occt.OpenExactExtrudedShape(boxSpec, {});
  const valid = ref(model, "face", model.geometries[0].faces[0].id);
  assert.throws(() => measureCad(occt, model.exactModelId, [{ ...valid, id: 99999 }]));
  occt.ReleaseExactModel(model.exactModelId);
  assert.throws(() => measureCad(occt, model.exactModelId, [valid]));
  assert.equal(occt.GetExactModelDiagnostics().liveExactModelCount, 0);
});

test("malformed STEP input is rejected", () => {
  assert.throws(() => openCad(occt, new TextEncoder().encode("not a STEP file")), /No solid CAD/);
  assert.equal(occt.GetExactModelDiagnostics().liveExactModelCount, 0);
});
