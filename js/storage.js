import { assertBook, createBook } from './book.js';
import { migrateLegacyState, migrateV2State } from './migration.js';
export const STORAGE_KEY = 'the-phallus.prototype.v3';
export const V2_STORAGE_KEY = 'the-phallus.prototype.v2';
export const LEGACY_STORAGE_KEY = 'the-phallus.prototype.v1';

export function initialState() {
  return { version: 3, book: createBook(), bag: [], orders: [], migrationNotice: '',
    ui: { assemblySpread: 1, assemblyBookState: 2, readerSpread: 0, posterSheet: 0, firstSpread: 0, debug: false, numberedProof: false } };
}

function assertItem(item, assets) {
  if (!item || typeof item.id !== 'string' || !['first', 'custom'].includes(item.kind)) throw new Error('Invalid saved product.');
  assertBook(item.book, assets, { allowFirstEdition: item.kind === 'first' });
  if (!item.book.completed) throw new Error('Incomplete saved product.');
  if (item.quantity !== undefined && (!Number.isSafeInteger(item.quantity) || item.quantity < 1)) throw new Error('Invalid saved quantity.');
}

export function loadState(storage, assets) {
  try {
    const current = storage.getItem(STORAGE_KEY), v2 = current ? null : storage.getItem(V2_STORAGE_KEY),
      legacy = current || v2 ? null : storage.getItem(LEGACY_STORAGE_KEY);
    if (!current && !v2 && !legacy) return { state: initialState(), warning: '', migrated: false };
    const saved = current ? JSON.parse(current) : v2 ? migrateV2State(JSON.parse(v2)) :
      { ...migrateLegacyState(JSON.parse(legacy), assets), version: 3 };
    if (saved.version !== 3 || !Array.isArray(saved.bag) || !Array.isArray(saved.orders)) throw new Error('Unrecognized saved state.');
    assertBook(saved.book, assets);
    saved.bag.forEach(item => assertItem(item, assets));
    saved.orders.forEach(order => {
      if (typeof order.id !== 'string' || order.status !== 'simulated-paid' || !Array.isArray(order.items)) throw new Error('Invalid saved checkout.');
      order.items.forEach(item => assertItem(item, assets));
    });
    const defaults = initialState().ui;
    const ui = { ...defaults, ...saved.ui };
    for (const [name, max] of [['assemblySpread', 16], ['readerSpread', 16], ['firstSpread', 16], ['posterSheet', 7]]) {
      if (!Number.isInteger(ui[name]) || ui[name] < 0 || ui[name] > max) ui[name] = 0;
    }
    ui.debug = Boolean(ui.debug);
    ui.numberedProof = Boolean(ui.numberedProof);
    if (!Number.isInteger(ui.assemblyBookState) || ui.assemblyBookState < 0 || ui.assemblyBookState > 18) ui.assemblyBookState = 2;
    return { state: { ...saved, ui }, warning: saved.migrationNotice || '', migrated: Boolean(legacy || v2) };
  } catch (error) {
    return { state: initialState(), warning: `Saved progress could not be loaded (${error.message}). This session starts with a blank book.` };
  }
}

export function saveState(storage, state) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return ''; }
  catch { return 'Local storage is unavailable or full. Work is retained while this page stays open, but cannot survive a refresh.'; }
}
