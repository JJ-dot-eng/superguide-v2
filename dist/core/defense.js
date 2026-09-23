// Energy shield recovery. Waiting and refilling are separate phases, and a
// fully broken shield uses its own delay (the two delays never add up).
import { known } from './combat.js';

export function shieldRecovery(defense, remaining) {
  const shield = defense?.type === 'energy' ? defense.shield : null;
  if (!shield || !known(shield.capacity) || shield.capacity === 0 || !known(shield.regeneration) || shield.regeneration === 0) return null;
  if (!known(remaining) || remaining > shield.capacity) return null;
  if (remaining === shield.capacity) return { delay: 0, filling: 0, total: 0 };
  // The Shield Relay never restarts once broken within its 40 s life.
  if (remaining === 0 && shield.regeneratesAfterDepletion === false) return null;
  const delay = remaining === 0 ? shield.depletedDelay : shield.hitDelay;
  if (!known(delay)) return null;
  const filling = (shield.capacity - remaining) / shield.regeneration;
  return { delay, filling, total: delay + filling };
}
