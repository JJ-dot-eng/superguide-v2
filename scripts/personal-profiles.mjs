// Offline projection only. Selection rules below are reviewed against wiki_pages;
// attack.level is a dependency depth, never proof of a selectable firing mode.
export function buildPersonalProfiles(weapons, data, pages, checkedAt) {
  const personalProfiles = {}, personalUnsupported = {};
  const finite = value => Number.isFinite(value) && value >= 0;
  const sprayReason = '불꽃이 몇 번 닿는지 확인되지 않아 발 단위로 계산하지 않습니다.';
  const specialReasons = {
    'double-edge-sickle': '총이 뜨거워지면 피해가 달라집니다. 피해가 바뀌는 정확한 조건을 확인하지 못해 계산하지 않습니다.',
    arc: '던진 뒤 전격이 몇 번 발생하고 같은 부위에 몇 번 맞는지 확인되지 않아 계산하지 않습니다.',
    'throwing-knife': '칼 한 개를 던져 맞혔을 때의 정확한 피해를 확인하지 못해 계산하지 않습니다.',
    'stim-pistol': '치료용 장비입니다. 적에게 주는 피해를 확인하지 못해 처치 횟수는 계산하지 않습니다.',
    smoke: '연막을 펼치는 장비입니다. 적에게 주는 피해를 확인하지 못해 처치 횟수는 계산하지 않습니다.',
    smokescreen: '연막을 펼치는 장비입니다. 적에게 주는 피해를 확인하지 못해 처치 횟수는 계산하지 않습니다.',
    shield: '방어막을 만드는 장비로, 처치 횟수는 계산하지 않습니다.',
  };
  const makeMode = (weapon, stats, id = 'standard', name = '기본 사격', magazine = weapon.magazine) => {
    const pureBlast = stats.delivery === 'explosion';
    const attack = stats.attack || weapon.attacks.find(a => a.level === 1) || weapon.attacks[0];
    const hasExplosion = pureBlast || stats.splash !== null || Boolean(data[attack?.type]?.[attack?.name]?.explode_on_impact_id);
    const mode = {
      id, name, standard: pureBlast ? 0 : stats.direct, durable: pureBlast ? 0 : stats.durable,
      ap: pureBlast ? 0 : stats.ap,
      // Null splash on a projectile means no linked impact explosion, not an
      // unknown explosion. A linked explosion with missing damage stays null.
      explosion: hasExplosion ? stats.splash : 0,
      explosionDurable: hasExplosion ? stats.splashDurable : 0,
      explosionAp: hasExplosion ? stats.splashAp : 0,
      innerRadius: stats.innerRadius, radius: stats.radius,
      delivery: pureBlast ? 'explosive' : stats.delivery,
      unit: weapon.category === 'throwable' ? '개' : stats.delivery === 'melee' ? '회' : '발',
      ...(weapon.category === 'throwable' ? { unitLabel: ['melta-mine', 'lure-mine'].includes(weapon.id) ? '지뢰' : weapon.id === 'dynamite' ? '다이너마이트' : '수류탄' } : {}),
      magazine: weapon.category === 'throwable' ? null : magazine,
      ammoPerShot: 1,
    };
    if (stats.delivery === 'spray') return { id, name, unsupported: sprayReason };
    if (stats.pellets > 1) mode.hitCondition = { kind: 'pellets', min: 1, max: stats.pellets };
    if (stats.delivery === 'melee') mode.note = '한 번 휘둘러 맞혔을 때의 피해입니다. 실제로 그 부위에 닿을 수 있는지, 방어구로 늘어나는 피해와 기절 같은 효과는 반영하지 않습니다.';
    if (weapon.id === 'blitzer') {
      if (!/five arcs with damage of 50/.test(pages[weapon.en].wikitext)) throw new Error('Blitzer arc evidence changed');
      mode.hitCondition = { kind: 'arcs', min: 1, max: 5 };
    }
    return mode;
  };
  for (const weapon of weapons) {
    let reason = specialReasons[weapon.id];
    if (weapon.charge) reason = '충전했을 때의 정확한 피해가 확인되지 않아 계산하지 않습니다.';
    if (weapon.delivery === 'beam') reason = '광선을 얼마나 오래 비추는지에 따라 피해가 달라져 발 단위로 계산하지 않습니다.';
    if (weapon.delivery === 'spray') reason = sprayReason;
    if (reason) { personalUnsupported[weapon.id] = reason; continue; }
    let modes = [makeMode(weapon, weapon, 'standard', weapon.category === 'throwable' ? '폭발 1회' : '기본 사격')];
    if (weapon.id === 'halt') modes = weapon.variants.map((v, i) => makeMode(weapon, v, i ? 'stun' : 'flechette', i ? '기절탄' : '플레셰트탄', 8));
    if (weapon.linkedAttacks.length) {
      modes = [makeMode(weapon, weapon, 'standard', '주 총열')];
      for (const linked of weapon.linkedAttacks) {
        const attack = linked.attacks.find(a => a.level === 1 && a.type !== 'status');
        const variant = weapon.variants.find(v => v.attack?.name === attack?.name && v.attack?.parent === attack?.parent);
        if (!variant) throw new Error(`Missing underbarrel: ${weapon.id}`);
        modes.push(makeMode(weapon, variant, 'underbarrel', '하부 부착 무기', data.weapons[linked.dataKey].cap ?? null));
      }
    }
    if (['missile-pistol', 'warrant'].includes(weapon.id)) {
      modes = [makeMode(weapon, weapon, 'unguided', '비유도 · 한 발'),
        { id: 'guided', name: '유도 사격', unsupported: '어떤 적을 겨냥할 수 있고 어느 부위에 맞는지 확인되지 않아 유도 사격은 계산하지 않습니다.' }];
    }
    if (['bushwhacker', 'double-freedom'].includes(weapon.id)) modes.push({ ...makeMode(weapon, weapon, 'all-barrels', '모든 총열 동시 발사'), ammoPerShot: weapon.barrels, hitCondition: { kind: 'pellets', min: 1, max: weapon.pellets * weapon.barrels } });
    if (weapon.id === 'variable') modes.push(
      { ...makeMode(weapon, weapon, 'volley', '일곱 총열 일제 사격'), ammoPerShot: 7, hitCondition: { kind: 'pellets', min: 1, max: 7, projectileName: '탄환' } },
      { id: 'total', name: '잔탄 전체 발사', unsupported: '총에 남아 있는 탄약 수를 알 수 없어 한꺼번에 쐈을 때의 피해를 계산하지 않습니다.' },
    );
    // Shrapnel is part of this shot, never a selectable standalone mode.
    if (weapon.shrapnelCount > 0) {
      const fragment = weapon.variants.find(v => v.id === 'shrapnel');
      if (!fragment) throw new Error(`Missing shrapnel: ${weapon.id}`);
      const fragmentMode = makeMode(weapon, fragment);
      modes[0].hitCondition = { kind: 'shrapnel', min: 0, max: weapon.shrapnelCount, default: 0 };
      modes[0].bomblet = fragmentMode;
      modes[0].note = `기본 계산에서는 파편을 빼고 ${weapon.delivery === 'explosion' ? '폭발 피해만' : '직접 맞혔을 때의 피해와 폭발 피해만'} 반영합니다. 파편 피해도 넣으려면 같은 부위에 맞는 파편 수를 고르세요.`;
    }
    // Breacher's delayed explosion is linked, not another firing mode. Keep
    // only the known impact here; do not invent timing/attachment success.
    if (weapon.id === 'breacher') modes[0].note = '맞는 순간의 피해만 계산합니다. 붙은 뒤에 터지는 폭발과 계속 타는 피해는 빼며, 실제로 잘 붙는지는 반영하지 않습니다.';
    if (['pyrotech', 'melta-mine'].includes(weapon.id)) modes[0].note = '처음 터지는 폭발만 계산합니다. 남은 불길에 계속 닿아서 받는 피해는 더하지 않습니다.';
    for (const mode of modes) {
      if (mode.unsupported) continue;
      if (![mode.standard, mode.durable, mode.ap, mode.explosion, mode.explosionDurable, mode.explosionAp].every(finite)) mode.unsupported = '피해량이나 장갑을 뚫는 능력이 정확히 확인되지 않아 계산하지 않습니다.';
      else if (mode.standard + mode.durable + mode.explosion + mode.explosionDurable === 0) mode.unsupported = '직접 주는 피해가 없는 지원 장비입니다. 적을 기절시키는 등의 효과를 피해로 바꿔 계산하지 않습니다.';
    }
    if (modes.every(mode => mode.unsupported)) personalUnsupported[weapon.id] = modes[0].unsupported;
    else personalProfiles[weapon.id] = {
      source: weapon.source, checkedAt, sourceRevision: pages[weapon.en].revision,
      note: '같은 부위를 최대 피해로 계속 맞혔을 때의 횟수입니다. 거리와 맞는 각도에 따른 피해 변화, 도탄, 화상 같은 지속 피해와 기절 같은 효과는 빼고 계산합니다. 여러 부위에 동시에 들어가는 피해는 합치지 않습니다. 연사와 점사는 한 발씩 계산하며, 산탄과 전격은 같은 부위에 맞는 수를 골라야 합니다. 파편은 기본적으로 제외합니다.',
      modes,
    };
  }
  return { personalProfiles, personalUnsupported };
}
