import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import occtImport from "occt-import-js";
import "./style.css";

const app = document.querySelector("#app");
const host = document.querySelector("#canvas");
const openButton = document.querySelector("#open");
const fileInput = document.querySelector("#file-input");
const empty = document.querySelector("#empty");
const loading = document.querySelector("#loading");
const fileName = document.querySelector("#file-name");
const status = document.querySelector("#status");
const statusDot = document.querySelector("#status-dot");
const stats = document.querySelector("#model-stats");
const edgesButton = document.querySelector("#edges");
const dropLayer = document.querySelector("#drop-layer");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8eaed);
scene.fog = new THREE.Fog(0xe8eaed, 900, 2200);

const camera = new THREE.PerspectiveCamera(35, host.clientWidth / host.clientHeight, 0.01, 100000);
camera.up.set(0, 0, 1);
camera.position.set(180, -220, 160);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(host.clientWidth, host.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
host.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
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

function dispose(group) {
  group.traverse((item) => {
    if (!item.geometry) return;
    item.geometry.dispose();
    const materials = Array.isArray(item.material) ? item.material : [item.material];
    materials.forEach((material) => material?.dispose());
  });
  group.clear();
}

function fitModel() {
  if (!surfaces.children.length) return;
  const box = new THREE.Box3().setFromObject(surfaces);
  const center = box.getCenter(new THREE.Vector3());
  const dimensions = box.getSize(new THREE.Vector3());
  const radius = Math.max(dimensions.length() * 0.56, 1);
  const direction = camera.position.clone().sub(controls.target).normalize();
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.12);
  camera.near = Math.max(radius / 1000, 0.001);
  camera.far = radius * 100;
  camera.updateProjectionMatrix();
  grid.position.z = box.min.z - Math.max(dimensions.z * 0.01, 0.01);
  controls.update();
}

function setView(direction) {
  if (!surfaces.children.length) return;
  const center = new THREE.Box3().setFromObject(surfaces).getCenter(new THREE.Vector3());
  const distance = camera.position.distanceTo(controls.target);
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction.normalize(), distance);
  camera.up.set(0, 0, Math.abs(direction.z) > 0.9 ? 0 : 1);
  if (Math.abs(direction.z) > 0.9) camera.up.set(0, 1, 0);
  controls.update();
}

function addMesh(part) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(part.attributes.position.array, 3));
  if (part.attributes.normal) {
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(part.attributes.normal.array, 3));
  } else {
    geometry.computeVertexNormals();
  }
  geometry.setIndex(part.index.array);

  const color = part.color ? new THREE.Color(...part.color) : new THREE.Color(0xb7bcc3);
  const surface = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, metalness: 0.08, roughness: 0.52 }),
  );
  surface.name = part.name;
  surfaces.add(surface);

  const edgeGeometry = new THREE.EdgesGeometry(geometry, 25);
  const edge = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({ color: 0x22272e, transparent: true, opacity: 0.36 }),
  );
  outlines.add(edge);
  return part.index.array.length / 3;
}

let importerPromise;
function getImporter() {
  const wasmUrl = new URL(`${import.meta.env.BASE_URL}occt-import-js.wasm`, window.location.href).href;
  importerPromise ||= occtImport({ locateFile: () => wasmUrl });
  return importerPromise;
}

function setBusy(value) {
  loading.hidden = !value;
  openButton.disabled = value;
  edgesButton.disabled = value || !surfaces.children.length;
}

async function openFile(file) {
  if (!/\.(step|stp)$/i.test(file.name)) {
    status.textContent = "Please choose a .step or .stp file";
    return;
  }

  fileName.textContent = file.name;
  fileName.title = file.name;
  status.textContent = "Reading geometry…";
  empty.hidden = true;
  setBusy(true);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  try {
    const importer = await getImporter();
    const result = importer.ReadStepFile(new Uint8Array(await file.arrayBuffer()), {
      linearUnit: "millimeter",
      linearDeflectionType: "bounding_box_ratio",
      linearDeflection: 0.001,
      angularDeflection: 0.5,
    });
    if (!result.success || !result.meshes.length) throw new Error("No solid geometry was found");

    dispose(surfaces);
    dispose(outlines);
    let triangles = 0;
    result.meshes.forEach((part) => { triangles += addMesh(part); });
    outlines.visible = edgesButton.classList.contains("active");
    fitModel();

    const size = file.size > 1_000_000
      ? `${(file.size / 1_000_000).toFixed(1)} MB`
      : `${Math.max(1, Math.round(file.size / 1000))} KB`;
    status.textContent = `${result.meshes.length} ${result.meshes.length === 1 ? "part" : "parts"}`;
    statusDot.classList.add("ready");
    stats.innerHTML = `${size}<span></span>${Math.round(triangles).toLocaleString()} triangles`;
    stats.hidden = false;
  } catch (error) {
    console.error(error);
    status.textContent = error instanceof Error ? error.message : "Could not read this file";
    if (!surfaces.children.length) empty.hidden = false;
  } finally {
    setBusy(false);
  }
}

openButton.addEventListener("click", () => fileInput.click());
empty.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) openFile(file);
  fileInput.value = "";
});

document.querySelector("#fit").addEventListener("click", fitModel);
document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const directions = {
      front: new THREE.Vector3(0, -1, 0),
      right: new THREE.Vector3(1, 0, 0),
      top: new THREE.Vector3(0, 0, 1),
    };
    setView(directions[button.dataset.view]);
  });
});

edgesButton.addEventListener("click", () => {
  const enabled = edgesButton.classList.toggle("active");
  outlines.visible = enabled;
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
}).observe(host);

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
