import { expect, test } from 'bun:test';
import { OrderUnitsAction } from '../../src/game/action/OrderUnitsAction';
import { AttackOrder } from '../../src/game/order/AttackOrder';
import { StopOrder } from '../../src/game/order/StopOrder';
import { OrderType } from '../../src/game/order/OrderType';

function fixture() {
    const player = {}, processed: any[] = [];
    const unit: any = { owner: player, rules: {}, warpedOutTrait: { isActive: () => false },
        isUnit: () => true, isTechno: () => true, isInfantry: () => true, isVehicle: () => false,
        unitOrderTrait: { addOrder: (order: any) => processed.push(order) } };
    const selection = { getSelectedUnits: () => [unit] };
    const game: any = { map: { tiles: {}, tileOccupation: {} },
        mapShroudTrait: { getPlayerShroud: () => ({ isShrouded: () => false }) } };
    const factory = { create: (type: OrderType) => type === OrderType.Stop ? new StopOrder(game) : new AttackOrder(game) };
    const create = () => { const action = new OrderUnitsAction(game, game.map,
        { getOrCreateSelection: () => selection }, factory); action.player = player; return action; };
    return { create, processed };
}

test('an invalid historical attack that serialized without its vanished target remains a no-op after restoration', () => {
    const f = fixture(), recorded = f.create();
    recorded.orderType = OrderType.Attack;
    const bytes = recorded.serialize(); expect([...bytes]).toEqual([OrderType.Attack, 0]);
    const restored = f.create(); restored.unserialize(bytes);
    expect(() => restored.process()).not.toThrow(); expect(f.processed).toEqual([]);
});

test('ordinary targetless stop orders still reach the selected unit', () => {
    const f = fixture(), restored = f.create(); restored.unserialize(new Uint8Array([OrderType.Stop, 0]));
    restored.process(); expect(f.processed.length).toBe(1); expect(f.processed[0].orderType).toBe(OrderType.Stop);
});
