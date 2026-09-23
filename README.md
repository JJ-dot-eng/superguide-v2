# HD2 필드 가이드

헬다이버즈 2의 스트라타젬 수치, 적 부위별 필요 탄수, 시설 철거 조건, 팩션별 추천 장비를 한국어로 찾아보는 비공식 팬 사이트입니다.

**[사이트 바로가기](https://jj-dot-eng.github.io/superguide/)**

## 네 가지 도구

- **스트라타젬** — 110종의 피해·관통·범위와 사용법. 종류·관통력으로 거르고, 수치 순으로 정렬하고, 최대 3개를 나란히 비교합니다.
- **적 대응** — 적을 고르면 지원 무기 전체를 필요 횟수 순으로 보여 줍니다. 무기를 누르면 부위별 탄수, 조준 위치 사진, 한 발 피해의 계산 과정이 열립니다.
- **철거** — 시설로 찾기(무엇으로 부술 수 있나)와 스트라타젬으로 찾기(무엇을 부술 수 있나) 두 방향으로 봅니다.
- **팩션 추천** — 세력별 주요 유닛에 대해 조준이 쉬운 순서로 고른 무기와 그 이유, 계산된 탄수를 보여 줍니다.

어디서든 `/` 또는 `Ctrl+K`로 전체 검색을 열 수 있습니다. 초성(`ㄱㄷㅈㅁ` → 궤도 정밀 타격)이나 글자 순서를 섞은 검색(`도밀타`)도 됩니다. 모든 화면 상태는 주소에 담기므로 링크로 공유할 수 있습니다.

## 구조

```
dist/                  배포되는 사이트 (빌드 과정 없음)
  index.html
  data/                수치·문구·이미지 목록 (Helldivers Wiki 기준 자료)
  core/                계산과 문구 로직 — 화면(DOM)과 무관, Node에서 테스트
    combat.js          부위별 탄수 계산 엔진
    demolition.js      철거력·체력 파괴 판정
    factions.js        팩션 추천의 계산 연결
    defense.js         보호막 회복 시간
    catalog.js search.js route.js explain.js
  ui/                  화면
    main.js            라우터·공통 패널·검색창
    views/             도구별 화면 (처음 열 때 불러옴)
    app.css
  assets/              위키 아이콘·부위 사진·초상화
scripts/
  check.mjs            전체 검사
  test-parity.mjs      이전 버전 계산 결과 약 3만 건과 완전히 같은지 확인
  test-units.mjs       자료 무결성, 이미지 해시, 검색, 주소, 배포 버전
  version-assets.mjs   배포 시 모듈 주소에 내용 해시(?v=) 부여
  fixtures/            이전 버전(master@9f076c9)이 낸 계산 결과 기록
```

## 실행과 검사

```bash
npm start       # http://127.0.0.1:4173
npm run check   # 모든 검사
```

외부 패키지는 쓰지 않습니다(Node 20 이상). `master`에 올리면 GitHub Actions가 검사 → 캐시 키 부여 → GitHub Pages 배포를 합니다.

## 자료 기준

수치·아이콘·부위 이미지는 [Helldivers Wiki](https://helldivers.wiki.gg/)에서 2026년 9월 16일 확인한 값이며, 게임 패치와 실시간으로 연동되지 않습니다. 표시 탄수는 최대 피해로 같은 부위를 계속 맞혔을 때의 이론값이고, 확인되지 않은 값은 0으로 채우지 않고 ‘미확인’ 또는 ‘계산 보류’로 표시합니다.

Arrowhead Game Studios, Sony Interactive Entertainment와 관계없는 팬 사이트입니다.
