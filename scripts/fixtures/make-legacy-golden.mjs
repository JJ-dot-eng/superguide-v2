// Records every result of the legacy engine (master@9f076c9) so the rewritten
// engine can be checked against it. Extract the legacy site first:
//   git archive 9f076c9 dist | tar -x -C <tmp>
//   node scripts/fixtures/make-legacy-golden.mjs <tmp>/dist scripts/fixtures/legacy-golden.json.gz master@9f076c9
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const [dir, out] = process.argv.slice(2);
const load = name => import(pathToFileURL(resolve(dir, name)).href);
const { enemies, weaponProfiles } = await load('combat-data.js');
const { calculateMatchup } = await load('combat.js');
const { resolveCombatCondition } = await load('combat-conditions.js');
const { structures, demolitionProfiles } = await load('demolition-data.js');
const { calculateDemolition } = await load('demolition.js');
const { getDemolitionSelection } = await load('demolition-selection.js');
const { stratagems } = await load('data.js');
const { factionGuides } = await load('faction-data.js');
const { factionRecommendation } = await load('faction-guide.js');
const { shieldRecovery } = await load('defense-stats.js');

const row = r => ({
  t: r.target.id, h: r.hits, o: r.outcome, v: r.via ?? null, lb: Boolean(r.lowerBound), c: Boolean(r.conditional),
  r: r.reason ?? null, n: r.modelNote ?? null,
  s: r.stages.map(s => [s.name, s.hits, s.damage.direct, s.damage.explosion, s.damage.mainExplosion, s.contactSeconds ?? null]),
});
const matchup = (enemy, mode, options) => {
  const { rows, best } = calculateMatchup(enemy, mode, options);
  return { best: best ? best.target.id : null, rows: rows.map(row) };
};

const combat = [];
for (const enemy of enemies) for (const [weapon, profile] of Object.entries(weaponProfiles)) for (const mode of profile.modes) {
  const scenarios = [];
  if (mode.hitCondition) {
    const { kind, min, max } = mode.hitCondition;
    scenarios.push({ hitCount: '' });
    if (kind === 'arcs') for (let n = min; n <= max; n++) scenarios.push({ hitCount: String(n) });
    else for (const n of [0, 1, 2, 7, 25]) for (const primaryHit of ['none', 'blast', 'direct']) for (const bombletDirect of [false, true]) scenarios.push({ hitCount: String(n), primaryHit, bombletDirect });
  } else scenarios.push({});
  for (const scenario of scenarios) for (const shieldCleared of [false, true]) for (const directHit of [undefined, false]) {
    if (directHit === false && (!shieldCleared || mode.hitCondition)) continue;
    const options = { shieldCleared, ...scenario, ...(directHit === false ? { directHit } : {}) };
    const resolved = resolveCombatCondition(mode, options);
    combat.push({ enemy: enemy.id, weapon, mode: mode.id, options, ...matchup(enemy, resolved, options) });
  }
}

const demolition = [];
for (const structure of structures) for (const [weapon, profile] of Object.entries(demolitionProfiles)) for (const mode of profile.modes) for (const shieldCleared of [false, true]) for (const jammerDisabled of [false, true]) {
  const r = calculateDemolition(structure, profile, mode, { shieldCleared, jammerDisabled });
  demolition.push({ structure: structure.id, weapon, mode: mode.id, options: { shieldCleared, jammerDisabled },
    outcome: r.outcome, method: r.method, route: r.route?.id ?? null, component: r.component, hits: r.hits, reason: r.reason ?? null,
    conditions: r.conditions, health: r.health, routes: r.routes.map(x => [x.route.id, x.outcome, x.component ?? null, x.components.map(c => c.outcome)]) });
}
const selections = [];
for (const structure of ['all', ...structures.map(s => s.id)]) for (const weapon of ['all', ...stratagems.map(s => s.id)]) {
  const modes = weapon === 'all' ? ['all'] : (demolitionProfiles[weapon]?.modes.map(m => m.id) || ['unsupported']);
  for (const mode of modes) for (const shieldCleared of [false, true]) {
    const s = getDemolitionSelection({ structure, weapon, mode, shieldCleared, jammerDisabled: false }, stratagems);
    selections.push({ structure, weapon, mode, shieldCleared, view: s.view,
      entries: s.entries?.map(e => [e.weapon.id, e.outcome, e.attacks.map(a => a.mode.id)]) ?? null,
      counts: s.view === 'weapons' ? [s.possible, s.conditional, s.unknown, s.blocked] : null,
      rows: s.rows?.map(r => [r.structure.id, r.outcome]) ?? null });
  }
}

const factions = [];
for (const guide of factionGuides) for (const unit of guide.units) for (const choice of unit.weapons) {
  const r = factionRecommendation(unit, choice);
  factions.push({ guide: guide.id, enemy: unit.enemy, choice, adviceOnly: Boolean(r.adviceOnly), mode: r.mode?.id ?? null,
    row: r.row ? row(r.row) : null, alternatives: (r.alternatives || []).map(row), reference: r.reference ? [r.reference.weapon, r.reference.mode, r.reference.hits] : null,
    approach: Boolean(r.approach), tactic: Boolean(r.tactic) });
}

const defense = stratagems.filter(s => s.defense).map(s => {
  const cap = s.defense.shield?.capacity;
  return { id: s.id, recovery: [0, cap / 2, cap, -1, undefined].map(v => shieldRecovery(s.defense, v)) };
});

const golden = { generatedFrom: process.argv[4] || 'legacy', combat, demolition, selections, factions, defense };
writeFileSync(out, gzipSync(JSON.stringify(golden)));
console.log(`combat ${combat.length}, demolition ${demolition.length}, selections ${selections.length}, factions ${factions.length}, defense ${defense.length}`);
