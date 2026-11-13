import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CampaignDefinition, waypointNumber } from '../../src/data/campaign/CampaignDefinition';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';

const bytes = readFileSync('.local/campaign/yr/sov04dmd/sov04dmd.map');
const source = new CampaignDefinition('yr', 'sov04dmd.map', bytes.toString(), undefined,
    { semanticsVersion: 35, sourceSha256: createHash('sha256').update(bytes).digest('hex') });
const team = source.teams.get('075D3C8C')!;

test('original Easy reinforcements keep their source entry and first regroup waypoint', () => {
    expect(waypointNumber(team.properties.Waypoint)).toBe(89);
    expect(source.waypoints.get(89)).toEqual({ x: 71, y: 149 });
    expect(source.scripts.get(team.script)!.instructions[0].raw).toBe('3,49');
    expect(source.waypoints.get(49)).toEqual({ x: 78, y: 144 });
    expect(source.taskForces.get(team.taskForce)!.units).toEqual([{ count: 3, type: 'HTNK' }, { count: 1, type: 'APOC' }]);
});

test('YR35 ignores only a covered destination during entry topology validation and keeps real spawn occupancy', () => {
    const cells = [{ rx: 0, ry: 0 }, { rx: 1, ry: 1 }, { rx: 3, ry: 3 }], destination = cells[2];
    const building = { isDestroyed: false, isBuilding: () => true, isVehicle: () => false };
    for (const [edition, version] of [['yr', 34], ['yr', 35], ['ra2', 35]] as const) {
        const spawned: any[] = [], checked: any[] = [];
        const unit = { rules: { speedType: 1, movementZone: 9 }, isInfantry: () => false };
        const host: any = { semanticsVersion: version, rules: () => unit.rules,
            canSpawn: (_: any, tile: any) => { checked.push(tile); return tile !== destination; },
            waypoint: () => destination, definition: { scripts: new Map([['S', { instructions: [{ opcode: 3, params: ['49'] }] }]]) },
            game: { gameOpts: { campaign: { edition, semanticsVersion: version } },
                createUnitForPlayer: () => unit, spawnObject: (_: any, tile: any) => spawned.push(tile),
                map: { mapBounds: { isWithinBounds: () => true }, getTileZone: () => 0,
                    getGroundObjectsOnTile: (tile: any) => tile === destination ? [building] : [],
                    tiles: { getByMapCoords: (x: number, y: number) => cells.find(tile => tile.rx === x && tile.ry === y) },
                    terrain: { computePath: (_s: any, _i: any, start: any, _b: any, end: any, _e: any, options: any) => {
                        expect(options.bestEffort).toBe(false);
                        return start === cells[1] && options.ignoredBlockers?.includes(building) ? [{ tile: end }, { tile: start }] : [];
                    } } } } };
        const run = () => (CampaignTeams.prototype as any).spawn.call(host, 'HTNK', {}, cells[0], { id: 'T', script: 'S', properties: {} });
        if (edition === 'yr' && version === 35) { run(); expect(spawned).toEqual([cells[1]]); }
        else { expect(run).toThrow('no passable reinforcement cell'); expect(spawned).toEqual([]); }
        expect(checked).toContain(cells[0]);
    }
});

test('YR42 admits the original tree-covered Seattle regroup within the existing movement radius', () => {
    const bytes = readFileSync('.local/campaign/yr/all03umd/all03umd.map');
    const source = new CampaignDefinition('yr', 'all03umd.map', bytes.toString(), undefined,
        { semanticsVersion: 42, sourceSha256: createHash('sha256').update(bytes).digest('hex') });
    const spec = source.teams.get('0B6D66EC')!;
    expect(source.waypoints.get(waypointNumber(spec.properties.Waypoint))).toEqual({ x: 170, y: 125 });
    expect(source.scripts.get(spec.script)!.instructions[0].raw).toBe('3,57');
    expect(source.waypoints.get(57)).toEqual({ x: 153, y: 116 });
    expect(source.ini.getSection('Terrain')!.getString('116153')).toBe('TREE04');
    const start = { rx: 170, ry: 125, z: 4 }, target = { rx: 153, ry: 116, z: 4 };
    for (const [edition, version, end] of [
        ['yr', 41, { rx: 154, ry: 116, z: 4 }], ['ra2', 42, { rx: 154, ry: 116, z: 4 }],
        ['yr', 42, { rx: 154, ry: 116, z: 4 }], ['yr', 42, { rx: 157, ry: 116, z: 4 }],
        ['yr', 42, { rx: 154, ry: 116, z: 6 }],
    ] as const) {
        const unit = { rules: { speedType: 1, movementZone: 9 }, isInfantry: () => false };
        const spawned: any[] = [];
        const host: any = { semanticsVersion: version, rules: () => unit.rules, canSpawn: () => true,
            waypoint: () => target, definition: source,
            game: { gameOpts: { campaign: { edition } }, rules: { general: { closeEnough: 2.25 } },
                createUnitForPlayer: () => unit, spawnObject: (_: any, cell: any) => spawned.push(cell),
                map: { mapBounds: { isWithinBounds: () => true }, getTileZone: () => 0,
                    getGroundObjectsOnTile: () => [],
                    tiles: { getByMapCoords: (x: number, y: number) => x === start.rx && y === start.ry ? start : undefined },
                    terrain: { computePath: (_s: any, _i: any, _a: any, _b: any, _d: any, _e: any, options: any) =>
                        options.bestEffort ? [{ tile: end }, { tile: start }] : [] } } } };
        const run = () => (CampaignTeams.prototype as any).spawn.call(host, 'MTNK', {}, start, spec);
        if (edition === 'yr' && version === 42 && end.rx === 154 && end.z === 4) {
            run(); expect(spawned).toEqual([start]);
        } else { expect(run).toThrow('no passable reinforcement cell'); expect(spawned).toEqual([]); }
    }
});
