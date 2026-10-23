// Check a placed native wall's damage, removal and adjacent frame rebinding.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function validateNativeWalls({ page, report, out }, name, expectedBinding, minimumNeighbours = 2) {
    const result = report.newNativeWalls = {
        name, disclosure: 'One original placed wall and its original adjacent walls. Stock health damage and destruction update native connection frames. No object, frame, rule, source or map overrides.',
        expectedBinding, minimumNeighbours
    };
    result.before = await page.evaluate(({ name, minimumNeighbours }) => {
        const d = window.__ra2debug, g = d.game;
        const walls = g.getWorld().getAllObjects().filter(object => object.isOverlay()
            && object.name === name && object.isSpawned && object.healthTrait?.health > 0);
        const neighbours = object => [[0, 1], [0, -1], [1, 0], [-1, 0]].flatMap(([x, y]) => {
            const tile = g.map.tiles.getByMapCoords(object.tile.rx + x, object.tile.ry + y);
            return tile ? g.map.getObjectsOnTile(tile).filter(wall => wall.name === name && wall.isSpawned) : [];
        });
        const wall = walls.find(object => object.healthTrait.health === 100
            && g.map.tiles.getAllNeighbourTiles(object.tile).every(tile => g.map.getObjectsOnTile(tile)
                .filter(other => other.wallTrait).every(other => other.name === name && other.healthTrait.health === 100))
            && g.map.isWithinBounds(object.tile)
            && neighbours(object).length >= minimumNeighbours
            && neighbours(object).every(neighbour => g.map.isWithinBounds(neighbour.tile)));
        if (!wall?.wallTrait) throw Error('No original connected native wall: ' + name);
        window.__m24Wall = { wall, neighbours: neighbours(wall) };
        return { wall: window.__m23Binding(wall), withinBuildableBounds: true, initiallyHealthyNeighbours: true, maxHitPoints: wall.healthTrait.maxHitPoints,
            neighbours: window.__m24Wall.neighbours.map(object => ({ ...window.__m23Binding(object), value: object.value })) };
    }, { name, minimumNeighbours });
    assert(result.before.neighbours.length >= minimumNeighbours);
    assert.equal(result.before.wall.hd, expectedBinding);
    const capture = async label => {
        await page.evaluate(() => {
            const d = window.__ra2debug;
            d.worldInteraction.minimapHandler.panToTile(window.__m24Wall.wall.tile);
        });
        await page.waitForTimeout(150);
        const png = await page.evaluate(() => {
            const d = window.__ra2debug; d.renderer.render();
            return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
        });
        const file = name + '-' + label + '-framebuffer.png';
        await fs.writeFile(path.join(out, file), Buffer.from(png, 'base64'));
        return { file, rescaled: false };
    };
    result.beforeCapture = await capture('normal');
    await page.evaluate(() => {
        const d = window.__ra2debug, wall = window.__m24Wall.wall;
        wall.healthTrait.inflictDamage(wall.healthTrait.getHitPoints()
            - Math.max(1, Math.floor(wall.healthTrait.maxHitPoints * .2)), wall, d.game);
    });
    await page.waitForTimeout(250);
    result.damaged = await page.evaluate(() => window.__m23Binding(window.__m24Wall.wall));
    assert.equal(result.damaged.hd, expectedBinding);
    assert(result.damaged.health > 0 && result.damaged.health < result.before.wall.health);
    assert.equal(result.damaged.frame, result.before.wall.frame + 16);
    result.damagedCapture = await capture('damaged');
    await page.evaluate(() => {
        const d = window.__ra2debug, wall = window.__m24Wall.wall;
        wall.healthTrait.inflictDamage(wall.healthTrait.getHitPoints(), wall, d.game);
        if (wall.isSpawned) d.game.destroyObject(wall, { player: d.localPlayer });
    });
    await page.waitForTimeout(250);
    result.removed = await page.evaluate(() => {
        const d = window.__ra2debug, { wall, neighbours } = window.__m24Wall;
        return { spawned: wall.isSpawned, destroyed: wall.isDestroyed,
            batchedEntryPresent: d.mapRenderable.overlayLayer.hasObject(wall),
            neighbours: neighbours.map(object => ({ ...window.__m23Binding(object), value: object.value })) };
    });
    assert(result.removed.destroyed && !result.removed.spawned && !result.removed.batchedEntryPresent);
    const surviving = result.removed.neighbours.filter(wall => wall.spawned);
    assert(surviving.length && surviving.every(wall => wall.hd === expectedBinding));
    assert(surviving.some(wall => wall.value !== result.before.neighbours.find(old => old.id === wall.id).value),
        'Removal must update a surviving original adjacent connection');
    result.removedCapture = await capture('removed-adjacency');
    result.status = 'PASS_NATIVE_WALL_DAMAGE_REMOVAL_ADJACENT_REBINDING';
}
