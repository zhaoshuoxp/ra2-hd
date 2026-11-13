import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { CampaignDefinition, waypointNumber } from '../../src/data/campaign/CampaignDefinition';
import { readCampaignCatalog } from '../../src/data/campaign/CampaignCatalog';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';

const header = '[Basic]\nPlayer=Player House\n[Houses]\n0=Player House\n[Player House]\nCountry=Player\nPlayerControl=yes\n';
const definition = (body: string) => new CampaignDefinition('ra2', 'test.map', header + body);
const one = (event: string, action = '11,4,TEST,0,0,0,0,A', repeat = 0) => definition(
    `[Triggers]\na=Player,<none>,test,0,1,1,1,0\n[Tags]\nt=${repeat},test,a\n[Events]\na=${event}\n[Actions]\na=1,${action}\n`);

describe('lossless campaign source', () => {
    test('retains unknown opcodes and blocks support independently of syntax', () => {
        const d = one('1,600,0,1', '900,0,123,0,0,0,0,A');
        d.assertValid(); expect(d.triggers.get('a')!.events[0].opcode).toBe(600);
        expect(d.triggers.get('a')!.actions[0].params[1]).toBe('123');
        const issues = campaignPreflight(d, { events: new Set(), actions: new Set(), scripts: new Set(), subsystems: [] });
        expect(issues.map(issue => [issue.section, issue.key, issue.index])).toEqual([['Events', 'a', 0], ['Actions', 'a', 0]]);
    });
    test('rejects truncated, invalid-mode and trailing-token records without accepting a shortened program', () => {
        for (const raw of ['2,13,0,1', '1,13,4,1', '1,13,0,1,5']) {
            const d = one(raw); expect(d.diagnostics.length).toBeGreaterThan(0); expect(() => d.assertValid()).toThrow();
        }
    });
    test('checks missing teams and cycles at their original locations', () => {
        const d = one('1,13,0,0', '80,1,missing,0,0,0,0,A');
        expect(d.diagnostics[0].section).toBe('Actions'); expect(d.diagnostics[0].index).toBe(0);
        const linked = definition('[Triggers]\na=Player,b,a,0,1,1,1,0\nb=Player,a,b,0,1,1,1,0');
        expect(linked.diagnostics.some(issue => issue.reason.includes('cyclic'))).toBe(true);
    });
    test('decodes alphabetic waypoints without treating numeric frame counts as waypoints', () => {
        expect([waypointNumber('A'), waypointNumber('Z'), waypointNumber('AA'), waypointNumber('CT')]).toEqual([0, 25, 26, 97]);
        expect(() => waypointNumber('90')).toThrow();
    });
    test('routes progression only through the edition catalog', () => {
        const entries = readCampaignCatalog('ra2', '[SOV01]\nScenario=SOV01t.MAP\n[SOV02]\nScenario=SOV02t.MAP\n[TRN01]\nScenario=TRN01t.MAP');
        expect(entries[0].next).toBe('sov02t.map'); expect(entries[1].next).toBeUndefined(); expect(entries[2].faction).toBe('training');
        expect(readCampaignCatalog('yr', '[SOV01]\nScenario=SOV01UMD.MAP')[0].filename).toBe('sov01umd.map');
    });
    test('the actual Soviet 01 source retains every instruction and reference', () => {
        const raw = readFileSync('.local/campaign/ra2/sov01t/sov01t.map', 'utf8');
        const d = new CampaignDefinition('ra2', 'sov01t.map', raw); d.assertValid();
        expect([d.triggers.size, d.tags.size, d.teams.size, d.scripts.size, d.taskForces.size, d.houses.size]).toEqual([132, 132, 44, 31, 29, 8]);
        const source = d.ini.getSection('Actions')!;
        const expected = [...source.entries.values()].reduce((sum, value) => sum + Number(String(value).split(',')[0]), 0);
        expect([...d.triggers.values()].reduce((sum, trigger) => sum + trigger.actions.length, 0)).toBe(expected);
        expect(d.triggers.get('08691C50')!.events.map(event => event.params[1])).toEqual(['1', '2', '3', '4']);
        expect(d.triggers.get('0A1153EC')!.events.map(event => event.opcode)).toEqual([9, 10]);
    });
});

describe('simulation trigger state', () => {
    test('the original null disable-trigger record has an explicit no-effect receipt', () => {
        const d = one('1,13,0,0', '54,0,0,0,0,0,0,A');
        const m = new CampaignTriggerMachine(d, 'normal', { targets: () => [], condition: () => false, action: () => {} });
        m.update(); expect(m.noEffectActions).toEqual([{ tick: 0, key: 'a', index: 0, opcode: 54, reason: 'Retail null trigger pointer; no effect' }]);
        expect(m.states.get('a')!.fired).toBe(1);
    });
    test('zero and nonzero timers use simulation ticks and one-time tags do not repeat', () => {
        const fired: number[] = [];
        const m = new CampaignTriggerMachine(one('1,13,0,2'), 'normal', { targets: () => [], condition: () => false, action: () => fired.push(m.tick) });
        for (let i = 0; i < 32; i++) m.update(); expect(fired).toEqual([30]);
        const zero = new CampaignTriggerMachine(one('1,13,0,0'), 'normal', { targets: () => [], condition: () => false, action: () => {} });
        zero.update(); expect(zero.states.get('a')!.fired).toBe(1);
    });
    test('disabled time does not advance an enabled trigger timer', () => {
        const m = new CampaignTriggerMachine(one('1,13,0,1'), 'normal', { targets: () => [], condition: () => false, action: () => {} });
        m.setEnabled('a', false); for (let i = 0; i < 100; i++) m.update(); m.setEnabled('a', true);
        for (let i = 0; i < 15; i++) m.update(); expect(m.states.get('a')!.fired).toBe(0);
        m.update(); expect(m.states.get('a')!.fired).toBe(1);
    });
    test('events latch across ticks and all-target tags wait for every tagged object', () => {
        const d = one('1,48,0,0', undefined, 1); let target: string[] = ['first'];
        const m = new CampaignTriggerMachine(d, 'normal', { targets: () => ['first', 'second'], condition: () => target, action: () => {} });
        m.update(); expect(m.states.get('a')!.fired).toBe(0); target = ['second']; m.update(); expect(m.states.get('a')!.fired).toBe(1);
    });
    test('difficulty flags exclude triggers while retaining their source records', () => {
        const d = one('1,13,0,0'); d.triggers.get('a')!.difficulties.normal = false;
        const m = new CampaignTriggerMachine(d, 'normal', { targets: () => [], condition: () => false, action: () => {} });
        m.update(); expect(m.states.get('a')!.fired).toBe(0); expect(d.triggers.size).toBe(1);
    });
    test('restores local variables, latches, repeat counters and pending execution deterministically', () => {
        const d = one('1,13,0,2', '56,0,3,0,0,0,0,A', 2);
        const host = { targets: () => [], condition: () => false, action: () => {} };
        const original = new CampaignTriggerMachine(d, 'normal', host);
        for (let i = 0; i < 17; i++) original.update();
        const snapshot = original.snapshot(); const restored = new CampaignTriggerMachine(d, 'normal', host); restored.restore(snapshot);
        snapshot.triggers[0][1].finished = true;
        for (let i = 0; i < 53; i++) { original.update(); restored.update(); }
        expect(restored.snapshot()).toEqual(original.snapshot()); expect(restored.variables.get('3')).toBe(true);
        expect(restored.states.get('a')!.fired).toBe(2);
    });
    test('recursive force and incompatible snapshots fail explicitly', () => {
        const m = new CampaignTriggerMachine(one('1,13,0,0', '22,2,a,0,0,0,0,A'), 'normal', { targets: () => [], condition: () => false, action: () => {} });
        expect(() => m.update()).toThrow('Recursive');
        const snapshot = m.snapshot(); snapshot.triggers = []; expect(() => m.restore(snapshot)).toThrow('Incompatible');
    });
});
