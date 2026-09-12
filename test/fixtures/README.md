`bracket.step` is the test bracket from [stefangolas/look](https://github.com/stefangolas/look/blob/33d121975acc82eb0f2a57c6b1043ec4e1ac6ad5/tests/fixtures/bracket.step), used under the included MIT license.

`nested-brackets.step` derives from that same fixture under the included MIT license. Its bracket B-rep is unchanged; step-viewer renamed the product to `Bracket` and added assembly definitions and placements. The hierarchy is `Viewer fixture` → `Left bank` / `Right bank` → `Bracket pair` → two bracket occurrences. Each pair places its second bracket 90 mm along X; the right bank is translated 80 mm along Y. This provides four displayed bodies from one shared geometry and four tree levels without including any private model.

The browser tests use known points on the original bracket: `(30,20,12)` on the main top face, `(-5,-5,22)` on the raised annulus, and `(9/√2,-9/√2,22)` on its outer circular edge. OCCT verifies a top-face area of `2336.382748764807 mm²`, a `10 mm` minimum distance between the two faces, and an `18 mm` outer diameter. The stored click coordinates correspond to the initial fitted view at the browser test configuration's 1440 × 900 viewport.

Large model benchmarks use local STEP files supplied on the command line; they are not published with the viewer.
