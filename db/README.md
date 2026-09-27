# Helldivers 2 무기 사양 DB

주무기 55종·보조무기 25종·투척물 23종, 총 103종의 독립 ES 모듈입니다.
`weapons.js`는 `scripts/build-weapons.mjs`가 로컬 JSON만 읽어 생성합니다.
`weapons`와 `weaponsSource`를 export하며, 배포용 `dist/`에는 연결하지 않았습니다.

## 출처와 재생성

- `source/weapons_data.json`: [위키 공격 모듈](https://helldivers.wiki.gg/wiki/Module:Decodedata-Attacks/weapons_data.json), revision **136739**, 수정 시각 **2026-09-25T22:34:05Z**, 수집일 **2026-09-27**.
- `source/wiki_categories.json`: [위키 무기 분류](https://helldivers.wiki.gg/wiki/Category:Weapons), 수집일 **2026-09-27**. 분류 전체의 단일 revision은 없으며 각 멤버의 revision을 `sourceRevision`으로 보존합니다.
- 로스터는 Primary Weapons / Secondary Weapons / Throwables만 사용합니다. 하위 분류의 다른 무기를 추가하지 않습니다.

출처를 새로 수집할 때의 순서(첫 명령은 네트워크 사용이 허용된 환경에서만 실행):

```sh
node scripts/fetch-weapons-source.mjs db/source
node scripts/build-weapons.mjs
```

현재 스냅샷을 사용하는 오프라인 재생성·검증:

```sh
node scripts/build-weapons.mjs
node scripts/check-weapons.mjs
npm run check
```

생성기에는 네트워크 호출이나 현재 시각 의존성이 없습니다. 검증기는 로스터·출처 연결·숫자 범위·변형 누락을 확인하고, 생성기를 두 번 `--stdout`으로 실행해 기존 파일과 바이트 단위로 비교합니다. 검증은 `weapons.js`를 다시 쓰지 않으며, 원본이 바뀌었는데 재생성하지 않았으면 실패합니다.

## 필드와 해석

- `id`: 영문 제목에서 제식 번호를 뺀 kebab-case. 충돌 시 번호를 붙입니다. `code`는 위키 제목의 번호, `en`은 제목 그대로, `name`은 한국어 이름의 출처가 없어 항상 `null`입니다. `category`는 primary/secondary/throwable, `type`은 제공된 하위 분류의 kebab-case 또는 `null`입니다.
- `source`/`sourceRevision`은 무기 위키 페이지, `dataKey`는 데이터마이닝 무기 키입니다. 대문자화 후 영숫자 외 문자를 제거해 연결합니다.
- 기본 수치는 첫 level 1 공격(없으면 첫 공격)을 사용합니다. `direct`/`durable`은 연결된 damage의 `dmg`/`dmg2`이며 펠릿당 값입니다. `pellets`를 곱하거나 여러 총열의 명중을 합산하지 않습니다.
- `ap`는 직격 damage의 **ap1**입니다. 단일 관통 필드를 쓰는 기존 catalog와 연결하기 위한 대표 원본값이며, ap2~ap4의 각도 조건은 이 스냅샷에 설명이 없어 추정하지 않습니다. 값이 다르면 `apAll`에 `[ap1, ap2, ap3, ap4]`를 보존합니다. 모두 같거나 레코드가 없으면 `null`입니다.
- `splash`/`splashDurable`/`splashAp`는 `explode_on_impact_id → explosion.damage_id → damage`의 dmg/dmg2/ap1입니다. `splashApAll`도 같은 규칙입니다. 폭발 자체가 공격이면 직격 필드는 `null`, 폭발 필드만 채웁니다. `innerRadius`=r1, `radius`=r2이며 단위는 m입니다. r3를 피해 반경으로 대체하지 않습니다.
- `shrapnelCount`는 폭발이 흩뿌리는 파편 수(explosion의 shrapnel_count)입니다. 파편 1개의 피해는 id가 `shrapnel`인 variant에 있으며, 원본 탄체 키(예: AC-8_P2)는 이름 괄호에 남깁니다. 실제로 맞는 파편 수는 거리·각도에 따라 달라 합산하지 않습니다.
- `demolition`/`stun`/`push`는 직격 레코드의 demo/stun/push, 폭발만 있으면 그 폭발 레코드의 값입니다. `element`는 element_name(`none`은 null), `statuses`는 해당 damage의 원본 배열입니다. `splashElement`/`splashStatuses`는 폭발 효과를 별도로 보존합니다. 공격 목록의 status 연결과 지속 피해는 자동 합산하지 않습니다.
- `delivery`는 원본 공격 type입니다. Melee 분류의 damage 직접 참조만 melee로 표현합니다. `unit`과 `damageKind`를 함께 읽으세요. beam_fire_rate=60인 연속 빔(Scythe/Dagger)은 초당 값(`dps`)으로 해석합니다. Trident는 펄스 빔 원본값을 보존하고 시간 단위를 확정하지 않아 damageKind=null입니다. 분사는 입자 1개, 전격은 1회, 근접은 타격 1회입니다. 빔 노출 시간·입자 빈도·연쇄 대상은 계산하지 않습니다.
- `magazine`=cap(약실 capplus 미합산), `spareMags`=mags를 **원본 예비 탄창 보유 한도**로 해석합니다. 시작량 magstart와 다르며 장전 탄창을 더하거나 빼지 않습니다. heat 방식에서는 교체 방열판 수의 원본 값입니다. 낱발 rounds는 `spareRounds`, 원본 탄약 방식은 `roundType`으로 보존합니다.
- `rpm`, `ergonomics`, `fireModes`는 원본 rpm/ergonomics/fire_modes입니다. fireModes의 `none`도 원본 센티널로 보존합니다. `beamFireRate`/`beams`/`barrels`는 원본 동명 수치이며 rpm이나 pellets로 치환하지 않습니다. `throwableCapacity`/`throwableStart`는 max/start입니다. `fuse`는 신관 시간이 없으면 null이며 projectile lifetime/explosion_delay로 대체하지 않습니다.
- `attacks`는 type/name/parent/level 전체를 원문 보존합니다. `variants`는 복수 공격·부품·충전 단계마다 전체 피해 필드를 갖습니다. 충돌 폭발은 해당 탄체의 splash에 포함하고 중복 변형으로 만들지 않습니다. 별도 폭발·파편·전격은 별도 변형입니다. level은 연결 깊이이며 모든 변형이 전환 가능한 사격 모드라는 뜻은 아닙니다. 하부 부착 무기는 변형으로 전개하고 `linkedAttacks`에 원본 공격 목록을 남깁니다.
- `charge`에는 원본 단계·배율을 보존합니다. 충전 변형은 연결 가능한 탄체의 **원본** 피해만 제공하고, DEFAULT 참조는 null입니다. 배율을 어느 피해에 언제 적용하는지, 이미 반영됐는지 확인할 근거가 없어 곱하지 않습니다. `chargeTime`은 원본 charge_time입니다. 이 변형을 최종 유효 충전 피해로 간주하지 마세요.

## 알려진 공백

미제공 수치는 모두 `null`이며 실제 원본 0만 0으로 보존합니다. 폭발 연결 부재의 null은 확인된 피해 0과 다릅니다. 빈 배열은 제공된 항목이 없다는 뜻입니다. 모든 무기의 한국어 이름·신관 시간은 미확인입니다.

- CQC-73 Entrenchment Tool은 원본 **CQC-72 ENTRENCHMENT TOOL**로 명시적으로 연결하며 불일치를 notes에 기록합니다.
- G/SH-39 Shield는 공격 목록이 비어 있습니다. P-11 Stim Pistol, G-3 Smoke, G-89 Smokescreen은 damage_id가 비어 있어 피해를 알 수 없습니다. 연막 반경은 원본에서 보존합니다.
- 하위 분류 없음: CB-9 Exploding Crossbow, FLAM-66 Torcher, GL-15 Evictor, JAR-5 Dominator, R-36 Eruptor, VG-70 Variable. Melee 분류의 7개 중 로스터에 속하는 것은 6개입니다.
- PLAS-101 Purifier, PLAS-15 Loyalist, PLAS-39 Accelerator Rifle의 충전 배율 적용 규칙은 미확인입니다. 특히 PLAS-39의 DEFAULT는 탄체 테이블 키가 아닙니다.
- G/40-K Melta Mine의 FLAMEWALL, K-2 Throwing Knife의 damage 직접 참조는 시간 단위를 확정하지 않습니다. 상태 지속시간·파편 명중 수·총 피해·거리 감쇠 등도 추정하지 않습니다.

필드 이름은 기존 support/catalog와 맞췄지만 전투 계산기에 바로 투입할 어댑터는 아닙니다. combat-data의 `standard`/`explosion`/`explosionDurable`로 변환하고 단위·복수 공격 조건을 정한 뒤 연결해야 합니다. 현재 DB의 null을 피해 0으로 취급하면 안 됩니다.
