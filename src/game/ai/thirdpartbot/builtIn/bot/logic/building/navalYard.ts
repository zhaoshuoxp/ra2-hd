import { GameApi, PlayerData, TechnoRules } from '../../../game-api';
import { BasicBuilding } from './basicBuilding';
import { getDefaultPlacementLocation } from './buildingRules';

export class NavalYard extends BasicBuilding {
    constructor() { super(4, 1, 3500); }
    getPlacementLocation(game: GameApi, player: PlayerData, rules: TechnoRules) {
        return getDefaultPlacementLocation(game, player, player.startLocation, rules, true, 0);
    }
}
