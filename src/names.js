const generic = /^(?:compound|compsolid|solid|shell|face|wire|edge|vertex|body|part|shape|assembly|component|unnamed)(?:[\s_.-]*\d+)?$/i;
const useful = (name) => name?.trim() && !generic.test(name.trim()) ? name.trim() : "";
const token = (name) => name.trim().replace(/[^\p{L}\p{N}-]+/gu, "_").replace(/^_+|_+$/g, "");

export function nameNodes(nodes, geometries, filename = "Model") {
  const model = token(filename.replace(/\.(step|stp)$/i, "")) || "Model";
  function siblings(items, parentPath = [], depth = 0) {
    const names = items.map((node) => useful(node.name)
      || (node.meshes.length === 1 ? useful(geometries[node.meshes[0]].name) : ""));
    let unnamed = 0;
    const counts = new Map();
    return items.map((node, index) => {
      const original = names[index];
      let label = original;
      if (original) {
        const count = (counts.get(original) || 0) + 1;
        counts.set(original, count);
        if (names.filter((name) => name === original).length > 1) label += `_${count}`;
      }
      const path = original
        ? [...(depth === 1 ? [] : parentPath), token(label)]
        : [...(parentPath.length ? parentPath : [model]), String(++unnamed)];
      if (!label) label = path.join("_");
      const bodyNames = node.meshes.map((mesh, i) => {
        const source = useful(geometries[mesh].name);
        if (source && source !== original) return `${path.join("_")}_${token(source)}_${i + 1}`;
        return node.meshes.length === 1 && !node.children.length ? label : `${path.join("_")}_${i + 1}`;
      });
      return { ...node, name: label, bodyNames, children: siblings(node.children, path, depth + 1) };
    });
  }
  return siblings(nodes);
}
