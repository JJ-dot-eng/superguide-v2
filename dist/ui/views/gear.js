// Gear: browse primaries, secondaries and throwables with their numbers, and
// check a loadout against a faction's key enemies.
//   #/gear[/<weapon>]?cat=<group>&type=<type>&q=<text>&sort=<key>
//   #/gear?tab=loadout&p=<primary>&s=<secondary>&g=<throwable>&st=<a,b,c,d>&f=<faction>
import { personalWeapons, personalWeaponsCheckedAt } from '../../data/personal-weapons.js';
import { weaponImages } from '../../data/weapon-images.js';
import { apBandOf } from '../../core/catalog.js';
import { search } from '../../core/search.js';
import { num } from '../../core/explain.js';
import { html, raw, render, $, $$, icon, badge, external } from '../dom.js';
import { blastFigure } from '../blast.js';
import { GROUPS, groupOf, typeName, weaponById, displayName } from '../gear-shared.js';

const ELEMENTS = { fire: '화상', gas: '가스', arc: '전기', electric: '전기' };
const SORTS = [
  { id: '', name: '기본 순서' },
  { id: 'damage', name: '피해 순', value: w => w.direct != null ? w.direct * (w.pellets || 1) : w.splash },
  { id: 'ap', name: '관통력 순', value: w => w.ap ?? w.splashAp },
  { id: 'magazine', name: '탄창 순', value: w => w.magazine ?? w.throwableCapacity },
  { id: 'rpm', name: '연사 순', value: w => w.rpm },
];

let root, ctx;
const state = { tab: 'browse', cat: 'primary', type: '', q: '', sort: '', detail: null, pushedDetail: false };

// --- Pieces ------------------------------------------------------------------------
export function weaponArt(w, cls = 'gear-art') {
  const image = weaponImages[w.id];
  return html`<span class="${cls}" data-group="${w.category}">${image ? html`<img src="${image.src}" alt="" width="${image.width}" height="${image.height}" loading="lazy" decoding="async">` : html`<span class="faint">${w.code || ''}</span>`}</span>`;
}

const dim = text => ({ text, dim: true });
const value = (number, unit = '') => number == null ? dim('미확인') : { text: num(number), unit };
const apOf = w => w.ap ?? w.splashAp;
const apText = w => {
  const ap = apOf(w);
  if (ap == null) return null;
  return w.ap != null && w.splashAp != null && w.splashAp !== w.ap ? `AP ${w.ap}/${w.splashAp}` : `AP ${ap}`;
};
// How a throwable goes off: timer, impact, proximity or a choice of timers.
export const fuseText = w => w.fuseType === 'impact' ? '충격식' : w.fuseType === 'proximity' ? '근접 감지' : w.fuseType === 'selectable' && w.fuseOptions?.length ? `${w.fuseOptions.map(num).join('/')}초 선택` : w.fuse != null ? `${num(w.fuse)}초` : null;
const isUtility = w => w.direct == null && w.splash == null && w.dot?.perSecond == null;

// Four headline numbers, chosen for what matters on that kind of item.
export function gearStats(w) {
  const damage = w.direct != null && w.damageKind === 'dps'
    ? { label: '지속 피해', text: num(w.direct), unit: '/s', caption: '광선 초당' }
    : w.direct != null
    ? { label: '피해', text: w.pellets > 1 ? `${num(w.direct)}×${w.pellets}` : num(w.direct), caption: w.pellets > 1 ? `펠릿 ${w.pellets}개` : w.splash ? `+ 폭발 ${num(w.splash)}` : '한 발' }
    : w.splash != null ? { label: '폭발', text: num(w.splash), caption: w.shrapnelCount ? `+ 파편 ${w.shrapnelCount}개` : '중심부 최대' }
    : w.dot?.perSecond != null ? { label: '지속 피해', text: num(w.dot.perSecond), unit: '/s', caption: ELEMENTS[w.dot.element] || '' }
    : { label: '피해', ...dim(isUtility(w) ? '없음' : '미확인'), caption: isUtility(w) ? '지원용' : '' };
  const ap = apText(w);
  const pen = { label: '관통', ...(ap ? { text: ap } : dim(isUtility(w) ? '—' : '미확인')), caption: ap ? apBandOf({ ap: apOf(w) })?.name : '' };
  if (w.category === 'throwable') {
    return [damage, pen,
      w.radius != null ? { label: '반경', text: num(w.radius), unit: 'm', caption: w.innerRadius != null ? `중심 ${num(w.innerRadius)}m` : '' } : { label: '반경', ...dim('—') },
      { label: '소지', ...value(w.throwableCapacity, '개'), caption: fuseText(w) ? `신관 ${fuseText(w)}` : '' }];
  }
  const ammo = w.heatCapacity?.seconds != null ? { label: '과열까지', text: num(w.heatCapacity.seconds), unit: '초', caption: w.heatCapacity.shots ? `약 ${w.heatCapacity.shots}발` : '무한 탄약' }
    : w.swingsPerMinute != null ? { label: '휘두르기', text: num(w.swingsPerMinute), unit: '/분', caption: '근접' }
    : { label: '탄창', ...value(w.magazine), caption: w.spareMags != null ? `예비 ${w.spareMags}개` : w.spareRounds != null ? `예비탄 ${w.spareRounds}` : '' };
  const rate = w.rpmModes?.length > 1 ? { label: '연사', text: w.rpmModes.map(num).join('/'), caption: '분당 · 모드별' }
    : w.rpm != null ? { label: '연사', text: num(w.rpm), caption: '분당 발수' }
    : w.reload != null ? { label: '재장전', text: num(w.reload), unit: '초' } : { label: '연사', ...dim('—') };
  return [damage, pen, ammo, rate];
}

const statRow = w => html`<dl class="stat-row">${gearStats(w).map(stat => html`<div><dt>${stat.label}</dt><dd class="${stat.dim ? 'dim' : ''}">${stat.text}${stat.unit ? html`<small>${stat.unit}</small>` : ''}</dd></div>`)}</dl>`;

export function traits(w) {
  const list = [];
  if (w.dot?.element) list.push(badge(ELEMENTS[w.dot.element] || w.dot.element, 'bleed'));
  if (w.category !== 'throwable' && w.splash > 0) list.push(badge('폭발'));
  if (w.heatCapacity?.raw) list.push(badge('과열식'));
  if (w.pellets > 1) list.push(badge('산탄'));
  if (w.variants?.length > 1) list.push(badge(`모드 ${w.variants.length}`));
  return list;
}

function card(w) {
  return html`<article class="card gear-card" style="--cat:${groupOf(w.category).color}" data-id="${w.id}">
    <button class="card-open" type="button" data-open="${w.id}" aria-label="${displayName(w)} 자세히 보기">
      ${weaponArt(w)}
      <div class="gear-title"><h3>${displayName(w)}</h3><p class="en">${w.en}</p></div>
      <div class="chips gear-traits">${badge(typeName(w.type), 'outline')}${traits(w)}</div>
      ${statRow(w)}
    </button>
  </article>`;
}

// --- Browse ------------------------------------------------------------------------
const typesOf = cat => [...new Set(personalWeapons.filter(w => w.category === cat).map(w => w.type))];
const fields = w => ({ names: [w.name, w.en, w.code].filter(Boolean), text: [typeName(w.type), groupOf(w.category).name] });

function visibleItems() {
  // A search looks across every group, so "세열" finds the grenade from the rifle list.
  let items = state.q ? personalWeapons : personalWeapons.filter(w => w.category === state.cat && (!state.type || w.type === state.type));
  items = search(items, state.q, fields);
  const sort = SORTS.find(item => item.id === state.sort);
  if (sort?.value) items = [...items].sort((a, b) => (sort.value(b) ?? -1) - (sort.value(a) ?? -1));
  return items;
}

function syncUrl() {
  const query = state.tab === 'loadout' ? { tab: 'loadout', ...loadoutQuery() } : { cat: state.cat === 'primary' ? '' : state.cat, type: state.type, q: state.q, sort: state.sort };
  ctx.replace({ view: 'gear', id: state.detail, query });
}

function renderBrowse() {
  const items = visibleItems();
  for (const button of $$('[data-cat]', root)) button.setAttribute('aria-pressed', String(!state.q && button.dataset.cat === state.cat));
  const types = typesOf(state.cat);
  render($('#gear-types', root), types.length > 1 ? html`<button class="chip" type="button" data-type="" aria-pressed="${!state.type}">전체</button>${types.map(type => html`<button class="chip" type="button" data-type="${type}" aria-pressed="${state.type === type}">${typeName(type)} <span class="count">${personalWeapons.filter(w => w.category === state.cat && w.type === type).length}</span></button>`)}` : '');
  $('#gear-types', root).hidden = Boolean(state.q) || types.length < 2;
  $('#gear-count', root).innerHTML = html`<span><b>${items.length}</b>개 표시${state.q ? ' · 모든 분류에서 검색' : ` · ${groupOf(state.cat).name} ${personalWeapons.filter(w => w.category === state.cat).length}개`}</span>`.toString();
  render($('#gear-grid', root), items.length ? items.map(card) : html`<div class="empty" style="grid-column:1/-1"><h3>맞는 장비가 없습니다</h3><p>검색어를 줄이거나 분류를 바꿔 보세요.</p></div>`);
}

// --- Detail sheet ------------------------------------------------------------------
function detailRows(w) {
  const rows = [];
  const add = (label, text, unit = '', caption = '') => text != null && rows.push({ label, text, unit, caption, dim: /[가-힣]/.test(String(text)) });
  if (w.direct != null && w.damageKind === 'dps') add('광선 피해', num(w.direct), '/초', '비추고 있는 동안');
  else if (w.direct != null) add(w.pellets > 1 ? '펠릿당 피해' : '직격 피해', num(w.direct), '', w.pellets > 1 ? `${w.pellets}발 모두 맞으면 ${num(w.direct * w.pellets)}` : '장갑에 막히지 않을 때');
  if (w.durable != null) add('내구 피해', num(w.durable), '', '단단한 부위에 들어가는 피해');
  if (apOf(w) != null) add('관통력', apText(w), '', apBandOf({ ap: apOf(w) })?.name);
  if (w.splash != null) add('폭발 피해', num(w.splash), '', w.splashAp != null ? `폭발 AP ${w.splashAp}` : '');
  if (w.shrapnelCount) add('파편', num(w.shrapnelCount), '개', '폭발 1회당 · 다 맞지는 않음');
  if (w.dot?.perSecond != null) add(`${ELEMENTS[w.dot.element] || '지속'} 피해`, num(w.dot.perSecond), '/초', w.dot.duration != null ? `${num(w.dot.duration)}초 동안` : '불이 붙어 있는 동안');
  if (w.magazine != null) add('탄창', num(w.magazine), '발');
  if (w.spareMags != null) add('예비 탄창', num(w.spareMags), '개', '최대 보유');
  if (w.spareRounds != null) add('예비탄', num(w.spareRounds), '발', '한 발씩 장전');
  if (w.heatCapacity?.raw) add('과열까지', w.heatCapacity.seconds != null ? num(w.heatCapacity.seconds) : w.heatCapacity.raw, w.heatCapacity.seconds != null ? '초' : '', w.heatCapacity.shots ? `약 ${w.heatCapacity.shots}발 · 방열판 교체로 재장전` : '방열판 교체로 재장전');
  if (w.rpmModes?.length > 1) add('연사 모드', w.rpmModes.map(num).join(' / '), '', '분당 발수');
  else if (w.rpm != null) add('연사', num(w.rpm), '', '분당 발수');
  if (w.swingsPerMinute != null) add('휘두르기', num(w.swingsPerMinute), '/분');
  if (w.reload != null) add('재장전', num(w.reload), '초', w.reloadTactical != null ? `탄이 남았을 때 ${num(w.reloadTactical)}초` : '탄창을 비웠을 때');
  if (w.throwableCapacity != null) add('소지 수', num(w.throwableCapacity), '개', w.throwableStart != null ? `출격 시 ${w.throwableStart}개` : '');
  if (w.fuse != null) add('신관', num(w.fuse), '초', '던진 뒤 폭발까지');
  else if (fuseText(w)) add('신관', fuseText(w), '', { impact: '닿는 순간 폭발', proximity: '적이 가까이 오면 폭발', selectable: '던지기 전에 시간 선택' }[w.fuseType] || '');
  if (w.radius != null) add('폭발 반경', num(w.radius), 'm', w.innerRadius != null ? `중심 ${num(w.innerRadius)}m까지 최대 피해` : '외곽');
  return rows;
}

// Player-facing names for data-mined attack components.
const variantLabel = v => v.displayName || (v.id === 'shrapnel' ? '파편 (1개당)' : /^explosion-/.test(v.id) ? '폭발' : /^projectile-/.test(v.id) ? '탄체' : /^charge-stage-/.test(v.id) ? v.name.split(' · ')[0] : v.name);

function variantTable(w) {
  const variants = w.variants || [];
  if (variants.length < 2) return '';
  return html`<section class="block gear-block"><h3>모드·구성 요소별 수치</h3>
    <div class="compare-scroll" role="region" aria-label="모드별 수치" tabindex="0"><table class="compare-table gear-modes">
      <thead><tr><th scope="col">구분</th><th scope="col">직격</th><th scope="col">관통</th><th scope="col">폭발</th><th scope="col">반경</th></tr></thead>
      <tbody>${variants.map(v => html`<tr><th scope="row">${variantLabel(v)}</th>
        <td>${v.direct != null ? html`${num(v.direct)}${v.pellets > 1 ? html`<small>×${v.pellets}</small>` : ''}` : html`<span class="faint">—</span>`}</td>
        <td>${v.ap != null ? `AP ${v.ap}` : v.splashAp != null ? `AP ${v.splashAp}` : html`<span class="faint">—</span>`}</td>
        <td>${v.splash != null ? num(v.splash) : html`<span class="faint">—</span>`}</td>
        <td>${v.radius != null ? `${num(v.radius)}m` : html`<span class="faint">—</span>`}</td></tr>`)}</tbody>
    </table></div></section>`;
}

function detailContent(w) {
  const group = groupOf(w.category);
  const conflicts = w.infoboxConflicts || [];
  const image = weaponImages[w.id];
  return html`<div class="sheet-top"><span>${group.name} · 상세</span><button class="icon-button" type="button" data-close aria-label="닫기">${icon('close', 18)}</button></div>
  <div class="sheet-content">
    ${weaponArt(w, 'gear-art large')}
    <div class="detail-id gear-id"><div><h2 id="sheet-title">${displayName(w)}</h2><p>${w.en}</p>
      <div class="chips" style="margin-top:6px">${badge(group.name, 'outline')}${badge(typeName(w.type))}${apOf(w) != null ? badge(`${apText(w)} · ${apBandOf({ ap: apOf(w) })?.name}`, 'accent') : ''}${traits(w)}</div></div></div>
    <dl class="detail-grid">${detailRows(w).map(row => html`<div><dt>${row.label}</dt><dd class="${row.dim ? 'dim' : ''}">${row.text}${row.unit ? html`<small>${row.unit}</small>` : ''}</dd>${row.caption ? html`<div class="caption">${row.caption}</div>` : ''}</div>`)}</dl>
    ${blastFigure(w)}
    ${variantTable(w)}
    ${conflicts.length ? html`<div class="callout warn"><h3>위키 페이지 표시값과 다름</h3><p>${conflicts.map(c => `${c.label || c.field}: 데이터 ${Array.isArray(c.db) ? c.db.join('~') : c.db} / 페이지 ${c.raw ?? c.infobox}`).join(' · ')}. 더 최신인 게임 데이터 값을 표시합니다.</p></div>` : ''}
    ${w.playerNotes?.length ? html`<section class="block"><h3>알아 둘 점</h3><ul class="notes">${w.playerNotes.map(note => html`<li>${note}</li>`)}</ul></section>` : ''}
    <div class="links">
      ${w.category !== 'throwable' || w.splash != null ? html`<a class="button primary" href="#/enemy?w=${w.id}">${icon('enemy', 18)} 적 대응 계산</a>` : ''}
      <a class="button" href="${raw(loadoutHref({ [slotOf(w)]: w.id }))}">${icon('gear', 18)} 편성에 넣기</a>
    </div>
    <div class="sources">
      <span>자료 확인 ${personalWeaponsCheckedAt}</span>
      ${external(w.source, '위키 항목')}
      ${image ? external(image.source, '이미지 원본') : ''}
      ${w.name ? html`<span>한국어 이름: 나무위키</span>` : ''}
    </div>
    <p class="faint" style="font-size:12.5px">기본 상태(부착물·함선 강화 제외) 기준입니다. 실제 피해는 맞은 부위의 장갑·내구도와 거리, 각도에 따라 달라집니다.</p>
  </div>`;
}

function openDetail(id) {
  const w = weaponById.get(id);
  if (!w) return;
  ctx.openSheet(detailContent(w), {
    label: `${displayName(w)} 상세`,
    onClose: () => {
      if (state.detail !== id) return;
      state.detail = null;
      if (state.pushedDetail) { state.pushedDetail = false; history.back(); } else syncUrl();
    },
  });
}

// --- Loadout -----------------------------------------------------------------------
const SLOT_OF = { primary: 'p', secondary: 's', throwable: 'g' };
const slotOf = w => SLOT_OF[w.category];
const loadout = { p: '', s: '', g: '', st: ['', '', '', ''], f: '', shield: true };
function loadoutQuery() { return { p: loadout.p, s: loadout.s, g: loadout.g, st: loadout.st.some(Boolean) ? loadout.st.join(',') : '', f: loadout.f, sh: loadout.shield ? '' : '0' }; }
function loadoutHref(patch) {
  const query = new URLSearchParams(Object.entries({ tab: 'loadout', ...loadoutQuery(), ...patch }).filter(([, v]) => v));
  return `#/gear?${query}`;
}

let loadoutUi = null;
async function renderLoadout() {
  const panel = $('#gear-loadout', root);
  if (!loadoutUi) {
    render(panel, html`<p class="faint" style="padding:24px 0">편성 점검 도구를 불러오는 중…</p>`);
    loadoutUi = import('./gear-loadout.js');
  }
  const module = await loadoutUi;
  if (state.tab !== 'loadout') return;
  module.renderLoadout(panel, { ctx, loadout, onChange: () => { syncUrl(); renderLoadout(); } });
}

// --- View lifecycle -------------------------------------------------------------------
function showTab() {
  for (const button of $$('[data-tab-pick]', root)) button.setAttribute('aria-pressed', String(button.dataset.tabPick === state.tab));
  $('#gear-browse', root).hidden = state.tab !== 'browse';
  $('#gear-loadout', root).hidden = state.tab !== 'loadout';
  if (state.tab === 'browse') renderBrowse(); else renderLoadout().catch(error => { console.error(error); ctx.toast('편성 점검 도구를 불러오지 못했습니다.'); });
}

export function mount(container, context) {
  root = container; ctx = context;
  const count = id => personalWeapons.filter(w => w.category === id).length;
  render(root, html`<div class="page-head"><div><div class="eyebrow">Armory</div><h1>장비</h1><p>주무기 ${count('primary')}종 · 보조무기 ${count('secondary')}종 · 투척 ${count('throwable')}종. 카드를 누르면 자세한 수치가 열리고, 편성을 짜서 적 대응 공백을 점검할 수 있습니다.</p></div>
    <div class="segmented" role="group" aria-label="보기 선택"><button type="button" data-tab-pick="browse">${icon('gear', 16)} 장비 둘러보기</button><button type="button" data-tab-pick="loadout">${icon('check', 16)} 편성 점검</button></div></div>
  <div id="gear-browse">
    <div class="arsenal-tools">
      <div class="row">
        <label class="field">${icon('search', 18)}<span class="sr-only">장비 검색</span><input class="input" id="gear-q" type="search" placeholder="이름·코드 검색 — 초성도 됩니다 (예: ㄹㅂㄹㅇㅌ, AR-23)" autocomplete="off"></label>
        <label><span class="sr-only">정렬</span><select class="select" id="gear-sort">${SORTS.map(sort => html`<option value="${sort.id}">${sort.name}</option>`)}</select></label>
      </div>
      <div class="segmented gear-groups" role="group" aria-label="분류">${GROUPS.map(group => html`<button type="button" data-cat="${group.id}" style="--dot:${group.color}"><span class="dot"></span>${group.name} <span class="count">${count(group.id)}</span></button>`)}</div>
      <div class="chips" id="gear-types" role="group" aria-label="세부 종류"></div>
    </div>
    <div class="arsenal-meta"><span id="gear-count" role="status"></span></div>
    <div id="gear-grid" class="grid gear-grid"></div>
  </div>
  <div id="gear-loadout" hidden></div>`);

  const input = $('#gear-q', root);
  input.addEventListener('input', () => { state.q = input.value; renderBrowse(); syncUrl(); });
  $('#gear-sort', root).addEventListener('change', event => { state.sort = event.target.value; renderBrowse(); syncUrl(); });
  root.addEventListener('click', event => {
    const target = event.target.closest('button, a');
    if (!target) return;
    if (target.dataset.tabPick) { state.tab = target.dataset.tabPick; showTab(); syncUrl(); }
    else if (target.dataset.cat) { state.cat = target.dataset.cat; state.type = ''; state.q = ''; input.value = ''; renderBrowse(); syncUrl(); }
    else if (target.dataset.type != null) { state.type = state.type === target.dataset.type ? '' : target.dataset.type; renderBrowse(); syncUrl(); }
    else if (target.dataset.open) { state.pushedDetail = true; ctx.go({ view: 'gear', id: target.dataset.open, query: ctx.route.query }); }
  });
}

export function update(route) {
  const q = route.query;
  state.tab = q.tab === 'loadout' ? 'loadout' : 'browse';
  if (state.tab === 'browse') {
    Object.assign(state, {
      cat: GROUPS.some(group => group.id === q.cat) ? q.cat : 'primary',
      q: q.q || '', sort: SORTS.some(sort => sort.id === q.sort) ? q.sort : '',
    });
    state.type = typesOf(state.cat).includes(q.type) ? q.type : '';
    $('#gear-q', root).value = state.q;
    $('#gear-sort', root).value = state.sort;
  } else {
    const valid = (id, cat) => weaponById.get(id)?.category === cat ? id : '';
    Object.assign(loadout, { p: valid(q.p, 'primary'), s: valid(q.s, 'secondary'), g: valid(q.g, 'throwable'), f: q.f || '', shield: q.sh !== '0' });
    loadout.st = [...String(q.st || '').split(',').slice(0, 4), '', '', '', ''].slice(0, 4);
  }
  showTab();
  const id = weaponById.has(route.id) ? route.id : null;
  if (id && id !== state.detail) { state.detail = id; openDetail(id); }
  else if (!id && state.detail) { state.detail = null; state.pushedDetail = false; ctx.closeSheet(); }
}
