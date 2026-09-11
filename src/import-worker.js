import OcctJS from "@tx-code/occt-js";
import wasmUrl from "@tx-code/occt-js/dist/occt-js.wasm?url";
import { openCad, measureCad } from "./cad.js";

const importer = OcctJS({ locateFile: () => wasmUrl });
let modelId;
self.onmessage = async ({ data: { id, type, buffer, refs } }) => {
  try {
    const occt = await importer;
    let result;
    if (type === "open") {
      result = openCad(occt, new Uint8Array(buffer));
      if (modelId) occt.ReleaseExactModel(modelId);
      modelId = result.exactModelId;
    } else if (type === "measure") {
      result = measureCad(occt, modelId, refs);
    } else throw new Error("Unknown CAD request");
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "CAD operation failed" });
  }
};
