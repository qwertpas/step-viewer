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
    const selection = setupSelection({
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
    assert.deepEqual(selected, [0]);
    assert.equal(elements.get("#selection-result").hidden, true);
    const highlights = scene.children.find((item) => item.isGroup);
    assert.equal(highlights.children[0].geometry, parts[0].surface.geometry);
    elements.get("#clear-selection").events.click();
    assert.equal(disposed, 0);
    elements.get("#measure").events.click();
    click();
    await new Promise(setImmediate);
    assert.equal(elements.get("#selection-result").hidden, false);
    assert.deepEqual(measured, [{ handle: 17, kind: "face", id: 29, transform }]);
    assert.notEqual(highlights.children[0].geometry, parts[0].surface.geometry);
    elements.get("#clear-selection").events.click();
    assert.equal(disposed, 0);
    click();
    selection.selectParts([0], "Tree part");
    await new Promise(setImmediate);
    assert.equal(elements.get("#selection-title").textContent, "Tree part");
    assert.equal(elements.get("#selection-result").hidden, true);
    assert.equal(elements.get("#selection-result").textContent, "");
    assert.equal(highlights.children[0].geometry, parts[0].surface.geometry);
  } finally {
    if (previous.document) globalThis.document = previous.document;
    else delete globalThis.document;
    if (previous.window) globalThis.window = previous.window;
    else delete globalThis.window;
  }
});

test("tree selection highlights subtrees, toggles their visibility, and clears without disposing shared geometry", () => {
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
    const geometry = new THREE.BoxGeometry();
    const parts = [0, 1, 2].map((index) => ({
      name: `Part ${index}`, surface: new THREE.Mesh(geometry),
      transform: new THREE.Matrix4().makeTranslation(index * 3, 0, 0).toArray(),
    }));
    parts[1].surface.visible = false;
    const scene = new THREE.Scene();
    let selected, locked = false, disposed = 0;
    geometry.addEventListener("dispose", () => disposed++);
    const selection = setupSelection({
      scene, camera: new THREE.PerspectiveCamera(), canvas: element(),
      getParts: () => parts, getPlanes: () => [], blocked: () => locked,
      onSelect: (indices) => { selected = indices; }, redraw() {}, measure() {},
      setVisible(indices, visible) {
        for (const index of indices) parts[index].surface.visible = visible;
        selection.visibilityChanged();
      },
    });
    const highlights = scene.children[0];
    const key = (key) => window.events.keydown({ key, target: { closest() { return null; } }, preventDefault() {} });
    selection.selectParts([0, 1, 1], "Subassembly");
    assert.deepEqual(selected, [0, 1]);
    assert.equal(highlights.children.length, 1);
    assert.equal(highlights.children[0].geometry, geometry);
    assert.equal(elements.get("#selection-title").textContent, "Subassembly");
    assert.equal(elements.get("#selection-result").textContent, "2 parts · 1 hidden");
    key("v");
    assert.equal(highlights.children.length, 2);
    assert.equal(highlights.children[1].matrix.elements[12], 3);
    key("v");
    assert.equal(highlights.children.length, 0);
    assert.equal(parts[2].surface.visible, true);
    assert.deepEqual(selected, [0, 1]);
    selection.selectParts([2], "Part 2");
    assert.deepEqual(selected, [2]);
    assert.equal(highlights.children.length, 1);
    assert.equal(elements.get("#selection-result").hidden, true);
    assert.equal(elements.get("#selection-result").textContent, "");
    locked = true;
    selection.selectParts([0], "Blocked");
    assert.deepEqual(selected, [2]);
    locked = false;
    key("Escape");
    assert.deepEqual(selected, []);
    assert.equal(highlights.children.length, 0);
    assert.equal(elements.get("#selection-panel").hidden, true);
    assert.equal(disposed, 0);
  } finally {
    if (previous.document) globalThis.document = previous.document;
    else delete globalThis.document;
    if (previous.window) globalThis.window = previous.window;
    else delete globalThis.window;
  }
});
