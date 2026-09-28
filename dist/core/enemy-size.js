import { enemySizes } from '../data/enemy-sizes.js';
import { L } from './i18n.js';
export { enemySizesCheckedAt, enemySizesSource, unmappedEnemySizes } from '../data/enemy-sizes.js';

export const SIZE_NAMES = { small: L('소형', 'Small'), medium: L('중형', 'Medium'), large: L('대형', 'Large'), massive: L('초대형', 'Massive') };

// Resolve only roster IDs. Names, apparent dimensions and combat armor are not
// evidence of size; unknown IDs and explicitly unmapped enemies stay null.
export function enemySize(enemyOrId) {
  const id = typeof enemyOrId === 'string' ? enemyOrId : enemyOrId?.id;
  return typeof id === 'string' && Object.hasOwn(enemySizes, id) ? enemySizes[id] : null;
}
export function isLargeEnemy(enemyOrId) {
  return ['large', 'massive'].includes(enemySize(enemyOrId));
}
