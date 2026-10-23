import { GameApi, ProductionApi, QueueType } from '../../../game-api';
import { UnitRequest } from '../mission/missionController';

// Combat missions do not request harvesters. Keep a separate economy demand so
// continuous infantry requests cannot leave a base on its first free miner.
export function requestEconomyUnits(game: GameApi, production: ProductionApi, playerName: string, requests: Map<string, UnitRequest>): void {
    const pacing = game.getPlayerData(playerName).aiPacing;
    const available = production.getAvailableObjects(QueueType.Vehicles);
    if (game.getCurrentTick() >= (pacing?.firstAttack ?? 0) && available.some(r => r.name === 'BFRT') && game.getPlayerData(playerName).credits >= 3000 &&
        game.getVisibleUnits(playerName, 'self', r => r.name === 'BFRT').length < 1) {
        requests.set('BFRT', { priority: 20, specificLocation: null });
    }
    for (const rules of available.filter(r => r.harvester || r.name === 'SMIN')) {
        const slave = rules.name === 'SMIN';
        const miners = game.getVisibleUnits(playerName, 'self', r => r.name === rules.name || (slave && r.name === 'YAREFN')).length;
        const refineries = game.getVisibleUnits(playerName, 'self', r => r.refinery).length;
        const desired = slave ? (pacing?.maxSlaveMiners ?? 3) : Math.min(pacing?.maxMiners ?? 6, refineries * 2);
        if (miners >= desired) continue;
        const priority = miners < 2 ? 60 : 25;
        if ((requests.get(rules.name)?.priority ?? 0) < priority) requests.set(rules.name, { priority, specificLocation: null });
    }
}
