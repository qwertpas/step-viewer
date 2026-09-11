import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { stencilRect, clearBodyStencil } from "../src/section-stencil.js";

const bounds = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
const view = new THREE.Vector4(0, 0, 100, 100);
function camera() {
  const result = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  result.position.z = 10;
  result.updateMatrixWorld();
  return result;
}

test("stencil clear covers the full body footprint, not just its section", () => {
  const rect = stencilRect(bounds, camera(), view);
  assert.deepEqual(rect.toArray(), [38, 38, 24, 24]);
  // A narrow cut rectangle could miss this retained-surface pixel.
  const pixel = new THREE.Vector2(59, 59);
  assert.ok(pixel.x >= rect.x && pixel.x < rect.x + rect.z);
  assert.ok(pixel.y >= rect.y && pixel.y < rect.y + rect.w);
});

test("near-plane intersection clears the viewport", () => {
  const eye = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  eye.position.z = 1;
  eye.updateMatrixWorld();
  assert.deepEqual(stencilRect(bounds, eye, view).toArray(), view.toArray());
});

test("body clear is scissored and restores renderer state", () => {
  let scissor = new THREE.Vector4(10, 20, 80, 60);
  let enabled = false;
  let clears = 0;
  const renderer = {
    getViewport: (target) => target.copy(view),
    getScissor: (target) => target.copy(scissor),
    getScissorTest: () => enabled,
    setScissor: (value) => { scissor.copy(value); },
    setScissorTest: (value) => { enabled = value; },
    clearStencil() {
      assert.equal(enabled, true);
      assert.deepEqual(scissor.toArray(), [38, 38, 24, 24]);
      clears++;
    },
  };
  clearBodyStencil(renderer, camera(), bounds);
  assert.equal(clears, 1);
  assert.equal(enabled, false);
  assert.deepEqual(scissor.toArray(), [10, 20, 80, 60]);
});
