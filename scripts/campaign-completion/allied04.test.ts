import { expect, test } from 'bun:test';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, retailMember, sha256 } from '../test-support/resources';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { campaignCombatThreshold } from '../../src/game/campaign/CampaignCombatThreshold';
import { campaignMissionImplemented, campaignMissionSemantics } from '../../src/data/campaign/CampaignMission';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';
import { IniFile } from '../../src/data/IniFile';
import { EventType } from '../../src/game/event/EventType';
import { HealthTrait } from '../../src/game/gameobject/trait/HealthTrait';
import { SuperWeaponsTrait } from '../../src/game/trait/SuperWeaponsTrait';
import { LightningStormEffect } from '../../src/game/superweapon/LightningStormEffect';
import { SuperWeaponType } from '../../src/game/type/SuperWeaponType';
import { NotifySuperWeaponActivate } from '../../src/game/trait/interface/NotifySuperWeaponActivate';
import { findCampaignNavalEntry } from '../../src/game/map/findCampaignNavalEntry';
import { Terrain } from '../../src/game/map/Terrain';
import { MoveTask } from '../../src/game/gameobject/task/move/MoveTask';
import { Production } from '../../src/game/player/production/Production';
import { ObjectType } from '../../src/engine/type/ObjectType';
import { SoundHandler } from '../../src/gui/screen/game/SoundHandler';

const bytes = parseMix(requiredBytes('assets/ra2/maps01.mix')).openFile('all04u.map').getBytes();
const sourceSha256 = '09e52db16946a330c032e988679ef61ff7745670ddad5e9bfcf96f916d18d093';
expect(sha256(bytes)).toBe(sourceSha256);
const original = new CampaignDefinition('ra2', 'all04u.map', new TextDecoder().decode(bytes));

test('original Allied04 preserves the timed amplifier goal, three controlled houses, local overrides and complete films', () => {
    original.assertValid(); expect(campaignPreflight(original, campaignCapabilities)).toEqual([]);
    expect([original.triggers.size, original.scripts.size, original.teams.size, original.taskForces.size, original.aiTriggers.size])
        .toEqual([85, 59, 73, 40, 18]);
    expect([...original.houses.values()].filter(house => house.playerControl).map(house => [house.id, house.credits]))
        .toEqual([['Player House', 10000], ['PlayerAlt House', 0], ['PlayerAlt2 House', 0]]);
    const general = original.ini.getSection('General')!;
    expect(general.getNumberArray('TeamDelays')).toEqual([3000, 2000, 1000]);
    expect(general.getNumber('LightningStormDuration')).toBe(200);
    expect(general.getNumber('LightningDeferment')).toBe(1);
    expect(general.getNumber('LightningDamage')).toBe(1);
    expect(general.getBool('IonStorms')).toBe(false);
    expect(original.triggers.get('09AA2F3C')!.actions.find(action => action.opcode === 44)!.params[1]).toBe('200000');
    const art = new IniFile(retailMember('ra2', 'art.ini').file.readAsString());
    expect(campaignMediaReferences(original, art).map(ref => [ref.name, ref.use]))
        .toEqual([['a04_f00e', 'before-mission'], ['a04_f03e', 'after-mission'],
            ['a04_p02e', 'transmission'], ['a04_p01e', 'transmission']]);
    expect(campaignMissionSemantics('all03u.map')).toBe(17); expect(campaignMissionSemantics('all04u.map')).toBe(18);
    expect(campaignMissionImplemented('ra2', 'all04u.map')).toBe(true);
    // These quarter-health triggers are attached through linked capture tags.
    expect(original.tagsForTrigger('03FAED1C').map(tag => tag.id)).toContain('03FAE76C');
    expect(original.tagsForTrigger('03FAE58C').map(tag => tag.id)).toContain('03FAE38C');
    expect(original.tagsForTrigger('03FAE1AC').length).toBe(1);
    // The descriptive HARD name does not enable its all-zero source flags.
    expect(original.triggers.get('087DBCCC')!.difficulties).toEqual({ easy: false, normal: false, hard: false });
});

test('combat threshold dispatch uses actual per-hit raw strength, strict red bounds, attacker identity and one winning state', () => {
    const target: any = { traits: { filter: () => [] } }, events: any[] = [];
    const world: any = { traits: { filter: () => [] }, events: { dispatch: (entry: any) => events.push(entry) } };
    target.healthTrait = new HealthTrait(101, target, .5, .25);
    const attacker: any = { obj: { id: 2 }, player: { name: 'Friendly force fire' } };
    const hit = (before: number, damage: number, source: any = attacker) => {
        target.healthTrait.setHitPoints(before); events.length = 0;
        target.healthTrait.inflictDamage(damage, source, world);
        const entry = events.find(entry => entry.type === EventType.InflictDamage);
        return entry && campaignCombatThreshold(entry, .25);
    };
    expect(hit(101, 51)).toBeUndefined(); // floor(101/2)=50, equality is not below.
    expect(hit(50, 1)).toBe(39); expect(hit(49, 1)).toBeUndefined();
    expect(hit(101, 76)).toBe(40); // Crosses half and red: only red is reported.
    expect(hit(26, 1)).toBe(40); expect(hit(25, 1)).toBeUndefined();
    expect(hit(101, 101)).toBe(40); expect(hit(20, 30)).toBeUndefined();
    expect(hit(101, 76, null)).toBeUndefined();
    expect(hit(101, 76, { player: attacker.player })).toBeUndefined();
    expect(hit(40, -10)).toBeUndefined();
    target.healthTrait = new HealthTrait(100, target, .5, .25);
    expect(hit(26, 1)).toBeUndefined(); expect(hit(25, 1)).toBeUndefined();
    expect(hit(26, 2)).toBe(40);
});

test('attached threshold events use immutable damage observations and fail closed for frozen interpreter17', () => {
    const target: any = { id: 4, healthTrait: { getMaxHitPoints: () => 100 } };
    const host: any = { launch: { semanticsVersion: 18 }, targets: () => [target], targetId: () => 'object:4',
        game: { rules: { audioVisual: { conditionRed: .25 } } } };
    const trigger = original.triggers.get('03FADDFC')!, event = trigger.events[0];
    const entry: any = { type: EventType.InflictDamage, target, attacker: { obj: {} }, prevHealth: 100, currentHealth: 49, damageHitPoints: 51 };
    const check = (entries: any[]) => (CampaignRuntime.prototype as any).check.call(host, event, trigger, entries);
    expect(check([entry])).toEqual(['object:4']);
    expect(check([{ ...entry, target: { id: 5 } }])).toEqual([]);
    expect(check([{ ...entry, currentHealth: 20 }])).toEqual([]);
    expect(check([{ ...entry, type: EventType.ObjectDestroy }])).toEqual([]);
    host.launch.semanticsVersion = 17; expect(() => check([entry])).toThrow('interpreter 18');
});

test('targetless source storm samples full-map Y then X, keeps neutral ownership and explicit frames without changing rule weather', () => {
    const trait: any = new SuperWeaponsTrait(), draws: number[][] = [], events: any[] = [], notices: any[] = [];
    const tile = { rx: 3, ry: 4, z: 0 }, sequence = [0, 0, 4, 3];
    const game: any = { gameOpts: { campaign: { semanticsVersion: 18 } },
        map: { tiles: { getMapSize: () => ({ width: 7, height: 9 }), getByMapCoords: (x: number, y: number) => x === 3 && y === 4 ? tile : undefined } },
        generateRandomInt: (min: number, max: number) => { draws.push([min, max]); return sequence.shift(); },
        traits: { filter: () => [{ [NotifySuperWeaponActivate.onActivate]: (...args: any[]) => notices.push(args) }] },
        rules: { general: { lightningStorm: { deferment: 1, duration: 200 } } }, events: { dispatch: (event: any) => events.push(event) } };
    trait.startCampaignLightning(game, 200000);
    expect(draws).toEqual([[0, 8], [0, 6], [0, 8], [0, 6]]);
    const effect = trait.effects[0]; effect.onStart(game); effect.onTick(game);
    expect(effect.campaignSnapshot()).toMatchObject({ owner: null, tile: [3, 4], campaignDuration: 200000,
        manifestStartTimer: 0, manifestEndTimer: 200000 });
    expect(events.length).toBe(1); expect(events[0].owner).toBeUndefined();
    expect(notices).toEqual([[SuperWeaponType.LightningStorm, undefined, game, tile, undefined]]);
    expect(() => trait.startCampaignLightning(game, -1)).toThrow('Invalid original storm duration');
    trait.startCampaignLightning(game, 100); expect(trait.effects.length).toBe(1); expect(draws.length).toBe(4);
    expect(game.rules.general.lightningStorm.duration).toBe(200);
    const ordinary = new LightningStormEffect(SuperWeaponType.LightningStorm, undefined, tile);
    ordinary.onStart(game); expect(ordinary.campaignSnapshot()).toMatchObject({ manifestEndTimer: 200 });
    expect(ordinary.campaignSnapshot()).not.toHaveProperty('campaignDuration');
    game.gameOpts.campaign.semanticsVersion = 17;
    expect(() => trait.startCampaignLightning(game, 200000)).toThrow('interpreter 18');
});

test('original amplifier destruction stops the timer and follows its full delayed ending instead of immediate elimination victory', () => {
    let destroyed = false;
    const executed: { tick: number; key: string; opcode: number }[] = [];
    const machine = new CampaignTriggerMachine(original, 'normal', { targets: () => ['amplifier'],
        condition: (event, trigger) => event.opcode === 48 && trigger.id === '099353FC' && destroyed,
        action: action => executed.push({ tick: machine.tick, key: action.key, opcode: action.opcode }) });
    for (const id of machine.states.keys()) machine.setEnabled(id, id === '099353FC');
    destroyed = true; machine.update(); destroyed = false;
    expect(executed.filter(action => action.opcode === 1)).toEqual([]);
    expect(executed.some(action => action.key === '099353FC' && action.opcode === 24)).toBe(true);
    expect(machine.states.get('09AA2F3C')!.enabled).toBe(false);
    for (let i = 0; i < 1170; i++) machine.update();
    expect(executed.filter(action => action.opcode === 1).map(action => action.key)).toEqual(['0883C03C']);
    expect(executed.some(action => action.key === '0BC6598C' && action.opcode === 3)).toBe(true);
    expect(executed.some(action => action.key === '099353FC' && action.opcode === 100)).toBe(true);
});

test('original off-map ships physically enter through passable source water while ordinary terrain and interpreter17 stay bounded', () => {
    const cells = Array.from({ length: 6 }, (_,rx) => ({ rx, ry: 1, z: 0, landType: 7 }));
    const bounds = { isWithinBounds: (tile: any) => tile.rx >= 3 };
    const terrain: any = Object.assign(Object.create(Terrain.prototype), { mapBounds: bounds,
        rules: { getLandRules: (land: number) => ({ getSpeedModifier: () => land === 7 ? 1 : 0 }) },
        tileOccupation: { getObjectsOnTile: () => [] } });
    const starts: number[] = [];
    terrain.computePath = (_s: any, _i: any, start: any, _b: any, target: any) => {
        starts.push(start.rx); return bounds.isWithinBounds(start) ? [{ tile: target }, { tile: start }] : [];
    };
    const map: any = { mapBounds: bounds, terrain, getObjectsOnTile: () => [], getGroundObjectsOnTile: () => [],
        tiles: { getAllNeighbourTiles: (tile: any) => cells.filter(next => Math.abs(next.rx - tile.rx) === 1) } };
    const unit: any = { tile: cells[0], rules: { naval: true, speedType: 4 }, isInfantry: () => false, moveTrait: {} };
    expect(terrain.getPassableSpeed(cells[0], 4, false, false)).toBe(0);
    expect(findCampaignNavalEntry(map, unit, cells[5])!.map(tile => tile.rx)).toEqual([3, 2, 1, 0]);
    const game: any = { map, gameOpts: { campaign: { semanticsVersion: 18 } } };
    const task: any = new MoveTask(game, cells[5] as any, false, { campaignNavalEntry: true });
    expect(task.computeGroundPath(unit).path.map((node: any) => node.tile.rx)).toEqual([5, 3, 2, 1, 0]);
    expect(starts).toEqual([3]); expect(terrain.getPassableSpeed(cells[0], 4, false, false)).toBe(0);
    game.gameOpts.campaign.semanticsVersion = 17;
    expect(task.computeGroundPath(unit).path).toEqual([]); expect(starts).toEqual([3, 0]);
    cells[1].landType = 2; expect(findCampaignNavalEntry(map, unit, cells[5])).toBeUndefined();
    cells[1].landType = 7; cells[1].z = 2; expect(findCampaignNavalEntry(map, unit, cells[5])).toBeUndefined();
    cells[1].z = 0; unit.rules.naval = false; expect(findCampaignNavalEntry(map, unit, cells[5])).toBeUndefined();
});

test('the real MCV-to-construction-yard morph satisfies the original Build19 event once without treating starting buildings as construction', () => {
    const owner = {}, foreign = {}, building: any = { name: 'GACNST', rules: { index: 2 }, owner, isBuilding: () => true };
    const vehicle = { rules: { deploysInto: 'GACNST' }, isVehicle: () => true };
    const trigger = original.triggers.get('0854A38C')!;
    const host: any = { launch: { semanticsVersion: 18 }, targets: () => [], resolveHouse: () => owner };
    const check = (events: any[]) => (CampaignRuntime.prototype as any).check.call(host, trigger.events[0], trigger, events);
    const morph = { type: EventType.ObjectMorph, from: vehicle, to: building };
    expect(check([morph])).toBe(true); expect(check([])).toBe(false);
    expect(check([{ type: EventType.ObjectSpawn, target: building }])).toBe(false);
    expect(check([{ ...morph, to: { ...building, owner: foreign } }])).toBe(false);
    expect(check([{ ...morph, from: { ...vehicle, rules: { deploysInto: 'NAMISL' } } }])).toBe(false);
    host.launch.semanticsVersion = 17; expect(check([morph])).toBe(false);
    expect(check([{ type: EventType.BuildingPlace, target: building }])).toBe(true);
});

test('the explicit original NAMISL base node uses AI construction prerequisites while preserving human, legacy, factory and technology gates', () => {
    expect(original.ini.getSection('Russian3 House')!.getString('000')).toBe('NAMISL,43,82');
    const ini = new IniFile(retailMember('ra2', 'rules.ini').file.readAsString()).mergeWith(original.ini);
    const source = ini.getSection('NAMISL')!;
    expect(source.getArray('Prerequisite')).toEqual(['NATECH', 'NACNST']); expect(source.getNumber('Cost')).toBe(5);
    const missile: any = { name: 'NAMISL', type: ObjectType.Building, techLevel: source.getNumber('TechLevel'),
        buildLimit: source.getNumber('BuildLimit'), prerequisite: source.getArray('Prerequisite'), isAvailableTo: () => true };
    const host: any = { player: { isAi: true, campaignSemanticsVersion: 18, country: { name: 'Russian3' },
        buildings: new Set([{ name: 'NACNST' }, { name: 'NAPOWR' }]) }, gameOpts: { superWeapons: true }, maxTechLevel: 10,
        hasSecretProduction: () => false, hasFactoryFor: () => true, meetsStolenTech: () => true,
        meetsPrerequisites: (object: any) => Production.prototype.meetsPrerequisites.call(host, object) };
    const available = (node = false) => Production.prototype.isAvailableForProduction.call(host, missile, node);
    expect(available()).toBe(false); expect(available(true)).toBe(true);
    host.player.isAi = false; expect(available(true)).toBe(false); host.player.isAi = true;
    host.player.campaignSemanticsVersion = 17; expect(available(true)).toBe(false); host.player.campaignSemanticsVersion = 18;
    host.hasFactoryFor = () => false; expect(available(true)).toBe(false); host.hasFactoryFor = () => true;
    host.maxTechLevel = 9; expect(available(true)).toBe(false); host.maxTechLevel = 10;
    missile.type = ObjectType.Vehicle; expect(available(true)).toBe(false);
});

test('the source LightningPrintText flag suppresses both weather announcements while storm sound and legacy presentation remain', () => {
    const messages: string[] = [], sounds: any[] = [];
    const game: any = { campaign: { launch: { semanticsVersion: 18 } }, rules: { getIni: () => original.ini } };
    const handler: any = new SoundHandler(game, { playEffect: (...args: any[]) => sounds.push(args) }, {}, {}, {},
        { addSystemMessage: (text: string) => messages.push(text) }, { get: (key: string) => key }, {});
    const manifest = { target: { rx: 1, ry: 2, z: 0 } };
    handler.handleSuperWeaponActivateSound({ target: SuperWeaponType.LightningStorm, noSfxWarning: true });
    handler.handleLightningStormManifestSound(manifest);
    expect(messages).toEqual([]); expect(sounds.length).toBe(1);
    game.campaign.launch.semanticsVersion = 17;
    handler.handleSuperWeaponActivateSound({ target: SuperWeaponType.LightningStorm, noSfxWarning: true });
    handler.handleLightningStormManifestSound(manifest);
    expect(messages).toEqual(['TXT_LIGHTNING_STORM_APPROACHING', 'TXT_LIGHTNING_STORM']);
    expect(sounds.length).toBe(2);
});
