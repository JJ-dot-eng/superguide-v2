// Global search across stratagems, enemies, structures and faction guides.
import { stratagems, categoryOf } from '../core/catalog.js';
import { search, stratagemFields } from '../core/search.js';
import { html, render, $ } from './dom.js';

const LIMIT = 8;

export async function createPalette(ctx) {
  const [{ enemies }, { structures }, { factionGuides, factionSides }, { pickerEnemyImages, pickerStructureImages }, { wikiIcons }] = await Promise.all([
    import('../data/combat-data.js'), import('../data/demolition-data.js'), import('../data/faction-data.js'),
    import('../data/selector-images.js'), import('../data/wiki-icons.js'),
  ]);
  const groups = [
    { name: '스트라타젬', items: stratagems.map(item => ({ fields: stratagemFields(item), label: item.name, sub: `${categoryOf(item.category).name} · ${item.en}`, image: wikiIcons[item.id]?.src, route: { view: 'arsenal', id: item.id } })) },
    { name: '적', items: enemies.map(item => ({ fields: { names: [item.name, item.id.replaceAll('-', ' ')], text: [item.faction] }, label: item.name, sub: `${item.faction} · 무기별 탄수 비교`, image: pickerEnemyImages[item.id]?.src, route: { view: 'enemy', id: item.id } })) },
    { name: '시설', items: structures.map(item => ({ fields: { names: [item.name], text: [item.faction, item.tip] }, label: item.name, sub: `${item.faction} · 철거 방법`, image: pickerStructureImages[item.id]?.src, route: { view: 'demolition', query: { s: item.id } } })) },
    { name: '팩션', items: factionGuides.map(item => ({ fields: { names: [item.name, item.en], text: [item.intro] }, label: item.name, sub: `${factionSides.find(side => side.id === item.side).name} · 추천 장비`, image: factionSides.find(side => side.id === item.side).icon, route: { view: 'factions', id: item.id } })) },
  ];

  const dialog = $('#palette');
  const input = $('#palette-input');
  const list = $('#palette-results');
  let results = [];
  let active = 0;

  function run() {
    const query = input.value.trim();
    const shown = groups.map(group => ({ name: group.name, items: query ? search(group.items, query, item => item.fields).slice(0, LIMIT) : group.name === '적' || group.name === '스트라타젬' ? group.items.slice(0, 4) : [] }))
      .filter(group => group.items.length);
    results = shown.flatMap(group => group.items);
    active = 0;
    let index = -1;
    render(list, results.length ? shown.map(group => html`<li class="group" role="presentation">${query ? group.name : `${group.name} · 예시`}</li>${group.items.map(item => { index++; return html`<li role="option" id="pal-${index}" data-index="${index}" aria-selected="${index === active}">
      ${item.image ? html`<img class="thumb" src="${item.image}" alt="" loading="lazy">` : html`<span class="thumb"></span>`}<span class="label"><b>${item.label}</b><span>${item.sub}</span></span></li>`; })}`)
      : html`<li class="none">‘${query}’ 검색 결과가 없습니다.</li>`);
    input.setAttribute('aria-activedescendant', results.length ? 'pal-0' : '');
  }
  function move(step) {
    if (!results.length) return;
    active = (active + step + results.length) % results.length;
    for (const option of list.querySelectorAll('[role="option"]')) option.setAttribute('aria-selected', String(Number(option.dataset.index) === active));
    list.querySelector(`#pal-${active}`)?.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', `pal-${active}`);
  }
  function choose(index) {
    const item = results[index];
    if (!item) return;
    dialog.close();
    ctx.go(item.route);
  }

  input.addEventListener('input', run);
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(active); }
    // A search input would swallow the first Esc to clear itself; close right away.
    else if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
  });
  list.addEventListener('click', event => {
    const option = event.target.closest('[role="option"]');
    if (option) choose(Number(option.dataset.index));
  });
  list.addEventListener('pointermove', event => {
    const option = event.target.closest('[role="option"]');
    if (option && Number(option.dataset.index) !== active) move(Number(option.dataset.index) - active);
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

  return {
    open() {
      input.value = '';
      run();
      dialog.showModal();
      input.focus();
    },
  };
}
