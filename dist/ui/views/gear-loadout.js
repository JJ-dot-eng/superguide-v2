// Loadout check inside the gear tab: pick a primary, secondary, throwable and
// four stratagems, choose a faction, and see which key enemies the loadout
// answers (and with what), which it does not, and what could fill the gap.
import { personalWeapons } from '../../data/personal-weapons.js';
import { weaponImages } from '../../data/weapon-images.js';
import { wikiIcons } from '../../data/wiki-icons.js';
import { pickerEnemyImages } from '../../data/selector-images.js';
import { stratagems, stratagemById, categoryOf } from '../../core/catalog.js';
import { search, stratagemFields } from '../../core/search.js';
import { num, outcomeOf } from '../../core/explain.js';
import { html, raw, render, $, $$, icon, badge } from '../dom.js';
import { weaponById, displayName, typeName } from '../gear-shared.js';

const SLOTS = [
  { key: 'p', label: '주무기', group: 'primary' },
  { key: 's', label: '보조무기', group: 'secondary' },
  { key: 'g', label: '투척', group: 'throwable' },
  ...[0, 1, 2, 3].map(index => ({ key: `st${index}`, label: `스트라타젬 ${index + 1}`, stratagem: index })),
];

let core = null; // dist/core/loadout.js, loaded with the panel
let env = null;  // { ctx, loadout, onChange }
let panelEl = null;

const itemOf = id => weaponById.get(id) || stratagemById.get(id) || null;
const nameOf = id => { const item = itemOf(id); return item ? (weaponById.has(id) ? displayName(item) : item.name) : id; };
const slotValue = slot => slot.stratagem != null ? env.loadout.st[slot.stratagem] : env.loadout[slot.key];

export function thumb(id, size = 40) {
  const image = weaponImages[id];
  if (image) return html`<span class="lo-thumb" style="width:${size}px;height:${size}px"><img src="${image.src}" alt="" loading="lazy" decoding="async"></span>`;
  const iconSrc = wikiIcons[id]?.src;
  return iconSrc ? html`<img class="strat-icon" src="${iconSrc}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px" loading="lazy">` : html`<span class="lo-thumb empty" style="width:${size}px;height:${size}px">${icon('plus', 16)}</span>`;
}

function slotTile(slot) {
  const id = slotValue(slot);
  const item = id && itemOf(id);
  const support = item && stratagemById.has(id) && item.category === 'support';
  return html`<div class="lo-slot ${item ? 'filled' : ''}" data-slot-kind="${slot.stratagem != null ? 'stratagem' : slot.group}">
    <button type="button" class="lo-slot-pick" data-slot="${slot.key}" aria-label="${slot.label} ${item ? `${nameOf(id)} 바꾸기` : '고르기'}">
      ${thumb(id, 44)}
      <span class="lo-slot-text"><small>${slot.label}</small><b>${item ? nameOf(id) : '비어 있음'}</b>
        ${item && stratagemById.has(id) && !support ? html`<em>계산 대상 아님</em>` : ''}</span>
    </button>
    ${item ? html`<button type="button" class="icon-button lo-clear" data-clear="${slot.key}" aria-label="${slot.label} 비우기">${icon('close', 14)}</button>` : ''}
  </div>`;
}

// --- Slot picker sheet -------------------------------------------------------------
function candidates(slot, q) {
  if (slot.stratagem != null) {
    const taken = new Set(env.loadout.st.filter((id, index) => id && index !== slot.stratagem));
    const list = stratagems.filter(item => !taken.has(item.id));
    return search(list, q, stratagemFields).sort((a, b) => q ? 0 : Number(b.category === 'support') - Number(a.category === 'support'));
  }
  return search(personalWeapons.filter(w => w.category === slot.group), q, w => ({ names: [w.name, w.en, w.code].filter(Boolean), text: [typeName(w.type)] }));
}

function pickerList(slot, q) {
  const items = candidates(slot, q);
  if (!items.length) return html`<p class="empty" style="padding:24px 8px">찾는 항목이 없습니다.</p>`;
  return items.map(item => {
    const personal = weaponById.has(item.id);
    const sub = personal ? `${typeName(item.type)} · ${item.en}` : `${categoryOf(item.category).name}${item.category === 'support' ? ' · 적 대응 계산' : ''}`;
    return html`<button type="button" class="picker-item lo-choice" data-choose="${item.id}" aria-current="${slotValue(slot) === item.id}">${thumb(item.id, 36)}<span>${personal ? displayName(item) : item.name}<small>${sub}</small></span></button>`;
  });
}

function openPicker(slot) {
  const { ctx } = env;
  ctx.openSheet(html`<div class="sheet-top"><span>${slot.label} 고르기</span><button class="icon-button" type="button" data-close aria-label="닫기">${icon('close', 18)}</button></div>
    <div class="sheet-content lo-picker">
      <h2 id="sheet-title" style="font-size:20px">${slot.label}</h2>
      ${slot.stratagem != null ? html`<p class="muted">지원 무기 스트라타젬만 적 대응 계산에 들어갑니다. 나머지는 편성에 담기만 합니다.</p>` : ''}
      <label class="field">${icon('search', 16)}<span class="sr-only">검색</span><input class="input" id="lo-q" type="search" placeholder="이름·코드 검색 — 초성도 됩니다" autocomplete="off"></label>
      <div class="lo-choices" id="lo-choices">${pickerList(slot, '')}</div>
    </div>`, { label: `${slot.label} 고르기` });
  const sheet = $('#sheet');
  const input = $('#lo-q', sheet);
  input.addEventListener('input', () => render($('#lo-choices', sheet), pickerList(slot, input.value)));
  $('#lo-choices', sheet).addEventListener('click', event => {
    const choice = event.target.closest('[data-choose]');
    if (!choice) return;
    setSlot(slot, choice.dataset.choose);
    ctx.closeSheet();
  });
  setTimeout(() => input.focus({ preventScroll: true }), 50);
}

function setSlot(slot, id) {
  if (slot.stratagem != null) env.loadout.st[slot.stratagem] = id;
  else env.loadout[slot.key] = id;
  env.onChange();
}

// --- Coverage ----------------------------------------------------------------------
const hitsText = (answer) => answer?.hits != null ? `${num(answer.hits)}${answer.unit || '발'}${answer.lowerBound ? '+' : ''}` : '';
const SLOT_NAMES = { primary: '주무기', secondary: '보조', throwable: '투척', stratagems: '스트라타젬' };
const magsText = answer => answer?.magazinesNeeded > 1 ? `탄창 ${num(answer.magazinesNeeded)}개` : '';

function answerLine(answer) {
  if (!answer) return html`<span class="faint">—</span>`;
  const outcome = answer.outcome ? outcomeOf({ outcome: answer.outcome, target: { resultLabel: answer.resultLabel } }) : null;
  return html`<span class="lo-answer">${thumb(answer.weaponId, 28)}<span><b>${nameOf(answer.weaponId)}</b>${answer.modeName ? html` <small>${answer.modeName}</small>` : ''}<br>
    <small>${answer.partName || ''}${answer.hits != null ? ` · ${hitsText(answer)}` : ''}${magsText(answer) ? ` · ${magsText(answer)}` : ''}${answer.assumption ? ' · 명중 수 가정' : ''}</small></span>${outcome ? badge(outcome.label, outcome.tone) : ''}${answer.conditional ? badge('조건부', 'conditional') : ''}</span>`;
}

function coverageSection(result, faction) {
  const rows = result.rows || [];
  const gaps = rows.filter(row => row.status !== 'route');
  const covered = rows.filter(row => row.status === 'route');
  return html`<div class="lo-summary">
      <div class="lo-score"><b>${covered.length}</b><span>/ ${rows.length} 대응</span></div>
      <p>${faction.name} 주요 적 ${rows.length}종 중 <b>${covered.length}종</b>은 현재 편성으로 확인된 처치 경로가 있습니다.${gaps.length ? html` <b style="color:var(--blocked)">${gaps.length}종</b>은 현재 계산 범위에서 처치 경로가 없습니다.` : ' 공백이 없습니다.'}</p>
    </div>
    ${gaps.length ? html`<div class="section-title"><h2>대응 공백</h2><p>편성 안의 계산 가능한 무기로는 확인된 처치 경로가 없는 적입니다.</p></div>
      <div class="lo-rows">${gaps.map(row => gapCard(row))}</div>` : ''}
    <div class="section-title"><h2>적별 대응</h2><p>각 적을 가장 적은 횟수로 처치하는 편성 속 무기입니다. 연사력·재장전·조준 난도는 반영하지 않습니다.</p></div>
    <div class="lo-rows">${covered.map(row => coveredCard(row))}</div>
    ${result.notComputable?.length ? html`<p class="faint" style="font-size:13px;margin-top:12px">계산하지 않은 편성 항목: ${result.notComputable.map(item => `${nameOf(item.id)}${item.reason ? ` (${item.reason})` : ''}`).join(' · ')}</p>` : ''}`;
}

function enemyHead(row) {
  const image = pickerEnemyImages[row.enemyId]?.src;
  return html`<a class="lo-enemy" href="#/enemy/${row.enemyId}" title="적 대응에서 자세히 보기">${image ? html`<img src="${image}" alt="" loading="lazy" decoding="async">` : html`<span></span>`}<b>${row.enemyName}</b></a>`;
}

// Other loadout slots that also answer this enemy, so a rifle that handles
// small enemies shows up even when a stratagem needs fewer hits.
function alsoLine(row) {
  const others = (row.perSlot || []).map(entry => entry.best)
    .filter(answer => answer?.status === 'route' && answer.weaponId !== row.best?.weaponId)
    .sort((a, b) => a.hits - b.hits);
  if (!others.length) return '';
  return html`<div class="lo-also"><small>그 밖에</small>${others.map(answer => html`<span class="lo-also-item">${thumb(answer.weaponId, 18)}${nameOf(answer.weaponId)} <b>${answer.partName} ${hitsText(answer)}</b></span>`)}</div>`;
}

function coveredCard(row) {
  return html`<article class="panel lo-row">${enemyHead(row)}<div class="lo-row-body">${answerLine(row.best)}${alsoLine(row)}</div></article>`;
}

// Suggestions arrive per slot; a stratagem appears once, aimed at the first
// empty stratagem slot (or the first slot when all four are taken).
function fixGroups(row) {
  const emptyIndex = env.loadout.st.findIndex(id => !id);
  const seen = new Set();
  const groups = new Map();
  for (const fix of row.fixes || []) {
    if (seen.has(fix.weaponId)) continue;
    seen.add(fix.weaponId);
    const stratagem = /^st\d$/.test(fix.slot);
    const slot = stratagem ? `st${emptyIndex >= 0 ? emptyIndex : 0}` : fix.slot;
    const title = stratagem ? (emptyIndex >= 0 ? '스트라타젬 추가' : '스트라타젬 1 교체') : `${SLOTS.find(item => item.key === fix.slot)?.label || ''} 교체`;
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push({ ...fix, slot });
  }
  return [...groups];
}

function gapCard(row) {
  const groups = fixGroups(row);
  return html`<article class="panel lo-row gap">${enemyHead(row)}
    <div class="lo-gap-body"><span class="badge blocked">처치 경로 없음</span>
      ${groups.length ? html`<div class="lo-fixes"><small>이렇게 바꾸면 대응 — 누르면 편성에 반영됩니다</small>${groups.map(([title, fixes]) => html`<div class="lo-fix-group"><span>${title}</span>${fixes.map(fix => html`<button type="button" class="chip lo-fix" data-fix-slot="${fix.slot}" data-fix-id="${fix.weaponId}">${thumb(fix.weaponId, 20)} ${nameOf(fix.weaponId)} <span class="count">${fix.partName ? `${fix.partName} ` : ''}${hitsText(fix)}</span></button>`)}</div>`)}</div>`
        : html`<small class="faint">같은 칸에서 바꿔 끼워 해결되는 후보가 없습니다.</small>`}
    </div></article>`;
}

// --- Render ------------------------------------------------------------------------
export async function renderLoadout(panel, options) {
  env = options; panelEl = panel;
  if (!core) core = await import('../../core/loadout.js');
  const factions = core.loadoutFactions;
  if (!factions.some(f => f.id === env.loadout.f)) env.loadout.f = factions[0].id;
  const faction = factions.find(f => f.id === env.loadout.f);
  const anyPicked = ['p', 's', 'g'].some(key => env.loadout[key]) || env.loadout.st.some(Boolean);
  const result = anyPicked ? core.loadoutView(env.loadout, faction.id, { shieldCleared: env.loadout.shield !== false }) : null;
  render(panel, html`
    <section class="panel lo-builder">
      <div class="lo-slots">${SLOTS.map(slotTile)}</div>
      <div class="lo-actions">
        <div class="segmented" role="group" aria-label="팩션">${factions.map(f => html`<button type="button" data-lo-faction="${f.id}" aria-pressed="${f.id === faction.id}" data-side="${f.id}">${f.name}</button>`)}</div>
        <label class="check lo-shield"><input type="checkbox" data-lo-shield ${env.loadout.shield !== false ? raw('checked') : ''}> 방패·보호막을 피한 상태로 계산</label>
        <span style="flex:1"></span>
        <button type="button" class="button small" data-lo-share ${anyPicked ? '' : 'disabled'}>${icon('arrow', 16)} 편성 링크 복사</button>
        <button type="button" class="button small ghost" data-lo-reset ${anyPicked ? '' : 'disabled'}>비우기</button>
      </div>
    </section>
    ${result ? coverageSection(result, faction) : html`<div class="empty lo-empty"><h3>장비를 골라 편성을 시작하세요</h3><p>칸을 눌러 무기와 스트라타젬을 담으면, ${faction.name} 주요 적마다 어떤 장비로 몇 번 만에 처치할 수 있는지와 대응 공백을 보여 줍니다.</p></div>`}
    <p class="faint" style="font-size:12.5px;margin-top:14px">서로 다른 무기를 섞어 쓰는 연계는 계산하지 않습니다. "처치 경로 없음"은 현재 계산 범위의 결과이며, 실제로 처치할 수 없다는 뜻은 아닙니다.</p>`);
  bind(panel);
}

function bind(panel) {
  if (panel.dataset.bound) return;
  panel.dataset.bound = '1';
  panel.addEventListener('change', event => {
    if (!event.target.matches('[data-lo-shield]') || !env) return;
    env.loadout.shield = event.target.checked;
    env.onChange();
  });
  panel.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target || !env) return;
    const slot = SLOTS.find(item => item.key === (target.dataset.slot || target.dataset.clear || target.dataset.fixSlot));
    if (target.dataset.slot) openPicker(slot);
    else if (target.dataset.clear) setSlot(slot, '');
    else if (target.dataset.fixSlot) setSlot(slot, target.dataset.fixId);
    else if (target.dataset.loFaction) { env.loadout.f = target.dataset.loFaction; env.onChange(); }
    else if (target.hasAttribute('data-lo-reset')) { Object.assign(env.loadout, { p: '', s: '', g: '', st: ['', '', '', ''] }); env.onChange(); }
    else if (target.hasAttribute('data-lo-share')) {
      navigator.clipboard?.writeText(location.href).then(() => env.ctx.toast('편성 링크를 복사했습니다.'), () => env.ctx.toast('주소창의 링크를 복사해 공유하세요.'));
    }
  });
}
