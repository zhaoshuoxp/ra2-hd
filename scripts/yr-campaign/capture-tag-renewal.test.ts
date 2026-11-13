import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignRuntime } from '../../src/game/campaign/CampaignRuntime';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { ObjectOwnerChangeEvent } from '../../src/game/event/ObjectOwnerChangeEvent';

const bytes = readFileSync('.local/campaign/yr/sov04dmd/sov04dmd.map');
const source = new CampaignDefinition('yr', 'sov04dmd.map', bytes.toString(), undefined,
    { semanticsVersion: 38, sourceSha256: createHash('sha256').update(bytes).digest('hex') });
const captured = source.triggers.get('0915E18C')!;

function scenario(edition: string, version: number) {
    const german = {}, special = {}, unit: any = { id: 1462, owner: special, isUnit: () => true,
        isDestroyed: false, isSpawned: true, tag: { id: '0921EE7C' } };
    const host: any = { launch: { edition, semanticsVersion: version }, definition: source,
        events: [new ObjectOwnerChangeEvent(unit, german)], sourceTeamCaptureTags: new Set(), sourceQuirks: [],
        boundTargets: new Map([[captured.id, [unit]]]), targets: () => [unit], targetId: () => 'object:1462' };
    host.machine = new CampaignTriggerMachine(source, 'easy', {
        targets: trigger => trigger.id === captured.id ? ['object:1462'] : [],
        condition: (event, trigger) => trigger.id === captured.id
            ? (CampaignRuntime.prototype as any).check.call(host, event, trigger) : false,
        action: () => {}, randomInt: () => 0,
    }, 15, false, version);
    return { host, german, special, unit };
}

test('YR38 original freed-Romanov team renews its consumed capture tag for a second psychic capture', () => {
    const { host, german, special, unit } = scenario('yr', 38);
    host.machine.update(); expect(host.machine.variables.get('1')).toBe(true);
    expect(host.machine.states.get(captured.id).finished).toBe(true);
    unit.owner = german; host.events = [new ObjectOwnerChangeEvent(unit, special)];
    host.machine.variables.set('1', false);
    CampaignRuntime.prototype.noteSourceTeamTag.call(host, unit, '05B87C8C', 77);
    expect(host.events).toEqual([]); expect(host.machine.states.get(captured.id).finished).toBe(false);
    expect(host.machine.states.get(captured.id).remainingTargets).toEqual(['object:1462']);
    expect(host.sourceQuirks[0].kind).toBe('fresh-source-single-actor-capture-tag-renewed');
    unit.owner = special; host.events = [new ObjectOwnerChangeEvent(unit, german)];
    host.machine.update(); expect(host.machine.variables.get('1')).toBe(true);
    expect(host.machine.states.get(captured.id).fired).toBe(1);
    CampaignRuntime.prototype.noteSourceTeamTag.call(host, unit, '05B87C8C', 77);
    expect(host.machine.states.get(captured.id).finished).toBe(true);
    expect(host.sourceQuirks).toHaveLength(1);
    const snapshot = host.machine.snapshot(); host.machine.restore(snapshot);
    expect(host.machine.snapshot()).toEqual(snapshot);
});

test('stored policies retain consumed tags and overlapping active actors fail closed in the new bounded admission', () => {
    for (const [edition, version] of [['yr', 37], ['ra2', 38]] as const) {
        const { host, unit } = scenario(edition, version);
        host.machine.states.get(captured.id).finished = true;
        CampaignRuntime.prototype.noteSourceTeamTag.call(host, unit, '05B87C8C', 77);
        expect(host.machine.states.get(captured.id).finished).toBe(true); expect(host.sourceQuirks).toEqual([]);
    }
    const { host, unit } = scenario('yr', 38);
    host.machine.states.get(captured.id).finished = true;
    host.targets = () => [unit, { id: 9, isDestroyed: false, isSpawned: true }];
    expect(() => CampaignRuntime.prototype.noteSourceTeamTag.call(host, unit, '05B87C8C', 78))
        .toThrow('independent source instances');
    expect(host.machine.states.get(captured.id).finished).toBe(true);
});
