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
import { assumptionSummary, assumptionTag, assumptionText, unitOf, countText, aimText, attackStats, deliveryOf, routeNotes } from '../dist/core/explain.js';
import { fuseDetails } from './personal-display.mjs';

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
const playerCopy = [...Object.values(personalUnsupported)];
const collectModeCopy = attack => {
  playerCopy.push(...[attack.name, attack.note, attack.unsupported, attack.hitCondition?.projectileName].filter(Boolean));
  if (attack.bomblet) collectModeCopy(attack.bomblet);
};
for (const profile of Object.values(personalProfiles)) {
  playerCopy.push(profile.note);
  profile.modes.forEach(collectModeCopy);
}
for (const text of playerCopy) ok(!/ap1|원본|레코드|탄체|\blevel\b|damage(?:_id)?|durable|splash|beam_fire_rate|charge_time|tac_reload_time/i.test(text), 'personal combat copy has no internal terminology');
eq(personalUnsupported.purifier, '충전했을 때의 정확한 피해가 확인되지 않아 계산하지 않습니다.');
eq(personalUnsupported.scythe, '광선을 얼마나 오래 비추는지에 따라 피해가 달라져 발 단위로 계산하지 않습니다.');
eq(personalUnsupported.torcher, '불꽃이 몇 번 닿는지 확인되지 않아 발 단위로 계산하지 않습니다.');
ok(personalProfiles.frag.modes[0].note.includes('파편을 빼고 폭발 피해만'), 'throwable note distinguishes blast-only default');
ok(personalProfiles.eruptor.modes[0].note.includes('직접 맞혔을 때의 피해와 폭발 피해만'), 'Eruptor note keeps direct plus blast default');
const weaponOf = id => personalWeapons.find(w => w.id === id);
eq([weaponOf('dynamite').fuseType, weaponOf('dynamite').fuseOptions, weaponOf('dynamite').fuse], ['selectable', [5, 15, 60], null], 'selectable fuse never chooses a single time');
eq([weaponOf('impact').fuseType, weaponOf('impact').fuse], ['impact', null]);
eq(weaponOf('melta-mine').fuseType, 'proximity');
eq([weaponOf('shield').fuseType, weaponOf('shield').fuse], ['timed', 0], 'explicit zero seconds is not no fuse');
eq(weaponOf('throwing-knife').fuseType, 'none');
eq(weaponOf('liberator').fuseType, null, 'no inferred fuse for firearms');
eq(fuseDetails('5s / unknown', 'throwable'), { fuseType: null, fuseOptions: [] });
eq(fuseDetails('5-15s', 'throwable'), { fuseType: null, fuseOptions: [] }, 'range is not selectable options');
eq(fuseDetails('', 'throwable'), { fuseType: null, fuseOptions: [] }, 'absent is not none');
eq(fuseDetails('0s', 'throwable'), { fuseType: 'timed', fuseOptions: [] });
eq(weaponOf('frag').variants.find(v => v.id === 'shrapnel').displayName, '파편');
eq(weaponOf('frag').variants[0].displayName, '폭발');
eq(weaponOf('one-two').variants[1].displayName, '하부 유탄 발사기');
eq(weaponOf('arbitrator').variants[1].displayName, '하부 산탄총');
eq(weaponOf('stoker').variants[1].displayName, '하부 화염방사기');
eq(weaponOf('liberator').playerNotes, [], 'ordinary weapon has no noisy developer commentary');
ok(weaponOf('accelerator-rifle').playerNotes.some(note => note.includes('8개') && note.includes('12개')), 'conflict communicated to player');
ok(weaponOf('thermite').playerNotes.some(note => note.includes('2m') && note.includes('1.5m') && note.includes('2.5m')), 'radius conflict preserves both boundaries');
for (const id of ['frag', 'torcher', 'scythe', 'purifier', 'one-two']) ok(weaponOf(id).playerNotes.length > 0, `${id}: relevant caveat`);
for (const weapon of personalWeapons) {
  const source = weapons.find(w => w.id === weapon.id);
  const profile = personalProfiles[weapon.id], reason = personalUnsupported[weapon.id];
  ok(Array.isArray(weapon.playerNotes) && weapon.playerNotes.every(note => typeof note === 'string' && /[가-힣]/.test(note)), 'player notes are Korean sentences');
  ok(weapon.playerNotes.every(note => !/인포박스|데이터마이닝|\bDB\b|variants|tac_reload_time|revision|null|damage_id|sourceRevision/.test(note)), 'no developer jargon in player notes');
  ok([null, 'timed', 'impact', 'proximity', 'selectable', 'none'].includes(weapon.fuseType), 'fuse enum');
  ok(Array.isArray(weapon.fuseOptions) && weapon.fuseOptions.every(v => Number.isFinite(v) && v >= 0), 'numeric fuse options');
  for (const variant of weapon.variants) {
    ok(variant.displayName && /[가-힣]/.test(variant.displayName) && !/[A-Z]|_/.test(variant.displayName), 'friendly variant label, no raw attack keys');
    eq(variant.name, source.variants.find(v => v.id === variant.id).name, 'raw variant name retained');
  }
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
      if (attack.hitCondition.kind === 'shrapnel') eq(attack.hitCondition.default, 0, 'fragments default to exclusion');
      else ok(!Object.hasOwn(attack.hitCondition, 'default'), 'pellets/arcs have no implicit hit count');
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
const pelletsTwo = withHitAssumption(mode('breaker'), { hitCount: 2 });
const fragmentsZero = withHitAssumption(mode('frag'), { hitCount: 0 });
const fragmentsThree = withHitAssumption(mode('eruptor'), { hitCount: 3 });
eq(assumptionSummary(pelletsTwo), '한 발에 펠릿 2개가 이 부위에 명중');
eq(assumptionSummary(fragmentsZero), '폭발 1회당 파편 0개가 이 부위에 명중 + 주폭발 (파편 피해 제외)');
eq(assumptionSummary(fragmentsThree), '폭발 1회당 파편 3개가 이 부위에 명중 + 주탄 직격 + 폭발');
ok(assumptionSummary(mode('breaker')).includes('펠릿 수를 고르세요'), 'pending pellet prompt');
ok(assumptionSummary(withHitAssumption(mode('frag'), { hitCount: -1 })).includes('파편 수를 고르세요'), 'invalid fragment count stays pending in copy');
eq(assumptionTag(mode('breaker')), '펠릿 명중 수 선택 필요');
eq(assumptionTag(pelletsTwo), '펠릿 명중 수 가정');
eq(assumptionTag(fragmentsZero), '파편 제외 · 폭발만');
eq(assumptionTag(fragmentsThree), '파편 명중 수 가정');
ok(assumptionText(mode('breaker')).includes('자동 계산하지 않습니다'), 'pellet caveat');
ok(!assumptionText(mode('high-explosive')).includes('직격'), 'pure explosion does not claim direct hit');
eq(unitOf(mode('frag')), { unit: '개', noun: '수류탄 개수', one: '수류탄 1개' });
eq(countText({ hits: 2 }, mode('frag')), '수류탄 2개');
eq(countText({ hits: 2, lowerBound: true }, mode('melta-mine')), '지뢰 2개 이상');
eq(unitOf(mode('dynamite')).one, '다이너마이트 1개');
eq(unitOf(weaponProfiles['c4-pack'].modes[0]), { unit: '개', noun: '장약 수', one: '장약 1개' }, 'legacy C4 unit unchanged');
eq(countText({ hits: 2 }, weaponProfiles['c4-pack'].modes[0]), '2개', 'legacy count format unchanged');
eq(deliveryOf(mode('frag')).hit, '폭발');
eq(deliveryOf(mode('breaker')).hit, '펠릿 1개');
ok(attackStats(mode('frag')).some(stat => stat.label === '파편 1개'), 'fragment stats labelled correctly');
ok(!attackStats(mode('frag')).some(stat => stat.label.includes('자탄')), 'fragments are not bomblets');
ok(aimText(frag, fragmentsZero).some(line => line.includes('파편 0개')), 'aim repeats selected assumption');
ok(aimText(frag, fragmentsZero).some(line => line.includes('폭발 중심')), 'fragment shots retain blast aim condition');
ok(routeNotes(head('hunter-hardened', mode('breaker')), mode('breaker')).some(note => note.includes('펠릿 수를 고르세요')), 'pending route notes identify pellets');
eq(assumptionSummary(withHitAssumption(weaponProfiles['de-escalator'].modes[0], { hitCount: 2 })), '한 발마다 전격 2회가 이 부위에 명중 (유탄 직격 제외)', 'legacy arc explanation unchanged');
eq(assumptionSummary(withHitAssumption(weaponProfiles['airburst-launcher'].modes[0], { hitCount: 2 })), '주탄 폭발만 · 자탄 2개 폭발 명중', 'legacy bomblet explanation unchanged');
ok(assumptionSummary(withHitAssumption(personalProfiles.variable.modes.find(m => m.id === 'volley'), { hitCount: 2 })).includes('탄환 2개'), 'volley bullets are not shotgun pellets');
eq(mode('eruptor').hitCondition.kind, 'shrapnel');
eq(withHitAssumption(mode('eruptor'), { hitCount: 0 }).assumption.primaryHit, 'direct');
const defaultEruptor = withHitAssumption(mode('eruptor'), { hitCount: mode('eruptor').hitCondition.default });
eq(defaultEruptor.events.length, 1, 'default Eruptor has only the primary event');
const defaultEruptorHead = head('hunter-hardened', defaultEruptor);
eq([defaultEruptorHead.hits, defaultEruptorHead.outcome], [1, 'kill'], 'default Eruptor kills Hunter without fragments');
eq(defaultEruptorHead.stages[0].damage, { direct: 230, explosion: 0, mainExplosion: 225 }, 'Eruptor primary direct and blast only');
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
for (const id of ['eruptor', 'frag', 'pineapple', 'lure-mine']) {
  const conservative = compare('hunter-hardened', id);
  eq([conservative.status, conservative.verified, conservative.defaulted, conservative.fragmentsExcluded, conservative.assumption.count], ['route', true, true, true, 0], `${id}: conservative default is verified`);
  const explicitZero = compare('hunter-hardened', id, { assume: { hitCount: '0' } });
  eq([explicitZero.verified, explicitZero.defaulted, explicitZero.fragmentsExcluded], [true, false, true], 'explicit zero is also conservative');
  eq(compare('hunter-hardened', id, { assume: { hitCount: '' } }).defaulted, true, 'blank selector uses default');
  const positive = compare('hunter-hardened', id, { assume: { hitCount: 1 } });
  eq([positive.status, positive.verified, positive.defaulted, positive.fragmentsExcluded], ['assume', false, false, false], 'positive fragments remain hypothetical');
  const invalid = compare('hunter-hardened', id, { assume: { hitCount: -1 } });
  eq([invalid.status, invalid.verified, invalid.assumption, invalid.defaulted], ['assume', false, null, false], 'invalid explicit input never silently defaults');
  eq(compare('hunter-hardened', id).assumption.count, 0, 'cache keeps default apart from positive assumption');
}
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
for (const loadout of [{ primary: 'eruptor' }, { throwable: 'frag' }]) {
  const row = loadoutCoverage(loadout, 'terminid').rows.find(row => row.enemyId === 'hunter-hardened');
  eq([row.status, row.best.fragmentsExcluded, row.best.assumption.count], ['route', true, 0], 'loadout uses conservative default');
  eq(loadoutView(loadout, 'terminid', { limit: 0 }).rows.find(row => row.enemyId === 'hunter-hardened').best.weaponId, row.best.weaponId, 'loadout view uses same default');
  eq(loadoutCoverage(loadout, 'terminid', { assume: { hitCount: 1 } }).rows.find(row => row.enemyId === 'hunter-hardened').status, 'gap', 'positive fragment assumption cannot close gap');
}
ok(loadoutCoverage({ primary: 'breaker' }, 'terminid').rows.every(row => row.status === 'gap'), 'shotguns still require a choice');
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
    ok(replacement.verified && (!replacement.assumption || replacement.fragmentsExcluded && replacement.assumption.count === 0) && !replacement.lowerBound, 'only verified or fragment-excluding replacements');
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
