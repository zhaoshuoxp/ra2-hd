import { expect, test } from 'bun:test';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';

function setup() {
    const definition = new CampaignDefinition('ra2', 'fixture.map', '[Basic]\nPlayer=P\n[Houses]\n0=P\n[P]\nCountry=P\n'
        + '[TaskForces]\n0=force\n[force]\n0=1,SAPC\n[ScriptTypes]\n0=guard\n[guard]\n0=5,2\n'
        + '[TeamTypes]\n0=delivery\n1=return\n[delivery]\nHouse=P\nScript=guard\nTaskForce=force\nPriority=1\nAreTeamMembersRecruitable=yes\n'
        + '[return]\nHouse=P\nScript=guard\nTaskForce=force\nRecruiter=yes\nPriority=20\n');
    const objects: any[] = [], owner = { name: 'P', getOwnedObjects: () => objects };
    const manager = new CampaignTeams(definition, { map: {} }, () => owner);
    const transport = { id: 1, name: 'SAPC', owner, isSpawned: true, isUnit: () => true, isInfantry: () => false,
        transportTrait: { units: [] as any[] }, unitOrderTrait: { clearOrders() {}, cancelAllTasks() {} } };
    objects.push(transport); return { manager, transport };
}

test('an assembling return pool cannot detach a loaded transport from its delivery, and can recruit it after unloading', () => {
    const { manager, transport } = setup(), delivery = manager.create('delivery');
    transport.transportTrait.units.push({ name: 'SMCV' });
    const pool = manager.create('return'); expect(pool.phase).toBe('assembling'); expect(delivery.members).toEqual([transport]);
    transport.transportTrait.units = []; manager.update(0);
    expect(pool.members).toEqual([transport]); expect(delivery.members).toEqual([]);
});

test('an accepted player order releases scripted membership without deleting the actor or its source tag', () => {
    const { manager, transport } = setup(), delivery = manager.create('delivery');
    const tag = { id: 'original-tag' }; (transport as any).tag = tag;
    manager.release(transport); manager.update(1);
    expect(delivery.phase).toBe('finished'); expect(delivery.members).toEqual([]);
    expect(transport.isSpawned).toBe(true); expect((transport as any).tag).toBe(tag);
});
