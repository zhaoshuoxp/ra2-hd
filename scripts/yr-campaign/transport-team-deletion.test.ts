import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';

test('the original Einstein escape team boards, sets its source flag and deletes both members', () => {
    const bytes = readFileSync('.local/campaign/yr/all04dmd/all04dmd.map');
    const source = new CampaignDefinition('yr', 'all04dmd.map', bytes.toString(), undefined,
        { semanticsVersion: 43, sourceSha256: createHash('sha256').update(bytes).digest('hex') });
    const team = source.teams.get('0B0637DC')!;
    expect(source.taskForces.get(team.taskForce)!.units).toEqual([{ count: 1, type: 'EINS' }, { count: 1, type: 'SHAD' }]);
    expect(source.scripts.get(team.script)!.instructions.map(line => line.raw)).toEqual(['14,0', '39,12', '37,0']);
});

test('YR43 deletes a boarded source actor once without a second world removal or a combat death', () => {
    for (const [edition, version] of [['yr', 42], ['ra2', 43], ['yr', 43]] as const) {
        const removed: any[] = [], disposed: any[] = [], unspawned: any[] = [];
        const owner = { removeOwnedObject: (unit: any) => removed.push(unit) };
        const passenger = { owner, isSpawned: false, limboData: { inTransport: true }, dispose: () => disposed.push(passenger) };
        const survivor = { name: 'unrelated passenger' };
        const otherCarrier = { transportTrait: { units: [survivor] } };
        const carrier = { owner, isSpawned: true, transportTrait: { units: [passenger] }, dispose: () => disposed.push(carrier) };
        const host = { semanticsVersion: version, game: { gameOpts: { campaign: { edition } },
            world: { getAllObjects: () => [otherCarrier, carrier] },
            unspawnObject: (unit: any) => {
                if (!unit.isSpawned) throw Error('Trying to remove non-existent object');
                unspawned.push(unit); owner.removeOwnedObject(unit);
            } } };
        const run = () => (CampaignTeams.prototype as any).deleteMembers.call(host, { members: [passenger, carrier] });
        if (edition === 'yr' && version === 43) {
            run(); expect(unspawned).toEqual([carrier]); expect(removed).toEqual([passenger, carrier]);
            expect(disposed).toEqual([passenger, carrier]); expect(carrier.transportTrait.units).toEqual([]);
            expect(otherCarrier.transportTrait.units).toEqual([survivor]);
        } else {
            expect(run).toThrow('Trying to remove non-existent object');
            expect(disposed).toEqual([]); expect(carrier.transportTrait.units).toEqual([passenger]);
        }
    }
});

test('deleting a source passenger detaches it from a surviving carrier and preserves its other occupants', () => {
    const removed: any[] = [], disposed: any[] = [];
    const passenger = { isSpawned: false, limboData: { inTransport: true },
        owner: { removeOwnedObject: (unit: any) => removed.push(unit) }, dispose: () => disposed.push(passenger) };
    const survivor = {}, carrier = { isSpawned: true, transportTrait: { units: [survivor, passenger] } };
    const host = { semanticsVersion: 43, game: { gameOpts: { campaign: { edition: 'yr' } },
        world: { getAllObjects: () => [carrier] }, unspawnObject: () => { throw Error('The passenger is already in limbo'); } } };
    (CampaignTeams.prototype as any).deleteMembers.call(host, { members: [passenger] });
    expect(removed).toEqual([passenger]); expect(disposed).toEqual([passenger]);
    expect(carrier.isSpawned).toBe(true); expect(carrier.transportTrait.units).toEqual([survivor]);
});
