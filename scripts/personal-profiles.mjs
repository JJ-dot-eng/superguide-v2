// Offline projection only. Selection rules below are reviewed against wiki_pages;
// attack.level is a dependency depth, never proof of a selectable firing mode.
export function buildPersonalProfiles(weapons, data, pages, checkedAt) {
  const personalProfiles = {}, personalUnsupported = {};
  const finite = value => Number.isFinite(value) && value >= 0;
  const sprayReason = '분사 입자 명중 빈도와 접촉 시간이 미확인이라 발 단위로 환산하지 않습니다.';
  const specialReasons = {
    'double-edge-sickle': '열 단계별 탄체 연결과 전환 조건이 미확인입니다. 열 상태를 선택 가능한 탄종으로 취급하지 않습니다.',
    arc: '투척 후 전격의 반복 횟수와 부위별 명중 수가 미확인입니다.',
    'throwing-knife': '원본 damage 항목의 타격 단위와 투척 연결이 미확인입니다.',
    'stim-pistol': '치료 장비이며 공격 피해 레코드가 없습니다.',
    smoke: '연막 지원 장비이며 공격 피해 레코드가 없습니다.',
    smokescreen: '연막 지원 장비이며 공격 피해 레코드가 없습니다.',
    shield: '방어막 지원 장비이며 공격 목록이 없습니다.',
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
      magazine: weapon.category === 'throwable' ? null : magazine,
      ammoPerShot: 1,
    };
    if (stats.delivery === 'spray') return { id, name, unsupported: sprayReason };
    if (stats.pellets > 1) mode.hitCondition = { kind: 'pellets', min: 1, max: stats.pellets };
    if (stats.delivery === 'melee') mode.note = '일반 타격 1회입니다. 접근 가능 여부·방어구 보너스·상태이상은 계산하지 않습니다.';
    if (weapon.id === 'blitzer') {
      if (!/five arcs with damage of 50/.test(pages[weapon.en].wikitext)) throw new Error('Blitzer arc evidence changed');
      mode.hitCondition = { kind: 'arcs', min: 1, max: 5 };
    }
    return mode;
  };
  for (const weapon of weapons) {
    let reason = specialReasons[weapon.id];
    if (weapon.charge) reason = '충전 상태별 최종 직격·내구·폭발·관통 수치와 배율 적용 규칙이 모두 검증되지 않았습니다.';
    if (weapon.delivery === 'beam') reason = '빔 1회 노출 시간과 발 단위 유효 피해가 미확인입니다.';
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
      modes = [makeMode(weapon, weapon, 'unguided', '비유도 · 탄체 1발'),
        { id: 'guided', name: '유도 사격', unsupported: '유도 모드의 표적·착탄 부위 제한을 검증하지 않아 자유 조준 경로로 계산하지 않습니다.' }];
    }
    if (['bushwhacker', 'double-freedom'].includes(weapon.id)) modes.push({ ...makeMode(weapon, weapon, 'all-barrels', '모든 총열 동시 발사'), ammoPerShot: weapon.barrels, hitCondition: { kind: 'pellets', min: 1, max: weapon.pellets * weapon.barrels } });
    if (weapon.id === 'variable') modes.push(
      { ...makeMode(weapon, weapon, 'volley', '일곱 총열 일제 사격'), ammoPerShot: 7, hitCondition: { kind: 'pellets', min: 1, max: 7 } },
      { id: 'total', name: '잔탄 전체 발사', unsupported: '현재 잔탄 수를 알 수 없어 일제 발사당 소비 탄수와 명중 수를 고정하지 않습니다.' },
    );
    // Shrapnel is part of this shot, never a selectable standalone mode.
    if (weapon.shrapnelCount > 0) {
      const fragment = weapon.variants.find(v => v.id === 'shrapnel');
      if (!fragment) throw new Error(`Missing shrapnel: ${weapon.id}`);
      const fragmentMode = makeMode(weapon, fragment);
      modes[0].hitCondition = { kind: 'shrapnel', min: 0, max: weapon.shrapnelCount };
      modes[0].bomblet = fragmentMode;
      modes[0].note = '파편 명중 수를 명시해야 합니다. 0개는 주탄·폭발만 계산하며 파편 피해를 자동 합산하지 않습니다.';
    }
    // Breacher's delayed explosion is linked, not another firing mode. Keep
    // only the known impact here; do not invent timing/attachment success.
    if (weapon.id === 'breacher') modes[0].note = '직격·충돌 피해만 계산합니다. 지연 폭발·테르밋 지속 피해와 부착 성공 여부는 제외합니다.';
    if (['pyrotech', 'melta-mine'].includes(weapon.id)) modes[0].note = '확인된 주폭발만 계산합니다. 분사·화염벽의 지속 피해와 반복 횟수는 제외합니다.';
    for (const mode of modes) {
      if (mode.unsupported) continue;
      if (![mode.standard, mode.durable, mode.ap, mode.explosion, mode.explosionDurable, mode.explosionAp].every(finite)) mode.unsupported = '공격의 직격·내구·폭발·관통 수치 일부가 미확인입니다.';
      else if (mode.standard + mode.durable + mode.explosion + mode.explosionDurable === 0) mode.unsupported = '확인된 직접 피해가 0인 지원 장비입니다. 상태이상을 처치 피해로 환산하지 않습니다.';
    }
    if (modes.every(mode => mode.unsupported)) personalUnsupported[weapon.id] = modes[0].unsupported;
    else personalProfiles[weapon.id] = {
      source: weapon.source, checkedAt, sourceRevision: pages[weapon.en].revision,
      note: '동일 부위 최대 피해 기준입니다. AP는 원본 ap1이며 각도·거리 감쇠·도탄·지속 피해·상태이상·다른 부위 동시 명중은 제외합니다. 연사/점사는 탄체 1발 단위입니다. 산탄·전격·파편은 명중 수 가정이 필요합니다.',
      modes,
    };
  }
  return { personalProfiles, personalUnsupported };
}
