import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { CampaignDefinition, type CampaignDifficulty } from '../../src/data/campaign/CampaignDefinition';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { requiredBytes, sha256 } from '../test-support/resources';
import { parseMix } from '../../src/offline/retail';

const archive = requiredBytes('assets/ra2/maps02.mix');
const receipt = JSON.parse(requiredBytes('ra2-campaign-manifest.json').toString());
expect(sha256(archive)).toBe(receipt.files.find((entry: any) => entry.virtualName === 'maps02.mix').sha256);
const original = parseMix(archive, 'maps02.mix').openFile('sov02t.map').readAsString();
function source() { return new CampaignDefinition('ra2', 'sov02t.map', original); }
function machine(difficulty: CampaignDifficulty, condition: (opcode: number, parameter: string) => boolean = () => false) {
    const definition = source(), actions: { key: string; opcode: number; params: string[]; tick: number }[] = [];
    const machine = new CampaignTriggerMachine(definition, difficulty, { targets: () => [],
        condition: instruction => condition(instruction.opcode, instruction.params[1]),
        action: instruction => actions.push({ key: instruction.key, opcode: instruction.opcode, params: instruction.params, tick: machine.tick }) });
    return { definition, machine, actions };
}

test('Soviet 02 preserves its original source and every executable record passes capability preflight', () => {
    const definition = source();
    expect(definition.source).toBe(readFileSync('.local/campaign/ra2/sov02t/sov02t.map', 'utf8'));
    expect(definition.triggers.size).toBe(76); expect(definition.teams.size).toBe(42); expect(definition.scripts.size).toBe(37);
    expect(campaignPreflight(definition, campaignCapabilities)).toEqual([]);
    expect(definition.ini.getSection('Basic')!.getString('Brief')).toBe('S02_f00e');
});

test('the original single landing tag dispatches all linked difficulty-eligible waves', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        const { machine: runtime, actions } = machine(difficulty);
        for (let i = 0; i <= 16; i++) runtime.update();
        const arrivals = actions.filter(action => action.opcode === 80).map(action => action.params[1]).sort();
        expect(arrivals).toEqual((difficulty === 'hard' ? ['0C4B403C', '0C4B190C', '09F15C8C', '0C4B308C']
            : ['0C4B403C', '0C4B190C', '0C4B3C4C', '09F15C8C', '0C4B308C', '0C4B0C8C', '0C4B08EC']).sort());
        for (let i = 0; i < 30; i++) runtime.update();
        expect(actions.filter(action => action.opcode === 80).length).toBe(arrivals.length);
    }
});

test('the linked build-fleet alternatives consume the shared tag after the first applicable condition', () => {
    let built = false;
    const { machine: runtime, actions } = machine('normal', (opcode, parameter) => opcode === 32 && parameter === '15' && built);
    for (let i = 0; i < 30; i++) runtime.update();
    built = true; runtime.update();
    expect(actions.filter(action => action.opcode === 100).map(action => action.params[1])).toEqual(['76']);
    built = false;
    for (let i = 0; i < 4501; i++) runtime.update();
    expect(actions.filter(action => action.opcode === 100).length).toBe(1);
});

test('scenario timers do not restart when a trigger is enabled later', () => {
    const { machine: runtime, actions } = machine('normal');
    runtime.setEnabled('09EF6F40', false);
    for (let i = 0; i < 9001; i++) runtime.update();
    runtime.setEnabled('09EF6F40', true); runtime.update();
    expect(actions.filter(action => action.key === '09EF6F40').map(action => action.tick)).toEqual([9001]);
});

test('a temporarily empty player house before the landing does not latch the twenty-second defeat', () => {
    let empty = true;
    const { machine: runtime, actions } = machine('normal', (opcode, parameter) => opcode === 11 && parameter === '7' && empty);
    for (let i = 0; i < 15; i++) runtime.update();
    empty = false;
    for (let i = 0; i < 301; i++) runtime.update();
    expect(actions.some(action => action.opcode === 2)).toBe(false);
    empty = true; runtime.update();
    expect(actions.filter(action => action.opcode === 2).map(action => action.key)).toEqual(['089D1680']);
});

test('the original hidden insignificant radar cannot prevent genuine player defeat', () => {
    const definition = source();
    expect(definition.ini.getSection('NARADR')!.getBool('Insignificant')).toBe(true);
    const radar = { rules: { insignificant: true }, isTechno: () => true };
    const soldier = { rules: { insignificant: false }, isTechno: () => true };
    let objects = [radar];
    const host = { launch: { edition: 'ra2', semanticsVersion: 5 }, targets: () => [],
        resolveHouse: () => ({ getOwnedObjects: () => objects }) };
    const event = definition.triggers.get('089D1680')!.events[0];
    const check = () => (CampaignRuntime.prototype as any).check.call(host, event, definition.triggers.get('089D1680'));
    expect(check()).toBe(true);
    objects = [radar, soldier]; expect(check()).toBe(false);
});
