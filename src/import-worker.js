import OcctJS from "@tx-code/occt-js";
import wasmUrl from "@tx-code/occt-js/dist/occt-js.wasm?url";
import { CadWorker } from "./cad-worker.js";

const importer = OcctJS({ locateFile: () => wasmUrl, onProgress: (stage) => worker.progress(stage) });
const worker = new CadWorker(importer, (message, transfer) => self.postMessage(message, transfer));
self.onmessage = ({ data }) => worker.request(data);
