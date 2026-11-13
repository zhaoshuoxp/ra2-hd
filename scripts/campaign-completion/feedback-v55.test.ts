import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { Vehicle } from '../../src/engine/renderable/entity/Vehicle';
import { ROCKING_TICKS } from '../../src/game/gameobject/Vehicle';
import { GameSpeed } from '../../src/game/GameSpeed';
import { findCampaignFoundationExit } from '../../src/game/campaign/CampaignDeployIntoTask';
import { CampaignAi } from '../../src/game/campaign/CampaignAi';
import { CampaignBaseBuilder } from '../../src/game/campaign/CampaignBaseBuilder';

test('naval and ordinary-weapon rocking pivots stay on the actual native hull edge', () => {
    for (const [halfWidth, halfLength] of [[8, 24], [15, 36], [5, 12]]) {
        const bounds = new THREE.Box3(new THREE.Vector3(-halfWidth, -halfLength, 0),
            new THREE.Vector3(halfWidth, halfLength, 20));
        for (const facing of [-90, 0, 90, 180]) {
            const renderable: any = { bodyVxlBuilder: { getLocalBoundingBox: () => bounds },
                rockingTiltObj: new THREE.Object3D(), gameSpeed: { value: 1 }, gameObject: { rules: { weight: 3 } } };
            Vehicle.prototype.startRocking.call(renderable, facing, 1, 0);
            const point: THREE.Vector3 = renderable.rockingPoint;
            expect(point.x).toBeGreaterThanOrEqual(bounds.min.x - 1e-8);
            expect(point.x).toBeLessThanOrEqual(bounds.max.x + 1e-8);
            expect(point.z).toBeGreaterThanOrEqual(bounds.min.y - 1e-8);
            expect(point.z).toBeLessThanOrEqual(bounds.max.y + 1e-8);
            expect(Math.min(Math.abs(Math.abs(point.x) - halfWidth), Math.abs(Math.abs(point.z) - halfLength))).toBeLessThan(1e-7);
            const duration = ROCKING_TICKS / GameSpeed.BASE_TICKS_PER_SECOND * 1000;
            Vehicle.prototype.updateRocking.call(renderable, duration / 2, true);
            expect(point.clone().applyMatrix4(renderable.rockingTiltObj.matrix).distanceTo(point)).toBeLessThan(1e-7);
            expect(renderable.rockingTiltObj.position.length()).toBeLessThan(Math.hypot(halfWidth, halfLength));
            Vehicle.prototype.updateRocking.call(renderable, duration + 1, true);
            expect(renderable.rockingStartTime).toBeUndefined();
            expect(renderable.rockingTiltObj.position.length()).toBeLessThan(1e-7);
            expect(renderable.rockingTiltObj.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-7);
        }
    }
});

test('ordinary-weapon rocking retains its weight reduction and missing hull geometry cannot start a pivot', () => {
    const renderable: any = { bodyVxlBuilder: { getLocalBoundingBox: () => undefined },
        rockingTiltObj: new THREE.Object3D(), gameSpeed: { value: 1 }, gameObject: { rules: { weight: 5 } } };
    Vehicle.prototype.startRocking.call(renderable, 90, 1, 10);
    expect(renderable.rockingStartTime).toBeUndefined();
    renderable.bodyVxlBuilder.getLocalBoundingBox = () => new THREE.Box3(new THREE.Vector3(-8, -24, 0), new THREE.Vector3(8, 24, 20));
    Vehicle.prototype.startRocking.call(renderable, 90, 1, 10);
    Vehicle.prototype.updateRocking.call(renderable, 500, false);
    expect(renderable.rockingStartTime).toBeUndefined();
    expect(renderable.rockingTiltObj.position.length()).toBe(0);
});

test('a unit inside a four-cell MCV foundation finds a reachable exit beyond all adjacent foundation cells', () => {
    const tiles = new Map<string, any>();
    for (let x = -3; x <= 7; x++) for (let y = -3; y <= 7; y++) tiles.set(`${x},${y}`, { rx: x, ry: y });
    const at = (x: number, y: number) => tiles.get(`${x},${y}`);
    const foundation = [...tiles.values()].filter(t => t.rx >= 0 && t.rx < 4 && t.ry >= 0 && t.ry < 4);
    const unit = { tile: at(1, 1), rules: { speedType: 1 }, isInfantry: () => true };
    const legal = (tile: any) => tile.rx >= 0 && tile.ry >= 0 && tile.rx < 7 && tile.ry < 7;
    const reachable = (tile: any) => tile.rx === 4 && tile.ry === 1;
    const game = { generateRandomInt: () => { throw Error('Foundation clearance must not sample RNG'); }, map: {
        tiles: { getByMapCoords: at }, mapBounds: { isWithinBounds: legal }, terrain: {
            getPassableSpeed: () => 1, findObstacles: () => [],
            computePath: (_speed: any, _infantry: any, from: any, _bridge: any, tile: any) => reachable(tile) ? [{ tile }, { tile: from }] : [],
        },
    } };
    const exit = findCampaignFoundationExit(game, unit, foundation);
    expect(exit).toBe(at(4, 1));
    expect(foundation.includes(exit)).toBe(false);
    game.map.terrain.findObstacles = () => [{}] as any;
    expect(findCampaignFoundationExit(game, unit, foundation)).toBeUndefined();
    expect(findCampaignFoundationExit(game, unit, [])).toBeUndefined();
});

test('shared Max=1 AI defense templates give each activated house one team while legacy journals retain global caps', () => {
    const run = (version: 1 | 2 | 3) => {
        const owners = [1, 2, 3].map(index => ({ name: `AI${index}`, isAi: true }));
        const trigger = { id: 'TRIGGER', team: 'DEFENSE', weight: 50 };
        const definition: any = { houses: new Map(owners.map(owner => [owner.name, { id: owner.name }])),
            teams: new Map([['DEFENSE', { properties: { Max: '1', IsBaseDefense: 'yes' } }]]),
            aiTriggers: new Map([[trigger.id, trigger]]), ini: { getSection: () => ({ getNumber: () => 100 }) } };
        const host: any = { instances: new Map(), production: new Set(owners), aiEnabled: new Set(owners),
            create: (type: string, _reinforce: any, _waypoint: any, _trigger: any, owner: any) => {
                const team = { id: host.instances.size, type, owner, phase: 'holding' };
                host.instances.set(team.id, team); return team;
            } };
        const game: any = { gameOpts: { campaign: { baseActivationVersion: version } }, generateRandomInt: () => 1 };
        const ai: any = new CampaignAi(definition, game, reference => owners.find(o => o.name === reference), host);
        ai.listValue = (key: string) => key === 'TotalAITeamCap' ? 30 : 100;
        ai.eligible = () => true;
        ai.update(1000); ai.update(2000);
        return [...host.instances.values()].map(team => team.owner.name);
    };
    expect(run(1)).toEqual(['AI1']);
    expect(run(2)).toEqual(['AI1', 'AI2', 'AI3']);
    expect(run(3)).toEqual(['AI1', 'AI2', 'AI3']);
});

test('a ready source factory clears friendly infantry through normal movement before legal placement, with legacy replay pinned', () => {
    const run = (version: 2 | 3) => {
        const tiles = new Map<string, any>();
        for (let x = -3; x <= 9; x++) for (let y = -3; y <= 9; y++) tiles.set(`${x},${y}`, { rx: x, ry: y });
        const at = (x: number, y: number) => tiles.get(`${x},${y}`);
        const foundation = [...tiles.values()].filter(t => t.rx >= 1 && t.rx < 5 && t.ry >= 1 && t.ry < 5);
        const rules = { name: 'NAWEAP', type: 2 }, owner: any = { name: 'AI', handicap: { buildDelay: 0 }, addUnitsBuilt() {} };
        const tasks: any[] = [], unit: any = { owner, tile: at(2, 2), rules: { speedType: 1 }, isInfantry: () => true,
            isUnit: () => true, isSpawned: true, moveTrait: { isMoving: () => false, isDisabled: () => false },
            unitOrderTrait: { getTasks: () => tasks, clearOrders() {}, cancelAllTasks() {}, addTask: (task: any) => tasks.push(task) } };
        let placed = 0;
        const queue: any = { status: 3, getFirst: () => ({ rules }), shift: () => { queue.status = 0; } };
        owner.production = { isAvailableForProduction: () => true, getQueueForObject: () => queue, getPrimaryFactory: () => undefined };
        const worker = { canPlaceAt: () => !foundation.includes(unit.tile), placeAt: () => { placed++; return [{}]; } };
        const game: any = { gameOpts: { campaign: { baseActivationVersion: version } },
            rules: { hasObject: () => true, getBuilding: () => rules }, art: { getObject: () => ({ foundation: { width: 4, height: 4 } }) },
            areFriendly: (a: any, b: any) => a.owner === b.owner, getConstructionWorker: () => worker,
            traits: { filter: () => [] }, events: { dispatch() {} }, map: { tiles: { getByMapCoords: at },
                mapBounds: { isWithinBounds: (tile: any) => tile.rx >= 0 && tile.ry >= 0 && tile.rx < 9 && tile.ry < 9 },
                getGroundObjectsOnTile: (tile: any) => tile === unit.tile ? [unit] : [], terrain: {
                    getPassableSpeed: () => 1, findObstacles: () => [],
                    computePath: (_s: any, _i: any, from: any, _b: any, tile: any) => [{ tile }, { tile: from }],
                } } };
        const definition: any = { houses: new Map([['AI', { id: 'AI' }]]), ini: { getSection: () => ({
            getNumber: () => 1, getString: () => 'NAWEAP,1,1' }) } };
        const builder = new CampaignBaseBuilder(definition, game, () => owner, new Set([owner]), 24);
        builder.update(10);
        expect(placed).toBe(0); expect(queue.status).toBe(3);
        if (version === 3) {
            expect(tasks).toHaveLength(1);
            unit.tile = at(6, 2);
            builder.update(11);
            expect(placed).toBe(1); expect(queue.status).toBe(0);
        } else expect(tasks).toHaveLength(0);
    };
    run(2); run(3);
});
