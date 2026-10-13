import { createBook, createFirstEdition, placeAsset, completion, spreadNumbers } from './book.js';

// v1 had four image cells per page. That cannot be losslessly represented by
// one page image, so the original localStorage key is never removed/overwritten.
export function migrateLegacyBook(legacy, assets) {
  if (!legacy || typeof legacy.id !== 'string' || !Number.isInteger(legacy.revision) || legacy.revision < 0 ||
      !legacy.cover || !Array.isArray(legacy.pages) || legacy.pages.length !== 32) throw new Error('Invalid legacy book.');
  if (legacy.cover.assetId !== null && !assets.has(legacy.cover.assetId)) throw new Error('Missing legacy cover asset.');
  const firstAssets = legacy.pages.map((page, index) => {
    if (page.pageNumber !== index + 1 || !Array.isArray(page.placements)) throw new Error('Invalid legacy pages.');
    const slots = new Set();
    for (const placement of page.placements) {
      const asset = assets.get(placement.assetId), occupied = placement.occupiedSlots;
      const valid = asset && asset.orientation === placement.orientation && Array.isArray(occupied) &&
        (asset.orientation === 'horizontal' ? occupied.length === 2 &&
          ((occupied[0] === 0 && occupied[1] === 1) || (occupied[0] === 2 && occupied[1] === 3))
          : occupied.length === 1 && Number.isInteger(occupied[0]) && occupied[0] >= 0 && occupied[0] < 4);
      if (!valid || occupied.some(slot => slots.has(slot))) throw new Error('Invalid legacy placement.');
      occupied.forEach(slot => slots.add(slot));
    }
    const first = [...page.placements].sort((a, b) => a.occupiedSlots[0] - b.occupiedSlots[0])[0];
    return first ? assets.get(first.assetId) : null;
  });
  if (legacy.edition === 'first' && legacy.id === 'first-edition') {
    return { ...createFirstEdition(), revision: legacy.revision, cover: structuredClone(legacy.cover) };
  }
  let book = { ...createBook(legacy.id), revision: legacy.revision, cover: structuredClone(legacy.cover) };
  for (let index = 0; index < 17; index++) {
    const numbers = spreadNumbers(index), selected = numbers.map(n => firstAssets[n - 1]);
    const horizontal = selected.find(a => a?.orientation === 'horizontal');
    if (horizontal) book = placeAsset(book, numbers[0], horizontal, { restoringLegacy: true });
    else numbers.forEach((n, i) => { if (selected[i]) book = placeAsset(book, n, selected[i], { restoringLegacy: true }); });
  }
  return { ...book, completed: Boolean(legacy.completed) && completion(book).complete };
}

export function migrateLegacyState(legacy, assets) {
  if (legacy.version !== 1 || !Array.isArray(legacy.bag) || !Array.isArray(legacy.orders)) throw new Error('Unrecognized legacy state.');
  const migrateItem = item => ({ ...item, book: migrateLegacyBook(item.book, assets) });
  return { ...legacy, version: 2,
    book: { ...migrateLegacyBook(legacy.book, assets), completed: false },
    bag: legacy.bag.map(migrateItem),
    orders: legacy.orders.map(order => ({ ...order, items: order.items.map(migrateItem) })),
    migrationNotice: 'Saved four-slot layouts were converted to one image per page / full-spread images. Only the first occupied image on each old page was considered. Original progress, bag and order data remain backed up under the-phallus.prototype.v1. Review the converted editions; finish your current assembly again when ready.' };
}

// Keep v2's exact per-page crops, including its old 1+2 full-spread images.
// Separate page references are needed because 1+2 no longer face one another.
export function migrateV2Book(old) {
  if (old.edition === 'first') return { ...createFirstEdition(), revision: old.revision };
  const book = structuredClone(old);
  book.placements = old.placements.flatMap(placement => placement.type === 'spread'
    ? placement.pages.map((number, index) => ({ id: `${placement.id}:page-${number}`, assetId: placement.assetId,
        orientation: placement.orientation, type: 'page', pages: [number], frame: { x: index ? -1 : 0, width: 2 } }))
    : [structuredClone(placement)]);
  book.pages = old.pages.map(page => ({ ...page, placementId: book.placements.find(p => p.pages.includes(page.pageNumber))?.id ?? null }));
  return book;
}
export function migrateV2State(old) {
  const migrateItem = item => ({ ...item, book: migrateV2Book(item.book) });
  return { ...old, version: 3, book: migrateV2Book(old.book), bag: old.bag.map(migrateItem),
    orders: old.orders.map(order => ({ ...order, items: order.items.map(migrateItem) })),
    ui: { ...old.ui, assemblySpread: Math.min(16, (old.ui?.assemblySpread ?? 0) + 1),
      readerSpread: Math.min(16, (old.ui?.readerSpread ?? 0) + 1) },
    migrationNotice: 'Reading order now uses facing pages 2–3, 4–5, etc. Your previous per-page image portions were preserved. The original v2 data remains backed up under the-phallus.prototype.v2.' };
}
