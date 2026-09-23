// Turns engine results into short Korean text. No numbers are computed here
// beyond formatting; everything shown comes from the engines or the data.
import { explosionsOf, partPool } from './combat.js';

export const num = value => Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '미확인';
export const pct = value => Number.isFinite(value) ? `${num(value)}%` : '미확인';

// --- Units -------------------------------------------------------------------

export function unitOf(mode) {
  if (mode?.unit === '개') return { unit: '개', noun: '장약 수', one: '장약 1개' };
  if (mode?.unit === '회') return { unit: '회', noun: '타격 수', one: '타격 1회' };
  return { unit: '발', noun: '탄수', one: '1발' };
}

// --- Outcomes ----------------------------------------------------------------

export const OUTCOME = {
  kill: { label: '처치', tone: 'kill' },
  bleed: { label: '출혈 유발', tone: 'bleed' },
  down: { label: '추락', tone: 'kill' },
  break: { label: '부위 파괴', tone: 'break' },
  armor: { label: '장갑 제거', tone: 'break' },
  blocked: { label: '관통 불가', tone: 'blocked' },
  shield: { label: '보호막 먼저', tone: 'unknown' },
  unknown: { label: '계산 보류', tone: 'unknown' },
};
export const outcomeOf = (row) => row.outcome === 'break' && row.target.resultLabel
  ? { label: row.target.resultLabel, tone: 'break' } : OUTCOME[row.outcome];

/** "3발", "2개 이상" … A floor is marked when the count ignores regeneration. */
export function countText(row, mode) {
  if (row.hits == null) return null;
  return `${num(row.hits)}${unitOf(mode).unit}${row.lowerBound ? ' 이상' : ''}`;
}

// --- Reasons -----------------------------------------------------------------

const REASONS = {
  'cap-unknown': '본체로 넘어가는 피해의 상한이 확인되지 않았고, 상한 유무에 따라 결과가 달라 계산하지 않았습니다.',
  'assumption-needed': '한 발에서 이 부위에 몇 개가 맞는지 골라야 계산됩니다. 실제 명중 수는 확인된 자료가 없습니다.',
  'data-missing': '이 부위에 필요한 피해·관통·반경 중 일부가 확인되지 않아 최종 횟수는 계산하지 않았습니다.',
  'assumption-data-missing': '선택한 명중 가정에 필요한 피해 수치가 확인되지 않았습니다.',
  'no-damage': '관통하지 못해 이 부위와 본체 모두 피해가 없습니다.',
  'no-damage-after-armor': '장갑은 벗길 수 있지만 드러난 부위에는 피해가 들어가지 않습니다.',
  'no-damage-assumed': '선택한 명중 가정에서는 피해가 들어가지 않습니다.',
  'leftover-events': '장갑이 깨진 뒤 같은 발의 남은 전격·자탄이 안쪽에 닿는지 확인되지 않아 계산하지 않았습니다.',
  'too-many-hits': '필요 횟수가 계산 범위를 넘습니다.',
  'beam-data-missing': '광선 피해·지속시간 또는 부위 수치가 확인되지 않았습니다.',
  'beam-blocked': '광선이 이 부위 장갑을 관통하지 못합니다.',
  'beam-armor-only': '장갑을 태워 없애는 데까지의 횟수입니다. 이어서 안쪽 살점에 닿는 부분은 확인되지 않아 처치 횟수는 계산하지 않았습니다.',
};
export const reasonText = row => ['unsupported', 'shield', 'part-unknown'].includes(row.reason)
  ? row.detail || '정밀 피해 자료가 아직 확인되지 않았습니다.' : REASONS[row.reason] || '';

// --- Attack description --------------------------------------------------------

export function deliveryOf(mode) {
  if (mode?.beam) return { hit: '광선', verb: '광선 유지' };
  if (mode?.delivery === 'arc') return { hit: '전격', verb: '전격 명중' };
  if (mode?.delivery === 'guided') return { hit: '착탄', verb: '착탄' };
  if (mode?.delivery === 'flag' || mode?.delivery === 'melee') return { hit: '타격', verb: '타격' };
  if (mode?.delivery === 'adhesive') return { hit: '부착 폭발', verb: '부착' };
  return { hit: '직격', verb: '명중' };
}

/** Stat chips for an attack mode: [{ label, value, note? }]. */
export function attackStats(mode) {
  if (!mode || mode.unsupported) return [];
  if (mode.beam) return [
    { label: '초당 피해', value: `${num(mode.beam.standardPerSecond)}`, note: `내구 ${num(mode.beam.durablePerSecond)}/초` },
    { label: '1발 지속', value: `${num(mode.beam.duration)}초`, note: `최대 ${num(mode.standard)}` },
    { label: '관통', value: `AP ${mode.ap}` },
  ];
  const stats = [];
  if (mode.directKind !== 'none' && !(mode.standard === 0 && mode.durable === 0)) {
    stats.push({ label: deliveryOf(mode).hit, value: num(mode.standard), note: `내구 ${num(mode.durable)} · AP ${mode.ap}` });
  }
  for (const blast of explosionsOf(mode)) {
    stats.push({ label: blast.name || '폭발', value: num(blast.durable ?? blast.standard), note: `AP ${num(blast.ap)}${Number.isFinite(blast.innerRadius) ? ` · 중심 ${num(blast.innerRadius)}m / 외곽 ${num(blast.radius)}m` : ''}` });
  }
  if (mode.bomblet) {
    const b = mode.bomblet;
    stats.push({ label: '자탄 1개', value: `${num(b.standard)} + 폭발 ${num(b.explosion)}`, note: `AP ${b.ap}/${b.explosionAp} · 중심 ${num(b.innerRadius)}m / 외곽 ${num(b.radius)}m` });
  }
  return stats;
}

/** One-line statement of what the count assumes for this kind of attack. */
export function assumptionText(mode) {
  if (mode?.beam) return '같은 부위에 광선을 계속 유지하는 조건. 한 발은 약 1.4초 분량으로 환산합니다.';
  if (mode?.hitCondition) return '선택한 명중 수가 모두 해당 부위에 최대 피해로 들어가는 가정. 여러 부위 동시 피해는 더하지 않습니다.';
  if (mode?.delivery === 'adhesive') return '장약 하나하나가 해당 부위에 최대 폭발 피해를 주는 조건. 여러 부위 동시 피해는 더하지 않습니다.';
  if (mode?.delivery === 'melee' || mode?.delivery === 'flag') return '같은 부위를 정면에서 계속 타격하는 조건. 방어구의 근접 피해 보너스는 제외합니다.';
  if (mode?.delivery === 'guided') return '미사일이 해당 부위에 직접 착탄하는 조건. 유도 궤적이 이 부위를 보장하지는 않습니다.';
  if (mode?.delivery === 'arc') return '전격이 해당 부위에 계속 닿는 조건. 전격은 부위를 골라 조준할 수 없습니다.';
  if (explosionsOf(mode || {}).length) return '같은 부위에 직격과 최대 폭발 피해가 함께 들어가는 조건. 여러 부위 동시 피해는 더하지 않습니다.';
  return '같은 부위를 최대 피해로 계속 맞히는 조건. 거리·각도·빗맞음에 따라 실전에서는 더 필요합니다.';
}

// --- Route notes ---------------------------------------------------------------

/** Aim hint for a route: the data's tip plus the attack-specific condition. */
export function aimText(row, mode) {
  const target = row.target;
  const lines = [target.tip];
  const radius = explosionsOf(mode || {}).map(blast => blast.innerRadius).filter(Number.isFinite);
  if (mode?.delivery === 'adhesive' && radius.length) lines.push(`기폭 시 이 부위가 폭발 중심 ${num(Math.min(...radius))}m 안에 들어오게 붙이세요.`);
  else if (radius.length && !mode?.hitCondition) lines.push(`이 부위가 폭발 중심 ${num(Math.min(...radius))}m 안에 들어와야 최대 피해입니다.`);
  if (target.exdr === 100 && radius.length) {
    lines.push(target.partOnly ? '이 장치는 폭발에 면역이라 폭발 피해는 장치 파괴에 더하지 않습니다.' : '이 부위는 폭발에 면역이라 폭발 피해는 본체 장갑·저항으로 따로 계산합니다.');
  }
  if (target.next && row.stages.length > 1) lines.push(`장갑이 깨지면 다음 ${unitOf(mode).unit}부터 ${josa(target.next.name, ['을', '를'])} 노리세요. 초과 피해는 넘어가지 않습니다.`);
  return lines.filter(Boolean);
}

export function routeNotes(row, mode) {
  const { noun } = unitOf(mode);
  const target = row.target;
  const notes = [];
  if (row.reason && (row.hits == null || row.reason === 'beam-armor-only')) notes.push(reasonText(row));
  notes.push(...row.notes);
  if (target.followupNote) notes.push(target.followupNote);
  if (target.destroyMainDamage) notes.push(`부위가 파괴되면 본체에 ${num(target.destroyMainDamage)} 피해가 한 번 더 들어갑니다.`);
  for (const part of [target, target.next].filter(Boolean)) {
    if (part.staticConstitution) notes.push(`${part.name} 체력은 기본 ${num(part.hp)}에 줄지 않는 추가 체력 ${num(part.staticConstitution)}을 더한 ${num(partPool(part))}입니다.`);
  }
  if (target.main) notes.push(`${target.main.name} 체력 ${num(target.main.hp)} 기준으로, 다른 체력 풀과 따로 계산합니다.`);
  if (row.outcome === 'bleed') notes.push('본체 체력이 바닥나 출혈이 시작됩니다. 완전히 쓰러지기까지 잠시 공격할 수 있습니다.');
  if (row.outcome === 'break' || row.outcome === 'armor') notes.push(`이 ${noun}는 처치가 아닌 부위 파괴까지입니다.`);
  if (row.outcome === 'down') notes.push('수송선이 추락하는 횟수입니다. 탑승 병력 처치는 보장하지 않습니다.');
  if (row.via === 'main' && row.hits != null) notes.push('이 부위를 통해 본체 체력을 모두 깎는 경로입니다.');
  if (row.conditional) notes.push(target.prerequisiteNote || `선행 조건(${target.prerequisite})을 먼저 충족한 뒤의 ${noun}입니다. 선행 공격은 포함하지 않습니다.`);
  if (mode?.explosions && target.next) notes.push('한 발의 두 폭발이 장갑과 안쪽에 차례로 들어가는 효과는 확인되지 않아 제외했습니다.');
  return notes;
}

// --- Hit assumption controls ----------------------------------------------------

export function assumptionSummary(mode) {
  if (!mode?.hitCondition) return '';
  if (!mode.assumption) return '한 발에서 이 부위에 맞는 개수를 고르세요.';
  const { count, primaryHit, bombletDirect } = mode.assumption;
  if (mode.hitCondition.kind === 'arcs') return `한 발마다 전격 ${count}회가 이 부위에 명중 (유탄 직격 제외)`;
  const primary = { none: '주탄 피해 제외', blast: '주탄 폭발만', direct: '주탄 직격 + 폭발' }[primaryHit];
  return `${primary} · 자탄 ${count}개 ${bombletDirect && count > 0 ? '직격 + 폭발' : '폭발'} 명중`;
}

// Korean particle after a word: 와/과, 을/를, 은/는 depending on a final consonant.
export function josa(word, [withFinal, withoutFinal]) {
  const code = String(word).trim().slice(-1).charCodeAt(0) - 0xac00;
  const final = code >= 0 && code < 11172 ? code % 28 !== 0 : false;
  return `${word}${final ? withFinal : withoutFinal}`;
}

/** Short tag for counts that rest on an assumption rather than plain aiming. */
export function assumptionTag(mode) {
  if (!mode?.conditionalImpact) return '';
  if (mode.beam) return '광선 유지 가정';
  if (mode.delivery === 'arc') return '전격 명중 가정 · 부위 조준 불가';
  if (mode.delivery === 'guided') return '착탄 부위 가정 · 유도 궤적 비보장';
  if (mode.delivery === 'harpoon') return '직격만 계산 · 가스 피해 제외';
  if (mode.delivery === 'flag') return '찌르기 명중 가정';
  return '명중 조건 가정';
}
