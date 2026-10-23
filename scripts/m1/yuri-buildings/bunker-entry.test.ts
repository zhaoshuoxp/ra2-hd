import { expect, test } from 'bun:test';
import { EnterBunkerTask } from '../../../src/game/gameobject/task/EnterBunkerTask';
import { MoveResult } from '../../../src/game/gameobject/trait/MoveTrait';
import { Vector2 } from '../../../src/game/math/Vector2';
import { TaskStatus } from '../../../src/game/gameobject/task/system/TaskStatus';

function scene() {
    const entered: any[] = [], events: any[] = [], tile = { rx: 10, ry: 20 };
    const target = { isDestroyed: false, position: { getMapPosition: () => new Vector2(11 * 256, 21 * 256) },
        dockTrait: { getDockTile: () => tile, getDockOffset: () => ({ x: -1, z: -1 }) },
        bunkerTrait: { canEnter: () => true, enter: (unit: any) => entered.push(unit) } };
    const unit = { tile, direction: 0, spinVelocity: 0, rules: { rot: 15 },
        moveTrait: { isDisabled: () => false, lastMoveResult: undefined as MoveResult | undefined } };
    const occupation = { inside: false, isTileOccupiedBy: () => occupation.inside };
    const task = new EnterBunkerTask({ events: { dispatch: (event: any) => events.push(event) },
        map: { tileOccupation: occupation } }, target);
    return { task, target, unit, entered, events, occupation };
}

test('bunker occupant reaches the native dock offset before entering, rather than stopping at the first occupied tile', () => {
    const s = scene();
    expect(s.task.onTick(s.unit)).toBe(false);
    const move = s.task.children[0] as any;
    expect(move.targetTile).toBe(s.unit.tile);
    expect(move.options.targetOffset).toEqual(new Vector2(255, 255));
    expect(move.options.ignoredBlockers).toEqual([s.target]);
    expect(s.entered.length).toBe(0);
    expect(s.task.onTick(s.unit)).toBe(false);
    s.task.children.length = 0; s.unit.moveTrait.lastMoveResult = MoveResult.Success;
    expect(s.task.onTick(s.unit)).toBe(true);
    expect(s.entered).toEqual([s.unit]);
    expect(s.events[0].target).toBe(s.target);
});

test('occupancy waits for a native turn that aligns the hull with the bunker wheel strips', () => {
    for (const [arrival, aligned] of [[45, 0], [140, 180], [315, 0]]) {
        const s = scene(); s.unit.direction = arrival;
        s.task.onTick(s.unit); s.task.children.length = 0;
        s.unit.moveTrait.lastMoveResult = MoveResult.Success;
        expect(s.task.onTick(s.unit)).toBe(false);
        expect(s.entered).toEqual([]);
        const turn = s.task.children[0];
        for (let ticks = 0; ticks < 13 && !turn.onTick(s.unit); ticks++) {}
        expect(s.unit.direction).toBe(aligned);
        s.task.children.length = 0;
        expect(s.task.onTick(s.unit)).toBe(true);
        expect(s.entered).toEqual([s.unit]);
    }
});

test('a cancelled or rejected approach clears the foundation rather than leaving a second tank inside', () => {
    for (const cancelled of [false, true]) {
        const s = scene(); s.task.onTick(s.unit); s.task.children.length = 0; s.occupation.inside = true;
        s.unit.moveTrait.lastMoveResult = MoveResult.Success;
        if (cancelled) s.task.status = TaskStatus.Cancelling;
        else s.target.bunkerTrait.canEnter = () => false;
        expect(s.task.onTick(s.unit)).toBe(false);
        expect(s.task.children[0].cancellable).toBe(false);
        expect(s.entered.length).toBe(0);
        s.task.children.length = 0; s.occupation.inside = false;
        expect(s.task.onTick(s.unit)).toBe(true);
    }
});

test('failed or cancelled bunker approach does not board or disable a unit', () => {
    for (const cancelled of [false, true]) {
        const s = scene(); s.task.onTick(s.unit); s.task.children.length = 0;
        s.unit.moveTrait.lastMoveResult = MoveResult.Fail;
        if (cancelled) s.task.status = TaskStatus.Cancelling;
        expect(s.task.onTick(s.unit)).toBe(true);
        expect(s.entered.length).toBe(0); expect(s.events.length).toBe(0);
    }
});
