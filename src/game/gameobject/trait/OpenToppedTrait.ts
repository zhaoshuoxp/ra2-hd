import { NotifyTick } from './interface/NotifyTick';
import { NotifyOwnerChange } from './interface/NotifyOwnerChange';
import { RangeHelper } from '../unit/RangeHelper';
import { FacingUtil } from '../unit/FacingUtil';
import { Vector2 } from '@/game/math/Vector2';
import { globalRules } from '@/game/rules/globalRules';
export class OpenToppedTrait {
    readonly rangeBonus: number;
    readonly damageMultiplier: number;
    constructor(rules: any) {
        const settings = globalRules(rules);
        this.rangeBonus = settings.getNumber('OpenToppedRangeBonus');
        this.damageMultiplier = settings.getNumber('OpenToppedDamageMultiplier', 1);
    }
    [NotifyTick.onTick](transport: any, game: any): void {
        if (transport.warpedOutTrait.isActive() || transport.isDestroyed) return;
        const range = new RangeHelper(game.map.tileOccupation);
        for (const unit of transport.transportTrait.units) {
            unit.openTransport = transport;
            unit.position.moveToLeptons(transport.position.getMapPosition());
            unit.position.tileElevation = transport.tileElevation;
            unit.onBridge = transport.onBridge;
            unit.zone = transport.zone;
            unit.armedTrait?.[NotifyTick.onTick](unit, game);
            unit.mindControllerTrait?.[NotifyTick.onTick](unit, game);
            if (!unit.attackTrait || !unit.primaryWeapon || unit.ammo === 0 || unit.mindControllerTrait?.isAtCapacity()) {
                unit.temporalTrait?.releaseCurrentTarget(game);
                continue;
            }
            let target = transport.attackTrait?.currentTarget?.obj;
            let weapon = target && unit.attackTrait.selectWeaponVersus(unit, target, game);
            if (!target || !weapon || !game.isValidTarget(target) || !range.isInWeaponRange(unit, target, weapon, game.rules)) {
                const found = unit.attackTrait.scanForTarget(unit, unit.primaryWeapon, game);
                target = found.target; weapon = found.weapon;
            }
            if (unit.temporalTrait?.getTarget() && unit.temporalTrait.getTarget() !== target) unit.temporalTrait.releaseCurrentTarget(game);
            if (!target || !weapon || weapon.getCooldownTicks() > 0) continue;
            unit.direction = FacingUtil.fromMapCoords(new Vector2(target.tile.rx - unit.tile.rx, target.tile.ry - unit.tile.ry));
            weapon.fire(game.createTarget(target, target.tile), game);
        }
    }
    [NotifyOwnerChange.onChange](transport: any, _previous: any, game: any): void {
        for (const unit of transport.transportTrait.units) game.changeObjectOwner(unit, transport.owner);
    }
}
