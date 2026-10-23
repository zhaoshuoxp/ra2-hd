import { expect, test } from 'bun:test';
import { GarrisonTrait } from '../../../src/game/gameobject/trait/GarrisonTrait';
import { GarrisonBuildingTask } from '../../../src/game/gameobject/task/GarrisonBuildingTask';

for (const [name, techLevel] of [['NABNKR', 1], ['CABUNK01', -1]] as const) {
    test(`${name}: evacuation preserves military ownership and releases civilian ownership`, () => {
        const player: any = { buildingsCaptured: 0 }, civilian = {};
        const unit: any = { owner: player, rules: { speedType: 1 }, unitOrderTrait: { addTask: () => {} } };
        const building: any = { name, rules: { techLevel }, owner: player, tile: { rx: 4, ry: 4, z: 0 },
            art: { foundation: { width: 2, height: 2 } }, healthTrait: { health: 100 } };
        const trait: any = building.garrisonTrait = new GarrisonTrait(building, .25, 5);
        trait.units.push(unit);
        let spawned = 0, events = 0;
        const game: any = { map: { tiles: { getByMapCoords: (rx: number, ry: number) => ({ rx, ry, z: 0 }) },
            mapBounds: { isWithinBounds: () => true }, terrain: { getPassableSpeed: () => 1, findObstacles: () => [] } },
            getCivilianPlayer: () => civilian, changeObjectOwner: (b: any, owner: any) => b.owner = owner,
            unlimboObject: () => spawned++, events: { dispatch: () => events++ } };
        trait.evacuate(game);
        expect(trait.units.length).toBe(0); expect(spawned).toBe(1); expect(events).toBe(1);
        expect(building.owner).toBe(techLevel >= 0 ? player : civilian);
    });
}
test('entering an owned bunker is not counted as capturing a building', () => {
    const player: any = { buildingsCaptured: 0 }, other: any = {};
    const target: any = { owner: player, garrisonTrait: { units: [] } };
    let captures = 0, events = 0;
    const game: any = { limboObject: () => {}, getUnitSelection: () => ({ getOrCreateSelectionModel: () => ({ getControlGroupNumber: () => 0 }) }),
        changeObjectOwner: (b: any, owner: any) => { b.owner = owner; captures++; }, events: { dispatch: () => events++ } };
    const task = new GarrisonBuildingTask(game, target);
    task.onEnter({ owner: player });
    expect(player.buildingsCaptured).toBe(0); expect(captures).toBe(0); expect(events).toBe(1);
    target.garrisonTrait.units = []; target.owner = other;
    task.onEnter({ owner: player });
    expect(player.buildingsCaptured).toBe(1); expect(captures).toBe(1); expect(events).toBe(2);
});
