import { expect, test } from 'bun:test';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { EventType } from '../../src/game/event/EventType';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, sha256 } from '../test-support/resources';

const bytes = parseMix(requiredBytes('assets/ra2/maps02.mix'), 'maps02.mix').openFile('sov08u.map').getBytes();
expect(sha256(bytes)).toBe('91817fa1585e631cd929b6356ccc29c99f1dfb8144c52cd225e3eeb924370b7e');
const source = new CampaignDefinition('ra2', 'sov08u.map', new TextDecoder().decode(bytes));

test('the eighth original map retains both White House routes, the eighteen-building stage and its difficulty-limited null action', () => {
    source.assertValid(); expect(campaignPreflight(source, campaignCapabilities)).toEqual([]);
    expect([source.triggers.size, source.scripts.size, source.teams.size, source.taskForces.size, source.aiTriggers.size])
        .toEqual([35, 43, 36, 44, 25]);
    expect(source.triggers.get('0C214B00')!.events[0].opcode).toBe(1);
    expect(source.triggerChain('0965C050')).toEqual(['0965C050', '0C214B00']);
    expect(source.triggers.get('0965C050')!.events[0].opcode).toBe(48);
    expect(source.triggers.get('08012920')!.events[0].params[1]).toBe('9');
    expect(source.triggers.get('07FB8F40')!.events[0]).toMatchObject({ opcode: 15, params: ['0', '18'] });
    const historical = source.triggers.get('09233C6C')!;
    expect(historical.disabled).toBe(false);
    expect(historical.difficulties).toEqual({ easy: false, normal: true, hard: true });
    expect(historical.actions.map(action => action.opcode)).toEqual([4, 4]);
    expect(historical.transferOnHijack).toBe(true); expect(source.tagsForTrigger(historical.id)).toEqual([]);
    expect(historical.actions[0].params.slice(0, 2)).toEqual(['0', '0']);
    expect(historical.actions[1].params[1]).toBe('0A11ADEC');
    expect([...source.triggers.values()].some(trigger => trigger.linked === historical.id
        || trigger.actions.some(action => [22, 53].includes(action.opcode) && action.params[1] === historical.id))).toBe(false);
});

test('targetless initial Attack retains its source identity and idle electric-assault units charge only adjacent own receivers', () => {
    const owner = {}, ally = {}, calls: any[] = [], objects: any[] = [];
    const tile = (x: number, y: number) => ({ rx: x, ry: y });
    const game: any = { map: { tiles: { getByMapCoords: tile },
        getObjectsOnTile: (where: any) => objects.filter(object => object.tile.rx === where.rx && object.tile.ry === where.ry) },
        world: { getAllObjects: () => objects } };
    const manager: any = new CampaignTeams(source, game, () => owner, () => {}, 10);
    manager.attack = (team: any, target: any, force: boolean) => calls.push({ unit: team.members[0], target, force });
    const unit: any = { name: 'SHK', owner, tile: tile(104, 27), isUnit: () => true, isInfantry: () => true,
        isSpawned: true, secondaryWeapon: { warhead: { rules: { electricAssault: true } } },
        unitOrderTrait: { hasTasks: () => false }, attackTrait: { isIdle: () => true } };
    manager.bindInitial(unit, { owner: 'Vlad2 House', rx: 104, ry: 27, subCell: 3 });
    expect(manager.initial.get(unit).mission).toBe('Attack'); expect(unit.guardMode).toBe(false);
    const receiver = (x: number, y: number, house = owner, chargeable = true): any => ({ owner: house,
        tile: tile(x, y), isUnit: () => false, isBuilding: () => true, isSpawned: true,
        overpoweredTrait: chargeable ? {} : undefined });
    const distant = receiver(108, 27), allied = receiver(104, 26, ally), ordinary = receiver(105, 26, owner, false);
    const own = receiver(103, 28); objects.push(unit, distant, allied, ordinary, own);
    manager.tickIdleCharging(); expect(calls).toEqual([{ unit, target: own, force: true }]);
    calls.length = 0; unit.unitOrderTrait.hasTasks = () => true; manager.tickIdleCharging(); expect(calls).toEqual([]);
    unit.unitOrderTrait.hasTasks = () => false; manager.assignments.set(unit, {}); manager.tickIdleCharging(); expect(calls).toEqual([]);
    const frozen: any = new CampaignTeams(source, game, () => owner, () => {}, 9);
    expect(() => frozen.bindInitial(unit, { owner: 'Vlad2 House', rx: 104, ry: 27, subCell: 3 })).toThrow('initial mission Attack');
});

test('building losses use the original owning-house significant-building counter rather than score totals, sales or captures', () => {
    let notify: (event: any) => void = () => {};
    const owner = { country: { id: 14 } }, other = { country: { id: 15 } }, invalid = { country: { id: -1 } };
    const host: any = { launch: { semanticsVersion: 10 }, definition: { triggers: new Map() },
        machine: { bindTargets() {} }, game: { events: { subscribe: (callback: any) => { notify = callback; } } },
        events: [], buildingLosses: new Map(), targets: () => [], resolveHouse: (reference: string) => {
            expect(reference).toBe('Vlad1'); return owner;
        } };
    CampaignRuntime.prototype.start.call(host);
    const destroy = (house = owner, building = true, insignificant = false, type = EventType.ObjectDestroy) => notify({ type,
        target: { owner: house, rules: { insignificant }, isBuilding: () => building } });
    const check = () => (CampaignRuntime.prototype as any).check.call(host, { opcode: 15, params: ['0', '18'] }, { house: 'Vlad1' });
    for (let i = 0; i < 17; i++) destroy(); expect(check()).toBe(false);
    destroy(owner, true, true); destroy(owner, false); destroy(other); destroy(invalid);
    destroy(owner, true, false, EventType.ObjectSell); destroy(owner, true, false, EventType.BuildingCapture);
    expect(check()).toBe(false); destroy(); expect(check()).toBe(true); destroy(); expect(check()).toBe(true);
    expect(host.buildingLosses.get(owner)).toBe(19); expect(host.buildingLosses.get(other)).toBe(1);
    host.launch.semanticsVersion = 9;
    expect(() => check()).toThrow('interpreter 10'); destroy(); expect(host.buildingLosses.get(owner)).toBe(19);
});

test('horizontal and vertical source lines recognize real tile string IDs while preserving old journals and owner/air boundaries', () => {
    const owner = {}, other = {}, cell = { id: '96_47', rx: 96, ry: 47 };
    const object = { id: 123, tile: cell, rx: 96, ry: 47 };
    const host: any = { launch: { semanticsVersion: 10 }, targets: () => [cell, object],
        targetId: (target: any) => 'object:' + target.id,
        resolveHouse: (reference: number) => { expect(reference).toBe(13); return owner; },
        events: [{ type: EventType.EnterTile, source: { owner, zone: 0 }, target: { rx: 74, ry: 47 } }] };
    const check = (opcode: number) => (CampaignRuntime.prototype as any).check.call(host,
        { opcode, params: ['0', '13'] }, {});
    expect(check(25)).toEqual(['object:96_47']); expect(check(26)).toEqual([]);
    host.events[0].target = { rx: 96, ry: 30 };
    expect(check(26)).toEqual(['object:96_47']); expect(check(25)).toEqual([]);
    host.events[0].source.owner = other; expect(check(26)).toEqual([]);
    host.events[0].source.owner = owner; host.events[0].source.zone = 1; expect(check(26)).toEqual([]);
    host.events[0].source.zone = 0; host.launch.semanticsVersion = 9; expect(check(26)).toEqual([]);
    host.launch.tileLineVersion = 1; expect(check(26)).toEqual(['object:96_47']);
    host.launch.semanticsVersion = 5; expect(check(26)).toEqual(['object:96_47']);
    delete host.launch.tileLineVersion; expect(check(26)).toEqual([]);
});

test('the explicit null Create Team has a documented no-effect executor; malformed and missing real references still fail', () => {
    const action = source.triggers.get('09233C6C')!.actions[0];
    const host: any = { launch: { semanticsVersion: 10 }, definition: source, machine: { tick: 0 }, trace: [], sourceQuirks: [],
        teams: { create() { throw Error('A null team must not be created'); } } };
    (CampaignRuntime.prototype as any).execute.call(host, action, source.triggers.get('09233C6C'));
    expect(host.sourceQuirks[0]).toMatchObject({ key: '09233C6C', kind: 'original-null-team-pointer', value: action.raw });
    host.launch.semanticsVersion = 9;
    expect(() => (CampaignRuntime.prototype as any).execute.call(host, action, {})).toThrow('interpreter 10');
    host.launch.semanticsVersion = 10; host.definition = { teams: new Map([['0', {}]]) };
    let created: unknown[] = []; host.teams.create = (...args: unknown[]) => { created = args; };
    (CampaignRuntime.prototype as any).execute.call(host, action, {}); expect(created).toEqual(['0', false, undefined]);
    for (const raw of ['4,1,0,0,0,0,0,A', '4,0,missing,0,0,0,0,A', '7,0,0,0,0,0,0,A']) {
        const text = '[Basic]\nPlayer=P\n[Houses]\n0=P\n[P]\nCountry=P\n'
            + '[Triggers]\nT=P,<none>,Reference,0,1,1,1,0\n[Events]\nT=1,8,0,0\n[Actions]\nT=1,' + raw + '\n';
        expect(() => new CampaignDefinition('ra2', 'missing-reference-fixture.map', text).assertValid()).toThrow('Missing team');
    }
});
