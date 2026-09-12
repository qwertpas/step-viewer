import { CadSession } from "./cad-session.js";

export class CadWorker {
  constructor(importer, send) {
    this.send = send;
    this.session = importer.then((occt) => new CadSession(occt));
    // Initialization can fail before the first request.
    this.session.catch(() => {});
    this.queue = Promise.resolve();
    this.id = null;
  }

  progress(progress) {
    if (this.id !== null) this.send({ id: this.id, progress });
  }

  request(data) {
    this.queue = this.queue.then(() => this.run(data));
    return this.queue;
  }

  async run({ id, type, ...data }) {
    this.id = id;
    let cad, result;
    try {
      if (type === "open") this.progress("initialize");
      cad = await this.session;
      if (type === "open") {
        this.progress("hash");
        const start = performance.now();
        const digest = await crypto.subtle.digest("SHA-256", data.buffer);
        const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        const hashMs = performance.now() - start;
        result = cad.open(new Uint8Array(data.buffer), key, (stage) => this.progress(stage));
        // Retain the active mesh for reopening and transfer only a slab copy.
        result = { ...result, hash: key, buffer: result.buffer.slice(0), timings: { ...result.timings, hashMs } };
        this.send({ id, result, packed: true }, [result.buffer]);
      } else {
        if (type === "commit") cad.commit(data.modelId);
        else if (type === "discard") cad.discard(data.modelId);
        else result = cad.query(type, data);
        this.send({ id, result });
      }
    } catch (error) {
      if (type === "open" && result && !result.cached) cad.discard(result.exactModelId);
      this.send({ id, error: error instanceof Error ? error.message : "CAD operation failed", fatal: !cad });
    } finally {
      this.id = null;
    }
  }
}
