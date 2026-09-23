// WebMCP tool for in-browser agents: filters the visible catalogue. The name
// and input schema match the previous site so existing agent setups keep working.
import { categories, apBands, stratagems } from '../core/catalog.js';
import { search, stratagemFields } from '../core/search.js';

const PENETRATION = { all: '', tank: 'tank', heavy: 'heavy', medium: 'medium', light: 'light', none: 'utility', unknown: 'unknown' };

export function registerCatalogTool(ctx) {
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  return Promise.resolve(document.modelContext.registerTool({
    name: 'filter_stratagem_catalog',
    title: '스트라타젬 도감 필터',
    description: '종류, 검색어, 관통 등급으로 화면의 스트라타젬 도감 목록을 좁힙니다.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['all', ...categories.map(item => item.id)] },
        query: { type: 'string', maxLength: 200 },
        penetration: { type: 'string', enum: Object.keys(PENETRATION) },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['category', 'query', 'penetration'].includes(key))) {
        throw new Error('필터는 category, query, penetration만 포함한 객체여야 합니다.');
      }
      const { category = 'all', query = '', penetration = 'all' } = input;
      if (!(category === 'all' || categories.some(item => item.id === category)) || !(penetration in PENETRATION) || typeof query !== 'string' || query.length > 200) {
        throw new Error('유효하지 않은 종류, 검색어 또는 관통 등급입니다.');
      }
      const c = category === 'all' ? '' : category;
      const ap = PENETRATION[penetration];
      ctx.go({ view: 'arsenal', query: { c, ap, q: query } });
      const band = apBands.find(item => item.id === ap);
      const items = search(stratagems.filter(item => (!c || item.category === c) && (!band || band.test(item))), query, stratagemFields);
      return { count: items.length, items: items.map(({ id, name, category: kind, ap: value }) => ({ id, name, category: kind, ap: value })) };
    },
  }, { signal: lifecycle.signal }));
}
