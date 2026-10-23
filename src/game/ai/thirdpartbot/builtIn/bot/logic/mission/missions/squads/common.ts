import { AttackState, ObjectType, OrderType, StanceType, UnitData, Vector2, ZoneType } from "../../../../../game-api";
import { getDistanceBetweenPoints, getDistanceBetweenUnits } from "../../../map/map";
import { BatchableAction } from "../../actionBatcher";

const NONCE_GI_DEPLOY = 0;
const NONCE_GI_UNDEPLOY = 1;

// Micro methods
export function manageMoveMicro(attacker: UnitData, attackPoint: Vector2): BatchableAction {
    if (attacker.name === "E1" || attacker.name === "GGI") {
        const isDeployed = (attacker.stance as any) === StanceType.Deployed;
        if (isDeployed) {
            return BatchableAction.noTarget(attacker.id, OrderType.DeploySelected, NONCE_GI_UNDEPLOY);
        }
    }

    return BatchableAction.toPoint(attacker.id, OrderType.AttackMove, attackPoint);
}

export function manageAttackMicro(attacker: UnitData, target: UnitData): BatchableAction {
    const distance = getDistanceBetweenUnits(attacker, target);
    if (attacker.name === "SCHP") {
        const artilleryRange = attacker.secondaryWeapon?.maxRange ?? 0;
        const deploy = target.zone !== ZoneType.Air && distance <= artilleryRange && distance >= 3;
        if (deploy !== !!attacker.isDeployed) {
            return BatchableAction.noTarget(attacker.id, OrderType.DeploySelected, deploy ? NONCE_GI_DEPLOY : NONCE_GI_UNDEPLOY);
        }
    }
    if (attacker.name === "E1" || attacker.name === "GGI") {
        // Para (deployed weapon) range is 5.
        const deployedWeaponRange = attacker.secondaryWeapon?.maxRange || 5;
        const isDeployed = (attacker.stance as any) === StanceType.Deployed;
        const suitableTarget = attacker.name !== 'GGI' || (target.type as any) !== ObjectType.Infantry;
        if (!isDeployed && suitableTarget && (distance <= deployedWeaponRange || (attacker.attackState as any) === AttackState.JustFired)) {
            return BatchableAction.noTarget(attacker.id, OrderType.DeploySelected, NONCE_GI_DEPLOY);
        } else if (isDeployed && (!suitableTarget || distance > deployedWeaponRange)) {
            return BatchableAction.noTarget(attacker.id, OrderType.DeploySelected, NONCE_GI_UNDEPLOY);
        }
    }
    let targetData = target;
    let orderType: OrderType = OrderType.Attack;
    const primaryWeaponRange = attacker.primaryWeapon?.maxRange || 5;
    if ((targetData?.type as any) == ObjectType.Building && distance < primaryWeaponRange * 0.8) {
        orderType = OrderType.Attack;
    } else if (targetData?.rules.canDisguise) {
        // Special case for mirage tank/spy as otherwise they just sit next to it.
        orderType = OrderType.Attack;
    }
    return BatchableAction.toTargetId(attacker.id, orderType, target.id);
}

/**
 *
 * @param attacker
 * @param target
 * @returns A number describing the weight of the given target for the attacker, or null if it should not attack it.
 */
export function getAttackWeight(attacker: UnitData, target: UnitData): number | null {
    const { rx: x, ry: y } = attacker.tile;
    const { rx: hX, ry: hY } = target.tile;

    const weapons = [attacker.primaryWeapon, attacker.secondaryWeapon].filter(Boolean);
    if (!weapons.some(weapon => target.zone === ZoneType.Air ? weapon.projectileRules.isAntiAir : weapon.projectileRules.isAntiGround)) return null;

    return 1000000 - getDistanceBetweenPoints(new Vector2(x, y), new Vector2(hX, hY));
}
