import test from "node:test";
import assert from "node:assert/strict";
import OcctJS from "@tx-code/occt-js";
import * as THREE from "three";
import { repairCone, repairFace } from "../src/cad-mesh.js";
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
    let displayArea = 0;
    for (let i = face.firstIndex; i < face.firstIndex + face.indexCount; i += 3) {
      const [a, b, c] = Array.from(geometry.indices.slice(i, i + 3)).map((id) => new THREE.Vector3().fromArray(geometry.positions, id * 3));
      displayArea += b.sub(a).cross(c.sub(a)).length() / 2;
    }
    assert.ok(Math.abs(displayArea - exactArea) / exactArea < 0.02, "triangles follow the cone, not chords across its annulus");
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

test("zero-area CAD faces require no display triangles", () => {
  let queried = false;
  const occt = {
    MeasureExactFaceArea: () => ({ ok: true, value: 0 }),
    GetExactGeometryType() { queried = true; throw new Error("Must not repair a collapsed face"); },
  };
  const face = { id: 2, indexCount: 0 };
  repairFace(occt, 1, 1, {}, face);
  assert.equal(face.indexCount, 0);
  assert.equal(queried, false);
  assert.throws(() => repairFace({
    MeasureExactFaceArea: () => ({ ok: true, value: 1 }),
    GetExactGeometryType: () => ({ ok: true, family: "torus" }),
  }, 1, 1, {}, face), /triangulation is missing/, "nonzero missing surfaces are not silently ignored");
});

test("missing planar faces retain holes, normals and face mapping", () => {
  const face = { id: 10, firstIndex: 0, indexCount: 0 };
  const loops = [
    [[-2, -2, 0], [2, -2, 0], [2, 2, 0], [-2, 2, 0], [-2, -2, 0]],
    [[-1, -1, 0], [-1, 1, 0], [1, 1, 0], [1, -1, 0], [-1, -1, 0]],
  ];
  const geometry = {
    positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(),
    triangleToFaceMap: new Int32Array(), faces: [face],
    edges: loops.map((points) => ({ ownerFaceIds: [10], points: new Float32Array(points.flat()) })),
  };
  const occt = {
    MeasureExactFaceArea: () => ({ ok: true, value: 12 }),
    GetExactGeometryType: () => ({ ok: true, family: "plane" }),
    EvaluateExactFaceNormal: () => ({ ok: true, localNormal: [0, 0, -1] }),
  };
  repairFace(occt, 1, 1, geometry, face);
  let area = 0;
  for (let i = 0; i < geometry.indices.length; i += 3) {
    const [a, b, c] = Array.from(geometry.indices.slice(i, i + 3)).map((id) => new THREE.Vector3().fromArray(geometry.positions, id * 3));
    const cross = b.sub(a).cross(c.sub(a));
    assert.ok(cross.z < 0);
    area += cross.length() / 2;
  }
  assert.equal(area, 12);
  assert.ok(geometry.triangleToFaceMap.every((id) => id === 10));
  assert.equal(face.indexCount, geometry.indices.length);
});
