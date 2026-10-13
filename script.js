import { ASSETS, assetById, assetUrl } from './js/assets.js';
import { createBook, createFirstEdition, placeAsset, removePlacement, setCover, completion, finishBook, spreadIndex, pagesForAsset, placementForPage } from './js/book.js';
import { addFirstEdition, addCustomEdition, removeBagItem, simulateCheckout, changeQuantity, quantityOf, bagCount, bagTotal, editionName } from './js/commerce.js';
import { loadState, saveState } from './js/storage.js';
import { readerSpread, posterView, coverView, viewerControls, button, escapeHtml as e } from './js/views.js';
import { bookViewer, mountBookViewers, mappingInspector } from './js/book-viewer.js';
import { spreadState } from './js/book-surfaces.js';
import { updateSiteHeader, playIntroduction, openBagSidebar, closeSidebar } from './js/site-shell.js';
import { completedOrderPdf } from './js/order-pdf.js';
// Poster exhibition temporarily disabled; keep its source for later refinement.
// import { homeExhibition, mountHomeExhibition } from './js/home-exhibition.js';

let storage;
try { storage = window.localStorage; } catch { storage = null; }
const loaded = loadState(storage, assetById);
let state = loaded.state, selectedAsset = null, draggedAsset = null, touchDrag = null;
let validationVisible = false, busyExport = null;
const cartFeedback = new Map();
const generated = new Map();
const app = document.querySelector('#app');
const firstEdition = createFirstEdition();
let disposeViewers = () => {};
let disposeHome = () => {};
let disposeBagPreviews = () => {};
let bagPreviewGeneration = 0;
let orderPdfBusy = false;
const previewBooks = new Map();

let notificationTimer;
function notify(message) {
  const notice = document.querySelector('#notification'); notice.textContent = message;
  clearTimeout(notificationTimer); notificationTimer = setTimeout(() => { notice.textContent = ''; }, 4500);
}
function storageWarning(message) {
  const element = document.querySelector('#storage-warning');
  element.hidden = !message || message === state.migrationNotice; element.textContent = message;
}
storageWarning(loaded.warning);
function persist() { storageWarning([state.migrationNotice, saveState(storage, state)].filter(Boolean).join(' ')); }
if (loaded.migrated) persist();
function go(route) { location.hash = `/${route}`; }
function route() { return location.hash.slice(2).split('/').filter(Boolean).map(decodeURIComponent); }
function debugControls() {
  return `<fieldset><legend>Physical logic / debug</legend>
    <label><input type="checkbox" data-setting="debug" ${state.ui.debug ? 'checked' : ''}> Show page / rotation labels</label>
    <label><input type="checkbox" data-setting="numberedProof" ${state.ui.numberedProof ? 'checked' : ''}> Numbered imposition proof (preview only)</label>
  </fieldset>`;
}
function viewerPair(book) {
  previewBooks.set('saved', book);
  const options = { debug: state.ui.debug, proof: state.ui.numberedProof };
  return `${bookViewer(book, 'saved').replace(readerSpread(book, 0, {debug: false}), readerSpread(book, state.ui.readerSpread, {debug: false})).replace(viewerControls(0, 17, 'reader'), viewerControls(state.ui.readerSpread, 17, 'reader'))}<div class="finished-viewers">
    <section aria-label="Book viewer"><h2>BOOK VIEW</h2>${viewerControls(state.ui.readerSpread, 17, 'reader')}
      ${readerSpread(book, state.ui.readerSpread, options)}</section>
    <section aria-label="Poster viewer"><h2>POSTER VIEW — A2 IMAGE SIDE</h2>${viewerControls(state.ui.posterSheet, 8, 'poster', 'POSTER')}
      ${posterView(book, state.ui.posterSheet, options)}</section></div>`;
}

function home() {
  previewBooks.set('first', firstEdition);
  // return homeExhibition(bookViewer(firstEdition, 'first', { initialIndex: 0 }));
  return `<div class="home-slides" data-home-screen="0"><div class="home-slide-track">
    <section class="home-screen" aria-label="Assembled book"><div class="home-preview">${bookViewer(firstEdition, 'first', { initialIndex: 0 })}</div>
      <h1 class="visually-hidden">THE PHALLUS</h1></section></div></div>`;
}

function assemblyTools() {
  const progress = completion(state.book), spread = spreadState(state.book, state.ui.assemblyBookState);
  return `<details class="assembly-options"><summary aria-label="Assembly options"><span class="assembly-progress">${progress.filledSlots} / 32</span></summary><div>
    ${['left', 'right'].map(side => spread[side]?.pageNumber && state.book.pages[spread[side].pageNumber - 1].placementId
      ? button(`CLEAR ${side.toUpperCase()} PAGE`, 'remove-placement', `data-page="${spread[side].pageNumber}"`) : '').join('')}
    ${button('FINISH ASSEMBLY', 'finish')}</div></details>`;
}
function assemblyValidation() {
  const progress = completion(state.book);
  return validationVisible && !progress.complete ? `<details><summary>${progress.emptySlots} empty reader pages.</summary>
    <div class="actions">${progress.incompletePages.map(page => button(`PAGE ${page.pageNumber}`, 'jump-page', `data-page="${page.pageNumber}"`)).join('')}</div></details>` : '';
}
function assembly() {
  previewBooks.set('assembly', state.book);
  return `<section class="assembly-editor"><h1 class="visually-hidden">ASSEMBLY</h1>
    ${bookViewer(state.book, 'assembly', { editable: true, initialIndex: state.ui.assemblyBookState, tools: assemblyTools() })}
    <div class="assembly-validation validation" role="alert" ${assemblyValidation() ? '' : 'hidden'}>${assemblyValidation()}</div>
    <div class="assembly-gallery" aria-label="Photograph collection">${['horizontal', 'vertical'].map(orientation =>
      `<div class="photo-row" data-orientation="${orientation}" aria-label="${orientation} photographs">${ASSETS.filter(asset => asset.orientation === orientation).map(asset =>
        `<button type="button" class="gallery-photo" draggable="true" data-action="select-asset" data-asset="${e(asset.id)}"
          aria-pressed="${asset.id === selectedAsset}" aria-label="Select photograph">
          <img src="${e(assetUrl(asset, { preview: true }))}" width="${asset.width}" height="${asset.height}" loading="lazy" alt="" draggable="false"></button>`).join('')}</div>`).join('')}</div></section>`;
}

function refreshAssembly() {
  previewBooks.set('assembly', state.book);
  const tools = app.querySelector('.assembly-tools');
  if (tools) { const open = tools.querySelector('details')?.open; tools.innerHTML = assemblyTools(); tools.querySelector('details').open = Boolean(open); }
  const validation = app.querySelector('.assembly-validation');
  if (validation) { validation.innerHTML = assemblyValidation(); validation.hidden = !validation.innerHTML; }
  const host = app.querySelector('[data-book-viewer="assembly"]');
  if (selectedAsset && pagesForAsset(state.book, selectedAsset).length) selectedAsset = null;
  app.querySelectorAll('.gallery-photo').forEach(card => {
    const pages = pagesForAsset(state.book, card.dataset.asset), used = pages.length > 0;
    card.dataset.used = String(used); card.draggable = !used;
    card.setAttribute('aria-pressed', String(card.dataset.asset === selectedAsset));
    card.setAttribute('aria-label', used ? `Show photograph on page${pages.length > 1 ? 's' : ''} ${pages.join(' and ')}` : 'Select photograph');
  });
  if (host) host.dataset.selectedAsset = selectedAsset || '';
  refreshCartLabel('cart-assembly');
}
function refreshCartLabel(action) {
  const button = app.querySelector(`[data-action="${action}"]`);
  const label = Date.now() < (cartFeedback.get(action)?.until ?? 0) ? 'ADDED' : 'ADD TO CART';
  if (button && button.textContent !== label) button.textContent = label;
}
function acknowledgeAdded(action) {
  clearTimeout(cartFeedback.get(action)?.timer); clearTimeout(notificationTimer);
  document.querySelector('#notification').textContent = '';
  cartFeedback.set(action, {
    until: Date.now() + 8000,
    timer: setTimeout(() => refreshCartLabel(action), 8000)
  });
  refreshCartLabel(action);
}
function updateAssemblyBook() {
  persist(); refreshAssembly(); disposeViewers.update?.('assembly', state.book);
  const fallback = app.querySelector('.no-webgl .book-fallback');
  if (fallback) fallback.innerHTML = `<summary>READING VIEW</summary>${viewerControls(state.ui.assemblySpread, 17, 'assembly')}${readerSpread(state.book, state.ui.assemblySpread, { editing: true })}`;
}
function assignPhoto(pageNumber, assetId) {
  const asset = assetById.get(assetId);
  if (!asset) return;
  if (pagesForAsset(state.book, assetId).length) { showAssetPage(assetId); return; }
  if (asset.orientation === 'horizontal' && [1, 32].includes(pageNumber)) { notify('Horizontal photographs use a facing spread. Use a vertical photograph on this page.'); return; }
  state.book = placeAsset(state.book, pageNumber, asset); selectedAsset = null; validationVisible = false; updateAssemblyBook();
}
function showAssetPage(assetId) {
  const pages = pagesForAsset(state.book, assetId);
  if (!pages.length) return;
  selectedAsset = null; refreshAssembly();
  const index = spreadIndex(pages[0]);
  if (app.querySelector('.no-webgl')) {
    state.ui.assemblySpread = index; state.ui.assemblyBookState = index + 1; updateAssemblyBook();
  } else disposeViewers.locate?.('assembly', index + 1);
}
function clearPage(pageNumber) {
  if (!placementForPage(state.book, pageNumber)) return;
  state.book = removePlacement(state.book, pageNumber); updateAssemblyBook();
}

function finished() {
  return `<h1>FINISHED ASSEMBLY</h1><p>32 reader pages → 15 facing pairs and two single pages → 8 duplex A2 sheets + 1 cover.</p>
    <div class="actions">${button('RETURN TO EDITING', 'edit')}${button('ADD CUSTOM EDITION TO BAG', 'add-custom')}<a href="#/bag">VIEW BAG</a></div>
    <p>PDF export unlocks after simulated checkout for this edition.</p>${debugControls()}${viewerPair(state.book)}
    <div class="cover-editor">${coverView(state.book.cover)}<div><h2>COVER / PDF SHEET 1</h2>
      <p>Cover image and reverse are PDF pages 1–2; eight interior front/back pairs follow.</p><p>Reverse / folio side: ${e(state.book.cover.reverse.label)}</p></div></div>`;
}

function refreshBag() {
  const generation = ++bagPreviewGeneration;
  const content = document.querySelector('#shopping-bag .bag-content');
  const scroll = content.querySelector('.bag-items')?.scrollTop || 0;
  disposeBagPreviews();
  content.innerHTML = `<h1 class="cart-heading">CART (${bagCount(state.bag)})</h1><div class="bag-items">${state.bag.length ? state.bag.map(item =>
    `<article class="shopping-item" data-bag-item="${e(item.id)}">
      <div class="bag-miniature" data-bag-preview="${e(item.id)}" aria-label="${editionName(item)} book preview"></div>
      <div class="bag-edition"><h2>${editionName(item)}</h2><div class="bag-item-bottom"><span>$80</span>
        <div class="quantity-controls" aria-label="${editionName(item)} quantity">
          <button type="button" data-action="bag-quantity" data-id="${e(item.id)}" data-delta="-1" aria-label="Decrease ${editionName(item)} quantity">−</button>
          <span aria-live="polite">${quantityOf(item)}</span>
          <button type="button" data-action="bag-quantity" data-id="${e(item.id)}" data-delta="1" aria-label="Increase ${editionName(item)} quantity">+</button>
        </div></div></div></article>`).join('') : '<p class="bag-empty">YOUR CART IS EMPTY</p>'}</div>
    <footer class="bag-checkout"><p class="bag-total"><span>TOTAL</span><span aria-live="polite">$${bagTotal(state.bag)}</span></p>
      <button type="button" class="checkout-button" data-action="checkout" ${state.bag.length ? '' : 'disabled'}>CHECKOUT</button></footer>`;
  content.querySelector('.bag-items').scrollTop = scroll;
  const items = state.bag;
  import('./js/bag-preview.js').then(({mountBagPreviews}) => {
    if (generation === bagPreviewGeneration) disposeBagPreviews = mountBagPreviews(content,items);
  }).catch(error => {
    if (generation === bagPreviewGeneration) content.querySelectorAll('[data-bag-preview]').forEach(target => { target.textContent = 'PREVIEW UNAVAILABLE'; });
    console.warn('Bag preview:',error.message);
  });
}
window.addEventListener('bagopen', refreshBag);
window.addEventListener('sidebarclosed', () => { bagPreviewGeneration++; disposeBagPreviews(); });

function completedOrder() { return state.orders.find(order => order.id === route()[1]); }
function thankYou() {
  const order = completedOrder();
  if (!order) return `<section class="thank-you"><div class="thank-you-copy"><p>ORDER NOT FOUND</p><h1>THE PHALLUS</h1><a href="#/home">RETURN HOME</a></div></section>`;
  const actions = order.actions || {};
  return `<section class="thank-you"><div class="thank-you-copy"><p>THANK YOU</p><h1>THE PHALLUS</h1>
    <div class="order-actions">${actions.viewed && actions.downloaded ? button('RETURN HOME','return-home') :
      `<button type="button" data-action="view-order" aria-pressed="${Boolean(actions.viewed)}">VIEW</button><span aria-hidden="true">|</span><button type="button" data-action="download-order" aria-pressed="${Boolean(actions.downloaded)}">DOWNLOAD</button>`}</div>
    <p class="order-pdf-status" role="status" aria-live="polite"></p></div></section>`;
}

function exportView() {
  return `<h1>EXPORT</h1>${state.orders.length ? `<p>Simulated payment successful. Export is available for the purchased editions below.</p>
    <p>Each PDF has 18 portrait A2 sides (420×594 mm): cover front/back, then eight interior front/back pairs. Print at 100% / actual size.</p>
    <fieldset><legend>PDF verification options</legend>
      <label><input type="checkbox" id="pdf-debug"> Include page / rotation debug labels</label>
      <label><input type="checkbox" id="pdf-proof"> Export numbered proof instead of interior photographs</label>
    </fieldset>${state.orders.slice().reverse().map(order => `<section><h2>SIMULATED ORDER</h2>${order.items.map(item => {
      const key = `${order.id}/${item.id}`, result = generated.get(key);
      return `<article class="order-item"><h3>${e(item.title)}</h3><p>${item.kind === 'custom' ? `Purchased revision ${item.book.revision}. Later edits require a new simulated checkout.` : 'First Edition uses the supplied complete print layouts.'}</p>
        <div class="actions"><a href="#/preview/order/${encodeURIComponent(order.id)}/${encodeURIComponent(item.id)}">VIEW PURCHASED EDITION</a>
          ${button(busyExport === key ? 'GENERATING…' : 'GENERATE A2 PDF', 'export-pdf', `data-order="${e(order.id)}" data-item="${e(item.id)}" ${busyExport ? 'disabled' : ''}`)}</div>
        ${result ? `<p class="export-links"><a href="${result.url}" target="_blank" rel="noopener">VIEW GENERATED PDF</a>
          <a href="${result.url}" download="${result.filename}">DOWNLOAD ${result.proof ? 'NUMBERED PROOF' : 'EDITION'} PDF</a></p>` : ''}</article>`;
    }).join('')}</section>`).join('')}` : '<p>PDF export is locked. Complete simulated checkout first. <a href="#/bag">OPEN BAG</a></p>'}`;
}

function preview(parts) {
  const item = parts[1] === 'bag' ? state.bag.find(item => item.id === parts[2])
    : state.orders.find(order => order.id === parts[2])?.items.find(item => item.id === parts[3]);
  if (!item) return '<h1>EDITION NOT FOUND</h1><a href="#/bag">Return to Bag</a>';
  return `<h1>${e(item.title)} — SAVED PREVIEW</h1><p>Snapshot ${item.kind === 'custom' ? `revision ${item.book.revision}` : 'First Edition'}.</p>
    <a href="#/${parts[1] === 'bag' ? 'bag' : 'export'}">RETURN</a>${debugControls()}${viewerPair(item.book)}`;
}

function render() {
  const scroll = [...document.querySelectorAll('.photo-row')].map(row => row.scrollLeft);
  if (['bag','checkout'].includes(route()[0])) {
    history.replaceState(null,'','#/home'); queueMicrotask(openBagSidebar);
  }
  const parts = route(), page = parts[0] ?? 'home';
  document.body.classList.toggle('thank-you-page',page === 'thank-you');
  document.body.classList.toggle('assembly-page', page === 'assembly');
  document.body.classList.toggle('home-page', page === 'home');
  if (page === 'assembly' && state.book.cover.assetId) { state.book = setCover(state.book, null); persist(); }
  if (page === 'finished' && (!state.book.completed || !completion(state.book).complete)) {
    notify('Finish all 32 pages before opening the finished view.'); go('assembly'); return;
  }
  for (const link of document.querySelectorAll('nav a')) {
    if (link.hash === `#/${page}`) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  const views = { home, assembly, finished, 'thank-you':thankYou, export: exportView,
    about: () => '<h1>THE PHALLUS</h1><p>SEPTEMBER 2026<br>PHOTO BY E. HAMABUCHI<br>MODEL BY ANONYMOUS</p>',
    preview: () => preview(parts) };
  disposeHome(); disposeViewers(); previewBooks.clear();
  app.innerHTML = (views[page] ?? home)() + (page === 'thank-you' ? '' : mappingInspector());
  disposeViewers = mountBookViewers(app, previewBooks);
  // disposeHome = mountHomeExhibition(app, active=>disposeViewers.active?.('first',active));
  const item = page === 'preview' ? (parts[1] === 'bag' ? state.bag.find(item => item.id === parts[2])
    : state.orders.find(order => order.id === parts[2])?.items.find(item => item.id === parts[3])) : null;
  updateSiteHeader({ custom: ['assembly', 'finished'].includes(page) || item?.kind === 'custom', bagCount: bagCount(state.bag) });
  document.querySelectorAll('.photo-row').forEach((row, i) => { row.scrollLeft = scroll[i] || 0; });
  if (page === 'assembly') refreshAssembly();
  refreshCartLabel('add-first');
}

const cursorActions = {
  assembly: ['assemblySpread', 16], first: ['firstSpread', 16], reader: ['readerSpread', 16], poster: ['posterSheet', 7],
};
app.addEventListener('booknavigate', event => {
  const key = event.target.dataset.bookViewer;
  if (key === 'assembly') {
    state.ui.assemblySpread = event.detail.readerSpread;
    state.ui.assemblyBookState = event.detail.bookIndex;
    persist(); refreshAssembly(); return;
  }
  if (key !== 'saved') return;
  state.ui.readerSpread = event.detail.readerSpread;
  persist();
  const book = previewBooks.get(key), options = {debug: state.ui.debug, proof: state.ui.numberedProof};
  const section = app.querySelector('[aria-label="Book viewer"]');
  if (section && book) section.innerHTML = `<h2>BOOK VIEW</h2>${viewerControls(state.ui.readerSpread, 17, 'reader')}${readerSpread(book, state.ui.readerSpread, options)}`;
  const fallback = event.target.querySelector('.book-fallback');
  if (fallback && book) fallback.innerHTML = `<summary>READING VIEW</summary>${viewerControls(state.ui.readerSpread, 17, 'reader')}${readerSpread(book, state.ui.readerSpread, {debug:false})}`;
});
app.addEventListener('bookassign', event => assignPhoto(event.detail.pageNumber, event.detail.assetId));
app.addEventListener('bookclear', event => clearPage(event.detail.pageNumber));
document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action } = target.dataset;
  try {
    const [prefix, direction] = action.split('-');
    if (cursorActions[prefix] && ['previous', 'next'].includes(direction)) {
      const [key, max] = cursorActions[prefix];
      state.ui[key] = Math.max(0, Math.min(max, state.ui[key] + (direction === 'next' ? 1 : -1)));
      persist();
      if (prefix === 'reader' || prefix === 'poster') {
        const book = previewBooks.get('saved') || firstEdition;
        const options = {debug: state.ui.debug, proof: state.ui.numberedProof};
        if (prefix === 'poster') {
          const section = app.querySelector('[aria-label="Poster viewer"]');
          if (section) section.innerHTML = `<h2>POSTER VIEW — A2 IMAGE SIDE</h2>${viewerControls(state.ui.posterSheet, 8, 'poster', 'POSTER')}${posterView(book, state.ui.posterSheet, options)}`;
        } else {
          const section = app.querySelector('[aria-label="Book viewer"]');
          if (section) section.innerHTML = `<h2>BOOK VIEW</h2>${viewerControls(state.ui.readerSpread, 17, 'reader')}${readerSpread(book, state.ui.readerSpread, options)}`;
          const fallback = app.querySelector('.book-fallback');
          if (fallback) fallback.innerHTML = `<summary>READING VIEW</summary>${viewerControls(state.ui.readerSpread, 17, 'reader')}${readerSpread(book, state.ui.readerSpread, {debug:false})}`;
        }
      } else if (prefix === 'assembly' && !app.querySelector('.no-webgl')) disposeViewers.navigate?.('assembly', state.ui.assemblySpread + 1);
      else if (prefix === 'assembly') updateAssemblyBook();
      else render();
      return;
    }
    switch (action) {
      case 'build': go(state.book.completed ? 'finished' : 'assembly'); return;
      case 'select-asset':
        if (pagesForAsset(state.book, target.dataset.asset).length) { showAssetPage(target.dataset.asset); return; }
        selectedAsset = selectedAsset === target.dataset.asset ? null : target.dataset.asset;
        refreshAssembly(); return;
      case 'place':
        if (!selectedAsset) {
          if (placementForPage(state.book, Number(target.dataset.page))) clearPage(Number(target.dataset.page));
          else notify('Select an image in the library, then click an empty or occupied page.');
          return;
        }
        assignPhoto(Number(target.dataset.page), selectedAsset); return;
      case 'remove-placement': clearPage(Number(target.dataset.page)); return;
      case 'set-cover': if (selectedAsset) state.book = setCover(state.book, selectedAsset); break;
      case 'clear-cover': state.book = setCover(state.book, null); break;
      case 'jump-page':
        state.ui.assemblySpread = spreadIndex(Number(target.dataset.page));
        state.ui.assemblyBookState = state.ui.assemblySpread + 1;
        disposeViewers.navigate?.('assembly', state.ui.assemblyBookState); updateAssemblyBook(); return;
      case 'reset':
        if (!window.confirm('Reset all 32 reader pages? Saved bag editions and purchases will remain.')) return;
        state.book = createBook(); state.ui.assemblySpread = 1; state.ui.assemblyBookState = 2;
        state.ui.readerSpread = state.ui.posterSheet = 0;
        selectedAsset = null; validationVisible = false; notify('Custom assembly reset.'); render(); persist(); return;
      case 'finish':
        if (!completion(state.book).complete) { validationVisible = true; refreshAssembly(); return; }
        state.book = finishBook(state.book); state.migrationNotice = ''; validationVisible = false; state.ui.readerSpread = state.ui.posterSheet = 0;
        persist(); notify('Assembly complete. Both viewers derive from the same reader pages.'); go('finished'); return;
      case 'edit': state.ui.assemblySpread = state.ui.readerSpread; state.ui.assemblyBookState = state.ui.readerSpread + 1; go('assembly'); return;
      case 'add-first':
        state.bag = addFirstEdition(state.bag); persist();
        updateSiteHeader({bagCount:bagCount(state.bag)}); acknowledgeAdded('add-first'); openBagSidebar(); return;
      case 'cart-assembly':
        if (!completion(state.book).complete) { validationVisible = true; refreshAssembly(); return; }
        state.book = finishBook(state.book); state.migrationNotice = ''; validationVisible = false;
        state.bag = addCustomEdition(state.bag, state.book); persist(); refreshAssembly();
        updateSiteHeader({custom:true,bagCount:bagCount(state.bag)}); acknowledgeAdded('cart-assembly'); openBagSidebar(); return;
      case 'add-custom':
        state.bag = addCustomEdition(state.bag, state.book); persist();
        updateSiteHeader({custom:true,bagCount:bagCount(state.bag)}); openBagSidebar(); return;
      case 'bag-quantity': {
        state.bag = changeQuantity(state.bag,target.dataset.id,Number(target.dataset.delta)); persist();
        const id = target.dataset.id, delta = target.dataset.delta;
        refreshBag(); updateSiteHeader({custom:route()[0] === 'assembly',bagCount:bagCount(state.bag)});
        const focus = [...document.querySelectorAll('#shopping-bag [data-action="bag-quantity"]')]
          .find(button => button.dataset.id === id && button.dataset.delta === delta);
        (focus || document.querySelector('.logo-toggle')).focus({preventScroll:true}); return;
      }
      case 'view-order': await initiateOrderPdf('viewed'); return;
      case 'download-order': await initiateOrderPdf('downloaded'); return;
      case 'return-home':
        if (!completedOrder()?.actions?.viewed || !completedOrder()?.actions?.downloaded) return;
        state.bag = []; cartFeedback.clear(); persist(); closeSidebar(false); go('home'); return;
      case 'remove-item': state.bag = removeBagItem(state.bag, target.dataset.id); notify('Item removed from bag.'); break;
      case 'checkout': {
        const result = simulateCheckout(state.bag, state.orders);
        state.orders = result.orders; persist(); closeSidebar(false); go(`thank-you/${encodeURIComponent(result.order.id)}`); return;
      }
      case 'export-pdf': await downloadPdf(target); return;
      default: return;
    }
    persist(); render();
  } catch (error) { notify(error.message); }
});

app.addEventListener('change', event => {
  if (event.target.dataset.setting) { state.ui[event.target.dataset.setting] = event.target.checked; persist(); render(); }
});

function clearDropHighlight() {
  document.querySelectorAll('.drop-active, .full-spread-drop').forEach(element => element.classList.remove('drop-active', 'full-spread-drop'));
  document.querySelectorAll('.drop-kind').forEach(element => { element.textContent = ''; });
}
app.addEventListener('dragstart', event => {
  const card = event.target.closest('.gallery-photo');
  if (!card) return;
  if (pagesForAsset(state.book, card.dataset.asset).length) { event.preventDefault(); return; }
  draggedAsset = card.dataset.asset;
  event.dataTransfer.setData('application/x-phallus-asset', draggedAsset);
  event.dataTransfer.setData('text/plain', draggedAsset);
  event.dataTransfer.effectAllowed = 'copy';
  disposeViewers.imageDrag?.('assembly', draggedAsset);
});
app.addEventListener('dragover', event => {
  const surface = event.target.closest('.reader-spread-surface'), target = event.target.closest('.page-target');
  const asset = assetById.get(draggedAsset);
  if (!surface?.querySelector('.page-target') || !asset || pagesForAsset(state.book, asset.id).length || (asset.orientation === 'vertical' && !target)) return;
  if (asset.orientation === 'horizontal' && surface.dataset.leftPage === surface.dataset.rightPage) return;
  event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; clearDropHighlight();
  if (asset.orientation === 'horizontal') {
    surface.classList.add('full-spread-drop');
    surface.querySelectorAll('.page-target').forEach(element => element.classList.add('drop-active'));
    surface.querySelector('.drop-kind').textContent = `FULL SPREAD — PAGES ${surface.dataset.leftPage} + ${surface.dataset.rightPage}`;
  } else {
    target.classList.add('drop-active');
    surface.querySelector('.drop-kind').textContent = `PAGE ${target.dataset.page}`;
  }
});
app.addEventListener('dragleave', event => { if (!event.relatedTarget || !event.target.closest('.reader-spread-surface')?.contains(event.relatedTarget)) clearDropHighlight(); });
app.addEventListener('dragend', () => { draggedAsset = null; disposeViewers.imageDrag?.('assembly', null); clearDropHighlight(); });
app.addEventListener('drop', event => {
  const surface = event.target.closest('.reader-spread-surface'), target = event.target.closest('.page-target');
  if (!surface?.querySelector('.page-target')) return;
  event.preventDefault(); clearDropHighlight();
  const asset = assetById.get(event.dataTransfer.getData('application/x-phallus-asset') || event.dataTransfer.getData('text/plain'));
  if (!asset) { notify('Drop an image from this project’s image library.'); return; }
  if (asset.orientation === 'vertical' && !target) return;
  assignPhoto(Number(target?.dataset.page ?? surface.dataset.leftPage), asset.id);
  draggedAsset = null; disposeViewers.imageDrag?.('assembly', null);
});

// Touch gallery swipes stay native horizontally. An upward drag picks up a
// photo and uses the same mesh raycast and assignment path as desktop drops.
app.addEventListener('pointerdown', event => {
  const card = event.target.closest('.gallery-photo');
  if (!card || event.pointerType === 'mouse' || pagesForAsset(state.book, card.dataset.asset).length) return;
  touchDrag = { card, id: event.pointerId, assetId: card.dataset.asset, x: event.clientX, y: event.clientY, active: false };
});
app.addEventListener('pointermove', event => {
  const drag = touchDrag; if (!drag || drag.id !== event.pointerId) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (!drag.active) {
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) { touchDrag = null; return; }
    if (dy > -10 || -dy < Math.abs(dx)) return;
    drag.active = true; drag.card.setPointerCapture(event.pointerId);
    disposeViewers.imageDrag?.('assembly', drag.assetId);
    drag.preview = document.createElement('img'); drag.preview.src = drag.card.querySelector('img').src;
    drag.preview.className = 'photo-drag-preview'; drag.preview.alt = ''; document.body.append(drag.preview);
  }
  event.preventDefault();
  drag.preview.style.transform = `translate(${event.clientX - 45}px, ${event.clientY - 70}px)`;
  drag.page = disposeViewers.dropTarget?.('assembly', event, drag.assetId);
});
function endTouchDrag(event, cancelled = false) {
  const drag = touchDrag; if (!drag || drag.id !== event.pointerId) return;
  touchDrag = null;
  if (drag.active) {
    if (drag.card.hasPointerCapture(event.pointerId)) drag.card.releasePointerCapture(event.pointerId);
    drag.preview.remove(); disposeViewers.imageDrag?.('assembly', null);
    if (!cancelled && drag.page) assignPhoto(drag.page, drag.assetId);
    // Suppress the click synthesized after dropping a touch photograph.
    const released = event.timeStamp;
    app.addEventListener('click', event => {
      if (event.target.closest('.gallery-photo') === drag.card && event.timeStamp - released < 500) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, { once: true, capture: true });
  }
}
app.addEventListener('pointerup', event => endTouchDrag(event));
app.addEventListener('pointercancel', event => endTouchDrag(event, true));
app.addEventListener('wheel', event => {
  const row = event.target.closest('.photo-row');
  if (row && Math.abs(event.deltaY) > Math.abs(event.deltaX)) { event.preventDefault(); row.scrollLeft += event.deltaY; }
}, { passive: false });

async function initiateOrderPdf(action) {
  const order = completedOrder();
  if (!order || orderPdfBusy) return;
  // Reserve the new tab within the click gesture, before asynchronous export.
  const tab = action === 'viewed' ? window.open('about:blank','_blank') : null;
  if (action === 'viewed' && !tab) {
    app.querySelector('.order-pdf-status').textContent = 'Allow the PDF tab, then try VIEW again.'; return;
  }
  if (tab) { tab.document.title = 'THE PHALLUS'; tab.document.body.textContent = 'PREPARING PDF'; tab.opener = null; }
  orderPdfBusy = true;
  const status = app.querySelector('.order-pdf-status'); status.textContent = 'PREPARING PDF';
  const buttons = [...app.querySelectorAll('.order-actions button')]; buttons.forEach(button => { button.disabled = true; });
  try {
    const result = await completedOrderPdf(order);
    if (action === 'viewed') {
      if (tab.closed) throw new Error('The PDF tab was closed. Please try VIEW again.');
      tab.location.href = result.url;
    } else {
      const link = document.createElement('a'); link.href = result.url; link.download = result.filename;
      document.body.append(link); link.click(); link.remove();
    }
    order.actions = { viewed:false,downloaded:false,...order.actions,[action]:true }; persist();
    if (completedOrder()?.id === order.id) {
      if (order.actions.viewed && order.actions.downloaded) {
        const actions = app.querySelector('.order-actions'); actions.classList.add('is-completing');
        setTimeout(() => {
          if (actions.isConnected) { actions.innerHTML = button('RETURN HOME','return-home'); actions.classList.remove('is-completing'); }
        },150);
      } else app.querySelector(`[data-action="${action === 'viewed' ? 'view-order' : 'download-order'}"]`)?.setAttribute('aria-pressed','true');
      status.textContent = '';
    }
  } catch (error) {
    if (tab && !tab.closed) tab.close();
    if (status.isConnected) status.textContent = error.message;
  } finally { orderPdfBusy = false; buttons.forEach(button => { button.disabled = false; }); }
}

async function downloadPdf(target) {
  const orderId = target.dataset.order, itemId = target.dataset.item, key = `${orderId}/${itemId}`;
  if (busyExport) return;
  const debug = document.querySelector('#pdf-debug').checked, proof = document.querySelector('#pdf-proof').checked;
  busyExport = key; render();
  try {
    const bytes = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./js/pdf-worker.js', import.meta.url), {type: 'module'});
      worker.onmessage = ({data}) => {
        if (data.progress) { notify(data.progress); return; }
        worker.terminate();
        if (data.error) reject(new Error(data.error)); else resolve(data.bytes);
      };
      worker.onerror = () => { worker.terminate(); reject(new Error('PDF worker failed. Reload and retry.')); };
      worker.postMessage({orders: state.orders, orderId, itemId, options: {debug, proof}});
    });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    if (generated.has(key)) URL.revokeObjectURL(generated.get(key).url);
    generated.set(key, { url, proof, filename: `the-phallus-${itemId.replace(/[^a-z0-9-]/gi, '-')}-${proof ? 'proof' : 'edition'}-A2.pdf` });
    notify('Eighteen-side A2 PDF generated. Use View or Download below.');
  } catch (error) { notify(`PDF generation failed: ${error.message}`); }
  finally { busyExport = null; render(); }
}

window.addEventListener('hashchange', () => {
  clearTimeout(notificationTimer); document.querySelector('#notification').textContent = '';
  render(); window.scrollTo(0, 0);
});
window.addEventListener('beforeunload', () => { for (const result of generated.values()) URL.revokeObjectURL(result.url); });
if (!location.hash) location.hash = '/home';
render();
if (route()[0] === 'thank-you') document.body.classList.remove('booting');
else playIntroduction();
