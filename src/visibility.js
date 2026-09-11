export function visibilityHistory(getParts, changed) {
  const past = [];
  const future = [];
  function apply(changes, key) {
    const parts = getParts();
    for (const change of changes) {
      const part = parts[change.index];
      part.surface.visible = part.edge.visible = change[key];
    }
    changed();
  }
  function move(from, to, key) {
    const changes = from.pop();
    if (!changes) return false;
    apply(changes, key);
    to.push(changes);
    return true;
  }
  return {
    set(indices, visible) {
      const parts = getParts();
      const changes = [...new Set(indices)]
        .filter((index) => parts[index] && parts[index].surface.visible !== visible)
        .map((index) => ({ index, before: parts[index].surface.visible, after: visible }));
      if (!changes.length) return false;
      apply(changes, "after");
      past.push(changes);
      future.length = 0;
      return true;
    },
    undo: () => move(past, future, "before"),
    redo: () => move(future, past, "after"),
    clear() { past.length = future.length = 0; },
  };
}

export function visibilityKey(event, history, mac) {
  if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey) return;
  if (event.target?.isContentEditable || event.target?.closest?.("input, textarea, select")) return;
  if (event.key.toLowerCase() !== "z" || !(mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)) return;
  event.preventDefault();
  if (event.shiftKey) history.redo();
  else history.undo();
}
