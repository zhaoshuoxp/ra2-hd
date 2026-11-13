import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignRuntime } from '../../src/game/campaign/CampaignRuntime';
import { campaignDormantRecords } from '../../src/data/campaign/CampaignDormantRecords';

const definition = new CampaignDefinition('yr', 'all02umd.map',
    readFileSync('.local/campaign/yr/all02umd/all02umd.map', 'utf8'), undefined,
    { semanticsVersion: 41, sourceSha256: '168ed42024991b6c2af4de0e5a667e9c2bf15767741efe99dac975721460b303' });
const trigger = definition.triggers.get('0CDDC84C')!, action = trigger.actions[9];
const execute = (runtime: any, entry = action) => (CampaignRuntime.prototype as any).execute.call(runtime, entry, trigger);
function fixture(version = 41, edition = 'yr') {
    const dispatched: any[] = [];
    const runtime: any = { definition, launch: { edition, semanticsVersion: version }, trace: [], sourceQuirks: [],
        machine: { tick: 32249 }, yr: { execute: () => false }, soundEmitters: new Map([['109,124,0', [{ sound: 'LIVE' }]]]),
        game: { map: { getTileAtWaypoint: () => undefined }, events: { dispatch: (event: any) => dispatched.push(event) } } };
    return { runtime, dispatched };
}

test('unqualified source metadata cannot admit dormant records or dereference an absent allowlist entry', () => {
    expect(campaignDormantRecords(definition, { semanticsVersion: 41, sourceSha256: undefined } as any))
        .toEqual({ records: [], diagnostics: [], scripts: new Set() });
});

test('YR41 retains original Allied02 stop-sound IC residue without changing other positional emitters', () => {
    expect(action.opcode).toBe(116); expect(action.params[6]).toBe('IC');
    expect(definition.waypoints.has(236)).toBe(false);
    expect(definition.waypoints.get(234)).toEqual({ x: 109, y: 124 });
    const { runtime, dispatched } = fixture(), before = structuredClone(runtime.soundEmitters);
    execute(runtime); expect(runtime.soundEmitters).toEqual(before); expect(dispatched).toEqual([]);
    expect(runtime.sourceQuirks).toEqual([{ section: 'Actions', key: action.key, value: action.raw,
        kind: 'original-stop-sound-undefined-waypoint' }]);
    expect(runtime.trace).toHaveLength(1);
});

test('defined sound stops still dispatch at their actual cell and old saves retain strict waypoint behavior', () => {
    const { runtime, dispatched } = fixture();
    runtime.game.map.getTileAtWaypoint = () => ({ rx: 109, ry: 124, z: 0 });
    execute(runtime, trigger.actions[7]); expect(runtime.soundEmitters.size).toBe(0);
    expect(dispatched).toHaveLength(1); expect(runtime.sourceQuirks).toEqual([]);
    for (const [version, edition] of [[40, 'yr'], [41, 'ra2']] as const) {
        expect(() => execute(fixture(version, edition).runtime)).toThrow('Missing sound waypoint');
    }
    const present = fixture().runtime; present.definition = { waypoints: new Map([[236, { x: 1, y: 1 }]]) };
    expect(() => execute(present)).toThrow('Missing sound waypoint');
    const play = { ...action, opcode: 99 }; expect(() => execute(fixture().runtime, play)).toThrow('Missing sound waypoint');
});
