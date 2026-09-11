Browser-based viewer for drag and drop `.step` and `.stp` CAD files. Great for quickly visualizing CAD files to send or receive from others.

![STEP Viewer demo](assets/stepviewer.gif)

All processing is done on your machine. There is no server.

Preserves STEP part and face colors, with assembly visibility controls. STEP parsing and exact measurements run in a worker to keep the viewer responsive.

### Selection and measurements

- Click a part to select it; **V** hides or restores it. Hidden parts stay selected until cleared.
- **M** toggles measurement mode. Click a face or edge, then **Shift-click** another to measure minimum distance. Shift-click also starts measurement mode from normal selection.
- Select a circular edge or cylindrical face for diameter/radius, a straight edge for length, or a face for area. Two supported circular entities also show center distance.
- **Esc** clears selection. Drag rotates; Shift-drag pans.

Measurements use retained OpenCascade B-rep faces and curves, **not triangle distances or fitted circles**. Results are in millimeters, subject to the source CAD model and kernel tolerances; displayed values are rounded to four decimal places. Unsupported queries report an error, never a mesh estimate.

Tessellation is used only for display and picking. Geometry is shared across assembly instances; adjacent same-color draw groups are merged without changing topology IDs. CAD edges are imported directly. The viewer redraws on changes, not continuously while idle.

The CAD dependency is pinned to upstream commit `ad8ffb6007eb3fd25179232f291b626d6e78a195` because the npm release does not yet include the exact-model APIs. Its bundled Wasm is used without a custom build.

Development: `npm install`, then `npm run dev`. Verify with `npm test` and `npm run build`.

<https://qwertpas.github.io/step-viewer/>
