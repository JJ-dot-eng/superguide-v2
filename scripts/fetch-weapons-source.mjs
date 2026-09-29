// Downloads the wiki sources for db/weapons.js into db/source/. Usage: node scripts/fetch-weapons-source.mjs db/source
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function decodeHtml(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', ndash: '–', mdash: '—', middot: '·', hellip: '…' };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, key) => {
    if (!key.startsWith('#')) return named[key.toLowerCase()] ?? entity;
    const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\ufffd';
  });
}
const plainHtml = value => decodeHtml(value.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
export function extractHeadings(html) {
  return [...(html ?? '').matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(match =>
    plainHtml(match[2]).replace(/^\d+(?:\.\d+)*\.?\s*/, '').replace(/\s*\[편집\]\s*$/, '').trim()
  ).filter(Boolean);
}
export function compactKoreanPage(page) {
  return { source: page.source, status: page.status, modifiedAt: page.modifiedAt ?? null, retrievedAt: page.retrievedAt,
    headings: typeof page.html === 'string' ? extractHeadings(page.html) : page.headings ?? [] };
}
export const normalizeCode = value => value.toUpperCase().replace(/\s/g, '');
export function matchKoreanNames(pages, titles) {
  const roster = titles.map(title => ({ title, code: title.match(/^(\S*\d\S*)\s/)?.[1] ?? null }));
  const headings = pages.flatMap(page => (page.headings ?? []).map((heading, index) => {
    // Match roster designations at the heading start, allowing spacing/case variants.
    // Trim footnote markers from the name only; the evidence heading remains unchanged.
    const matches = roster.flatMap(item => {
      if (!item.code) return [];
      const pattern = [...normalizeCode(item.code)].map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
      const prefix = heading.match(new RegExp(`^${pattern}(?=\\s|[가-힣])`, 'i'));
      const name = prefix ? heading.slice(prefix[0].length).trim().replace(/(?:\[\d+\])+$/, '').trim() : '';
      return name && /[가-힣]/.test(name) ? [{ item, name }] : [];
    });
    return { page, index, heading, matches };
  }));
  const names = {}, matched = new Set(), unmatchedRoster = [];
  for (const item of roster) {
    const key = item.code && normalizeCode(item.code);
    const peers = roster.filter(other => other.code && normalizeCode(other.code) === key);
    const candidates = headings.filter(h => h.page.status === 200 && h.matches.some(m => m.item === item));
    if (peers.length !== 1 || candidates.length !== 1 || candidates[0].matches.length !== 1) {
      unmatchedRoster.push({ title: item.title, code: item.code, reason: peers.length !== 1 ? 'ambiguous roster code' : candidates.length > 1 ? 'multiple headings for code' : candidates.length ? 'heading matches multiple roster codes' : 'no matching heading' });
      continue;
    }
    const h = candidates[0];
    matched.add(h);
    names[item.code] = { name: h.matches[0].name, source: h.page.source, modifiedAt: h.page.modifiedAt, retrievedAt: h.page.retrievedAt, evidence: h.heading };
  }
  return { names, unmatchedRoster, unmappedHeadings: headings.filter(h => !matched.has(h)).map(h => ({ source: h.page.source, heading: h.heading, reason: /[A-Za-z].*\d/.test(h.heading) ? 'unmatched or ambiguous designation' : 'non-weapon section heading' })) };
}

async function main() {
const API = 'https://helldivers.wiki.gg/api.php';
const UA = 'HD2FieldGuide/2.0 (fan site data check; contact via github modocracy)';
const get = async params => {
  await delay(250);
  const res = await fetch(`${API}?${new URLSearchParams({ format: 'json', ...params })}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status} ${params.list || params.titles}`);
  const result = await res.json();
  if (result.error) throw new Error(JSON.stringify(result.error));
  return result;
};
const out = process.argv[2];
if (!out) throw new Error('Usage: node scripts/fetch-weapons-source.mjs db/source');
const retrievedAt = new Date().toISOString().slice(0, 10);
const save = (file, value) => writeFile(`${out}/${file}`, JSON.stringify(value, null, 1) + '\n');
const errorText = error => `${error.message}${error.cause ? ` (${error.cause.code ?? error.cause.message})` : ''}`;
let failed = false;
const failure = (label, error) => { failed = true; console.log(`${label}: ${errorText(error)}`); };

// 1. Datamined attack data.
const title = 'Module:Decodedata-Attacks/weapons data.json';
try {
const wd = await get({ action: 'query', prop: 'revisions', titles: title, rvprop: 'content|ids|timestamp', rvslots: 'main' });
const page = Object.values(wd.query.pages)[0];
const rev = page.revisions[0];
await writeFile(`${out}/weapons_data.json`, JSON.stringify({
  source: `https://helldivers.wiki.gg/wiki/${title.replaceAll(' ', '_')}`,
  revision: rev.revid, revisionTimestamp: rev.timestamp, retrievedAt,
  data: JSON.parse(rev.slots.main['*']),
}, null, 1) + '\n');
console.log('weapons_data revision', rev.revid, rev.timestamp);
} catch (error) { failure('weapons_data refresh failed; existing snapshot retained', error); }

// 2. Category membership (with each page's latest revision id).
const cats = ['Primary Weapons', 'Secondary Weapons', 'Throwables', 'Assault Rifles', 'Marksman Rifles', 'Shotguns', 'Submachine Guns', 'Energy-Based', 'Pistols', 'Melee', 'Special Secondaries', 'Standard Throwables', 'Special Throwables'];
let categories = {};
try {
for (const cat of cats) {
  const members = [];
  let cont = {};
  do {
    const r = await get({ action: 'query', generator: 'categorymembers', gcmtitle: `Category:${cat}`, gcmlimit: '500', gcmnamespace: '0', prop: 'revisions', rvprop: 'ids', ...cont });
    for (const p of Object.values(r.query?.pages || {})) members.push({ title: p.title, pageid: p.pageid, revision: p.revisions?.[0]?.revid ?? null });
    cont = r.continue || null;
  } while (cont);
  categories[cat] = members.sort((a, b) => a.title.localeCompare(b.title));
  console.log(cat, members.length);
}
await writeFile(`${out}/wiki_categories.json`, JSON.stringify({ source: 'https://helldivers.wiki.gg/wiki/Category:Weapons', retrievedAt, categories }, null, 1) + '\n');
} catch (error) {
  failure('wiki_categories refresh failed; existing snapshot retained', error);
  categories = JSON.parse(await readFile(`${out}/wiki_categories.json`, 'utf8')).categories;
}

// 3. Full page text, in sequential API batches of at most 50 titles.
const titles = [...new Set(['Primary Weapons', 'Secondary Weapons', 'Throwables'].flatMap(cat => categories[cat].map(p => p.title)))].sort();
let previous = { pages: {} };
try { previous = JSON.parse(await readFile(`${out}/wiki_pages.json`, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const pages = {};
for (let index = 0; index < titles.length; index += 50) {
  const batch = titles.slice(index, index + 50);
  try {
    const result = await get({ action: 'query', prop: 'revisions', titles: batch.join('|'), rvprop: 'content|ids|timestamp', rvslots: 'main' });
    for (const title of batch) {
      const page = Object.values(result.query?.pages ?? {}).find(p => p.title === title);
      const revision = page?.revisions?.[0];
      if (!revision || typeof revision.slots?.main?.['*'] !== 'string') throw new Error(`Missing wikitext: ${title}`);
      pages[title] = { source: `https://helldivers.wiki.gg/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`, revision: revision.revid, revisionTimestamp: revision.timestamp, retrievedAt, wikitext: revision.slots.main['*'], error: null };
    }
    console.log(`wiki_pages: ${Math.min(index + 50, titles.length)}/${titles.length}`);
  } catch (error) {
    failure(`wiki_pages batch ${index + 1}-${index + batch.length} failed`, error);
    for (const title of batch) pages[title] = { ...(previous.pages[title] ?? { source: `https://helldivers.wiki.gg/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`, revision: null, revisionTimestamp: null, retrievedAt: null, wikitext: null }), attemptedAt: retrievedAt, error: errorText(error) };
  }
}
await save('wiki_pages.json', { source: API, attemptedAt: retrievedAt, pages });

// 4. Store only compact, plain-text heading evidence; never persist raw HTML.
const base = 'https://namu.wiki/w/' + ['HELLDIVERS 2', '무기'].map(encodeURIComponent).join('/');
const urls = [base];
const koreanPages = [];
for (let index = 0; index < urls.length; index++) {
  const url = urls[index];
  await delay(250);
  try {
    const response = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    const html = await response.text();
    const record = compactKoreanPage({ source: url, modifiedAt: response.headers.get('last-modified'), retrievedAt, status: response.status, html });
    koreanPages.push(record);
    if (!response.ok) { failure(`korean_names: ${url}`, new Error(`HTTP ${response.status}`)); continue; }
    if (index === 0) for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      if (!['주 무기', '보조', '투척', '보조 무기', '투척 무기'].includes(plainHtml(match[2]))) continue;
      const child = new URL(match[1].replaceAll('&amp;', '&'), url);
      if (child.origin === 'https://namu.wiki' && decodeURIComponent(child.pathname).startsWith('/w/HELLDIVERS 2/무기/') && !urls.includes(child.href)) urls.push(child.href);
    }
  } catch (error) {
    koreanPages.push(compactKoreanPage({ source: url, retrievedAt, status: null }));
    failure(`korean_names: ${url}`, error);
  }
}
await save('korean_names.json', { source: base, retrievedAt, pages: koreanPages });
const { names } = matchKoreanNames(koreanPages, titles);
console.log(`Saved wiki_pages: ${Object.values(pages).filter(p => p.wikitext !== null).length}/${titles.length}; Korean names: ${Object.values(names).filter(n => n.name).length}/${titles.length}`);
if (failed) process.exitCode = 1;
}
// Importing extraction/matching helpers is strictly offline and has no write effects.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
