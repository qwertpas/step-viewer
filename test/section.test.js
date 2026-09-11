import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import OcctJS from "@tx-code/occt-js";
import { facePlane } from "../src/cad.js";
import { axisPosition, kept, pickSurfaces, worldPlane } from "../src/section-math.js";

test("section axes stay fixed and transform with the CAD instance", () => {
  const transform = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(10, 20, 30);
  const plane = worldPlane({ point: [0, 0, 2], normal: [0, 0, 1] }, transform.toArray());
  assert.ok(plane.normal.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-10);
  assert.ok(Math.abs(plane.distanceToPoint(new THREE.Vector3(12, 20, 30))) < 1e-10);
  const ray = new THREE.Ray(new THREE.Vector3(5, 3, 10), new THREE.Vector3(0, 0, -1));
  assert.equal(axisPosition(ray, new THREE.Vector3(), new THREE.Vector3(1, 0, 0)), 5);
  assert.equal(axisPosition(ray, new THREE.Vector3(), new THREE.Vector3(0, 0, 1)), null);
});

test("clipped surfaces and opaque caps block selection, including holes between parts", () => {
  const surface = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial()));
  surface.updateMatrixWorld();
  const parts = [{ surface }];
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
  const planes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)];
  assert.equal(pickSurfaces(ray, parts, []).hit.distance, 4);
  assert.equal(pickSurfaces(ray, parts, planes).hit, undefined);
  assert.equal(pickSurfaces(ray, parts, planes).limit, 5);
  assert.ok(surface.material.every((material) => material.side === THREE.FrontSide));
  assert.equal(kept(new THREE.Vector3(0, 0, 1), planes), false);
  ray.ray.origin.x = 2;
  assert.equal(pickSurfaces(ray, parts, planes).limit, Infinity);
  surface.visible = false;
  ray.ray.origin.x = 0;
  assert.equal(pickSurfaces(ray, parts, planes).limit, Infinity);
});

test("section planes use retained CAD, and curved faces are rejected", async () => {
  const occt = await OcctJS();
  const model = occt.OpenExactRevolvedShape({
    version: 1, units: "mm",
    profile: { plane: "XZ", closure: "explicit", start: [0, 0], segments: [[5, 0], [5, 20], [0, 20], [0, 0]].map((end) => ({ kind: "line", end })) },
    revolve: { angleDeg: 360 },
  }, {});
  try {
    const handle = model.exactGeometryBindings[0].exactShapeHandle;
    const geometry = model.geometries[0];
    geometry.positions.fill(999);
    let flat = 0;
    let curved = 0;
    for (const face of geometry.faces) {
      const data = facePlane(occt, model.exactModelId, { handle, id: face.id, point: [1, 1, 7] });
      if (!data.planar) { curved++; continue; }
      flat++;
      assert.ok(Math.abs(Math.abs(data.normal[2]) - 1) < 1e-10);
      assert.ok(Math.abs(data.point[2]) < 1e-10 || Math.abs(data.point[2] - 20) < 1e-10);
    }
    assert.equal(flat, 2);
    assert.equal(curved, 1);
  } finally { occt.ReleaseExactModel(model.exactModelId); }
});
