// The stratagem catalogue: every entry from the data files, in category order,
// with the few fields the data leaves implicit filled in.
import { support } from '../data/data-support.js';
import { orbitals, eagles } from '../data/data-offense.js';
import { backpacks, defense, vehicles } from '../data/data-equipment.js';
import { missions } from '../data/data-mission.js';

export const CHECKED_AT = '2026-09-16';

export const categories = [
  { id: 'support', name: '지원 무기', hint: '직접 들고 싸우는 세 번째 무기', color: 'var(--c-support)' },
  { id: 'orbital', name: '궤도 지원', hint: '구축함이 내려보내는 포격', color: 'var(--c-orbital)' },
  { id: 'eagle', name: '이글', hint: '짧은 간격의 근접 항공 지원', color: 'var(--c-eagle)' },
  { id: 'defense', name: '방어 설비', hint: '센트리·설치 무기·보호막', color: 'var(--c-defense)' },
  { id: 'backpack', name: '배낭', hint: '생존·기동·보급', color: 'var(--c-backpack)' },
  { id: 'vehicle', name: '차량·엑소슈트', hint: '타고 싸우는 장비', color: 'var(--c-vehicle)' },
  { id: 'mission', name: '임무·공용', hint: '보급과 임무 목표', color: 'var(--c-mission)' },
];
export const categoryOf = id => categories.find(item => item.id === id);

const wiki = title => `https://helldivers.wiki.gg/wiki/${title.replaceAll(' ', '_')}`;
const groups = { support, orbital: orbitals, eagle: eagles, defense, backpack: backpacks, vehicle: vehicles, mission: missions };

export const stratagems = Object.entries(groups).flatMap(([category, items]) => items.map(item => ({
  category,
  direct: null, splash: null, ap: null, range: null, radius: null,
  source: wiki(item.en),
  ...item,
})));
export const stratagemById = new Map(stratagems.map(item => [item.id, item]));

// Armor penetration bands used for filtering and labels.
export const apBands = [
  { id: 'tank', name: '대전차', test: item => item.ap >= 5, label: 'AP 5+' },
  { id: 'heavy', name: '중장갑', test: item => item.ap === 4, label: 'AP 4' },
  { id: 'medium', name: '일반 장갑', test: item => item.ap === 3, label: 'AP 3' },
  { id: 'light', name: '경장갑', test: item => item.ap != null && item.ap <= 2, label: 'AP ≤2' },
  { id: 'utility', name: '지원용', test: item => Boolean(item.utility), label: '피해 없음' },
  { id: 'unknown', name: '미확인', test: item => item.ap == null && !item.utility, label: 'AP ?' },
];
export const apBandOf = item => apBands.find(band => band.test(item));
