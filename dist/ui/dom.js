// Minimal rendering helpers: an auto-escaping `html` template tag, so data
// text can never inject markup, plus a few shared UI fragments.
class Safe { constructor(text) { this.text = text; } toString() { return this.text; } }
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escape = value => String(value).replace(/[&<>"']/g, char => ESC[char]);
export const raw = text => new Safe(String(text));
const piece = value => value == null || value === false ? '' : value instanceof Safe ? value.text
  : Array.isArray(value) ? value.map(piece).join('') : escape(value);
export const html = (strings, ...values) => new Safe(strings.reduce((out, text, i) => out + text + (i < values.length ? piece(values[i]) : ''), ''));

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export function render(root, content) { root.innerHTML = piece(content); }

export const external = (url, label) => html`<a class="ext" href="${url}" target="_blank" rel="noopener noreferrer">${label}<span aria-hidden="true"> ↗</span></a>`;

// Stroke icons, 24px grid.
const ICONS = {
  arsenal: '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/>',
  enemy: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5"/>',
  demolition: '<path d="M3 21h18M5 21V10l7-5 7 5v11"/><path d="m9 13 3 3 3-3M12 16V9"/>',
  factions: '<path d="M5 21V3.5M5 4h12.5l-2.5 4.5 2.5 4.5H5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  compare: '<rect x="3.5" y="5" width="7" height="14" rx="1"/><rect x="13.5" y="5" width="7" height="14" rx="1"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
};
export const icon = (name, size = 20) => raw(`<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`);

/** Stratagem call code as keycaps: ↑↓←→ */
export const keycaps = (input, size = '') => input ? html`<span class="keys ${size}" aria-label="호출 코드 ${input}">${[...input].map(key => html`<kbd>${key}</kbd>`)}</span>` : '';

export const badge = (text, tone = '') => html`<span class="badge ${tone}">${text}</span>`;
