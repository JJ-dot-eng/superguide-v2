# Helldivers 2 무기 사양 DB

주무기 55종·보조무기 25종·투척물 23종, 총 103종의 독립 ES 모듈입니다.
`weapons.js`는 `scripts/build-weapons.mjs`가 로컬 JSON만 읽어 생성합니다.
`weapons`와 `weaponsSource`를 export하며, 배포용 `dist/`에는 연결하지 않았습니다.

## 출처와 재생성

- `source/weapons_data.json`: [위키 공격 모듈](https://helldivers.wiki.gg/wiki/Module:Decodedata-Attacks/weapons_data.json), revision **136739**, 수정 시각 **2026-09-25T22:34:05Z**, 수집일 **2026-09-27**.
- `source/wiki_categories.json`: [위키 무기 분류](https://helldivers.wiki.gg/wiki/Category:Weapons), 수집일 **2026-09-27**. 분류 전체의 단일 revision은 없으며 각 멤버의 revision을 `sourceRevision`으로 보존합니다.
- `source/wiki_pages.json`: 같은 로스터 103종의 MediaWiki 원문 스냅샷. `pages[영문 제목]`에 `source`, `revision`, `revisionTimestamp`, `retrievedAt`, `wikitext`를 보존합니다. 수집기는 지정 User-Agent로 Node fetch를 사용하고, 요청 사이 250ms를 기다리며 최대 50개 제목씩 순차 조회합니다. 실패하면 기존 원문을 보존하고 `attemptedAt`/`error`를 기록합니다. 이전 원문도 없으면 원문·리비전·수집일은 null입니다. 수집 실패를 성공으로 간주하지 않으며 명령은 종료 코드 1을 반환합니다.
- `source/korean_names.json`: [나무위키 무기 문서](https://namu.wiki/w/HELLDIVERS%202/%EB%AC%B4%EA%B8%B0)와 주 무기·보조·투척 하위 문서의 압축된 제목 증거입니다. 각 페이지에는 `source`, `status`, `modifiedAt`, `retrievedAt`, `headings`만 저장합니다. HTML이나 중복 이름 사전은 저장하지 않습니다. `fetch-weapons-source.mjs`의 `extractHeadings`/`compactKoreanPage`를 미래 수집과 기존 HTML의 일회성 로컬 변환에 동일하게 사용했습니다. HTML 태그 제거·엔티티 해독·숫자 절 번호와 `[편집]` 접미사 제거 후 h2–h6 절 제목을 순서대로 보존합니다. 수정 시각이 미제공이면 null입니다.
- 한국어 이름은 빌드 시 제목 증거에서 제식 번호를 대소문자·공백 무시로 연결합니다. 번호 직후 공백이 없는 한글도 지원하며 이름의 영문·숫자·문장부호를 허용합니다. 이름 끝의 숫자 각주 표지만 제거하고 원래 제목은 `nameSource.evidence`에 보존합니다. 로스터 번호 중복·제목 중복은 동일한 이름이어도 거부하고, 모든 미연결 로스터와 미사용 제목(분류 제목 포함)을 검증 stdout에 보고합니다. CQC-72/73 같은 다른 번호를 한국어 이름 매칭에서 별칭 처리하지 않습니다.
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

- `id`: 영문 제목에서 제식 번호를 뺀 kebab-case. 충돌 시 번호를 붙입니다. `code`는 위키 제목의 번호, `en`은 제목 그대로입니다. `name`은 출처로 확인된 한국어 이름 또는 `null`이며, 비어 있지 않은 이름에는 `nameSource`가 필요합니다. `category`는 primary/secondary/throwable입니다. `type`은 인포박스 `weapon_type`의 kebab-case를 우선하며, 없을 때만 하위 분류를 사용합니다(예: Explosives → explosives). 분류와 다르면 notes에 양쪽 값을 기록합니다. `Weapon`, `Infobox_Weapon`, `Infobox Weapon`, `Infobox Throwable` 템플릿과 필드 주변 공백을 처리합니다.
- `fieldSources`는 type/fuse/reload/reloadTactical의 파일·항목·원문 필드를 가리킵니다. 인포박스 출처에는 페이지 리비전·URL·수집일도 포함됩니다. 기존 `sourceRevision`은 분류 수집 시의 리비전이며, 인포박스 리비전과 구분합니다.
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
- `fuse`: 투척물 인포박스 `fuse`의 명시된 초 단위 숫자입니다. Impact 같은 비시간식 값, 범위·복수 값, 누락은 null이며 원문을 notes에 남깁니다. 숫자 0이 명시되면 그대로 보존합니다.
- `reload`: 명시된 초 단위 `reload_time`을 우선하고, 해석 가능한 값이 없으면 `rounds_reload_full_time`(낱발식 전체 장전), 다음으로 `tac_reload_time`을 사용합니다. 대체 출처는 notes/fieldSources에 명시합니다. `reloadTactical`은 `tac_reload_time`만 사용하며 낱발 첫 삽입 시간으로 대체하지 않습니다. 현재 원문의 복합 무기는 주 총열 표기인 8mm(One-Two)/12mm(Stoker) 값을 대표값으로 사용합니다. Eruptor의 `2.75s`는 전술 장전이며 `1.4s (Just Rechambering)`은 별개입니다.
- `reloadDetails`: 모든 비어 있지 않은 reload 관련 필드의 원문과 구성별 초·라벨을 보존합니다. One-Two의 40mm 2.5초, Stoker의 화염방사기 2.3초, 낱발 최초/후속 삽입 시간도 버리지 않습니다. 범위 끝점·단위 없는 수치·알 수 없는 템플릿은 추정하지 않습니다. GL-15의 `reload_time=2.67`에는 단위가 없어 원문으로 보존하고, 초가 명시된 `rounds_reload_full_time=2.75s`를 reload에 사용합니다. 필드가 없거나 해석 불가한 null은 notes에 이유를 기록합니다.
- `wiki-uncharged`/`wiki-charged` variants는 인포박스 `damage`에 비충전/충전 상태와 bolt/direct 또는 explosion/explosive 성분이 명시된 수치를 각각 `direct`/`splash`로 기록합니다. 출처 필드·원문 증거를 함께 저장하며 내구 피해·관통력 등 미제공 수치는 null입니다. 기존 `charge-stage-*`, `charge`, 원본 공격 변형은 그대로 보존합니다. 해석할 수 없는 표기는 한국어 notes에 공백으로 보고하며 배율 계산으로 보충하지 않습니다.

## 알려진 공백

미제공 수치는 모두 `null`이며 실제 원본 0만 0으로 보존합니다. 폭발 연결 부재의 null은 확인된 피해 0과 다릅니다. 빈 배열은 제공된 항목이 없다는 뜻입니다.

**2026-09-27 실제 로컬 원문 검증:** 103/103 페이지 원문과 HTTP 200인 나무위키 4개 문서를 오프라인으로 처리했습니다. type 103/103, 단일 신관 12/23, 한국어 이름 101/103, reload 73/103, reloadTactical 41/103입니다. 원문의 본문 증거·누락 여부를 재검토할 수 있도록 wiki_pages.json 전체 원문은 유지했습니다. 공격 데이터와 분류 스냅샷은 변경하지 않았습니다. 합성 회귀 예제는 DB 데이터로 사용하지 않습니다.

- 신관 null 11종: G-13/G-16/G-48/G-50/G-60/G-8/G-89는 `Impact`, G/40-K/TM-1은 `Proximity`, K-2는 `N/A`, TED-63은 선택 가능한 `5s / 15s / 60s`라 단일 값을 선택하지 않습니다. G/SH-39는 실제 인포박스가 `0s`이므로 0을 보존합니다.
- 이름 미연결: AR-32 Pacifier는 해당 제목이 없으며, CQC-73 Entrenchment Tool은 나무위키 제목이 `CQC-72 참호 도구`여서 번호가 다릅니다. 검증 stdout에는 이 무기 제목 외에 로스터에 대응하지 않는 모든 일반 절 제목도 출력합니다.
- reload null 30종은 투척물 23종, 근접 6종(CQC-2/5/19/30/42/73), ARC-12 Blitzer입니다. 해당 인포박스에 재장전 시간 필드가 없습니다. 전술 장전 값이 없는 무기는 reload에서 역산하지 않습니다.
- Purifier는 비충전 direct/splash=100/75, 충전=200/300입니다. Accelerator Rifle은 `Ballistic|250`, `Explosion|100` 단일 표기만 있고, Loyalist는 `Ballistic|75-150`, `Explosion|75-225` 범위만 있습니다. 둘 다 비충전/충전별 수치를 명시하지 않으므로 해당 wiki 변형은 생성하지 않고 원문을 notes에 남깁니다. 검증기는 이 기록된 부재를 허용하되, Purifier의 실제 4개 값은 별도로 회귀 검증합니다.

- CQC-73 Entrenchment Tool은 원본 **CQC-72 ENTRENCHMENT TOOL**로 명시적으로 연결하며 불일치를 notes에 기록합니다.
- G/SH-39 Shield는 공격 목록이 비어 있습니다. P-11 Stim Pistol, G-3 Smoke, G-89 Smokescreen은 damage_id가 비어 있어 피해를 알 수 없습니다. 연막 반경은 원본에서 보존합니다.
- 하위 분류가 없던 6종도 인포박스로 채웁니다: CB-9/GL-15/R-36은 `explosives`, JAR-5/VG-70/FLAM-66은 `special`입니다. Torcher의 실제 원문은 `weapon_type=Special`이며 하드코딩하지 않습니다. Melee 분류의 7개 중 로스터에 속하는 것은 6개입니다.
- PLAS-101 Purifier, PLAS-15 Loyalist, PLAS-39 Accelerator Rifle의 충전 배율 적용 규칙은 미확인입니다. 특히 PLAS-39의 DEFAULT는 탄체 테이블 키가 아닙니다.
- G/40-K Melta Mine의 FLAMEWALL, K-2 Throwing Knife의 damage 직접 참조는 시간 단위를 확정하지 않습니다. 상태 지속시간·파편 명중 수·총 피해·거리 감쇠 등도 추정하지 않습니다.

필드 이름은 기존 support/catalog와 맞췄지만 전투 계산기에 바로 투입할 어댑터는 아닙니다. combat-data의 `standard`/`explosion`/`explosionDurable`로 변환하고 단위·복수 공격 조건을 정한 뒤 연결해야 합니다. 현재 DB의 null을 피해 0으로 취급하면 안 됩니다.
