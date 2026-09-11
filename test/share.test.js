import test from "node:test";
import assert from "node:assert/strict";
import { setupSharing } from "../src/share.js";

test("Share uploads only on click, copies once ready, and preserves links across clipboard retries", async () => {
  const nodes = new Map();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  globalThis.document = { querySelector: (id) => {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, handlers: {}, addEventListener(event, callback) { this.handlers[event] = callback; }, focus() {}, select() {} });
    return nodes.get(id);
  } };
  globalThis.window = { location: { href: "https://example.com/viewer/" } };
  let copied = "";
  let denyClipboard = true;
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => {
    if (denyClipboard) throw new Error("No user activation");
    copied = text;
  } } });
  let connects = 0;
  let uploads = 0;
  const drive = {
    clientId: "client", apiKey: "key", prepare: async () => {},
    connect: async () => { connects++; },
    share: async () => { uploads++; return { id: "cad123" }; },
  };
  try {
    const sharing = setupSharing(drive);
    sharing.setFile(new File(["cad"], "test.step"));
    assert.equal(uploads, 0);
    const button = nodes.get("#share");
    await button.handlers.click();
    assert.equal(uploads, 1);
    assert.match(nodes.get("#share-message").textContent, /Link ready/);
    assert.equal(nodes.get("#share-link").value, "https://example.com/viewer/#file=cad123");
    assert.equal(nodes.get("#share-drive").href, "https://drive.google.com/file/d/cad123/view");
    assert.equal(nodes.get("#share-drive").hidden, false);
    denyClipboard = false;
    await button.handlers.click();
    assert.equal(uploads, 1);
    assert.equal(connects, 1);
    assert.equal(copied, "https://example.com/viewer/#file=cad123");
    assert.match(nodes.get("#share-message").textContent, /Link copied/);
    sharing.setLoading(true);
    assert.equal(button.disabled, true);
    sharing.setLoading(false);
    sharing.setFile(new File(["recipient"], "shared.step"), "https://example.com/viewer/#file=recipient&resourcekey=key123");
    await button.handlers.click();
    assert.equal(connects, 1, "recipient can copy the existing link without signing in");
    assert.equal(copied, "https://example.com/viewer/#file=recipient&resourcekey=key123");
    assert.equal(nodes.get("#share-drive").href, "https://drive.google.com/file/d/recipient/view?resourcekey=key123");
    sharing.setFile(new File(["new"], "new.step"));
    assert.equal(nodes.get("#share-drive").hidden, true);
    drive.connect = async () => { throw new Error("Sign-in cancelled"); };
    await button.handlers.click();
    assert.equal(uploads, 1);
    assert.equal(button.disabled, false);
    assert.match(nodes.get("#share-message").textContent, /cancelled/);
    assert.equal(nodes.get("#share-link").hidden, true);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
    else delete navigator.clipboard;
  }
});
