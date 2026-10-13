import { readerSpread, viewerControls, escapeHtml } from './views.js';
import { READER_MAP, REVERSE_REGISTRATION, COVER_MAP } from './imposition.js';

export function bookViewer(book, key = 'edition', { editable = false, initialIndex, tools = '' } = {}) {
  const product = key === 'first';
  return `<section class="interactive-book" data-book-viewer="${escapeHtml(key)}" ${editable ? 'data-book-editable="true"' : ''} ${initialIndex !== undefined ? `data-book-initial="${initialIndex}"` : ''} tabindex="0" aria-label="Interactive ${book.edition === 'first' ? 'First' : 'Custom'} Edition">
    <div class="book-stage"><span class="book-loading">LOADING BOOK</span></div>
    <div class="book-toolbar">
    <div class="book-toolbar-start">${editable ? '<button type="button" data-action="reset">RESET YOUR PHALLUS</button><div class="assembly-tools">' + tools + '</div>' : product ? '<span class="book-price">$80.00</span>' : ''}</div>
    <div class="book-controls"><button type="button" data-book-step="-1" aria-label="Previous page">←</button>
      <span class="book-status" aria-live="polite">COVER</span><button type="button" data-book-step="1" aria-label="Next page">→</button></div>
    <div class="book-toolbar-end">${editable || product ? `${editable ? '<span class="book-price">$80.00</span>' : ''}<button type="button" data-action="${editable ? 'cart-assembly' : 'add-first'}">ADD TO CART</button>` : ''}</div>
    </div>
    <p class="book-cues visually-hidden">DRAG TO TURN · LIFT CORNER TO REVEAL</p><p class="book-message" role="status"></p>
    ${developmentMapping() ? '<details class="book-debug"><summary>DEVELOPMENT — ACTIVE TEXTURES</summary><pre class="book-debug-info"></pre><label>Corner preview <select data-book-debug-curl><option value="">Flat</option><option value="left">Hold left curl</option><option value="right">Hold right curl</option></select></label></details>' : ''}
    <details class="book-fallback" ${editable ? 'hidden' : ''}><summary>READING VIEW</summary>${viewerControls(editable ? 1 : 0, 17, editable ? 'assembly' : 'reader')}${readerSpread(book, editable ? 1 : 0, { debug: false, editing: editable })}</details>
  </section>`;
}
function developmentMapping() {
  return ['localhost', '127.0.0.1'].includes(location.hostname) && new URL(location.href).searchParams.has('mapping');
}
export function mappingInspector() {
  if (!developmentMapping()) return '';
  return `<details class="mapping-inspector" open><summary>DEVELOPMENT — PHYSICAL MAPPING</summary>
    <p>Back registration: ${REVERSE_REGISTRATION}. Odd pages right; even pages left. First Edition photo labels use EXIF display coordinates; raw crops include that 180° conversion. B crops remain in their existing encoded coordinates.</p>
    <p>Confirmed cover panels: ${Object.entries(COVER_MAP).map(([part, m]) => `${part}: ${m.quadrant}, ${m.rotation}°`).join(' · ')}</p>
    <div class="mapping-table"><table><thead><tr><th>Page</th><th>Sheet</th><th>Side</th><th>Photo quadrant</th><th>Photo</th><th>Rotation</th><th>Reverse file</th><th>B quadrant / folio</th><th>B source x / y</th></tr></thead><tbody>
      ${READER_MAP.map(m => `<tr><td>${m.pageNumber}</td><td>${m.sheet}</td><td>${m.side}</td><td>${m.quadrant}</td><td>${m.sourceFilename}</td><td>${m.rotation}°</td><td>${m.reverse.filename}<br>${m.reverse.customFilename}</td><td>${m.reverse.quadrant} / ${m.reverse.pageNumber}</td><td>${m.reverse.rect.x} / ${m.reverse.rect.y}</td></tr>`).join('')}
    </tbody></table></div></details>`;
}
export function mountBookViewers(root, books) {
  let disposed = false; const instances = [], activity = new Map();
  function mount(host) {
      import('./book-3d.js').then(({ Book3D }) => {
        if (disposed || !host.isConnected) return;
        try {
          const instance = new Book3D(host, books.get(host.dataset.bookViewer));
          instances.push(instance); instance.setActive(activity.get(host.dataset.bookViewer) ?? true); host.querySelector('.book-loading')?.remove();
        } catch (error) {
          host.querySelector('.book-loading').textContent = '3D PREVIEW UNAVAILABLE';
          host.querySelector('.book-message').textContent = 'Use the reading view to browse this edition.';
          host.classList.add('no-webgl');host.querySelector('.book-fallback').hidden = false;
          host.querySelector('.book-controls').hidden = true;
          host.querySelector('.book-cues').hidden = true;
          host.querySelector('.book-fallback').open = true;
          console.warn('Book preview:', error.message);
        }
      }).catch(error => { if (!disposed) host.querySelector('.book-loading').textContent = `Book preview unavailable: ${error.message}`; });
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      const host = entry.target; observer.unobserve(host); mount(host);
    }
  }, { rootMargin: '250px' });
  // The primary book can decode during the introduction. Other previews
  // remain lazy, including saved editions below the page's main content.
  root.querySelectorAll('[data-book-viewer]').forEach(host => host.dataset.bookViewer === 'first' ? mount(host) : observer.observe(host));
  const dispose = () => { disposed = true; observer.disconnect(); instances.forEach(instance => instance.dispose()); };
  const instance = key => instances.find(book => book.host.dataset.bookViewer === key);
  dispose.update = (key, book) => instance(key)?.updateBook(book);
  dispose.imageDrag = (key, assetId) => instance(key)?.setImageDrag(assetId);
  dispose.dropTarget = (key, event, assetId) => instance(key)?.highlightDrop(event, assetId);
  dispose.clearDrop = key => instance(key)?.clearDropHighlight();
  dispose.navigate = (key, index) => instance(key)?.jump(index);
  dispose.locate = (key, index) => instance(key)?.navigateTo(index);
  dispose.active = (key, active) => { activity.set(key, active); instance(key)?.setActive(active); };
  return dispose;
}
