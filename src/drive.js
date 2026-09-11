const api = "https://www.googleapis.com/drive/v3";
const scope = "https://www.googleapis.com/auth/drive.file";
const folderType = "application/vnd.google-apps.folder";
const validId = /^[\w-]{1,200}$/;
export const shareLimit = 250 * 1024 * 1024;

export function readShare(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (!params.has("file")) return null;
  const id = params.get("file");
  const resourceKey = params.get("resourcekey") || "";
  if (!validId.test(id) || (resourceKey && !validId.test(resourceKey))) {
    throw new Error("This share link is invalid. Ask the sender for a new link.");
  }
  return { id, resourceKey };
}

export function shareUrl(base, file) {
  if (!validId.test(file.id) || (file.resourceKey && !validId.test(file.resourceKey))) {
    throw new Error("Google Drive returned an invalid file link.");
  }
  const url = new URL(base);
  url.search = "";
  const params = new URLSearchParams({ file: file.id });
  if (file.resourceKey) params.set("resourcekey", file.resourceKey);
  url.hash = params.toString();
  return url.href;
}

async function checked(response) {
  if (response.ok) return response;
  const error = new Error(response.status === 401
    ? "Google connection expired. Click Copy share link to reconnect."
    : response.status === 404
      ? "This shared file is unavailable. It may have been deleted or made private."
      : response.status === 403
        ? "Google Drive refused access. Check sharing permissions, Drive limits, and the site's Google API configuration."
        : `Google Drive request failed (${response.status}). Please try again.`);
  error.status = response.status;
  throw error;
}

export class Drive {
  constructor({ clientId, apiKey, fetch: request = globalThis.fetch }) {
    this.clientId = clientId;
    this.apiKey = apiKey;
    this.fetch = (...args) => request(...args);
    this.token = "";
    this.expires = 0;
  }

  prepare() {
    if (!this.clientId || !this.apiKey) return Promise.resolve();
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => {
        this.google = globalThis.google.accounts.oauth2;
        resolve();
      };
      script.onerror = () => {
        script.remove();
        this.ready = null;
        reject(new Error("Google sign-in could not load. Check your connection or browser blocking settings."));
      };
      document.head.appendChild(script);
    });
    return this.ready;
  }

  // Called directly from the Share click so Google's popup retains user activation.
  connect() {
    if (!this.clientId || !this.apiKey) return Promise.reject(new Error("Sharing needs one-time Google setup by the site owner. See the setup guide."));
    if (this.token && Date.now() < this.expires) return Promise.resolve();
    if (!this.google) return Promise.reject(new Error("Google sign-in is loading. Click Copy share link again in a moment."));
    return new Promise((resolve, reject) => {
      const client = this.google.initTokenClient({
        client_id: this.clientId,
        scope,
        include_granted_scopes: false,
        callback: (response) => {
          if (response.error || !response.access_token || !this.google.hasGrantedAllScopes(response, scope)) {
            reject(new Error("Google Drive access was not granted. Click Copy share link to try again."));
            return;
          }
          this.token = response.access_token;
          this.expires = Date.now() + Math.max(0, Number(response.expires_in) - 60) * 1000;
          resolve();
        },
        error_callback: (error) => reject(new Error(error.type === "popup_closed"
          ? "Google sign-in was cancelled. Nothing was shared."
          : "Allow Google's sign-in popup, then click Copy share link again.")),
      });
      client.requestAccessToken({ prompt: "" });
    });
  }

  async request(url, options = {}) {
    const response = await this.fetch(url, {
      ...options, credentials: "omit",
      headers: { Authorization: `Bearer ${this.token}`, ...options.headers },
    });
    if (response.status === 401) { this.token = ""; this.expires = 0; }
    return checked(response);
  }

  async find(query) {
    const params = new URLSearchParams({ q: `trashed = false and (${query})`, fields: "files(id)", pageSize: "1", spaces: "drive" });
    const response = await this.request(`${api}/files?${params}`);
    return (await response.json()).files[0];
  }

  async folder() {
    const existing = await this.find(`mimeType = '${folderType}' and appProperties has { key='stepViewer' and value='shares' }`);
    if (existing) return existing.id;
    const response = await this.request(`${api}/files?fields=id`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "STEP Viewer Shares", mimeType: folderType, appProperties: { stepViewer: "shares" } }),
    });
    return (await response.json()).id;
  }

  async share(file, report) {
    if (!file.size || file.size > shareLimit) throw new Error("Sharing supports STEP files up to 250 MB.");
    report("Preparing share…");
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const folder = await this.folder();
    let saved = await this.find(`'${folder}' in parents and appProperties has { key='sha256' and value='${hash}' }`);
    if (!saved) {
      report("Uploading to Google Drive…");
      const session = await this.request("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Upload-Content-Type": "application/octet-stream", "X-Upload-Content-Length": String(file.size) },
        body: JSON.stringify({ name: file.name, parents: [folder], appProperties: { sha256: hash } }),
      });
      const location = session.headers.get("Location");
      const url = location && new URL(location);
      if (!url || url.origin !== "https://www.googleapis.com" || url.pathname !== "/upload/drive/v3/files") {
        throw new Error("Google Drive did not provide an upload address. Please try again.");
      }
      const uploaded = await this.request(url.href, {
        method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: file,
      });
      saved = await uploaded.json();
    }
    report("Enabling link access…");
    await this.request(`${api}/files/${saved.id}/permissions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "anyone", role: "reader", allowFileDiscovery: false }),
    });
    const response = await this.request(`${api}/files/${saved.id}?fields=id,resourceKey`);
    const shared = await response.json();
    // Check without the sender's token: only copy a link when anonymous access works.
    report("Checking link access…");
    await this.publicFile(shared);
    return shared;
  }

  async publicRequest(file, params) {
    if (!this.apiKey) throw new Error("Shared links need one-time Google setup by the site owner. See the setup guide.");
    shareUrl("https://example.com/", file);
    const headers = file.resourceKey ? { "X-Goog-Drive-Resource-Keys": `${file.id}/${file.resourceKey}` } : {};
    return checked(await this.fetch(`${api}/files/${file.id}?${new URLSearchParams({ ...params, key: this.apiKey })}`, {
      credentials: "omit", headers,
    }));
  }

  async publicFile(file) {
    const response = await this.publicRequest(file, { fields: "id,name,size,mimeType,capabilities(canDownload)" });
    const info = await response.json();
    if (!/\.(step|stp)$/i.test(info.name)) throw new Error("This link does not contain a STEP file.");
    if (!Number(info.size) || Number(info.size) > shareLimit) throw new Error("Shared STEP files must be between 1 byte and 250 MB.");
    if (info.capabilities?.canDownload === false) throw new Error("The sender has disabled downloads for this file.");
    return info;
  }

  async download(file) {
    const info = await this.publicFile(file);
    const response = await this.publicRequest(file, { alt: "media" });
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > shareLimit) { await reader.cancel(); throw new Error("Shared file exceeds the 250 MB limit."); }
      chunks.push(value);
    }
    return new File(chunks, info.name, { type: "application/octet-stream" });
  }
}
