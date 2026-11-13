import { expect, test } from 'bun:test';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { Target } from '../../src/game/Target';
import { TaskStatus } from '../../src/game/gameobject/task/system/TaskStatus';
import { requiredBytes, retailIni } from '../test-support/resources';

const source = requiredBytes('campaign/ra2/sov02t/sov02t.map').toString();
const rules = retailIni('ra2');
function delivery(version: number) {
    const definition = new CampaignDefinition('ra2', 'sov02t.map', source);
    const objects: any[] = [], owner = { name: 'Africans', getOwnedObjects: () => objects };
    const game: any = { map: {
        getTileAtWaypoint: (number: number) => {
            const point = definition.waypoints.get(number)!;
            return { rx: point.x, ry: point.y, onBridgeLandType: false };
        },
        mapBounds: { isWithinBounds: (tile: any) => tile.ry >= 40 },
    }, rules: { getIni: () => rules, general: { closeEnough: 1 } },
    limboObject: (unit: any) => { unit.limboData = {}; unit.isSpawned = false; },
    changeObjectOwner: (unit: any, next: any) => unit.owner = next,
    unspawnObject: (unit: any) => unit.isSpawned = false };
    function actor(id: number, name: string): any {
        const tasks: any[] = [];
        const unit: any = { id, name, owner, isSpawned: true, rules: {}, isUnit: () => true, isInfantry: () => false,
            unitOrderTrait: { clearOrders() {}, cancelAllTasks() {}, addTask: (task: any) => tasks.push(task), getTasks: () => tasks } };
        unit.dispose = () => unit.isDisposed = true;
        return unit;
    }
    const boat = actor(1, 'SAPC'), mcv = actor(2, 'SMCV');
    boat.transportTrait = { units: [], unitFitsInside: () => true };
    objects.push(boat, mcv);
    const manager = new CampaignTeams(definition, game, () => owner, () => {}, version);
    const team = manager.create('0A550DCC');
    expect(boat.transportTrait.units).toEqual([mcv]);
    team.line = 1;
    manager.update(0);
    boat.transportTrait.units = [];
    mcv.limboData = undefined; mcv.isSpawned = true;
    for (const entry of team.tasks) entry.task.status = TaskStatus.Finished;
    manager.update(1);
    expect(team.line).toBe(2);
    const pool = manager.create('090EDCE0');
    return { manager, team, pool, boat, mcv };
}

test('the original Unload mission remains non-recruitable through delivery waits, and legacy v2 replay retains its previous ordering', () => {
    expect(rules.getSection('Unload')!.getBool('Recruitable', true)).toBe(false);
    const current = delivery(3);
    expect(current.pool.members).toEqual([]);
    for (let tick = 2; tick < 17; tick++) current.manager.update(tick);
    expect(current.team.members).toContain(current.boat);
    expect(current.pool.members).toEqual([]);
    const legacy = delivery(2);
    expect(legacy.pool.members).toEqual([legacy.boat]);
    expect((legacy.manager.snapshot() as any).recruitmentEpoch).toBeUndefined();
});

test('source team destruction allows its replacement to claim the MCV boat before an older incomplete pool, and Retreat prevents later stealing', () => {
    const f = delivery(3);
    f.manager.destroy('0A550DCC');
    f.manager.update(2);
    expect(f.pool.members).toEqual([]);
    const exit = f.manager.create('0A30E1FC');
    expect(exit.members).toEqual([f.boat]);
    f.manager.update(3);
    expect(exit.members).toEqual([f.boat]);
    expect(f.pool.members).toEqual([]);
    const task: any = exit.tasks[0].task;
    expect([task.targetTile.rx, task.targetTile.ry]).toEqual([102, 37]);
    expect(task.options.allowOutOfBoundsTarget).toBe(true);
    expect(rules.getSection('Retreat')!.getBool('Recruitable', true)).toBe(false);
    task.status = TaskStatus.Finished;
    f.manager.update(4);
    expect(exit.line).toBe(1);
    f.manager.update(5);
    expect(exit.phase).toBe('finished');
    expect(f.boat.isSpawned).toBe(false);
    expect(f.pool.members).not.toContain(f.boat);
});

test('an empty attack waypoint with a tile id remains a ground target and waits for a real shot before advancing', () => {
    const definition = new CampaignDefinition('ra2', 'fixture.map', '[Basic]\nPlayer=P\n[Houses]\n0=P\n[P]\nCountry=P\n'
        + '[Waypoints]\n55=37102\n[TaskForces]\n0=force\n[force]\n0=1,HTNK\n'
        + '[ScriptTypes]\n0=attack\n[attack]\n0=1,55\n1=5,1\n[TeamTypes]\n0=team\n'
        + '[team]\nHouse=P\nScript=attack\nTaskForce=force\n');
    const orders: any[] = [], tile = { id: '102_37', rx: 102, ry: 37, landType: 0 };
    const actor: any = { id: 1, name: 'HTNK', isSpawned: true, rules: {}, isUnit: () => true, isInfantry: () => false,
        unitOrderTrait: { clearOrders() {}, cancelAllTasks() {}, addOrder: (order: any) => orders.push(order) } };
    const owner = { name: 'P', getOwnedObjects: () => [actor] }; actor.owner = owner;
    const game: any = { map: { getTileAtWaypoint: () => tile, getGroundObjectsOnTile: () => [] },
        createTarget: (object: any, target: any) => new Target(object, target, {}) };
    const manager = new CampaignTeams(definition, game, () => owner, () => {}, 3);
    (manager as any).orders = { create: () => ({ target: undefined as any, set(_unit: any, target: any) { this.target = target; return this; },
        isValid: () => true, isAllowed: () => true }) };
    const team = manager.create('team'); manager.update(0);
    expect(orders[0].target.obj).toBeUndefined(); expect(orders[0].target.tile).toBe(tile);
    manager.update(1); expect(team.line).toBe(0);
    manager.noteShot(actor); manager.update(2); expect(team.line).toBe(1);
});

test('a completed delivery script releases its Unload restriction instead of stranding the remaining empty transports', () => {
    const f = delivery(3);
    for (let tick = 2; tick <= 22; tick++) f.manager.update(tick);
    expect(f.team.phase).toBe('holding');
    expect(f.pool.members).toContain(f.boat);
});
