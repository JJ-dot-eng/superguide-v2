// Stratagem catalogue: filter, sort, detail sheet and side-by-side comparison.
import { stratagems, stratagemById, categories, categoryOf, apBands, apBandOf, withVariant, variantOf, CHECKED_AT } from '../../core/catalog.js';
import { search, stratagemFields } from '../../core/search.js';
import { num } from '../../core/explain.js';
import { shieldRecovery } from '../../core/defense.js';
import { wikiIcons } from '../../data/wiki-icons.js';
import { html, raw, render, $, $$, icon, keycaps, badge, external } from '../dom.js';

const SORTS = [
  { id: '', name: '기본 순서' },
  { id: 'direct', name: '직격 피해 순', value: item => item.direct },
  { id: 'splash', name: '폭발 피해 순', value: item => item.splash },
  { id: 'ap', name: '관통력 순', value: item => item.ap },
  { id: 'reach', name: '사거리·반경 순', value: item => item.range ?? item.radius },
];
const MAX_COMPARE = 3;

let root, ctx;
const state = { c: '', ap: '', q: '', sort: '', compare: new Set(), detail: null, variant: '', pushedDetail: false };

export const iconOf = item => html`<img class="strat-icon" src="${wikiIcons[item.id]?.src}" alt="" width="44" height="44" loading="lazy" decoding="async">`;

// --- Stats ---------------------------------------------------------------------
function stats(item) {
  const dps = item.damageKind === 'dps';
  const none = item.utility;
  const value = (number, text, zero) => text ? { text } : none ? { text: '—', dim: true } : number == null ? { text: '미확인', dim: true } : number === 0 && zero ? { text: zero, dim: true } : { text: num(number), unit: dps && zero == null ? '/s' : '' };
  const reach = item.range != null ? { text: num(item.range), unit: 'm', label: '사거리', caption: item.rangeType }
    : item.radius != null ? { text: num(item.radius), unit: 'm', label: '반경', caption: item.innerRadius != null ? `중심 ${num(item.innerRadius)}m · 외곽 ${num(item.radius)}m` : '폭발 외곽 반경' }
    : { text: item.rangeLabel || '미확인', dim: !item.rangeLabel || item.rangeLabel === '미확인', label: '범위', caption: item.rangeNoteShort };
  return [
    { label: dps ? '지속 피해' : '직격', caption: item.directNoteShort || (none ? '지원 장비' : dps ? '초당' : item.unit), ...value(item.direct, item.directText) },
    { label: '폭발', caption: item.splashNoteShort || (item.splash > 0 ? '중심부 최대' : ''), ...value(item.splash, item.splashText, '없음') },
    { label: '관통', caption: item.apNoteShort || (item.ap != null ? apBandOf(item).name + (item.splashAp != null && item.splashAp !== item.ap ? ` · 폭발 AP ${item.splashAp}` : '') : ''),
      ...(item.ap != null ? { text: `AP ${item.ap}${item.splashAp != null && item.splashAp !== item.ap ? `/${item.splashAp}` : ''}` } : { text: none ? '—' : '미확인', dim: true }) },
    { caption: reach.caption, ...reach },
  ];
}

const statRow = item => html`<dl class="stat-row">${stats(item).map(stat => html`<div><dt>${stat.label}</dt><dd class="${stat.dim ? 'dim' : ''}">${stat.text}${stat.unit ? html`<small>${stat.unit}</small>` : ''}</dd></div>`)}</dl>`;

// One-line numbers for a mode, used on cards and in the comparison table.
function variantBrief(item, variant) {
  const v = withVariant(item, variant);
  const parts = [`직격 ${v.directText || num(v.direct)}`];
  if (v.splashText) parts.push(v.splashText);
  else if (v.splash > 0) parts.push(`폭발 ${num(v.splash)}`);
  parts.push(`AP ${v.ap}${v.splashAp != null && v.splashAp !== v.ap ? `/${v.splashAp}` : ''}`);
  if (v.radius != null) parts.push(`외곽 ${num(v.radius)}m`);
  return parts.join(' · ');
}

// Cards show the other modes under the main numbers; long shell lists collapse to names.
function cardModes(item) {
  const variants = item.variants || [];
  if (variants.length < 2) return '';
  const rest = variants.slice(1);
  if (rest.length > 2) return html`<span class="card-modes" data-kind="${item.variantKind || 'modes'}"><span><b>${variants.length}종</b> ${variants.map(v => v.tab || v.name).join(' · ')}</span></span>`;
  return html`<span class="card-modes" data-kind="${item.variantKind || 'modes'}">${rest.map(v => html`<span><b>${v.tab || v.name}</b> ${variantBrief(item, v)}</span>`)}</span>`;
}

function card(item) {
  const selected = state.compare.has(item.id);
  return html`<article class="card ${selected ? 'selected' : ''}" style="--cat:${categoryOf(item.category).color}" data-id="${item.id}">
    <button class="card-open" type="button" data-open="${item.id}" aria-label="${item.name} 자세히 보기">
      <div class="card-head">${iconOf(item)}<div><h3>${item.name}</h3><p class="en">${item.en}${item.code ? ` · ${item.code}` : ''}</p></div></div>
      <div class="card-keys">${item.input ? keycaps(item.input) : html`<span>${categoryOf(item.category).name}</span>`}</div>
      <p class="summary">${item.summary}</p>
      ${statRow(item)}
      ${cardModes(item)}
    </button>
    <button class="compare-toggle" type="button" data-compare="${item.id}" aria-pressed="${selected}" aria-label="${item.name} 비교에 ${selected ? '담김' : '담기'}" title="비교에 담기">${icon(selected ? 'check' : 'plus', 16)}</button>
  </article>`;
}

// --- Filtering -------------------------------------------------------------------
function visibleItems() {
  const band = apBands.find(item => item.id === state.ap);
  let items = stratagems.filter(item => (!state.c || item.category === state.c) && (!band || band.test(item)));
  items = search(items, state.q, stratagemFields);
  const sort = SORTS.find(item => item.id === state.sort);
  if (sort?.value) items = [...items].sort((a, b) => (sort.value(b) ?? -1) - (sort.value(a) ?? -1));
  return items;
}

function syncUrl() {
  ctx.replace({ view: 'arsenal', id: state.detail, query: { c: state.c, ap: state.ap, q: state.q, sort: state.sort, m: state.detail ? state.variant : '' } });
}

function renderList() {
  const items = visibleItems();
  const total = stratagems.filter(item => !state.c || item.category === state.c).length;
  $('#arsenal-count').innerHTML = html`<span><b>${items.length}</b>개 표시 · 전체 ${total}개</span>`.toString();
  render($('#arsenal-grid'), items.length ? items.map(card) : html`<div class="empty" style="grid-column:1/-1"><h3>맞는 스트라타젬이 없습니다</h3><p>검색어를 줄이거나 필터를 해제해 보세요.</p><button class="button" type="button" data-reset>필터 초기화</button></div>`);
  for (const chip of $$('[data-cat]', root)) chip.setAttribute('aria-pressed', String(chip.dataset.cat === state.c));
  for (const chip of $$('[data-ap]', root)) chip.setAttribute('aria-pressed', String(chip.dataset.ap === state.ap));
  $('[data-reset-inline]', root).hidden = !state.c && !state.ap && !state.q && !state.sort;
  renderTray();
}

function renderTray() {
  const tray = $('#arsenal-tray');
  const items = [...state.compare].map(id => stratagemById.get(id));
  tray.hidden = !items.length;
  if (!items.length) return;
  render(tray, html`<span class="names">${icon('compare', 18)} ${items.map(item => item.name).join(' · ')}</span>
    <span class="faint num">${items.length}/${MAX_COMPARE}</span>
    <button class="button small" type="button" data-compare-clear>비우기</button>
    <button class="button small primary" type="button" data-compare-open ${items.length < 2 ? raw('disabled title="2개 이상 담으면 비교할 수 있습니다"') : ''}>비교하기</button>`);
}

// --- Detail sheet ------------------------------------------------------------------
function blastFigure(item) {
  if (item.radius == null || item.innerRadius == null) return '';
  const outer = 56, inner = Math.max(8, outer * item.innerRadius / item.radius);
  return html`<div class="blast">
    <svg width="176" height="176" viewBox="0 0 132 132" role="img" aria-label="폭발 반경: 중심 ${item.innerRadius}m, 외곽 ${item.radius}m">
      <circle cx="66" cy="66" r="${outer}" fill="var(--accent-soft)" stroke="var(--accent)" stroke-opacity=".45" stroke-dasharray="3 4"/>
      <circle cx="66" cy="66" r="${inner}" fill="var(--accent)" fill-opacity=".35" stroke="var(--accent)"/>
      <path d="M66 66H${66 - outer}M66 66H${66 + inner}" stroke="var(--text)" stroke-width="1.2"/>
      <circle cx="66" cy="66" r="2.5" fill="var(--text)"/>
      <g class="blast-label" aria-hidden="true">
        <text x="62" y="59" text-anchor="end">외곽 ${num(item.radius)}m</text>
        <text x="70" y="80">중심 ${num(item.innerRadius)}m</text>
      </g>
    </svg>
    <p><b style="color:var(--text)">중심 ${num(item.innerRadius)}m</b> 안쪽은 최대 피해입니다.<br>바깥으로 갈수록 줄어들어 <b style="color:var(--text)">${num(item.radius)}m</b>에서 사라지고, 관통력도 1 낮아집니다(최소 2).<br><span class="faint">충격파·함선 강화 효과는 제외한 반경입니다.</span></p>
  </div>`;
}

function defenseBlock(item) {
  const d = item.defense;
  if (!d) return '';
  const rows = [];
  const add = (label, value, unit = '', caption = '') => rows.push({ label, value, unit, caption });
  add('기본 재사용 대기', Number.isFinite(d.cooldown) ? num(d.cooldown) : '미확인', '초', '함선 강화 제외');
  if (d.type === 'energy') {
    const s = d.shield || {};
    add('보호막 용량', num(s.capacity), '', '장치 체력과 별개');
    add('재생 속도', num(s.regeneration), '/초');
    add('피격 후 재생 대기', s.hitDelay <= 0.01 ? '즉시' : num(s.hitDelay), s.hitDelay <= 0.01 ? '' : '초', '일부만 깎였을 때');
    if (s.regeneratesAfterDepletion === false) add('완전히 깨진 뒤', '재생 안 됨', '', '장비 수명 안에 복구되지 않음');
    else {
      add('완전히 깨진 뒤 대기', num(s.depletedDelay), '초');
      const full = shieldRecovery(d, 0);
      add('0 → 가득 회복', full ? num(full.total) : '미확인', full ? '초' : '', full ? `대기 ${num(full.delay)}초 + 재생 ${num(full.filling)}초` : '');
    }
    add(`${d.bodyLabel || '장치 본체'} 체력`, d.body?.hp != null ? num(d.body.hp) : '미확인', '', d.body?.armor != null ? `장갑 ${d.body.armor}` : '');
    if (d.lifetime != null) add('지속시간', d.lifetime === 'unlimited' ? '제한 없음' : num(d.lifetime), d.lifetime === 'unlimited' ? '' : '초');
    if (s.radius != null) add('보호 반경', num(s.radius), 'm', s.coverage || '');
    else if (s.coverage) add('보호 방향', s.coverage);
  } else {
    add('본체 체력', num(d.body?.hp), '', `장갑 ${d.body?.armor ?? '?'} · 내구도 ${d.body?.durability ?? '?'}%`);
    if (d.replacement === 'new-call') add('파괴되면', '재호출', '', '수리되지 않음');
  }
  return html`<section class="block"><h3>방어 성능</h3>
    <dl class="detail-grid">${rows.map(row => html`<div><dt>${row.label}</dt><dd class="${/[가-힣]/.test(row.value) ? 'dim' : ''}">${row.value}${row.unit ? html`<small>${row.unit}</small>` : ''}</dd>${row.caption ? html`<div class="caption">${row.caption}</div>` : ''}</div>`)}</dl>
    ${d.notes?.length ? html`<ul class="notes" style="margin-top:10px">${d.notes.map(note => html`<li>${note}</li>`)}</ul>` : ''}
  </section>`;
}

// Measured spread of sub-munitions: big numbers first, then the conditions behind them.
function spreadBlock(item) {
  const s = item.spread;
  if (!s) return '';
  return html`<section class="block"><h3>${s.title}</h3>
    <dl class="detail-grid">${s.rows.map(row => html`<div><dt>${row.label}</dt><dd>${row.value}<small>${row.unit}</small></dd><div class="caption">${row.caption}</div></div>`)}</dl>
    <ul class="notes" style="margin-top:10px">${s.notes.map(note => html`<li>${note}</li>`)}</ul>
    <p class="faint" style="font-size:12.5px;margin-top:8px">${s.source}</p>
  </section>`;
}

const statGrid = item => html`<dl class="detail-grid">${stats(item).map(stat => html`<div><dt>${stat.label}</dt><dd class="${stat.dim ? 'dim' : ''}">${stat.text}${stat.unit ? html`<small>${stat.unit}</small>` : ''}</dd>${stat.caption ? html`<div class="caption">${stat.caption}</div>` : ''}</div>`)}
  ${item.cooldown ? html`<div><dt>재사용 대기</dt><dd>${num(item.cooldown)}<small>초</small></dd><div class="caption">함선 강화 제외</div></div>` : ''}</dl>`;

function detailContent(item, { demolition = false } = {}) {
  const cat = categoryOf(item.category);
  const variants = item.variants?.length > 1 ? item.variants : null;
  const current = variantOf(item, state.variant);
  const combat = item.category === 'support';
  const notes = [item.rangeNote, item.notes, ...(item.modes || [])].filter(Boolean);
  const inCompare = state.compare.has(item.id);
  return html`<div class="sheet-top"><span>${cat.name} · 상세</span><button class="icon-button" type="button" data-close aria-label="닫기">${icon('close', 18)}</button></div>
  <div class="sheet-content">
    <div class="detail-id"><img class="strat-icon large" src="${wikiIcons[item.id]?.src}" alt="" width="64" height="64">
      <div><h2 id="sheet-title">${item.name}</h2><p>${item.en}${item.code ? ` · ${item.code}` : ''}</p>
      <div class="chips" style="margin-top:6px">${badge(cat.name, 'outline')}${item.ap != null ? badge(`AP ${item.ap} · ${apBandOf(item).name}`, 'accent') : ''}${item.tags.map(tag => badge(tag))}</div></div></div>
    ${item.input ? html`<div class="block"><h3>호출 코드</h3>${keycaps(item.input, 'large')}</div>` : ''}
    <p style="font-size:16px">${item.summary}</p>
    ${variants ? html`<div class="variant-tabs"><h3>${item.variantLabel || '모드별 수치'}</h3><div class="segmented" role="group" aria-label="${item.variantLabel || '모드 선택'}">${variants.map(v => html`<button type="button" data-variant="${v.id}" aria-pressed="${String(v === current)}">${v.tab || v.name}</button>`)}</div></div>
      ${variants.map(v => html`<div class="variant-panel" data-variant-panel="${v.id}" ${v === current ? '' : raw('hidden')}>${statGrid(withVariant(item, v))}${blastFigure(withVariant(item, v))}${v.note ? html`<p class="variant-note">${v.note}</p>` : ''}</div>`)}`
      : html`${statGrid(item)}${blastFigure(item)}`}
    ${spreadBlock(item)}
    <section class="block"><h3>이렇게 쓰세요</h3><p>${item.usage}</p></section>
    ${item.warning ? html`<div class="callout warn"><h3>주의</h3><p>${item.warning}</p></div>` : ''}
    ${defenseBlock(item)}
    ${notes.length ? html`<section class="block"><h3>수치 기준</h3><ul class="notes">${notes.map(note => html`<li>${note}</li>`)}</ul></section>` : ''}
    <div class="links">
      ${combat ? html`<a class="button primary" href="#/enemy?w=${item.id}">${icon('enemy', 18)} 적 대응 계산</a>` : ''}
      ${demolition ? html`<a class="button" href="#/demolition?w=${item.id}">${icon('demolition', 18)} 철거 가능 시설</a>` : ''}
      <button class="button ghost" type="button" data-compare="${item.id}" aria-pressed="${inCompare}">${icon(inCompare ? 'check' : 'plus', 18)} ${inCompare ? '비교에 담김' : '비교에 담기'}</button>
    </div>
    <div class="sources">
      <span>자료 확인 ${item.defense?.checkedAt || CHECKED_AT}${item.patch ? ` · 위키 갱신 패치 ${item.patch}` : ''}</span>
      ${external(item.source, '위키 항목')}
      ${wikiIcons[item.id] ? external(wikiIcons[item.id].source, '아이콘 원본') : ''}
      ${item.extraSource ? external(item.extraSource, '추가 수치 근거') : ''}
    </div>
    <p class="faint" style="font-size:12.5px">기본값 기준입니다. 함선 강화·행성 효과는 제외하며, 실제 피해는 맞은 부위의 장갑·내구도와 거리, 각도에 따라 달라집니다.</p>
  </div>`;
}

let demolitionIds = null;
function openDetail(id) {
  const item = stratagemById.get(id);
  if (!item) return;
  const show = () => ctx.openSheet(detailContent(item, { demolition: demolitionIds?.has(id) }), {
    label: `${item.name} 상세`,
    onClose: () => {
      if (state.detail !== id) return;
      state.detail = null; state.variant = '';
      if (state.pushedDetail) { state.pushedDetail = false; history.back(); } else syncUrl();
    },
  });
  show();
  // Demolition data is large; learn which stratagems have it only when needed.
  if (!demolitionIds) import('../../data/demolition-data.js').then(({ demolitionProfiles }) => {
    demolitionIds = new Set(Object.keys(demolitionProfiles));
    if (state.detail === id && demolitionIds.has(id)) show();
  });
}

// --- Comparison ---------------------------------------------------------------------
function openCompare() {
  const items = [...state.compare].map(id => stratagemById.get(id));
  if (items.length < 2) return;
  const best = (pick) => { const values = items.map(pick).filter(Number.isFinite); return values.length > 1 ? Math.max(...values) : null; };
  const numericRow = (label, index, pick) => {
    const top = best(pick);
    return html`<tr><th scope="row">${label}</th>${items.map(item => { const stat = stats(item)[index]; return html`<td class="${top != null && pick(item) === top ? 'best' : ''}">${stat.text}${stat.unit || ''}${stat.caption ? html`<small>${stat.caption}</small>` : ''}</td>`; })}</tr>`;
  };
  const textRow = (label, pick) => html`<tr><th scope="row">${label}</th>${items.map(item => html`<td>${pick(item) || html`<span class="faint">—</span>`}</td>`)}</tr>`;
  ctx.openSheet(html`<div class="sheet-top"><span>나란히 비교</span><button class="icon-button" type="button" data-close aria-label="닫기">${icon('close', 18)}</button></div>
  <div class="sheet-content">
    <h2 id="sheet-title" style="font-size:22px">${items.map(item => item.name).join(' vs ')}</h2>
    <div class="compare-scroll" role="region" aria-label="비교표" tabindex="0"><table class="compare-table">
      <thead><tr><th></th>${items.map(item => html`<th scope="col"><div style="display:flex;gap:10px;align-items:center">${iconOf(item)}<div>${item.name}<small class="faint" style="display:block;font-weight:500;font-size:12px">${categoryOf(item.category).name}</small></div></div></th>`)}</tr></thead>
      <tbody>
        ${numericRow(stats(items[0])[0].label === '지속 피해' ? '직격 / 지속' : '직격', 0, item => item.direct)}
        ${numericRow('폭발', 1, item => item.splash)}
        ${numericRow('관통', 2, item => item.ap)}
        ${numericRow('사거리·반경', 3, item => item.range ?? item.radius)}
        ${items.some(item => item.variants) ? textRow('모드별', item => item.variants ? html`<ul class="compare-modes">${item.variants.map(v => html`<li><b>${v.name}</b> ${variantBrief(item, v)}</li>`)}</ul>` : '') : ''}
        ${textRow('호출 코드', item => item.input ? keycaps(item.input) : '')}
        ${items.some(item => item.defense) ? textRow('방어', item => item.defense?.type === 'energy' ? `보호막 ${num(item.defense.shield?.capacity)} · 재생 ${num(item.defense.shield?.regeneration)}/초` : item.defense ? `본체 체력 ${num(item.defense.body?.hp)} · 장갑 ${item.defense.body?.armor}` : '') : ''}
        ${textRow('용도', item => item.tags.join(' · '))}
        ${textRow('사용법', item => item.usage)}
        ${textRow('주의', item => item.warning)}
      </tbody>
    </table></div>
    <p class="faint" style="font-size:12.5px">노란 값이 가장 높은 수치입니다. 사거리와 폭발 반경, 한 발 피해와 초당 피해는 단위가 다르니 아래 설명을 함께 보세요.</p>
  </div>`, { wide: true, label: '스트라타젬 비교' });
}

function toggleCompare(id) {
  if (state.compare.has(id)) state.compare.delete(id);
  else if (state.compare.size >= MAX_COMPARE) { ctx.toast(`비교는 최대 ${MAX_COMPARE}개까지입니다. 하나를 빼 주세요.`); return; }
  else state.compare.add(id);
  renderList();
  if (state.detail === id) openDetail(id);
}

// --- View lifecycle -------------------------------------------------------------------
export function mount(container, context) {
  root = container; ctx = context;
  const count = id => stratagems.filter(item => item.category === id).length;
  render(root, html`<div class="page-head"><div><div class="eyebrow">Stratagem Arsenal</div><h1>스트라타젬 도감</h1><p>${stratagems.length}종의 피해·관통·범위와 사용법. 카드를 누르면 자세한 기준이 열립니다.</p></div></div>
  <div class="arsenal-tools">
    <div class="row">
      <label class="field">${icon('search', 18)}<span class="sr-only">스트라타젬 검색</span><input class="input" id="arsenal-q" type="search" placeholder="이름·코드·용도 검색 — 순서를 섞어도 됩니다 (예: 도밀타)" autocomplete="off"></label>
      <label><span class="sr-only">정렬</span><select class="select" id="arsenal-sort">${SORTS.map(sort => html`<option value="${sort.id}">${sort.name}</option>`)}</select></label>
    </div>
    <div class="chips" role="group" aria-label="종류"><button class="chip" type="button" data-cat="">전체 <span class="count">${stratagems.length}</span></button>${categories.map(cat => html`<button class="chip" type="button" data-cat="${cat.id}" style="--dot:${cat.color}"><span class="dot"></span>${cat.name} <span class="count">${count(cat.id)}</span></button>`)}</div>
    <div class="chips" role="group" aria-label="관통력"><button class="chip" type="button" data-ap="">모든 관통력</button>${apBands.map(band => html`<button class="chip" type="button" data-ap="${band.id}">${band.name} <span class="count">${band.label}</span></button>`)}</div>
  </div>
  <div class="arsenal-meta"><span id="arsenal-count" role="status"></span><button class="link" type="button" data-reset data-reset-inline>필터 초기화</button></div>
  <div id="arsenal-grid" class="grid"></div>
  <div id="arsenal-tray" class="tray" hidden></div>`);

  const input = $('#arsenal-q', root);
  input.addEventListener('input', () => { state.q = input.value; renderList(); syncUrl(); });
  $('#arsenal-sort', root).addEventListener('change', event => { state.sort = event.target.value; renderList(); syncUrl(); });
  root.addEventListener('click', event => {
    const target = event.target.closest('button, a');
    if (!target) return;
    if (target.dataset.cat != null) { state.c = state.c === target.dataset.cat ? '' : target.dataset.cat; renderList(); syncUrl(); }
    else if (target.dataset.ap != null) { state.ap = state.ap === target.dataset.ap ? '' : target.dataset.ap; renderList(); syncUrl(); }
    else if (target.dataset.open) { state.pushedDetail = true; ctx.go({ view: 'arsenal', id: target.dataset.open, query: { ...ctx.route.query, m: '' } }); }
    else if (target.dataset.compare) toggleCompare(target.dataset.compare);
    else if (target.hasAttribute('data-compare-clear')) { state.compare.clear(); renderList(); }
    else if (target.hasAttribute('data-compare-open')) openCompare();
    else if (target.hasAttribute('data-reset')) { Object.assign(state, { c: '', ap: '', q: '', sort: '' }); input.value = ''; $('#arsenal-sort', root).value = ''; renderList(); syncUrl(); }
  });
  // Buttons inside the sheet live outside `root`; register that listener once.
  if (!sheetListener) {
    sheetListener = event => {
      if (document.body.dataset.view !== 'arsenal') return;
      const target = event.target.closest('[data-compare]');
      if (target) toggleCompare(target.dataset.compare);
      const pick = event.target.closest('[data-variant]');
      if (pick) selectVariant(pick.dataset.variant);
    };
    $('#sheet').addEventListener('click', sheetListener);
  }
}
let sheetListener = null;

function selectVariant(id) {
  state.variant = id;
  const sheet = $('#sheet');
  for (const button of $$('[data-variant]', sheet)) button.setAttribute('aria-pressed', String(button.dataset.variant === id));
  for (const panel of $$('[data-variant-panel]', sheet)) panel.hidden = panel.dataset.variantPanel !== id;
  syncUrl();
}

export function update(route) {
  const q = route.query;
  Object.assign(state, {
    c: categories.some(cat => cat.id === q.c) ? q.c : '',
    ap: apBands.some(band => band.id === q.ap) ? q.ap : '',
    q: q.q || '', sort: SORTS.some(sort => sort.id === q.sort) ? q.sort : '',
  });
  $('#arsenal-q', root).value = state.q;
  $('#arsenal-sort', root).value = state.sort;
  renderList();
  const id = stratagemById.has(route.id) ? route.id : null;
  if (id && id !== state.detail) { state.detail = id; state.variant = stratagemById.get(id).variants?.some(v => v.id === q.m) ? q.m : ''; openDetail(id); }
  else if (!id && state.detail) { state.detail = null; state.variant = ''; state.pushedDetail = false; ctx.closeSheet(); }
}
