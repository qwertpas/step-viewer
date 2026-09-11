import OcctJS from "@tx-code/occt-js";
import wasmUrl from "@tx-code/occt-js/dist/occt-js.wasm?url";

let importer;
self.onmessage = async ({ data }) => {
  try {
    importer ||= OcctJS({ locateFile: () => wasmUrl });
    const occt = await importer;
    const result = occt.ReadStepFile(new Uint8Array(data), {
      linearUnit: "millimeter", linearDeflectionType: "bounding_box_ratio",
      linearDeflection: 0.001, angularDeflection: 0.5, readColors: true, readNames: true,
    });
    if (!result.success || !result.geometries.length) throw new Error("No solid geometry was found");
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Could not read this file" });
  }
};
