import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { setupSection } from "../src/section.js";

test("only intersected bodies render section passes; Flip and Clear restore culled bodies", async () => {
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
    const scene = new THREE.Scene();
    const parts = [0, 1, 2].map((index) => {
      const geometry = new THREE.BoxGeometry(2, 2, 2);
      geometry.clearGroups();
      geometry.addGroup(0, geometry.index.count, 0);
      const surface = new THREE.Mesh(geometry, [new THREE.MeshStandardMaterial({ color: [0x167a61, 0x873ec4, 0x386bd2][index] })]);
      surface.position.set((index - 1) * 3, 0, index === 2 ? 5 : 0);
      surface.userData.partIndex = index;
      scene.add(surface);
      scene.updateMatrixWorld(true);
      return {
        surface, edge: new THREE.LineSegments(geometry, new THREE.LineBasicMaterial()),
        data: { color: {}, triangleToFaceMap: Array(12).fill(0) }, handle: index,
        transform: surface.matrix.toArray(),
      };
    });
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const canvas = Object.assign(element(), {
      clientHeight: 100, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    });
    const section = setupSection({
      scene, camera, canvas, controls: { enabled: true }, getParts: () => parts,
      queryPlane: async () => ({ planar: true, point: [0, 0, 1], normal: [0, 0, 1] }),
      redraw() {}, onEdit() {},
    });
    section.setParts();
    elements.get("#section").events.click();
    const event = { button: 0, clientX: 50, clientY: 50 };
    canvas.events.pointerdown(event);
    canvas.events.pointerup(event);
    await new Promise(setImmediate);
    const input = elements.get("#section-offset");
    input.valueAsNumber = -1;
    input.events.input();
    section.update();
    const fills = [];
    const passes = [];
    scene.traverse((item) => {
      if (!item.material?.stencilWrite) return;
      (item.material.colorWrite ? fills : passes).push(item);
    });
    assert.equal(fills.filter((item) => item.visible).length, 2);
    assert.equal(passes.filter((item) => item.visible).length, 4);
    assert.equal(parts[2].surface.layers.mask, 2);
    assert.equal(parts[2].surface.visible, true);
    let clears = 0;
    for (const fill of fills.filter((item) => item.visible)) {
      assert.ok(fill.scale.x < 2.02 && fill.scale.y < 2.02);
      assert.equal(fill.material.color.getHex(), fill.userData.part.surface.material[0].color.getHex());
      fill.onAfterRender({ clearStencil() { clears++; } });
      const preceding = passes.filter((item) => item.userData.part === fill.userData.part);
      assert.deepEqual(preceding.map((item) => item.renderOrder), [fill.renderOrder - 2, fill.renderOrder - 1]);
    }
    assert.equal(clears, 0);
    elements.get("#section-flip").events.click();
    section.update();
    assert.equal(parts[2].surface.layers.mask, 1);
    parts[0].surface.visible = false;
    section.update();
    assert.equal(fills.filter((item) => item.visible).length, 1);
    elements.get("#section-clear").events.click();
    assert.ok(parts.every((part) => part.surface.layers.mask === 1 && part.edge.layers.mask === 1));
    assert.equal(parts[0].surface.visible, false);
    assert.equal(section.planes.length, 0);
    section.reset();
    assert.ok(fills.every((fill) => fill.parent === null));
  } finally {
    if (previous.document) globalThis.document = previous.document;
    else delete globalThis.document;
    if (previous.window) globalThis.window = previous.window;
    else delete globalThis.window;
  }
});
