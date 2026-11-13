import { expect, test } from 'bun:test';
import { OrderUnitsAction } from '../../src/game/action/OrderUnitsAction';
import { Target, TargetBridgeMode } from '../../src/game/Target';
import { OrderType } from '../../src/game/order/OrderType';
import { AttackOrder } from '../../src/game/order/AttackOrder';

function fixture() {
    const tile: any = { rx: 98, ry: 119, z: 0, onBridgeLandType: 0 };
    const bridge: any = { id: 1325, tile, tileElevation: 4, position: { worldPosition: {} },
        isOverlay: () => true, isBridge: () => true, isUnit: () => false, isBuilding: () => false };
    const vehicle: any = { id: 2646, tile, onBridge: true, isOverlay: () => false, isUnit: () => true,
        isBuilding: () => false, position: { worldPosition: {} } };
    const objects = new Map([[bridge.id, bridge], [vehicle.id, vehicle]]);
    const occupation = { getBridgeOnTile: () => bridge };
    const map: any = { tiles: { getByMapCoords: (x: number, y: number) => x === tile.rx && y === tile.ry ? tile : undefined } };
    const game: any = { getWorld: () => ({ hasObjectId: (id: number) => objects.has(id) }),
        getObjectById: (id: number) => objects.get(id), createTarget: (obj: any, tile: any, mode: any) => new Target(obj, tile, occupation, mode) };
    map.getGroundObjectsOnTile = () => [];
    game.map = map; game.mapShroudTrait = { getPlayerShroud: () => ({ isShrouded: () => false }) };
    game.isValidTarget = (object: any) => !object || object.rules?.legalTarget === true;
    const create = () => new OrderUnitsAction(game, map, {}, {});
    return { tile, bridge, vehicle, occupation, game, create };
}

test('implicit bridge cell orders round-trip through existing v5 without becoming explicit overlay targets', () => {
    const f = fixture();
    for (const queue of [false, true]) for (const orderType of [OrderType.ForceAttack, OrderType.Move, OrderType.AttackMove]) {
        const action = f.create(); action.orderType = orderType; action.queue = queue;
        action.target = new Target(undefined, f.tile, f.occupation);
        expect(action.target.obj).toBeUndefined(); expect(action.target.getBridge()).toBe(f.bridge);
        const bytes = action.serialize(); expect(bytes[1]).toBe(5); expect(bytes.length).toBe(12);
        const restored = f.create(); restored.unserialize(bytes);
        expect(restored.orderType).toBe(orderType); expect(restored.queue).toBe(queue);
        expect(restored.target.obj).toBeUndefined(); expect(restored.target.getBridge()).toBe(f.bridge);
        expect(restored.target.equals(action.target)).toBe(true);
        expect(restored.target.getWorldCoords()).toEqual(action.target.getWorldCoords());
        const tank = { ...f.vehicle, tile: { rx: 96, ry: 119, z: 0 },
            attackTrait: { selectWeaponVersus: () => ({ rules: {}, warhead: { rules: {} } }) },
            moveTrait: { isDisabled: () => false } };
        expect(new AttackOrder(f.game, { forceAttack: true }).set(tank, restored.target).isValid()).toBe(true);
    }
});

test('explicit bridge objects, vehicle targets and deliberate ground-layer orders preserve their distinct identities', () => {
    const f = fixture();
    for (const [obj, mode] of [[f.bridge, TargetBridgeMode.Auto], [f.vehicle, TargetBridgeMode.Auto],
        [undefined, TargetBridgeMode.Ground]] as const) {
        const action = f.create(); action.orderType = OrderType.ForceAttack;
        action.target = new Target(obj, f.tile, f.occupation, mode);
        const restored = f.create(); restored.unserialize(action.serialize());
        expect(restored.target.obj).toBe(action.target.obj); expect(restored.target.getBridgeMode()).toBe(action.target.getBridgeMode());
        expect(restored.target.equals(action.target)).toBe(true);
    }
    // Existing ambiguous v4 journals are not silently reinterpreted. New
    // commands explicitly preserve their original intent in the existing format.
    const old = f.create(); old.unserialize(new Uint8Array([3, 4, 98, 0, 119, 0, 0, 45, 5, 0, 0]));
    expect(old.target.obj).toBe(f.bridge); expect(old.target.getBridgeMode()).toBe(TargetBridgeMode.Bridge);
    const tank = { ...f.vehicle, tile: { rx: 96, ry: 119, z: 0 },
        attackTrait: { selectWeaponVersus: () => ({ rules: {}, warhead: { rules: {} } }) },
        moveTrait: { isDisabled: () => false } };
    expect(new AttackOrder(f.game, { forceAttack: true }).set(tank, old.target).isValid()).toBe(false);
});
