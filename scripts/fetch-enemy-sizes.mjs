// Downloads the wiki's enemy size categories into db/source/wiki_enemy_sizes.json.
// Usage: node scripts/fetch-enemy-sizes.mjs
import { writeFile } from 'node:fs/promises';

const API = 'https://helldivers.wiki.gg/api.php';
const UA = 'HD2FieldGuide/2.0 (fan site data check; contact via github modocracy)';
const SIZES = { small: 'Small Enemies', medium: 'Medium Enemies', large: 'Large Enemies', massive: 'Massive Enemies' };

const get = async params => {
  const res = await fetch(`${API}?${new URLSearchParams({ format: 'json', ...params })}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status} ${params.gcmtitle}`);
  return res.json();
};

const categories = {};
for (const [size, name] of Object.entries(SIZES)) {
  const r = await get({ action: 'query', generator: 'categorymembers', gcmtitle: `Category:${name}`, gcmlimit: '500', gcmnamespace: '0', prop: 'revisions', rvprop: 'ids' });
  categories[size] = Object.values(r.query?.pages || {})
    .map(page => ({ title: page.title, pageid: page.pageid, revision: page.revisions?.[0]?.revid ?? null }))
    .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  console.log(size, categories[size].length);
}
const body = { source: 'https://helldivers.wiki.gg/wiki/Category:Enemies', retrievedAt: new Date().toISOString().slice(0, 10), categories: Object.fromEntries(Object.entries(SIZES).map(([size, name]) => [size, { category: name, members: categories[size] }])) };
await writeFile(new URL('../db/source/wiki_enemy_sizes.json', import.meta.url), JSON.stringify(body, null, 1) + '\n');
