// Enemy-first combat view: pick an enemy, see every support weapon ranked by
// its quickest verified route, then open any weapon for part-by-part detail.
import { enemies, weaponProfiles, unsupportedWeapons, combatCheckedAt, damageSource } from '../../data/combat-data.js';
import { pickerEnemyImages } from '../../data/selector-images.js';
import { combatImages } from '../../data/combat-images.js';
import { wikiIcons } from '../../data/wiki-icons.js';
import { stratagems, stratagemById } from '../../core/catalog.js';
import { solveMatchup, withHitAssumption, spearCannotLock, partPool } from '../../core/combat.js';
import { wikiReference } from '../../core/factions.js';
import { search } from '../../core/search.js';
import { num, pct, unitOf, outcomeOf, countText, attackStats, assumptionText, aimText, routeNotes, assumptionSummary, assumptionTag, deliveryOf } from '../../core/explain.js';
import { html, raw, render, $, $$, icon, badge, external } from '../dom.js';

const FACTIONS = ['테르미니드', '오토마톤', '일루미닛'];
const DEFAULT_ENEMY = 'charger';
const supportWeapons = stratagems.filter(item => item.category === 'support' && (weaponProfiles[item.id] || unsupportedWeapons[item.id]));
const enemyById = new Map(enemies.map(enemy => [enemy.id, enemy]));

let root, ctx;
const state = { enemy: DEFAULT_ENEMY, weapon: null, mode: null, shield: true, faction: '', q: '', assume: { hitCount: '', primaryHit: 'blast', bombletDirect: false }, pickerOpen: false };

// --- Ranking ----------------------------------------------------------------------
const rankCache = new Map();
function rankWeapons(enemy, shieldCleared) {
  const key = `${enemy.id}|${shieldCleared}`;
  if (rankCache.has(key)) return rankCache.get(key);
  const entries = supportWeapons.map((weapon, order) => {
    const profile = weaponProfiles[weapon.id];
    if (!profile) return { weapon, order, status: 'unsupported', reason: unsupportedWeapons[weapon.id] };
    const tries = profile.modes.map(mode => {
      if (mode.unsupported) return { mode, status: 'unsupported', reason: mode.unsupported };
      if (mode.hitCondition) return { mode, status: 'assume' };
      const { best, rows } = solveMatchup(enemy, mode, { shieldCleared });
      return { mode, status: best ? 'route' : 'none', best, rows };
    });
    const routes = tries.filter(item => item.status === 'route').sort((a, b) => a.best.hits - b.best.hits || Number(a.best.outcome !== 'kill') - Number(b.best.outcome !== 'kill'));
    const pick = routes[0] || tries.find(item => item.status === 'assume') || tries.find(item => item.status === 'none') || tries[0];
    return { weapon, order, profile, ...pick, spear: spearCannotLock(enemy, pick.mode), reference: wikiReference(enemy, weapon.id, pick.mode) };
  });
  const tier = entry => ({ route: 0, assume: 1, none: 2, unsupported: 3 })[entry.status];
  entries.sort((a, b) => tier(a) - tier(b) || (a.status === 'route' ? a.best.hits - b.best.hits || Number(a.best.outcome !== 'kill') - Number(b.best.outcome !== 'kill') : 0) || a.order - b.order);
  rankCache.set(key, entries);
  return entries;
}

// --- Pieces -------------------------------------------------------------------------
const portrait = (enemy, cls = '', eager = false) => {
  const image = pickerEnemyImages[enemy.id];
  return image?.src ? html`<img class="${cls}" src="${image.src}" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async">` : html`<span class="${cls}"></span>`;
};
const weaponIcon = (id, size = 34) => html`<img class="strat-icon" style="width:${size}px;height:${size}px" src="${wikiIcons[id]?.src}" alt="" width="${size}" height="${size}" loading="lazy">`;

function renderPicker() {
  const q = state.q;
  let list = enemies.filter(enemy => !state.faction || enemy.faction === state.faction);
  if (q) list = search(list, q, enemy => ({ names: [enemy.name, enemy.id.replaceAll('-', ' ')], text: [enemy.faction] }));
  const groups = q ? [['검색 결과', list]] : FACTIONS.map(faction => [faction, list.filter(enemy => enemy.faction === faction)]).filter(([, items]) => items.length);
  render($('#enemy-list', root), groups.length && list.length ? groups.map(([name, items]) => html`
    <div class="picker-group" data-faction="${name}">${name} · ${items.length}</div>
    ${items.map(enemy => html`<button class="picker-item" type="button" data-enemy="${enemy.id}" aria-current="${enemy.id === state.enemy}">${portrait(enemy)}<span>${enemy.name}${enemy.id.startsWith('voteless-') ? html`<small>체형별 수치 · 공통 이미지</small>` : ''}</span></button>`)}`)
    : html`<p class="empty" style="padding:24px 8px">찾는 적이 없습니다.</p>`);
  for (const button of $$('[data-faction-filter]', root)) button.setAttribute('aria-pressed', String(button.dataset.factionFilter === state.faction));
  $('.picker', root).classList.toggle('collapsed', !state.pickerOpen);
  $('#picker-current', root).textContent = enemyById.get(state.enemy).name;
}

function hero(enemy) {
  const m = enemy.main;
  const vitals = [
    ['본체 체력', num(m.hp)], ['본체 장갑', m.armor], ['내구도', pct(m.durability)], ['폭발 저항', pct(m.exdr)],
    ...(m.constitution ? [['출혈 여유', num(m.constitution)]] : []),
  ];
  return html`<section class="panel enemy-hero" data-faction="${enemy.faction}">
    ${portrait(enemy, '', true)}
    <div><span class="faction-tag">${enemy.faction}</span><h1>${enemy.name}</h1>
      <div class="vitals">${vitals.map(([label, value]) => html`<span>${label}<b>${value}</b></span>`)}</div>
      <p class="note">${enemy.note}</p>
    </div>
  </section>
  ${enemy.shield ? html`<label class="toggle" style="margin-top:12px"><input type="checkbox" data-shield ${state.shield ? raw('checked') : ''}>
    <div><b>${icon('shield', 16)} ${enemy.shield.label || (enemy.shield.kind === 'energy' ? '보호막을 제거한 상태로 계산' : '방패를 피해 부위에 닿는 상태로 계산')}</b>
    <span>${enemy.shield.kind === 'energy' ? '보호막' : '방패'} ${enemy.shield.infiniteHealth ? '파괴 불가' : `체력 ${num(enemy.shield.hp)}`}${Number.isFinite(enemy.shield.armor) ? ` · 장갑 ${enemy.shield.armor}` : ''}. ${enemy.shield.note} 제거·우회에 드는 공격은 횟수에 포함하지 않습니다.</span></div></label>` : ''}`;
}

function rankRow(entry, selected) {
  const { weapon, status } = entry;
  const unit = unitOf(entry.mode).unit;
  const multi = entry.profile?.modes.length > 1;
  let part = '', hits = html`<span class="hits dim">—</span>`, tag = '';
  if (status === 'route') {
    const outcome = outcomeOf(entry.best);
    const aside = entry.reference ? `위키 전술: ${entry.reference.target} ${entry.reference.hits}${unit}`
      : entry.spear ? '직접 락온 불가 · 참고값'
      : assumptionTag(entry.mode);
    part = html`<span>${entry.best.target.name}</span>${aside ? html`<small>${aside}</small>` : ''}`;
    hits = html`<span class="hits">${num(entry.best.hits)}<small>${unit}${entry.best.lowerBound ? '+' : ''}</small></span>`;
    tag = badge(outcome.label, outcome.tone);
  } else if (status === 'assume') {
    part = html`<span class="faint">명중 수 가정 필요</span>`; tag = badge('가정 선택', 'unknown');
  } else if (status === 'none') {
    const blocked = entry.rows.every(row => ['blocked', 'shield'].includes(row.outcome) || row.hits != null);
    part = html`<span class="faint">${blocked ? '확인된 처치 경로 없음' : '일부 부위 자료 미확인'}</span>`; tag = badge(blocked ? '처치 경로 없음' : '계산 보류', blocked ? 'blocked' : 'unknown');
  } else {
    part = html`<span class="faint">정밀 계산 미지원</span>`; tag = badge('미지원', 'unknown');
  }
  return html`<button class="rank-row" type="button" data-weapon="${weapon.id}" data-mode="${entry.mode?.id || ''}" aria-current="${selected}">
    ${weaponIcon(weapon.id)}
    <span class="w"><b>${weapon.name}</b><small>${multi || entry.mode?.id !== 'standard' ? entry.mode?.name || '' : weapon.code || ''}</small></span>
    <span class="part">${part}</span>${hits}${tag}
  </button>`;
}

function ranking(enemy, entries, selectedId) {
  const main = entries.filter(entry => entry.status === 'route' || entry.status === 'assume');
  const rest = entries.filter(entry => !main.includes(entry));
  return html`<div class="section-title"><h2>무기별 최소 횟수</h2><p>지원 무기 ${entries.length}종 · 가장 빠른 확인된 경로 기준. 연사력·재장전·조준 난도는 반영하지 않습니다.</p></div>
  <div class="panel ranking">
    <div class="rank-head" aria-hidden="true"><span></span><span>무기</span><span>노릴 부위</span><span>횟수</span><span>결과</span></div>
    ${main.map(entry => rankRow(entry, entry.weapon.id === selectedId))}
    ${rest.length ? html`<details class="rank-more" ${rest.some(entry => entry.weapon.id === selectedId) ? raw('open') : ''}><summary>처치 경로가 없거나 계산하지 않은 무기 ${rest.length}종</summary>${rest.map(entry => rankRow(entry, entry.weapon.id === selectedId))}</details>` : ''}
  </div>`;
}

// --- Matchup detail -----------------------------------------------------------------------
function photoButton(enemy, target) {
  const photo = combatImages[enemy.id]?.[target.id]?.find(item => item.stage === 'initial');
  if (!photo) return html`<span class="part-photo" style="cursor:default;display:grid;place-items:center;font-size:11.5px;color:var(--text-3);text-align:center">부위 사진<br>없음</span>`;
  const tw = photo.thumbnailWidth || 320, th = photo.thumbnailHeight || 213;
  const [x, y, w, h] = photo.thumbnailCrop || [0, 0, tw, th];
  const style = `width:${tw / w * 100}%;height:${th / h * 100}%;left:${-x / w * 100}%;top:${-y / h * 100}%`;
  return html`<button class="part-photo" type="button" data-photo="${target.id}" style="aspect-ratio:${w}/${h}" aria-label="${enemy.name} ${target.name} 위치 사진 크게 보기">
    <img src="${photo.thumbnail}" alt="" width="${tw}" height="${th}" loading="lazy" decoding="async" style="${style}"><span class="zoom">${icon('expand', 14)}</span></button>`;
}

function stageLines(row, enemy, mode) {
  const main = row.target.main || enemy.main;
  let part = row.target;
  return row.stages.map((stage, index) => {
    const events = stage.events || [];
    const lines = events.map(event => {
      const d = event.damage;
      const who = event.name ? html`<b>${event.name}${event.times > 1 ? ` ×${event.times}` : ''}</b> ` : '';
      const blasts = d.blasts.map(blast => blast.excluded ? html`<br><span class="faint">${blast.name}: 장치는 폭발 면역 → 0</span>`
        : html`<br><span>${blast.name}: AP ${num(blast.effectiveAp)} → ${blast.redirected ? '본체' : '부위'} 장갑 ${num(blast.armor)}, 폭발 저항 ${pct(blast.exdr)} → <code>${num(blast.redirected ? blast.toMain : blast.toPart)}</code>${blast.redirected ? ' (본체로)' : ''}</span>`);
      return html`<div>${who}${deliveryOf(event.attack).hit} <code>${num(d.direct)}</code> · 부위 폭발 <code>${num(d.explosion)}</code>${d.mainExplosion ? html` · 본체 폭발 <code>${num(d.mainExplosion)}</code>` : ''}${blasts}</div>`;
    });
    const transfer = part.partOnly ? '독립 장치 — 본체 전달 없음' : `본체 전달 ${num(part.toMain)}%${part.overflowCap == null ? ' · 상한 미확인' : part.overflowCap ? ` · 누적 상한 ${num(partPool(part) + (part.constitution || 0) + (part.transferExtraHealth || 0))}` : ' · 상한 없음'}`;
    const beam = Number.isFinite(stage.contactSeconds) ? html`<div>광선 접촉 약 <code>${num(stage.contactSeconds)}초</code> · 부위 누적 <code>${num(stage.partTotal)}</code> · 본체 전달 <code>${num(stage.mainTotal)}</code></div>` : '';
    const header = html`<b>${stage.part.name}</b> — 체력 ${num(partPool(stage.part))}, 장갑 ${num(stage.part.armor)}, 내구도 ${pct(stage.part.durability)}${row.stages.length > 1 ? html` → <b>${num(stage.hits)}${unitOf(mode).unit}</b>` : ''}`;
    part = part.next;
    return html`<li>${header}${lines}${beam}<div class="faint">${transfer}${index === 0 ? ` · 본체 체력 ${num(main.hp)}` : ''}</div></li>`;
  });
}

function partCard(row, enemy, mode, isBest) {
  const target = row.target;
  const outcome = outcomeOf(row);
  const count = countText(row, mode);
  const notes = routeNotes(row, mode);
  const next = target.next;
  const stat = (label, value, nextValue) => html`<div><dt>${label}</dt><dd>${value}${nextValue != null && nextValue !== value ? html` <span class="faint">→ ${nextValue}</span>` : ''}</dd></div>`;
  return html`<article class="panel part-card" ${isBest ? raw('data-best') : ''}>
    <div class="part-top">
      <div><h3>${target.name} ${badge(outcome.label, outcome.tone)}${isBest ? badge('최단', 'accent') : ''}${row.conditional ? badge('선행 조건', 'conditional') : ''}</h3>
        <div class="part-count ${count ? '' : 'none'}">${count ? html`<b>${num(row.hits)}</b><span>${unitOf(mode).unit}${row.lowerBound ? ' 이상 · 재생 제외' : ''}${target.prerequisite ? ` · ${target.prerequisite} 후` : ''}</span>` : html`<b>${row.outcome === 'blocked' ? '관통 불가' : row.outcome === 'shield' ? '보호막부터' : '계산 보류'}</b>`}</div></div>
      ${photoButton(enemy, target)}
    </div>
    <dl class="part-stats">
      ${stat('체력', target.hp == null ? '미확인' : num(partPool(target)) + (target.mainOnly ? ' (본체)' : ''), next ? num(partPool(next)) : null)}
      ${stat('장갑', num(target.armor), next ? num(next.armor) : null)}
      ${stat('내구도', pct(target.durability), next ? pct(next.durability) : null)}
      ${stat('폭발 저항', pct(target.exdr))}
    </dl>
    <div class="aim">${aimText(row, mode).map((line, index) => html`<p>${index === 0 ? '' : '· '}${line}</p>`)}</div>
    ${notes.length ? html`<ul class="notes">${notes.map(note => html`<li>${note}</li>`)}</ul>` : ''}
    ${row.stages.length ? html`<details class="disclosure"><summary>${unitOf(mode).one} 피해 계산 과정</summary><div class="calc"><ol>${stageLines(row, enemy, mode)}</ol></div></details>` : ''}
  </article>`;
}

function wikiReferenceBlock(reference, unit) {
  if (!reference) return '';
  const x = reference.explanation;
  return html`<div class="callout info wiki-ref"><h3>위키 전술: ${reference.target} 명중 시 ${num(reference.hits)}${unit} ${outcomeOf({ outcome: reference.outcome, target: {} }).label}</h3>
    <p>${reference.note}</p>
    ${x ? html`<details class="disclosure" style="margin-top:8px"><summary>왜 가능한가 — 여러 부위 동시 피격 가정</summary><div>
      <p>${x.intro}</p><ul class="notes">${x.attacks.map(item => html`<li>${item}</li>`)}</ul>
      <table><thead><tr><th>피격 부위</th><th>전달 계산</th><th>본체 피해</th></tr></thead><tbody>${x.rows.map(item => html`<tr><td>${item.part}</td><td>${item.formula}</td><td>${num(item.mainDamage)}</td></tr>`)}</tbody>
      <tfoot><tr><th colspan="2">가정 합계 (실측 아님)</th><td>${num(x.total)}</td></tr></tfoot></table>
      <ul class="notes">${x.notes.map(item => html`<li>${item}</li>`)}</ul>
      <p class="sources">${x.sources.map(source => external(source.url, source.label))}</p></div></details>` : ''}
    <p class="sources" style="margin-top:6px">${external(reference.source, '위키 전술 설명')} · 확인 ${reference.checkedAt}</p>
  </div>`;
}

function assumptionControls(mode) {
  const c = mode.hitCondition;
  if (!c) return '';
  const unit = c.kind === 'arcs' ? '회' : '개';
  const options = Array.from({ length: c.max - c.min + 1 }, (_, i) => c.min + i);
  return html`<div class="assumptions">
    <label>${c.kind === 'arcs' ? '한 발당 이 부위 전격 명중 수' : '한 발당 이 부위 자탄 명중 수'}
      <select class="select" data-assume="hitCount"><option value="">선택하세요</option>${options.map(n => html`<option value="${n}" ${String(n) === String(state.assume.hitCount) ? raw('selected') : ''}>${n}${unit}</option>`)}</select></label>
    ${c.kind === 'bomblets' ? html`<label>주탄
      <select class="select" data-assume="primaryHit">${[['blast', '주탄 폭발만'], ['direct', '주탄 직격 + 폭발'], ['none', '주탄 피해 없음']].map(([value, name]) => html`<option value="${value}" ${state.assume.primaryHit === value ? raw('selected') : ''}>${name}</option>`)}</select></label>
      <label class="check"><input type="checkbox" data-assume="bombletDirect" ${state.assume.bombletDirect ? raw('checked') : ''} ${Number(state.assume.hitCount) > 0 ? '' : raw('disabled')}> 자탄 직격도 포함</label>` : ''}
    <p>실제 명중 수는 확인된 자료가 없어 직접 고르는 가정입니다. ${assumptionSummary(withHitAssumption(mode, state.assume))}</p>
  </div>`;
}

function verdict(enemy, weapon, mode, matchup, reference) {
  const unit = unitOf(mode).unit;
  const label = html`<span class="label">${enemy.name} × ${weapon.name}${mode ? ` · ${mode.name}` : ''}</span>`;
  if (!mode || mode.unsupported) {
    return html`<div class="verdict">${label}<h3>이 ${mode ? '모드' : '무기'}는 정밀 계산을 지원하지 않습니다</h3><p>${mode?.unsupported || unsupportedWeapons[weapon.id] || '이 무기의 부위별 피해 조건을 아직 검증하지 않았습니다.'} 처치할 수 없다는 뜻은 아닙니다.</p></div>`;
  }
  if (mode.hitCondition && !mode.assumption) return html`<div class="verdict">${label}<h3>명중 수 가정을 먼저 고르세요</h3><p>${assumptionText(mode)}</p></div>`;
  const spear = spearCannotLock(enemy, mode);
  const best = matchup.best;
  if (best) {
    const outcome = outcomeOf(best);
    return html`<div class="verdict" data-tone="${outcome.tone}">${label}
      <h3><span class="big">${num(best.hits)}${unit}</span>${best.lowerBound ? ' 이상' : ''} · ${best.target.name} · ${outcome.label}</h3>
      <p>${best.stages.length > 1 ? best.stages.map(stage => `${stage.part.name} ${num(stage.hits)}${unit}`).join(' → ') + ' · ' : ''}${best.target.tip}</p>
      ${spear ? html`<p style="color:var(--bleed)">스피어는 이 적에게 직접 락온할 수 없습니다. 다른 표적으로 쏜 미사일이 이 부위에 맞았을 때의 참고값입니다.</p>` : ''}
      ${best.lowerBound ? html`<p>${best.notes[0]}</p>` : ''}
    </div>`;
  }
  const allShield = matchup.rows.every(row => row.outcome === 'shield');
  if (allShield) return html`<div class="verdict">${label}<h3>보호막(방패)을 먼저 처리해야 합니다</h3><p>${enemy.shield.note} 위의 체크를 켜면 제거한 뒤의 횟수를 보여 줍니다.</p></div>`;
  const pending = matchup.rows.some(row => row.outcome === 'unknown');
  return html`<div class="verdict">${label}<h3>${pending ? '일부 부위는 자료가 없어 계산을 보류했습니다' : reference ? '단일 부위로는 처치 경로가 없습니다' : '확인된 부위에서 바로 처치하는 경로가 없습니다'}</h3>
    <p>${matchup.rows.some(row => row.conditional && row.outcome === 'kill') ? '아래에서 선행 조건이 붙은 경로를 확인하세요.' : '아래에서 관통 가능한 부위와 부위 파괴 결과를 확인하세요.'} 이 결과만으로 처치 불가능하다고 단정하지는 않습니다.</p></div>`;
}

function matchupSection(enemy, entries) {
  const weapon = stratagemById.get(state.weapon) || entries[0].weapon;
  const profile = weaponProfiles[weapon.id];
  // An explicit mode wins; otherwise show the weapon's best-ranked mode.
  const rawMode = profile?.modes.find(mode => mode.id === state.mode) || entries.find(entry => entry.weapon.id === weapon.id)?.mode || profile?.modes[0];
  const mode = withHitAssumption(rawMode, state.assume);
  const matchup = solveMatchup(enemy, mode, { shieldCleared: state.shield });
  const reference = wikiReference(enemy, weapon.id, mode);
  const stats = attackStats(mode);
  const notes = [mode?.falloff && '거리 감쇠가 있어 표시 횟수는 근거리 최대 피해 기준입니다.', mode?.note, profile?.note].filter(Boolean);
  return html`<section class="matchup" id="matchup">
    <div class="section-title" style="margin-bottom:0"><h2>부위별 계산</h2><p>${assumptionText(mode)}</p></div>
    <div class="panel" style="padding:16px;display:grid;gap:12px">
      <div class="matchup-head">${weaponIcon(weapon.id, 44)}<div><h2>${weapon.name}</h2><a class="ext" href="#/arsenal/${weapon.id}">도감에서 보기</a></div>
        ${profile?.modes.length > 1 ? html`<div class="segmented" role="group" aria-label="${profile.modes.some(item => item.beam) ? '거리' : '발사 모드'}">${profile.modes.map(item => html`<button type="button" data-mode-pick="${item.id}" aria-pressed="${item.id === rawMode?.id}">${item.name}</button>`)}</div>` : ''}</div>
      ${stats.length ? html`<div class="stat-chips">${stats.map(stat => html`<div class="stat-chip"><span>${stat.label}</span><b>${stat.value}</b>${stat.note ? html`<small>${stat.note}</small>` : ''}</div>`)}</div>` : ''}
      ${notes.length ? html`<ul class="notes">${notes.map(note => html`<li>${note}</li>`)}</ul>` : ''}
    </div>
    ${mode ? assumptionControls(mode) : ''}
    ${verdict(enemy, weapon, mode, matchup, reference)}
    ${wikiReferenceBlock(reference, unitOf(mode).unit)}
    ${mode && !mode.unsupported ? html`<div class="parts">${matchup.rows.map(row => partCard(row, enemy, mode, row === matchup.best))}</div>` : ''}
    <p class="sources">${external(enemy.source, '적 부위 수치')} ${external(profile?.source || weapon.source, '무기 수치')} ${profile?.extraSource ? external(profile.extraSource, '광선 세부 수치') : ''} ${external(damageSource, '피해 계산 규칙')}
      <span>적 자료 ${enemy.checkedAt || combatCheckedAt} · 무기 자료 ${profile?.checkedAt || combatCheckedAt} 확인</span></p>
  </section>`;
}

function renderMain({ scrollToMatchup = false } = {}) {
  const enemy = enemyById.get(state.enemy);
  const entries = rankWeapons(enemy, state.shield);
  const selected = state.weapon || entries[0].weapon.id;
  render($('#enemy-main', root), html`${hero(enemy)}${ranking(enemy, entries, selected)}${matchupSection(enemy, entries)}`);
  renderPicker();
  if (scrollToMatchup) $('#matchup', root)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function syncUrl() {
  ctx.replace({ view: 'enemy', id: state.enemy, query: { w: state.weapon, m: state.weapon ? state.mode : null, shield: state.shield ? null : '0' } });
}

function openPhotos(targetId) {
  const enemy = enemyById.get(state.enemy);
  const target = enemy.parts.find(part => part.id === targetId);
  const photos = combatImages[enemy.id]?.[targetId] || [];
  ctx.openSheet(html`<div class="sheet-top"><span>부위 위치</span><button class="icon-button" type="button" data-close aria-label="닫기">${icon('close', 18)}</button></div>
    <div class="sheet-content image-viewer"><h2 id="sheet-title" style="font-size:20px">${enemy.name} · ${target.name}</h2><p class="muted">${target.tip}${enemy.id === 'harvester' ? ' 좌우는 적의 몸 기준입니다.' : ''}</p>
    ${photos.map(photo => { const caption = photo.caption || (target.next ? (photo.stage === 'initial' ? '① 장갑이 남아 있는 상태' : '② 장갑을 벗긴 뒤 드러난 부위') : target.name);
      return html`<figure><figcaption>${caption}</figcaption><img src="${photo.src}" alt="${enemy.name} ${caption} — 색칠된 영역이 조준 부위" width="${photo.width}" height="${photo.height}" decoding="async"><span class="sources">${external(photo.source, '위키 원본 이미지')}</span></figure>`; })}</div>`, { label: `${enemy.name} ${target.name} 사진` });
}

// --- Lifecycle ----------------------------------------------------------------------------------
export function mount(container, context) {
  root = container; ctx = context;
  const families = new Set(enemies.map(enemy => enemy.family || enemy.id)).size;
  render(root, html`<div class="page-head"><div><div class="eyebrow">Target Analysis</div><h1>적 대응</h1><p>적을 고르면 지원 무기 전체를 필요 횟수 순으로 비교합니다. 무기를 누르면 부위별 계산이 열립니다.</p></div>
    <span class="badge outline">적 ${families}종 · 계산 무기 ${Object.keys(weaponProfiles).length}종</span></div>
  <div class="enemy-layout">
    <aside class="panel picker" aria-label="적 선택">
      <div class="picker-head">
        <button class="button picker-toggle" type="button" data-picker-toggle aria-expanded="false">${icon('enemy', 18)} <span id="picker-current"></span><span class="faint" style="margin-left:auto">적 바꾸기</span></button>
        <label class="field">${icon('search', 16)}<span class="sr-only">적 검색</span><input class="input" id="enemy-q" type="search" placeholder="적 이름 검색" autocomplete="off" style="height:38px"></label>
        <div class="segmented" role="group" aria-label="진영"><button type="button" data-faction-filter="">전체</button>${FACTIONS.map(faction => html`<button type="button" data-faction-filter="${faction}">${faction}</button>`)}</div>
      </div>
      <div class="picker-list" id="enemy-list"></div>
    </aside>
    <div id="enemy-main"></div>
  </div>`);

  const input = $('#enemy-q', root);
  input.addEventListener('input', () => { state.q = input.value; renderPicker(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { const first = $('[data-enemy]', root); if (first) first.click(); }
  });
  root.addEventListener('change', event => {
    const target = event.target;
    if (target.matches('[data-shield]')) { state.shield = target.checked; renderMain(); syncUrl(); }
    if (target.dataset.assume) {
      const key = target.dataset.assume;
      state.assume[key] = target.type === 'checkbox' ? target.checked : target.value;
      if (key === 'hitCount' && !(Number(target.value) > 0)) state.assume.bombletDirect = false;
      renderMain();
    }
  });
  root.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.enemy) {
      state.pickerOpen = false;
      ctx.go({ view: 'enemy', id: target.dataset.enemy, query: { w: state.weapon, m: state.weapon ? state.mode : null, shield: state.shield ? null : '0' } });
    } else if (target.dataset.factionFilter != null) { state.faction = target.dataset.factionFilter; renderPicker(); }
    else if (target.hasAttribute('data-picker-toggle')) { state.pickerOpen = !state.pickerOpen; target.setAttribute('aria-expanded', String(state.pickerOpen)); renderPicker(); if (state.pickerOpen) input.focus(); }
    else if (target.dataset.weapon) {
      if (state.weapon !== target.dataset.weapon) resetAssumption();
      state.weapon = target.dataset.weapon; state.mode = target.dataset.mode || null;
      renderMain({ scrollToMatchup: true }); syncUrl();
    } else if (target.dataset.modePick) {
      state.weapon ||= selectedWeaponId(); state.mode = target.dataset.modePick; resetAssumption(); renderMain(); syncUrl();
    } else if (target.dataset.photo) openPhotos(target.dataset.photo);
  });
}
const resetAssumption = () => { state.assume = { hitCount: '', primaryHit: 'blast', bombletDirect: false }; };
const selectedWeaponId = () => rankWeapons(enemyById.get(state.enemy), state.shield)[0].weapon.id;

export function update(route) {
  const enemy = enemyById.has(route.id) ? route.id : state.enemy || DEFAULT_ENEMY;
  const weapon = supportWeapons.some(item => item.id === route.query.w) ? route.query.w : null;
  const modes = weaponProfiles[weapon]?.modes || [];
  if (weapon !== state.weapon) resetAssumption();
  const switched = state.shown && enemy !== state.enemy;
  Object.assign(state, {
    enemy, weapon, shown: true,
    mode: modes.some(mode => mode.id === route.query.m) ? route.query.m : weapon ? state.weapon === weapon ? state.mode : null : null,
    shield: route.query.shield !== '0',
  });
  renderMain();
  if (route.id !== enemy) syncUrl();
  // After picking another enemy, bring its summary into view.
  const main = $('#enemy-main', root);
  if (switched && main.getBoundingClientRect().top < 0) main.scrollIntoView({ block: 'start' });
}

