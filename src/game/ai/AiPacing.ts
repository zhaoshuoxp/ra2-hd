import { AiDifficulty } from '../gameopts/GameOpts';

export interface AiPacing {
    firstAttack: number;
    attackInterval: number;
    maxAttacks: number;
    squadScale: number;
    maxMiners: number;
    maxSlaveMiners: number;
    maxShips: number;
    maxCapitalShips: number;
    focusHarvesters: boolean;
}
// Simulation ticks, independent of rendering speed. This changes AI decisions,
// never human production, retail weapon rules or difficulty combat modifiers.
export function aiPacing(difficulty: AiDifficulty | undefined, expansion: boolean, yuri: boolean): AiPacing {
    const easy = difficulty === AiDifficulty.Easy, brutal = difficulty === AiDifficulty.Brutal;
    const pacing: AiPacing = easy
        ? { firstAttack: 7200, attackInterval: 6000, maxAttacks: 1, squadScale: .5, maxMiners: 3, maxSlaveMiners: 1, maxShips: 2, maxCapitalShips: 1, focusHarvesters: false }
        : brutal
            ? { firstAttack: 3000, attackInterval: 3000, maxAttacks: 2, squadScale: .9, maxMiners: 6, maxSlaveMiners: 3, maxShips: 4, maxCapitalShips: 2, focusHarvesters: true }
            : { firstAttack: 4800, attackInterval: 4200, maxAttacks: 1, squadScale: .7, maxMiners: 4, maxSlaveMiners: 2, maxShips: 3, maxCapitalShips: 1, focusHarvesters: false };
    if (expansion) {
        pacing.firstAttack += 900;
        pacing.attackInterval += 600;
    }
    if (yuri) pacing.squadScale *= .85;
    return pacing;
}
