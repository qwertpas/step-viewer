import * as THREE from "three";
import { axisPosition, pickSurfaces, worldPlane } from "./section-math.js";

export function setupSection({ scene, camera, canvas, controls, getParts, queryPlane, redraw, onEdit }) {
  const button = document.querySelector("#section");
  const panel = document.querySelector("#section-panel");
  const hint = document.querySelector("#section-hint");
  const offsetInput = document.querySelector("#section-offset");
  const fields = document.querySelector("#section-fields");
  const planes = [];
  const plane = new THREE.Plane();
  const normal = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const cache = new Map();
  let active = false;
  let editing = false;
  let picking = false;
  let choosing = false;
  let flipped = false;
  let offset = 0;
  let size = 1;
  let version = 0;
  let hoverKey = "";
  let down;
  let drag;

  const hover = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    color: 0x176ff2, opacity: 0.4, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, clippingPlanes: planes,
  }));
  hover.visible = false;
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    color: 0x176ff2, opacity: 0.1, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  const border = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.5, -0.5, 0), new THREE.Vector3(0.5, -0.5, 0),
    new THREE.Vector3(0.5, 0.5, 0), new THREE.Vector3(-0.5, 0.5, 0),
  ]), new THREE.LineBasicMaterial({ color: 0x176ff2, transparent: true, opacity: 0.6 }));
  overlay.add(border);
  const arrow = new THREE.Group();
  for (const direction of [1, -1]) {
    const half = new THREE.ArrowHelper(new THREE.Vector3(0, direction, 0), new THREE.Vector3(), 1, 0x176ff2, 0.22, 0.16);
    half.traverse((item) => { if (item.material) { item.material.depthTest = false; item.material.depthWrite = false; item.renderOrder = 10; } });
    arrow.add(half);
  }
  overlay.visible = arrow.visible = false;

  const stencil = new THREE.Group();
  const stencilMaterial = new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: false, depthTest: false, clippingPlanes: planes,
    stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc,
  });
  const back = stencilMaterial.clone();
  back.side = THREE.BackSide;
  back.stencilFail = back.stencilZFail = back.stencilZPass = THREE.IncrementWrapStencilOp;
  const front = stencilMaterial.clone();
  front.side = THREE.FrontSide;
  front.stencilFail = front.stencilZFail = front.stencilZPass = THREE.DecrementWrapStencilOp;
  // Material.clone copies the plane list; keep the live list shared.
  back.clippingPlanes = front.clippingPlanes = planes;
  stencilMaterial.dispose();
  const cap = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    color: 0xe3b877, side: THREE.DoubleSide, stencilWrite: true, stencilRef: 0,
    stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ReplaceStencilOp,
    stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
  }));
  cap.renderOrder = 3;
  cap.visible = stencil.visible = false;
  scene.add(stencil, cap, overlay, arrow, hover);

  function sync(writeOffset = true) {
    plane.setFromNormalAndCoplanarPoint(normal.clone().multiplyScalar(flipped ? 1 : -1), origin.clone().addScaledVector(normal, offset));
    for (const item of [cap, overlay, arrow]) item.position.copy(origin).addScaledVector(normal, offset);
    cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    overlay.quaternion.copy(cap.quaternion);
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    cap.scale.setScalar(size * 2);
    overlay.scale.setScalar(size);
    if (writeOffset) offsetInput.value = String(Number(offset.toFixed(4)));
    redraw();
  }

  function hideHover() { hover.visible = false; hoverKey = ""; version++; redraw(); }
  function stopDrag() {
    if (!drag) return;
    if (canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = null;
    controls.enabled = true;
  }
  function edit(value) {
    stopDrag();
    editing = value;
    picking = value && !active;
    panel.hidden = !value;
    fields.hidden = !active;
    overlay.visible = arrow.visible = value && active;
    button.classList.toggle("active", active || value);
    button.setAttribute("aria-pressed", String(active || value));
    hint.textContent = picking ? "Click a planar face" : "Drag the arrow · offset in mm";
    hideHover();
    onEdit(value);
    redraw();
  }
  function clear() {
    active = false;
    planes.length = 0;
    cap.visible = stencil.visible = false;
    offset = 0;
    edit(false);
  }
  function setRay(event) {
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera);
    ray.params.Line.threshold = camera.position.distanceTo(arrow.position) * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / rect.height * 8;
  }
  function pick(event) {
    setRay(event);
    const hit = pickSurfaces(ray, getParts(), planes).hit;
    if (!hit) return null;
    const part = getParts()[hit.object.userData.partIndex];
    const id = part.data.triangleToFaceMap[hit.faceIndex];
    const key = `${part.handle}:${id}`;
    if (!cache.has(key)) cache.set(key, queryPlane({
      handle: part.handle, id, point: part.surface.worldToLocal(hit.point.clone()).toArray(),
    }).catch((error) => { cache.delete(key); throw error; }));
    return { hit, part, id, key: `${hit.object.userData.partIndex}:${id}`, data: cache.get(key) };
  }
  function paintFace(picked) {
    hover.geometry.dispose();
    hover.geometry = new THREE.BufferGeometry();
    hover.geometry.setAttribute("position", picked.part.surface.geometry.getAttribute("position").clone());
    const face = picked.part.data.faces.find((face) => face.id === picked.id);
    hover.geometry.setIndex(new THREE.BufferAttribute(picked.part.surface.geometry.index.array.slice(face.firstIndex, face.firstIndex + face.indexCount), 1));
    hover.matrix.copy(picked.part.surface.matrix);
    hover.matrixAutoUpdate = false;
    hover.visible = true;
    redraw();
  }
  async function choose(event) {
    const picked = pick(event);
    if (!picked) return;
    const request = ++version;
    choosing = true;
    try {
      const data = await picked.data;
      if (!editing || request !== version) return;
      if (!data.planar) { hint.textContent = "Choose a flat face, not a curved surface"; return; }
      const exact = worldPlane(data, picked.part.transform);
      normal.copy(exact.normal);
      exact.projectPoint(picked.hit.point, origin);
      offset = 0;
      flipped = false;
      active = true;
      planes.splice(0, planes.length, plane);
      cap.visible = stencil.visible = true;
      sync();
      edit(true);
    } catch (error) { if (request === version) hint.textContent = error.message; }
    finally { choosing = false; }
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!editing || button.disabled || event.button !== 0) return;
    down = { x: event.clientX, y: event.clientY };
    if (picking || !active) return;
    setRay(event);
    if (!ray.intersectObject(arrow, true).length) return;
    event.stopImmediatePropagation();
    const position = axisPosition(ray.ray, origin, normal);
    if (position === null) { hint.textContent = "Rotate the view or enter an offset"; return; }
    drag = { id: event.pointerId, position, offset };
    controls.enabled = false;
    canvas.setPointerCapture(event.pointerId);
  }, true);
  canvas.addEventListener("pointermove", async (event) => {
    if (!editing || button.disabled) return;
    if (drag) {
      event.stopImmediatePropagation();
      setRay(event);
      const position = axisPosition(ray.ray, origin, normal);
      if (position !== null) { offset = drag.offset + position - drag.position; sync(); }
      return;
    }
    if (!picking || choosing || event.buttons) return;
    const picked = pick(event);
    if (!picked) { hideHover(); return; }
    if (hoverKey === picked.key) return;
    hoverKey = picked.key;
    hover.visible = false;
    const request = ++version;
    try {
      const data = await picked.data;
      if (request !== version || !picking || !editing) return;
      if (data.planar) paintFace(picked);
      hint.textContent = data.planar ? "Click to use this face" : "Choose a flat face, not a curved surface";
      redraw();
    } catch { if (request === version) hideHover(); }
  }, true);
  canvas.addEventListener("pointerup", (event) => {
    if (!editing || event.button !== 0) return;
    if (drag) { event.stopImmediatePropagation(); stopDrag(); down = null; return; }
    if (picking && down && Math.hypot(event.clientX - down.x, event.clientY - down.y) <= 4) choose(event);
    down = null;
  }, true);
  canvas.addEventListener("pointercancel", stopDrag);
  canvas.addEventListener("lostpointercapture", stopDrag);
  canvas.addEventListener("pointerleave", () => { if (!drag && !choosing) hideHover(); });
  button.addEventListener("click", () => edit(!editing));
  offsetInput.addEventListener("input", () => {
    if (!active || !Number.isFinite(offsetInput.valueAsNumber)) return;
    offset = offsetInput.valueAsNumber;
    sync(false);
  });
  document.querySelector("#section-flip").addEventListener("click", () => { flipped = !flipped; sync(); });
  document.querySelector("#section-pick").addEventListener("click", () => { picking = true; arrow.visible = overlay.visible = false; hint.textContent = "Click a planar face"; hideHover(); });
  document.querySelector("#section-done").addEventListener("click", () => edit(false));
  document.querySelector("#section-clear").addEventListener("click", clear);
  window.addEventListener("keydown", (event) => {
    if (editing && event.key === "Escape") { event.stopImmediatePropagation(); edit(false); }
  }, true);

  return {
    planes,
    get editing() { return editing; },
    reset() { clear(); cache.clear(); stencil.clear(); },
    setParts() {
      const box = new THREE.Box3();
      for (const part of getParts()) {
        box.union(new THREE.Box3().setFromObject(part.surface, true));
        for (const material of [...part.surface.material, part.edge.material]) material.clippingPlanes = planes;
        for (const [index, material] of [back, front].entries()) {
          const mesh = new THREE.Mesh(part.surface.geometry, material);
          mesh.matrix.copy(part.surface.matrix);
          mesh.matrixAutoUpdate = false;
          mesh.renderOrder = index + 1;
          mesh.userData.part = part;
          stencil.add(mesh);
        }
      }
      size = Math.max(box.getSize(new THREE.Vector3()).length(), 1);
    },
    update() {
      if (!active) return;
      for (const mesh of stencil.children) mesh.visible = mesh.userData.part.surface.visible;
      const scale = camera.position.distanceTo(arrow.position) * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / canvas.clientHeight * 48;
      arrow.scale.setScalar(scale);
    },
  };
}
