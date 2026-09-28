// Downloads the wiki Anatomy tables of every combat enemy page into
// db/source/wiki_anatomy.json. Offline checks (scripts/test-anatomy.mjs) read
// only that snapshot. Usage: node scripts/fetch-enemy-anatomy.mjs
import { writeFile } from 'node:fs/promises';
import { enemies } from '../dist/data/combat-data.js';

const API = 'https://helldivers.wiki.gg/api.php';
const UA = 'HD2FieldGuide/2.0 (fan site data check; contact via github jj-dot-eng)';
const titleOf = enemy => decodeURIComponent(enemy.source.split('/wiki/')[1]).replaceAll('_', ' ');

// One Anatomy Row → its fields, keeping the raw wiki text of each value.
export function anatomyRows(wikitext) {
  return [...wikitext.matchAll(/\{\{\s*Anatomy Row([\s\S]*?)\n\s*\}\}/g)].map(match => {
    const row = {};
    for (const line of match[1].split('\n')) {
      const field = line.match(/^\s*\|\s*([a-z_]+)\s*=\s*(.*)$/i);
      if (field) row[field[1].toLowerCase()] = field[2].trim();
    }
    return row;
  });
}

const titles = [...new Set(enemies.map(titleOf))].sort();
const pages = {};
for (let i = 0; i < titles.length; i += 50) {
  const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'revisions', rvprop: 'ids|content', rvslots: 'main', titles: titles.slice(i, i + 50).join('|') });
  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status} anatomy batch ${i}`);
  const json = await res.json();
  const asked = Object.fromEntries((json.query.normalized || []).map(item => [item.to, item.from]));
  for (const page of json.query.pages) {
    const title = asked[page.title] ?? page.title;
    const revision = page.revisions?.[0];
    if (!revision) throw new Error(`Missing wiki page: ${title}`);
    pages[title] = { source: `https://helldivers.wiki.gg/wiki/${title.replaceAll(' ', '_')}`, revision: revision.revid, rows: anatomyRows(revision.slots.main.content) };
  }
  await new Promise(resolve => setTimeout(resolve, 250));
}
const missing = titles.filter(title => !pages[title]);
if (missing.length) throw new Error(`Missing pages: ${missing.join(', ')}`);
const body = { retrievedAt: new Date().toISOString().slice(0, 10), pages: Object.fromEntries(titles.map(title => [title, pages[title]])) };
await writeFile(new URL('../db/source/wiki_anatomy.json', import.meta.url), JSON.stringify(body, null, 1) + '\n');
console.log(`${titles.length} pages, ${Object.values(pages).reduce((sum, page) => sum + page.rows.length, 0)} anatomy rows`);
