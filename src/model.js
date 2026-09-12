import * as THREE from "three";
import { MeshBVH, LineSegmentsBVH, acceleratedRaycast } from "three-mesh-bvh";
import { nameNodes } from "./names.js";

const floats = (values) => values instanceof Float32Array ? values : new Float32Array(values);

export function buildParts(result, filename) {
  const handles = new Map(result.exactGeometryBindings?.map((binding) => [binding.geometryId, binding.exactShapeHandle]));
  const palette = new Map();
  const geometries = result.geometries.map((part) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(floats(part.positions), 3));
    geometry.setIndex(new THREE.BufferAttribute(part.indices instanceof Uint32Array ? part.indices : new Uint32Array(part.indices), 1));
    if (part.normals.length) geometry.setAttribute("normal", new THREE.BufferAttribute(floats(part.normals), 3));
    else geometry.computeVertexNormals();
    const materials = [];
    const colors = new Map();
    function material(color) {
      const key = color ? `${color.r}:${color.g}:${color.b}` : "default";
      if (!colors.has(key)) {
        colors.set(key, materials.length);
        if (!palette.has(key)) palette.set(key, new THREE.MeshStandardMaterial({
          color: color ? new THREE.Color(color.r, color.g, color.b) : new THREE.Color(0xb7bcc3),
          metalness: 0.08, roughness: 0.52,
          polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
        }));
        materials.push(palette.get(key));
      }
      return colors.get(key);
    }
    const base = material(part.color);
    function group(start, count, index) {
      const last = geometry.groups.at(-1);
      if (last && last.materialIndex === index && last.start + last.count === start) last.count += count;
      else geometry.addGroup(start, count, index);
    }
    if (part.faces.length) {
      let start = 0;
      for (const face of part.faces) {
        if (face.firstIndex > start) group(start, face.firstIndex - start, base);
        group(face.firstIndex, face.indexCount, material(face.color || part.color));
        start = face.firstIndex + face.indexCount;
      }
      if (start < part.indices.length) group(start, part.indices.length - start, base);
    } else geometry.addGroup(0, part.indices.length, base);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.boundsTree = new MeshBVH(geometry, { indirect: true });
    const segmentCount = (part.edges || []).reduce((count, edge) => count + Math.max(0, edge.points.length / 3 - 1), 0);
    const points = new Float32Array(segmentCount * 6);
    const edgeIds = new Array(segmentCount);
    let segment = 0;
    for (const edge of part.edges || []) {
      for (let i = 0; i + 5 < edge.points.length; i += 3) {
        for (let j = 0; j < 6; j++) points[segment * 6 + j] = edge.points[i + j];
        edgeIds[segment++] = edge.id;
      }
    }
    const edges = new THREE.BufferGeometry();
    edges.setAttribute("position", new THREE.BufferAttribute(points, 3));
    edges.computeBoundingSphere();
    if (segmentCount) edges.boundsTree = new LineSegmentsBVH(edges, { indirect: true });
    return {
      geometry, materials, edges, edgeIds, data: part, handle: handles.get(part.id),
      faces: new Map(part.faces.map((face) => [face.id, face])),
    };
  });
  const parts = [];
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x22272e, depthWrite: false });
  function visit(node, parent) {
    const transform = parent.clone().multiply(new THREE.Matrix4().fromArray(node.transform));
    const meshes = node.meshes.map((index, body) => {
      const source = geometries[index];
      const surface = new THREE.Mesh(source.geometry, source.materials);
      surface.raycast = acceleratedRaycast;
      const edge = new THREE.LineSegments(source.edges, edgeMaterial);
      if (source.edges.boundsTree) edge.raycast = acceleratedRaycast;
      edge.renderOrder = 1;
      surface.applyMatrix4(transform);
      edge.applyMatrix4(transform);
      surface.matrixAutoUpdate = edge.matrixAutoUpdate = false;
      surface.updateMatrixWorld();
      edge.updateMatrixWorld();
      surface.matrixWorldAutoUpdate = edge.matrixWorldAutoUpdate = false;
      const id = parts.length;
      surface.userData.partIndex = id;
      edge.userData.partIndex = id;
      parts.push({
        surface, edge, name: node.bodyNames[body], triangles: source.geometry.index.count / 3,
        data: source.data, edgeIds: source.edgeIds, handle: source.handle, transform: transform.toArray(),
        bounds: new THREE.Box3().setFromObject(surface, true),
        faces: source.faces,
      });
      return id;
    });
    return { name: node.name, meshes, children: node.children.map((child) => visit(child, transform)) };
  }
  const root = { name: "", meshes: [], children: nameNodes(result.rootNodes, result.geometries, filename).map((node) => visit(node, new THREE.Matrix4())) };
  return { parts, root };
}

export function faceGeometry(source, face) {
  const positions = source.getAttribute("position");
  const indices = source.index.array;
  const points = new Float32Array(face.indexCount * 3);
  for (let i = 0; i < face.indexCount; i++) {
    const vertex = indices[face.firstIndex + i];
    points[i * 3] = positions.getX(vertex);
    points[i * 3 + 1] = positions.getY(vertex);
    points[i * 3 + 2] = positions.getZ(vertex);
  }
  return new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(points, 3));
}

export function visibleBounds(parts) {
  const box = new THREE.Box3();
  for (const part of parts) if (part.surface.visible) box.union(part.bounds);
  return box;
}
