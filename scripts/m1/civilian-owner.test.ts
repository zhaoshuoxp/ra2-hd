import { expect, test } from 'bun:test';
import { PlayerList } from '../../src/game/PlayerList';
import { Player } from '../../src/game/Player';
import { Country } from '../../src/game/Country';
import { SideType } from '../../src/game/SideType';
import { GarrisonBuildingTask } from '../../src/game/gameobject/task/GarrisonBuildingTask';
import { TaskRunner } from '../../src/game/gameobject/task/system/TaskRunner';

test('civilian ownership resolves the numeric side used by parsed country rules', () => {
    const players = new PlayerList();
    for (const side of [SideType.GDI, SideType.Nod, SideType.Mutant, SideType.Civilian]) {
        players.addPlayer(new Player(String(side), new Country({ side } as any), undefined, undefined));
    }
    players.addPlayer(new Player('observer', undefined, undefined, undefined));
    expect(players.getCivilian()).toBe(players.getPlayerAt(3));
    expect(players.getCivilian()?.isNeutral).toBe(true);
});

test('successful garrison entry completes its task before evacuation reuses the unit', () => {
    const owner = { buildingsCaptured: 0 };
    const unit = { isSpawned: true, owner, moveTrait: { isDisabled: () => false }, tile: {} };
    const house = { garrisonTrait: { canBeOccupied: () => true, units: [], maxOccupants: 10 } };
    const game = {
        map: { tileOccupation: { isTileOccupiedBy: () => true } },
        events: { dispatch() {} },
        limboObject(u: any) { u.isSpawned = false; },
        getUnitSelection: () => ({ getOrCreateSelectionModel: () => ({ getControlGroupNumber: () => undefined }) }),
        changeObjectOwner() {},
    };
    const tasks = [new GarrisonBuildingTask(game, house)];
    new TaskRunner().tick(tasks, unit);
    expect(house.garrisonTrait.units).toEqual([unit]);
    expect(unit.isSpawned).toBe(false);
    expect(tasks).toHaveLength(0);
});
