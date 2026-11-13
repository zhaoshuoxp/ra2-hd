import { expect, spyOn, test } from 'bun:test';
import { MoveTask } from '../../src/game/gameobject/task/move/MoveTask';
import { SpawnLinkTrait } from '../../src/game/gameobject/trait/SpawnLinkTrait';
import { WingedLocomotor } from '../../src/game/gameobject/locomotor/WingedLocomotor';
import { ZoneType } from '../../src/game/gameobject/unit/ZoneType';

function fixture(sameTile = false) {
    const tile = {}, previous = {}, tasks: MoveTask[] = [];
    const parent = { tile, isUnit: () => true, onBridge: false };
    const aircraft = { tile: sameTile ? tile : previous, unitOrderTrait: {
        getCurrentTask: () => tasks[0], addTask: (task: MoveTask) => tasks.push(task)
    } };
    const trait = new SpawnLinkTrait();
    const follow = () => (trait as any).tryMoveToParent(aircraft, parent, {});
    return { parent, aircraft, tasks, previous, follow };
}

test('a returning aircraft does not restart its path while its parent remains on the same tile', () => {
    const f = fixture();
    f.follow();
    const task = f.tasks[0], update = spyOn(task, 'updateTarget');
    for (let i = 0; i < 30; i++) f.follow();
    expect(f.tasks).toHaveLength(1);
    expect(task.hasTarget(f.parent.tile as any, false)).toBe(true);
    expect(update).not.toHaveBeenCalled();
});

test('a returning aircraft retargets a moved parent even when they already share a tile', () => {
    const f = fixture(true);
    const task = new MoveTask({} as any, f.previous as any, false);
    f.tasks.push(task);
    f.follow();
    expect(task.hasTarget(f.parent.tile as any, false)).toBe(true);
    expect((task as any).needsPathUpdate).toBe(true);
    f.parent.onBridge = true;
    f.follow();
    expect(task.hasTarget(f.parent.tile as any, true)).toBe(true);
});

test('an aborted launch is stored on deck while an active takeoff remains scheduled', () => {
    let stored = 0, currentTask: any;
    const tile = {}, parent = { tile, airSpawnTrait: { storeAircraft: () => { stored++; } } };
    const aircraft: any = { tile, zone: ZoneType.Ground, spawnLinkTrait: { getParent: () => parent },
        unitOrderTrait: { getCurrentTask: () => currentTask } };
    currentTask = {};
    WingedLocomotor.tickStationary(aircraft, {} as any);
    expect(stored).toBe(0);
    currentTask = undefined;
    WingedLocomotor.tickStationary(aircraft, {} as any);
    expect(stored).toBe(1);
});
