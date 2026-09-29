// Downloads the wiki's English names used by the English edition: every enemy
// page's Anatomy rows (part name + the stats that identify it) and the
// Demolition page's structure list, into db/source/wiki_names.json.
// Translators match our Korean part names to these rows by health and armor.
// Usage: node scripts/fetch-wiki-names.mjs
import { writeFile } from 'node:fs/promises';
import { enemies } from '../dist/data/combat-data.js';
import { structures } from '../dist/data/demolition-data.js';

const API = 'https://helldivers.wiki.gg/api.php';
const UA = 'HD2FieldGuide/2.0 (fan site data check; contact via github modocracy)';
const titleOf = url => decodeURIComponent(new URL(url).pathname.replace('/wiki/', '')).replaceAll('_', ' ');

async function wikitext(title) {
  const params = new URLSearchParams({ action: 'parse', page: title, prop: 'wikitext', format: 'json', formatversion: '2', redirects: '1' });
  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status} ${title}`);
  const body = await res.json();
  if (body.error) throw new Error(`${title}: ${body.error.info}`);
  return { title: body.parse.title, text: body.parse.wikitext };
}

const clean = value => value?.replace(/<br\s*\/?>/gi, ' ').replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/\s+/g, ' ').trim() ?? null;
const field = (row, name) => clean(row.match(new RegExp(`\\|\\s*${name}\\s*=\\s*([^\\n|]*(?:\\|(?!\\s*\\w+\\s*=)[^\\n|]*)*)`))?.[1]);

function anatomy(text) {
  // Section headings name variants on shared pages ("Hardened", "Light" …).
  const rows = [];
  let section = null;
  for (const piece of text.split(/(?=\{\{Anatomy Row)|(?=^==+[^=\n]+==+\s*$)/m)) {
    const heading = piece.match(/^==+\s*([^=\n]+?)\s*==+\s*$/m);
    if (heading && piece.startsWith('=')) section = heading[1];
    if (!piece.startsWith('{{Anatomy Row')) continue;
    rows.push({ section, part: field(piece, 'part_name'), health: field(piece, 'health'), av: field(piece, 'av'), durability: field(piece, 'durability'), toMain: field(piece, 'percent_to_main') });
  }
  return rows;
}

const pages = [...new Set(enemies.map(enemy => enemy.source).filter(Boolean).map(titleOf))];
const out = { source: API, retrievedAt: new Date().toISOString().slice(0, 10), enemies: {}, demolition: null, structurePages: {} };
for (const title of pages) {
  const page = await wikitext(title);
  out.enemies[title] = { title: page.title, anatomy: anatomy(page.text) };
  console.log(title, out.enemies[title].anatomy.length);
}
const demolition = await wikitext('Demolition');
out.demolition = demolition.text;
for (const title of [...new Set(structures.map(item => item.source).filter(Boolean).map(titleOf))].filter(title => title !== 'Demolition')) {
  const page = await wikitext(title);
  out.structurePages[title] = page.text.slice(0, 4000);
}
await writeFile(new URL('../db/source/wiki_names.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
