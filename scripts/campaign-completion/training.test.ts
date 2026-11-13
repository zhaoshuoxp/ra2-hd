import { expect, test } from 'bun:test';
import { parseMix } from '../../src/offline/retail';
import { IniFile } from '../../src/data/IniFile';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { CampaignSourceParticles } from '../../src/game/campaign/CampaignSourceParticles';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { Prng } from '../../src/game/Prng';
import { campaignSkipsScore } from '../../src/gui/campaign/CampaignScoreModel';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { campaignMissionImplemented, campaignMissionSemantics } from '../../src/data/campaign/CampaignMission';
import { requiredBytes, retailMember, sha256 } from '../test-support/resources';

const file = parseMix(requiredBytes('assets/ra2/maps01.mix')).openFile('trn01t.map');
const sourceSha256 = '4dcec9e12f2541e4c15bf1e7da78c6ff74932c794837c35029a02de5bf43cd71';
const ai = () => new IniFile(retailMember('ra2', 'ai.ini').file.readAsString());
const read = (version = 26, library: IniFile | undefined = ai(), hash = sourceSha256) =>
    new CampaignDefinition('ra2', 'trn01t.map', file.readAsString(), library, { semanticsVersion: version, sourceSha256: hash });

const second = () => {
    const member = parseMix(requiredBytes('assets/ra2/maps01.mix')).openFile('trn02t.map');
    const hash = '35f7b531a8d0312ca7e44fa1da33f88dde1af48ac3781841bc74d3122c498445';
    expect(sha256(member.getBytes())).toBe(hash);
    return new CampaignDefinition('ra2', 'trn02t.map', member.readAsString(), ai(), { sourceSha256: hash, semanticsVersion: 27 });
};

test('the second original training retains its actual MCV entry, paid construction, infantry waves, source loss and SkipScore', () => {
    const source = second(); source.assertValid();
    expect(campaignPreflight(source, campaignCapabilities)).toEqual([]);
    expect(source.triggers.size).toBe(45); expect(source.aiTriggers.size).toBe(0);
    expect(source.houses.get('Player House')).toMatchObject({ credits: 5000, techLevel: 2, playerControl: true });
    expect(source.teams.get('0BEB05FC')!.properties.Waypoint).toBe('CM');
    expect(source.waypoints.get(90)).toEqual({ x: 5, y: 38 });
    expect(source.waypoints.get(18)).toEqual({ x: 23, y: 38 });
    expect(source.scripts.get(source.teams.get('0BEB05FC')!.script)!.instructions.map(line => line.raw))
        .toEqual(['3,18', '5,200']);
    for (const [team, count] of [['09AB3C8C', 5], ['0973C33C', 8]] as const) {
        expect(source.taskForces.get(source.teams.get(team)!.taskForce)!.units).toEqual([{ count, type: 'E1' }]);
    }
    expect(source.triggers.get('09E02BF0')!.events.map(event => [event.opcode, event.params[1]])).toEqual([[10, '14']]);
    expect(source.triggers.get('09E02EA0')!.events.map(event => [event.opcode, event.params[1]])).toEqual([[11, '13']]);
    expect(source.ini.getSection('Basic')!.getBool('SkipScore')).toBe(true);
    for (const key of ['Intro', 'Brief', 'Win', 'Lose', 'Action', 'PostScore']) {
        expect(source.ini.getSection('Basic')!.getString(key)).toBe('<none>');
    }
    for (const trigger of source.triggers.values()) {
        expect(trigger.difficulties).toEqual({ easy: true, normal: true, hard: true });
    }
});

test('the second training preserves both the destroyed-wave route and the successful-wave regroup with its second-wave delay', () => {
    for (const completed of [false, true]) {
        const source = second(), actions: any[] = [], lost = new Set<string>();
        const machine = new CampaignTriggerMachine(source, 'normal', {
            targets: trigger => [trigger.id], randomInt: minimum => minimum,
            condition: event => event.opcode === 48 ? lost.has(event.key) ? [event.key] : [] : false,
            action: action => actions.push({ ...action, tick: machine.tick }),
        }, 15, false, 27);
        for (const id of machine.states.keys()) machine.setEnabled(id, id === (completed ? '0909F130' : '091050B0'));
        if (completed) machine.variables.set('0', true); else lost.add('091050B0');
        const target = completed ? '098A0B80' : '09E06A00';
        machine.update(); const began = machine.states.get(target)!.enabledTick;
        for (let tick = 0; tick < (completed ? 899 : 74); tick++) machine.update();
        expect(actions.some(action => action.key === target)).toBe(false);
        machine.update();
        const stage = actions.filter(action => action.key === target);
        expect(stage.length).toBeGreaterThan(0);
        expect(stage[0].tick - began).toBe(completed ? 900 : 75);
        if (completed) {
            expect(actions.some(action => action.opcode === 4 && action.params[1] === '07FB10F4')).toBe(true);
            expect(stage.some(action => action.opcode === 4 && action.params[1] === '0973C33C')).toBe(true);
        }
        expect(actions.some(action => [1, 2].includes(action.opcode))).toBe(false);
    }
});

test('a completed foreign-house delivery releases its empty helicopter to the original return pool in27 only', () => {
    const source = read(27), delivery = source.teams.get('0D521B7C')!, returning = source.teams.get('0D6E0A4C')!;
    expect(delivery.house).toBe('Other1'); expect(delivery.properties.AreTeamMembersRecruitable).toBe('no');
    expect(source.scripts.get(delivery.script)!.instructions.map(line => line.raw))
        .toEqual(['3,1', '8,1', '39,0', '39,2', '20,15']);
    expect(returning.house).toBe('BadGuy2');
    expect(source.taskForces.get(returning.taskForce)!.units).toEqual([{ count: 1, type: 'SHAD' }]);
    expect(source.scripts.get(returning.script)!.instructions.map(line => line.raw)).toEqual(['3,21', '37,0']);
    for (const version of [26, 27]) {
        const original = { isAi: true }, owner: any = { isAi: true };
        const unit: any = { id: 1, name: 'SHAD', owner, rules: {}, isSpawned: true, isUnit: () => true,
            isInfantry: () => false, transportTrait: { units: [] },
            unitOrderTrait: { clearOrders: () => {}, cancelAllTasks: () => {} } };
        owner.getOwnedObjects = () => [unit];
        const manager: any = new CampaignTeams(source, { map: {}, rules: { getIni: () => source.ini } },
            reference => reference === 'Other1' ? original : owner, undefined, version);
        const previous: any = { id: 1, type: delivery.id, owner, members: [unit], phase: 'active', line: 5, tasks: [] };
        manager.instances.set(1, previous); manager.assignments.set(unit, previous); manager.nextId = 2;
        manager.tickScript(previous, 90);
        const next = manager.create(returning.id);
        expect(previous.phase).toBe(version === 27 ? 'finished' : 'holding');
        expect(next.members).toEqual(version === 27 ? [unit] : []);
        expect(next.phase).toBe(version === 27 ? 'active' : 'assembling');
    }
});

test('ground reinforcement entry rejects a passable isolated pocket when its first original movement has a reachable destination', () => {
    const cells = [{ rx: 0, ry: 0 }, { rx: 1, ry: 1 }, { rx: 3, ry: 3 }], destination = cells[2];
    for (const version of [26, 27]) {
        const spawned: any[] = [], unit = { rules: { speedType: 1, movementZone: 9 }, isInfantry: () => false };
        const host: any = { semanticsVersion: version, rules: () => unit.rules, canSpawn: () => true,
            waypoint: () => destination,
            definition: { scripts: new Map([['S', { instructions: [{ opcode: 3, params: ['18'] }] }]]) },
            game: { createUnitForPlayer: () => unit, spawnObject: (_: any, tile: any) => spawned.push(tile),
                map: { mapBounds: { isWithinBounds: () => true }, getTileZone: () => 0,
                    tiles: { getByMapCoords: (x: number, y: number) => cells.find(tile => tile.rx === x && tile.ry === y) },
                    terrain: { computePath: (_speed: any, _infantry: any, start: any, _bridge: any, end: any, _targetBridge: any, options: any) => {
                        expect(options.bestEffort).toBe(false);
                        return start === cells[0] ? [] : [{ tile: end }, { tile: start }];
                    } } } } };
        (CampaignTeams.prototype as any).spawn.call(host, 'AMCV', {}, cells[0], { id: 'T', script: 'S', properties: {} });
        expect(spawned).toEqual([version === 27 ? cells[1] : cells[0]]);
    }
});

test('training retains the exact empty trigger and orphan script with explicit source and expanded-library evidence', () => {
    expect(sha256(file.getBytes())).toBe(sourceSha256);
    const source = read(); source.assertValid();
    expect(source.triggers.size).toBe(72);
    expect(source.triggers.get('075109EC')).toMatchObject({ events: [], actions: [] });
    expect(source.scripts.get('0AD657AC')!.instructions.map(line => line.raw)).toEqual(['20,19', '18,362']);
    expect(source.dormantRecords.map(row => [row.section, row.key]))
        .toEqual([['Triggers', '075109EC'], ['ScriptTypes', '0AD657AC']]);
    expect(campaignPreflight(source, campaignCapabilities)).toEqual([]);
    expect(() => read(25).assertValid()).toThrow('Trigger requires events and actions');
    expect(() => read(26, ai(), '0'.repeat(64)).assertValid()).toThrow('Trigger requires events and actions');
    const machine = new CampaignTriggerMachine(source, 'normal', { targets: () => [], condition: () => false,
        randomInt: minimum => minimum, action: () => {} }, 15, false, 26);
    for (let tick = 0; tick < 100; tick++) machine.update();
    expect(machine.states.get('075109EC')!.fired).toBe(0);
});

test('an expanded-library reference revokes the orphan admission without deleting its unsupported instruction', () => {
    const library = ai(), team = library.getSection('TeamTypes')!.entries.values().next().value!;
    library.getSection(String(team))!.set('Script', '0AD657AC');
    const source = read(26, library);
    expect(source.dormantScripts.has('0AD657AC')).toBe(false);
    expect(campaignPreflight(source, campaignCapabilities).some(row => row.section === '0AD657AC'
        && row.reason === 'Script opcode 18 has no verified executor')).toBe(true);
});

test('both original training missions suppress the score through an explicit forward policy, preserving legacy journals', () => {
    for (const mission of ['trn01t.map', 'trn02t.map']) {
        const member = parseMix(requiredBytes('assets/ra2/maps01.mix')).openFile(mission);
        const definition = new CampaignDefinition('ra2', mission, member.readAsString(), ai(),
            { sourceSha256: sha256(member.getBytes()), semanticsVersion: 26 });
        definition.assertValid();
        expect(definition.ini.getSection('Basic')!.getBool('SkipScore')).toBe(true);
        expect(campaignSkipsScore({ launch: { semanticsVersion: 26 }, definition })).toBe(true);
        expect(campaignSkipsScore({ launch: { semanticsVersion: 25 }, definition })).toBe(false);
        expect(campaignPreflight(definition, campaignCapabilities)).toEqual([]);
        expect(campaignMissionSemantics(mission)).toBe(27);
        expect(campaignMissionImplemented('ra2', mission)).toBe(true);
        expect(campaignMissionImplemented('yr', mission.replace('.map', 'md.map'))).toBe(false);
    }
});

test('the original tank-destruction chain removes every system at its exact waypoint, preserves others and consumes no RNG', () => {
    const source = read(), ini = new IniFile(retailMember('ra2', 'rules.ini').file.readAsString()).mergeWith(source.ini);
    const origin = source.waypoints.get(0)!, tile = { rx: origin.x, ry: origin.y, z: 0 };
    const other = { ...tile, rx: tile.rx + 1 }, events: any[] = [];
    const game: any = { currentTick: 90, prng: new Prng(432), rules: { getIni: () => ini, audioVisual: { gravity: 6 } },
        events: { dispatch: (event: any) => events.push(event) }, map: { getTileAtWaypoint: (index: number) => index === 0 ? tile : undefined } };
    const particles = new CampaignSourceParticles(game);
    particles.create(2, tile); particles.create(2, { ...tile }); particles.create(2, other); particles.create(5, tile);
    for (let tick = 0; tick < 12; tick++) { particles.update(); game.currentTick++; }
    const before: any = particles.snapshot(), rng = game.prng.snapshot(), trigger = source.triggers.get('07CFFD8C')!;
    expect(before.smoke).toHaveLength(3); expect(before.sparks.systems).toHaveLength(1);
    const host: any = { launch: { semanticsVersion: 26 }, machine: { tick: 102 }, trace: [], particles, game };
    const machine = new CampaignTriggerMachine(source, 'normal', { targets: entry => entry.id === trigger.id ? ['tank'] : [],
        condition: event => event.key === trigger.id && event.opcode === 48 ? ['tank'] : false,
        randomInt: minimum => minimum,
        action: action => (CampaignRuntime.prototype as any).execute.call(host, action, trigger) }, 15, false, 26);
    for (const id of machine.states.keys()) machine.setEnabled(id, id === trigger.id);
    machine.notify([trigger.id], 48, () => ['tank']);
    const after: any = particles.snapshot();
    expect(after.smoke).toEqual([before.smoke[2]]); expect(after.sparks.systems).toEqual([]);
    expect(after.nextId).toBe(before.nextId); expect(game.prng.snapshot()).toEqual(rng);
    expect(events.filter(event => event.attachment?.position).some(event => !event.attachment.active)).toBe(true);
    expect(machine.states.get('07B72F3C')!.enabled).toBe(true);
    expect(machine.states.get('07AE7BAC')!.enabled).toBe(false);
    particles.showRestored(); expect(game.prng.snapshot()).toEqual(rng);
    host.launch.semanticsVersion = 25;
    expect(() => (CampaignRuntime.prototype as any).execute.call(host, trigger.actions[0], trigger)).toThrow('interpreter 26');
    particles.dispose();
});
