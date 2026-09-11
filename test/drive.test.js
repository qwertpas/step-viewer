import test from "node:test";
import assert from "node:assert/strict";
import { Drive, readShare, shareUrl, shareLimit } from "../src/drive.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const file = new File(["ISO-10303-21;\nEND-ISO-10303-21;"], "test.step");
const info = { id: "cad123", name: file.name, size: String(file.size), capabilities: { canDownload: true } };

test("share links preserve the static path and resource key but contain no credentials", () => {
  const url = shareUrl("https://example.com/viewer/?old=value#old", { id: "cad123", resourceKey: "key-123" });
  assert.equal(url, "https://example.com/viewer/#file=cad123&resourcekey=key-123");
  assert.deepEqual(readShare(new URL(url).hash), { id: "cad123", resourceKey: "key-123" });
  assert.equal(readShare(""), null);
  assert.throws(() => readShare("#file=../../bad"), /invalid/);
  assert.throws(() => readShare("#file=cad123&resourcekey=x%0Aheader"), /invalid/);
});

test("sharing creates a private folder, uploads original bytes, and checks anonymous access", async () => {
  const calls = [];
  const responses = [
    json({ files: [] }), json({ id: "folder1" }), json({ files: [] }),
    new Response(null, { headers: { Location: "https://www.googleapis.com/upload/drive/v3/files?upload_id=test" } }),
    json({ id: "cad123" }), json({ id: "anyone" }), json({ id: "cad123", resourceKey: "resource1" }), json(info),
  ];
  const drive = new Drive({ clientId: "client", apiKey: "public-key", fetch: async (url, options) => {
    calls.push({ url: new URL(url), ...options });
    assert.ok(responses.length, "unexpected Google request");
    return responses.shift();
  } });
  drive.token = "sender-token";
  const progress = [];
  assert.deepEqual(await drive.share(file, (text) => progress.push(text)), { id: "cad123", resourceKey: "resource1" });
  assert.equal(responses.length, 0);
  assert.equal(JSON.parse(calls[1].body).name, "STEP Viewer Shares");
  assert.deepEqual(JSON.parse(calls[3].body).parents, ["folder1"]);
  assert.match(JSON.parse(calls[3].body).appProperties.sha256, /^[a-f0-9]{64}$/);
  assert.equal(calls[4].body, file);
  assert.equal(calls[4].method, "PUT");
  assert.deepEqual(JSON.parse(calls[5].body), { type: "anyone", role: "reader", allowFileDiscovery: false });
  assert.ok(calls[5].url.pathname.endsWith("/cad123/permissions"));
  assert.ok(!calls.some((call) => call.url.pathname.endsWith("/folder1/permissions")));
  for (const call of calls.slice(0, -1)) assert.equal(call.headers.Authorization, "Bearer sender-token");
  const anonymous = calls.at(-1);
  assert.equal(anonymous.headers.Authorization, undefined);
  assert.equal(anonymous.credentials, "omit");
  assert.equal(anonymous.headers["X-Goog-Drive-Resource-Keys"], "cad123/resource1");
  assert.equal(anonymous.url.searchParams.get("key"), "public-key");
  assert.ok(progress.includes("Uploading to Google Drive…"));
});

test("a completed identical upload is reused on later shares and retries", async () => {
  const responses = [json({ files: [{ id: "folder1" }] }), json({ files: [{ id: "cad123" }] }), json({}), json({ id: "cad123" }), json(info)];
  const drive = new Drive({ apiKey: "public-key", fetch: async (url, options) => {
    assert.ok(!url.includes("/upload/"));
    assert.ok(options.method !== "PUT");
    return responses.shift();
  } });
  assert.equal((await drive.share(file, () => {})).id, "cad123");
  assert.equal(responses.length, 0);
});

test("recipient downloads original bytes without account, cookies, or access token", async () => {
  let count = 0;
  const drive = new Drive({ apiKey: "public-key", fetch: async (url, options) => {
    assert.equal(options.credentials, "omit");
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers["X-Goog-Drive-Resource-Keys"], "cad123/resource1");
    count++;
    if (count === 1) return json(info);
    assert.equal(new URL(url).searchParams.get("alt"), "media");
    return new Response(file);
  } });
  // Even a sender token in memory must never enter the recipient request.
  drive.token = "must-not-send";
  const downloaded = await drive.download({ id: "cad123", resourceKey: "resource1" });
  assert.equal(downloaded.name, file.name);
  assert.equal(await downloaded.text(), await file.text());
  assert.equal(count, 2);
});

test("private, unavailable, oversized, and non-CAD files produce useful errors", async () => {
  const drive = new Drive({ apiKey: "key", fetch: async () => json({}, 404) });
  await assert.rejects(drive.download({ id: "cad123" }), /unavailable/);
  drive.fetch = async () => json({}, 403);
  await assert.rejects(drive.download({ id: "cad123" }), /refused access/);
  drive.fetch = async () => json({ ...info, name: "not-cad.html" });
  await assert.rejects(drive.download({ id: "cad123" }), /does not contain/);
  drive.fetch = async () => json({ ...info, size: shareLimit + 1 });
  await assert.rejects(drive.download({ id: "cad123" }), /250 MB/);
  await assert.rejects(drive.share({ size: shareLimit + 1 }, () => {}), /250 MB/);
  const unconfigured = new Drive({});
  await assert.rejects(unconfigured.connect(), /one-time Google setup/);
  await assert.rejects(unconfigured.download({ id: "cad123" }), /one-time Google setup/);
});

test("authorization is reused until expiry; popup cancellation and revoked tokens recover", async () => {
  const drive = new Drive({ clientId: "client", apiKey: "key", fetch: async () => json({}, 401) });
  let prompts = 0;
  drive.google = {
    hasGrantedAllScopes: () => true,
    initTokenClient: (options) => {
      assert.equal(options.scope, "https://www.googleapis.com/auth/drive.file");
      assert.equal(options.include_granted_scopes, false);
      return { requestAccessToken: (request) => {
        prompts++;
        assert.equal(request.prompt, "");
        options.callback({ access_token: "token", expires_in: 3600 });
      } };
    },
  };
  await drive.connect();
  await drive.connect();
  assert.equal(prompts, 1);
  drive.expires = 0;
  await drive.connect();
  assert.equal(prompts, 2);
  await assert.rejects(drive.folder(), /expired/);
  assert.equal(drive.token, "");
  drive.google.initTokenClient = (options) => ({ requestAccessToken: () => options.error_callback({ type: "popup_closed" }) });
  await assert.rejects(drive.connect(), /cancelled/);
});

test("an untrusted upload address never receives the sender token or CAD", async () => {
  const responses = [json({ files: [{ id: "folder1" }] }), json({ files: [] }), new Response(null, { headers: { Location: "https://other.example/upload" } })];
  const drive = new Drive({ apiKey: "key", fetch: async () => {
    assert.ok(responses.length, "must not send request to untrusted upload location");
    return responses.shift();
  } });
  await assert.rejects(drive.share(file, () => {}), /upload address/);
});

test("a failed permission change never returns a share link", async () => {
  const responses = [json({ files: [{ id: "folder1" }] }), json({ files: [{ id: "cad123" }] }), json({}, 403)];
  const drive = new Drive({ apiKey: "key", fetch: async () => responses.shift() });
  await assert.rejects(drive.share(file, () => {}), /refused access/);
  assert.equal(responses.length, 0);
});
