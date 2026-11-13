import { expect, test } from 'bun:test';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { ObjectType } from '../../src/engine/type/ObjectType';

const header = '[Basic]\nPlayer=P\n[Houses]\n0=P\n[P]\nCountry=P\n';
function fixture(script = '0=5,2\n1=6,1', count = 1) {
    const definition = new CampaignDefinition('ra2', 'fixture.map', header
        + `[TaskForces]\n0=force\n[force]\n0=${count},E2\n[ScriptTypes]\n0=script\n[script]\n${script}\n`
        + '[TeamTypes]\n0=team\n[team]\nHouse=P\nScript=script\nTaskForce=force\nMax=1\nAreTeamMembersRecruitable=yes\n');
    definition.assertValid();
    const objects: any[] = [], queued: any[] = [];
    const rules = { type: ObjectType.Infantry, name: 'E2' };
    const queue = { find: () => queued, push: (rules: any, quantity: number, cost: number) => queued.push({ rules, quantity, cost }) };
    const owner: any = { name: 'P', getOwnedObjects: () => objects, production: {
        isAvailableForProduction: () => true, getQueueForObject: () => queue } };
    const game: any = { map: {}, rules: { hasObject: (name: string, type: number) => name === 'E2' && type === ObjectType.Infantry,
        getObject: () => rules }, sellTrait: { computePurchaseValue: () => 100 },
        changeObjectOwner: (unit: any, player: any) => unit.owner = player };
    const manager = new CampaignTeams(definition, game, () => owner);
    const unit = (id: number) => ({ id, name: 'E2', rules, owner, isDestroyed: false, isCrashing: false, isSpawned: true,
        isUnit: () => true, isInfantry: () => true, unitOrderTrait: { clearOrders() {}, cancelAllTasks() {} } });
    return { definition, manager, objects, queued, owner, unit, game };
}

test('AI condition is lossless, little-endian and difficulty-specific in the original mission', async () => {
    const source = await Bun.file('.local/campaign/ra2/sov01t/sov01t.map').text();
    const definition = new CampaignDefinition('ra2', 'sov01t.map', source);
    expect(definition.aiTriggers.size).toBe(4);
    const trigger = definition.aiTriggers.get('080D348C')!;
    expect([trigger.condition, trigger.object, trigger.count, trigger.comparison, trigger.enabled]).toEqual([1, 'GAPILE', 1, 3, true]);
    expect(trigger.difficulties).toEqual({ easy: false, normal: true, hard: false });
    expect(trigger.raw.split(',')).toHaveLength(18);
    expect(definition.taskForces.get('09CCD90C')!.units).toEqual([{ count: 7, type: 'E2' }]);
});

test('guard waits in RA2 simulation seconds, jumps are one-based, and snapshot retains a live wait', () => {
    const f = fixture(); f.objects.push(f.unit(1)); const team = f.manager.create('team');
    for (let tick = 0; tick < 30; tick++) f.manager.update(tick);
    expect(team.line).toBe(0); expect(team.waitUntil).toBe(30);
    const saved = structuredClone(f.manager.snapshot());
    f.manager.update(30); expect(team.line).toBe(1);
    f.manager.update(31); expect(team.line).toBe(0);
    f.manager.update(32); expect(team.waitUntil).toBe(62);
    expect((saved as any).instances[0].waitUntil).toBe(30);
});

test('creation recruits without spawning, production queues missing members once, and team deletion releases units', () => {
    const f = fixture('', 2); f.objects.push(f.unit(1)); f.manager.production.add(f.owner);
    const first = f.manager.create('team');
    expect(first.phase).toBe('assembling'); expect(f.queued).toEqual([{ rules: first.members[0].rules, quantity: 1, cost: 100 }]);
    for (let tick = 0; tick < 10; tick++) f.manager.update(tick);
    expect(f.queued).toHaveLength(1); expect(f.objects).toHaveLength(1);
    f.objects.push(f.unit(2)); f.manager.update(10);
    expect(first.phase).toBe('holding'); expect(first.members.map(unit => unit.id)).toEqual([1, 2]);
    const second = f.manager.create('team'); expect(second.members).toHaveLength(0);
    f.manager.destroy('team'); expect(f.objects.every(unit => !unit.isDestroyed)).toBe(true);
    const third = f.manager.create('team'); expect(third.members.map(unit => unit.id)).toEqual([1, 2]);
    expect(first.phase).toBe('finished');
});

test('destroyed members end a holding team and a malformed script jump fails at the original line', () => {
    const f = fixture('0=6,9'); const unit = f.unit(1); f.objects.push(unit);
    f.manager.create('team'); expect(() => f.manager.update(0)).toThrow('[script] 0 invalid jump line 9');
    const holding = fixture(''); const member = holding.unit(2); holding.objects.push(member);
    const team = holding.manager.create('team'); holding.manager.update(0); member.isDestroyed = true; holding.manager.update(1);
    expect(team.phase).toBe('finished');
});
