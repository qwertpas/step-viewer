import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Matrix4 } from "three";
import { buildParts, faceGeometry, visibleBounds } from "../src/model.js";

const transform = (x) => new Matrix4().makeTranslation(x, 0, 0).toArray();
const color = { r: 0.2, g: 0.5, b: 0.1 };
const faceColor = { r: 0.9, g: 0.1, b: 0.2 };
const geometry = {
  name: "Part", color, positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [], indices: [0, 1, 2],
  faces: [{ firstIndex: 0, indexCount: 3, color: faceColor }],
};
const node = (x) => ({ name: "Part", transform: transform(x), meshes: [0], children: [] });

test("shared geometry retains face colors and independent instance visibility", () => {
  const { parts, root } = buildParts({ geometries: [geometry], rootNodes: [
    { name: "Assembly", transform: transform(10), meshes: [], children: [node(2), node(5)] },
  ] });
  assert.equal(parts.length, 2);
  assert.equal(parts[0].surface.geometry, parts[1].surface.geometry);
  assert.deepEqual(root.children[0].children.map((n) => n.meshes), [[0], [1]]);
  const surface = parts[0].surface;
  assert.equal(surface.material[surface.geometry.groups[0].materialIndex].color.r, faceColor.r);
  assert.deepEqual(visibleBounds(parts).min.toArray(), [12, 0, 0]);
  assert.deepEqual(visibleBounds(parts).max.toArray(), [16, 1, 0]);
  parts[1].surface.visible = false;
  assert.deepEqual(visibleBounds(parts).max.toArray(), [13, 1, 0]);
  parts[0].surface.visible = false;
  assert.ok(visibleBounds(parts).isEmpty());
});

test("uncolored faces inherit the part color", () => {
  const { parts } = buildParts({ geometries: [{ ...geometry, faces: [] }], rootNodes: [node(0)] });
  const surface = parts[0].surface;
  assert.equal(surface.material[0].color.g, color.g);
  assert.equal(surface.geometry.groups[0].count, 3);
  assert.equal(surface.geometry.getAttribute("normal").count, 3);
});

test("merged draw groups preserve face and edge identities", () => {
  const source = {
    ...geometry, id: "geo_0", indices: [0, 1, 2, 0, 2, 1], triangleToFaceMap: [4, 9],
    faces: [{ id: 4, firstIndex: 0, indexCount: 3 }, { id: 9, firstIndex: 3, indexCount: 3 }],
    edges: [{ id: 7, points: [0, 0, 0, 1, 0, 0, 0, 1, 0] }],
  };
  const { parts } = buildParts({ geometries: [source], rootNodes: [node(0)], exactGeometryBindings: [{ geometryId: "geo_0", exactShapeHandle: 23 }] });
  assert.deepEqual(parts[0].surface.geometry.groups, [{ start: 0, count: 6, materialIndex: 0 }]);
  assert.deepEqual(parts[0].data.triangleToFaceMap, [4, 9]);
  assert.deepEqual(parts[0].edgeIds, [7, 7]);
  assert.equal(parts[0].handle, 23);
  assert.equal(parts[0].edge.geometry.getAttribute("position").count, 4);
});

test("accelerated picking preserves CAD triangle IDs without copying or reordering transferred buffers", () => {
  const sphere = new THREE.SphereGeometry(2, 40, 20);
  const source = {
    ...geometry, positions: sphere.attributes.position.array, normals: sphere.attributes.normal.array,
    indices: new Uint32Array(sphere.index.array), edges: [],
    faces: Array.from({ length: sphere.index.count / 3 }, (_, i) => ({ id: i * 11 + 7, firstIndex: i * 3, indexCount: 3 })),
  };
  source.triangleToFaceMap = source.faces.map((face) => face.id);
  const original = source.indices.slice();
  const { parts } = buildParts({ geometries: [source], rootNodes: [node(0), node(8)] });
  const built = parts[0].surface.geometry;
  assert.equal(built.attributes.position.array, source.positions);
  assert.equal(built.attributes.normal.array, source.normals);
  assert.equal(built.index.array, source.indices);
  assert.deepEqual(source.indices, original);
  assert.equal(built.boundsTree, parts[1].surface.geometry.boundsTree);
  for (const part of parts) for (let i = 1; i <= 16; i++) {
    const target = new THREE.Vector3().setFromMatrixPosition(part.surface.matrixWorld);
    const direction = new THREE.Vector3(Math.sin(i * 2.37), Math.cos(i * 1.73), Math.sin(i * 0.91)).normalize();
    const ray = new THREE.Raycaster(target.clone().addScaledVector(direction, 5), direction.negate());
    ray.firstHitOnly = true;
    const expected = [];
    THREE.Mesh.prototype.raycast.call(part.surface, ray, expected);
    expected.sort((a, b) => a.distance - b.distance);
    const hit = ray.intersectObject(part.surface)[0];
    assert.equal(hit.faceIndex, expected[0].faceIndex);
    assert.ok(Math.abs(hit.distance - expected[0].distance) < 1e-10);
    assert.equal(source.triangleToFaceMap[hit.faceIndex], part.faces.get(hit.faceIndex * 11 + 7).id);
  }
});

test("edge acceleration retains segment-to-CAD-edge identity", () => {
  const edges = Array.from({ length: 50 }, (_, i) => ({ id: i * 13 + 9, points: [i, 0, 0, i, 1, 0, i, 2, 0] }));
  const { parts: [part] } = buildParts({ geometries: [{ ...geometry, edges }], rootNodes: [node(4)] });
  for (let i = 0; i < edges.length; i++) {
    const ray = new THREE.Raycaster(new THREE.Vector3(i + 4, 0.3, 5), new THREE.Vector3(0, 0, -1));
    ray.params.Line.threshold = 0.01;
    const expected = [];
    THREE.LineSegments.prototype.raycast.call(part.edge, ray, expected);
    const hit = ray.intersectObject(part.edge)[0];
    assert.equal(hit.index, expected[0].index);
    assert.equal(part.edgeIds[hit.index / 2], edges[i].id);
  }
});

test("face highlights contain only the selected triangle vertices", () => {
  const source = new THREE.BoxGeometry(2, 2, 2);
  const face = { firstIndex: 6, indexCount: 6 };
  const highlight = faceGeometry(source, face);
  assert.equal(highlight.attributes.position.count, 6);
  for (let i = 0; i < face.indexCount; i++) {
    const expected = new THREE.Vector3().fromBufferAttribute(source.attributes.position, source.index.getX(face.firstIndex + i));
    assert.deepEqual(new THREE.Vector3().fromBufferAttribute(highlight.attributes.position, i), expected);
  }
  assert.notEqual(highlight.attributes.position.array.buffer, source.attributes.position.array.buffer);
});

test("cached instance bounds preserve exact fit extents for rotated meshes", () => {
  const matrix = new THREE.Matrix4().makeRotationZ(Math.PI / 4).setPosition(3, 5, 7);
  const { parts: [part] } = buildParts({ geometries: [geometry], rootNodes: [{ ...node(0), transform: matrix.toArray() }] });
  assert.deepEqual(visibleBounds([part]), new THREE.Box3().setFromObject(part.surface, true));
  assert.equal(part.surface.matrixAutoUpdate, false);
});
