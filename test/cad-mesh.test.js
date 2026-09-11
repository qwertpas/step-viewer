import test from "node:test";
import assert from "node:assert/strict";
import OcctJS from "@tx-code/occt-js";
import * as THREE from "three";
import { repairCone } from "../src/cad-mesh.js";
import { sectionShape } from "../src/section-shape.js";

test("a missing conical face is rebuilt from CAD boundaries without losing face IDs or filling its interior", async () => {
  const occt = await OcctJS();
  const model = occt.OpenExactRevolvedShape({
    version: 1, units: "mm",
    profile: { plane: "XZ", closure: "explicit", start: [0, 0], segments: [[2, 0], [4, 2], [0, 2], [0, 0]].map((end) => ({ kind: "line", end })) },
    revolve: { angleDeg: 360 },
  }, {});
  try {
    assert.equal(model.success, true);
    const geometry = model.geometries[0];
    const handle = model.exactGeometryBindings[0].exactShapeHandle;
    const face = geometry.faces.find((face) => occt.GetExactGeometryType(model.exactModelId, handle, "face", face.id).family === "cone");
    const exactArea = occt.MeasureExactFaceArea(model.exactModelId, handle, "face", face.id).value;
    const removed = face.indexCount;
    geometry.indices = new Uint32Array([...geometry.indices.slice(0, face.firstIndex), ...geometry.indices.slice(face.firstIndex + removed)]);
    geometry.triangleToFaceMap = new Int32Array([...geometry.triangleToFaceMap.slice(0, face.firstIndex / 3), ...geometry.triangleToFaceMap.slice((face.firstIndex + removed) / 3)]);
    for (const other of geometry.faces) if (other.firstIndex > face.firstIndex) other.firstIndex -= removed;
    face.indexCount = 0;
    repairCone(occt, model.exactModelId, handle, geometry, face);
    assert.ok(face.indexCount > 0);
    for (const other of geometry.faces) {
      assert.ok(other.indexCount > 0);
      assert.ok(geometry.triangleToFaceMap.slice(other.firstIndex / 3, (other.firstIndex + other.indexCount) / 3).every((id) => id === other.id));
    }
    assert.equal(occt.MeasureExactFaceArea(model.exactModelId, handle, "face", face.id).value, exactArea);
    const mesh = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(geometry.positions, 3));
    mesh.setIndex(new THREE.BufferAttribute(geometry.indices, 1));
    const shape = sectionShape(mesh, new THREE.Matrix4().makeRotationX(Math.PI / 2));
    assert.equal(shape.open, 0);
    assert.equal(shape.loops, 1);
    assert.ok(shape.fill.length > 0);
  } finally { occt.ReleaseExactModel(model.exactModelId); }
});
