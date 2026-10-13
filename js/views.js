import { getSpread, placementForPage, pageImageFrame, spreadNumbers } from './book.js';
import { getPoster } from './imposition.js';
import { readerSurface } from './book-surfaces.js';
import { assetById, assetUrl } from './assets.js';

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function button(label, action, extra = '') {
  return `<button type="button" data-action="${action}" ${extra}>${label}</button>`;
}
function imageMarkup(placement) {
  const asset = assetById.get(placement.assetId);
  return `<img src="${escapeHtml(assetUrl(asset, { preview: true }))}" alt="${escapeHtml(asset.name)}" draggable="false">`;
}

export function pageComposition(book, page, { editing = false, debug = true, proof = false, omitImage = false } = {}) {
  const frame = pageImageFrame(book, page.pageNumber), placement = frame?.placement;
  const source = book.edition === 'first' ? readerSurface(book, page.pageNumber) : null;
  const crop = source ? `<div class="source-quadrant" style="transform:rotate(${source.rotation}deg)"><img src="${escapeHtml(assetUrl(assetById.get(source.assetId), {preview: true}))}" style="width:200%;height:200%;left:${-source.rect.x * 200}%;top:${-source.rect.y * 200}%" alt="First Edition page ${page.pageNumber}" draggable="false"></div>` : '';
  const content = proof || page.placeholder
    ? `<div class="placeholder-page ${!proof && page.tone === 'black' ? 'black' : ''}">
        <strong>PAGE ${page.pageNumber}</strong><span>${proof ? 'TOP ↑' : 'FIRST EDITION / PLACEHOLDER'}</span>
        ${proof ? '<b class="proof-corner tl">TL</b><b class="proof-corner tr">TR</b><b class="proof-corner bl">BL</b><b class="proof-corner br">BR</b>' : ''}
      </div>`
    : source ? crop : !frame || omitImage ? '' : `<div class="placement page-image" data-placement-id="${escapeHtml(placement.id)}" data-asset-id="${escapeHtml(placement.assetId)}" data-part="${frame.part}"
        style="left:${frame.x * 100}%;top:0;width:${frame.width * 100}%;height:100%">${imageMarkup(placement)}</div>`;
  const controls = editing ? `<button type="button" class="page-target ${placement ? 'occupied' : ''}" data-action="place" data-page="${page.pageNumber}"
      aria-label="Page ${page.pageNumber}: ${placement ? 'click to clear image, or select a photograph to replace it' : 'empty page'}">
      ${placement ? '' : `<span>PAGE ${page.pageNumber}<br>DROP / CLICK</span>`}</button>
    ${placement ? `<button type="button" class="remove-placement" data-action="remove-placement" data-page="${page.pageNumber}"
      aria-label="Remove ${placement.type === 'spread' ? 'spread image' : 'image'} on page ${page.pageNumber}">${placement.type === 'spread' ? 'REMOVE SPREAD IMAGE' : 'REMOVE'}</button>` : ''}` : '';
  return `<div class="page-composition ${omitImage ? 'shared-page' : ''}" data-page-number="${page.pageNumber}" ${placement ? `data-placement-id="${escapeHtml(placement.id)}"` : ''}>${content}${controls}
    ${debug ? `<span class="page-folio">PAGE ${page.pageNumber}${debug && frame?.part !== 'whole' && frame ? ` / ${frame.part.toUpperCase()} HALF` : ''}</span>` : ''}</div>`;
}

export function readerSpread(book, index, options = {}) {
  const pages = getSpread(book, index), first = placementForPage(book, pages[0].pageNumber);
  const shared = pages.length === 2 && first?.type === 'spread' && pages.every(page => page.placementId === first.id) && !options.proof;
  return `<div class="reader-spread" data-spread="${index + 1}">
    ${options.debug === false ? '' : `<div class="spread-labels">${(pages.length === 1 && pages[0].pageNumber === 1 ? '<span>INSIDE COVER</span>' : '') + pages.map(page => `<span>PAGE ${page.pageNumber}</span>`).join('') + (pages.length === 1 && pages[0].pageNumber === 32 ? '<span>INSIDE COVER</span>' : '')}</div>`}
    <div class="reader-spread-surface" data-left-page="${pages[0].pageNumber}" data-right-page="${pages.at(-1).pageNumber}">
      ${shared ? `<div class="placement spread-image" data-placement-id="${escapeHtml(first.id)}" data-asset-id="${escapeHtml(first.assetId)}">${imageMarkup(first)}</div>` : ''}
      <div class="reader-pages">${pages.length === 1 && pages[0].pageNumber === 1 ? '<div class="endpaper" aria-label="Inside front cover"></div>' : ''}${pages.map(page => `<figure class="reader-page">${pageComposition(book, page, { ...options, omitImage: shared })}</figure>`).join('')}${pages.length === 1 && pages[0].pageNumber === 32 ? '<div class="endpaper" aria-label="Inside back cover"></div>' : ''}</div>
      ${options.editing ? '<span class="drop-kind" aria-hidden="true"></span>' : ''}
    </div></div>`;
}

export function posterView(book, index, options = {}) {
  return `<div class="poster-sheet" data-sheet="${index + 1}">${getPoster(book, index).quadrants.map(quadrant =>
    `<div class="poster-quadrant" data-position="${quadrant.position}" data-reader-page="${quadrant.pageNumber}" data-rotation="${quadrant.rotation}">
      <div class="imposed-page" style="transform:rotate(${quadrant.rotation}deg)">${pageComposition(book, quadrant.page, options)}</div>
      ${options.debug === false ? '' : `<span class="quadrant-label">PAGE ${quadrant.pageNumber} — ${quadrant.rotation}°</span>`}</div>`).join('')}</div>`;
}

export function coverView(cover) {
  const asset = assetById.get(cover.assetId || 'custom:00. COVER');
  return `<div class="cover-sheet">${asset ? `<img src="${escapeHtml(assetUrl(asset, { preview: true }))}" alt="Cover: ${escapeHtml(asset.name)}">`
    : '<span>A2 COVER<br>NO IMAGE SELECTED<br>Placeholder sheet will export</span>'}</div>`;
}

export function viewerControls(index, count, prefix, noun = 'SPREAD') {
  return `<div class="controls">${button(noun === 'POSTER' ? 'PREVIOUS POSTER' : 'PREVIOUS SPREAD', `${prefix}-previous`, index === 0 ? 'disabled' : '')}
    <span>${noun} ${index + 1} / ${count}${noun === 'SPREAD' ? ` · PAGE${spreadNumbers(index).length > 1 ? 'S' : ''} ${spreadNumbers(index).join('–')}` : ''}</span>
    ${button(noun === 'POSTER' ? 'NEXT POSTER' : 'NEXT SPREAD', `${prefix}-next`, index === count - 1 ? 'disabled' : '')}</div>`;
}
