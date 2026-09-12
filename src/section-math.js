import * as THREE from "three";

export function worldPlane(data, transform) {
  return new THREE.Plane().setFromNormalAndCoplanarPoint(
    new THREE.Vector3(...data.normal).normalize(), new THREE.Vector3(...data.point),
  ).applyMatrix4(new THREE.Matrix4().fromArray(transform));
}

export function axisPosition(ray, origin, normal) {
  const direction = ray.direction.dot(normal);
  const denominator = 1 - direction * direction;
  if (denominator < 0.00001) return null;
  const delta = origin.clone().sub(ray.origin);
  return (direction * delta.dot(ray.direction) - delta.dot(normal)) / denominator;
}

export function kept(point, planes) {
  return planes.every((plane) => plane.distanceToPoint(point) >= -1e-6);
}

// A conservative, body-sized rectangle on the cut plane; null for uncut bodies.
export function cutBounds(box, plane, worldToPlane) {
  if (!box.intersectsPlane(plane)) return null;
  const bounds = new THREE.Box2();
  const point = new THREE.Vector3();
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    point.set(x, y, z).applyMatrix4(worldToPlane);
    bounds.expandByPoint(new THREE.Vector2(point.x, point.y));
  }
  return bounds.expandByScalar(Math.max(bounds.getSize(new THREE.Vector2()).length() * 0.001, 1e-5));
}

// Clipping is a shader effect: raycasting must also reject removed surfaces and opaque cut caps.
export function pickSurfaces(ray, parts, planes) {
  const objects = [];
  for (const part of parts) {
    if (!part.surface.visible || !ray.layers.test(part.surface.layers)) continue;
    if (!ray.ray.intersectsBox(part.bounds)) continue;
    objects.push(part.surface);
  }
  const firstHitOnly = ray.firstHitOnly;
  ray.firstHitOnly = !planes.length;
  if (!planes.length) {
    try { return { hit: ray.intersectObjects(objects, false)[0], limit: Infinity }; }
    finally { ray.firstHitOnly = firstHitOnly; }
  }
  const sides = new Map();
  for (const object of objects) for (const material of object.material) {
    if (!sides.has(material)) sides.set(material, material.side);
    material.side = THREE.DoubleSide;
  }
  let hits;
  try { hits = ray.intersectObjects(objects, false); }
  finally {
    for (const [material, side] of sides) material.side = side;
    ray.firstHitOnly = firstHitOnly;
  }
  const normals = new Map();
  const normal = new THREE.Vector3();
  const facing = (hit) => {
    if (!normals.has(hit.object)) normals.set(hit.object, new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld));
    return normal.copy(hit.face.normal).applyNormalMatrix(normals.get(hit.object)).dot(ray.ray.direction);
  };
  let limit = Infinity;
  const crossing = ray.ray.intersectPlane(planes[0], new THREE.Vector3());
  if (crossing) {
    const distance = crossing.distanceTo(ray.ray.origin);
    const seen = new Set();
    for (const hit of hits) {
      if (hit.distance <= distance + 1e-6 || seen.has(hit.object)) continue;
      seen.add(hit.object);
      // An exit face as the first crossing after the plane means the cut lies inside this solid.
      if (facing(hit) > 0) { limit = distance; break; }
    }
  }
  return { hit: hits.find((hit) => hit.distance <= limit + 1e-6 && kept(hit.point, planes) && facing(hit) < 0), limit };
}
