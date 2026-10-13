import { completion, createFirstEdition } from './book.js';

export const FIRST_PRODUCT = 'THE PHALLUS — FIRST EDITION';
export const CUSTOM_PRODUCT = 'THE PHALLUS — CUSTOM EDITION';
export const UNIT_PRICE = 80;
export const quantityOf = item => item.quantity ?? 1;
export const bagCount = bag => bag.reduce((count, item) => count + quantityOf(item), 0);
export const bagTotal = bag => bagCount(bag) * UNIT_PRICE;
export const editionName = item => item.kind === 'first' ? 'ORIGINAL EDITION' : 'CUSTOM EDITION';

// Configuration identity ignores editing IDs/revisions; actual per-page frames
// still participate so legacy half-spread selections remain distinct.
export function configurationKey(book) {
  return JSON.stringify({ edition: book.edition || 'custom', cover: book.cover,
    pages: book.pages.map(page => {
      const placement = book.placements.find(p => p.id === page.placementId);
      return placement ? { assetId: placement.assetId, pages: placement.pages,
        type: placement.type, frame: placement.frame } : null;
    }) });
}
function addCopy(bag, item) {
  const existing = bag.find(p => p.kind === item.kind &&
    (item.kind === 'first' || configurationKey(p.book) === configurationKey(item.book)));
  return existing ? bag.map(p => p === existing ? { ...p, quantity: quantityOf(p) + 1 } : p)
    : [...bag, { ...item, quantity: 1 }];
}

export function addFirstEdition(bag) {
  return addCopy(bag, { id: 'first-edition', kind: 'first', title: FIRST_PRODUCT, book: createFirstEdition() });
}

export function addCustomEdition(bag, book) {
  if (!book.completed || !completion(book).complete) throw new Error('Finish assembly before adding it to the bag.');
  const id = `${book.id}:r${book.revision}`;
  // A product is an immutable edition snapshot, never another Reader/Poster layout.
  return addCopy(bag, { id, kind: 'custom', title: CUSTOM_PRODUCT, book: structuredClone(book) });
}

export function changeQuantity(bag, id, delta) {
  if (![-1, 1].includes(delta)) throw new Error('Invalid quantity change.');
  return bag.map(item => item.id === id ? { ...item, quantity: quantityOf(item) + delta } : item)
    .filter(item => quantityOf(item) > 0);
}

export function removeBagItem(bag, id) {
  return bag.filter(item => item.id !== id);
}

export function simulateCheckout(bag, orders) {
  if (!bag.length) throw new Error('Your bag is empty.');
  const order = { id: globalThis.crypto?.randomUUID?.() ?? `order-${Date.now()}`,
    status: 'simulated-paid', createdAt: new Date().toISOString(),
    actions: { viewed: false, downloaded: false },
    items: structuredClone(bag).map(item => ({ ...item, quantity: quantityOf(item) })) };
  return { bag: [], orders: [...orders, order], order };
}

export function exportItem(orders, orderId, itemId) {
  const order = orders.find(order => order.id === orderId && order.status === 'simulated-paid');
  const item = order?.items.find(item => item.id === itemId);
  if (!item) throw new Error('PDF export unlocks after simulated checkout for this edition.');
  return item;
}
