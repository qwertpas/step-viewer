# OCCT runtime for step-viewer

This viewer uses Open CASCADE Technology (OCCT) 7.9.3 and the `@tx-code/occt-js` bridge. Their source is available under LGPL 2.1; OCCT also provides the exception included in [licenses/OCCT-exception.txt](licenses/OCCT-exception.txt). The complete LGPL text is in [licenses/LGPL-2.1.txt](licenses/LGPL-2.1.txt). Bridge modifications in `kernel.patch` are distributed under LGPL 2.1. OCCT modifications in `occt.patch` retain LGPL 2.1 with the OCCT exception.

The JavaScript and WebAssembly runtime also include Emscripten, musl, and LLVM runtime code. Their complete notices and licenses are included in `licenses/`.

## Source and toolchain

| Component | Pinned revision | Source |
| --- | --- | --- |
| occt-js 0.1.14 | `ad8ffb6007eb3fd25179232f291b626d6e78a195` | [Bridge source](https://github.com/tx-code/occt-js/tree/ad8ffb6007eb3fd25179232f291b626d6e78a195) |
| OCCT 7.9.3 | `a016080bf6738d6aeae020badee4e888ad1540a5` | [OCCT source](https://github.com/Open-Cascade-SAS/OCCT/tree/a016080bf6738d6aeae020badee4e888ad1540a5) |
| Emscripten | `4.0.10` | [Compiler/runtime source](https://github.com/emscripten-core/emscripten/tree/4.0.10) |
| SDK installer | `5eb0bde7585670252e8ba05e9d361627bffd08b5` | [SDK source](https://github.com/emscripten-core/emsdk/tree/5eb0bde7585670252e8ba05e9d361627bffd08b5) |

The complete patched bridge and OCCT source, build files, and public upstream test fixtures are available in [source.tar.gz](source.tar.gz). This archive excludes Git history, build products, the SDK, and user models. `kernel.patch` contains every change from the bridge revision above. `occt.patch` contains the three changes to the OCCT submodule listed below. `SHA256SUMS` identifies the distributed runtime files and source archive.

## Changes

- Compile with `-O3` and thin link-time optimization, preserving normal floating-point semantics and the existing tessellation settings.
- Build edge-to-face ownership in one traversal and reserve mesh output storage before extraction.
- Avoid assembly-wide color searches and new labels for faces without existing labels. Existing labels retain OCCT's location and shared-shape resolution.
- Skip XDE layers, validation properties, GD&T, physical material metadata, saved views, and generic metadata that the bridge does not export. Geometry, source RGB colors, names, units, and assembly transforms remain available.
- During non-enforced, silent SameParameter repair, check each successfully repaired located edge once while retaining all incident-face checks, failed retries, forced repair, and message-producing behavior.
- Reuse surfaces when their validation transform is the identity, and reuse each unchanged mesh midpoint evaluation.
- Retain lazy face, edge, and vertex maps with each exact model for repeated measurements.
- Report native import phases through the factory's `onProgress(stage)` callback and elapsed milliseconds through `result.timings`.

## Rebuild and replace

Install Git, CMake, Ninja, Python 3, Node.js, and Bash. Run this script with a new, empty work directory:

```sh
BUILD_JOBS=6 bash vendor/occt-js/rebuild.sh /tmp/step-viewer-cad-build
```

The script downloads the pinned sources and SDK, applies both patches, compiles the runtime, generates its ESM entry, runs relevant import/measurement contracts, and replaces this package's `dist/` files. The source checkout, build files, and SDK remain in the chosen work directory so they can be inspected or modified. Building requires several gigabytes of disk space and can take tens of minutes.

To use a modified library, edit the checkout in that work directory, rebuild it with the activated SDK, regenerate the ESM entry using `tools/generate_esm_runtime_entry.mjs`, and copy the four `dist/occt-js.*` files into this package. The application loads those files through its local `file:vendor/occt-js` dependency. Then run the application's tests and build. The runtime is a separate replaceable WebAssembly module; no signed or locked binary is required.

## Verification

The final runtime passes 53 upstream import/measurement contracts. Complete exported scenes match the original runtime on six public STEP, IGES, and BREP fixtures, including colored faces, assemblies and inch units. A full raw scene comparison on the user's 550-geometry Pinto assembly also matches every mesh array, topology entry, name, color, unit and transform. Timings and the transient exact-model ID are excluded from comparisons. User models are not redistributed.

## Progress API

`onProgress` receives `read`, `transfer`, `mesh`, `extract`, and `output` during STEP import. Successful exact imports include `timings` with `readMs`, `transferMs`, `meshMs`, `extractMs`, `outputMs`, and `totalMs`. All durations are milliseconds. The read/transfer timings describe STEP; those two fields are zero for the other import formats.
