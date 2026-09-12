# Performance measurements

## Measured result

Measured on 12 September 2026 on an Apple M2 (8 cores, 16 GiB), using `pinto1.step` (23.6 MB, 1,072 displayed bodies). The baseline is checkpoint `44a9363`; the optimized runtime is `0.1.14-step-viewer.2`.

| Browser loading path | Original median | Optimized median | Speedup |
| --- | ---: | ---: | ---: |
| Fresh viewer, first file open | 13.008 s | 9.588 s | 1.36× |
| Reopen the active file | 12.148 s | 0.261 s | 46.52× |

**The 3× fresh-load target was not reached.** Reopening the active file uses retained CAD and cached mesh buffers; it does not repeat the import. Closing/reloading the viewer or opening another file requires a new import.

Brave ran three alternating measured rounds after one excluded warmup, with a fresh viewer iframe per version per round. All samples are retained in [browser-performance.json](browser-performance.json). Original first opens ranged from 12.703–13.115 s; optimized first opens ranged from 9.057–25.192 s. The optimized outlier included much longer native transfer and mesh phases; its cause was not established. These three-sample medians are measurements on this machine, not a latency guarantee.

The timer runs from the file-input handler through the application's display-ready animation frame, including file reading, remaining worker initialization, import, transfer, scene construction, and UI updates. Builds were served locally, with compilation stopped. A fresh iframe does not mean a cold browser or empty WebAssembly code cache, and this does not measure first-visit network download. The optimized WASM is larger: 25.95 MB versus 11.47 MB uncompressed, approximately 7.56 MB versus 4.55 MB gzipped. Worker initialization begins before file selection, so network and compilation costs can overlap that interval.

The run was started in Brave using Computer Use. The visible harness coordinates production viewer frames using in-page file events; no AppleScript or external browser automation was used for these measurements. See [the browser harness instructions](../scripts/browser-check/README.md) to reproduce both the timing run and functional checks.

Validation: 53 application tests and 53 upstream native contracts pass. Complete raw Pinto and six public STEP/IGES/BREP scenes match the original runtime; the viewer's repaired Pinto scene also matches every exported field except timing and transient model ID. Four Brave regression cases cover 117 assertions for failed replacements, cached opens, nested visibility/undo/redo, exact measurements, and sections. CAD bytes are not included in the reports or repository.

## CAD kernel benchmark

Preserve the original `@tx-code/occt-js` package in a separate directory before installing the optimized package, then run on an idle machine:

```sh
node --expose-gc scripts/benchmark-cad.mjs /path/to/model.step /path/to/original/occt-js 3 > /tmp/cad-performance.json
```

The second argument is the original package directory containing `package.json` and `dist`; the optimized runtime is the package installed in this checkout. Both versions receive the same bytes and the viewer's tessellation options through `openCad`. The benchmark measures the CAD kernel as WebAssembly in Node.js, including missing-face repairs. It excludes worker messaging, packing, scene construction, network transfer, and browser first paint. Its speedup is a component measurement, not an end-to-end browser loading claim.

Each version gets one persistent runtime. Factory initialization uses preloaded WASM bytes and excludes JavaScript module loading and file I/O. Initialization and the first import are recorded separately; those first imports warm the runtimes and are excluded from the summary. Measured imports then alternate original/optimized order for the requested rounds, with explicit garbage collection beforehand and exact-model release afterward. Every import executes OCCT; the active-file cache is bypassed. JSON includes all first and warm samples, initialization times, available phase timings, medians/minima/maxima, input and runtime SHA-256 hashes, and environment information. `identicalRuntime: true` identifies a control run comparing the same binary. Counts and lifecycle checks catch incomplete imports; use `scripts/check-cad.mjs` separately to verify full scene equality against an original snapshot.

## Display and interaction benchmark

Run from the project checkout after `npm ci`. The benchmark accepts a local Node `v8.serialize` snapshot of an `openCad` result and a baseline checkout; CAD files and snapshots are not bundled in this repository.

```sh
git worktree add --detach /tmp/step-viewer-before 44a9363
node --expose-gc scripts/benchmark-display.mjs /tmp/pinto-cad.bin /tmp/step-viewer-before 5 > /tmp/display-performance.json
```

To create a snapshot from another local STEP file, run:

```sh
node --input-type=module - /path/to/model.step /tmp/model.bin <<'JS'
import { readFile, writeFile } from 'node:fs/promises';
import { serialize } from 'node:v8';
import OcctJS from '@tx-code/occt-js';
import { openCad } from './src/cad.js';
const [file, snapshot] = process.argv.slice(2);
const occt = await OcctJS();
const result = openCad(occt, new Uint8Array(await readFile(file)));
try { await writeFile(snapshot, serialize(result)); }
finally { occt.ReleaseExactModel(result.exactModelId); }
JS
```

Both implementations receive the same typed geometry buffers and use the main project's dependency versions. Baseline source is copied to a temporary directory, which is removed afterward; the supplied checkout remains unchanged. This measures scene construction and CPU interaction code. STEP import, worker transfer, DOM construction, shader compilation, GPU rendering, and network transfer are outside this benchmark.

Before timing, the script checks component names, transforms, handles, vertex/normal/index buffers, material groups/colors, edge buffers/IDs, and fit extents. It compares exact part and triangle identities for 462 rays from three axes, both with and without clipping. Nine cut planes check every intersecting body for matching open/closed contours and area within `1e-5` relative error (or `1e-5` square units for areas below one). A separate 160,000-triangle torus knot checks dense sections.

Each path is warmed once, then measured in alternating baseline/current order with explicit garbage collection before each run. JSON includes all samples, minimum, maximum, median, and speedup. Times are milliseconds per operation: each batch time is divided by its operation count. Geometry/BVH construction is included in `build`; section and picking timings reuse those structures. Run on an idle machine, retain the JSON, and distinguish these component measurements from browser load times.

The final five-round measurements below used the same Pinto snapshot with native compilation and the browser benchmark stopped. Complete imported and display geometry matched; all 924 picks and 326 body sections matched, with maximum relative section area difference `2.95e-9`. Raw samples are in [display-performance.json](display-performance.json).

| CPU path | Original median | Optimized median | Speedup |
| --- | ---: | ---: | ---: |
| Scene construction, including interaction indexes | 46.319 ms | 124.666 ms | 0.37× |
| Picking | 1.334 ms | 0.0266 ms | 50.09× |
| Picking with clipping | 1.534 ms | 0.0278 ms | 55.16× |
| Fit bounds | 7.927 ms | 0.0289 ms | 274.09× |
| Pinto body section | 0.354 ms | 0.251 ms | 1.41× |
| Dense torus-knot section | 19.686 ms | 6.039 ms | 3.26× |

Preparing interaction indexes adds about 78 ms to this CPU scene-construction benchmark. That cost buys faster picking and sections; it is included in the browser load measurement above. These CPU operation timings do not establish corresponding frame-rate or end-to-end import gains.
