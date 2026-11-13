import { expect, test } from 'bun:test';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignYrRuntime } from '../../src/game/campaign/CampaignYrRuntime';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { Weapon } from '../../src/game/Weapon';
import { WeaponType } from '../../src/game/WeaponType';
import { normalizeSpeechText } from '../../src/engine/sound/EvaSpecs';
import { requiredBytes, retailIni } from '../test-support/resources';
import * as THREE from 'three';
import { authoredLightReference } from '../../src/engine/renderable/unitVxl/authoredLightReference';
import { LightingType } from '../../src/engine/type/LightingType';
import { GarrisonTrait } from '../../src/game/gameobject/trait/GarrisonTrait';
import { SellTrait } from '../../src/game/trait/SellTrait';

for (const blocked of [false, true]) test(`source fire sale resolves every garrison resident before building disposal (${blocked ? 'blocked' : 'open'} exit)`, () => {
    for (const policy of [47, 48]) {
        const owner: any = { isAi: true, credits: 0 }, units = Array.from({ length: 3 }, (_, id) => ({
            id, owner, isSpawned: false, isDestroyed: false, limboData: {}, rules: { speedType: 1 },
            unitOrderTrait: { addTask() {} } }));
        const destroyed: any[] = [], evacuated: any[] = [], ordering: string[] = [];
        const building: any = { owner, tile: { rx: 10, ry: 10, z: 0 },
            art: { foundation: { width: 1, height: 1 } }, rules: { cost: 0, soylent: 0, techLevel: -1 },
            isDestroyed: false, isBuilding: () => true,
            dispose: () => { ordering.push('dispose'); } };
        const trait: any = new GarrisonTrait(building, .25, 3);
        trait.units.push(...units);
        building.traits = { filter: () => [trait] };
        const game: any = { gameOpts: { campaign: { edition: 'yr', semanticsVersion: policy } },
            map: { tiles: { getByMapCoords: (rx: number, ry: number) => blocked ? undefined : { rx, ry, z: 0 } },
                mapBounds: { isWithinBounds: () => true },
                terrain: { getPassableSpeed: () => 1, findObstacles: () => [] } },
            unlimboObject: (unit: any) => { unit.isSpawned = true; unit.limboData = undefined; evacuated.push(unit); ordering.push('evacuate'); },
            destroyObject: (unit: any) => { unit.isDestroyed = true; destroyed.push(unit); ordering.push('destroy'); },
            changeObjectOwner: () => { throw Error('Sale must retain the seller for refund and source attribution'); },
            events: { dispatch() {} }, getConstructionWorker: (seller: any) => ({
                unplace: (_target: any, done: () => void) => { expect(seller).toBe(owner); ordering.push('unplace'); done(); } }) };
        new SellTrait(game, { refundPercent: .5 }).sell(building);
        if (policy === 47) {
            expect(trait.getOccupants()).toEqual(units);
            expect(evacuated).toEqual([]); expect(destroyed).toEqual([]);
        } else {
            expect(trait.getOccupants()).toEqual([]);
            expect(blocked ? destroyed : evacuated).toEqual(units);
            expect(units.every(unit => unit.isDestroyed || unit.isSpawned)).toBe(true);
            expect(ordering.slice(-2)).toEqual(['unplace', 'dispose']);
        }
        expect(building.owner).toBe(owner);
    }
});

test('original Gattling AA range is independent of its shorter ground weapon while released journals retain their range', () => {
    const ini = retailIni('yr');
    const primary = ini.getSection('AGGattling')!.getNumber('Range');
    const secondary = ini.getSection('AAGattCann')!.getNumber('Range');
    expect(secondary).toBeGreaterThan(primary);
    const getter = Object.getOwnPropertyDescriptor(Weapon.prototype, 'range')!.get!;
    const unit: any = { rules: { isGattling: true }, isBuilding: () => true,
        owner: { campaignSemanticsVersion: 46 }, primaryWeapon: { rules: { range: primary } } };
    const weapon = { gameObject: unit, type: WeaponType.Secondary, rules: { range: secondary } };
    expect(getter.call(weapon)).toBe(secondary);
    unit.owner.campaignSemanticsVersion = 45; expect(getter.call(weapon)).toBe(primary);
    delete unit.owner.campaignSemanticsVersion; expect(getter.call(weapon)).toBe(secondary);
    unit.rules.isGattling = false; expect(getter.call(weapon)).toBe(primary);
});

test('original critical-yard absence stays false through the paired MCV form and becomes true after both forms are lost', () => {
    const definition = new CampaignDefinition('yr', 'all07smd.map', requiredBytes('campaign/yr/all07smd/all07smd.map').toString());
    const event = definition.triggers.get('0A57F46C')!.events[0];
    const objects: any[] = [{ name: 'NACNST', rules: {}, isDestroyed: false }];
    const game: any = { gameOpts: { campaign: { edition: 'yr', semanticsVersion: 46 } },
        getAllPlayers: () => [{ getOwnedObjects: () => objects }] };
    const runtime = new CampaignYrRuntime(definition, game, {} as any);
    expect(runtime.check(event, [], [])).toBe(false);
    objects[0] = { name: 'SMCV', rules: { deploysInto: 'NACNST' }, isDestroyed: false };
    expect(runtime.check(event, [], [])).toBe(false);
    game.gameOpts.campaign.semanticsVersion = 45; expect(runtime.check(event, [], [])).toBe(true);
    game.gameOpts.campaign.semanticsVersion = 46; objects[0].isDestroyed = true;
    expect(runtime.check(event, [], [])).toBe(true);
});

test('original dialog Windows punctuation survives the subtitle path as real apostrophes and dashes', () => {
    expect(normalizeSpeechText('Yuri\u0092s forces\u0097don\u0092t let them through!'))
        .toBe('Yuri’s forces—don’t let them through!');
    expect(normalizeSpeechText("I'll be back.")).toBe("I'll be back.");
});

test('original Allied06 escort script can acquire its friendly Parliament occupation destination', () => {
    const definition = new CampaignDefinition('yr', 'all06umd.map', requiredBytes('campaign/yr/all06umd/all06umd.map').toString());
    const script = [...definition.scripts.values()].find(script => script.instructions.some(line =>
        line.opcode === 46 && line.params[0] === '131388'))!;
    expect(script).toBeDefined();
    const parameter = Number(script.instructions.find(line => line.opcode === 46)!.params[0]);
    const owner = {}, unit: any = { isSpawned: true, tile: { rx: 10, ry: 10 },
        isInfantry: () => true, rules: { occupier: true } };
    const parliament = { id: 1, isTechno: () => true, isBuilding: () => true, isSpawned: true, isDestroyed: false,
        owner, tile: { rx: 12, ry: 12 }, rules: { index: parameter & 0xffff },
        garrisonTrait: { canBeOccupied: () => true } };
    const host: any = { semanticsVersion: 46, game: { world: { getAllObjects: () => [parliament] },
        isValidTarget: () => true, alliances: { areAllied: () => false } } };
    const team = { owner, members: [unit] };
    expect((CampaignTeams.prototype as any).findTarget.call(host, team, 46, parameter)).toBe(parliament);
    host.semanticsVersion = 45;
    expect((CampaignTeams.prototype as any).findTarget.call(host, team, 46, parameter)).toBeUndefined();
});

test('units created under different local lights share one authored reference while current lighting remains distinct', () => {
    const base = { red: .9, green: 1, blue: .8, ambient: .75, ground: .1 };
    const make = (local: number) => ({ lighting: { getBaseAmbient: () => base },
        objectArt: { lightingType: LightingType.Full }, rules: { audioVisual: { extraUnitLight: .15 } },
        baseShpExtraLight: new THREE.Vector3(local, local, local) });
    const first = authoredLightReference(make(-.5)), second = authoredLightReference(make(.8));
    expect(first.toArray()).toEqual(second.toArray());
    expect(first.x).toBeCloseTo(.9 * .85 + .15 - 1);
    const current = new THREE.Vector3(.1, .2, .3);
    const ratio = (reference: THREE.Vector3) => current.clone().addScalar(1).divide(reference.clone().addScalar(1));
    expect(ratio(first).toArray()).toEqual(ratio(second).toArray());
    expect(ratio(first).x).not.toBe(ratio(first).y);
});
