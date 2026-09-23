// Faction loadout guide: editorial picks per sub-faction unit, each backed by
// the combat engine's count for the editor's aim point.
import { factionGuides, factionSides, factionCheckedAt } from '../../data/faction-data.js';
import { enemies, combatCheckedAt } from '../../data/combat-data.js';
import { pickerEnemyImages } from '../../data/selector-images.js';
import { wikiIcons } from '../../data/wiki-icons.js';
import { stratagemById } from '../../core/catalog.js';
import { recommend, findEnemy } from '../../core/factions.js';
import { num, unitOf, outcomeOf, countText, aimText, routeNotes, josa } from '../../core/explain.js';
import { html, render, $, $$, badge, external } from '../dom.js';

let root, ctx;
const state = { guide: factionGuides[0].id };

const weaponIcon = id => html`<img class="strat-icon" style="width:34px;height:34px" src="${wikiIcons[id]?.src}" alt="" loading="lazy">`;

function routeBlock(pick) {
  const { route, mode, approach } = pick;
  const unit = unitOf(mode).unit;
  if (approach) {
    return html`<div class="callout"><h3>${approach.title} · ${countText(route, mode)} → 제트팩 파괴로 처치</h3><p>${approach.tip}</p></div>
      <p class="note">${approach.condition}</p>
      <p class="faint" style="font-size:12.5px">제트팩 체력 ${num(route.target.hp)} · 장갑 ${num(route.target.armor)}. 관통·폭발 저항을 적용한 한 발의 폭발 피해 ${num(route.stages[0].damage.explosion)}${Number.isFinite(mode.innerRadius) ? ` (폭발 중심 ${num(mode.innerRadius)}m 안)` : ''}. ${external(approach.source, '위키 전술')}</p>`;
  }
  // A blast that only reaches the main body through an immune part is a single-judgement estimate.
  const redirected = route.via === 'main' && route.target.exdr === 100 && route.stages.every(stage => stage.damage.direct === 0 && stage.damage.explosion === 0);
  const outcome = outcomeOf(route);
  return html`<div><p class="how" style="font-weight:700">${redirected ? '본체 폭발 피해 · 단일 판정 가정' : route.target.name} — ${countText(route, mode)} ${outcome.label}</p>
    ${redirected ? html`<p>‘${route.target.name}’는 폭발 피해를 받지 않아, 폭발이 닿을 때마다 본체에 한 번 들어가는 피해만 반복한 값입니다. 이 부위를 노리는 게 가장 좋다는 뜻은 아닙니다.</p>` : aimText(route, mode).map(line => html`<p>${line}</p>`)}
    ${route.stages.length > 1 ? html`<p class="faint">${route.stages.map(stage => `${stage.part.name} ${num(stage.hits)}${unit}`).join(' → ')} (장갑 제거 포함)</p>` : ''}
    ${routeNotes(route, mode).length ? html`<ul class="notes" style="margin-top:6px">${routeNotes(route, mode).map(note => html`<li>${note}</li>`)}</ul>` : ''}</div>`;
}

function pickRow(unit, choice, index) {
  const pick = recommend(unit, choice);
  const weapon = stratagemById.get(pick.weaponId);
  if (pick.adviceOnly) {
    return html`<details class="pick"><summary><span class="rank-num">${index + 1}</span>${weaponIcon(weapon.id)}
      <span><b>${weapon.name}</b><small>${pick.pick.label}</small></span>
      <span class="pick-result">${badge('전술 안내', 'accent')}<small class="faint">횟수 미표시</small></span></summary>
      <div class="pick-body"><p class="how">${pick.pick.note}</p><p class="note">${pick.pick.limitation}</p>
        <p class="sources">${external(pick.pick.source, '적 특성·전술')}${external(weapon.source, '장비')}<span>확인 ${factionCheckedAt}</span></p></div></details>`;
  }
  const { route, mode, reference, tactic, enemy, alternatives, profile } = pick;
  const unitWord = unitOf(mode).unit;
  const outcome = route ? outcomeOf(route) : null;
  const shield = enemy.shield?.partial ? '조종사 보호막과 기체를 구분하세요. 아래 기체 부위는 보호막 밖 경로입니다.'
    : enemy.shield ? `${enemy.shield.kind === 'energy' ? '보호막을' : '방패를'} 제거·우회한 상태 기준입니다. 그 공격은 횟수에 넣지 않습니다.` : '';
  const advice = tactic || (reference ? { title: `${reference.target} 명중 시 ${num(reference.hits)}${unitWord} ${outcomeOf({ outcome: reference.outcome, target: {} }).label} (위키 전술)`, body: reference.note, source: reference.source } : null);
  return html`<details class="pick"><summary><span class="rank-num">${index + 1}</span>${weaponIcon(weapon.id)}
    <span><b>${weapon.name}</b><small>${profile.modes.length > 1 ? `${mode.name} · ` : ''}${pick.pick?.label || ''}</small></span>
    <span class="pick-result">${route ? html`<b>${num(route.hits)}<small style="display:inline;font-size:12px;color:var(--text-3)">${unitWord}${route.lowerBound ? '+' : ''}</small></b><small>${badge(outcome.label, outcome.tone)}</small>` : badge(mode.unsupported ? '계산 미지원' : '계산 보류', 'unknown')}</span></summary>
    <div class="pick-body">
      ${pick.pick?.note ? html`<p class="how">${pick.pick.note}</p>` : ''}
      ${shield ? html`<p class="note" style="color:var(--bleed)">${shield}</p>` : ''}
      ${advice ? html`<div class="callout info"><h3>${advice.title}</h3><p>${advice.body} ${external(advice.source, '출처')}</p></div>` : ''}
      ${route ? (advice ? html`<details class="disclosure"><summary>단일 부위 계산 보기</summary><div>${routeBlock(pick)}</div></details>` : routeBlock(pick)) : html`<p>${mode.unsupported || '확인된 처치 경로가 없어 계산을 보류했습니다.'}</p>`}
      ${!advice && alternatives.length ? html`<details class="disclosure"><summary>다른 조준 위치 ${alternatives.length}곳</summary><div>${alternatives.map(other => routeBlock({ ...pick, route: other, approach: null }))}</div></details>` : ''}
      <div class="links"><a class="button small" href="#/enemy/${enemy.id}?w=${weapon.id}&m=${mode.id}">적 대응에서 자세히 →</a></div>
      ${pick.approach ? html`<p class="faint" style="font-size:12.5px">적 대응 화면은 선택 부위에 직접 맞히는 기준이라, 위의 정면 폭발 계산(제트팩 직격 제외)과 다를 수 있습니다.</p>` : ''}
      <p class="sources">${external(profile.source, '무기 수치')}${external(enemy.source, '적 수치')}<span>확인 ${profile.checkedAt || combatCheckedAt}</span></p>
    </div></details>`;
}

function unitCard(unit) {
  const enemy = findEnemy(unit.enemy);
  const base = enemies.find(item => item.id === unit.base);
  const photo = pickerEnemyImages[enemy.id];
  return html`<article class="panel unit">
    <header class="unit-head">${photo?.src ? html`<img src="${photo.src}" alt="" loading="lazy">` : html`<span></span>`}
      <div><h3>${enemy.name}</h3>${base ? html`<span class="base">일반 ${josa(base.name, ['과', '와'])} 비교</span>` : ''}<p>${unit.change}</p>
      <p class="sources" style="margin-top:6px">${external(enemy.source, '유닛 자료')}${enemies.some(item => item.id === enemy.id) ? html`<a class="ext" href="#/enemy/${enemy.id}">모든 무기 비교</a>` : ''}</p></div>
    </header>
    <div>${unit.weapons.map((choice, index) => pickRow(unit, choice, index))}</div>
  </article>`;
}

function renderView() {
  const guide = factionGuides.find(item => item.id === state.guide);
  const side = factionSides.find(item => item.id === guide.side);
  render($('#faction-body', root), html`
    <div class="faction-sides" role="group" aria-label="진영">${factionSides.map(item => html`<button class="faction-side" type="button" data-side="${item.id}" aria-pressed="${item.id === side.id}"><img src="${item.icon}" alt="">${item.name}</button>`)}</div>
    <div class="chips" role="group" aria-label="세력">${factionGuides.filter(item => item.side === side.id).map(item => html`<button class="chip" type="button" data-guide="${item.id}" aria-pressed="${item.id === guide.id}">${item.name}</button>`)}</div>
    <section class="panel guide-intro" data-side="${side.id}"><span class="en">${guide.en}</span><h2>${guide.name}</h2><p>${guide.intro}</p>
      ${guide.coverage ? html`<p class="note">${guide.coverage}</p>` : ''}
      <p class="sources">${external(guide.source, '세력 구성 출처')}<span>확인 ${factionCheckedAt} · 주요 유닛 ${guide.units.length}종</span></p></section>
    <div class="units">${guide.units.map(unitCard)}</div>`);
}

export function mount(container, context) {
  root = container; ctx = context;
  render(root, html`<div class="page-head"><div><div class="eyebrow">Loadout Brief</div><h1>팩션 추천</h1><p>세력별 주요 유닛과, 조준이 쉽고 다루기 편한 순서로 고른 지원 무기입니다. 가장 적은 탄수 순위가 아닙니다.</p></div></div>
    <div id="faction-body"></div>
    <p class="faint" style="font-size:12.5px;margin-top:20px">조준 난도·폭발 활용·충전과 재장전 부담을 고려한 입문자용 추천입니다. 고난이도 기준이며 실시간 패치와 연동되지 않습니다.</p>`);
  root.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.side) ctx.go({ view: 'factions', id: factionGuides.find(item => item.side === target.dataset.side).id });
    else if (target.dataset.guide) ctx.go({ view: 'factions', id: target.dataset.guide });
  });
}

export function update(route) {
  state.guide = factionGuides.some(item => item.id === route.id) ? route.id : state.guide;
  renderView();
  $$('[aria-pressed="true"]', root)[0]?.blur();
}
