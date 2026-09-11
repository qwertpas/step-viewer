export class CadClient {
  constructor() {
    this.worker = new Worker(new URL("./import-worker.js", import.meta.url), { type: "module" });
    this.pending = new Map();
    this.id = 0;
    this.worker.onmessage = ({ data }) => {
      const request = this.pending.get(data.id);
      if (!request) return;
      this.pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data.result);
    };
    this.worker.onerror = () => this.close("The CAD reader stopped. Please reopen the file.");
  }

  request(type, data) {
    if (this.error) return Promise.reject(new Error(this.error));
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, ...data }, data.buffer ? [data.buffer] : []);
    });
  }

  close(message = "CAD model closed") {
    this.error = message;
    this.worker.terminate();
    for (const request of this.pending.values()) request.reject(new Error(message));
    this.pending.clear();
  }
}
