import { pageImageFrame, spreadNumbers } from './book.js';
import { READER_MAP, COVER_MAP, QUADRANTS, photographicSource } from './imposition.js';
export function readerSurface(book, number, reverse = false) {
  const mapping = READER_MAP[number - 1];
  if (!mapping) throw new Error('Invalid reader surface.');
  if (reverse) return { assetId: book.edition === 'first' ? mapping.reverse.firstId : mapping.reverse.customId,
    rect: mapping.reverse.rect, rotation: mapping.reverse.rotation, flipX: true, pageNumber: number };
  if (book.edition === 'first') return { assetId: mapping.sourceId, rect: mapping.sourceRect, rotation: mapping.sourceRotation, pageNumber: number };
  const frame = pageImageFrame(book, number);
  return frame ? { assetId: frame.placement.assetId, frame: { x: frame.x, width: frame.width }, pageNumber: number }
    : { assetId: null, pageNumber: number };
}
export function coverSurface(book, part = 'front', reverse = false) {
  const mapping = COVER_MAP[part];
  const assetId = reverse ? (book.edition === 'first' ? '00B COVER' : '00B CUSTOM EDITION')
    : book.edition === 'first' ? '00. COVER' : book.cover.assetId || 'custom:00. COVER';
  // Both supplied cover photographs are identical EXIF=3 print layouts.
  // Apply the same display-to-raw panel transform in both editions; selected
  // gallery photos and the separately mapped B artwork keep their own frames.
  const suppliedCover = assetId === '00. COVER' || assetId === 'custom:00. COVER';
  const source = suppliedCover && !reverse ? photographicSource(mapping.quadrant, mapping.rotation) : null;
  const rect = source?.sourceRect || QUADRANTS[reverse ? mapping.reverseQuadrant : mapping.quadrant];
  // A selected photo is fitted to the full A2 sheet before folding, matching
  // coverView/PDF. Its quarter must not be refitted as a whole book cover.
  const selected = book.cover.assetId && book.edition !== 'first' && !reverse;
  return { assetId, rect, rotation: source?.sourceRotation ?? mapping.rotation,
    ...(selected ? { imposedPhoto: true } : {}),
    flipX: reverse, cover: true, part };

}
export function foldedFolioSurface(book, leaf) {
  const surface = leaf.pageNumber
    ? readerSurface(book, READER_MAP[leaf.pageNumber - 1].reverse.foldedMate.pageNumber, true)
    : coverSurface(book, COVER_MAP[leaf.surface.part].foldedMate, true);
  // This inner face looks upward; the lifted face looks downward. Leaf's
  // side transform supplies the separate left/right book orientation.
  return { ...surface, flipX: false };
}
export const BOOK_STATES = 19;
export function unfoldedSurfaces(index) {
  if (!Number.isInteger(index) || index < 0 || index > 7) throw new Error('Invalid A2 sheet.');
  const mapping = READER_MAP[index * 2];
  // Photo previews retain EXIF=3 encoded pixels. B files are viewed from the
  // back, so mirror their complete surface into front-space paper coordinates.
  return { front: { assetId: mapping.sourceId, rotation: 180, contain: true },
    back: { assetId: mapping.reverse.firstId, flipX: true, contain: true } };
}
export function spreadState(book, index) {
  const cover = part => ({ surface: coverSurface(book, part), folio: coverSurface(book, part, true), cover: true });
  const page = number => ({ surface: readerSurface(book, number), folio: readerSurface(book, number, true), pageNumber: number });
  if (index === 0) return { left: null, right: cover('front') };
  if (index === 18) return { left: cover('back'), right: null };
  if (index === 1) return { left: cover('insideFront'), right: page(1) };
  if (index === 17) return { left: page(32), right: cover('insideBack') };
  const [left, right] = spreadNumbers(index - 1);
  return { left: page(left), right: page(right) };
}
