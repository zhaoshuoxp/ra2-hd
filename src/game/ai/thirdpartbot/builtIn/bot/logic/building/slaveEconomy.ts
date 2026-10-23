import { GameApi, PlayerData, TechnoRules } from '../../../game-api';
import { ResourceCollectionBuilding } from './resourceCollectionBuilding';
import { BasicGroundUnit } from './basicGroundUnit';
function count(game: GameApi, player: PlayerData): number {
    return game.getVisibleUnits(player.name, 'self', r => r.name === 'YAREFN' || r.name === 'SMIN').length;
}
export class SlaveRefinery extends ResourceCollectionBuilding {
    constructor() { super(30, 3); }
    getPriority(game: GameApi, player: PlayerData): number { return count(game, player) ? (count(game, player) < (player.aiPacing?.maxSlaveMiners ?? 3) ? 8 : -100) : 100; }
    getMaxCount(_game: GameApi, player: PlayerData): number { return player.aiPacing?.maxSlaveMiners ?? 3; }
}
export class MobileSlaveMiner extends BasicGroundUnit {
    constructor() { super(15, 3, 0, 0); }
    getPriority(game: GameApi, player: PlayerData, _rules: TechnoRules): number { return count(game, player) < (player.aiPacing?.maxSlaveMiners ?? 3) ? 15 : -100; }
    getMaxCount(_game: GameApi, player: PlayerData): number { return player.aiPacing?.maxSlaveMiners ?? 3; }
}
