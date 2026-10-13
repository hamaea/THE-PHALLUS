# Asset and physical-book integration

## Files changed

- `script.js`, `style.css`: centered First Edition 3D hero, editable 3D Assembly, two image-only photo strips, mouse/touch placement and replacement without scene recreation, synchronized reading cursor, worker PDF download. Existing routes and commerce retained.
- `js/assets.js`, `js/assets-data.js`, `tools/build-assets.py`: all four supplied collections, stable IDs, dynamic folder scan, aspect-preserving display copies, raw print coordinates despite EXIF rotation, saved legacy asset lookup.
- `js/imposition.js`, `js/book.js`, `js/book-surfaces.js`: shared page map, First Edition's EXIF-display-to-raw crop conversion, unchanged B pairing and hidden folios, facing pairs and cover surfaces.
- `js/book-3d.js`, `js/book-viewer.js`, `js/paper-motion.js`, `js/texture-worker.js`: shared viewer, two persistent cover flaps with fixed hinges and shared front/back geometry, physical paper depths, stable landing meshes, momentum turns, existing two-surface curls and bounded resources.
- `js/pdf.js`, `js/pdf-worker.js`: 18 original-resolution A2 front/back sides, original First Edition sheets, shared custom page clips/rotations, purchase gate and off-thread PDF generation.
- `js/storage.js`, `js/migration.js`: v3 model, non-destructive v2 page-portion migration, retained v1 backup/snapshot support.
- `tools/serve.py`, `tools/verify-assets.py`, `requirements.txt`, `package.json`: preview/asset tooling and asset-integrity checks.
- `tests/book.test.js`, `tests/pdf.test.js`, `tests/browser-flow.mjs`, `tests/verify-printed-halves.py`: conventional spread, physical mapping, duplex export, paper motion and full browser regression coverage.
- `README.md`, `IMPLEMENTATION.md`: run instructions, mapping, implementation and verification limits.
- `assets NEW/`: 75 source JPEGs copied from the supplied project folder without changes. `assets/updated-previews/`: derived display copies. `vendor/three.*`: local Three.js modules and license.

## Completed validation

- 27 unit/PDF tests pass: all 32 photo crops and their EXIF conversion, unchanged B mapping, paired B quadrants, cover support, momentum, centering, layer clearance, assignments and storage.
- Focused cover browser test passes: held mid-flip, persistent mesh/geometry identities, fixed open-cover margins across reader states, repeated front/back reversals and matching final/resting vertices. Actual cover and first spread match the supplied physical references.
- Browser regression passes: closed/open/back covers, all reader pages, actual horizontal drags, curl/release, cancelled turns, backward/button/keyboard navigation, gallery loading, drag/drop/replacement/removal, cover selection, finish/edit propagation, custom 3D, all eight poster maps, persistence, bag/checkout, worker PDF download, reset cancellation/confirmation and mobile native touch.
- Eight rasterized interior photo sides pass pixel checks for distinct left/right portions and independent upper-quadrant rotations.
- All 75 source JPEGs are SHA-256 identical to their originals. All source/preview paths resolve, IDs are unique, filenames/aspect ratios are preserved and print previews retain raw orientation.
- Desktop/mobile screenshots inspected. No page errors or failed asset requests in the browser suite.

## Remaining limits

The latest correction supersedes the earlier reverse-column assumption: B files are front-aligned production layouts paired by printed folio number. Original white graphic areas remain intact. Cover panels remain front bottom-right, back bottom-left, inside front top-right and inside back top-left; upper panels rotate 180°.

Paper uses continuous analytical bending/curling, not a full material simulation. Physical mobile devices and non-Chromium browser engines were not tested. PDFs retain original RGB/resolution without printer-specific bleed, CMYK or crop marks. Checkout/storage remain the existing local prototype.
