// Canonical model: 32 page positions reference a book-level placement once.
// A spread image is ONE record; its two references derive the left/right parts.
export const PAGE_COUNT = 32;
export const SPREAD_COUNT = 17;

export function createBook(id = globalThis.crypto?.randomUUID?.() ?? `book-${Date.now()}`) {
  return { id, revision: 0, completed: false,
    cover: { assetId: null, reverse: { label: '00B CUSTOM EDITION.jpg' } },
    pages: Array.from({ length: PAGE_COUNT }, (_, i) => ({ pageNumber: i + 1, placementId: null })),
    placements: [] };
}

export function spreadPages(pageNumber) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > PAGE_COUNT) throw new Error('Invalid reader page.');
  if (pageNumber === 1 || pageNumber === PAGE_COUNT) return [pageNumber];
  const left = Math.floor(pageNumber / 2) * 2;
  return [left, left + 1];
}
export function spreadIndex(pageNumber) { spreadPages(pageNumber); return Math.floor(pageNumber / 2); }
export function spreadNumbers(index) {
  if (!Number.isInteger(index) || index < 0 || index >= SPREAD_COUNT) throw new Error('Invalid spread.');
  return index === 0 ? [1] : index === 16 ? [32] : [index * 2, index * 2 + 1];
}

export function placementForPage(book, pageNumber) {
  const page = book.pages[pageNumber - 1];
  return book.placements.find(placement => placement.id === page?.placementId) ?? null;
}

export function pagesForAsset(book, assetId) {
  return [...new Set(book.placements.filter(placement => placement.assetId === assetId)
    .flatMap(placement => placement.pages))].sort((a, b) => a - b);
}

export function occupancy(book) {
  return book.pages.map(page => placementForPage(book, page.pageNumber));
}

// Image frame normalized to ONE page viewport. Both web and PDF use this.
// Fit a spread image to a 2-page box first, then clip the correct page portion.
export function pageImageFrame(book, pageNumber) {
  const placement = placementForPage(book, pageNumber);
  if (!placement) return null;
  const spread = placement.type === 'spread';
  const right = spread && placement.rightPage === pageNumber;
  if (placement.frame) return { placement, part: placement.frame.x === -1 ? 'right' : 'left', y: 0, height: 1, ...placement.frame };
  return { placement, part: spread ? (right ? 'right' : 'left') : 'whole',
    x: right ? -1 : 0, y: 0, width: spread ? 2 : 1, height: 1 };
}

function replacePlacements(book, pages, placement = null) {
  const removed = new Set(book.placements.filter(p => p.pages.some(page => pages.includes(page))).map(p => p.id));
  // Replacing/removing either half clears the shared placement from BOTH pages.
  const placements = book.placements.filter(p => !removed.has(p.id));
  if (placement) placements.push(placement);
  return { ...book, revision: book.revision + 1, completed: false, placements,
    pages: book.pages.map(page => ({ ...page, placementId: placement?.pages.includes(page.pageNumber)
      ? placement.id : removed.has(page.placementId) ? null : page.placementId })) };
}

export function placeAsset(book, pageNumber, asset, { restoringLegacy = false } = {}) {
  const pair = spreadPages(pageNumber);
  if (!asset || !['horizontal', 'vertical'].includes(asset.orientation)) throw new Error('Choose an image from the library.');
  // Historical selections survive migration; new placements cannot repeat.
  if (!restoringLegacy && pagesForAsset(book, asset.id).length) throw new Error('This photograph is already in your book. Clear or replace its current image before using it again.');
  const spread = asset.orientation === 'horizontal' && pair.length === 2;
  const pages = spread ? pair : [pageNumber];
  const placement = { id: `${book.id}:placement:r${book.revision + 1}`, assetId: asset.id,
    orientation: asset.orientation, type: spread ? 'spread' : 'page', pages,
    ...(spread ? { leftPage: pair[0], rightPage: pair[1] } : {}) };
  return replacePlacements(book, pages, placement);
}

export function removePlacement(book, pageNumber) {
  spreadPages(pageNumber);
  return replacePlacements(book, [pageNumber]);
}

export function setCover(book, assetId) {
  return { ...book, revision: book.revision + 1, completed: false, cover: { ...book.cover, assetId } };
}

export function completion(book) {
  const incompletePages = book.pages.filter(page => !placementForPage(book, page.pageNumber))
    .map(page => ({ pageNumber: page.pageNumber }));
  const emptySlots = incompletePages.length;
  return { complete: emptySlots === 0 && book.pages.length === PAGE_COUNT,
    emptySlots, filledSlots: PAGE_COUNT - emptySlots, incompletePages };
}

export function finishBook(book) {
  if (!completion(book).complete) throw new Error('All 32 reader pages must be filled before finishing.');
  return { ...book, completed: true };
}

export function getSpread(book, index) {
  if (!Number.isInteger(index) || index < 0 || index >= SPREAD_COUNT) throw new Error('Invalid spread.');
  return spreadNumbers(index).map(number => book.pages[number - 1]);
}

export function createFirstEdition() {
  const book = createBook('first-edition');
  return { ...book, completed: true, edition: 'first', cover: { assetId: null, reverse: { label: '00B COVER.jpg' } } };
}

export function assertBook(book, assets, { allowFirstEdition = false } = {}) {
  if (!book || typeof book.id !== 'string' || !Number.isInteger(book.revision) || book.revision < 0 ||
      typeof book.completed !== 'boolean' || !book.cover || !Array.isArray(book.pages) ||
      book.pages.length !== PAGE_COUNT || !Array.isArray(book.placements)) throw new Error('Invalid saved book.');
  const isFirst = allowFirstEdition && book.edition === 'first' && book.id === 'first-edition';
  if (book.cover.assetId !== null && !assets.has(book.cover.assetId)) throw new Error('Missing cover asset.');
  const usedPages = new Set(), ids = new Set();
  for (const placement of book.placements) {
    const asset = assets.get(placement.assetId), pages = placement.pages;
    if (typeof placement.id !== 'string' || ids.has(placement.id) || !asset ||
        asset.orientation !== placement.orientation || !Array.isArray(pages)) throw new Error('Invalid saved placement.');
    ids.add(placement.id);
    const valid = placement.type === 'spread'
      ? asset.orientation === 'horizontal' && pages.length === 2 && Number.isInteger(pages[0]) && pages[0] % 2 === 0 && pages[0] >= 2 && pages[0] <= 30 &&
        pages[1] === pages[0] + 1 && placement.leftPage === pages[0] && placement.rightPage === pages[1]
      : placement.type === 'page' && pages.length === 1 && (asset.orientation === 'vertical' || pages[0] === 1 || pages[0] === 32 ||
        placement.frame?.width === 2 && [0, -1].includes(placement.frame.x));
    if (!valid || pages.some(number => !Number.isInteger(number) || number < 1 || number > PAGE_COUNT || usedPages.has(number))) {
      throw new Error('Invalid page/spread occupancy.');
    }
    for (const number of pages) {
      if (book.pages[number - 1]?.placementId !== placement.id) throw new Error('Broken placement reference.');
      usedPages.add(number);
    }
  }
  book.pages.forEach((page, index) => {
    if (page.pageNumber !== index + 1 || (page.placementId !== null && !usedPages.has(page.pageNumber))) throw new Error('Invalid saved page reference.');
    if (page.placeholder && !isFirst) throw new Error('Unexpected placeholder in custom book.');
    if ('placements' in page) throw new Error('Legacy per-page grids require migration.');
  });
  if (book.completed && !isFirst && !completion(book).complete) throw new Error('Saved completion does not match pages.');
  return book;
}
