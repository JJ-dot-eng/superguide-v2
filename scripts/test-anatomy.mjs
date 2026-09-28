// Enemies re-checked against the Wiki Anatomy snapshot (db/source/wiki_anatomy.json):
// every wiki row is either a part (matched by sourcePart) or merged into a
// named part with the same numbers, and every number matches the wiki.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { enemies } from '../dist/data/combat-data.js';

const snapshot = JSON.parse(await readFile(new URL('../db/source/wiki_anatomy.json', import.meta.url), 'utf8'));
let checked = 0;
const ok = (test, message) => { assert(test, message); checked++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checked++; };

const clean = text => text.replace(/<!--[\s\S]*?-->/g, '').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
const number = text => Number(text.replace(/[,%]/g, ''));
const titleOf = enemy => decodeURIComponent(enemy.source.split('/wiki/')[1]).replaceAll('_', ' ');
const partsOf = enemy => enemy.parts.flatMap(part => [part, ...(part.next ? [part.next] : [])]);

function matches(part, row, label) {
  if (row.health === 'Main') ok(part.mainOnly === true, `${label}: health Main shares the main pool`);
  else eq(part.hp, number(row.health), `${label}: health`);
  eq(part.armor, number(row.av), `${label}: armor`);
  eq(part.durability, number(row.durability), `${label}: durability`);
  eq(part.exdr, number(row.exdr), `${label}: explosive resistance`);
  eq(part.toMain, number(row.percent_to_main), `${label}: % to main`);
  eq(part.overflowCap, { Yes: true, No: false }[row.dmg_cap_main], `${label}: damage cap to main`);
  ok(/^Yes/.test(row.fatal) ? ['kill', 'bleed', 'down'].includes(part.effect) : ['break', 'armor'].includes(part.effect), `${label}: fatal ${row.fatal} vs ${part.effect}`);
  const bleed = row.bleed.match(/^([\d,]+) \[-([\d.]+)\/s\]$/);
  if (row.bleed === 'None') ok(!part.staticConstitution && !part.constitution, `${label}: no extra health`);
  else if (bleed && Number(bleed[2]) === 0) eq(part.staticConstitution, number(bleed[1]), `${label}: extra health that never decays`);
  else if (bleed) eq(part.constitution, number(bleed[1]), `${label}: bleed-out health`);
  else assert.fail(`${label}: unreadable bleed ${row.bleed}`);
}

const revised = enemies.filter(enemy => enemy.anatomyRevision);
ok(revised.length > 0, 'at least one re-checked enemy');
for (const enemy of revised) {
  const page = snapshot.pages[titleOf(enemy)];
  ok(page, `${enemy.id}: page in snapshot`);
  eq(page.revision, enemy.anatomyRevision, `${enemy.id}: snapshot revision is the one reviewed`);
  const byName = new Map(page.rows.map(row => [clean(row.part_name), row]));
  const mainRow = byName.get('Main');
  eq([enemy.main.hp, enemy.main.armor, enemy.main.exdr], [number(mainRow.health), number(mainRow.av), number(mainRow.exdr)], `${enemy.id}: main`);
  const parts = partsOf(enemy);
  const covered = new Set();
  for (const part of parts.filter(part => part.sourcePart)) {
    const row = byName.get(part.sourcePart);
    ok(row, `${enemy.id}/${part.id}: wiki row ${part.sourcePart}`);
    matches(part, row, `${enemy.id}/${part.id}`);
    covered.add(part.sourcePart);
  }
  for (const [name, partId] of Object.entries(enemy.anatomyMerged || {})) {
    const part = parts.find(item => item.id === partId);
    ok(part && byName.has(name), `${enemy.id}: ${name} merged into ${partId}`);
    matches(part, byName.get(name), `${enemy.id}/${partId} (${name})`);
    covered.add(name);
  }
  const uncovered = [...byName.keys()].filter(name => name !== 'Main' && !covered.has(name));
  eq(uncovered, [], `${enemy.id}: every wiki anatomy row is a part`);
}
console.log(`PASS anatomy: ${checked} checks; ${revised.length} enemies match Wiki Anatomy snapshot ${snapshot.retrievedAt}.`);
