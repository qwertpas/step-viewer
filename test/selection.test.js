import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildParts } from "../src/model.js";
import { setupSelection } from "../src/selection.js";

test("part and face highlights preserve the model's geometry and exact selection IDs", async () => {
  const element = () => ({
    events: {}, classList: { toggle() {} }, setAttribute() {},
    addEventListener(name, action) { this.events[name] = action; },
  });
  const elements = new Map();
  const previous = { document: globalThis.document, window: globalThis.window };
  globalThis.document = { querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, element());
    return elements.get(selector);
  } };
  globalThis.window = element();
  try {
    const transform = new THREE.Matrix4().toArray();
    const { parts } = buildParts({
      geometries: [{
        id: "body", positions: [-1, -1, 0, 1, -1, 0, 0, 1, 0], normals: [], indices: [0, 1, 2],
        faces: [{ id: 29, firstIndex: 0, indexCount: 3 }], triangleToFaceMap: [29], edges: [],
      }],
      rootNodes: [{ name: "Body", transform, meshes: [0], children: [] }],
      exactGeometryBindings: [{ geometryId: "body", exactShapeHandle: 17 }],
    });
    const scene = new THREE.Scene();
    scene.add(parts[0].surface);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    camera.position.z = 5;
    camera.updateMatrixWorld();
    const canvas = Object.assign(element(), { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) });
    let selected, measured, disposed = 0;
    parts[0].surface.geometry.addEventListener("dispose", () => { disposed++; });
    setupSelection({
      scene, camera, canvas, getParts: () => parts, getPlanes: () => [], blocked: () => false,
      setVisible() {}, redraw() {}, onSelect: (part) => { selected = part; },
      measure: async (refs) => { measured = refs; return { area: { value: 2 } }; },
    });
    const click = () => {
      const event = { button: 0, clientX: 50, clientY: 50 };
      canvas.events.pointerdown(event);
      canvas.events.pointerup(event);
    };
    click();
    assert.equal(selected, 0);
    const highlights = scene.children.find((item) => item.isGroup);
    assert.equal(highlights.children[0].geometry, parts[0].surface.geometry);
    elements.get("#clear-selection").events.click();
    assert.equal(disposed, 0);
    elements.get("#measure").events.click();
    click();
    await new Promise(setImmediate);
    assert.deepEqual(measured, [{ handle: 17, kind: "face", id: 29, transform }]);
    assert.notEqual(highlights.children[0].geometry, parts[0].surface.geometry);
    elements.get("#clear-selection").events.click();
    assert.equal(disposed, 0);
  } finally {
    if (previous.document) globalThis.document = previous.document;
    else delete globalThis.document;
    if (previous.window) globalThis.window = previous.window;
    else delete globalThis.window;
  }
});
