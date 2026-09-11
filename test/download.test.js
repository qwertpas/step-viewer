import test from "node:test";
import assert from "node:assert/strict";
import { downloadFile } from "../src/download.js";

test("download uses the original file, filename, and releases its object URL", (t) => {
  const file = new File(["original CAD bytes"], "my CAD.stp");
  const events = [];
  const anchor = { click() { events.push("click"); }, remove() { events.push("remove"); } };
  const originalDocument = globalThis.document;
  let cleanup;
  t.mock.method(URL, "createObjectURL", (blob) => { assert.equal(blob, file); return "blob:test"; });
  t.mock.method(URL, "revokeObjectURL", (url) => { assert.equal(url, "blob:test"); events.push("revoke"); });
  t.mock.method(globalThis, "setTimeout", (callback) => { cleanup = callback; });
  globalThis.document = {
    createElement: (tag) => { assert.equal(tag, "a"); return anchor; },
    body: { appendChild: (node) => { assert.equal(node, anchor); events.push("append"); } },
  };
  try {
    downloadFile(file);
    assert.equal(anchor.download, "my CAD.stp");
    assert.equal(anchor.href, "blob:test");
    assert.deepEqual(events, ["append", "click", "remove"]);
    cleanup();
    assert.equal(events.at(-1), "revoke");
  } finally { globalThis.document = originalDocument; }
});
