import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildParts, visibleBounds } from "./model.js";
import { visibilityHistory, visibilityKey } from "./visibility.js";
import { CadClient } from "./cad-client.js";
import { setupSelection } from "./selection.js";
import { setupSection } from "./section.js";
import { Drive, readShare, shareUrl } from "./drive.js";
import { setupSharing } from "./share.js";
import { downloadFile, componentTree as exportTree, componentFile } from "./download.js";
import "./style.css";

const app = document.querySelector("#app");
const host = document.querySelector("#canvas");
const openButton = document.querySelector("#open");
const downloadButton = document.querySelector("#download");
let currentFile;
const fileInput = document.querySelector("#file-input");
const empty = document.querySelector("#empty");
const loading = document.querySelector("#loading");
const loadingText = document.querySelector("#loading-text");
const fileName = document.querySelector("#file-name");
const status = document.querySelector("#status");
const statusDot = document.querySelector("#status-dot");
const stats = document.querySelector("#model-stats");
const edgesButton = document.querySelector("#edges");
const dropLayer = document.querySelector("#drop-layer");
const componentsPanel = document.querySelector("#components");
const componentTree = document.querySelector("#component-tree");
const componentCount = document.querySelector("#component-count");
const showAllButton = document.querySelector("#show-all");
const hideAllButton = document.querySelector("#hide-all");
const expandTreeButton = document.querySelector("#expand-tree");
const collapseTreeButton = document.querySelector("#collapse-tree");
const collapseComponentsButton = document.querySelector("#collapse-components");
const drive = new Drive({ clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID, apiKey: import.meta.env.VITE_GOOGLE_API_KEY });
const sharing = setupSharing(drive);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8eaed);

const camera = new THREE.PerspectiveCamera(35, host.clientWidth / host.clientHeight, 0.01, 100000);
camera.up.set(0, 0, 1);
camera.position.set(180, -220, 160);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.localClippingEnabled = true;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(host.clientWidth, host.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
host.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.2;
controls.screenSpacePanning = true;
controls.target.set(0, 0, 25);

scene.add(new THREE.HemisphereLight(0xffffff, 0x65717d, 2.1));
const key = new THREE.DirectionalLight(0xffffff, 3.1);
key.position.set(-220, -180, 360);
scene.add(key);
const fill = new THREE.DirectionalLight(0x9cbcff, 1.4);
fill.position.set(260, 120, 140);
scene.add(fill);

const grid = new THREE.GridHelper(1600, 80, 0xa7abb0, 0xc8cbd0);
grid.rotation.x = Math.PI / 2;
const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
gridMaterials.forEach((material) => {
  material.transparent = true;
  material.opacity = 0.42;
});
scene.add(grid);

const model = new THREE.Group();
const surfaces = new THREE.Group();
const outlines = new THREE.Group();
model.add(surfaces, outlines);
scene.add(model);
let partObjects = [];
let treeEntries = [];
let branchEntries = [];
let loadedMeshes = [];
let nodeIndices = new WeakMap();
let partEntries = new Map();
let selectedParts = new Set();
let cad = new CadClient();
let frame = 0;
function redraw() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    controls.update();
    selection.update();
    section.update();
    renderer.render(scene, camera);
  });
}
const selection = setupSelection({
  scene, camera, canvas: renderer.domElement, getParts: () => partObjects, redraw,
  getPlanes: () => section.planes, blocked: () => section.editing,
  measure: (refs) => cad.request("measure", { refs }),
  setVisible: setPartsVisible,
  onSelect: selectTreeParts,
});
const section = setupSection({
  scene, camera, canvas: renderer.domElement, controls, getParts: () => partObjects, redraw,
  queryPlane: (ref) => cad.request("plane", { ref }),
  onEdit: (editing) => {
    if (editing) selection.reset();
    document.querySelector("#measure").disabled = editing || busy || !partObjects.length;
  },
});

function dispose(group) {
  const geometries = new Set();
  const materials = new Set();
  group.traverse((item) => {
    if (!item.geometry) return;
    geometries.add(item.geometry);
    for (const material of Array.isArray(item.material) ? item.material : [item.material]) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  group.clear();
}

function fitModel() {
  if (!surfaces.children.length) return;
  const box = visibleBounds(partObjects);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const dimensions = box.getSize(new THREE.Vector3());
  const radius = Math.max(dimensions.length() * 0.56, 1);
  const direction = camera.position.clone().sub(controls.target).normalize();
  controls.target.copy(center);
  const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(camera.aspect, 1));
  camera.position.copy(center).addScaledVector(direction, radius / Math.sin(halfFov) * 1.12);
  camera.near = Math.max(radius / 1000, 0.001);
  camera.far = radius * 100;
  camera.updateProjectionMatrix();
  grid.position.z = box.min.z - Math.max(dimensions.z * 0.01, 0.01);
  controls.update();
}

function collectMeshIndices(node) {
  if (nodeIndices.has(node)) return nodeIndices.get(node);
  const indices = [...(node.meshes || [])];
  for (const child of node.children || []) indices.push(...collectMeshIndices(child));
  const unique = [...new Set(indices)];
  nodeIndices.set(node, unique);
  return unique;
}

function updateTreeSelection(entry) {
  const selected = entry.indices.some((index) => selectedParts.has(index));
  entry.row.classList.toggle("selected", selected);
  entry.label.setAttribute("aria-pressed", String(selected));
}

function selectTreeParts(indices) {
  const changed = new Set([...selectedParts, ...indices].flatMap((index) => partEntries.get(index) || []));
  selectedParts = new Set(indices);
  for (const entry of changed) updateTreeSelection(entry);
}

function updateTreeStates(changes) {
  const entries = changes ? new Set(changes.flatMap(({ index }) => partEntries.get(index) || [])) : treeEntries;
  for (const entry of entries) updateTreeEntry(entry);
}

function updateTreeEntry(entry) {
  let shown = 0;
  for (const index of entry.indices) if (partObjects[index]?.surface.visible) shown++;
  const mixed = shown > 0 && shown < entry.indices.length;
  entry.button.classList.toggle("off", shown === 0);
  entry.button.classList.toggle("mixed", mixed);
  entry.button.setAttribute("aria-pressed", mixed ? "mixed" : String(shown > 0));
  entry.button.title = `${shown === entry.indices.length ? "Hide" : "Show"} ${entry.name}`;
  entry.button.setAttribute("aria-label", entry.button.title);
}

const visibility = visibilityHistory(() => partObjects, (changes) => {
  updateTreeStates(changes);
  selection.visibilityChanged();
  redraw();
});
const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
window.addEventListener("keydown", (event) => {
  if (!busy) visibilityKey(event, visibility, mac);
});

function setPartsVisible(indices, visible) {
  visibility.set(indices, visible);
}

function makeTreeRow(node, depth, fallbackName) {
  const item = document.createElement("div");
  item.className = "component-item";

  const row = document.createElement("div");
  row.className = "component-row";
  row.style.setProperty("--depth", depth);
  item.appendChild(row);

  const name = node.name?.trim() || fallbackName;
  const nestedChildren = node.children || [];
  const meshChildren = !node.meshLeaf && ((node.meshes || []).length > 1 || (node.meshes?.length && nestedChildren.length))
    ? node.meshes.map((meshIndex, index) => {
        const meshName = loadedMeshes[meshIndex]?.name?.trim();
        return {
          name: meshName && meshName !== name ? meshName : `${name} ${index + 1}`,
          meshes: [meshIndex],
          children: [],
          meshLeaf: true,
        };
      })
    : [];
  const children = [...nestedChildren, ...meshChildren];
  const branch = document.createElement("button");
  branch.className = "branch-button";
  branch.textContent = children.length ? "⌄" : "";
  branch.disabled = !children.length;
  branch.setAttribute("aria-label", children.length ? "Collapse component" : "No child components");
  row.appendChild(branch);

  const indices = collectMeshIndices(node);
  const visibility = document.createElement("button");
  visibility.className = "visibility-button";
  visibility.setAttribute("aria-label", `Hide ${name}`);
  visibility.setAttribute("aria-pressed", "true");
  visibility.innerHTML = "<span></span>";
  visibility.addEventListener("click", () => {
    const allVisible = indices.every((index) => partObjects[index]?.surface.visible);
    setPartsVisible(indices, !allVisible);
  });
  row.appendChild(visibility);

  const icon = document.createElement("span");
  icon.className = children.length ? "assembly-icon" : "part-icon";
  row.appendChild(icon);

  const label = document.createElement("button");
  label.type = "button";
  label.className = "component-name";
  label.textContent = name;
  label.title = `Select ${name}`;
  const select = () => selection.selectParts(indices, name);
  label.addEventListener("click", select);
  row.addEventListener("click", (event) => {
    if (!event.target.closest("button")) select();
  });
  row.appendChild(label);

  if (indices.length > 1) {
    const total = document.createElement("span");
    total.className = "part-total";
    total.textContent = String(indices.length);
    row.appendChild(total);
  }

  const download = document.createElement("button");
  download.className = "component-download";
  download.title = `Download ${name} as STEP`;
  download.setAttribute("aria-label", download.title);
  download.disabled = busy || !indices.length;
  download.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/></svg>';
  download.addEventListener("click", async () => {
    if (busy || sharing.busy) return;
    setBusy(true);
    loadingText.textContent = `Preparing ${name}…`;
    status.textContent = "Exporting STEP…";
    try {
      const bytes = await cad.request("export", { tree: exportTree({ ...node, name }, partObjects) });
      downloadFile(componentFile(bytes, name));
      status.textContent = `STEP ready: ${name}`;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Could not export component";
    } finally {
      setBusy(false);
    }
  });
  row.appendChild(download);

  const entry = { button: visibility, download, label, indices, name, row };
  treeEntries.push(entry);
  for (const index of indices) {
    if (!partEntries.has(index)) partEntries.set(index, []);
    partEntries.get(index).push(entry);
  }
  updateTreeSelection(entry);
  updateTreeEntry(entry);

  if (children.length) {
    const childList = document.createElement("div");
    childList.className = "component-children";
    let mounted = false;
    const mount = () => {
      if (mounted) return;
      mounted = true;
      childList.replaceChildren(...children.map((child, index) => makeTreeRow(child, depth + 1, `Component ${index + 1}`)));
    };
    const startsCollapsed = depth >= 1;
    childList.hidden = startsCollapsed;
    item.appendChild(childList);
    branch.textContent = startsCollapsed ? "›" : "⌄";
    branch.setAttribute("aria-label", startsCollapsed ? "Expand component" : "Collapse component");
    const toggleBranch = () => {
      mount();
      const collapsed = childList.toggleAttribute("hidden");
      branch.textContent = collapsed ? "›" : "⌄";
      branch.setAttribute("aria-label", collapsed ? "Expand component" : "Collapse component");
    };
    branch.addEventListener("click", toggleBranch);
    branchEntries.push({ branch, childList, mount });
    if (!startsCollapsed) mount();
  }
  return item;
}

function buildComponentTree(root, meshes) {
  componentTree.replaceChildren();
  treeEntries = [];
  branchEntries = [];
  nodeIndices = new WeakMap();
  partEntries = new Map();
  selectedParts = new Set();
  loadedMeshes = meshes;
  const referenced = new Set(collectMeshIndices(root));
  const roots = root.name?.trim() || root.meshes?.length ? [root] : (root.children || []);
  roots.forEach((node, index) => componentTree.appendChild(makeTreeRow(node, 0, `Component ${index + 1}`)));

  meshes.forEach((mesh, index) => {
    if (referenced.has(index)) return;
    componentTree.appendChild(makeTreeRow({ name: mesh.name, meshes: [index], children: [] }, 0, `Part ${index + 1}`));
  });
  componentCount.textContent = `${meshes.length} ${meshes.length === 1 ? "part" : "parts"}`;
  componentsPanel.hidden = false;
  componentsPanel.classList.remove("collapsed");
  app.classList.add("has-model");
  app.classList.remove("panel-collapsed");
  collapseComponentsButton.textContent = "−";
  collapseComponentsButton.title = "Collapse panel";
  collapseComponentsButton.setAttribute("aria-expanded", "true");
  updateTreeStates();
}

let busy = false;
const stages = {
  initialize: "Starting CAD reader…", hash: "Checking file…", cache: "Reusing CAD geometry…",
  read: "Reading STEP data…", transfer: "Building CAD geometry…", mesh: "Meshing surfaces…",
  extract: "Preparing faces and edges…", output: "Preparing geometry…", repair: "Checking surfaces…",
  pack: "Preparing display…",
};
function reportProgress(stage) {
  loadingText.textContent = stages[stage];
}
function setBusy(value) {
  busy = value;
  loading.hidden = !value;
  openButton.disabled = value;
  downloadButton.disabled = value || !currentFile;
  for (const entry of treeEntries) entry.download.disabled = value || !entry.indices.length;
  sharing.setLoading(value);
  edgesButton.disabled = value || !surfaces.children.length;
  document.querySelector("#measure").disabled = value || !surfaces.children.length || section.editing;
  document.querySelector("#section").disabled = value || !surfaces.children.length;
}

async function openFile(file, sharedUrl = "") {
  if (busy || sharing.busy) return;
  if (!/\.(step|stp)$/i.test(file.name)) {
    status.textContent = "Please choose a .step or .stp file";
    return;
  }

  for (const entry of performance.getEntriesByType("mark")) if (entry.name.startsWith("cad-")) performance.clearMarks(entry.name);
  for (const entry of performance.getEntriesByType("measure")) if (entry.name.startsWith("cad-")) performance.clearMeasures(entry.name);
  performance.mark("cad-load-start");
  status.textContent = "Opening CAD…";
  reportProgress("initialize");
  empty.hidden = true;
  setBusy(true);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  let preparedId;
  let committed = false;
  try {
    if (cad.error) cad = new CadClient();
    const result = await cad.request("open", { buffer: await file.arrayBuffer() }, reportProgress);
    preparedId = result.exactModelId;
    performance.mark("cad-import-end");
    loadingText.textContent = "Building view…";
    await new Promise(requestAnimationFrame);
    const next = buildParts(result, file.name);
    await cad.request("commit", { modelId: preparedId });
    committed = true;

    selection.reset();
    section.reset();
    visibility.clear();
    dispose(surfaces);
    dispose(outlines);
    let triangles = 0;
    partObjects = next.parts;
    partObjects.forEach((part) => {
      surfaces.add(part.surface);
      outlines.add(part.edge);
      triangles += part.triangles;
    });
    buildComponentTree(next.root, partObjects);
    section.setParts();
    fileName.textContent = file.name;
    fileName.title = file.name;
    outlines.visible = edgesButton.classList.contains("active");
    await new Promise(requestAnimationFrame);
    camera.aspect = host.clientWidth / host.clientHeight;
    fitModel();

    const size = file.size > 1_000_000
      ? `${(file.size / 1_000_000).toFixed(1)} MB`
      : `${Math.max(1, Math.round(file.size / 1000))} KB`;
    status.textContent = `${partObjects.length} ${partObjects.length === 1 ? "part" : "parts"}`;
    statusDot.classList.add("ready");
    stats.innerHTML = `${size}<span></span>${Math.round(triangles).toLocaleString()} triangles`;
    stats.hidden = false;
    currentFile = file;
    sharing.setFile(file, sharedUrl, result.hash);
    if (!sharedUrl && window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
    await new Promise(requestAnimationFrame);
    performance.mark("cad-load-end");
    performance.measure("cad-import", "cad-load-start", "cad-import-end");
    performance.measure("cad-display", "cad-import-end", "cad-load-end");
    performance.measure("cad-load", "cad-load-start", "cad-load-end");
    for (const [stage, duration] of Object.entries(result.timings || {})) {
      if (Number.isFinite(duration)) performance.measure(`cad-${stage}`, { start: 0, duration });
    }
  } catch (error) {
    if (preparedId && !committed && !cad.error) await cad.request("discard", { modelId: preparedId });
    console.error(error);
    status.textContent = error instanceof Error ? error.message : "Could not read this file";
    if (!surfaces.children.length) empty.hidden = false;
  } finally {
    setBusy(false);
  }
}

openButton.addEventListener("click", () => fileInput.click());
downloadButton.addEventListener("click", () => {
  if (!currentFile || busy) return;
  downloadFile(currentFile);
});
empty.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) openFile(file);
  fileInput.value = "";
});

document.querySelector("#fit").addEventListener("click", fitModel);

edgesButton.addEventListener("click", () => {
  const enabled = edgesButton.classList.toggle("active");
  outlines.visible = enabled;
  edgesButton.setAttribute("aria-pressed", String(enabled));
  redraw();
});

showAllButton.addEventListener("click", () => setPartsVisible(partObjects.map((_, index) => index), true));
hideAllButton.addEventListener("click", () => setPartsVisible(partObjects.map((_, index) => index), false));
expandTreeButton.addEventListener("click", () => {
  for (const { branch, childList, mount } of branchEntries) {
    mount();
    childList.hidden = false;
    branch.textContent = "⌄";
    branch.setAttribute("aria-label", "Collapse component");
  }
});
collapseTreeButton.addEventListener("click", () => {
  branchEntries.forEach(({ branch, childList }) => {
    childList.hidden = true;
    branch.textContent = "›";
    branch.setAttribute("aria-label", "Expand component");
  });
});
collapseComponentsButton.addEventListener("click", () => {
  const collapsed = componentsPanel.classList.toggle("collapsed");
  app.classList.toggle("panel-collapsed", collapsed);
  collapseComponentsButton.textContent = collapsed ? "+" : "−";
  collapseComponentsButton.title = collapsed ? "Expand panel" : "Collapse panel";
  collapseComponentsButton.setAttribute("aria-expanded", String(!collapsed));
});

let dragDepth = 0;
app.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  dropLayer.hidden = false;
});
app.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});
app.addEventListener("dragleave", () => {
  dragDepth -= 1;
  if (dragDepth <= 0) {
    dragDepth = 0;
    dropLayer.hidden = true;
  }
});
app.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropLayer.hidden = true;
  const file = event.dataTransfer.files?.[0];
  if (file) openFile(file);
});

new ResizeObserver(() => {
  camera.aspect = host.clientWidth / host.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(host.clientWidth, host.clientHeight);
  redraw();
}).observe(host);

controls.addEventListener("change", redraw);
redraw();

async function loadShared() {
  try {
    const shared = readShare(window.location.hash);
    if (!shared) return;
    empty.hidden = true;
    setBusy(true);
    status.textContent = "Downloading shared CAD…";
    loadingText.textContent = "Downloading shared CAD…";
    const file = await drive.download(shared);
    setBusy(false);
    await openFile(file, shareUrl(window.location.href, shared));
  } catch (error) {
    status.textContent = error.message || "Could not load the shared file.";
    empty.hidden = Boolean(surfaces.children.length);
  } finally {
    setBusy(false);
  }
}
loadShared();
// Pasting another fragment-based share URL into this tab must open that model too.
window.addEventListener("hashchange", () => window.location.reload());
