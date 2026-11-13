import { expect, test } from 'bun:test';
import { CampaignDefinition, waypointNumber } from '../../src/data/campaign/CampaignDefinition';
import { CampaignYrRuntime } from '../../src/game/campaign/CampaignYrRuntime';
import { CampaignRuntime } from '../../src/game/campaign/CampaignRuntime';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { EventType } from '../../src/game/event/EventType';
import { SuperWeaponStatus } from '../../src/game/SuperWeapon';
import { Game } from '../../src/game/Game';
import { MapBounds } from '../../src/game/map/MapBounds';
import { CampaignMapFile } from '../../src/data/campaign/CampaignMapFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { IniFile } from '../../src/data/IniFile';
import { retailMember, retailIni, requiredBytes, sha256 } from '../test-support/resources';
import { campaignChronoScreenBytes, CHRONO_SCREEN_RESERVED_BYTES } from '../../src/engine/gfx/CampaignChronoScreenFx';
import { MAX_RENDER_PIXELS } from '../../src/engine/gfx/RenderResolution';

const source = (name: string) => {
    const bytes = requiredBytes(`campaign/yr/${name}/${name}.map`);
    return new CampaignDefinition('yr', name + '.map', bytes.toString(),
        new IniFile(retailMember('yr', 'aimd.ini').file.readAsString()), { semanticsVersion: 28, sourceSha256: sha256(bytes) });
};
const actions = (definition: CampaignDefinition, opcode: number) => [...definition.triggers.values()]
    .flatMap(trigger => trigger.actions.filter(action => action.opcode === opcode).map(action => ({ trigger, action })));

test('original chrono-screen phases retain source duration, 45 white frames and replay-stable world state', () => {
    const definition = source('sov01umd'), { action, trigger } = actions(definition, 127)[0];
    const game: any = { currentTick: 100 };
    const runtime = new CampaignYrRuntime(definition, game, {} as any);
    const duration = Number(action.params[1]);
    runtime.execute(action, trigger);
    const before = JSON.stringify(runtime.snapshot());
    expect(runtime.chronoScreenEffect(99)).toBeUndefined();
    expect(runtime.chronoScreenEffect(100)).toMatchObject({ phase: 'out', white: 0, warp: 0 });
    expect(runtime.chronoScreenEffect(100 + duration)).toMatchObject({ phase: 'hold', white: 1 });
    expect(runtime.chronoScreenEffect(100 + duration + 44)?.phase).toBe('hold');
    expect(runtime.chronoScreenEffect(100 + duration + 45)).toMatchObject({ phase: 'in', white: 1 });
    expect(runtime.chronoScreenEffect(100 + duration * 2 + 44)?.white).toBeCloseTo(1 / duration);
    expect(runtime.chronoScreenEffect(100 + duration * 2 + 45)).toBeUndefined();
    expect(runtime.chronoScreenEffect(100 + duration / 2)?.warp).toBeCloseTo(.001 * (duration / 2) * (duration / 2 + 1));
    expect(JSON.stringify(runtime.snapshot())).toBe(before);
    expect(campaignChronoScreenBytes({ campaign: { yr: runtime, definition } })).toBe(CHRONO_SCREEN_RESERVED_BYTES);
    expect(CHRONO_SCREEN_RESERVED_BYTES).toBe(MAX_RENDER_PIXELS * 4);
    expect(campaignChronoScreenBytes({ campaign: { definition } })).toBe(0);
    expect(campaignChronoScreenBytes({})).toBe(0);
});

test('YR30 Battle Fortress camera uses the original TeamType waypoint while older journals retain single-member admission', () => {
    const definition = source('sov02smd'), spec = definition.teams.get('098F40EC')!;
    const cell = { rx: 120, ry: 170 }, calls: any[] = [];
    const runtime: any = { launch: { edition: 'yr', semanticsVersion: 30 }, restoring: false,
        uiTeamCamera: (...args: any[]) => calls.push(args) };
    const team: any = { id: 1, type: spec.id, owner: {}, members: [{ isSpawned: true, tile: { rx: 30, ry: 40 } },
        { isSpawned: true, tile: { rx: 60, ry: 70 } }], line: 0, started: false, tasks: [], phase: 'active' };
    const host: any = { semanticsVersion: 30, definition, trace: [], require: () => spec,
        waypoint: (reference: number) => { expect(reference).toBe(waypointNumber(spec.properties.Waypoint)); return cell; },
        centerCamera: (...args: any[]) => (CampaignRuntime.prototype as any).centerTeamCamera.call(runtime, ...args),
        advance: (CampaignTeams.prototype as any).advance };
    (CampaignTeams.prototype as any).tickScript.call(host, team, 2445);
    expect(calls).toEqual([[cell, 4]]); expect(team.line).toBe(1);
    runtime.restoring = true;
    (CampaignRuntime.prototype as any).centerTeamCamera.call(runtime, team.members, 4, cell);
    expect(calls).toHaveLength(1);
    runtime.launch.semanticsVersion = 29;
    expect(() => (CampaignRuntime.prototype as any).centerTeamCamera.call(runtime, team.members, 4, cell))
        .toThrow('source center qualification');
});

test('Soviet06 type existence counts live transported units and attached overflight respects the original entering house', () => {
    const definition = source('sov06lmd'), owner = {}, other = {};
    const object: any = { name: 'NACNST', isDestroyed: false, limboData: {}, isSpawned: false };
    const game: any = { getCombatants: () => [{ getOwnedObjects: (include: boolean) => { expect(include).toBe(true); return [object]; } }] };
    const runtime = new CampaignYrRuntime(definition, game, { house: () => owner } as any);
    const exists = [...definition.triggers.values()].flatMap(trigger => trigger.events).find(event => event.opcode === 60)!;
    expect(runtime.check(exists, [], [])).toBe(true); object.isDestroyed = true;
    expect(runtime.check(exists, [], [])).toBe(false); object.isDestroyed = false;
    const cell = { rx: 3, ry: 4 }, overflight = [...definition.triggers.values()].flatMap(trigger => trigger.events)
        .find(event => event.opcode === 59)!;
    const event = { type: EventType.EnterTile, target: cell, source: { owner, zone: 2 } };
    expect(runtime.check(overflight, [cell], [event])).toEqual(['cell:3,4']);
    event.source.owner = other; expect(runtime.check(overflight, [cell], [event])).toEqual([]);
});

test('new current-state type conditions do not latch a temporary absence before the original delay', () => {
    const definition = new CampaignDefinition('yr', 'sov06lmd.map', '[Basic]\nPlayer=Russians\n[Houses]\n0=Russians\n[Russians]\nCountry=Russians\n'
        + '[Triggers]\nT=Russians,<none>,Gate,0,1,1,1,0\n[Events]\nT=2,61,2,0,NACNST,13,0,1\n[Actions]\nT=1,0,0,0,0,0,0,0,A\n');
    let absent = true; const called: number[] = [];
    const machine = new CampaignTriggerMachine(definition, 'normal', { targets: () => [], randomInt: minimum => minimum,
        condition: () => absent, action: () => called.push(machine.tick) }, 15, false, 28);
    machine.update(); absent = false;
    for (let tick = 0; tick < 16; tick++) machine.update();
    expect(called).toEqual([]); absent = true; machine.update(); expect(called).toEqual([17]);
});

test('Allied03 weapon charge and recharge actions distinguish original index, percent and frame fields', () => {
    const definition = source('all03umd'), weapons: any[] = [];
    const names = ['NukeSpecial', 'IronCurtainSpecial', 'LightningStormSpecial'];
    const owner = { superWeaponsTrait: { get: (name: string) => weapons[names.indexOf(name)] } };
    weapons[0] = { chargeTicks: 400, rechargeTicks: 1000, status: SuperWeaponStatus.Charging };
    const game: any = { currentTick: 100, rules: { getIni: () => new IniFile('[SuperWeaponTypes]\n0=NukeSpecial\n1=IronCurtainSpecial\n2=LightningStormSpecial\n') } };
    const runtime = new CampaignYrRuntime(definition, game, { owner: () => owner } as any);
    const charge = actions(definition, 129).find(row => row.action.params[1] === '0')!;
    runtime.execute(charge.action, charge.trigger); expect(weapons[0].chargeTicks).toBe(300);
    const recharge = actions(definition, 132).find(row => row.action.params[1] === '0')!;
    runtime.execute(recharge.action, recharge.trigger);
    expect(weapons[0].rechargeTicks).toBe(4500); expect(weapons[0].chargeTicks).toBe(300);
});

test('original announce-lose compares the serialized country against the local country, independently of trigger ownership', () => {
    const definition = source('all04dmd'), { action, trigger } = actions(definition, 68)[0], results: string[] = [];
    const game: any = { currentTick: 20, localPlayer: { country: { id: '0' } } };
    const runtime = new CampaignYrRuntime(definition, game, { result: result => results.push(result) } as any);
    runtime.execute(action, trigger); game.localPlayer.country.id = '8'; runtime.execute(action, trigger);
    expect(results).toEqual(['defeat', 'victory']);
});

test('source empty programs and null reinforcement retain exact records without deleting linked triggers', () => {
    const definition = source('all03umd'); definition.assertValid();
    expect(definition.dormantRecords).toHaveLength(5);
    expect(definition.ini.getSection('Events')!.getString('096E69BC')).toBe('0');
    expect(definition.triggers.get('096E69BC')!.linked).toBe('096E6AAC');
    expect(definition.triggers.get('09794DFC')!.actions[0].params).toEqual(['0', '0', '0', '0', '0', '0', 'A']);
    const changed = definition.source.replace('096E69BC=0', '096E69BC=1,8,0,0');
    const invalid = new CampaignDefinition('yr', 'all03umd.map', changed, undefined,
        { semanticsVersion: 28, sourceSha256: sha256(new TextEncoder().encode(changed)) });
    expect(invalid.dormantRecords).toEqual([]);
});

test('Soviet01 script transitions use the combined original registry without mutating any shared script or team', () => {
    const definition = source('sov01umd');
    const spec = [...definition.teams.values()].find(team => definition.scripts.get(team.script)?.instructions.some(line => line.opcode === 17))!;
    const script = definition.scripts.get(spec.script)!, line = script.instructions.findIndex(line => line.opcode === 17);
    const parameter = Number(script.instructions[line].params[0]), expected = [...definition.scripts.keys()][parameter];
    const before = JSON.stringify([...definition.scripts]);
    const team: any = { type: spec.id, members: [], line, started: false, tasks: [] };
    const host: any = { definition, require: () => spec, game: {}, semanticsVersion: 28 };
    (CampaignTeams.prototype as any).tickScript.call(host, team, 100);
    expect(team.script).toBe(expected); expect(team.line).toBe(0); expect(team.started).toBe(false);
    expect(JSON.stringify([...definition.scripts])).toBe(before); expect(spec.script).toBe(script.id);
});

test('Soviet01 Full reinforcements preload four Flak Tracks into their amphibious carrier without spawning trucks on water', () => {
    const definition = source('sov01umd'), spec = definition.teams.get('0B5CAEFC')!, ini = retailIni('yr').mergeWith(definition.ini);
    const owner = {}, target = { rx: 35, ry: 78 }, spawned: string[] = [], created: any[] = [];
    const rules = (name: string) => ({ name, passengers: ini.getSection(name)!.getNumber('Passengers'),
        size: ini.getSection(name)!.getNumber('Size', 1), sizeLimit: ini.getSection(name)!.getNumber('SizeLimit', 1) });
    const actor = (name: string): any => {
        const unit: any = { name, rules: rules(name), position: {}, owner, tile: target };
        if (unit.rules.passengers) unit.transportTrait = { units: [],
            getAvailableCapacity: () => unit.rules.passengers - unit.transportTrait.units.reduce((sum: number, cargo: any) => sum + cargo.rules.size, 0) };
        created.push(unit); return unit;
    };
    const host: any = { semanticsVersion: 28, definition, require: () => spec, house: () => owner, nextId: 1,
        instances: new Map(), waypoint: () => target, rules, add: (team: any, unit: any) => team.members.push(unit), loadPassengers() {},
        spawn: (name: string) => { spawned.push(name); if (name !== 'SAPC') throw Error('Ground truck cannot spawn on original water entry'); return actor(name); },
        game: { gameOpts: { campaign: {} }, createUnitForPlayer: (rule: any) => actor(rule.name) } };
    const before = JSON.stringify(definition.taskForces.get(spec.taskForce));
    const team = CampaignTeams.prototype.create.call(host, spec.id, true);
    expect(spawned).toEqual(['SAPC']); expect(created.map(unit => unit.name)).toEqual(['SAPC', 'HTK', 'HTK', 'HTK', 'HTK']);
    expect(team.members[0].transportTrait.units.map((unit: any) => unit.name)).toEqual(['HTK', 'HTK', 'HTK', 'HTK']);
    expect(team.members.slice(1).every(unit => unit.limboData.inTransport)).toBe(true);
    expect(team.members[0].transportTrait.getAvailableCapacity()).toBe(0);
    expect(JSON.stringify(definition.taskForces.get(spec.taskForce))).toBe(before);
    host.semanticsVersion = 27;
    expect(() => CampaignTeams.prototype.create.call(host, spec.id, true)).toThrow('Ground truck');
});

test('starting-building restoration can retire retained rubble without removing ownership or power a second time', () => {
    const calls: string[] = [], owner = {}, tile = {}, object: any = { id: 10, owner, tile, isDestroyed: true,
        isBuilding: () => true, rules: { leaveRubble: true } };
    const game: any = { map: { tileOccupation: { calculateTilesForGameObject: () => [tile],
        unoccupyTileRange: () => calls.push('unoccupy') }, technosByTile: { remove: () => calls.push('index') },
        terrain: { invalidateTiles: () => calls.push('terrain') } },
        world: { hasObjectId: () => true, removeObject: () => calls.push('world') },
        unspawnObject: () => { throw Error('Rubble was already unspawned by destruction'); } };
    Game.prototype.removeBuildingRubble.call(game, object);
    expect(calls).toEqual(['unoccupy', 'index', 'world', 'terrain']); expect(object.owner).toBe(owner);
    object.isDestroyed = false;
    expect(() => Game.prototype.removeBuildingRubble.call(game, object)).toThrow('Only retained');
});

test('Soviet01 original time travel can replace a disjoint player view while retaining the full source world', () => {
    const definition = source('sov01umd'), trigger = definition.triggers.get('0952ED0C')!;
    const action = trigger.actions.find(action => action.opcode === 40)!;
    const bounds = new MapBounds().fromMapFile({ fullSize: { width: 60, height: 139 },
        localSize: { x: 4, y: 5, width: 52, height: 84 } }, { getCutoffTileHeight: () => 9 });
    const full = { ...bounds.getFullSize() }, resized: any[] = [];
    bounds.onLocalResize.subscribe(() => resized.push({ ...bounds.getRawLocalSize() }));
    const host: any = { yr: { execute: () => false }, launch: { edition: 'yr', semanticsVersion: 28 }, trace: [], machine: { tick: 100 },
        game: { map: { mapBounds: bounds } } };
    (CampaignRuntime.prototype as any).execute.call(host, action, trigger);
    expect(bounds.getRawLocalSize()).toEqual({ x: 4, y: 104, width: 54, height: 33 });
    expect(bounds.getFullSize()).toEqual(full); expect(resized).toHaveLength(1);
    host.yr = undefined;
    const originalView = { ...action, params: ['0', '0', '4', '5', '52', '84', 'A'] };
    expect(() => (CampaignRuntime.prototype as any).execute.call(host, originalView, trigger)).toThrow('could not be applied');
});

test('Soviet03 reactor reinforcements outside the initial view remain inside the version29 scenario world', () => {
    const bytes = requiredBytes('campaign/yr/sov03umd/sov03umd.map');
    const map = new CampaignMapFile(VirtualFile.fromBytes(bytes, 'sov03umd.map'),
        { semanticsVersion: 29, sourceSha256: sha256(bytes) });
    const old = new MapBounds().fromMapFile(map, { getCutoffTileHeight: () => 9 });
    const full = new MapBounds(true).fromMapFile(map, { getCutoffTileHeight: () => 9 });
    const original = map.waypoints.filter(point => point.number >= 34 && point.number <= 45)
        .map(point => map.tiles.find(tile => tile.rx === point.rx && tile.ry === point.ry)!);
    expect(original).toHaveLength(12); expect(original.every(Boolean)).toBe(true);
    expect(original.some(tile => !old.isWithinBounds(tile))).toBe(true);
    expect(original.every(tile => full.isWithinBounds(tile))).toBe(true);
    for (const tile of original) expect(full.isWithinPlayerBounds(tile)).toBe(old.isWithinBounds(tile));
    expect(full.isWithinBounds({ dx: -100, dy: -100, z: 0 })).toBe(false);
    full.updateRawLocalSize({ x: 2, y: 2, width: 56, height: 77 }, true);
    expect(original.every(tile => full.isWithinBounds(tile))).toBe(true);
});
