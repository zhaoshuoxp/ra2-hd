import { expect, spyOn, test } from 'bun:test';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { MapBounds } from '../../src/game/map/MapBounds';
import { CampaignGlobals, campaignStartGlobals } from '../../src/game/campaign/CampaignGlobals';
import { CampaignLightning, campaignLightningTiming } from '../../src/game/campaign/CampaignLightning';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { CountdownTimer } from '../../src/game/CountdownTimer';
import { TriggerExecutorFactory } from '../../src/game/trigger/TriggerExecutorFactory';
import { SuperWeaponFxHandler } from '../../src/engine/renderable/fx/handler/SuperWeaponFxHandler';
import { campaignUnitHdDemand } from '../../src/engine/renderable/builder/environmentMapDemand';
import { SuperWeaponsTrait } from '../../src/game/trait/SuperWeaponsTrait';
import { SuperWeaponType } from '../../src/game/type/SuperWeaponType';
import { EventType } from '../../src/game/event/EventType';
import { Warhead } from '../../src/game/Warhead';
import { validCampaignPresentation } from '../../src/game/campaign/CampaignCheckpoint';
import { CampaignMapFile } from '../../src/data/campaign/CampaignMapFile';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { CampaignBaseBuilder, campaignBaseNodes } from '../../src/game/campaign/CampaignBaseBuilder';
import { QueueStatus } from '../../src/game/player/production/ProductionQueue';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { LightningStormEffect } from '../../src/game/superweapon/LightningStormEffect';
import { retailIni, retailMember } from '../test-support/resources';
import { ShpFile } from '../../src/data/ShpFile';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, sha256 } from '../test-support/resources';
import { MovementZone } from '../../src/game/type/MovementZone';
import { ZoneType } from '../../src/game/gameobject/unit/ZoneType';
import { Coords } from '../../src/game/Coords';

const bytes = parseMix(requiredBytes('assets/ra2/maps02.mix'), 'maps02.mix').openFile('sov10t.map').getBytes();
const sourceHash = '5c3d8b26e05a0a73530630db8353637fa9ed7072144d5360e1ab994869428449';
expect(sha256(bytes)).toBe(sourceHash);
const text = new TextDecoder().decode(bytes), policy = { semanticsVersion: 12, sourceSha256: sourceHash };
const source = (value = text, version = policy) => new CampaignDefinition('ra2', 'sov10t.map', value, undefined, version);

test('the tenth original source retains broken/dormant records with a pinned conservative reachability qualification', () => {
    const definition = source(); definition.assertValid();
    expect(definition.source).toBe(text); expect(definition.teams.size).toBe(35); expect(definition.scripts.size).toBe(24);
    expect(definition.diagnostics.map(issue => issue.section)).toEqual(['07F9D710', '07F9D710']);
    expect(definition.blockingDiagnostics).toEqual([]);
    expect(definition.teams.get('07F9D710')!.script).toBeUndefined();
    expect(definition.aiTriggers.get('09E82060')!.enabled).toBe(false);
    expect([...definition.dormantScripts]).toEqual(['07055B40', '07A6828C']);
    expect(definition.scripts.get('07055B40')!.instructions[0].opcode).toBe(13);
    expect(definition.dormantRecords.map(record => record.key)).toEqual(['07F9D710', '07055D80', '07055B40', '07A6828C']);
    const issues = campaignPreflight(definition, campaignCapabilities);
    expect(issues).toEqual([]);
    expect(issues.some(issue => issue.reason.includes('Script opcode 13'))).toBe(false);
    expect(definition.triggers.get('0B16B91C')!.actions.filter(action => action.opcode === 90)).toHaveLength(4);
});

test('the real map loader receives verified source policy before its inherited parser validates original team records', () => {
    const file = VirtualFile.fromBytes(bytes, 'sov10t.map');
    const map = new CampaignMapFile(file, policy);
    expect(map.campaignDefinition.blockingDiagnostics).toEqual([]);
    expect(map.campaignDefinition.diagnostics).toHaveLength(2);
    expect(map.triggers).toHaveLength(59); expect(map.campaignDefinition.scripts.size).toBe(24);
    expect(map.localSize).toEqual({ x: 10, y: 41, width: 75, height: 97 });
    expect(sha256(file.getBytes())).toBe(sourceHash);
    expect(() => new CampaignMapFile(file)).toThrow('Missing script or task force');
});

test('expanded unused global AI templates do not consume mission HD reservations while original arrivals and frozen missions remain covered', () => {
    const expanded = new CampaignDefinition('ra2', 'sov10t.map', text, retailIni('ra2', 'ai'), policy);
    expanded.assertValid();
    const game: any = { campaign: { definition: expanded, launch: { semanticsVersion: 12 } },
        rules: { general: { paradrop: { paradropPlane: 'PDPLANE' } } } };
    const demand = campaignUnitHdDemand(game);
    for (const name of ['ORCA', 'CIV3', 'GHOST', 'SAPC', 'HTNK', 'SMCV']) expect(demand.has(name)).toBe(true);
    for (const name of ['CCOMAND', 'PTROOP', 'DESO', 'TERROR']) expect(demand.has(name)).toBe(false);
    const original = source();
    const dormant = new Set(original.dormantRecords.filter(record => record.section === 'TeamTypes').map(record => record.key));
    for (const team of original.teams.values()) if (!dormant.has(team.id)) {
        for (const unit of original.taskForces.get(team.taskForce)!.units) expect(demand.has(unit.type)).toBe(true);
    }
    game.campaign.launch.semanticsVersion = 11;
    expect(campaignUnitHdDemand(game).has('CCOMAND')).toBe(true);
    expect(expanded.teams.size).toBeGreaterThan(original.teams.size);
    expect([...expanded.taskForces.values()].some(force => force.units.some(unit => unit.type === 'CCOMAND'))).toBe(true);
});

test('initial Hunt retains original miner recruitment and scheduled harvesting rather than inventing a movement destination', () => {
    const unit: any = { name: 'CMIN', id: 1, isUnit: () => true, isInfantry: () => false, isAircraft: () => false,
        guardMode: true, defaultToGuardArea: true, unitOrderTrait: {
            addTask() { throw Error('Hunt binding must retain existing spawn work'); },
            cancelAllTasks() { throw Error('Hunt binding must retain existing spawn work'); },
        } };
    const teams: any = new CampaignTeams(source(), { map: {} } as any, () => undefined, undefined, 12);
    teams.bindInitial(unit, { owner: 'BadGuy2 House', rx: 94, ry: 145 });
    expect(teams.initial.get(unit)).toEqual({ group: -1, recruitable: true, mission: 'Hunt' });
    expect(teams.hunters.has(unit)).toBe(true); expect(unit.guardMode).toBe(false); expect(unit.defaultToGuardArea).toBe(false);
    const frozen: any = new CampaignTeams(source(), { map: {} } as any, () => undefined, undefined, 11);
    expect(() => frozen.bindInitial(unit, { owner: 'BadGuy2 House', rx: 94, ry: 145 })).toThrow('unsupported initial mission Hunt');
});

test('the original Nuke Buster enters in the air beyond the initial view without ground passability or ground-occupancy requirements', () => {
    const definition = source(), spec = definition.teams.get('08CC8B0C')!;
    const action = definition.triggers.get('08C8503C')!;
    expect(action.difficulties).toEqual({ easy: false, normal: true, hard: true });
    expect(action.actions[0]).toMatchObject({ opcode: 80 });
    expect(definition.ini.getSection('Waypoints')!.getString('95')).toBe('109034');
    const target = { rx: 34, ry: 109, z: 0 }, neighbor = { rx: 35, ry: 110, z: 0 };
    const rules = { name: 'ORCA', movementZone: MovementZone.Fly, speedType: 7 };
    const owner = {}, spawned: any[] = [], levels: number[] = [];
    const game: any = { rules: { general: { flightLevel: 1600 }, hasObject: (name: string, type: number) => name === 'ORCA' && type === 1,
        getObject: () => rules }, createUnitForPlayer: () => ({ rules, owner, position: {}, isInfantry: () => false,
            veteranTrait: { setVeteranLevel: (value: number) => levels.push(value) } }),
        map: { mapBounds: { isWithinBounds: () => false }, tiles: { getByMapCoords: (x: number, y: number) =>
            x === 35 && y === 110 ? neighbor : x === 34 && y === 109 ? target : undefined },
            terrain: { getPassableSpeed: () => 0 },
            getGroundObjectsOnTile: () => { throw Error('Air entry must not query ground blockers'); },
            getTileZone: () => { throw Error('Air entry must not use the ground zone'); },
            tileOccupation: { getAirObjectsOnTile: (tile: any) => tile === target ? [{ isDestroyed: false }] : [] } },
        spawnObject: (unit: any, tile: any) => { unit.position.tile = tile; spawned.push(unit); } };
    const teams: any = new CampaignTeams(definition, game, () => owner, undefined, 12);
    const unit = teams.spawn('ORCA', owner, target, spec);
    expect(spawned).toEqual([unit]); expect(unit.position.tile).toBe(neighbor);
    expect(unit.zone).toBe(ZoneType.Air); expect(unit.onBridge).toBe(false);
    expect(unit.position.tileElevation).toBe(Coords.worldToTileHeight(1600)); expect(levels).toEqual([1]);
    // Existing journals and ground/landing searches retain their strict path.
    const frozen: any = new CampaignTeams(definition, game, () => owner, undefined, 11);
    expect(() => frozen.spawn('ORCA', owner, target, spec)).toThrow('no passable reinforcement cell');
    expect(teams.canSpawn(unit, target)).toBe(false);
});

test('a zero-coordinate original base node stays in the plan and requests paid output before resolving an ordinary legal site', () => {
    const original = campaignBaseNodes(source()).find(node => node.house === 'BadGuy1 House' && node.index === 1);
    expect(original).toEqual({ house: 'BadGuy1 House', index: 1, type: 'GAPOWR', x: 0, y: 0 });
    const definition = new CampaignDefinition('ra2', 'automatic-base-node-fixture.map',
        '[Basic]\nPlayer=P\n[Houses]\n0=P\n[P]\nCountry=P\nNodeCount=2\n000=GAPOWR,0,0\n001=GARADR,7,7\n'
        + '[AI]\nBuildDefense=TESLA,ATESLA\nBuildDummy=GAPILL\n');
    const rules = { name: 'GAPOWR' }, defense = { name: 'ATESLA' }, objects: any[] = [], queued: any[] = [], placed: any[] = [], events: any[] = [];
    let readyRules: any = rules;
    const queue: any = { status: QueueStatus.Idle, getFirst: () => ({ rules }),
        push: (...args: any[]) => { queued.push(args); readyRules = args[0]; queue.status = QueueStatus.Active; },
        shift: () => { queue.status = QueueStatus.Idle; } };
    queue.getFirst = () => ({ rules: readyRules });
    const owner: any = { name: 'P', defeated: false, handicap: { buildDelay: 0 }, addUnitsBuilt() {},
        buildings: [{ id: 1, isSpawned: true, tile: { rx: 5, ry: 5 }, rules: { constructionYard: true } }],
        production: { getQueueForObject: () => queue, isAvailableForProduction: (item: any) => ['GAPOWR', 'ATESLA'].includes(item.name),
            getPrimaryFactory: () => undefined } };
    const worker = { canPlaceAt: (name: string, tile: any) => name === 'GAPOWR' ? tile.rx === 6 && tile.ry === 6 : tile.rx === 7 && tile.ry === 7,
        placeAt: (name: string, tile: any) => { placed.push([name, tile.rx, tile.ry]);
            const object = { name, tile, isBuilding: () => true, isDestroyed: false }; objects.push(object); return [object]; } };
    const game: any = { map: { mapBounds: { getFullSize: () => ({ width: 10, height: 10 }) },
        tiles: { getByMapCoords: (rx: number, ry: number) => {
            if (rx === 0 && ry === 0) throw Error('Unset coordinates are not a source tile');
            return rx > 0 && ry > 0 && rx <= 10 && ry <= 10 ? { rx, ry } : undefined;
        } }, getGroundObjectsOnTile: (tile: any) => objects.filter(object => object.tile.rx === tile.rx && object.tile.ry === tile.ry) },
        getConstructionWorker: () => worker, rules: { getIni: () => definition.ini,
            hasObject: (name: string) => ['GAPOWR', 'TESLA', 'ATESLA', 'GAPILL'].includes(name),
            getBuilding: (name: string) => { if (name === 'GARADR') throw Error('The obsolete name must not become a guessed radar alias');
                return name === 'GAPOWR' ? rules : name === 'ATESLA' ? defense : { name }; } },
        sellTrait: { computePurchaseValue: () => 800 }, traits: { filter: () => [] }, events: { dispatch: (event: any) => events.push(event) } };
    const builder = new CampaignBaseBuilder(definition, game, () => owner, new Set([owner]), 12);
    builder.update(0); expect(queued).toEqual([[rules, 1, 800]]); expect(placed).toEqual([]);
    expect((builder.snapshot() as any).automaticSites).toEqual([]);
    queue.status = QueueStatus.Ready; builder.update(1);
    expect(placed).toEqual([['GAPOWR', 6, 6]]); expect(events).toHaveLength(1);
    expect((builder.snapshot() as any).automaticSites).toEqual([['P:0', 6, 6]]);
    builder.update(2); expect(queued).toEqual([[rules, 1, 800], [defense, 1, 800]]);
    queue.status = QueueStatus.Ready; builder.update(3);
    expect(placed).toEqual([['GAPOWR', 6, 6], ['ATESLA', 7, 7]]);
    expect((builder.snapshot() as any).automaticTypes).toEqual([['P:1', 'ATESLA']]);
    builder.update(4); expect(queued).toHaveLength(2);
    expect(builder.nodes[0]).toMatchObject({ x: 0, y: 0 }); expect(builder.nodes[1].type).toBe('GARADR');
});

test('continued globals retain outgoing flags while retry restores incoming flags and direct starts have no history dependency', () => {
    const globals = new CampaignGlobals([[7, true], [4, false], [2, true]]);
    const campaign = { launch: { semanticsVersion: 12, incomingGlobals: [[3, true]] }, globals };
    expect(globals.get(4)).toBe(false); expect(globals.snapshot()).toEqual([[2, true], [7, true]]);
    expect(campaignStartGlobals(campaign, true)).toEqual([[2, true], [7, true]]);
    expect(campaignStartGlobals(campaign, false)).toEqual([[3, true]]);
    globals.set(7, false); expect(campaignStartGlobals(campaign, true)).toEqual([[2, true]]);
    expect(campaignStartGlobals(campaign, false)).toEqual([[3, true]]);
    expect(new CampaignGlobals().snapshot()).toEqual([]);
    expect(campaignStartGlobals({ launch: { semanticsVersion: 11 } }, true)).toBeUndefined();
    for (const invalid of [[[1, true], [1, false]], [[-1, true]], [[1, 'true']], [[1.5, true]], [[NaN, true]], {}]) {
        expect(() => new CampaignGlobals(invalid as any)).toThrow('Invalid campaign global');
    }
});

test('original Timer Set starts and resets the stopped mission deadline without a separate Timer Start action', () => {
    const definition = source(), trigger = definition.triggers.get('0B16933C')!, action = trigger.actions[0];
    expect(action.opcode).toBe(27);
    expect([...definition.triggers.values()].flatMap(trigger => trigger.actions).some(action => action.opcode === 23)).toBe(false);
    const timer = new CountdownTimer(), expired: any[] = [], game = { countdownTimer: timer,
        events: { dispatch: (event: any) => expired.push(event) } };
    const host: any = { launch: { semanticsVersion: 12 }, game, machine: { tick: 0 }, trace: [], targets: () => [],
        executorFactory: new TriggerExecutorFactory() };
    const execute = (value = action) => (CampaignRuntime.prototype as any).execute.call(host, value, trigger);
    execute(); expect(timer.snapshot()).toEqual({ ticks: 4500, running: true, text: null });
    for (let i = 0; i < 4499; i++) timer.update(game);
    expect(expired).toHaveLength(0); expect(timer.snapshot().ticks).toBe(1);
    timer.stop(); execute({ ...action, params: ['0', '2', ...action.params.slice(2)] });
    expect(timer.snapshot()).toEqual({ ticks: 30, running: true, text: null });
    for (let i = 0; i < 31; i++) timer.update(game);
    expect(expired).toHaveLength(1); expect(expired[0].type).toBe(EventType.TimerExpire);
    host.launch.semanticsVersion = 11; execute();
    expect(timer.snapshot()).toEqual({ ticks: 4500, running: false, text: null });
});

test('original global actions and current-state conditions do not latch a cleared flag into a later conjunction', () => {
    const fixture = new CampaignDefinition('ra2', 'global-condition-fixture.map', '[Basic]\nPlayer=P\n[Houses]\n0=P\n[P]\nCountry=P\n'
        + '[Triggers]\nT=P,<none>,Global and time,0,1,1,1,0\n[Events]\nT=2,27,0,7,13,0,1\n'
        + '[Actions]\nT=1,28,0,8,0,0,0,0,A\n');
    const globals = new CampaignGlobals(), host: any = { globals, launch: { semanticsVersion: 12 }, trace: [],
        targets: () => [], setGlobalVariable: (id: number, value: boolean) => globals.set(id, value) };
    host.machine = new CampaignTriggerMachine(fixture, 'normal', { targets: () => [],
        condition: (event, trigger) => (CampaignRuntime.prototype as any).check.call(host, event, trigger),
        action: (action, trigger) => (CampaignRuntime.prototype as any).execute.call(host, action, trigger) });
    globals.set(7, true); host.machine.update(); globals.set(7, false);
    for (let i = 0; i < 20; i++) host.machine.update();
    expect(globals.get(8)).toBe(false); expect(host.machine.states.get('T').fired).toBe(0);
    globals.set(7, true); host.machine.update(); expect(globals.get(8)).toBe(true);
    const action = { ...fixture.triggers.get('T')!.actions[0], opcode: 29 };
    (CampaignRuntime.prototype as any).execute.call(host, action, fixture.triggers.get('T'));
    expect(globals.get(8)).toBe(false);
    host.globals = undefined;
    expect(() => (CampaignRuntime.prototype as any).check.call(host, { opcode: 28, params: ['0', '7'] }, {})).toThrow('interpreter 12');
});

test('house discovery uses visible occupied cells, excludes hidden/limbo actors and remains known after reshroud', () => {
    const a = {}, b = {}, known = new Set<any>(), visible = new Set<number>();
    const make = (tiles: number[], extra: any = {}) => ({ tile: tiles, tileElevation: 0, isTechno: () => true,
        isSpawned: true, isDestroyed: false, rules: {}, ...extra });
    const objects = [make([1, 2]), make([3], { rules: { invisibleInGame: true } }), make([4], { isSpawned: false })];
    const owner = { getOwnedObjects: () => objects }, second = { getOwnedObjects: () => [make([5])] };
    const host: any = { launch: { semanticsVersion: 12 }, discoverySubjects: new Set([owner, second]), discoveredHouses: known,
        resolveHouse: (id: number) => id === 16 ? owner : second, targets: () => [],
        game: { localPlayer: a, mapShroudTrait: { getPlayerShroud: (player: any) => {
            expect(player).toBe(a); return { isShrouded: (cell: number) => !visible.has(cell) };
        } }, map: { tileOccupation: { calculateTilesForGameObject: (tiles: number[]) => tiles } } } };
    const refresh = () => (CampaignRuntime.prototype as any).refreshDiscovery.call(host);
    const check = () => (CampaignRuntime.prototype as any).check.call(host, { opcode: 5, params: ['0', '16'] }, b);
    visible.add(3); visible.add(4); refresh(); expect(check()).toBe(false);
    visible.add(2); refresh(); expect(check()).toBe(true); expect(known.has(second)).toBe(false);
    visible.clear(); refresh(); expect(check()).toBe(true);
    host.launch.semanticsVersion = 11; expect(() => check()).toThrow('interpreter 12');
});

test('single lightning queues one real timed damage cloud, without full weather, ownership substitution or repeated storms', () => {
    const events: any[] = [], calls: any[] = [], tile = { rx: 4, ry: 8, z: 0 }, bridge = { tileElevation: 2 };
    const game: any = { rules: { audioVisual: { weatherConClouds: ['WCCLOUD1'] }, general: { flightLevel: 1500,
        lightningStorm: { warhead: 'IonWH', damage: 250 } }, getWarhead: () => ({}) },
        art: { getAnimation: () => ({ animationFrameCount: 60, art: { getNumber: () => 900 } }) },
        generateRandomInt: (low: number, high: number) => { calls.push([low, high]); return 0; },
        events: { dispatch: (event: any) => events.push(event) }, map: { getTileZone: () => 0,
            tileOccupation: { getBridgeOnTile: () => bridge } }, createTarget: (object: any, at: any) => ({ object, tile: at }) };
    const lightning = new CampaignLightning(game), hits: any[][] = [];
    const damage = spyOn(Warhead.prototype, 'detonate').mockImplementation((...args: any[]) => { hits.push(args); });
    try {
        lightning.strike(tile); expect(calls).toEqual([[0, 0]]);
        expect(events.map(event => event.type)).toEqual([EventType.LightningStormCloud]);
        for (let i = 0; i < 30; i++) lightning.update(); expect(hits).toHaveLength(0);
        lightning.update(); expect(hits).toHaveLength(1);
        expect(hits[0][1]).toBe(250); expect(hits[0][2]).toBe(tile); expect(hits[0][3]).toBe(2);
        expect(hits[0][8]).toBeUndefined(); expect(hits[0][12]).toBe(true);
        expect(lightning.snapshot()).toEqual([{ tile: [4, 8], animationName: 'WCCLOUD1',
            elevation: 2 + Coords.worldToTileHeight(1500), duration: 60, remaining: 29, hitRemaining: 29 }]);
        const eventCount = events.length;
        expect(lightning.presentation()[0]).toMatchObject({ animationName: 'WCCLOUD1', frame: 31 });
        game.map.tileOccupation.getBridgeOnTile = () => undefined;
        expect(lightning.presentation()[0].position).toEqual(events[0].position);
        expect(events).toHaveLength(eventCount); expect(calls).toEqual([[0, 0]]);
        for (let i = 0; i < 90; i++) lightning.update();
        expect(lightning.snapshot()).toEqual([]); expect(hits).toHaveLength(1); expect(calls).toHaveLength(1);
    } finally { damage.mockRestore(); }
});

test('original lightning stages use each archived cloud frame count while frozen campaigns retain their accepted cadence', () => {
    const art = retailIni('ra2', 'art'), counts = [], hits = [];
    for (const name of ['WCCLOUD1', 'WCCLOUD2', 'WCCLOUD3']) {
        const frames = new ShpFile(retailMember('ra2', name.toLowerCase() + '.shp').file).numImages;
        const timing = campaignLightningTiming({ animationFrameCount: frames, art: art.getSection(name) });
        counts.push(frames); hits.push(timing.duration - timing.hitRemaining);
    }
    expect(counts).toEqual([59, 60, 60]); expect(hits).toEqual([72, 75, 75]);
    const events: any[] = [], game: any = { gameOpts: { campaign: { semanticsVersion: 11 } },
        rules: { audioVisual: { weatherConClouds: ['WCCLOUD1'] }, general: { flightLevel: 1500 } },
        generateRandomInt: () => 0, art: { getAnimation: () => ({ animationFrameCount: 59, art: art.getSection('WCCLOUD1') }) },
        map: { tileOccupation: { getBridgeOnTile: () => undefined } }, events: { dispatch: (event: any) => events.push(event) } };
    const cloud: any = new LightningStormEffect(SuperWeaponType.LightningStorm, undefined as any, { rx: 1, ry: 1, z: 0 });
    cloud.spawnCloudAt(cloud.tile, game);
    expect(cloud.clouds[0].durationTicks).toBe(144); expect(cloud.clouds[0].hitRemaining).toBeUndefined();
    expect(events[0].animationName).toBeUndefined();
    game.gameOpts.campaign.semanticsVersion = 12; cloud.spawnCloudAt(cloud.tile, game);
    expect(cloud.clouds[1]).toMatchObject({ durationTicks: 142, ticksLeft: 142, hitRemaining: 70 });
    expect(events[1].animationName).toBe('WCCLOUD1');
    expect(cloud.campaignSnapshot().clouds).toHaveLength(2);
});

test('original weather country lookup accepts a null owner without choosing one of three American child countries', () => {
    const definition = source(), trigger = definition.triggers.get('0B16B91C')!, actions = trigger.actions;
    const storm = { type: SuperWeaponType.LightningStorm }, traits: any = new SuperWeaponsTrait(), calls: any[] = [];
    traits.activateEffect = (...args: any[]) => calls.push(args);
    const host: any = { launch: { semanticsVersion: 12 }, trace: [], sourceQuirks: [], machine: { tick: 0 },
        houses: new Map(['BadGuy1', 'BadGuy2', 'BadGuy3'].map(name => [name, { country: { name, parentCountry: 'Americans' } }])),
        game: { rules: { hasCountry: (name: string) => name === 'Americans', superWeaponRules: new Map([['LightningStormSpecial', storm]]) },
            map: { getTileAtWaypoint: (id: number) => ({ id }) }, traits: { get: () => traits } },
        triggerOwner: CampaignRuntime.prototype['triggerOwner'] };
    const execute = (action: any) => (CampaignRuntime.prototype as any).execute.call(host, action, trigger);
    execute(actions[0]); expect(calls).toHaveLength(1); expect(calls[0][1]).toBeUndefined(); expect(calls[0][3]).toEqual({ id: 93 });
    (traits as any).effects.push({ type: SuperWeaponType.LightningStorm, owner: undefined, status: 1 });
    execute(actions[0]); expect(calls).toHaveLength(1);
    const owner: any = [...host.houses.values()][0]; host.legacyProductionRatios = new Map([[owner, { aircraft: 75, infantry: 75 }]]);
    const ratio = definition.triggers.get('09F40250')!.actions.find(action => action.opcode === 78)!;
    (CampaignRuntime.prototype as any).execute.call(host, ratio, { house: 'BadGuy1' });
    expect(host.legacyProductionRatios.get(owner)).toEqual({ aircraft: 75, infantry: 50 });
    expect(host.sourceQuirks.at(-1).kind).toBe('retained-original-legacy-team-ratio');
});

test('unattributed original storm damage omits the killer record while owned weather retains normal score attribution', () => {
    const tile = { rx: 167, ry: 172, z: 0 }, hits: any[][] = [], owner = { name: 'Player' };
    const damage = spyOn(Warhead.prototype, 'detonate').mockImplementation((...args: any[]) => { hits.push(args); });
    const game: any = { rules: { general: { lightningStorm: { warhead: 'IonWH', damage: 250 } }, getWarhead: () => ({}) },
        map: { getTileZone: () => 0, tileOccupation: { getBridgeOnTile: () => undefined } },
        createTarget: (object: any, tile: any) => ({ object, tile }) };
    try {
        for (const player of [undefined, owner]) {
            const effect: any = new LightningStormEffect(SuperWeaponType.LightningStorm, player as any, tile);
            effect.state = 1; effect.manifestEndTimer = 1; effect.nextDirectHitTimer = 10; effect.nextRandomHitTimer = 10;
            effect.clouds = [{ tile, durationTicks: 144, ticksLeft: 70, hitRemaining: 69 }];
            effect.onTick(game);
            expect(effect.campaignSnapshot().tile).toEqual([167, 172]);
        }
        expect(hits).toHaveLength(2); expect(hits[0][8]).toBeUndefined();
        expect(hits[1][8]).toEqual({ player: owner, weapon: undefined });
    } finally { damage.mockRestore(); }
});

test('camera snapshots remain optional for old saves and reject invalid coordinates', () => {
    const previous = { movies: [], speech: [], speechPolicy: 'restart-current-utterance' };
    expect(validCampaignPresentation(previous)).toBe(true);
    expect(validCampaignPresentation({ ...previous, cameraPan: { x: 512.5, y: -42 } })).toBe(true);
    expect(validCampaignPresentation({ ...previous, cameraPan: { x: NaN, y: 42 } })).toBe(false);
    expect(validCampaignPresentation({ ...previous, cameraPan: { x: 1, y: Infinity } })).toBe(false);
});

test('renderer initialization restores surviving lightning frames and remaining lighting without replaying damage, sound or simulation events', () => {
    const position = { x: 1, y: 2, z: 3 }, callbacks = new Map(), animations: any[] = [], lighting: any[] = [];
    const visual = { clouds: [{ position, animationName: 'WCCLOUD1', frame: 8 }],
        storms: [{ manifestTicks: 45, clouds: [{ position, animationName: 'WCCLOUD3', frame: 23 }] }] };
    const before = JSON.stringify(visual);
    const game: any = { campaign: { lightningPresentation: () => visual },
        generateRandomInt() { throw Error('Rendering must not consume simulation RNG'); },
        events: { subscribe: (type: number, callback: any) => { callbacks.set(type, callback); return { dispose: () => callbacks.delete(type) }; },
            dispatch() { throw Error('Restored presentation must not inject game events'); } },
        rules: { audioVisual: { weatherConClouds: ['WCCLOUD1', 'WCCLOUD2', 'WCCLOUD3'] }, general: { lightningStorm: { duration: 180 } } },
        map: { getIonLighting: () => ({}) } };
    const manager: any = { createTransientAnim: (name: string, setup: any) => {
        const anim = { name, worldSound: {}, position: undefined, overrides: undefined,
            setPosition(position: any) { this.position = position; }, setArtOverrides(overrides: any) { this.overrides = overrides; } };
        setup(anim); animations.push(anim); return anim;
    } };
    const handler = new SuperWeaponFxHandler(game, manager, { addEffect: effect => lighting.push(effect) });
    handler.init(); expect(animations).toHaveLength(0);
    handler.restoreCampaignWeather(); handler.restoreCampaignWeather();
    expect(JSON.stringify(visual)).toBe(before); expect(lighting).toHaveLength(1);
    expect(lighting[0].durationGameSeconds).toBe(3); expect(lighting[0].cloudAnims).toHaveLength(2);
    expect(animations.map(anim => [anim.name, anim.overrides.Start, anim.overrides.LoopStart, anim.worldSound])).toEqual([
        ['WCCLOUD3', '23', '23', undefined], ['WCCLOUD1', '8', '8', undefined] ]);
    callbacks.get(EventType.LightningStormCloud)({ position, animationName: 'WCCLOUD2' });
    expect(animations[2].worldSound).toEqual({}); expect(animations[2].overrides).toBeUndefined();
    handler.dispose(); expect(callbacks.size).toBe(0);
});

test('wrong identities, frozen interpreters and newly reachable records cannot use the dormant-source qualification', () => {
    for (const value of [{ ...policy, sourceSha256: '0'.repeat(64) }, { ...policy, semanticsVersion: 11 }]) {
        expect(() => source(text, value).assertValid()).toThrow('Missing script or task force');
    }
    const enabled = text.replace('09E82060=no', '09E82060=yes'); expect(enabled).not.toBe(text);
    expect(() => source(enabled).assertValid()).toThrow('Missing script or task force');
    const referenced = text.replace('4,1,07A6EF0C,', '4,1,07055D80,'); expect(referenced).not.toBe(text);
    const definition = source(referenced); expect(definition.dormantScripts.has('07055B40')).toBe(false);
    // The shared capability now exists, but released interpreter 12
    // still rejects a newly reachable idle command rather than skipping it.
    expect(campaignPreflight(definition, campaignCapabilities).some(issue => issue.reason.includes('Script opcode 13'))).toBe(false);
    const spec = definition.teams.get('07055D80')!, script = definition.scripts.get(spec.script)!;
    const team = { type: spec.id, members: [], line: script.instructions.findIndex(line => line.opcode === 13), started: false };
    expect(team.line).toBeGreaterThanOrEqual(0);
    const host = { require: () => spec, definition, semanticsVersion: 12 };
    expect(() => (CampaignTeams.prototype as any).tickScript.call(host, team, 1)).toThrow('interpreter 19');
});

test('source view expansion updates the shared bounds in place and rejects unsupported/silent resize outcomes', () => {
    const bounds = new MapBounds().fromMapFile({ fullSize: { width: 87, height: 144 },
        localSize: { x: 10, y: 41, width: 75, height: 97 } }, { getCutoffTileHeight: () => 9 });
    const host: any = { launch: { semanticsVersion: 12 }, trace: [], machine: { tick: 0 },
        game: { map: { mapBounds: bounds } } };
    const definition = source(), action = definition.triggers.get('07C0419C')!.actions.find(action => action.opcode === 40)!;
    const execute = (value = action) => (CampaignRuntime.prototype as any).execute.call(host, value, definition.triggers.get('07C0419C'));
    const hard = { ...bounds.getFullSize() }; execute();
    expect(host.game.map.mapBounds).toBe(bounds); expect(bounds.getFullSize()).toEqual(hard);
    expect(bounds.getRawLocalSize()).toEqual({ x: 1, y: 7, width: 84, height: 131 });
    host.launch.semanticsVersion = 11; expect(() => execute()).toThrow('interpreter 12');
    host.launch.semanticsVersion = 12;
    expect(() => execute({ ...action, params: ['0', '0', '12', '55', '10', '10', 'A'] })).toThrow('could not be applied');
    expect(bounds.getRawLocalSize()).toEqual({ x: 1, y: 7, width: 84, height: 131 });
});

test('the original camera-jump instruction reaches presentation independently of simulation and is suppressed during reconstruction', () => {
    const definition = source(), trigger = definition.triggers.get('0C6043EC')!, action = trigger.actions.find(action => action.opcode === 112)!;
    const calls: any[] = [], host: any = { launch: { semanticsVersion: 12 }, trace: [], machine: { tick: 31 },
        uiAction: (value: any) => calls.push(value) };
    const execute = () => (CampaignRuntime.prototype as any).execute.call(host, action, trigger);
    execute(); expect(calls).toEqual([action]); expect(host.machine.tick).toBe(31);
    host.restoring = true; execute(); expect(calls).toHaveLength(1);
    host.launch.semanticsVersion = 11; expect(() => execute()).toThrow('interpreter 12');
});
