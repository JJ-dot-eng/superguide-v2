import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const source = await read('db/source/weapons_data.json');
const categoriesSource = await read('db/source/wiki_categories.json');
const data = source.data;
const categories = categoriesSource.categories;
const roster = { 'Primary Weapons': 'primary', 'Secondary Weapons': 'secondary', Throwables: 'throwable' };
const subtypeNames = ['Assault Rifles', 'Marksman Rifles', 'Shotguns', 'Submachine Guns', 'Energy-Based', 'Pistols', 'Melee', 'Special Secondaries', 'Standard Throwables', 'Special Throwables'];
const normalize = value => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const keys = new Map(Object.keys(data.weapons).map(key => [normalize(key), key]));
const aliases = { 'CQC-73 Entrenchment Tool': 'CQC-72 ENTRENCHMENT TOOL' };
const apAll = damage => {
  if (!damage) return null;
  const values = [1, 2, 3, 4].map(index => number(damage[`ap${index}`]));
  return new Set(values).size > 1 ? values : null;
};
const element = damage => damage?.element_name && damage.element_name !== 'none' ? damage.element_name : null;

function stats(attack, weapon, type) {
  const delivery = attack?.type === 'damage' && type === 'melee' ? 'melee' : attack?.type ?? null;
  const node = data[attack?.type]?.[attack?.name];
  const directDamage = attack?.type === 'explosion' ? null : attack?.type === 'damage' ? node : data.damage[node?.damage_id];
  const explosion = attack?.type === 'explosion' ? node : data.explosion[node?.explode_on_impact_id];
  const splashDamage = data.damage[explosion?.damage_id];
  const effectDamage = directDamage ?? splashDamage;
  const continuousBeam = delivery === 'beam' && weapon.beam_fire_rate === 60;
  return {
    direct: number(directDamage?.dmg), durable: number(directDamage?.dmg2), ap: number(directDamage?.ap1), apAll: apAll(directDamage),
    splash: number(splashDamage?.dmg), splashDurable: number(splashDamage?.dmg2), splashAp: number(splashDamage?.ap1), splashApAll: apAll(splashDamage),
    radius: number(explosion?.r2), innerRadius: number(explosion?.r1), pellets: number(node?.pellets),
    shrapnelCount: number(explosion?.shrapnel_count),
    demolition: number(effectDamage?.demo), stun: number(effectDamage?.stun), push: number(effectDamage?.push),
    delivery, element: element(effectDamage), statuses: effectDamage?.statuses ?? [],
    splashElement: element(splashDamage), splashStatuses: splashDamage?.statuses ?? [],
    damageKind: continuousBeam ? 'dps' : delivery === 'beam' || delivery === 'damage' && type !== 'melee' ? null : attack ? 'per-hit' : null,
    unit: continuousBeam ? '빔 1초' : ({ projectile: '탄체·펠릿 1개', spray: '분사 입자 1개', arc: '전격 1회', explosion: '폭발 1회', melee: '타격 1회', beam: '빔 원본 피해값', damage: '피해 항목 1회·시간 단위 미확인' }[delivery] ?? null),
  };
}

function expand(attacks, owner, seen = new Set()) {
  return attacks.flatMap(attack => {
    if (attack.type !== 'weapons') return [{ attack, owner }];
    if (seen.has(attack.name)) throw new Error(`Cyclic weapon reference: ${attack.name}`);
    const nested = data.weapons[attack.name];
    if (!nested) return [{ attack, owner }];
    return expand(nested.attacks ?? [], nested, new Set([...seen, attack.name]));
  });
}

const usedIds = new Set();
const weapons = Object.entries(roster).flatMap(([categoryName, category]) =>
  [...categories[categoryName]].sort((a, b) => a.title < b.title ? -1 : a.title > b.title ? 1 : 0).map(member => {
    const dataKey = aliases[member.title] ?? keys.get(normalize(member.title)) ?? null;
    const weapon = data.weapons[dataKey] ?? {};
    const codeMatch = member.title.match(/^(\S*\d\S*)\s+(.+)$/);
    const code = codeMatch?.[1] ?? null;
    const baseId = slug(codeMatch?.[2] ?? member.title);
    let id = baseId;
    if (usedIds.has(id)) id = `${baseId}-${slug(code ?? category)}`;
    if (usedIds.has(id)) throw new Error(`Duplicate id: ${id}`);
    usedIds.add(id);
    const types = subtypeNames.filter(name => categories[name].some(item => item.title === member.title));
    if (types.length > 1) throw new Error(`Ambiguous subtype: ${member.title}`);
    const type = types.length ? slug(types[0]) : null;
    const attacks = weapon.attacks ?? [];
    const primaryAttack = attacks.find(attack => attack.level === 1) ?? attacks[0];
    const notes = [];
    if (!dataKey) notes.push('데이터마이닝 무기 항목이 없어 수치는 미확인입니다.');
    if (aliases[member.title]) notes.push('위키 제목은 CQC-73이나 데이터 키는 CQC-72 ENTRENCHMENT TOOL입니다. 명시적 별칭으로 연결했습니다.');
    if (!type) notes.push('제공된 하위 분류에 속하지 않아 type은 null입니다.');
    if (!attacks.length) notes.push('원본 공격 목록이 비어 있어 피해 수치는 null입니다. 방어 기능을 피해로 환산하지 않습니다.');
    const expanded = expand(attacks, weapon);
    const impactExplosions = new Set(expanded.map(({ attack }) => data[attack.type]?.[attack.name]?.explode_on_impact_id).filter(Boolean));
    const modes = expanded.filter(({ attack }) => attack.type !== 'status' && !(attack.type === 'explosion' && impactExplosions.has(attack.name)));
    const variants = [];
    const variantIds = new Set();
    const addVariant = (attack, owner, extra = {}) => {
      // Fragments thrown by an explosion reuse another weapon's projectile key (e.g. AC-8_P2), so label them by role.
      const burst = attack.type === 'projectile' ? data.explosion[attack.parent] : null;
      if (burst?.shrapnel === attack.name) extra = { name: `파편 · 폭발 1회당 ${burst.shrapnel_count}개 (${attack.name})`, unit: '파편 1개', ...extra };
      const base = burst?.shrapnel === attack.name ? 'shrapnel' : slug(`${attack.type}-${attack.name}`);
      let variantId = base;
      for (let index = 2; variantIds.has(variantId); index++) variantId = `${base}-${index}`;
      variantIds.add(variantId);
      variants.push({ id: variantId, name: attack.name, ...stats(attack, owner, type), attack: { ...attack }, ...extra });
    };
    if (modes.length > 1 || weapon.charge) {
      for (const { attack, owner } of modes) addVariant(attack, owner);
      notes.push('variants는 원본 공격·부가 피해별 수치입니다. 하위 level은 충전 단계가 아닌 연결 깊이이며, 동시 명중이나 선택 가능한 모드라고 단정하지 않습니다.');
    }
    if (weapon.charge) {
      for (const [index, stage] of (weapon.charge.charge ?? []).entries()) {
        const attack = attacks.find(item => item.type === 'projectile' && item.name === stage.proj);
        addVariant(attack ?? { type: 'projectile', name: stage.proj }, weapon, {
          id: `charge-stage-${index + 1}`, name: `충전 단계 ${index + 1} · ${stage.proj}`,
          chargeTime: number(stage.charge_time),
          notes: [attack ? '연결된 탄체 원본값입니다. 충전 배율의 적용 범위·중복 적용 여부는 미확인입니다.' : '충전 단계의 탄체 키를 해석할 수 없어 피해 수치는 null입니다.'],
        });
      }
      notes.push('charge의 단계·배율을 원문 보존했습니다. DEFAULT 연결과 배율 적용 규칙이 없어 유효 충전 피해를 추정하지 않습니다.');
    }
    if (attacks.some(attack => attack.type === 'weapons')) notes.push('하부 부착 무기는 variants로 전개하고 원본 연결은 attacks 및 linkedAttacks에 보존했습니다.');
    if (expanded.some(({ attack }) => attack.type === 'spray')) notes.push('분사는 입자당 원본 피해입니다. 초당 입자 명중 수와 화상 지속 피해는 합산하지 않습니다.');
    if (expanded.some(({ attack }) => attack.type === 'beam')) notes.push(weapon.beam_fire_rate === 60 ? '연속 빔 피해를 초당 값으로 해석했습니다. 노출 시간·화상 피해는 합산하지 않습니다.' : '펄스 빔의 원본 피해입니다. beam_fire_rate·beams는 초당 피해로 환산하지 않고 별도 보존했습니다.');
    if (expanded.some(({ attack }) => attack.type === 'arc')) notes.push('전격 1회 기준입니다. 다중 방출·연쇄 대상의 피해를 합산하지 않습니다.');
    if (expanded.some(({ attack }) => attack.type === 'damage') && type !== 'melee') notes.push('damage 직접 참조는 원본 피해만 보존하며 시간 단위·반복 횟수는 미확인입니다.');
    const unresolved = expanded.filter(({ attack }) => attack.type !== 'status' && !data[attack.type]?.[attack.name]);
    if (unresolved.length) notes.push(`공격 참조 미확인: ${unresolved.map(({ attack }) => `${attack.type}/${attack.name}`).join(', ')}.`);
    const missingDamage = expanded.filter(({ attack }) => {
      const node = data[attack.type]?.[attack.name];
      return node && attack.type !== 'damage' && !data.damage[node.damage_id];
    });
    if (missingDamage.length) notes.push(`피해 레코드 연결이 비어 있거나 누락되었습니다: ${missingDamage.map(({ attack }) => attack.name).join(', ')}. 피해를 0으로 추정하지 않습니다.`);
    if (expanded.some(({ attack }) => data.explosion[attack.parent]?.shrapnel === attack.name)) notes.push('파편 variant는 파편 1개의 피해입니다. 폭발 1회당 개수는 shrapnelCount이며, 실제로 맞는 파편 수는 거리·각도에 따라 달라 합산하지 않습니다.');
    if (weapon.roundtype === 'rounds') notes.push('낱발 예비탄은 spareRounds에 보존하며 spareMags로 환산하지 않습니다.');
    if (category === 'throwable' && weapon.fuse == null) notes.push('원본에 신관 시간이 없어 fuse는 null입니다.');
    return {
      id, category, type, en: member.title, code, name: null,
      source: `https://helldivers.wiki.gg/wiki/${encodeURIComponent(member.title.replaceAll(' ', '_'))}`,
      sourceRevision: number(member.revision), dataKey,
      ...stats(primaryAttack, weapon, type),
      magazine: number(weapon.cap), spareMags: number(weapon.mags), rpm: number(weapon.rpm),
      fireModes: weapon.fire_modes ?? [], ergonomics: number(weapon.ergonomics), charge: weapon.charge ?? null,
      fuse: number(weapon.fuse), roundType: weapon.roundtype ?? null, spareRounds: number(weapon.rounds),
      beamFireRate: number(weapon.beam_fire_rate), beams: number(weapon.beams), barrels: number(weapon.barrels),
      throwableCapacity: number(weapon.max), throwableStart: number(weapon.start),
      attacks, linkedAttacks: attacks.filter(attack => attack.type === 'weapons').map(attack => ({ dataKey: attack.name, attacks: data.weapons[attack.name]?.attacks ?? [] })),
      notes, variants,
    };
  }));

const weaponsSource = {
  attacks: source.source, attacksRevision: source.revision, attacksRevisionTimestamp: source.revisionTimestamp,
  categories: categoriesSource.source, retrievedAt: source.retrievedAt.slice(0, 10), categoriesRetrievedAt: categoriesSource.retrievedAt.slice(0, 10),
};

// Compact leaf objects/arrays, expanded weapon and variant blocks; no locale or clock dependency.
function literal(value, depth = 0) {
  if (value === null) return 'null';
  if (typeof value === 'string') return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\r', '\\r').replaceAll('\n', '\\n').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')}'`;
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (value.every(item => item === null || typeof item !== 'object')) return `[${value.map(item => literal(item)).join(', ')}]`;
    return `[\n${value.map(item => `${'  '.repeat(depth + 1)}${literal(item, depth + 1)}`).join(',\n')},\n${'  '.repeat(depth)}]`;
  }
  const entries = Object.entries(value);
  const key = name => /^[A-Za-z_$][\w$]*$/.test(name) ? name : literal(name);
  if (entries.length <= 5 && entries.every(([, item]) => item === null || typeof item !== 'object')) return `{ ${entries.map(([name, item]) => `${key(name)}: ${literal(item)}`).join(', ')} }`;
  return `{\n${entries.map(([name, item]) => `${'  '.repeat(depth + 1)}${key(name)}: ${literal(item, depth + 1)},`).join('\n')}\n${'  '.repeat(depth)}}`;
}

const output = `// Generated by scripts/build-weapons.mjs from local db/source files. Do not edit by hand.\nexport const weaponsSource = ${literal(weaponsSource)};\n\nexport const weapons = ${literal(weapons)};\n`;
if (process.argv.includes('--stdout')) {
  process.stdout.write(output);
  process.exit(0);
}
await writeFile(new URL('db/weapons.js', root), output, 'utf8');
console.log('Generated db/weapons.js (local sources only).');
console.log(`Weapons: ${weapons.length} (primary: ${weapons.filter(w => w.category === 'primary').length}, secondary: ${weapons.filter(w => w.category === 'secondary').length}, throwable: ${weapons.filter(w => w.category === 'throwable').length})`);
console.log(`Attack revision: ${weaponsSource.attacksRevision}; retrieved: ${weaponsSource.retrievedAt}`);
