import { Target } from './Target';

// AreaFire changes the detonation center, while the ordered enemy remains the
// attack task's acquisition/range target. Preserve ordinary projectile targets.
export function weaponAreaTarget(source: any, ordered: any, areaFire: boolean, occupation: any): any {
    return areaFire ? new Target(source, source.tile, occupation) : ordered;
}
