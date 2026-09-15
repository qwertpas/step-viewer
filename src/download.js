export function componentTree(node, parts) {
  const bodies = (node.meshes || []).map((index) => {
    const part = parts[index];
    return {
      name: part.name, handle: part.handle, transform: part.transform,
      color: part.data.color, faces: part.data.faces.map(({ id, color }) => ({ id, color })), children: [],
    };
  });
  const children = (node.children || []).map((child) => componentTree(child, parts)).filter(Boolean);
  if (!bodies.length && !children.length) return null;
  if (bodies.length === 1 && !children.length) return { ...bodies[0], name: node.name };
  return { name: node.name, children: [...children, ...bodies] };
}

export function componentFile(bytes, name) {
  const base = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\.(step|stp)$/i, "").replace(/[. ]+$/g, "").trim() || "Component";
  return new File([bytes], `${base}.step`, { type: "application/step" });
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
