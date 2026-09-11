import * as THREE from "three";

// Build a camera-independent cross-section. Weld CAD face seams before tracing
// the loops; imported faces often have separate, slightly rounded vertices.
export function sectionShape(geometry, transform) {
  const position = geometry.getAttribute("position");
  const index = geometry.index;
  const points = Array.from({ length: position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(transform));
  const box = new THREE.Box3().setFromPoints(points);
  const tolerance = Math.max(box.getSize(new THREE.Vector3()).length() * 1e-6, 1e-6);
  const nodes = [];
  const buckets = new Map();
  function node(point) {
    const x = Math.floor(point.x / tolerance), y = Math.floor(point.y / tolerance);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const id of buckets.get(`${x + dx}:${y + dy}`) || []) {
        if (nodes[id].point.distanceToSquared(point) <= tolerance * tolerance) return id;
      }
    }
    const id = nodes.length;
    nodes.push({ point, links: new Set() });
    const key = `${x}:${y}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(id);
    return id;
  }
  const count = index ? index.count : position.count;
  for (let i = 0; i < count; i += 3) {
    const triangle = [0, 1, 2].map((j) => points[index ? index.getX(i + j) : i + j]);
    const crossings = [];
    for (let j = 0; j < 3; j++) {
      const a = triangle[j], b = triangle[(j + 1) % 3];
      if ((a.z < 0) === (b.z < 0)) continue;
      const t = a.z / (a.z - b.z);
      crossings.push(new THREE.Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
    }
    if (crossings.length !== 2) continue;
    const a = node(crossings[0]), b = node(crossings[1]);
    if (a === b) continue;
    nodes[a].links.add(b);
    nodes[b].links.add(a);
  }
  const loops = [];
  let open = 0;
  for (let start = 0; start < nodes.length; start++) {
    while (nodes[start].links.size) {
      const loop = [];
      let current = start;
      do {
        loop.push(nodes[current].point);
        const next = nodes[current].links.values().next().value;
        if (next === undefined) break;
        nodes[current].links.delete(next);
        nodes[next].links.delete(current);
        current = next;
      } while (current !== start);
      if (current === start && loop.length >= 3) loops.push(loop);
      else if (loop.length > 1) open++;
    }
  }
  function contains(loop, point) {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const a = loop[i], b = loop[j];
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  const regions = loops.map((loop) => ({ loop, area: Math.abs(THREE.ShapeUtils.area(loop)), parent: null, depth: 0 }));
  regions.sort((a, b) => b.area - a.area);
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    for (let j = i - 1; j >= 0; j--) {
      if (!contains(regions[j].loop, region.loop[0])) continue;
      region.parent = regions[j];
      region.depth = regions[j].depth + 1;
      break;
    }
  }
  const fill = [];
  const edges = [];
  for (const region of regions) {
    const loop = region.loop;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      edges.push(a.x, a.y, 0, b.x, b.y, 0);
    }
    if (region.depth % 2) continue;
    const holes = regions.filter((other) => other.parent === region).map((other) => other.loop);
    const triangles = THREE.ShapeUtils.triangulateShape(loop, holes);
    const vertices = loop.concat(...holes);
    for (const triangle of triangles) for (const id of triangle) fill.push(vertices[id].x, vertices[id].y, 0);
  }
  return { fill: new Float32Array(fill), edges: new Float32Array(edges), open, loops: loops.length };
}
