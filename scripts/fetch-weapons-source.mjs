// Downloads the wiki sources for db/weapons.js into db/source/. Usage: node scripts/fetch-weapons-source.mjs db/source
import { writeFile } from 'node:fs/promises';
const API = 'https://helldivers.wiki.gg/api.php';
const UA = 'HD2FieldGuide/2.0 (fan site data check; contact via github jj-dot-eng)';
const get = async params => {
  const res = await fetch(`${API}?${new URLSearchParams({ format: 'json', ...params })}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${params.list || params.titles}`);
  return res.json();
};
const out = process.argv[2];
const retrievedAt = new Date().toISOString().slice(0, 10);

// 1. Datamined attack data.
const title = 'Module:Decodedata-Attacks/weapons data.json';
const wd = await get({ action: 'query', prop: 'revisions', titles: title, rvprop: 'content|ids|timestamp', rvslots: 'main' });
const page = Object.values(wd.query.pages)[0];
const rev = page.revisions[0];
await writeFile(`${out}/weapons_data.json`, JSON.stringify({
  source: `https://helldivers.wiki.gg/wiki/${title.replaceAll(' ', '_')}`,
  revision: rev.revid, revisionTimestamp: rev.timestamp, retrievedAt,
  data: JSON.parse(rev.slots.main['*']),
}, null, 1) + '\n');

// 2. Category membership (with each page's latest revision id).
const cats = ['Primary Weapons', 'Secondary Weapons', 'Throwables', 'Assault Rifles', 'Marksman Rifles', 'Shotguns', 'Submachine Guns', 'Energy-Based', 'Pistols', 'Melee', 'Special Secondaries', 'Standard Throwables', 'Special Throwables'];
const categories = {};
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
console.log('weapons_data revision', rev.revid, rev.timestamp);
