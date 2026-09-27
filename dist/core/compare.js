import { stratagemById } from './catalog.js';
import { personalWeapons } from '../data/personal-weapons.js';
import { personalProfiles, personalUnsupported } from './personal-combat.js';
import { weaponProfiles, unsupportedWeapons } from '../data/combat-data.js';
import { solveMatchup, withHitAssumption, isFatal, spearCannotLock } from './combat.js';
import { solveAccumulation } from './accumulate.js';
import { assumptionSummary } from './explain.js';

const personalById = new Map(personalWeapons.map(weapon => [weapon.id, weapon]));
const own = (object, id) => Object.hasOwn(object, id) ? object[id] : null;
export function resolveAttack(weaponId) {
  const weapon = personalById.get(weaponId) || stratagemById.get(weaponId) || null;
  const kind = personalById.has(weaponId) ? 'personal' : weapon ? 'support' : null;
  const profile = kind === 'personal' ? own(personalProfiles, weaponId) : weapon?.category === 'support' ? own(weaponProfiles, weaponId) : null;
  const unsupported = profile ? null : kind === 'personal' ? own(personalUnsupported, weaponId)
    : own(unsupportedWeapons, weaponId) || (weapon ? '지원 무기 외 스트라타젬은 전투 계산 대상이 아닙니다.' : '알 수 없는 무기 ID입니다.');
  return { weapon, kind, profile, unsupported };
}

// Immutable source objects identify the cache. Per-profile option caches are
// bounded so arbitrary user hit-count inputs cannot grow memory indefinitely.
const cache = new WeakMap();
function matchup(enemy, rawMode, options) {
  let modes = cache.get(enemy);
  if (!modes) cache.set(enemy, modes = new WeakMap());
  let values = modes.get(rawMode);
  if (!values) modes.set(rawMode, values = new Map());
  const assume = options.assume || {};
  const key = JSON.stringify([options.shieldCleared === true, assume.hitCount ?? '', assume.primaryHit ?? 'blast', assume.bombletDirect ?? false]);
  if (!values.has(key)) {
    if (values.size >= 64) values.delete(values.keys().next().value);
    const mode = withHitAssumption(rawMode, assume);
    const combatOptions = { shieldCleared: options.shieldCleared === true };
    const single = solveMatchup(enemy, mode, combatOptions);
    const accumulated = single.best ? null : solveAccumulation(enemy, mode, combatOptions);
    // A synthetic target distinguishes a sequence from any single hitbox.
    const accumulation = accumulated ? { ...accumulated,
      target: { id: 'accumulation', name: '여러 부위 순차 타격' }, stages: [],
      via: 'main', conditional: false } : null;
    values.set(key, { mode, ...single, accumulation });
  }
  // Cached route objects must not be mutable through a caller's previous result.
  return structuredClone(values.get(key));
}

/** Returns { entries, parts }. hits counts firing events, not pellets/fragments.
 * magazinesNeeded = ceil(hits / floor(magazine / ammoPerShot)); a multi-barrel
 * event consumes all its loaded barrels even when fewer pellets are assumed hit.
 * Null magazine (including heat weapons and throwables) stays null.
 * assume may be a shared assumption or a map keyed by "weaponId:modeId".
 */
export function compareAttacks(enemy, entries = [], options = {}) {
  options ||= {};
  const parts = (enemy?.parts || []).map(part => ({ id: part.id, name: part.name, conditional: Boolean(part.prerequisite) }));
  const results = entries.map(entry => {
    const { weaponId, modeId } = entry;
    const resolved = resolveAttack(weaponId);
    const rawMode = modeId ? resolved.profile?.modes.find(mode => mode.id === modeId) : resolved.profile?.modes[0];
    const base = {
      ...resolved, weaponId, modeId: rawMode?.id ?? modeId ?? null,
      weaponLabel: resolved.weapon?.name || resolved.weapon?.en || weaponId,
      modeLabel: rawMode?.name || null, mode: rawMode || null,
      status: 'unsupported', reason: resolved.unsupported || rawMode?.unsupported || null,
      route: null, best: null, rows: [], hits: null, outcome: null, part: null,
      accumulated: false, steps: [], summary: null,
      conditional: false, assumption: null, lowerBound: false, shieldCleared: options.shieldCleared === true,
      defaulted: false, defaultAssumed: null, fragmentsExcluded: false, allPelletsAssumed: false,
      shieldAssumed: Boolean(enemy?.shield && options.shieldCleared), verified: false, oneShot: false, magazinesNeeded: null,
    };
    if (!rawMode || rawMode.unsupported || !resolved.profile) return { ...base, reason: base.reason || '선택한 발사 모드를 찾을 수 없습니다.' };
    if (!enemy?.parts?.length || !enemy.main) return { ...base, reason: '적의 부위·본체 수치가 없어 계산하지 못합니다.' };
    if (options.partId && !parts.some(part => part.id === options.partId)) return { ...base, status: 'none', reason: '선택한 부위를 찾을 수 없습니다.' };
    if (spearCannotLock(enemy, rawMode)) return { ...base, reason: '이 적은 해당 유도 무기의 확인된 락온 대상이 아닙니다.' };
    const requested = options.assume?.[`${weaponId}:${rawMode.id}`] || options.assume || {};
    const defaulted = (requested.hitCount == null || requested.hitCount === '') && Number.isFinite(rawMode.hitCondition?.default);
    const assume = defaulted ? { ...requested, hitCount: rawMode.hitCondition.default } : requested;
    const result = matchup(enemy, rawMode, { ...options, assume });
    const best = result.best || result.accumulation;
    const route = options.partId ? result.rows.find(row => row.target.id === options.partId) : best;
    // Zero fragments removes an unverified damage component. It is not a
    // positive hit-count assumption and can be a verified conservative route.
    // Keep the underlying count=0 object so the UI can explain the exclusion.
    const fragmentsExcluded = !defaulted && rawMode.hitCondition?.kind === 'shrapnel' && result.mode.assumption?.count === 0;
    // A configured default is accepted whether selected automatically or by
    // an explicit count. It remains an assumption, never measured accuracy.
    const condition = rawMode.hitCondition;
    const defaultAssumed = condition && Number.isFinite(condition.default) && result.mode.assumption?.count === condition.default
      ? { kind: condition.kind, count: condition.default, max: condition.max, pct: condition.defaultPct } : null;
    // Full pellet hits are an explicit product default, not a guarantee of
    // real-world accuracy. Carry the flag even when max was selected manually.
    const allPelletsAssumed = rawMode.hitCondition?.kind === 'pellets'
      && rawMode.hitCondition.default === rawMode.hitCondition.max
      && result.mode.assumption?.count === rawMode.hitCondition.max;
    const needsAssumption = Boolean(rawMode.hitCondition) && !fragmentsExcluded && !defaultAssumed;
    const status = needsAssumption ? 'assume' : route?.hits != null ? 'route' : 'none';
    const reason = needsAssumption ? result.mode.assumption ? '선택한 명중 수 가정에 따른 결과입니다.' : '부위에 맞는 탄체·펠릿·파편 수를 먼저 선택하세요.'
      : route?.reason ? route.detail || '부위 조건 또는 일부 수치가 미확인입니다.'
        : !route ? result.rows.find(row => row.detail)?.detail || '확인된 처치 경로가 없습니다.'
          : route.accumulated ? route.summary
          : fragmentsExcluded ? `파편 피해를 제외한 ${rawMode.delivery === 'explosive' ? '폭발' : '직격·폭발'}만으로 계산합니다.`
            : defaultAssumed ? assumptionSummary(result.mode) : null;
    const magazine = Object.hasOwn(rawMode, 'magazine') ? rawMode.magazine : resolved.weapon?.magazine;
    const shotsPerMagazine = Number.isFinite(magazine) && magazine > 0 ? Math.floor(magazine / (rawMode.ammoPerShot || 1)) : null;
    const verified = Boolean(route && isFatal(route) && !route.lowerBound && !needsAssumption);
    return {
      ...base, mode: result.mode, status, reason, reasonCode: route?.reason || null,
      route: route || null, best, rows: result.rows,
      accumulated: Boolean(route?.accumulated), steps: route?.steps || [], summary: route?.summary || null,
      hits: route?.hits ?? null, outcome: route?.outcome ?? null, part: route?.target ?? null,
      conditional: Boolean(route?.conditional), assumption: result.mode.assumption || null, lowerBound: Boolean(route?.lowerBound),
      defaulted, defaultAssumed, fragmentsExcluded, allPelletsAssumed,
      verified, oneShot: verified && route.hits === 1,
      magazinesNeeded: route?.hits != null && shotsPerMagazine > 0 ? Math.ceil(route.hits / shotsPerMagazine) : null,
    };
  });
  return { entries: results, parts };
}
