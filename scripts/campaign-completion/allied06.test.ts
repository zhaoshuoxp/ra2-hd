import { expect, test } from 'bun:test';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, retailMember, sha256 } from '../test-support/resources';
import { IniFile } from '../../src/data/IniFile';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { campaignMissionImplemented, campaignMissionSemantics } from '../../src/data/campaign/CampaignMission';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { GarrisonTrait } from '../../src/game/gameobject/trait/GarrisonTrait';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { CampaignAi } from '../../src/game/campaign/CampaignAi';

const bytes = parseMix(requiredBytes('assets/ra2/maps01.mix')).openFile('all06u.map').getBytes();
const sourceSha256 = '9e02b8fa4c570000c2bb34c9b0e702b143e2e93ae529faa36556e1f43af0f922';
expect(sha256(bytes)).toBe(sourceSha256);
const text = new TextDecoder().decode(bytes), policy = { sourceSha256, semanticsVersion: 20 };
const read = (value = text, admission = policy) => new CampaignDefinition('ra2', 'all06u.map', value, undefined, admission);

test('original Allied06 preserves Pentagon defense, both enemy houses, intact source AI and actual media', () => {
    const original = read(); original.assertValid(); expect(campaignPreflight(original, campaignCapabilities)).toEqual([]);
    expect([original.triggers.size, original.scripts.size, original.teams.size, original.taskForces.size, original.aiTriggers.size])
        .toEqual([74, 51, 65, 50, 57]);
    expect(original.ini.getSection('Map')!.getString('Theater')).toBe('URBAN');
    expect(original.ini.getSection('SpecialFlags')!.getBool('DestroyableBridges')).toBe(false);
    expect(original.ini.getSection('Basic')!.getBool('IgnoreGlobalAITriggers')).toBe(true);
    expect(original.ini.getSection('General')!.getNumberArray('TeamDelays')).toEqual([1500, 1250, 1000]);
    expect(original.triggers.get('0AFEB7FC')!.events.map(event => event.params)).toEqual([['0', '15'], ['0', '14']]);
    expect(original.triggers.get('0B1A8A1C')!.events[0].opcode).toBe(48);
    expect(original.triggers.get('0AD1988C')!.events[0].params).toEqual(['0', '5']);
    const art = new IniFile(retailMember('ra2', 'art.ini').file.readAsString());
    expect(campaignMediaReferences(original, art).map(ref => [ref.name, ref.use]))
        .toEqual([['a06_f00e', 'before-mission'], ['a06_p02e', 'transmission'], ['a06_p01e', 'transmission']]);
    expect(campaignMissionSemantics('all05s.map')).toBe(27); expect(campaignMissionSemantics('all06u.map')).toBe(20);
    expect(campaignMissionImplemented('ra2', 'all06u.map')).toBe(true);
});

test('the exact disabled null reinforcement is retained and becomes blocking if any incoming chain can activate', () => {
    const original = read(); expect(original.diagnostics.some(issue => issue.reason === 'Missing team: 0')).toBe(true);
    expect(original.dormantRecords.map(record => [record.section, record.key])).toEqual([['Actions', '0979640C']]);
    const ancestors = [...original.triggers.values()].filter(trigger => original.triggerChain(trigger.id).includes('0979640C'));
    expect(ancestors).toHaveLength(8); expect(ancestors.every(trigger => trigger.disabled)).toBe(true);
    for (const trigger of ancestors) {
        const raw = original.ini.getSection('Triggers')!.getString(trigger.id), fields = raw.split(','); fields[3] = '0';
        const changed = text.replace(raw, fields.join(',')); expect(changed).not.toBe(text);
        expect(() => read(changed).assertValid()).toThrow('Missing team: 0');
    }
    for (const admission of [{ ...policy, semanticsVersion: 19 }, { ...policy, sourceSha256: '0'.repeat(64) }]) {
        expect(() => read(text, admission).assertValid()).toThrow('Missing team: 0');
    }
    const raw = original.ini.getSection('Actions')!.getString('0835364C');
    const forced = text.replace(raw, '1,22,2,0979640C,0,0,0,0,A'); expect(forced).not.toBe(text);
    expect(() => read(forced).assertValid()).toThrow('Missing team: 0');
});

test('No Factories17 uses the trigger house and real factory identity, including unpowered or unfinished factories', () => {
    const original = read(), trigger = original.triggers.get('0ADFDC6C')!, event = trigger.events[0];
    const owner = { buildings: [] as any[] }, unrelated = { buildings: [{ rules: { factory: 2 }, isDestroyed: false }] };
    const host: any = { launch: { semanticsVersion: 20 }, targets: () => [],
        resolveHouse: (reference: any) => reference === trigger.house ? owner : unrelated };
    const check = () => (CampaignRuntime.prototype as any).check.call(host, event, trigger, []);
    expect(check()).toBe(true);
    owner.buildings.push({ rules: { factory: undefined }, isDestroyed: false }); expect(check()).toBe(true);
    const factory = { rules: { factory: 2, insignificant: true }, isDestroyed: false, constructionComplete: false, powered: false };
    owner.buildings.push(factory); expect(check()).toBe(false);
    factory.isDestroyed = true; expect(check()).toBe(true);
    host.launch.semanticsVersion = 19; expect(check).toThrow('interpreter 20');
});

test('source Evict111 affects the first live attached building and retains normal blocked-exit destruction policy', () => {
    const original = read(), trigger = original.triggers.get('08339B7C')!, action = trigger.actions[0], calls: any[] = [];
    const first: any = { isBuilding: () => true, isSpawned: true, isDestroyed: false,
        garrisonTrait: { evacuate: (...args: any[]) => calls.push(args) } };
    const second = { ...first, garrisonTrait: { evacuate: () => { throw Error('Action111 must stop at its first attached building'); } } };
    const game = {}, host: any = { launch: { semanticsVersion: 20 }, trace: [], machine: { tick: 90 }, game,
        targets: () => [{ ...first, isDestroyed: true }, { ...first, isSpawned: false }, first, second] };
    const execute = () => (CampaignRuntime.prototype as any).execute.call(host, action, trigger);
    execute(); expect(calls).toEqual([[game, false]]);
    delete first.garrisonTrait; execute(); expect(calls).toHaveLength(1);
    host.launch.semanticsVersion = 19; expect(execute).toThrow('interpreter 20');
});

test('a genuinely blocked garrison exit removes trapped occupants through the normal destroy path', () => {
    const owner = {}, neutral = {}, destroyed: any[] = [], events: any[] = [], building: any = {
        owner, tile: { rx: 10, ry: 10 }, art: { foundation: { width: 1, height: 1 } }, rules: { techLevel: -1 }, isDestroyed: false };
    const trait: any = new GarrisonTrait(building, .25, 3);
    const units = Array.from({ length: 3 }, () => ({ owner, rules: { speedType: 1 } })); trait.units.push(...units);
    const game: any = { map: { tiles: { getByMapCoords: () => undefined }, mapBounds: {} },
        destroyObject: (unit: any) => destroyed.push(unit), getCivilianPlayer: () => neutral,
        changeObjectOwner: (unit: any, next: any) => { unit.owner = next; }, events: { dispatch: (event: any) => events.push(event) } };
    trait.evacuate(game, false); expect(destroyed).toEqual(units); expect(trait.getOccupants()).toEqual([]);
    expect(building.owner).toBe(neutral); expect(events).toHaveLength(1);
});

test('both original enemy-house goals and Pentagon loss retain their separate five-second result delays', () => {
    for (const outcome of ['victory', 'defeat']) {
        const original = read(), actions: any[] = [], gone = new Set<string>(); let pentagonLost = false;
        const active = outcome === 'victory' ? ['0AFEB7FC'] : ['0B1A8A1C'];
        const machine = new CampaignTriggerMachine(original, 'normal', { targets: () => ['source'],
            condition: event => event.opcode === 11 ? gone.has(event.params[1])
                : event.opcode === 48 ? pentagonLost ? ['source'] : [] : false,
            action: action => actions.push({ tick: machine.tick, ...action }) });
        for (const id of machine.states.keys()) machine.setEnabled(id, active.includes(id));
        gone.add('14'); machine.update(); expect(actions).toEqual([]);
        if (outcome === 'victory') gone.add('15'); else pentagonLost = true;
        machine.update(); const armed = machine.states.get(outcome === 'victory' ? '0AD1A66C' : '0AD1988C')!.enabledTick;
        for (let i = 0; i < 74; i++) machine.update();
        expect(actions.filter(action => [1, 2].includes(action.opcode))).toEqual([]);
        machine.update(); const result = actions.filter(action => [1, 2].includes(action.opcode));
        expect(result).toHaveLength(1); expect(result[0].opcode).toBe(outcome === 'victory' ? 1 : 2);
        expect(result[0].tick - armed).toBe(75);
    }
});

test('a rebuilt factory clears No Factories17 before a pending timer can form a false conjunction', () => {
    const definition = new CampaignDefinition('ra2', 'factories-state-fixture.map', '[Basic]\nPlayer=P\n[Houses]\n0=P\n'
        + '[P]\nCountry=P\n[Triggers]\nT=P,<none>,Factories and delay,0,1,1,1,0\n'
        + '[Events]\nT=2,17,0,0,13,0,2\n[Actions]\nT=1,1,0,0,0,0,0,0,A\n');
    let missing = true; const actions: any[] = [];
    const machine = new CampaignTriggerMachine(definition, 'normal', { targets: () => [],
        condition: () => missing, action: action => actions.push(action) });
    machine.update(); missing = false;
    for (let i = 0; i < 31; i++) machine.update();
    expect(actions).toEqual([]); missing = true; machine.update(); expect(actions).toHaveLength(1);
});

test('completed live AI defense teams retain membership while player deliveries release and recorded19 stays frozen', () => {
    for (const [version, ai, expected] of [[18, true, 'holding'], [19, true, 'finished'],
        [20, true, 'holding'], [20, false, 'finished'], [27, true, 'holding'], [27, false, 'finished']] as const) {
        const member = {}, team: any = { type: 'T', owner: { isAi: ai }, line: 2, phase: 'active', members: [member] };
        const assignments = new Map([[member, team]]), unloading = new Map([[member, team]]);
        const manager: any = { semanticsVersion: version, require: () => ({ script: 'S' }),
            definition: { scripts: new Map([['S', { instructions: [] }]]) }, unloading,
            finish: (entry: any) => { entry.phase = 'finished'; assignments.delete(member); unloading.delete(member); } };
        (CampaignTeams.prototype as any).tickScript.call(manager, team, 90);
        expect(team.phase).toBe(expected); expect(assignments.has(member)).toBe(expected === 'holding');
        expect(unloading.has(member)).toBe(false);
    }
});

test('the original minimum-defense rule admits offensive teams after a live completed defense script', () => {
    const original = read(), owner = { name: 'BadGuy1 House' }, defensive = [...original.teams.values()]
        .find(team => team.properties.IsBaseDefense === 'yes')!, offensive = [...original.aiTriggers.values()]
        .find(trigger => original.teams.get(trigger.team)!.properties.IsBaseDefense === 'no')!;
    const team = { owner, phase: 'holding', type: defensive.id }, teams = new Map([[1, team]]);
    const general = new IniFile('[General]\nUseMinDefenseRule=yes\nMinimumAIDefensiveTeams=1,1,1\n');
    const host: any = { definition: original, host: { instances: teams }, game: { gameOpts: { campaign: { difficulty: 'normal' } },
        rules: { getIni: () => general } }, enemy: () => ({}), teamTypes: () => [offensive.team], ownerMatches: () => true,
        effectiveTechLevel: () => 0, condition: () => true, belowMaximum: () => true, canSupply: () => true,
        listValue: () => 1, ownedTeams: (value: any) => (CampaignAi.prototype as any).ownedTeams.call(host, value) };
    owner['campaignTechLevel'] = 10;
    const enabled = { ...offensive, enabled: true };
    expect((CampaignAi.prototype as any).eligible.call(host, enabled, owner)).toBe(true);
    team.phase = 'finished'; expect((CampaignAi.prototype as any).eligible.call(host, enabled, owner)).toBe(false);
});
