import type { InflictDamageEvent } from '../event/InflictDamageEvent';

// Original combat dispatch reports one damage state per hit. Red overrides
// half health; equality at the red threshold does not count as a crossing.
export function campaignCombatThreshold(event: InflictDamageEvent, conditionRed: number): 39 | 40 | undefined {
    if (!event.attacker?.obj || event.damageHitPoints <= 0 || event.currentHealth >= event.prevHealth) return;
    const maximum = event.target.healthTrait.getMaxHitPoints();
    const previous = Math.round(event.prevHealth * maximum / 100);
    const current = Math.round(event.currentHealth * maximum / 100);
    const red = maximum * conditionRed, half = Math.floor(maximum / 2);
    if (previous > red && current < red) return 40;
    if (current > 0 && previous >= half && current < half) return 39;
}
