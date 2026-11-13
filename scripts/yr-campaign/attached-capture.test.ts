import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignRuntime } from '../../src/game/campaign/CampaignRuntime';
import { ObjectOwnerChangeEvent } from '../../src/game/event/ObjectOwnerChangeEvent';
import { MindControllableTrait } from '../../src/game/gameobject/trait/MindControllableTrait';
import { MindControllerTrait } from '../../src/game/gameobject/trait/MindControllerTrait';
import { NotifyOwnerChange } from '../../src/game/gameobject/trait/interface/NotifyOwnerChange';

const bytes = readFileSync('.local/campaign/yr/sov04dmd/sov04dmd.map');
const source = new CampaignDefinition('yr', 'sov04dmd.map', bytes.toString(), undefined,
    { semanticsVersion: 36, sourceSha256: createHash('sha256').update(bytes).digest('hex') });
const captured = source.triggers.get('0915E18C')!;

test('original Romanov capture tag receives real psychic capture and release without a false death', () => {
    expect(captured.events[0].opcode).toBe(48); expect(captured.events[0].params).toEqual(['0', '6']);
    expect(captured.actions[0].opcode).toBe(56); expect(captured.actions[0].params[1]).toBe('1');
    const german = { name: 'Germans' }, special = { name: 'Special' };
    const romanov: any = { id: 1525, name: 'RMNV', owner: german, isUnit: () => true,
        healthTrait: { health: 100 }, isDestroyed: false };
    romanov.mindControllableTrait = new MindControllableTrait(romanov);
    const controller: any = { owner: special };
    controller.mindControllerTrait = new MindControllerTrait(controller, 1);
    const notifications: any[] = [];
    const world: any = { changeObjectOwner: (unit: any, owner: any) => {
        const previous = unit.owner; unit.owner = owner;
        notifications.push(new ObjectOwnerChangeEvent(unit, previous));
    } };
    const host: any = { launch: { edition: 'yr', semanticsVersion: 36 }, events: notifications,
        targets: () => [romanov], targetId: (unit: any) => 'object:' + unit.id };
    const check = () => (CampaignRuntime.prototype as any).check.call(host, captured.events[0], captured);
    controller.mindControllerTrait.control(romanov, world);
    expect(romanov.owner).toBe(special); expect(check()).toEqual(['object:1525']);
    expect(romanov.healthTrait.health).toBe(100); expect(romanov.isDestroyed).toBe(false);
    notifications.length = 0; romanov.mindControllableTrait.restore(world);
    expect(romanov.owner).toBe(german); expect(check()).toEqual(['object:1525']);
    expect(romanov.healthTrait.health).toBe(100);
});

test('YR36 attached unit transfers retain scripted changes while old journals and unrelated actors stay excluded', () => {
    const previous = {}, next = {}, unit: any = { id: 5, owner: next, isUnit: () => true };
    const host: any = { launch: { edition: 'yr', semanticsVersion: 36 },
        events: [new ObjectOwnerChangeEvent(unit, previous)], targets: () => [unit], targetId: () => 'object:5' };
    const check = () => (CampaignRuntime.prototype as any).check.call(host, captured.events[0], captured);
    expect(check()).toEqual(['object:5']);
    host.launch.semanticsVersion = 35; expect(check()).toEqual([]);
    host.launch = { edition: 'ra2', semanticsVersion: 36 }; expect(check()).toEqual([]);
    host.launch = { edition: 'yr', semanticsVersion: 36 };
    host.events = [new ObjectOwnerChangeEvent(unit, next)]; expect(check()).toEqual([]);
    host.events = [new ObjectOwnerChangeEvent({ ...unit, id: 6 }, previous)]; expect(check()).toEqual([]);
    host.events = [new ObjectOwnerChangeEvent(unit, previous)]; unit.isUnit = () => false; expect(check()).toEqual([]);
});

test('YR37 keeps the original Romanov capture node across Script20 third-house transfer and restores its original house', () => {
    const team = source.teams.get('05B84B7C')!;
    const instruction = source.scripts.get(team.script)!.instructions[0];
    expect(instruction.opcode).toBe(20); expect(instruction.params).toEqual(['4']);
    for (const [edition, version, preserves] of [['yr', 37, true], ['yr', 36, false], ['ra2', 37, false]] as const) {
        const german = { name: 'Germans' }, special = { name: 'Special' }, british = { name: 'British' };
        const romanov: any = { id: 1525, owner: german };
        romanov.mindControllableTrait = new MindControllableTrait(romanov);
        const controller: any = { owner: special };
        controller.mindControllerTrait = new MindControllerTrait(controller, 1);
        const world: any = { gameOpts: { campaign: { edition, semanticsVersion: version } },
            changeObjectOwner: (unit: any, owner: any) => {
                const previous = unit.owner; unit.owner = owner;
                unit.mindControllableTrait[NotifyOwnerChange.onChange](unit, previous, world);
            } };
        controller.mindControllerTrait.control(romanov, world);
        world.changeObjectOwner(romanov, british);
        expect(romanov.mindControllableTrait.getController()).toBe(preserves ? controller : undefined);
        expect(controller.mindControllerTrait.getTargets()).toEqual(preserves ? [romanov] : []);
        romanov.mindControllableTrait.restore(world);
        expect(romanov.owner).toBe(preserves ? german : british);
        expect(controller.mindControllerTrait.getTargets()).toEqual([]);
    }
});
