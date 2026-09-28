// Enemies re-checked against the Wiki Anatomy snapshot (db/source/wiki_anatomy.json):
// every wiki row is a part (matched by sourcePart), merged into a named part
// with the same numbers (anatomyMerged), or left out with a stated reason
// (anatomyOmitted), and every number of a modelled row matches the wiki.
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

// A part that shares the main pool is mainOnly, or (in legacy entries) a part
// with the full main health whose transfer is capped at that health.
const sharesMain = (part, main) => part.mainOnly === true || part.hp === main.hp && part.toMain === 100 && part.overflowCap === true;

function matches(part, row, label, main) {
  if (/^Main\b/.test(row.health)) ok(sharesMain(part, part.main || main), `${label}: health ${row.health} shares a main pool`);
  else eq(part.hp, number(row.health), `${label}: health`);
  eq(part.armor, number(row.av), `${label}: armor`);
  eq(part.durability, number(row.durability), `${label}: durability`);
  eq(part.exdr, number(row.exdr), `${label}: explosive resistance`);
  // "-" means a separate pool that passes nothing on, so its cap is moot.
  if (row.percent_to_main === '-') eq(part.toMain, 0, `${label}: separate pool passes nothing to main`);
  else {
    eq(part.toMain, number(row.percent_to_main), `${label}: % to main`);
    eq(part.overflowCap, { Yes: true, No: false }[row.dmg_cap_main], `${label}: damage cap to main`);
  }
  // Some pages put "Yes (Downs)" in the bleed column instead of fatal.
  const fatal = /^Yes/.test(row.fatal) || /Downs/.test(row.bleed);
  ok(fatal ? ['kill', 'bleed', 'down'].includes(part.effect) : ['break', 'armor'].includes(part.effect), `${label}: fatal ${row.fatal} vs ${part.effect}`);
  const bleed = row.bleed.match(/^([\d,]+) \[-([\d.]+)\/s\]$/);
  if (['None', 'No'].includes(row.bleed) || /Downs/.test(row.bleed)) ok(!part.staticConstitution && !part.constitution, `${label}: no extra health`);
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
  // Rows of an extra tab (e.g. "Pilot") are named "<tab>: <part>". An enemy
  // that is one tab of a shared page names its tab in anatomyTable.
  const home = enemy.anatomyTable ?? 0;
  const tables = enemy.anatomyTables ?? [...new Set(page.rows.map(row => row.table ?? 0))];
  const nameOf = row => (row.table ?? 0) === home ? clean(row.part_name) : `${row.tab}: ${clean(row.part_name)}`;
  const byName = new Map(page.rows.filter(row => tables.includes(row.table ?? 0)).map(row => [nameOf(row), row]));
  const mainOf = name => byName.get(name.includes(': ') ? `${name.split(': ')[0]}: Main` : 'Main');
  const vitals = (main, row) => eq([main.hp, main.armor, main.exdr], [number(row.health), number(row.av), number(row.exdr)], `${enemy.id}: ${row.tab ?? ''} main`);
  vitals(enemy.main, mainOf(''));
  const parts = partsOf(enemy);
  const covered = new Set();
  for (const part of parts.filter(part => part.sourcePart)) {
    const row = byName.get(part.sourcePart);
    ok(row, `${enemy.id}/${part.id}: wiki row ${part.sourcePart}`);
    matches(part, row, `${enemy.id}/${part.id}`, enemy.main);
    // A part with its own health pool (a pilot, a turret) matches that tab's Main.
    if (part.main && part.sourcePart.includes(': ')) { vitals(part.main, mainOf(part.sourcePart)); covered.add(`${part.sourcePart.split(': ')[0]}: Main`); }
    covered.add(part.sourcePart);
  }
  for (const [name, partId] of Object.entries(enemy.anatomyMerged || {})) {
    const part = parts.find(item => item.id === partId);
    ok(part && byName.has(name), `${enemy.id}: ${name} merged into ${partId}`);
    matches(part, byName.get(name), `${enemy.id}/${partId} (${name})`, enemy.main);
    covered.add(name);
  }
  for (const [name, reason] of Object.entries(enemy.anatomyOmitted || {})) {
    ok(byName.has(name) && !covered.has(name) && /^[ -~]{20,}$/.test(reason), `${enemy.id}: ${name} left out with an English reason`);
    covered.add(name);
  }
  const uncovered = [...byName.keys()].filter(name => name !== 'Main' && !covered.has(name));
  eq(uncovered, [], `${enemy.id}: every wiki anatomy row is a part`);
}
console.log(`PASS anatomy: ${checked} checks; ${revised.length} enemies match Wiki Anatomy snapshot ${snapshot.retrievedAt}.`);
