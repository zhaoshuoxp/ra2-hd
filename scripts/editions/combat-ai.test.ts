import { expect, test } from 'bun:test';
import { manageAttackMicro, manageMoveMicro, getAttackWeight } from '../../src/game/ai/thirdpartbot/builtIn/bot/logic/mission/missions/squads/common';
import { OrderType } from '../../src/game/order/OrderType';
import { ObjectType } from '../../src/engine/type/ObjectType';
import { StanceType } from '../../src/game/gameobject/infantry/StanceType';
import { ZoneType } from '../../src/game/gameobject/unit/ZoneType';
import { Vector2 } from '../../src/game/math/Vector2';

const weapon = (range: number, air = false) => ({ maxRange: range, projectileRules: { isAntiAir: air, isAntiGround: !air } });
test('guardian infantry deploy against armor and undeploy to move or fight infantry', () => {
    const soldier: any = { id: 1, name: 'GGI', tile: { rx: 0, ry: 0 }, primaryWeapon: weapon(4), secondaryWeapon: weapon(8, true) };
    const tank: any = { id: 2, type: ObjectType.Vehicle, tile: { rx: 3, ry: 0 }, zone: ZoneType.Ground, rules: {} };
    expect(manageAttackMicro(soldier, tank).orderType).toBe(OrderType.DeploySelected);
    soldier.stance = StanceType.Deployed;
    expect(manageMoveMicro(soldier, new Vector2(20, 20)).orderType).toBe(OrderType.DeploySelected);
    expect(manageAttackMicro(soldier, { ...tank, type: ObjectType.Infantry }).orderType).toBe(OrderType.DeploySelected);
    expect(getAttackWeight(soldier, { ...tank, zone: ZoneType.Air })).not.toBeNull();
});
test('siege choppers deploy artillery in range and leave artillery mode for air targets', () => {
    const chopper: any = { id: 1, name: 'SCHP', tile: { rx: 0, ry: 0 }, primaryWeapon: weapon(6), secondaryWeapon: weapon(12) };
    const building: any = { id: 2, type: ObjectType.Building, tile: { rx: 10, ry: 0 }, zone: ZoneType.Ground, rules: {} };
    expect(manageAttackMicro(chopper, building).orderType).toBe(OrderType.DeploySelected);
    chopper.isDeployed = true;
    expect(manageAttackMicro(chopper, building).orderType).toBe(OrderType.Attack);
    expect(manageAttackMicro(chopper, { ...building, zone: ZoneType.Air }).orderType).toBe(OrderType.DeploySelected);
    expect(getAttackWeight(chopper, { ...building, zone: ZoneType.Air })).toBeNull();
});
