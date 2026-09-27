import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { weapons, weaponsSource } from '../db/weapons.js';

const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const source = await read('db/source/weapons_data.json');
const categorySource = await read('db/source/wiki_categories.json');
const data = source.data;
const categories = categorySource.categories;
const roster = { primary: 'Primary Weapons', secondary: 'Secondary Weapons', throwable: 'Throwables' };
const typeNames = ['Assault Rifles', 'Marksman Rifles', 'Shotguns', 'Submachine Guns', 'Energy-Based', 'Pistols', 'Melee', 'Special Secondaries', 'Standard Throwables', 'Special Throwables'];
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normalize = value => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
const numericStats = ['direct', 'durable', 'ap', 'splash', 'splashDurable', 'splashAp', 'radius', 'innerRadius', 'pellets', 'shrapnelCount', 'demolition', 'stun', 'push'];
const handling = ['magazine', 'spareMags', 'rpm', 'ergonomics', 'fuse', 'spareRounds', 'beamFireRate', 'beams', 'barrels', 'throwableCapacity', 'throwableStart'];
const perHit = [...numericStats, 'apAll', 'splashApAll', 'delivery', 'element', 'statuses', 'splashElement', 'splashStatuses', 'damageKind', 'unit'];
const count = (items, field) => Object.fromEntries([...new Set(items.map(item => item[field] ?? 'null'))].sort().map(value => [value, items.filter(item => (item[field] ?? 'null') === value).length]));
const finite = (value, path) => assert(value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0, path);
function allNumbers(value, path) {
  if (typeof value === 'number') finite(value, path);
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) allNumbers(child, `${path}.${key}`);
}
function checkStats(item, path) {
  for (const field of perHit) assert(Object.hasOwn(item, field), `${path}.${field} missing`);
  for (const field of numericStats) finite(item[field], `${path}.${field}`);
  for (const field of ['ap', 'splashAp']) assert(item[field] === null || item[field] <= 10, `${path}.${field}`);
  for (const field of ['apAll', 'splashApAll']) {
    if (item[field] === null) continue;
    assert(Array.isArray(item[field]) && item[field].length === 4, `${path}.${field}`);
    for (const value of item[field]) { finite(value, `${path}.${field}`); assert(value === null || value <= 10); }
  }
  if (item.innerRadius !== null && item.radius !== null) assert(item.innerRadius <= item.radius, `${path}: radii`);
  for (const field of ['statuses', 'splashStatuses']) assert(Array.isArray(item[field]) && item[field].every(value => typeof value === 'string'));
  assert([null, 'projectile', 'explosion', 'beam', 'arc', 'spray', 'melee', 'damage', 'weapons', 'status'].includes(item.delivery), `${path}: delivery`);
}

// Independently follow the raw foreign keys, guarding against swapped durable/AP/radius fields.
function checkProjection(item, attack, type) {
  const node = data[attack?.type]?.[attack?.name];
  const direct = attack?.type === 'explosion' ? undefined : attack?.type === 'damage' ? node : data.damage[node?.damage_id];
  const explosion = attack?.type === 'explosion' ? node : data.explosion[node?.explode_on_impact_id];
  const splash = data.damage[explosion?.damage_id];
  const effect = direct ?? splash;
  const expected = {
    direct: direct?.dmg, durable: direct?.dmg2, ap: direct?.ap1,
    splash: splash?.dmg, splashDurable: splash?.dmg2, splashAp: splash?.ap1,
    radius: explosion?.r2, innerRadius: explosion?.r1, pellets: node?.pellets, shrapnelCount: explosion?.shrapnel_count,
    demolition: effect?.demo, stun: effect?.stun, push: effect?.push,
  };
  for (const [field, value] of Object.entries(expected)) assert.equal(item[field], value ?? null, `${item.id}.${field}: source mismatch`);
  assert.equal(item.delivery, attack?.type === 'damage' && type === 'melee' ? 'melee' : attack?.type ?? null);
  assert.deepEqual(item.statuses, effect?.statuses ?? []);
  assert.deepEqual(item.splashStatuses, splash?.statuses ?? []);
  assert.equal(item.element, effect?.element_name && effect.element_name !== 'none' ? effect.element_name : null);
  assert.equal(item.splashElement, splash?.element_name && splash.element_name !== 'none' ? splash.element_name : null);
  for (const [field, damage] of [['apAll', direct], ['splashApAll', splash]]) {
    const values = [1, 2, 3, 4].map(index => damage?.[`ap${index}`] ?? null);
    assert.deepEqual(item[field], damage && new Set(values).size > 1 ? values : null);
  }
}

assert.equal(weapons.length, 103);
assert.equal(new Set(weapons.map(w => w.id)).size, 103);
assert.deepEqual(count(weapons, 'category'), { primary: 55, secondary: 25, throwable: 23 });
assert.match(weaponsSource.retrievedAt, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(weaponsSource.retrievedAt, source.retrievedAt.slice(0, 10));
assert.equal(weaponsSource.attacks, source.source);
assert.equal(weaponsSource.attacksRevision, source.revision);
assert.equal(weaponsSource.categories, categorySource.source);
allNumbers(weaponsSource, 'weaponsSource');
for (const [category, name] of Object.entries(roster)) assert.deepEqual(weapons.filter(w => w.category === category).map(w => w.en).sort(), categories[name].map(m => m.title).sort());

for (const weapon of weapons) {
  assert.match(weapon.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert(Object.hasOwn(roster, weapon.category));
  assert(weapon.type === null || typeNames.map(slug).includes(weapon.type));
  const subtypes = typeNames.filter(name => categories[name].some(m => m.title === weapon.en));
  assert.equal(weapon.type, subtypes.length ? slug(subtypes[0]) : null);
  assert(typeof weapon.en === 'string' && weapon.en.length > 0);
  assert.equal(weapon.source, `https://helldivers.wiki.gg/wiki/${encodeURIComponent(weapon.en.replaceAll(' ', '_'))}`);
  assert.equal(weapon.sourceRevision, categories[roster[weapon.category]].find(m => m.title === weapon.en).revision);
  assert.equal(weapon.name, null);
  const designation = weapon.en.match(/^(\S*\d\S*)\s+(.+)$/);
  assert.equal(weapon.code, designation?.[1] ?? null);
  const baseId = slug(designation?.[2] ?? weapon.en);
  assert(weapon.id === baseId || weapon.id.startsWith(`${baseId}-`));
  assert(typeof weapon.dataKey === 'string' && Object.hasOwn(data.weapons, weapon.dataKey));
  if (weapon.en === 'CQC-73 Entrenchment Tool') {
    assert.equal(weapon.dataKey, 'CQC-72 ENTRENCHMENT TOOL');
    assert(weapon.notes.some(note => note.includes('CQC-73') && note.includes('CQC-72')));
  } else assert.equal(normalize(weapon.en), normalize(weapon.dataKey));
  const raw = data.weapons[weapon.dataKey];
  assert.deepEqual(weapon.attacks, raw.attacks ?? []);
  assert.deepEqual(weapon.charge, raw.charge ?? null);
  assert.deepEqual(weapon.fireModes, raw.fire_modes ?? []);
  for (const [field, sourceField] of Object.entries({ magazine: 'cap', spareMags: 'mags', rpm: 'rpm', ergonomics: 'ergonomics', fuse: 'fuse', spareRounds: 'rounds', beamFireRate: 'beam_fire_rate', beams: 'beams', barrels: 'barrels', throwableCapacity: 'max', throwableStart: 'start' })) assert.equal(weapon[field], raw[sourceField] ?? null);
  assert(Array.isArray(weapon.notes) && weapon.notes.every(note => typeof note === 'string'));
  for (const field of handling) finite(weapon[field], `${weapon.id}.${field}`);
  allNumbers(weapon, weapon.id);
  checkStats(weapon, weapon.id);
  checkProjection(weapon, raw.attacks.find(a => a.level === 1) ?? raw.attacks[0], weapon.type);
  assert.equal(new Set(weapon.variants.map(v => v.id)).size, weapon.variants.length);
  for (const variant of weapon.variants) {
    assert.match(variant.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert(typeof variant.name === 'string' && variant.name.length > 0);
    checkStats(variant, `${weapon.id}.${variant.id}`);
    checkProjection(variant, variant.attack, weapon.type);
    const burst = variant.attack.type === 'projectile' ? data.explosion[variant.attack.parent] : null;
    if (burst?.shrapnel === variant.attack.name) {
      assert(variant.id.startsWith('shrapnel'), `${weapon.id}.${variant.id}: shrapnel label`);
      assert(variant.name.includes(`${burst.shrapnel_count}개`), `${weapon.id}.${variant.id}: shrapnel count`);
    }
  }
  for (const linked of weapon.linkedAttacks) assert.deepEqual(linked.attacks, data.weapons[linked.dataKey].attacks);
  const expanded = raw.attacks.flatMap(a => a.type === 'weapons' ? data.weapons[a.name].attacks : [a]);
  const impacts = new Set(expanded.map(a => data[a.type]?.[a.name]?.explode_on_impact_id).filter(Boolean));
  const modes = expanded.filter(a => a.type !== 'status' && !(a.type === 'explosion' && impacts.has(a.name)));
  const attackVariants = weapon.variants.filter(v => !v.id.startsWith('charge-stage-'));
  assert.deepEqual(attackVariants.map(v => v.attack), modes.length > 1 || raw.charge ? modes : []);
  if (raw.charge) {
    const stages = weapon.variants.filter(v => v.id.startsWith('charge-stage-'));
    assert.equal(stages.length, raw.charge.charge.length);
    for (const [index, stage] of raw.charge.charge.entries()) {
      assert.equal(stages[index].attack.name, stage.proj);
      assert.equal(stages[index].chargeTime, stage.charge_time);
    }
  }
}

// Rebuild to stdout so checking never rewrites db/weapons.js.
const committed = await readFile(new URL('db/weapons.js', root), 'utf8');
for (let run = 1; run <= 2; run++) {
  const rebuilt = execFileSync(process.execPath, [fileURLToPath(new URL('scripts/build-weapons.mjs', root)), '--stdout'], { cwd: fileURLToPath(root), encoding: 'utf8' });
  assert.equal(rebuilt, committed, `Build ${run}: db/weapons.js is stale; run node scripts/build-weapons.mjs`);
}
console.log('Validated 103 weapons; source projections and two byte-identical rebuilds passed.');
console.log(`Category counts: ${JSON.stringify(count(weapons, 'category'))}`);
console.log(`Type counts: ${JSON.stringify(count(weapons, 'type'))}`);
const nullCounts = (items, fields) => Object.fromEntries(fields.map(field => [field, items.filter(item => item[field] === null).length]));
console.log(`Null counts (weapons, all top-level fields): ${JSON.stringify(nullCounts(weapons, Object.keys(weapons[0])))}`);
const variants = weapons.flatMap(w => w.variants);
console.log(`Variants: ${variants.length}`);
console.log(`Null counts (variants, per-hit fields): ${JSON.stringify(nullCounts(variants, perHit))}`);
const list = predicate => weapons.filter(predicate).map(w => w.en).join('; ') || '(none)';
console.log(`Missing data keys: ${list(w => !w.dataKey)}`);
console.log(`Empty attacks: ${list(w => !w.attacks.length)}`);
console.log(`Missing damage links: ${list(w => w.notes.some(n => n.startsWith('피해 레코드 연결')))}`);
console.log(`No subtype: ${list(w => w.type === null)}`);
console.log(`Title/key mismatch: ${list(w => normalize(w.en) !== normalize(w.dataKey))}`);
console.log(`Charge interpretation gaps: ${list(w => w.charge !== null)}`);
console.log(`Unresolved attack references: ${list(w => w.notes.some(n => n.startsWith('공격 참조 미확인')))}`);
console.log(`Underbarrels: ${list(w => w.linkedAttacks.length > 0)}`);
console.log(`Multiple attack components/modes: ${list(w => w.variants.length > 0)}`);
console.log(`Beam/spray/arc units: ${list(w => [w, ...w.variants].some(v => ['beam', 'spray', 'arc'].includes(v.delivery)))}`);
console.log(`Uncertain damage-only units: ${list(w => [w, ...w.variants].some(v => v.delivery === 'damage'))}`);
