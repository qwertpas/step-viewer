import test from "node:test";
import assert from "node:assert/strict";
import { Matrix4 } from "three";
import { buildParts, visibleBounds } from "../src/model.js";

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
