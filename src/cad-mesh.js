import * as THREE from "three";

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
  // A periodic seam belongs only to this face; its other boundaries meet a neighbor.
  const lines = geometry.edges.filter((edge) => edge.ownerFaceIds.includes(face.id) && edge.ownerFaceIds.some((id) => id !== face.id) && edge.points.length).map((edge) => {
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
  const positions = Array.from(geometry.positions);
  const normals = Array.from(geometry.normals);
  const firstVertex = positions.length / 3;
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
  const faceNormals = vertices.map((point) => {
    const normal = coneNormal(point).multiplyScalar(sign);
    positions.push(...point.toArray());
    normals.push(...normal.toArray());
    return normal;
  });
  const added = [];
  for (const triangle of triangles) {
    const [a, b, c] = triangle.map((id) => vertices[id]);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    if (normal.dot(faceNormals[triangle[0]]) < 0) triangle.reverse();
    added.push(...triangle.map((id) => firstVertex + id));
  }
  if (!added.length) throw new Error(`Cannot triangulate CAD cone face ${face.id}`);
  const indices = Array.from(geometry.indices);
  indices.splice(face.firstIndex, 0, ...added);
  const mapping = Array.from(geometry.triangleToFaceMap);
  mapping.splice(face.firstIndex / 3, 0, ...Array(added.length / 3).fill(face.id));
  for (const other of geometry.faces) if (other !== face && other.firstIndex >= face.firstIndex) other.firstIndex += added.length;
  face.indexCount = added.length;
  geometry.positions = new Float32Array(positions);
  geometry.normals = new Float32Array(normals);
  geometry.indices = new Uint32Array(indices);
  geometry.triangleToFaceMap = new Int32Array(mapping);
}
