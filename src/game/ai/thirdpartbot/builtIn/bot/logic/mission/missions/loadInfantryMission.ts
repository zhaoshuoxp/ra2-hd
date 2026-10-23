import { OrderType, QueueType } from '../../../../game-api';
import { Mission, disbandMission, noop, requestSpecificUnits, requestUnits } from '../mission';
import { MissionController } from '../missionController';
import { MissionContext, SupabotContext } from '../../common/context';
import { DebugLogger } from '../../common/utils';

// Reserve passengers while boarding so attack squads cannot replace their
// enter orders. The engine still enforces capacity, pathing and ownership.
export class LoadInfantryMission extends Mission {
    private lastOrder = -60;
    constructor(private targetId: number, readonly reactor: boolean, logger: DebugLogger) {
        super(`load-infantry-${targetId}`, logger);
    }
    getPriority(): number { return 45; }
    getGlobalDebugText(): string { return this.reactor ? 'Reactor occupants' : 'Battle Fortress passengers'; }
    _onAiUpdate(context: MissionContext) {
        const { game, player } = context;
        const target = game.getUnitData(this.targetId);
        if (!target || target.owner !== player.name) return disbandMission();
        if (!this.reactor && !this.getUnitIds().includes(target.id)) return requestSpecificUnits([target.id], this.getPriority());
        const occupied = this.reactor ? target.absorberUnitCount ?? 0 : target.passengerSlotCount ?? 0;
        const capacity = target.rules.passengers;
        const power = game.getPlayerData(player.name).power;
        if (this.reactor && (occupied >= capacity || power.total - power.drain >= 200)) return disbandMission();
        if (!this.reactor && occupied >= capacity) {
            if (target.isIdle && game.getCurrentTick() >= (game.getPlayerData(player.name).aiPacing?.firstAttack ?? 0) && game.getCurrentTick() - this.lastOrder >= 60) {
                const enemies = game.getVisibleUnits(player.name, 'enemy').map(id => game.getUnitData(id)).filter(Boolean)
                    .filter(u => !u!.rules.naval)
                    .sort((a, b) => Math.hypot(a!.tile.rx - target.tile.rx, a!.tile.ry - target.tile.ry) - Math.hypot(b!.tile.rx - target.tile.rx, b!.tile.ry - target.tile.ry));
                if (enemies.length) player.actions.orderUnits([target.id], OrderType.Attack, enemies[0]!.id);
                else {
                    const enemy = game.getPlayers().find(name => name !== player.name && !game.areAlliedPlayers(player.name, name) && !game.isPlayerDefeated(name));
                    if (enemy) {
                        const point = game.getPlayerData(enemy).startLocation;
                        player.actions.orderUnits([target.id], OrderType.AttackMove, point.x, point.y);
                    }
                }
                this.lastOrder = game.getCurrentTick();
            }
            return noop();
        }
        const infantry = this.getUnits(game).filter(u => u.id !== target.id);
        if (!infantry.length) {
            const name = this.reactor ? 'INIT' : occupied < 3 ? 'GGI' : 'E1';
            if (!player.production.getAvailableObjects(QueueType.Infantry).some(r => r.name === name)) return disbandMission();
            return requestUnits({ [name]: this.getPriority() });
        }
        if (game.getCurrentTick() - this.lastOrder >= 60) {
            player.actions.orderUnits(infantry.map(u => u.id), this.reactor ? OrderType.Occupy : OrderType.EnterTransport, target.id);
            this.lastOrder = game.getCurrentTick();
        }
        return noop();
    }
}

export function createInfantryLoadingMissions(context: SupabotContext, controller: MissionController, logger: DebugLogger): void {
    const { game, player } = context;
    if (game.getCurrentTick() % 60) return;
    const power = game.getPlayerData(player.name).power;
    const candidates = game.getVisibleUnits(player.name, 'self', r => r.name === 'BFRT' || r.infantryAbsorb);
    const missions = controller.getMissions();
    for (const id of candidates) {
        const target = game.getUnitData(id)!;
        const reactor = !!target.rules.infantryAbsorb;
        if (reactor && ((target.absorberUnitCount ?? 0) >= target.rules.passengers || power.total - power.drain >= 100)) continue;
        if (reactor && missions.some(m => m instanceof LoadInfantryMission && m.reactor)) continue;
        if (missions.some(m => m.getUniqueName() === `load-infantry-${id}`)) continue;
        controller.addMission(new LoadInfantryMission(id, reactor, logger));
    }
}
