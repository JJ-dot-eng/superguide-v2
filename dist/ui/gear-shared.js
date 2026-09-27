// Shared lookups for the gear tab and its loadout check (kept apart so the two
// view modules never import each other).
import { personalWeapons } from '../data/personal-weapons.js';

export const GROUPS = [
  { id: 'primary', name: '주무기', color: 'var(--g-primary)' },
  { id: 'secondary', name: '보조무기', color: 'var(--g-secondary)' },
  { id: 'throwable', name: '투척', color: 'var(--g-throwable)' },
];
export const groupOf = id => GROUPS.find(group => group.id === id);
const TYPE_NAMES = {
  'assault-rifles': '돌격소총', 'marksman-rifles': '지정사수소총', shotguns: '산탄총', 'submachine-guns': '기관단총',
  'energy-based': '에너지', explosives: '폭발형', special: '특수', pistols: '권총', melee: '근접', standard: '표준',
};
export const typeName = type => TYPE_NAMES[type] || type || '기타';
export const weaponById = new Map(personalWeapons.map(weapon => [weapon.id, weapon]));
export const displayName = w => w.name || w.en;
