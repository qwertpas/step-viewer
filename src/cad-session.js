import { openCad, measureCad, facePlane } from "./cad.js";
import { packCad } from "./cad-transfer.js";

export class CadSession {
  constructor(occt) {
    this.occt = occt;
    this.active = null;
    this.pending = null;
  }

  open(bytes, key, progress) {
    if (this.pending) throw new Error("A CAD model is waiting to be displayed");
    if (this.active?.key === key) {
      progress?.("cache");
      return { ...this.active.result, cached: true, timings: {} };
    }
    const result = openCad(this.occt, bytes, {}, progress);
    try {
      progress?.("pack");
      const start = performance.now();
      const packed = packCad(result);
      packed.timings = { ...result.timings, packMs: performance.now() - start };
      this.pending = { key, result: packed };
      return { ...packed, cached: false };
    } catch (error) {
      this.occt.ReleaseExactModel(result.exactModelId);
      throw error;
    }
  }

  commit(modelId) {
    if (this.active?.result.exactModelId === modelId) return;
    if (this.pending?.result.exactModelId !== modelId) throw new Error("CAD model is no longer available");
    if (this.active) this.occt.ReleaseExactModel(this.active.result.exactModelId);
    this.active = this.pending;
    this.pending = null;
  }

  discard(modelId) {
    if (this.active?.result.exactModelId === modelId) return;
    if (this.pending?.result.exactModelId !== modelId) throw new Error("CAD model is no longer available");
    this.occt.ReleaseExactModel(modelId);
    this.pending = null;
  }

  query(type, data) {
    if (!this.active) throw new Error("No CAD model is open");
    const modelId = this.active.result.exactModelId;
    if (type === "measure") return measureCad(this.occt, modelId, data.refs);
    if (type === "plane") return facePlane(this.occt, modelId, data.ref);
    if (type === "export") {
      const result = this.occt.ExportExactStepModel(modelId, data.tree);
      if (!result.success) throw new Error(result.error);
      return result.content;
    }
    throw new Error("Unknown CAD request");
  }
}
