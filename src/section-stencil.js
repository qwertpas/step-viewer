import * as THREE from "three";

const point = new THREE.Vector3();
const viewport = new THREE.Vector4();
const previous = new THREE.Vector4();
const rectangle = new THREE.Vector4();

export function stencilRect(bounds, camera, view, target = new THREE.Vector4()) {
  let minX = 1, minY = 1, maxX = -1, maxY = -1;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    point.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    // Perspective bounds crossing the near plane can project beyond every corner.
    if (point.z >= -camera.near) return target.copy(view);
    point.applyMatrix4(camera.projectionMatrix);
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
  }
  const left = Math.max(view.x, Math.floor(view.x + (minX + 1) * view.z / 2) - 2);
  const bottom = Math.max(view.y, Math.floor(view.y + (minY + 1) * view.w / 2) - 2);
  const right = Math.min(view.x + view.z, Math.ceil(view.x + (maxX + 1) * view.z / 2) + 2);
  const top = Math.min(view.y + view.w, Math.ceil(view.y + (maxY + 1) * view.w / 2) + 2);
  return target.set(left, bottom, Math.max(0, right - left), Math.max(0, top - bottom));
}

export function clearBodyStencil(renderer, camera, bounds) {
  stencilRect(bounds, camera, renderer.getViewport(viewport), rectangle);
  if (!rectangle.z || !rectangle.w) return;
  renderer.getScissor(previous);
  const enabled = renderer.getScissorTest();
  renderer.setScissor(rectangle);
  renderer.setScissorTest(true);
  renderer.clearStencil();
  renderer.setScissor(previous);
  renderer.setScissorTest(enabled);
}
