// One source of truth for reader reconstruction, builder, WebGL and print.
// Photo quadrant labels follow the JPG's EXIF-displayed orientation, as in
// the author's numbered physical-sheet reference. B coordinates stay raw.
export const A2 = Object.freeze({ widthMm: 420, heightMm: 594 });
export const PAPER = Object.freeze({ widthMm: 210, heightMm: 297, overhangMm: 12.7, thicknessMm: 0.12 });
export const QUADRANTS = Object.freeze({
  topLeft: Object.freeze({ x: 0, y: 0, width: .5, height: .5 }),
  topRight: Object.freeze({ x: .5, y: 0, width: .5, height: .5 }),
  bottomLeft: Object.freeze({ x: 0, y: .5, width: .5, height: .5 }),
  bottomRight: Object.freeze({ x: .5, y: .5, width: .5, height: .5 }),
});
// All supplied First Edition photo sides have EXIF=3. Display previews retain
// encoded pixels, so translate a displayed panel into that raw crop exactly
// once, independently of the panel's folding rotation and the B-file map.
export function photographicSource(quadrant, rotation) {
  const rect = QUADRANTS[quadrant];
  const sourceRect = Object.freeze({ x: 1 - rect.x - rect.width, y: 1 - rect.y - rect.height,
    width: rect.width, height: rect.height });
  const sourceQuadrant = Object.keys(QUADRANTS).find(key => QUADRANTS[key].x === sourceRect.x && QUADRANTS[key].y === sourceRect.y);
  return { sourceRect, sourceQuadrant, sourceRotation: (rotation + 180) % 360 };
}
export const IMPOSITION_MAP = Object.freeze(Array.from({ length: 8 }, (_, i) => Object.freeze({
  sheet: i + 1,
  quadrants: Object.freeze(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].map((position, n) => Object.freeze({
    position, pageNumber: [1 + i * 2, 32 - i * 2, 2 + i * 2, 31 - i * 2][n], rotation: n < 2 ? 180 : 0,
  }))),
})));

// B production layouts have their own printed folio positions. Select the
// matching NUMBER; never apply a blanket mirror to the photographic quadrant.
// Inspection of both supplied B collections: TL=32, TR=1, BL=31, BR=2 on 01B,
// following the same numbering pattern on sheets 02–08.
export const FOLIO_MAP = Object.freeze(Array.from({ length: 8 }, (_, i) => Object.freeze({
  sheet: i + 1,
  quadrants: Object.freeze(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].map((position, n) => Object.freeze({
    position, pageNumber: [32 - i * 2, 1 + i * 2, 31 - i * 2, 2 + i * 2][n], rotation: n < 2 ? 180 : 0,
  }))),
})));
export const REVERSE_REGISTRATION = 'front-aligned-production / matched-folio-number';
export function pageMapping(pageNumber) {
  const sheet = IMPOSITION_MAP.find(s => s.quadrants.some(q => q.pageNumber === pageNumber));
  if (!sheet) throw new Error('Invalid reader page.');
  const quadrant = sheet.quadrants.find(q => q.pageNumber === pageNumber);
  const rect = QUADRANTS[quadrant.position];
  const folio = FOLIO_MAP[sheet.sheet - 1].quadrants.find(q => q.pageNumber === pageNumber);
  // The second fold brings the top/bottom B panels in the same column face
  // to face. These are the two hidden surfaces inside one folded leaf.
  const foldedMate = FOLIO_MAP[sheet.sheet - 1].quadrants.find(q =>
    q.position !== folio.position && QUADRANTS[q.position].x === QUADRANTS[folio.position].x);
  const number = String(sheet.sheet).padStart(2, '0');
  return Object.freeze({ pageNumber, sheet: sheet.sheet, quadrant: quadrant.position,
    rotation: quadrant.rotation, rect, side: pageNumber % 2 ? 'right' : 'left',
    ...photographicSource(quadrant.position, quadrant.rotation),
    sourceId: `${number} FIRST EDITION`, sourceFilename: `${number} FIRST EDITION.jpg`,
    reverse: Object.freeze({ firstId: `${number}B FIRST EDITION`, customId: `${number}B CUSTOM EDITION`,
      filename: `${number}B FIRST EDITION.jpg`, customFilename: `${number}B CUSTOM EDITION.jpg`,
      pageNumber, quadrant: folio.position, rect: QUADRANTS[folio.position], rotation: folio.rotation,
      foldedMate: Object.freeze({ pageNumber: foldedMate.pageNumber, quadrant: foldedMate.position,
        rect: QUADRANTS[foldedMate.position], rotation: foldedMate.rotation }),
      uvFlipX: true, registration: REVERSE_REGISTRATION }),
  });
}
export const READER_MAP = Object.freeze(Array.from({ length: 32 }, (_, i) => pageMapping(i + 1)));
// Cover panel assignment confirmed by the author, in raw source coordinates.
// Explicit B panels preserve the paired cover's credits / END / BEGIN artwork.
// They are cover functions, not numbered reader folios.
export const COVER_MAP = Object.freeze({ front: Object.freeze({ quadrant: 'bottomRight', rotation: 0, reverseQuadrant: 'bottomLeft', foldedMate: 'insideFront' }),
  back: Object.freeze({ quadrant: 'bottomLeft', rotation: 0, reverseQuadrant: 'bottomRight', foldedMate: 'insideBack' }),
  insideFront: Object.freeze({ quadrant: 'topRight', rotation: 180, reverseQuadrant: 'topLeft', foldedMate: 'front' }),
  insideBack: Object.freeze({ quadrant: 'topLeft', rotation: 180, reverseQuadrant: 'topRight', foldedMate: 'back' }) });
export function getPoster(book, index) {
  const map = IMPOSITION_MAP[index];
  if (!map) throw new Error('Invalid poster sheet.');
  return { sheet: map.sheet, quadrants: map.quadrants.map(quadrant => ({ ...quadrant,
    page: book.pages[quadrant.pageNumber - 1], mapping: READER_MAP[quadrant.pageNumber - 1] })) };
}
export function printPlan(book, { duplex = false } = {}) {
  const first = book.edition === 'first';
  const coverId = first ? '00. COVER' : book.cover.assetId || 'custom:00. COVER';
  const coverReverseId = first ? '00B COVER' : '00B CUSTOM EDITION';
  const sheets = [{ kind: 'cover', cover: book.cover, sourceId: coverId, reverseId: coverReverseId },
    ...IMPOSITION_MAP.map((_, index) => ({ kind: 'interior', ...getPoster(book, index),
      sourceId: first ? `${String(index + 1).padStart(2, '0')} FIRST EDITION` : null,
      reverseId: `${String(index + 1).padStart(2, '0')}B ${first ? 'FIRST' : 'CUSTOM'} EDITION` }))];
  return duplex ? sheets.flatMap(sheet => [{ ...sheet, face: 'front' }, { ...sheet, face: 'reverse' }]) : sheets;
}
// PDF uses a bottom-left origin, unlike source JPEGs.
export function quadrantRect(position, width, height) {
  return { x: position.endsWith('Right') ? width / 2 : 0,
    y: position.startsWith('top') ? height / 2 : 0, width: width / 2, height: height / 2 };
}
