import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import OcctJS from "@tx-code/occt-js";
import { facePlane } from "../src/cad.js";
import { axisPosition, cutBounds, kept, pickSurfaces, worldPlane } from "../src/section-math.js";
import { capMaterial } from "../src/section.js";

test("cut fills retain each body's color and lighting without changing its material", () => {
  for (const color of [0x167a61, 0x873ec4, 0x386bd2]) {
    const source = new THREE.MeshStandardMaterial({ color, metalness: 0.08, roughness: 0.52 });
    source.clippingPlanes = [new THREE.Plane()];
    const part = { data: { color: {} }, surface: new THREE.Mesh(new THREE.BoxGeometry(), [source]) };
    const cap = capMaterial(part);
    assert.notEqual(cap, source);
    assert.equal(cap.color.getHex(), color);
    assert.equal(cap.isMeshStandardMaterial, true);
    assert.equal(cap.roughness, source.roughness);
    assert.equal(cap.clippingPlanes, null);
    assert.equal(cap.stencilWrite, true);
    assert.equal(source.stencilWrite, false);
    assert.equal(source.clippingPlanes.length, 1);
    cap.dispose();
  }
});

test("bodies colored only on faces use their predominant displayed color", () => {
  const geometry = new THREE.BufferGeometry();
  geometry.addGroup(0, 3, 1);
  geometry.addGroup(3, 12, 2);
  geometry.addGroup(15, 6, 1);
  const materials = [0xb7bcc3, 0x167a61, 0x873ec4].map((color) => new THREE.MeshStandardMaterial({ color }));
  const cap = capMaterial({ data: {}, surface: new THREE.Mesh(geometry, materials) });
  assert.equal(cap.color.getHex(), 0x873ec4);
  cap.dispose();
});

test("section passes skip uncut bodies and bound fills to each intersected body", () => {
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -5);
  const toPlane = new THREE.Matrix4().makeTranslation(0, 0, -5);
  const box = new THREE.Box3(new THREE.Vector3(1, 2, 3), new THREE.Vector3(4, 6, 8));
  const bounds = cutBounds(box, plane, toPlane);
  assert.ok(bounds.containsPoint(new THREE.Vector2(1, 2)));
  assert.ok(bounds.containsPoint(new THREE.Vector2(4, 6)));
  assert.ok(bounds.getSize(new THREE.Vector2()).x < 3.02);
  assert.equal(cutBounds(box, new THREE.Plane(new THREE.Vector3(0, 0, 1), -9), toPlane), null);
  assert.equal(cutBounds(box, new THREE.Plane(new THREE.Vector3(0, 0, -1), 1), toPlane), null);
});

test("rotated section bounds cover every body corner, independent of flip", () => {
  const normal = new THREE.Vector3(1, 2, 3).normalize();
  const box = new THREE.Box3(new THREE.Vector3(-1, -2, -3), new THREE.Vector3(1, 2, 3));
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  const toPlane = new THREE.Matrix4().makeRotationFromQuaternion(rotation).invert();
  const plane = new THREE.Plane(normal, 0);
  const bounds = cutBounds(box, plane, toPlane);
  assert.deepEqual(cutBounds(box, plane.clone().negate(), toPlane), bounds);
  for (const x of [-1, 1]) for (const y of [-2, 2]) for (const z of [-3, 3]) {
    const point = new THREE.Vector3(x, y, z).applyMatrix4(toPlane);
    assert.ok(bounds.containsPoint(new THREE.Vector2(point.x, point.y)));
  }
});

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
