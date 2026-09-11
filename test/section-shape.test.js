import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { sectionShape } from "../src/section-shape.js";

function area(shape) {
  let result = 0;
  const p = shape.fill;
  for (let i = 0; i < p.length; i += 9) result += Math.abs((p[i + 3] - p[i]) * (p[i + 7] - p[i + 1]) - (p[i + 6] - p[i]) * (p[i + 4] - p[i + 1])) / 2;
  return result;
}

test("section is opaque geometry regardless of source normals or winding", () => {
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const normal = geometry.getAttribute("normal");
  normal.array.fill(0);
  for (let i = 0; i < geometry.index.count; i += 6) {
    const a = geometry.index.getX(i);
    geometry.index.setX(i, geometry.index.getX(i + 1));
    geometry.index.setX(i + 1, a);
  }
  const shape = sectionShape(geometry, new THREE.Matrix4());
  assert.equal(shape.open, 0);
  assert.equal(shape.loops, 1);
  assert.equal(area(shape), 4);
  assert.ok(shape.edges.length > 0);
});

test("cut contours preserve cavities", () => {
  const profile = new THREE.Shape();
  profile.moveTo(-3, -3); profile.lineTo(3, -3); profile.lineTo(3, 3); profile.lineTo(-3, 3); profile.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-1, -1); hole.lineTo(-1, 1); hole.lineTo(1, 1); hole.lineTo(1, -1); hole.closePath();
  profile.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(profile, { depth: 2, bevelEnabled: false });
  const shape = sectionShape(geometry, new THREE.Matrix4().makeTranslation(0, 0, -1));
  assert.equal(shape.open, 0);
  assert.equal(shape.loops, 2);
  assert.equal(area(shape), 32);
  const fill = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(shape.fill, 3));
  const mesh = new THREE.Mesh(fill, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
  assert.equal(ray.intersectObject(mesh).length, 0, "the real hole stays open");
  ray.ray.origin.x = 2;
  assert.ok(ray.intersectObject(mesh).length > 0, "solid section writes depth");
});

test("tiny independently tessellated face seams join without changing the cut", () => {
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < 4; i++) position.setY(i, position.getY(i) + 5e-7);
  const shape = sectionShape(geometry, new THREE.Matrix4());
  assert.equal(shape.open, 0);
  assert.equal(shape.loops, 1);
  assert.ok(Math.abs(area(shape) - 4) < 1e-5);
});
