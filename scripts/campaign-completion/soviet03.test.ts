import { expect, test } from 'bun:test';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { campaignPlayerCountryIndex, campaignRouteFaction } from '../../src/data/campaign/CampaignMission';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { CampaignBaseBuilder, campaignBaseNodes } from '../../src/game/campaign/CampaignBaseBuilder';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { CountdownTimer } from '../../src/game/CountdownTimer';
import { EventType } from '../../src/game/event/EventType';
import { Country } from '../../src/game/Country';
import { CountryRules } from '../../src/game/rules/CountryRules';
import { TechnoRules } from '../../src/game/rules/TechnoRules';
import { IniFile } from '../../src/data/IniFile';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';
import { CampaignTeams, campaignParadropOrigin } from '../../src/game/campaign/CampaignTeams';
import { CampaignVehicleParadropTask } from '../../src/game/campaign/CampaignVehicleParadropTask';
import { Coords } from '../../src/game/Coords';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, sha256, retailMember } from '../test-support/resources';

const bytes = parseMix(requiredBytes('assets/ra2/maps02.mix'), 'maps02.mix').openFile('sov03u.map').getBytes();
expect(sha256(bytes)).toBe('a0ec1cd648f2b1f5cd122713d405b514634941977289080e22990021f8719c05');
const source = () => new CampaignDefinition('ra2', 'sov03u.map', new TextDecoder().decode(bytes));

test('the original Soviet 03 records retain all triggers and their required capabilities', () => {
    const definition = source(); definition.assertValid();
    expect([definition.triggers.size, definition.scripts.size, definition.teams.size, definition.aiTriggers.size]).toEqual([70, 23, 32, 11]);
    expect(campaignPreflight(definition, campaignCapabilities)).toEqual([]);
    expect(definition.triggers.get('0DC7AB70')!.actions.filter(action => [27, 23, 103].includes(action.opcode))
        .map(action => [action.opcode, action.params[1]])).toEqual([[27, '300'], [23, '0'], [103, 'MISSION:Sov03d']]);
    expect(definition.triggers.get('09152DB0')!.actions.map(action => action.opcode)).toEqual([56, 53, 11, 36, 16]);
});

test('original movie references distinguish camera movement, fullscreen endings and the two radar policies', () => {
    const art = new IniFile(retailMember('ra2', 'art.ini').file.readAsString()), refs = campaignMediaReferences(source(), art);
    expect(refs.filter(ref => ref.movieIndex !== undefined).map(ref => [ref.movieIndex, ref.use]))
        .toEqual([[75, 'transmission'], [79, 'transmission']]);
    const archive = parseMix(requiredBytes('assets/ra2/maps01.mix'), 'maps01.mix');
    const final = new CampaignDefinition('ra2', 'all12s.map', archive.openFile('all12s.map').readAsString());
    expect(campaignMediaReferences(final, art).filter(ref => ref.use === 'fullscreen').map(ref => ref.movieIndex)).toEqual([139, 143]);
    const eleventh = new CampaignDefinition('ra2', 'all11t.map', archive.openFile('all11t.map').readAsString());
    expect(campaignMediaReferences(eleventh, art).filter(ref => ref.use === 'transmission-paused').length).toBe(2);
    const first = new CampaignDefinition('ra2', 'all01t.map', archive.openFile('all01t.map').readAsString());
    const camera = [...first.triggers.values()].flatMap(trigger => trigger.actions).find(action => action.opcode === 48)!;
    expect(campaignMediaReferences(first, art).some(ref => ref.binding === `Actions.${camera.key}:${camera.index}`)).toBe(false);
});

test('custom scenario countries append after the original thirteen, retaining their parent identity', () => {
    const definition = source(), base = new IniFile(retailMember('ra2', 'rules.ini').file.readAsString());
    expect(campaignPlayerCountryIndex(definition, base)).toBe(13);
    const merged = base.clone().mergeWith(definition.ini), names = [...new Set(merged.getSection('Countries')!.entries.values())];
    const rules: any = { getCountry: (name: string) => new CountryRules(names.indexOf(name) as any).readIni(merged.getSection(name)) };
    const player = Country.factory('Player', rules as any), enemy = Country.factory('BadGuy1', rules as any);
    expect([player.id, enemy.id]).toEqual([13, 14] as any);
    expect(player.matchesCountry('Russians')).toBe(true); expect(player.matchesCountry('Americans')).toBe(false);
    expect(enemy.matchesCountry('Americans')).toBe(true);
    const tank = merged.getSection('TTNK')!;
    expect(TechnoRules.prototype.isAvailableTo.call({ requiredHouses: tank.getArray('RequiredHouses'),
        forbiddenHouses: tank.getArray('ForbiddenHouses') }, player)).toBe(true);
    expect(campaignRouteFaction('ra2', 'all01t.map')).toBe('allied');
    expect(campaignRouteFaction('ra2', 'trn01t.map')).toBe('tutorial');
    const ownerA = { country: { id: 13 } }, ownerB = { country: { id: 14 } };
    const host = { launch: { semanticsVersion: 4 }, houses: new Map([['Player House', ownerA], ['BadGuy1 House', ownerB]]) };
    expect((CampaignRuntime.prototype as any).resolveHouse.call(host, 13)).toBe(ownerA);
    expect((CampaignRuntime.prototype as any).resolveHouse.call(host, 14)).toBe(ownerB);
    expect(() => (CampaignRuntime.prototype as any).resolveHouse.call(host, 0)).toThrow('missing campaign house id');
});

test('the beacon is an original pending base node, not an initial placement or a scripted free spawn', () => {
    const definition = source(), nodes = campaignBaseNodes(definition);
    expect(nodes.filter(node => node.house === 'Other3 House')).toEqual([{ house: 'Other3 House', index: 0, type: 'NAPSYB', x: 101, y: 27 }]);
    expect([...definition.ini.getSection('Structures')!.entries.values()].some(raw => String(raw).split(',')[1] === 'NAPSYB')).toBe(false);
    expect(definition.triggers.get('0ADB3CB4')!.actions[0].params[1]).toBe('20');
    expect(definition.ini.getSection('Other3 House')!.getNumber('PercentBuilt')).toBe(99);
});

test('a mission countdown expires once, only after simulation ticks, with exact fractional-tick state', () => {
    const timer = new CountdownTimer(), events: any[] = [], game = { events: { dispatch: (event: any) => events.push(event) } };
    timer.setSeconds(2); timer.text = 'MISSION:Sov03d'; timer.start();
    for (let i = 0; i < 17; i++) timer.update(game);
    expect(timer.snapshot()).toEqual({ ticks: 13, running: true, text: 'MISSION:Sov03d' });
    timer.stop(); for (let i = 0; i < 100; i++) timer.update(game);
    expect(timer.snapshot().ticks).toBe(13); expect(events).toEqual([]);
    timer.start(); for (let i = 0; i < 14; i++) timer.update(game);
    expect(events.map(event => event.type)).toEqual([EventType.TimerExpire]);
    for (let i = 0; i < 100; i++) timer.update(game);
    expect(events.length).toBe(1);
});

test('tagged destruction and capture preserve their distinct failure and stage semantics', () => {
    const definition = source(), target = { id: 100, owner: 'owner' };
    const host: any = { launch: { semanticsVersion: 4 }, events: [], targets: () => [target], targetId: () => 'object:100',
        game: { alliances: { areAllied: (a: any) => a === 'ally' } } };
    const trigger = definition.triggers.get('083241FC')!, event = trigger.events[0];
    const check = (instruction: any) => (CampaignRuntime.prototype as any).check.call(host, instruction, trigger);
    host.events = [{ type: EventType.ObjectOwnerChange, target }]; expect(check(event)).toEqual([]);
    expect(check({ ...event, opcode: 29 })).toEqual([]);
    expect(check({ ...event, opcode: 48 })).toEqual([]);
    host.events = [{ type: EventType.ObjectDestroy, target, attackerInfo: { player: 'ally' } }]; expect(check(event)).toEqual([]);
    expect(check({ ...event, opcode: 29 })).toEqual(['object:100']);
    host.events = [{ type: EventType.ObjectDestroy, target, attackerInfo: { player: 'enemy' } }]; expect(check(event)).toEqual(['object:100']);
    host.events[0].incidental = true; expect(check(event)).toEqual([]);
});

test('source IFV and tank paradrops keep their vehicles, physical descent, and script wait until landing', () => {
    const definition = source(), spawn: any[] = [], tile = { rx: 82, ry: 46, onBridgeLandType: false };
    const disabled: boolean[] = [], types = new Map([['FV', 7], ['MTNK', 7], ['E1', 3]]);
    const game: any = { rules: { general: { paradrop: { paradropRadius: 1024 } } },
        map: { getTileZone: () => 0 }, createUnitForPlayer: (rules: any, owner: any) => ({ name: rules.name, rules, owner,
            position: {}, attackTrait: { isDisabled: () => false, setDisabled: (value: boolean) => disabled.push(value) },
            unitOrderTrait: { addTask: (task: any) => spawn.at(-1).task = task } }),
        spawnObject: (unit: any, target: any) => { unit.tile = target; spawn.push(unit); } };
    const manager: any = new CampaignTeams(definition, game, () => ({}), () => {}, 4);
    manager.rules = (name: string) => ({ name, type: types.get(name) }); manager.canSpawn = () => true;
    manager.freeSubCell = () => { throw new Error('Vehicles must not inherit an infantry sub-cell'); };
    manager.add = (team: any, unit: any) => team.members.push(unit);
    const plane = { tile, tileElevation: 9, traits: { get: () => ({ setEnabled() {} }) },
        unitOrderTrait: { hasTasks: () => true } };
    for (const [id, type] of [['099FE8EC', 'FV'], ['08D1E180', 'MTNK']]) {
        const original = definition.teams.get(id)!;
        expect(original.properties.Droppod).toBe('yes');
        const units = definition.taskForces.get(original.taskForce)!.units;
        expect(units).toEqual([{ type, count: 2 }]);
        const team: any = { members: [], flight: { plane, target: tile, remaining: [type, type], dropping: false } };
        manager.tickFlight(team); manager.tickFlight(team);
        expect(team.members.map((unit: any) => unit.name)).toEqual([type, type]);
        expect(team.members.every((unit: any) => unit.campaignParadropping && unit.position.tileElevation === 9
            && unit.position.subCell === undefined && unit.task instanceof CampaignVehicleParadropTask && !unit.task.cancellable)).toBe(true);
    }
    expect(disabled).toEqual([true, true, true, true]);
});

test('vehicle descent lands on an original bridge, restores attack state and rejects an invalid landing surface', () => {
    let disabled = false, destroyed = false;
    const unit: any = { tile: { onBridgeLandType: true }, rules: { speedType: 1 }, onBridge: true,
        position: { tileElevation: 4, moveByLeptons3: (step: any) => unit.position.tileElevation += Coords.worldToTileHeight(step.y) },
        get tileElevation() { return this.position.tileElevation; },
        moveTrait: { handleElevationChange() {} },
        attackTrait: { isDisabled: () => disabled, setDisabled: (value: boolean) => disabled = value } };
    const game = { rules: { general: { parachuteMaxFallRate: -5 } }, map: {
        tileOccupation: { getBridgeOnTile: () => ({ tileElevation: 2 }) }, terrain: { getPassableSpeed: () => 1 } },
        destroyObject: () => destroyed = true };
    const task = new CampaignVehicleParadropTask(game, unit); expect(disabled).toBe(true);
    let ticks = 0; while (!task.onTick(unit)) { if (++ticks > 100) throw new Error('Descent stalled'); }
    expect(ticks).toBeGreaterThan(1); expect(unit.tileElevation).toBe(2); expect(destroyed).toBe(false);
    task.onEnd(unit); expect(disabled).toBe(false); expect(unit.campaignParadropping).toBe(false);
    game.map.terrain.getPassableSpeed = () => 0;
    const blocked = new CampaignVehicleParadropTask(game, unit); expect(blocked.onTick(unit)).toBe(true);
    expect(destroyed).toBe(true); blocked.onEnd(unit);
});

test('house reinforcement edges use rectangular display directions rather than unrotated map axes', () => {
    expect(campaignParadropOrigin('East', { width: 200, height: 240 })).toEqual({ rx: 161, ry: 60 });
    expect(campaignParadropOrigin('West', { width: 200, height: 240 })).toEqual({ rx: 61, ry: 160 });
    expect(campaignParadropOrigin('North', { width: 200, height: 240 })).toEqual({ rx: 51, ry: 50 });
    expect(campaignParadropOrigin('South', { width: 200, height: 240 })).toEqual({ rx: 171, ry: 170 });
    expect(() => campaignParadropOrigin('unresolved', { width: 200, height: 240 })).toThrow('Unsupported');
});

test('version 4 journals retain their former percentage gate and RNG draw schedule', () => {
    const definition = source(), node = definition.ini.getSection('Other3 House')!;
    const pushes: any[] = [], draws: any[] = [], queue = { status: 0, push: (...args: any[]) => pushes.push(args) };
    const rules = { name: 'NAPSYB' }, owner = { name: 'Other3', production: {
        isAvailableForProduction: () => true, getQueueForObject: () => queue } };
    const game = { map: { tiles: { getByMapCoords: () => ({}) }, getGroundObjectsOnTile: () => [] },
        rules: { getBuilding: () => rules }, sellTrait: { computePurchaseValue: () => 50 },
        generateRandomInt: (...args: any[]) => { draws.push(args); return draws.length === 1 ? 100 : 1; } };
    const builder = new CampaignBaseBuilder(definition, game, reference => reference === 'Other3 House' ? owner : {}, new Set([owner]));
    node.set('PercentBuilt', '0'); builder.update(0); expect(pushes).toEqual([]); expect(draws).toEqual([]);
    node.set('PercentBuilt', '99'); builder.update(1); expect(pushes).toEqual([]);
    builder.update(2); expect(draws).toEqual([[1, 100]]);
    builder.update(16); expect(pushes).toEqual([[rules, 1, 50]]);
    expect(builder.snapshot()).toEqual({ next: [], decisionNext: [['Other3', 31]] });
    node.set('PercentBuilt', '100'); builder.update(31); expect(draws.length).toBe(2); expect(pushes.length).toBe(2);
});

test('source beacon production starts while the captured lab is still being sold, before the timed house handoff', () => {
    const definition = source(), pushed: any[] = [], rules = { name: 'NAPSYB' };
    const owner = { name: 'Other3', production: { isAvailableForProduction: () => true,
        getQueueForObject: () => ({ status: 0, push: (...args: any[]) => pushed.push(args) }) } };
    const game = { map: { tiles: { getByMapCoords: () => ({}) }, getGroundObjectsOnTile: () => [{ name: 'GATECH', isBuilding: () => true }] },
        rules: { getBuilding: () => rules }, sellTrait: { computePurchaseValue: () => 50 },
        getConstructionWorker: () => ({ canPlaceAt: () => { throw Error('An occupied sale site must not delay starting paid construction'); } }),
        generateRandomInt: () => { throw Error('No invented construction probability'); } };
    const builder = new CampaignBaseBuilder(definition, game, reference => reference === 'Other3 House' ? owner : {}, new Set([owner]), 5);
    builder.update(17592); expect(pushed).toEqual([[rules, 1, 50]]);
    expect(builder.trace).toEqual([{ tick: 17592, house: 'Other3', node: 0, type: 'NAPSYB', phase: 'queued' }]);
});

test('house-wide conversion releases loaded passengers before their transport recursively transfers ownership', () => {
    const owner: any = {}, destination = {}, transport: any = { owner }, passenger: any = { owner };
    owner.getOwnedObjects = () => [transport, passenger];
    const released: any[] = [], moved: any[] = [];
    const host = { trace: [], machine: { tick: 1 }, resolveHouse: (reference: any) => reference === 'source' ? owner : destination,
        teams: { release: (object: any) => released.push(object) }, game: { changeObjectOwner: (object: any, next: any) => {
            expect(released).toEqual([transport, passenger]); moved.push(object);
            object.owner = next; if (object === transport) passenger.owner = next;
        } } };
    (CampaignRuntime.prototype as any).execute.call(host, { opcode: 36, params: ['0', '14'], section: 'Actions', key: 'original', index: 0 }, { house: 'source' });
    expect(moved).toEqual([transport]); expect(passenger.owner).toBe(destination);
});
