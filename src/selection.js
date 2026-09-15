import * as THREE from "three";
import { kept, pickSurfaces } from "./section-math.js";
import { faceGeometry } from "./model.js";

export function setupSelection({ scene, camera, canvas, getParts, getPlanes, blocked, measure, setVisible, onSelect, redraw }) {
  const button = document.querySelector("#measure");
  const panel = document.querySelector("#selection-panel");
  const heading = document.querySelector("#selection-title");
  const result = document.querySelector("#selection-result");
  const hint = document.querySelector("#selection-hint");
  const label = document.querySelector("#dimension-label");
  const highlights = new THREE.Group();
  const hover = new THREE.Group();
  const dimensions = new THREE.Group();
  scene.add(highlights, hover, dimensions);
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let mode = false;
  let selectedParts = [];
  let selectionName = "";
  let refs = [];
  let version = 0;
  let anchor = null;
  let down = null;
  let hovered = "";
  let moveFrame = 0;

  function clearGroup(group) {
    for (const item of group.children) {
      if (!item.userData.sharedGeometry) item.geometry.dispose();
      item.material.dispose();
    }
    group.clear();
    redraw();
  }

  function clearDimension() {
    clearGroup(dimensions);
    anchor = null;
    label.hidden = true;
  }

  function overlay(ref, group, color) {
    const part = getParts()[ref.part];
    if (!part?.surface.visible) return;
    let object;
    if (ref.kind === "edge") {
      const edge = part.data.edges.find((edge) => edge.id === ref.id);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(edge.points, 3));
      object = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, depthTest: false }));
    } else {
      const geometry = ref.kind === "face" ? faceGeometry(part.surface.geometry, part.faces.get(ref.id)) : part.surface.geometry;
      object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: ref.kind === "part" ? 0.2 : 0.4,
        depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
      }));
      object.userData.sharedGeometry = ref.kind === "part";
    }
    object.applyMatrix4(new THREE.Matrix4().fromArray(part.transform));
    object.matrixAutoUpdate = false;
    object.material.clippingPlanes = getPlanes();
    object.renderOrder = 2;
    group.add(object);
  }

  function paint() {
    clearGroup(highlights);
    for (const part of selectedParts) overlay({ part, kind: "part" }, highlights, 0x176ff2);
    refs.forEach((ref, index) => overlay(ref, highlights, index ? 0xf59e0b : 0x176ff2));
    onSelect(selectedParts);
  }

  function line(a, b, text) {
    const points = [new THREE.Vector3(...a), new THREE.Vector3(...b)];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    dimensions.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x145bd7, depthTest: false })));
    const dots = new THREE.Points(geometry.clone(), new THREE.PointsMaterial({ color: 0x145bd7, size: 7, sizeAttenuation: false, depthTest: false }));
    dimensions.add(dots);
    dimensions.children.forEach((item) => { item.material.clippingPlanes = getPlanes(); });
    anchor = points[0].clone().add(points[1]).multiplyScalar(0.5);
    label.textContent = text;
    label.hidden = false;
    redraw();
  }

  const format = (value) => value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  const world = (point, ref) => new THREE.Vector3(...point).applyMatrix4(new THREE.Matrix4().fromArray(getParts()[ref.part].transform));

  async function updateMeasurement() {
    const request = ++version;
    clearDimension();
    panel.hidden = false;
    result.hidden = false;
    heading.textContent = "Measure · exact CAD";
    hint.textContent = "Click a face or edge · Shift-click a second · Esc clears";
    if (!refs.length) {
      result.textContent = "Select a face or edge";
      return;
    }
    result.textContent = "Measuring…";
    const selection = refs.slice();
    try {
      const data = await measure(selection.map((ref) => ({
        handle: getParts()[ref.part].handle, kind: ref.kind, id: ref.id,
        transform: getParts()[ref.part].transform,
      })));
      if (request !== version) return;
      if (data.distance) {
        const text = `${format(data.distance.value)} mm`;
        result.textContent = `Minimum distance: ${text}`;
        line(data.distance.pointA, data.distance.pointB, text);
        if (data.centers) {
          const a = world(data.centers[0].localCenter, selection[0]);
          const b = world(data.centers[1].localCenter, selection[1]);
          result.textContent += `\nCenter distance: ${format(a.distanceTo(b))} mm`;
        }
      } else if (data.radius) {
        const radius = data.radius;
        result.textContent = `Diameter: ${format(radius.diameter)} mm\nRadius: ${format(radius.radius)} mm`;
        const a = world(radius.localAnchorPoint, selection[0]);
        const center = world(radius.localCenter, selection[0]);
        const b = center.clone().multiplyScalar(2).sub(a);
        line(a.toArray(), b.toArray(), `Ø ${format(radius.diameter)} mm`);
      } else if (data.length) {
        const text = `${format(data.length.value)} mm`;
        result.textContent = `Edge length: ${text}`;
        line(world(data.length.localStartPoint, selection[0]).toArray(), world(data.length.localEndPoint, selection[0]).toArray(), text);
      } else if (data.area) result.textContent = `Face area: ${format(data.area.value)} mm²`;
    } catch (error) {
      if (request === version) result.textContent = error.message;
    }
  }

  function showParts() {
    panel.hidden = !selectedParts.length;
    if (!selectedParts.length) return;
    const parts = selectedParts.map((index) => getParts()[index]);
    const hidden = parts.filter((part) => !part.surface.visible).length;
    heading.textContent = selectionName || parts[0].name;
    result.textContent = parts.length === 1
      ? (hidden ? "Hidden" : "")
      : `${parts.length} parts${hidden ? ` · ${hidden} hidden` : ""}`;
    result.hidden = !result.textContent;
    hint.textContent = "V toggles visibility · M measures · Esc clears";
  }

  function clear() {
    version++;
    refs = [];
    selectedParts = [];
    selectionName = "";
    clearDimension();
    clearGroup(hover);
    hovered = "";
    paint();
    if (mode) updateMeasurement();
    else panel.hidden = true;
  }

  function setMode(value) {
    mode = value;
    button.classList.toggle("active", mode);
    button.setAttribute("aria-pressed", String(mode));
    canvas.classList.toggle("measuring", mode);
    clear();
  }

  function pick(event, measuring) {
    const parts = getParts();
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const { hit, limit } = pickSurfaces(ray, parts, getPlanes());
    if (!measuring) return hit ? { part: hit.object.userData.partIndex, kind: "part" } : null;
    const distance = hit?.distance || camera.position.distanceTo(new THREE.Box3().setFromObject(highlights).getCenter(new THREE.Vector3()));
    ray.params.Line.threshold = Math.max(distance, 1) * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / rect.height * 6;
    const candidates = hit ? [parts[hit.object.userData.partIndex].edge] : parts.filter((part) => part.surface.visible).map((part) => part.edge);
    const edgeHits = ray.intersectObjects(candidates, false);
    const edgeHit = edgeHits.find((edge) => kept(edge.point, getPlanes()) && edge.distance <= limit + ray.params.Line.threshold && (!hit || edge.distance <= hit.distance + ray.params.Line.threshold * 2));
    if (edgeHit) {
      const part = edgeHit.object.userData.partIndex;
      return { part, kind: "edge", id: parts[part].edgeIds[Math.floor(edgeHit.index / 2)] };
    }
    if (!hit) return null;
    const part = hit.object.userData.partIndex;
    return { part, kind: "face", id: parts[part].data.triangleToFaceMap[hit.faceIndex] };
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!blocked() && event.button === 0) down = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointerup", (event) => {
    if (blocked() || !down || event.button !== 0) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    down = null;
    if (moved > 4 || button.disabled) return;
    if (event.shiftKey && !mode) setMode(true);
    const picked = pick(event, mode);
    if (!picked) { clear(); return; }
    if (mode) {
      const same = (ref) => ref.part === picked.part && ref.kind === picked.kind && ref.id === picked.id;
      if (!event.shiftKey) refs = [picked];
      else if (refs.some(same)) refs = refs.filter((ref) => !same(ref));
      else refs = [...refs.slice(-1), picked];
      updateMeasurement();
    } else {
      selectedParts = [picked.part];
      selectionName = "";
      showParts();
    }
    paint();
  });
  canvas.addEventListener("pointercancel", () => { down = null; });
  canvas.addEventListener("pointermove", (event) => {
    if (blocked() || event.buttons || button.disabled || moveFrame) return;
    moveFrame = requestAnimationFrame(() => {
      moveFrame = 0;
      if (blocked()) return;
      const picked = pick(event, mode || event.shiftKey);
      const key = JSON.stringify(picked);
      if (key === hovered) return;
      hovered = key;
      clearGroup(hover);
      if (picked) overlay(picked, hover, 0x57a2ff);
    });
  });
  canvas.addEventListener("pointerleave", () => { clearGroup(hover); hovered = ""; });
  button.addEventListener("click", () => setMode(!mode));
  document.querySelector("#clear-selection").addEventListener("click", clear);
  window.addEventListener("keydown", (event) => {
    if (blocked()) return;
    if (event.target.closest("input, textarea, select, [contenteditable='true']") || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    if (event.key === "Escape") clear();
    if (button.disabled) return;
    if (event.key.toLowerCase() === "m") setMode(!mode);
    if (event.key.toLowerCase() === "v" && selectedParts.length) {
      event.preventDefault();
      const allVisible = selectedParts.every((index) => getParts()[index].surface.visible);
      setVisible(selectedParts, !allVisible);
    }
  });

  return {
    reset: () => setMode(false),
    selectParts(indices, name) {
      if (blocked() || button.disabled) return;
      setMode(false);
      selectedParts = [...new Set(indices)].filter((index) => getParts()[index]);
      selectionName = name;
      paint();
      showParts();
    },
    visibilityChanged() {
      clearGroup(hover);
      hovered = "";
      if (refs.some((ref) => !getParts()[ref.part]?.surface.visible)) {
        refs = refs.filter((ref) => getParts()[ref.part]?.surface.visible);
        updateMeasurement();
      }
      paint();
      if (!mode) showParts();
    },
    update() {
      if (!anchor) return;
      const point = anchor.clone().project(camera);
      label.hidden = !kept(anchor, getPlanes()) || point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
      const rect = canvas.getBoundingClientRect();
      label.style.left = `${rect.left + (point.x + 1) * rect.width / 2}px`;
      label.style.top = `${rect.top + (1 - point.y) * rect.height / 2 - 12}px`;
    },
  };
}
