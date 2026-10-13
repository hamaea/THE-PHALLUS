# THE PHALLUS

The existing static HTML/CSS/native JavaScript prototype, with the supplied photography, conventional reader order, a reusable Three.js book and duplex A2 export. Routing, drag/drop, replacement, image selection, bag snapshots and simulated checkout remain in place. No React migration, backend or payment service was added.

## Run

```sh
python3 tools/serve.py
```

Open http://127.0.0.1:8000. The server refreshes the asset manifest when Pillow is available; otherwise it uses the checked-in manifest and previews. `npm start` runs the same server. JavaScript modules require HTTP, rather than opening the HTML file directly.

To regenerate previews after adding/removing supplied images:

```sh
python3 -m pip install -r requirements.txt
python3 tools/build-assets.py
```

Original images live in `assets NEW/`, retaining their folders and filenames. Only display copies are written to `assets/updated-previews/`. The gallery is scanned into a generated manifest; filename-based IDs do not depend on array order. Removed older gallery assets remain resolvable for saved editions, without appearing as duplicate library entries.

The homepage hero is the First Edition 3D book. The six photographic hero assets remain intact and hidden. Closed covers center independently; opening and closing shift the camera smoothly to/from the centered spread.

## Reading and assembly

Assembly opens the shared editable 3D book at pages 2–3. Two independent image-only scrolling rows contain horizontal and vertical photographs. Drops raycast the visible paper meshes; portrait photos fill one page and horizontal photos fill an actual facing pair. Pages 1/32 take vertical photos. Replacing either half clears its linked placement. Touch users can swipe a row or drag a photo upward onto the book; selecting a photo and clicking a page is also supported. Placement changes update front textures without replacing the scene, camera or page meshes.

Completion still requires all 32 positions. Assembly uses the fixed supplied Custom Edition cover and folios; neither is editable. Previous bag/purchased snapshots remain independent. Edits invalidate completion and increment revision.

`js/imposition.js` is the physical source of truth. Photographic quadrant labels below follow the author's EXIF-displayed sheet reference; `photographicSource()` converts First Edition labels to the raw preview crops and composes the 180° display orientation with each folding rotation. B coordinates remain unchanged:

| Sheet | Top left / 180° | Top right / 180° | Bottom left / 0° | Bottom right / 0° |
| --- | --- | --- | --- | --- |
| 01 | 1 | 32 | 2 | 31 |
| 02 | 3 | 30 | 4 | 29 |
| 03 | 5 | 28 | 6 | 27 |
| 04 | 7 | 26 | 8 | 25 |
| 05 | 9 | 24 | 10 | 23 |
| 06 | 11 | 22 | 12 | 21 |
| 07 | 13 | 20 | 14 | 19 |
| 08 | 15 | 18 | 16 | 17 |

B production files stay paired by printed folio number: sheet 01 is TL=32, TR=1, BL=31, BR=2 in encoded pixels. Page 7 uses the displayed top-left photograph (raw bottom-right, upright) and B folio 7 from raw top-right. Each folded leaf's hidden faces remain the top/bottom B quadrants in one column. Both editions' supplied cover panels convert to raw TL/180° front, TR/180° back, BL/0° inside front and BR/0° inside back. This recovers the actual printed title cover and first bedding photograph. Selected Custom Edition image frames and print assignments are unchanged.

The print JPEGs carry EXIF orientation=3. Their display copies deliberately ignore that tag and retain raw pixel coordinates; ordinary gallery/hero photos receive normal EXIF handling. Both editions' supplied cover photographs are identical and use the same corrected panel crops and rotations; Custom Edition keeps its separate B artwork. Originals remain unchanged.

## Interactive book

Drag within the outer half horizontally to turn; drag upward from a bottom corner to curl. Gesture direction locks using pointer capture. Turns commit after 14% of one page width, or a forward flick past a 4.5% dead zone; moderate flicks commit past 8%. A completed drag stays committed through small release movements. To cancel, return within 6% of the starting edge, or flick back at least 20% while within the first 35% of the turn. Recent velocity uses a 120 ms window. Interrupted turns use their last real drag position rather than cancellation-event coordinates. The critically damped release retains aligned momentum within its no-overshoot limit and returns cancelled turns without an outward rebound. Thresholds/speeds are in `TURN_SETTINGS`. Arrow buttons and Left/Right keys navigate; Home/End show the covers. Gallery dragging temporarily disables these book gestures.

The assembled book has sixteen folded leaves at one spine and two persistent flaps of the folded cover, each with shared front/back geometry. Covers extend 12.7 mm beyond interior edges, curve down from a fixed hinge when open, and remain in place under all reader states. Stack meshes represent only hidden packets below the textured exposed leaf. A turn stays flat until its moving verso and revealed page textures are ready. Subdivided arc-length turns retain the active mesh through landing. The existing wide corner curl, paired B reveal and configurable `CURL_SETTINGS.maxFoldDistance = 1.2` remain intact.

One viewer serves Home's First Edition, editable Assembly, finished custom books and saved/purchased previews. The 2D reading and poster views remain available outside Assembly; WebGL failure opens its editable reading fallback. Navigation changes only UI state, never placements.

Preview decoding/composition runs in a worker at 768×1086 pixels (slightly taller for covers). Visible surfaces and adjacent pages are cached, with a limit of 18 GPU textures after pending requests resolve. Inactive geometry, textures, bitmaps, workers, listeners and renderers are disposed. Animation pauses offscreen and stops at rest. Poster navigation preserves the existing WebGL instance.

## A2 export

After simulated checkout, export generates **18 A2 sides** in this order: cover front/back, then sheet 01 front/back through sheet 08 front/back. All PDF sides are 420×594 mm. The cover's visible overhang is modeled separately in preview geometry.

First Edition embeds the complete original print layouts directly. Custom export clips each canonical page/spread portion and applies the same corrected sheet rotations as the viewer. B originals are embedded as supplied in front-aligned production registration. Every unique original JPEG is embedded once. Composition, clipping and page transforms remain vector operations. The browser generates PDFs in a worker.

Debug labels and numbered proof are optional and off by default for print. Print at actual size / 100%; verify the printer's duplex orientation with a paper proof.

## Persistence

The current key is `the-phallus.prototype.v3`. Existing v2 full-spread placements on old 1–2 pairs migrate into independent page portions retaining their exact crop frames; the original v2 key is never overwritten or removed. Existing v1 four-slot migration remains supported, retaining its original backup and snapshots. Migration preserves bag/order records. Storage/purchases remain browser-local and checkout is simulated.

## Verification

```sh
node --test tests/*.test.js
python3 tools/verify-assets.py
python3 tests/verify-printed-halves.py
node tests/browser-flow.mjs
node tests/cover-continuity.mjs
```

Pixel proof needs Pillow and Poppler. Browser tests need a local server, Playwright and Chromium; optional `PLAYWRIGHT_MODULE`, `CHROME_EXECUTABLE`, `PROTOTYPE_URL` point to existing installations. Outputs go to ignored `tmp/pdfs/`.

Open http://127.0.0.1:8000/?mapping=1#/home for the development-only mapping inspector. It displays all 32 source sheets, quadrants, rotations, side positions and B crop coordinates. It is restricted to localhost and absent from normal views.

## Limits

Paper bending uses analytical deformation rather than a finite-element material simulation. Visual and gesture tests ran in desktop/mobile Chromium, including native touch input, but not on physical iOS/Android devices. PDF export preserves supplied resolution/RGB; it does not add bleed, crop marks, CMYK conversion or a printer profile. Larger custom editions can produce large PDFs.

Three.js 0.180.0 and pdf-lib 1.17.1 are bundled locally with their licenses in `vendor/`; the app needs no CDN at runtime.
