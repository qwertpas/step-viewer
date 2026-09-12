# Local browser checks

This packages the visible browser harness used for the performance rewrite. It serves both production builds on one local origin, accepts a STEP file through the browser's native picker, and starts only when someone clicks **Run browser benchmark** or **Run regression checks**. No Playwright, CDP, or external browser automation is involved.

From the current repository root, prepare the original checkpoint in a separate checkout:

```sh
viewer_repo="$PWD"
viewer_baseline="$(mktemp -d)/step-viewer-baseline"
git worktree add --detach "$viewer_baseline" 44a9363
git -C "$viewer_baseline" apply "$viewer_repo/scripts/browser-check/baseline.patch"
npm --prefix "$viewer_baseline" ci
npm --prefix "$viewer_baseline" run build -- --base ./
npm run build -- --base ./
node scripts/browser-check/server.mjs "$viewer_baseline/dist" 5180
```

The port defaults to `5180`. The current build and public fixtures are located relative to this script's repository, so the server can be started from another working directory. Both builds must use `--base ./` so their assets and workers load under `/before/` and `/after/`. The server binds only to `127.0.0.1` and prints a new OS temporary directory for `results.json` and `regression-results.json`. Each run updates those files; copy reports elsewhere before rerunning if you want to keep them.

`baseline.patch` exactly reproduces the instrumentation used with checkpoint `44a9363`: clear performance entries at import start, mark the worker response, and measure import/display/load after the fitted view's next animation frame. It also adds the original visible timing overlay. The current viewer already includes these measures. An uninstrumented original build cannot complete the benchmark; for another baseline revision, apply the same three measurement locations and keep their names and endpoints identical. The server separately injects a Worker message observer into both builds to collect timings and statistics without retaining geometry.

Open the printed URL in Brave manually or through Computer Use. Choose the local STEP file with the visible native file input, keep the browser window and viewer visible, leave three measured rounds and one warmup selected, then click **Run browser benchmark**. Each version gets a fresh iframe per round followed by a repeat open in that same iframe. Version order alternates each round; the warmup is recorded but excluded from medians. **Stop after current load** saves partial results. The selected CAD bytes remain in the browser; reports contain the filename, byte count, timings, counts, browser/viewport information, and build paths/WASM hashes.

The JSON contains all samples and first/repeat median speedups. Durations are milliseconds:

| Field | Measured interval |
| --- | --- |
| `loadMs` | File-input handler start through the app's display-ready animation frame. |
| `importMs` | Handler start through the worker result, including file reading and any remaining worker initialization. |
| `displayMs` | Worker result through scene construction, UI update, camera fit, and the display-ready frame. |
| `workerMs` | Open request sent to worker result received. |
| `timings` | Available native read/transfer/mesh/extract/output phases plus kernel, repair, packing, and hashing durations; older builds may provide none. These intervals overlap and must not be summed. |
| `phases` | Worker progress events relative to the start of the load. |

Use **Open regression checks**, then **Run regression checks**, to exercise cached opens and failed replacements; lazy nested tree visibility with undo/redo; exact face area, distance and diameter; and section offset, clipping, Flip, Pick face and Clear. These checks use the included public fixtures at a fixed 1440 × 900 iframe size and save a separate report.

First opens use fresh application instances within the same running browser. They do not represent a cold browser process, empty OS caches, or network download performance. Initialization may overlap the interval before file selection, as it does in the viewer. The display-ready measure is an application animation-frame boundary, not a GPU fence or screenshot assertion. Displayed part and triangle counts must match across imports, but count equality does not prove geometry equality; use `scripts/check-cad.mjs` for that. Regression checks send DOM file, keyboard and pointer events, with pointer-capture bookkeeping emulated for synthetic pointers; native gestures, dragging, Google Drive authorization and sharing are not covered.
