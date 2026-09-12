import * as THREE from "three";

export function repairFace(occt, modelId, handle, geometry, face) {
  const area = occt.MeasureExactFaceArea(modelId, handle, "face", face.id);
  if (!area.ok) throw new Error(area.message);
  // Collapsed CAD faces have no surface to triangulate.
  if (area.value === 0) return;
  const type = occt.GetExactGeometryType(modelId, handle, "face", face.id);
  if (type.ok && type.family === "cone") return repairCone(occt, modelId, handle, geometry, face);
  if (type.ok && type.family === "plane") return repairPlane(occt, modelId, handle, geometry, face);
  throw new Error(`Cannot display CAD face ${face.id}: triangulation is missing`);
}

// OCCT can leave a periodic cone unmeshed. Reconstruct that
// display face from its CAD boundary loops; exact measurement handles stay intact.
export function repairCone(occt, modelId, handle, geometry, face) {
  const type = occt.GetExactGeometryType(modelId, handle, "face", face.id);
  if (!type.ok || type.family !== "cone") throw new Error(`Cannot display CAD face ${face.id}: triangulation is missing`);
  const center = occt.MeasureExactCenter(modelId, handle, "face", face.id);
  if (!center.ok) throw new Error(center.message);
  const axis = new THREE.Vector3(...center.localAxisDirection).normalize();
  const origin = new THREE.Vector3(...center.localCenter);
  const rotation = new THREE.Quaternion().setFromUnitVectors(axis, new THREE.Vector3(0, 0, 1));
  const loops = faceLoops(geometry, face, true);
  const rings = loops.map((points) => ({ points, flat: points.map((point) => {
    const local = point.clone().sub(origin).applyQuaternion(rotation);
    return new THREE.Vector2(local.x, local.y);
  }) }));
  rings.sort((a, b) => Math.abs(THREE.ShapeUtils.area(b.flat)) - Math.abs(THREE.ShapeUtils.area(a.flat)));
  if (rings.length !== 2) throw new Error(`Cannot triangulate CAD cone face ${face.id}`);
  // Join corresponding angular intervals. Planar polygon triangulation can span
  // the curved cone with long chords even when its projected annulus looks valid.
  const rows = rings.map((ring) => ring.points.map((point, i) => ({ point, angle: Math.atan2(ring.flat[i].y, ring.flat[i].x) })).sort((a, b) => a.angle - b.angle));
  const base = rows[0][0].angle;
  const turn = Math.PI * 2;
  const distance = (angle) => Math.atan2(Math.sin(angle - base), Math.cos(angle - base));
  let nearest = 0;
  for (let i = 1; i < rows[1].length; i++) if (Math.abs(distance(rows[1][i].angle)) < Math.abs(distance(rows[1][nearest].angle))) nearest = i;
  rows[1] = rows[1].slice(nearest).concat(rows[1].slice(0, nearest));
  for (const row of rows) {
    row[0].angle = base + distance(row[0].angle);
    for (let i = 1; i < row.length; i++) while (row[i].angle < row[i - 1].angle) row[i].angle += turn;
  }
  const [outer, inner] = rows;
  const angle = (row, index) => row[index % row.length].angle + (index >= row.length ? turn : 0);
  const triangles = [];
  let i = 0, j = 0;
  while (i < outer.length || j < inner.length) {
    if (j === inner.length || (i < outer.length && angle(outer, i + 1) <= angle(inner, j + 1))) {
      triangles.push([i % outer.length, (i + 1) % outer.length, outer.length + j % inner.length]);
      i++;
    } else {
      triangles.push([i % outer.length, outer.length + (j + 1) % inner.length, outer.length + j % inner.length]);
      j++;
    }
  }
  const vertices = rows.flatMap((row) => row.map((entry) => entry.point));
  const sample = rings[0].points[Math.floor(rings[0].points.length / 3)].clone().sub(origin);
  const height = rings.reduce((sum, ring) => sum + ring.points[0].clone().sub(origin).dot(axis), 0) / rings.length;
  const query = sample.clone().multiplyScalar(height / sample.dot(axis)).add(origin);
  const exact = occt.EvaluateExactFaceNormal(modelId, handle, "face", face.id, query.toArray());
  if (!exact.ok) throw new Error(exact.message);
  const coneNormal = (point) => {
    const direction = point.clone().sub(origin);
    return axis.clone().cross(direction).cross(direction).normalize();
  };
  const sign = coneNormal(query).dot(new THREE.Vector3(...exact.localNormal)) < 0 ? -1 : 1;
  addFace(geometry, face, vertices, vertices.map((point) => coneNormal(point).multiplyScalar(sign)), triangles);
}

function faceLoops(geometry, face, periodic = false) {
  // A periodic seam belongs only to this face; its other boundaries meet a neighbor.
  const lines = geometry.edges.filter((edge) => edge.ownerFaceIds.includes(face.id) && (!periodic || edge.ownerFaceIds.some((id) => id !== face.id)) && edge.points.length).map((edge) => {
    const points = [];
    for (let i = 0; i < edge.points.length; i += 3) points.push(new THREE.Vector3().fromArray(edge.points, i));
    return points;
  });
  const tolerance = 1e-4;
  const close = (a, b) => a.distanceTo(b) < tolerance;
  const loops = [];
  while (lines.length) {
    const loop = lines.pop();
    while (!close(loop[0], loop.at(-1))) {
      const next = lines.findIndex((line) => close(line[0], loop.at(-1)) || close(line.at(-1), loop.at(-1)));
      if (next < 0) throw new Error(`Cannot close CAD face ${face.id}`);
      const line = lines.splice(next, 1)[0];
      if (!close(line[0], loop.at(-1))) line.reverse();
      loop.push(...line.slice(1));
    }
    loop.pop();
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function repairPlane(occt, modelId, handle, geometry, face) {
  const loops = faceLoops(geometry, face);
  const points = loops.flat();
  if (points.length < 3) throw new Error(`Cannot triangulate CAD plane face ${face.id}`);
  const origin = points[0];
  const normal = new THREE.Vector3();
  for (let i = 1; i + 1 < points.length; i++) {
    const cross = points[i].clone().sub(origin).cross(points[i + 1].clone().sub(origin));
    if (cross.lengthSq() > normal.lengthSq()) normal.copy(cross);
  }
  normal.normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(normal, new THREE.Vector3(0, 0, 1));
  const rings = loops.map((points) => ({ points, flat: points.map((point) => {
    const local = point.clone().sub(origin).applyQuaternion(rotation);
    return new THREE.Vector2(local.x, local.y);
  }) }));
  rings.sort((a, b) => Math.abs(THREE.ShapeUtils.area(b.flat)) - Math.abs(THREE.ShapeUtils.area(a.flat)));
  const triangles = THREE.ShapeUtils.triangulateShape(rings[0].flat, rings.slice(1).map((ring) => ring.flat));
  if (!triangles.length) throw new Error(`Cannot triangulate CAD plane face ${face.id}`);
  const vertices = rings.flatMap((ring) => ring.points);
  const query = triangles[0].reduce((sum, id) => sum.add(vertices[id]), new THREE.Vector3()).multiplyScalar(1 / 3);
  const exact = occt.EvaluateExactFaceNormal(modelId, handle, "face", face.id, query.toArray());
  if (!exact.ok) throw new Error(exact.message);
  normal.fromArray(exact.localNormal);
  addFace(geometry, face, vertices, vertices.map(() => normal), triangles);
}

function addFace(geometry, face, vertices, faceNormals, triangles) {
  const firstVertex = geometry.positions.length / 3;
  const positions = new Float32Array(geometry.positions.length + vertices.length * 3);
  const normals = new Float32Array(geometry.normals.length + vertices.length * 3);
  positions.set(geometry.positions);
  normals.set(geometry.normals);
  vertices.forEach((point, i) => {
    point.toArray(positions, (firstVertex + i) * 3);
    faceNormals[i].toArray(normals, (firstVertex + i) * 3);
  });
  const added = new Uint32Array(triangles.length * 3);
  for (const [i, triangle] of triangles.entries()) {
    const [a, b, c] = triangle.map((id) => vertices[id]);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    if (normal.dot(faceNormals[triangle[0]]) < 0) triangle.reverse();
    for (let j = 0; j < 3; j++) added[i * 3 + j] = firstVertex + triangle[j];
  }
  if (!added.length) throw new Error(`Cannot triangulate CAD face ${face.id}`);
  const indices = new Uint32Array(geometry.indices.length + added.length);
  indices.set(geometry.indices.subarray(0, face.firstIndex));
  indices.set(added, face.firstIndex);
  indices.set(geometry.indices.subarray(face.firstIndex), face.firstIndex + added.length);
  const mapping = new Int32Array(geometry.triangleToFaceMap.length + triangles.length);
  const firstTriangle = face.firstIndex / 3;
  mapping.set(geometry.triangleToFaceMap.subarray(0, firstTriangle));
  mapping.fill(face.id, firstTriangle, firstTriangle + triangles.length);
  mapping.set(geometry.triangleToFaceMap.subarray(firstTriangle), firstTriangle + triangles.length);
  for (const other of geometry.faces) if (other !== face && other.firstIndex >= face.firstIndex) other.firstIndex += added.length;
  face.indexCount = added.length;
  geometry.positions = positions;
  geometry.normals = normals;
  geometry.indices = indices;
  geometry.triangleToFaceMap = mapping;
}
