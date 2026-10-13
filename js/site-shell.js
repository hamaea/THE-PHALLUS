const INTRO_KEY = 'the-phallus.introduction.v1';
const logo = document.querySelector('.logo-toggle');
const colophon = document.querySelector('#colophon');
const bagPanel = document.querySelector('#shopping-bag');
let panel = colophon;
const backdrop = document.querySelector('.sidebar-backdrop');
const brand = document.querySelector('.publication-brand');
const main = document.querySelector('#app');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let sidebarOpen = false, closeTimer;

export function closeSidebar(restoreFocus = true) {
  if (!sidebarOpen) return;
  sidebarOpen = false;
  panel.classList.remove('is-open'); panel.inert = true;
  backdrop.hidden = true; main.inert = false; brand.inert = false;
  document.body.classList.remove('sidebar-open');
  document.body.classList.remove('cart-open');
  window.dispatchEvent(new CustomEvent('sidebarclosed'));
  logo.setAttribute('aria-expanded', 'false'); logo.setAttribute('aria-label', 'Open colophon');
  logo.setAttribute('aria-controls', 'colophon');
  const closing = panel;
  closeTimer = setTimeout(() => { if (!sidebarOpen || panel !== closing) closing.hidden = true; }, reducedMotion.matches ? 0 : 300);
  if (restoreFocus) logo.focus({preventScroll: true});
}
function openSidebar(next = colophon) {
  clearTimeout(closeTimer);
  if (panel !== next) { panel.classList.remove('is-open'); panel.hidden = true; panel.inert = true; }
  panel = next; sidebarOpen = true; panel.hidden = false; panel.inert = false;
  document.body.classList.add('sidebar-open');
  document.body.classList.toggle('cart-open', panel === bagPanel);
  backdrop.hidden = false; main.inert = true; brand.inert = true;
  logo.setAttribute('aria-expanded', 'true');
  logo.setAttribute('aria-controls', panel.id);
  logo.setAttribute('aria-label', panel === bagPanel ? 'Close shopping cart' : 'Close colophon');
  requestAnimationFrame(() => { if (sidebarOpen) panel.classList.add('is-open'); });
  logo.focus({preventScroll: true});
}
logo.addEventListener('click', () => sidebarOpen ? closeSidebar() : openSidebar());
backdrop.addEventListener('pointerdown', () => closeSidebar());
backdrop.addEventListener('wheel', event => event.preventDefault(), {passive: false});
export function openBagSidebar() {
  window.dispatchEvent(new CustomEvent('bagopen'));
  openSidebar(bagPanel);
}
document.addEventListener('click', event => {
  if (event.target.closest('a[href="#/bag"]')) { event.preventDefault(); openBagSidebar(); }
  else if (event.target.closest('#colophon a')) closeSidebar(false);
});
document.addEventListener('keydown', event => {
  if (!sidebarOpen) return;
  if (event.key === 'Escape') { event.preventDefault(); closeSidebar(); return; }
  if (event.key !== 'Tab') return;
  const targets = [logo, ...panel.querySelectorAll('a, button:not([hidden]), summary')]
    .filter(element => element.getClientRects().length && !element.closest('[hidden]'));
  const index = targets.indexOf(document.activeElement);
  event.preventDefault();
  targets[(index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length].focus();
});
window.addEventListener('hashchange', () => closeSidebar(false));

export function updateSiteHeader({ custom = false, bagCount = 0 } = {}) {
  document.querySelector('.edition-switch').classList.toggle('is-custom', custom);
  document.querySelector('#bag-count').textContent = `(${bagCount})`;
}

export function playIntroduction() {
  let played = false;
  try { played = sessionStorage.getItem(INTRO_KEY) === 'played'; } catch {}
  const markPlayed = () => { try { sessionStorage.setItem(INTRO_KEY, 'played'); } catch {} };
  if (played || reducedMotion.matches) { markPlayed(); document.body.classList.remove('booting'); return; }
  const intro = document.querySelector('#introduction'), site = document.querySelector('#site');
  intro.hidden = false; site.inert = true; document.body.classList.add('intro-playing');
  document.body.classList.remove('booting');
  const revealTimer = setTimeout(() => {
    intro.classList.add('is-leaving'); document.body.classList.add('intro-revealing');
  }, 5000);
  const finishTimer = setTimeout(finish, 6000);
  function finish() {
    clearTimeout(revealTimer); clearTimeout(finishTimer);
    intro.hidden = true; site.inert = false;
    document.body.classList.remove('intro-playing', 'intro-revealing'); markPlayed();
    reducedMotion.removeEventListener('change', motionChanged);
  }
  function motionChanged(event) { if (event.matches) finish(); }
  reducedMotion.addEventListener('change', motionChanged);
}
