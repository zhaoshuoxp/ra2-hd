import { NotifyTick } from './interface/NotifyTick';
import { BuildStatus } from '../gameobject/Building';
import { fnv32a } from '@/util/math';

export class TechBuildingsTrait {
    private initialized = false;
    private labs: any[] = [];
    [NotifyTick.onTick](game: any): void {
        const general = game.rules.getIni().getSection('General');
        if (!this.initialized) {
            this.initialized = true;
            this.labs = game.world.getAllObjects().filter((u: any) => u.isBuilding() && u.rules.secretLab);
            const pool = ['SecretInfantry', 'SecretUnits', 'SecretBuildings'].flatMap(tag => general.getArray(tag));
            // Boons belong to the map's labs, and survive capture/recapture.
            if (this.labs.length <= pool.length) for (const lab of this.labs) {
                const index = game.generateRandomInt(0, pool.length - 1);
                lab.secretProduction = pool.splice(index, 1)[0];
            }
        }
        const infantryDue = game.currentTick % Math.max(1, general.getNumber('SelfHealInfantryFrames', 50)) === 0;
        const vehicleDue = game.currentTick % Math.max(1, general.getNumber('SelfHealUnitFrames', 75)) === 0;
        if (!infantryDue && !vehicleDue) return;
        for (const player of game.getCombatants()) {
            let infantry = 0, vehicles = 0;
            for (const building of player.buildings) {
                if (!building.isSpawned || building.isDestroyed || building.buildStatus !== BuildStatus.Ready || building.warpedOutTrait.isActive()) continue;
                infantry += building.rules.infantryGainSelfHeal;
                vehicles += building.rules.unitsGainSelfHeal;
            }
            if (!infantry && !vehicles) continue;
            for (const unit of player.getOwnedObjects()) {
                if (!unit.isUnit() || unit.isAircraft() || unit.isDestroyed || unit.warpedOutTrait.isActive() || unit.healthTrait.health === 100) continue;
                const amount = unit.isInfantry() || unit.rules.organic
                    ? infantryDue ? infantry * general.getNumber('SelfHealInfantryAmount', 20) : 0
                    : vehicleDue ? vehicles * general.getNumber('SelfHealUnitAmount', 5) : 0;
                if (amount > 0) unit.healthTrait.healBy(amount, unit, game);
            }
        }
    }
    getHash(): number { return fnv32a(this.labs.flatMap(lab => [lab.id, ...String(lab.secretProduction ?? '').split('').map(c => c.charCodeAt(0))])); }
}
