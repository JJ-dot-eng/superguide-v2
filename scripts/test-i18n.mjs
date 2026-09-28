// English edition: every Korean string in dist/data has English, the
// dictionary holds nothing stale, and the language helpers behave.
// When a Korean data string changes, add or update its English in
// dist/i18n/en/<area>.js (the failure message lists what is missing).
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { english, areas, officialNames } from '../dist/i18n/en.js';
import { L, T, setLang, addEnglish, plural } from '../dist/core/i18n.js';

const HANGUL = /[가-힣ㄱ-ㆎ]/;
// Korean kept as data keys, never shown on their own: search nicknames and the
// count units that code turns into words ('발' shot, '개' item, '회' hit).
const SKIP_KEYS = new Set(['aliases']);
const LOGIC_WORDS = new Set(['발', '개', '회']);
let checks = 0;
const ok = (value, message) => { assert(value, message); checks++; };

// --- Collect every Korean string the data modules export -----------------------------
const data = new URL('../dist/data/', import.meta.url);
const strings = new Map(); // text -> first place it was seen
const seen = new WeakSet();
function walk(value, key, where) {
  if (typeof value === 'string') {
    if (HANGUL.test(value) && !SKIP_KEYS.has(key) && !LOGIC_WORDS.has(value) && !strings.has(value)) strings.set(value, where);
    return;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const [k, item] of Object.entries(value)) walk(item, Array.isArray(value) ? key : k, `${where}.${value.id ? `${value.id}.` : ''}${k}`);
}
for (const file of (await readdir(data)).filter(name => name.endsWith('.js')).sort()) {
  const module = await import(new URL(file, data));
  for (const [name, value] of Object.entries(module)) walk(value, name, `${file}:${name}`);
}

// --- Coverage ------------------------------------------------------------------------
const missing = [...strings].filter(([text]) => !Object.hasOwn(english, text));
ok(!missing.length, `${missing.length} Korean data strings have no English in dist/i18n/en/*.js:\n${missing.slice(0, 15).map(([text, where]) => `  ${where}\n    ${JSON.stringify(text)}`).join('\n')}`);
for (const [text, en] of Object.entries(english)) {
  ok(typeof en === 'string' && en.trim() && !HANGUL.test(en), `English for ${JSON.stringify(text)} is empty or still Korean: ${JSON.stringify(en)}`);
}

// --- No stale or duplicated entries -----------------------------------------------------
const official = new Set(officialNames.map(([ko]) => ko));
const owner = new Map();
for (const [area, entries] of Object.entries(areas)) for (const text of Object.keys(entries)) {
  ok(!owner.has(text), `${JSON.stringify(text)} is in both en/${owner.get(text)}.js and en/${area}.js`);
  owner.set(text, area);
  ok(strings.has(text) || official.has(text), `en/${area}.js: ${JSON.stringify(text)} no longer appears in dist/data — remove or update it`);
}

// --- Helpers ---------------------------------------------------------------------------
ok(L('가', 'a') === '가' && T('차저') === '차저', 'Korean is the default and T leaves text alone');
setLang('en');
addEnglish(Object.entries(english));
ok(L('가', 'a') === 'a' && T('차저') === 'Charger' && T('사전에 없는 글') === '사전에 없는 글', 'English picks English and keeps unknown text');
ok(T(3) === 3 && T(null) === null, 'T ignores non-strings');
ok(plural(1, 'shot') === 'shot' && plural(2, 'shot') === 'shots', 'plural');
const { countText, unitOf } = await import('../dist/core/explain.js');
ok(countText({ hits: 3 }, { unit: '발' }) === '3 shots' && countText({ hits: 1, lowerBound: true }, { unit: '개', unitLabel: '수류탄' }) === '1+ grenade', 'English counts');
ok(unitOf({ unit: '회' }, 1).unit === ' hit', 'English units');
const { html } = await import('../dist/ui/dom.js');
ok(String(html`<p title="${'차저'}" data-f="${'테르미니드'}">${'차저'}</p>`) === '<p title="Charger" data-f="테르미니드">Charger</p>', 'shown text is translated; data attributes keep their Korean key');
setLang('ko');

console.log(`PASS i18n: ${checks} checks (${strings.size} Korean data strings with English, dictionary clean, helpers).`);
