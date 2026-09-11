const options = {
  linearUnit: "millimeter", linearDeflectionType: "bounding_box_ratio",
  linearDeflection: 0.001, angularDeflection: 0.5, readColors: true, readNames: true,
};

export function openCad(occt, bytes, display = {}) {
  const result = occt.OpenExactStepModel(bytes, { ...options, ...display });
  if (!result.success || !result.geometries?.length || !result.exactModelId) {
    if (result.exactModelId) occt.ReleaseExactModel(result.exactModelId);
    throw new Error("No solid CAD geometry was found");
  }
  return result;
}

export function measureCad(occt, modelId, refs) {
  const args = (ref) => [modelId, ref.handle, ref.kind, ref.id];
  if (refs.length === 2) {
    const [a, b] = refs;
    const distance = occt.MeasureExactDistance(
      ...args(a), b.handle, b.kind, b.id, a.transform, b.transform,
    );
    if (!distance.ok) throw new Error(distance.message);
    const centers = refs.map((ref) => occt.MeasureExactCenter(...args(ref)));
    return { distance, centers: centers.every((center) => center.ok) ? centers : null };
  }
  const ref = refs[0];
  const radius = occt.MeasureExactRadius(...args(ref));
  if (radius.ok) return { radius };
  if (radius.code !== "unsupported-geometry") throw new Error(radius.message);
  const result = ref.kind === "edge"
    ? occt.MeasureExactEdgeLength(...args(ref))
    : occt.MeasureExactFaceArea(...args(ref));
  if (!result.ok) throw new Error(result.message);
  return ref.kind === "edge" ? { length: result } : { area: result };
}
