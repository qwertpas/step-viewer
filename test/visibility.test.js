import test from "node:test";
import assert from "node:assert/strict";
import { visibilityHistory, visibilityKey } from "../src/visibility.js";

function setup(values) {
  const parts = values.map((visible) => ({ surface: { visible }, edge: { visible } }));
  let updates = 0;
  const history = visibilityHistory(() => parts, () => { updates++; });
  return { parts, history, values: () => parts.map((part) => part.surface.visible), updates: () => updates };
}

test("individual and mixed group show/hide changes undo and redo as single actions", () => {
  const { parts, history, values, updates } = setup([true, false, true]);
  history.set([0], false);
  history.set([0, 1, 2], true);
  assert.deepEqual(values(), [true, true, true]);
  assert.equal(history.undo(), true);
  assert.deepEqual(values(), [false, false, true]);
  history.undo();
  assert.deepEqual(values(), [true, false, true]);
  assert.equal(history.undo(), false);
  history.redo();
  history.redo();
  assert.deepEqual(values(), [true, true, true]);
  history.set([0, 1, 2], false);
  assert.deepEqual(values(), [false, false, false]);
  history.undo();
  assert.deepEqual(values(), [true, true, true]);
  assert.ok(parts.every((part) => part.edge.visible === part.surface.visible));
  assert.equal(updates(), 8);
});

test("no-ops retain redo; new changes discard redo; loading a new model clears history", () => {
  const { history, values } = setup([true, true]);
  history.set([0, 0], false);
  history.undo();
  assert.equal(history.set([0, 1], true), false);
  assert.equal(history.redo(), true);
  history.undo();
  history.set([1], false);
  assert.equal(history.redo(), false);
  assert.deepEqual(values(), [true, false]);
  history.clear();
  assert.equal(history.undo(), false);
  assert.equal(history.redo(), false);
});

test("platform undo and Shift-redo shortcuts leave text editing and other modifiers alone", () => {
  for (const mac of [true, false]) {
    const { history, values } = setup([true]);
    history.set([0], false);
    let prevented = 0;
    const event = { key: "z", metaKey: mac, ctrlKey: !mac, preventDefault() { prevented++; } };
    visibilityKey({ ...event, target: { closest: () => ({}) } }, history, mac);
    visibilityKey({ ...event, target: { isContentEditable: true } }, history, mac);
    visibilityKey({ ...event, metaKey: !mac, ctrlKey: mac }, history, mac);
    visibilityKey({ ...event, altKey: true }, history, mac);
    visibilityKey({ ...event, isComposing: true }, history, mac);
    assert.equal(prevented, 0);
    assert.deepEqual(values(), [false]);
    visibilityKey(event, history, mac);
    assert.deepEqual(values(), [true]);
    visibilityKey({ ...event, key: "Z", shiftKey: true }, history, mac);
    assert.deepEqual(values(), [false]);
    assert.equal(prevented, 2);
  }
});
