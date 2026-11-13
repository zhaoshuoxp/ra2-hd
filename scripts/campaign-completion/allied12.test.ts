import { expect, test } from 'bun:test';
import { parseMix } from '../../src/offline/retail';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';
import { campaignMissionImplemented, campaignMissionSemantics } from '../../src/data/campaign/CampaignMission';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { requiredBytes, retailIni, retailMember, sha256 } from '../test-support/resources';
import { IniFile } from '../../src/data/IniFile';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { ObjectType } from '../../src/engine/type/ObjectType';

const file = parseMix(requiredBytes('assets/ra2/maps01.mix')).openFile('all12s.map');
const sourceSha256 = 'e6d31134742f8566a425a252113fa6b8e3f3eb178b00e34124deec4f7e11250b';
const read = () => new CampaignDefinition('ra2', 'all12s.map', file.readAsString(), undefined,
    { sourceSha256, semanticsVersion: 26 });

test('the original Allied finale retains its snow source, Kremlin protection, chronology and complete ending media', () => {
    expect(sha256(file.getBytes())).toBe(sourceSha256);
    const source = read(); source.assertValid();
    expect([source.triggers.size, source.scripts.size, source.teams.size, source.taskForces.size, source.aiTriggers.size])
        .toEqual([61, 22, 37, 55, 20]);
    expect(campaignPreflight(source, campaignCapabilities)).toEqual([]);
    expect(source.ini.getSection('Map')!.getString('Theater')).toBe('SNOW');
    expect(source.ini.getSection('Basic')!.getBool('EndOfGame')).toBe(true);
    expect(source.ini.getSection('Basic')!.getString('NextScenario')).toBe('ALL10S.map');
    expect(campaignMediaReferences(source, retailIni('ra2', 'art')).map(ref => [ref.binding, ref.name, ref.use]))
        .toEqual([
            ['Basic.Brief', 'a12_f00e', 'before-mission'], ['Basic.Win', 'a13_f01e', 'after-mission'],
            ['Basic.PostScore', 'a13_f02e', 'after-mission'], ['Actions.0AD699EC:0', 'a12_p01e', 'transmission'],
            ['Actions.0861E7EC:0', 'a12_p01e', 'transmission'], ['Actions.0CC9505C:0', 'a12_p02e', 'transmission'],
            ['Actions.0A5E684C:0', 'a13_f00e', 'fullscreen'], ['Actions.0AEE6E7C:0', 'a13_f01e', 'fullscreen'],
        ]);
    expect(campaignMissionImplemented('ra2', 'all12s.map')).toBe(true);
    expect(campaignMissionSemantics('all12s.map')).toBe(26);
});

test('securing the Kremlin requires all four original Apocalypse flags and all three defense-type conditions', () => {
    const source = read(), missing = new Set<string>(), calls: any[] = [];
    const machine = new CampaignTriggerMachine(source, 'normal', { targets: () => [], randomInt: minimum => minimum,
        condition: event => event.opcode === 57 && missing.has(event.params[1]),
        action: action => calls.push({ tick: machine.tick, opcode: action.opcode, parameter: action.params[1] }) }, 15, false, 26);
    for (const id of machine.states.keys()) machine.setEnabled(id, id === '0A5E6E1C');
    missing.add('20'); missing.add('67');
    for (const id of ['1', '2', '3']) machine.variables.set(id, true);
    machine.update(); expect(machine.states.get('0A5E6E1C')!.fired).toBe(0);
    machine.variables.set('4', true); machine.update();
    expect(machine.states.get('0A5E6E1C')!.fired).toBe(0);
    missing.add('53'); machine.update();
    expect(machine.states.get('0A5E6E1C')!.fired).toBe(1);
    expect(machine.states.get('086BC03C')!.enabled).toBe(true);
    expect(machine.states.get('0798A3B0')!.enabled).toBe(false);
    expect(calls.some(action => action.opcode === 1)).toBe(false);
    for (let tick = 0; tick < 180; tick++) machine.update();
    expect(calls.filter(action => action.opcode === 10).map(action => action.parameter)).toEqual(['139']);
    expect(machine.states.get('09726B10')!.fired).toBe(0);
});

test('destroying the protected Kremlin follows its original three-plus-two-second failure chain on every difficulty', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        const source = read(), calls: any[] = []; let missing = false;
        const machine = new CampaignTriggerMachine(source, difficulty, { targets: () => [], randomInt: minimum => minimum,
            condition: event => event.opcode === 57 && event.params[1] === '160' && missing,
            action: action => calls.push({ tick: machine.tick, opcode: action.opcode }) }, 15, false, 26);
        for (const id of machine.states.keys()) machine.setEnabled(id, id === '0A92362C');
        for (let tick = 0; tick < 20; tick++) machine.update();
        expect(calls).toEqual([]); missing = true; machine.update();
        for (let tick = 0; tick < 74; tick++) machine.update();
        expect(calls.some(action => [1, 2].includes(action.opcode))).toBe(false);
        machine.update();
        expect(calls.filter(action => [1, 2].includes(action.opcode))).toEqual([{ tick: 95, opcode: 2 }]);
    }
});

test('the duplicate internal ending reference remains source-disabled with no local enable or force edge', () => {
    const source = read(), id = '0AEE6E7C';
    expect(source.triggers.get(id)!.disabled).toBe(true);
    expect([...source.triggers.values()].some(trigger => trigger.linked === id || trigger.actions
        .some(action => [22, 53].includes(action.opcode) && action.params[1] === id))).toBe(false);
    expect([...source.scripts.values()].some(script => script.instructions.some(line => [17, 18].includes(line.opcode)))).toBe(false);
    expect(source.triggers.get('0AEE1F3C')!.events[0]).toMatchObject({ opcode: 36, params: ['0', '0'] });
    expect(source.scripts.get('0D808DBC')!.instructions.map(line => line.raw))
        .toEqual(['8,2', '39,5', '3,59', '39,0', '37,0']);
});

test('the original expanded AI library remains valid without a script transition that could enable the duplicate ending', () => {
    const source = new CampaignDefinition('ra2', 'all12s.map', file.readAsString(),
        new IniFile(retailMember('ra2', 'ai.ini').file.readAsString()), { sourceSha256, semanticsVersion: 26 });
    source.assertValid(); expect(campaignPreflight(source, campaignCapabilities)).toEqual([]);
    expect([source.teams.size, source.scripts.size, source.aiTriggers.size]).toEqual([140, 74, 127]);
    expect([...source.scripts.values()].some(script => script.instructions.some(line => [17, 18].includes(line.opcode)))).toBe(false);
    expect(source.triggers.get('0AEE6E7C')!.disabled).toBe(true);
});

test('the original first Chrono action list retains its null enable, completes in order and preserves older policies', () => {
    for (const version of [25, 26]) {
        const source = read(), actions: number[] = [];
        const machine = new CampaignTriggerMachine(source, 'normal', { targets: () => [], condition: () => false,
            randomInt: minimum => minimum, action: action => actions.push(action.opcode) }, 15, false, version);
        for (const id of machine.states.keys()) machine.setEnabled(id, id === '08E800F0');
        expect(source.triggers.get('08E800F0')!.actions[2]).toMatchObject({ opcode: 53, params: ['0', '0', '0', '0', '0', '0', 'A'] });
        for (let tick = 0; tick < 150; tick++) machine.update();
        if (version === 25) { expect(() => machine.update()).toThrow('Unknown campaign trigger: 0'); continue; }
        machine.update();
        expect(actions).toEqual([107, 41]); expect(machine.states.get('08E800F0')!.fired).toBe(1);
        expect(machine.states.get('09087AE4')!.enabled).toBe(true);
        expect(machine.states.get('0AE8DA4C')!.enabled).toBe(true);
        expect(machine.noEffectActions).toEqual([{ tick: 150, key: '08E800F0', index: 2,
            opcode: 53, reason: 'Retail null trigger pointer; no effect' }]);
        const snapshot = machine.snapshot(); machine.restore(snapshot);
        expect(machine.snapshot()).toEqual(snapshot);
        expect(() => machine.setEnabled('missing-real-trigger', true)).toThrow('Unknown campaign trigger');
    }
});

test('a synthetic literal trigger ID0 remains a real target under the new null-pointer policy', () => {
    const source = read();
    source.triggers.set('0', { ...source.triggers.get('0AE8DA4C')!, id: '0', disabled: true });
    const machine = new CampaignTriggerMachine(source, 'normal', { targets: () => [], condition: () => false,
        randomInt: minimum => minimum, action() {} }, 15, false, 26);
    for (const id of machine.states.keys()) machine.setEnabled(id, false);
    machine.force('08E800F0'); machine.update();
    expect(machine.states.get('0')!.enabled).toBe(true);
    expect(machine.noEffectActions).toEqual([]);
});

test('original elite SEALs retain their team rank and abilities through attached and detached paradrops', () => {
    const source = read(), spec = source.teams.get('0ABE46AC')!;
    expect(spec.properties.VeteranLevel).toBe('3');
    expect([...source.houses.values()].filter(house => house.playerControl).map(house => house.id))
        .toEqual(['Player House', 'Other2 House']);
    for (const version of [25, 26]) for (const detached of [false, true]) {
        const operations: string[] = [], ranks: number[] = [], tile = { rx: 17, ry: 39 };
        const rules = { type: ObjectType.Infantry }, game: any = { currentTick: 90,
            gameOpts: { campaign: { semanticsVersion: version } }, map: { getTileZone: () => 0 },
            rules: { general: { paradrop: { paradropRadius: 1024 } } },
            createUnitForPlayer: () => ({ position: {}, unitOrderTrait: { addTask() {} }, veteranTrait: {
                setVeteranLevel: (level: number) => { ranks.push(level); operations.push('rank'); },
                activateStartingAbilities: () => operations.push('abilities'),
            } }), spawnObject: () => operations.push('spawn') };
        const host: any = { semanticsVersion: version, definition: source, game, rules: () => rules,
            require: () => spec, canSpawn: () => true, freeSubCell: () => 0,
            add: (team: any, unit: any) => team.members.push(unit) };
        const plane = { tile, tileElevation: 6, traits: { get: () => ({ setEnabled() {} }) },
            unitOrderTrait: { hasTasks: () => true } };
        const team: any = { type: spec.id, owner: {}, members: [],
            flight: { plane, target: tile, remaining: ['GHOST'], dropping: false } };
        (CampaignTeams.prototype as any).tickFlight.call(host, team, detached);
        expect(ranks).toEqual(version >= 26 ? [2] : []);
        expect(operations).toEqual(version >= 26 ? ['rank', 'spawn', 'abilities'] : ['spawn']);
        expect(team.flight.remaining).toEqual([]);
    }
});
