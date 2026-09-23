// App shell: hash router, navigation, shared sheet/palette/toast.
import { parseRoute, formatRoute } from '../core/route.js';
import { $, $$, icon, render, html } from './dom.js';
import { initAnalytics } from './analytics.js';

const VIEW_MODULES = {
  arsenal: () => import('./views/arsenal.js'),
  enemy: () => import('./views/enemy.js'),
  demolition: () => import('./views/demolition.js'),
  factions: () => import('./views/factions.js'),
};
const TITLES = { arsenal: '스트라타젬', enemy: '적 대응', demolition: '철거', factions: '팩션 추천' };

const root = $('#view');
const loaded = new Map();
let current = { view: null, module: null, route: null };
const track = initAnalytics();

for (const slot of $$('[data-icon]')) slot.outerHTML = icon(slot.dataset.icon, slot.closest('.tabbar') ? 22 : 18).toString();

// --- Sheet (side panel on desktop, bottom sheet on phones) ---------------------
const sheet = $('#sheet');
let onSheetClose = null;
export function openSheet(content, { wide = false, onClose = null, label = '' } = {}) {
  render($('#sheet-body'), content);
  sheet.classList.toggle('wide', wide);
  if (label) sheet.setAttribute('aria-label', label);
  onSheetClose = onClose;
  if (!sheet.open) sheet.showModal();
  $('#sheet-body').scrollTop = 0;
}
export const closeSheet = () => sheet.open && sheet.close();
sheet.addEventListener('close', () => { const done = onSheetClose; onSheetClose = null; done?.(); });
sheet.addEventListener('click', event => {
  if (event.target === sheet || event.target.closest('[data-close]')) sheet.close();
});

// --- Toast -----------------------------------------------------------------------
let toastTimer;
export function toast(message) {
  const box = $('#toast');
  box.textContent = message; box.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { box.hidden = true; }, 3200);
}

// --- Routing ---------------------------------------------------------------------
export const ctx = {
  /** Push a new history entry (Back returns here). */
  go(route) { location.hash = formatRoute(route); },
  /** Update the URL for the current state without a new history entry or re-render. */
  replace(route) {
    const hash = formatRoute(route);
    if (hash !== location.hash) history.replaceState(null, '', hash);
    current.route = parseRoute(hash);
  },
  get route() { return current.route; },
  openSheet, closeSheet, toast,
};

async function handle() {
  const route = parseRoute(location.hash);
  // Empty and old-site hashes (#combat …) become canonical routes.
  if (!location.hash || /^#(catalog|combat|demolition|factions)$/.test(location.hash)) history.replaceState(null, '', formatRoute(route));
  document.body.dataset.view = route.view;
  for (const link of $$('[data-tab]')) {
    if (link.dataset.tab === route.view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = `${TITLES[route.view]} — HD2 필드 가이드`;

  let module = loaded.get(route.view);
  if (!module) {
    root.setAttribute('aria-busy', 'true');
    try { module = await VIEW_MODULES[route.view](); } catch (error) {
      root.removeAttribute('aria-busy');
      render(root, html`<div class="empty"><h2>화면을 불러오지 못했습니다</h2><p>연결을 확인한 뒤 새로 고침해 주세요.</p></div>`);
      throw error;
    }
    loaded.set(route.view, module);
    root.removeAttribute('aria-busy');
  }
  if (parseRoute(location.hash).view !== route.view) return; // a newer navigation won
  const switched = current.view !== route.view;
  current = { view: route.view, module, route };
  if (switched) {
    onSheetClose = null; // the leaving view's close handler must not navigate
    closeSheet();
    // A fresh container per visit, so a view's listeners never pile up.
    const container = document.createElement('div');
    root.replaceChildren(container);
    module.mount(container, ctx);
    window.scrollTo({ top: 0 });
    track(route.view);
  }
  module.update(route);
}
window.addEventListener('hashchange', () => handle().catch(console.error));
handle().catch(console.error);

// Warm the next view when a visitor points at its tab.
for (const link of $$('[data-tab]')) {
  for (const type of ['pointerenter', 'focus', 'touchstart']) {
    link.addEventListener(type, () => VIEW_MODULES[link.dataset.tab]?.().catch(() => {}), { once: true, passive: true });
  }
}

// --- Global actions -------------------------------------------------------------
document.addEventListener('click', event => {
  // The skip link must move focus, not change the routed hash.
  if (event.target.closest('.skip')) { event.preventDefault(); root.focus(); return; }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'palette') openPalette();
  if (action === 'method') import('./views/method.js').then(module => module.openMethod(ctx));
});
document.addEventListener('keydown', event => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if ((event.key === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !typing && !document.querySelector('dialog[open]'))) {
    event.preventDefault(); openPalette();
  }
});

// Browsers with the WebMCP API get the same catalogue filter the old site offered agents.
if (document.modelContext?.registerTool) import('./agent-tool.js').then(module => module.registerCatalogTool(ctx)).catch(console.warn);

let palette;
async function openPalette() {
  palette ||= import('./palette.js').then(module => module.createPalette(ctx));
  try { (await palette).open(); } catch (error) {
    palette = null;
    toast('검색을 불러오지 못했습니다. 연결을 확인해 주세요.');
    throw error;
  }
}
