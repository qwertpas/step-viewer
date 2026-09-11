Browser-based viewer for drag and drop `.step` and `.stp` CAD files. Great for quickly visualizing CAD files to send or receive from others.

![STEP Viewer demo](assets/stepviewer.gif)

All processing is done on your machine. There is no server.

Preserves STEP part and face colors, with assembly visibility controls. STEP parsing runs in a worker to keep the viewer responsive.

Development: `npm install`, then `npm run dev`. Verify with `npm test` and `npm run build`.

<https://qwertpas.github.io/step-viewer/>
