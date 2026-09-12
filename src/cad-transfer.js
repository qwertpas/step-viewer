const arrays = { positions: Float32Array, normals: Float32Array, indices: Uint32Array, triangleToFaceMap: Int32Array };

// One buffer avoids the cost of transferring thousands of separate CAD edges.
export function packCad(result) {
  let length = 0;
  for (const geometry of result.geometries) {
    for (const key of Object.keys(arrays)) length += geometry[key].length;
    for (const edge of geometry.edges) length += edge.points.length;
  }
  const buffer = new ArrayBuffer(length * 4);
  let offset = 0;
  const copy = (values, Type) => {
    const range = [offset, values.length];
    new Type(buffer, offset, values.length).set(values);
    offset += values.length * 4;
    return range;
  };
  const geometries = result.geometries.map((geometry) => {
    const packed = { ...geometry };
    for (const [key, Type] of Object.entries(arrays)) packed[key] = copy(geometry[key], Type);
    packed.edges = geometry.edges.map((edge) => ({ ...edge, points: copy(edge.points, Float32Array) }));
    return packed;
  });
  return { ...result, geometries, buffer };
}

export function unpackCad({ buffer, geometries, ...result }) {
  return { ...result, geometries: geometries.map((geometry) => {
    const unpacked = { ...geometry };
    for (const [key, Type] of Object.entries(arrays)) unpacked[key] = new Type(buffer, ...geometry[key]);
    unpacked.edges = geometry.edges.map((edge) => ({ ...edge, points: new Float32Array(buffer, ...edge.points) }));
    return unpacked;
  }) };
}
