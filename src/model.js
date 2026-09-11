import * as THREE from "three";

export function buildParts(result) {
  const handles = new Map(result.exactGeometryBindings?.map((binding) => [binding.geometryId, binding.exactShapeHandle]));
  const geometries = result.geometries.map((part) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(part.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(part.indices), 1));
    if (part.normals.length) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(part.normals, 3));
    else geometry.computeVertexNormals();
    const materials = [];
    const colors = new Map();
    function material(color) {
      const key = JSON.stringify(color);
      if (!colors.has(key)) {
        colors.set(key, materials.length);
        materials.push(new THREE.MeshStandardMaterial({
          color: color ? new THREE.Color(color.r, color.g, color.b) : new THREE.Color(0xb7bcc3),
          metalness: 0.08, roughness: 0.52,
        }));
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
    const points = [];
    const edgeIds = [];
    for (const edge of part.edges || []) {
      for (let i = 0; i + 5 < edge.points.length; i += 3) {
        points.push(...edge.points.slice(i, i + 6));
        edgeIds.push(edge.id);
      }
    }
    const edges = new THREE.BufferGeometry();
    edges.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return { geometry, materials, edges, edgeIds, data: part, handle: handles.get(part.id) };
  });
  const parts = [];
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x22272e, transparent: true, opacity: 0.36 });
  function visit(node, parent) {
    const transform = parent.clone().multiply(new THREE.Matrix4().fromArray(node.transform));
    const meshes = node.meshes.map((index) => {
      const source = geometries[index];
      const surface = new THREE.Mesh(source.geometry, source.materials);
      const edge = new THREE.LineSegments(source.edges, edgeMaterial);
      surface.applyMatrix4(transform);
      edge.applyMatrix4(transform);
      const id = parts.length;
      surface.userData.partIndex = id;
      edge.userData.partIndex = id;
      parts.push({
        surface, edge, name: node.name || source.data.name, triangles: source.geometry.index.count / 3,
        data: source.data, edgeIds: source.edgeIds, handle: source.handle, transform: transform.toArray(),
      });
      return id;
    });
    return { name: node.name, meshes, children: node.children.map((child) => visit(child, transform)) };
  }
  const root = { name: "", meshes: [], children: result.rootNodes.map((node) => visit(node, new THREE.Matrix4())) };
  return { parts, root };
}

export function visibleBounds(parts) {
  const box = new THREE.Box3();
  for (const { surface } of parts) if (surface.visible) box.union(new THREE.Box3().setFromObject(surface, true));
  return box;
}
