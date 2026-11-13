import { expect, test } from 'bun:test';
import { Projectile, ProjectileState } from '../../src/game/gameobject/Projectile';
import { ObjectPosition } from '../../src/game/gameobject/ObjectPosition';
import { Vector3 } from '../../src/game/math/Vector3';

function shot(semanticsVersion?: number, horizontalDistance = 0, heightDifference = 0) {
    const tiles = { getByMapCoords: (rx: number, ry: number) => ({ rx, ry, z: 2, rampType: 0 }),
        getPlaceholderTile: (rx: number, ry: number) => ({ rx, ry, z: 2, rampType: 0 }) };
    const position = new ObjectPosition(tiles, { getBridgeOnTile: () => undefined });
    position.tile = tiles.getByMapCoords(4, 5); position.setAbsoluteElevationWorld(418);
    const start = position.worldPosition.clone(), aim = start.clone().add(new Vector3(horizontalDistance, heightDifference, 0));
    const projectile: any = Object.create(Projectile.prototype);
    Object.assign(projectile, { cachedTraits: { tick: [] }, rules: { arcing: true }, maxSpeed: 96,
        state: ProjectileState.Travel, velocity: new Vector3(), position, initialSelfPosition: start, aimPoint: aim,
        target: { getWorldCoords: () => aim.clone() }, fromWeapon: { rules: {}, warhead: { rules: {} } },
        checkObstacles: () => ({ type: 0 }) });
    const hits: any[] = [];
    projectile.detonate = () => { hits.push(position.worldPosition.clone()); };
    const game: any = { gameOpts: semanticsVersion === undefined ? {} : { campaign: { semanticsVersion } },
        rules: { audioVisual: { gravity: 6 } }, map: { isWithinHardBounds: () => true } };
    projectile.update(game);
    return { hits, projectile, game, start, aim };
}

test('coincident cannon impacts keep a finite exact detonation point in current campaigns and skirmish', () => {
    for (const version of [undefined, 10]) for (const height of [0, -32, 24]) {
        const result = shot(version, 0, height);
        expect(result.hits).toHaveLength(1); expect(result.hits[0].toArray()).toEqual(result.aim.toArray());
        expect(result.hits[0].toArray().every(Number.isFinite)).toBe(true);
    }
});

test('ordinary nonzero cannon travel and released campaign trajectories retain their path', () => {
    const old = shot(9), legacy = shot(1); expect(Number.isNaN(old.hits[0].y)).toBe(true);
    expect(Number.isNaN(legacy.hits[0].y)).toBe(true);
    const current = shot(10, 512, -20), released = shot(9, 512, -20);
    expect(current.hits).toEqual([]); expect(released.hits).toEqual([]);
    expect(current.projectile.position.worldPosition.toArray()).toEqual(released.projectile.position.worldPosition.toArray());
    expect(current.projectile.position.worldPosition.toArray().every(Number.isFinite)).toBe(true);
    for (let i = 0; i < 20 && !current.hits.length; i++) {
        current.projectile.update(current.game); released.projectile.update(released.game);
    }
    expect(current.hits).toHaveLength(1); expect(current.hits[0].toArray()).toEqual(released.hits[0].toArray());
});
