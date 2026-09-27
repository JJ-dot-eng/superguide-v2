import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { weapons } from '../db/weapons.js';
import { personalWeapons, personalWeaponsCheckedAt, personalWeaponsSource } from '../dist/data/personal-weapons.js';
import { personalProfiles, personalUnsupported, personalGroups } from '../dist/core/personal-combat.js';
import { enemies, weaponProfiles } from '../dist/data/combat-data.js';
import { stratagems } from '../dist/core/catalog.js';
import { solveMatchup, withHitAssumption } from '../dist/core/combat.js';
import { compareAttacks, resolveAttack } from '../dist/core/compare.js';
import { encodeLoadout, decodeLoadout, loadoutFactions, loadoutCoverage, suggestFixes, loadoutView } from '../dist/core/loadout.js';
import { parseRoute, formatRoute } from '../dist/core/route.js';
import { parseInfobox } from './build-weapons.mjs';
import { buildPersonalProfiles } from './personal-profiles.mjs';
import { assumptionSummary } from '../dist/core/explain.js';

const root = new URL('../', import.meta.url);
let checked = 0;
const ok = (test, message) => { assert(test, message); checked++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checked++; };
const pages = JSON.parse(await readFile(new URL('db/source/wiki_pages.json', root), 'utf8')).pages;
const enemy = id => enemies.find(item => item.id === id);
const mode = id => personalProfiles[id].modes[0];
const head = (target, attack) => solveMatchup(enemy(target), attack).rows.find(row => row.target.id === 'head');

eq(personalWeapons.map(w => w.id), weapons.map(w => w.id), 'complete source roster and stable order');
eq(personalWeapons.length, 103);
eq(new Set([...personalWeapons, ...stratagems].map(w => w.id)).size, personalWeapons.length + stratagems.length, 'no personal/stratagem ID collisions');
eq(personalGroups.map(g => g.id), ['primary', 'secondary', 'throwable']);
ok(/^\d{4}-\d{2}-\d{2}$/.test(personalWeaponsCheckedAt), 'checkedAt format');
eq(personalWeaponsSource.attacksRevision, 136739);
for (const weapon of personalWeapons) {
  const source = weapons.find(w => w.id === weapon.id);
  const profile = personalProfiles[weapon.id], reason = personalUnsupported[weapon.id];
  ok(Boolean(profile) !== Boolean(reason), `${weapon.id}: exactly profile or reason`);
  eq(weapon.image, parseInfobox(pages[weapon.en].wikitext).image?.replace(/\{\{\s*PAGENAME\s*\}\}/gi, weapon.en) || null, `${weapon.id}: source image`);
  for (const field of ['direct', 'durable', 'ap', 'splash', 'splashDurable', 'pellets', 'magazine', 'dot', 'notes', 'infoboxConflicts']) eq(weapon[field], source[field], `${weapon.id}.${field}`);
  ok(!['attacks', 'linkedAttacks', 'charge', 'infoboxRaw', 'wikitext'].some(key => Object.hasOwn(weapon, key)), 'lean display projection');
  if (reason) { ok(/[가-힣]/.test(reason), 'Korean unsupported reason'); continue; }
  ok(profile.source.startsWith('https://') && profile.note && profile.checkedAt === personalWeaponsCheckedAt, 'profile provenance');
  ok(profile.modes.length > 0, 'nonempty profile');
  eq(new Set(profile.modes.map(m => m.id)).size, profile.modes.length, 'unique mode IDs');
  for (const attack of profile.modes) {
    ok(attack.id && attack.name, 'mode labels');
    if (attack.unsupported) { ok(/[가-힣]/.test(attack.unsupported), 'mode reason'); continue; }
    for (const field of ['standard', 'durable', 'ap', 'explosion', 'explosionDurable', 'explosionAp']) ok(Number.isFinite(attack[field]) && attack[field] >= 0, `${weapon.id}/${attack.id}.${field}`);
    for (const field of ['radius', 'innerRadius', 'magazine']) ok(attack[field] === null || Number.isFinite(attack[field]) && attack[field] >= 0, `${weapon.id}/${attack.id}.${field}`);
    ok(attack.unit && attack.delivery, 'units and delivery');
    ok(Number.isInteger(attack.ammoPerShot) && attack.ammoPerShot > 0, 'ammo use');
    if (attack.hitCondition) {
      const { min, max } = attack.hitCondition;
      ok(Number.isInteger(min) && Number.isInteger(max) && min >= 0 && max >= min, 'assumption bounds');
      eq(head('hunter-hardened', attack).reason, 'assumption-needed', 'no default all-hit assumption');
      for (const hitCount of [-1, max + 1, 1.5, 'bogus', '']) ok(!withHitAssumption(attack, { hitCount }).events, 'invalid count stays pending');
      ok(withHitAssumption(attack, { hitCount: min }).events, 'minimum explicit assumption works');
    }
    ok(!attack.id.startsWith('shrapnel'), 'linked fragment never selectable');
  }
}
eq(personalWeapons.find(w => w.id === 'liberator').image, 'AR-23 Liberator Primary Render.png');
eq(personalProfiles['one-two'].modes.map(m => m.id), ['standard', 'underbarrel']);
eq(personalProfiles['one-two'].modes[1].magazine, 1, 'underbarrel capacity does not inherit rifle capacity');
eq(personalProfiles.halt.modes.map(m => m.magazine), [8, 8], 'independent ammo tubes');
ok(personalProfiles.stoker.modes[1].unsupported, 'spray underbarrel remains unsupported');

// Independent anatomy arithmetic: Hunter head 40 HP, AV0, durability0;
// Liberator 90 > 40. Devastator head 110 HP, AV1; Senator 225 > 110.
eq([enemy('hunter-hardened').parts[0].hp, mode('liberator').standard], [40, 90]);
eq([head('hunter-hardened', mode('liberator')).hits, head('hunter-hardened', mode('liberator')).outcome], [1, 'kill']);
eq([enemy('devastator').parts[0].hp, mode('senator').standard], [110, 225]);
eq(head('devastator', mode('senator')).hits, 1);
// Frag: head ExDR100 redirects the 500 blast to the AV0/ExDR0 main
// pool (160 HP). No direct damage or assumed fragments: 1 explosion kills.
const frag = head('hunter-hardened', withHitAssumption(mode('frag'), { hitCount: 0 }));
eq([frag.hits, frag.outcome, frag.via], [1, 'kill', 'main']);
eq(frag.stages[0].damage, { direct: 0, explosion: 0, mainExplosion: 500 });
// Breaker 30 per pellet: one hit pellet takes 2 shots, two take 1.
eq(head('hunter-hardened', withHitAssumption(mode('breaker'), { hitCount: 1 })).hits, 2);
eq(head('hunter-hardened', withHitAssumption(mode('breaker'), { hitCount: 2 })).hits, 1);
ok(assumptionSummary(withHitAssumption(mode('breaker'), { hitCount: 2 })).includes('펠릿 2개'), 'pellets not labelled as bomblets');
ok(assumptionSummary(withHitAssumption(mode('frag'), { hitCount: 0 })).includes('파편 0개'), 'zero-fragment label');
eq(mode('eruptor').hitCondition.kind, 'shrapnel');
eq(withHitAssumption(mode('eruptor'), { hitCount: 0 }).assumption.primaryHit, 'direct');
eq(personalProfiles['double-freedom'].modes[1].ammoPerShot, 2);
const missingBlast = buildPersonalProfiles([weapons.find(w => w.id === 'liberator')], { projectile: { 'AR-23_P': { explode_on_impact_id: 'unknown-blast' } } }, pages, personalWeaponsCheckedAt);
ok(missingBlast.personalUnsupported.liberator, 'linked but unknown explosion is never silently zero');

const compare = (id, weaponId, options = {}, modeId) => compareAttacks(enemy(id), [{ weaponId, modeId }], options).entries[0];
eq(resolveAttack('liberator').kind, 'personal');
eq(resolveAttack('autocannon').profile, weaponProfiles.autocannon);
ok(resolveAttack('__proto__').unsupported && !resolveAttack('__proto__').profile, 'untrusted IDs cannot resolve prototypes');
eq(compare('hunter-hardened', 'liberator', { partId: 'head' }).magazinesNeeded, 1);
eq(compare('hunter-hardened', 'torcher').status, 'unsupported');
eq(compare('hunter-hardened', 'liberator', {}, 'not-a-mode').status, 'unsupported');
eq(compare('hunter-hardened', 'liberator', { partId: 'not-a-part' }).status, 'none');
eq(compare('hunter-hardened', 'breaker').status, 'assume');
const assumed = compare('hunter-hardened', 'breaker', { assume: { hitCount: 2 } });
eq([assumed.status, assumed.hits, assumed.assumption.count, assumed.verified], ['assume', 1, 2, false]);
eq(compare('hunter-hardened', 'frag', { assume: { 'frag:standard': { hitCount: 0 } } }).hits, 1);
eq(compare('hunter-hardened', 'sickle').magazinesNeeded, null, 'heat is not a magazine');
eq(compare('hunter-hardened', 'frag', { assume: { hitCount: 0 } }).magazinesNeeded, null, 'throwables are not magazines');
eq(compare('hunter-hardened', 'spear').status, 'unsupported', 'lock-on restriction');
eq(compare('harvester', 'recoilless').verified, false, 'shield uncleared by default');
ok(compare('harvester', 'recoilless', { shieldCleared: true }).shieldAssumed, 'shield prerequisite visible');
const synthetic = { id: 'test', main: { hp: 99999, armor: 0, exdr: 0 }, parts: [{ id: 'body', name: '몸통', hp: 46 * 90, armor: 0, durability: 0, exdr: 0, toMain: 0, overflowCap: false, effect: 'kill' }] };
eq(compareAttacks(synthetic, [{ weaponId: 'liberator' }]).entries[0].magazinesNeeded, 2, 'magazine boundary');
const volley = compareAttacks({ ...synthetic, parts: [{ ...synthetic.parts[0], hp: 100 }] }, [{ weaponId: 'bushwhacker', modeId: 'all-barrels' }], { assume: { hitCount: 1 } }).entries[0];
eq([volley.hits, volley.magazinesNeeded], [3, 3], 'multi-barrel event consumes three shells per trigger');
const before = compare('hunter-hardened', 'liberator'); before.route.hits = 999;
eq(compare('hunter-hardened', 'liberator').hits, 1, 'cache protected from result mutation');
eq(compareAttacks(enemy('hunter-hardened'), [{ weaponId: 'senator' }, { weaponId: 'liberator' }]).parts.map(p => p.id), enemy('hunter-hardened').parts.map(p => p.id));

const fixed = { primary: 'liberator', secondary: 'senator', throwable: 'high-explosive', stratagems: ['autocannon', 'recoilless', '', ''], faction: 'terminid' };
eq(decodeLoadout(encodeLoadout(fixed)), fixed, 'URL round trip preserves positions');
eq(decodeLoadout(`#/gear?${encodeLoadout(fixed)}`), fixed);
eq(decodeLoadout(new URLSearchParams(encodeLoadout(fixed))), fixed);
eq(decodeLoadout({ p: 'senator', s: 'liberator', g: 'bad', st: 'autocannon,bad,recoilless,autocannon,quasar', f: 'bad' }), { primary: '', secondary: '', throwable: '', stratagems: ['autocannon', '', 'recoilless', ''], faction: 'terminid' }, 'drop wrong category, unknown IDs, duplicate and excess stratagems');
eq(decodeLoadout('p=%ZZ&s=__proto__').primary, '', 'malformed query tolerated');
eq(parseRoute(formatRoute({ view: 'gear', query: Object.fromEntries(new URLSearchParams(encodeLoadout(fixed))) })).view, 'gear');
eq(parseRoute('#combat').view, 'enemy', 'legacy unchanged');
for (const faction of loadoutFactions) for (const id of faction.enemyIds) ok(enemy(id)?.faction === faction.name, 'faction checklist has existing same-faction anatomy');
const coverage = loadoutCoverage(fixed, 'terminid');
eq(coverage.rows.length, 11);
eq(coverage.gaps.length, 0, 'fixed loadout covers Terminid checklist');
const charger = coverage.rows.find(row => row.enemyId === 'charger');
eq([charger.best.weaponId, charger.best.modeId, charger.best.hits], ['recoilless', 'heat', 1]);
ok(coverage.rows.every(row => row.best.verified && row.perSlot.length === 5), 'per-slot evidence');
eq(loadoutCoverage({}, 'automaton').gaps.length, loadoutFactions.find(f => f.id === 'automaton').enemyIds.length, 'empty loadout gaps');
eq(loadoutCoverage({ primary: 'breaker' }, 'terminid', { assume: { hitCount: 11 } }).gaps.length, 11, 'assumed hits never silently close a gap');
const nonSupport = stratagems.find(s => s.category !== 'support');
eq(loadoutCoverage({ stratagems: [nonSupport.id] }, 'terminid').notComputable[0].id, nonSupport.id);
eq(decodeLoadout(encodeLoadout({ stratagems: [nonSupport.id] })).stratagems[0], nonSupport.id, 'noncombat stratagems carried');
eq(loadoutCoverage({}, 'unknown').rows, []);
const fixes = suggestFixes({ primary: 'liberator' }, 'automaton', { limit: 2 });
ok(fixes.length > 0 && fixes.some(gap => gap.replacements.length), 'real gaps have replacements');
eq(suggestFixes({ primary: 'liberator' }, 'automaton', { limit: 2 }), fixes, 'deterministic suggestions');
for (const gap of fixes) {
  const counts = new Map();
  for (const replacement of gap.replacements) {
    const key = `${replacement.slot}:${replacement.slotIndex}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    ok(replacement.verified && !replacement.assumption && !replacement.lowerBound, 'only verified replacements');
    const next = { primary: 'liberator', stratagems: ['', '', '', ''] };
    if (replacement.slot === 'stratagems') next.stratagems[replacement.slotIndex] = replacement.weaponId;
    else { next[replacement.slot] = replacement.weaponId; eq(resolveAttack(replacement.weaponId).weapon.category, replacement.slot); }
    ok(loadoutCoverage(next, 'automaton').rows.find(row => row.enemyId === gap.enemyId).best, 'suggestion actually closes its gap');
  }
  ok([...counts.values()].every(count => count <= 2), 'per-position limit');
}
eq(suggestFixes({}, 'terminid', { limit: 0 }).every(gap => !gap.replacements.length), true);
eq(loadoutView({ p: fixed.primary, s: fixed.secondary, g: fixed.throwable, st: fixed.stratagems, f: fixed.faction }, fixed.faction).gaps, [], 'gear short-key adapter');

for (const path of ['db/weapons.js', 'dist/data/personal-weapons.js', 'dist/data/personal-profiles.js']) {
  const saved = await readFile(new URL(path, root), 'utf8');
  ok(saved.startsWith('// Generated by scripts/build-weapons.mjs'), 'generated header');
  ok(!saved.includes('\r'), `${path}: LF only`);
  for (let run = 0; run < 2; run++) {
    const rebuilt = execFileSync(process.execPath, [fileURLToPath(new URL('scripts/build-weapons.mjs', root)), '--stdout', path], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    eq(rebuilt, saved, `${path}: stale or nondeterministic generated output`);
  }
}
console.log(`PASS personal: ${checked} assertions; ${personalWeapons.length} weapons (${Object.keys(personalProfiles).length} supported / ${Object.keys(personalUnsupported).length} unsupported); comparison, loadout, suggestions and two byte-identical builds per output.`);
