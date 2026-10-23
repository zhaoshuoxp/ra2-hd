// Exercise accepted faction artwork through original Urban overlay placements.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { validateNativeWalls } from '../m2/official-maps/native-walls.mjs';

export async function validateUrbanFactionWalls(session, density, names) {
    const { page, report } = session;
    const authority = JSON.parse(await fs.readFile(
        '.artifacts/m2-4/urban-overlay-native-batch45-v1/faction-wall-authority-v2.json'));
    assert.equal(authority.status, 'PASS_ACCEPTED_WALL_SOURCE_PALETTE_FRAME_GEOMETRY_AND_PAYLOAD_PINS');
    assert(names.length && names.every(name => ['GAWALL', 'NAWALL'].includes(name)));
    const environmentWall = report.newNativeWalls;
    report.nativeFactionWalls = [];
    for (const name of names) {
        const row = authority.rows.find(row => row.identity === name);
        const expected = `${row.manifestSha256}/${row.sourceSha256}/TEMPERATE/tiles/${density}`;
        const original = await page.evaluate(name => {
            const d = window.__ra2debug;
            const walls = d.game.getWorld().getAllObjects().filter(object => object.name === name && object.isOverlay());
            if (!walls.length) throw Error('No original faction wall placement: ' + name);
            d.worldInteraction.minimapHandler.panToTile(walls[0].tile);
            return walls.map(object => window.__m23Binding(object));
        }, name);
        await page.waitForFunction(({ name, expected }) => {
            const d = window.__ra2debug;
            const walls = d.game.getWorld().getAllObjects().filter(object => object.name === name && object.isOverlay());
            return walls.length > 0 && walls.every(object => window.__m23Binding(object).hd === expected);
        }, { name, expected }, { timeout: 30000 });
        await validateNativeWalls(session, name, expected, 1);
        report.newNativeWalls.originalPlacements = original;
        report.newNativeWalls.acceptedArtwork = 'REUSED_WITHOUT_CHANGING_PAYLOADS';
        report.newNativeWalls.sourceAuthority = row;
        report.newNativeWalls.demand = await page.evaluate(name => {
            const d = window.__ra2debug;
            return { queued: d.sovietUnitsHd.families[name],
                eager: d.worldView.sovietBuildingsHd?.[name]?.report };
        }, name);
        report.nativeFactionWalls.push(report.newNativeWalls);
    }
    if (environmentWall) report.newNativeWalls = environmentWall;
    else delete report.newNativeWalls;
}

export async function validateLateUrbanFactionWall(session, density, name) {
    const { page, report } = session;
    assert.equal(name, 'GAWALL');
    const authority = JSON.parse(await fs.readFile(
        '.artifacts/m2-4/urban-overlay-native-batch45-v1/faction-wall-authority-v2.json'));
    const row = authority.rows.find(row => row.identity === name);
    const expected = `${row.manifestSha256}/${row.sourceSha256}/TEMPERATE/tiles/${density}`;
    const fixture = report.nativeLateFactionWall = await page.evaluate(name => {
        const d = window.__ra2debug, g = d.game;
        const priorDemand = d.sovietUnitsHd.families[name];
        if (priorDemand?.status !== 'NOT_REQUESTED') throw Error('Late wall must begin without an allocation');
        const tile = g.map.tiles.getAll().find(tile => g.map.isWithinBounds(tile) && !tile.rampType
            && g.map.getTileZone(tile, true) === 0 && !g.map.getObjectsOnTile(tile).length
            && g.map.tiles.getAllNeighbourTiles(tile).every(other => !g.map.getObjectsOnTile(other).length));
        if (!tile) throw Error('No legal empty native late-wall site');
        const object = g.createObject(4, name);
        object.overlayId = g.rules.getOverlayId(name); object.value = 0;
        g.spawnObject(object, tile);
        window.__m24LateWall = object;
        d.worldInteraction.minimapHandler.panToTile(tile);
        return { name, priorDemand, tile: [tile.rx, tile.ry], initial: window.__m23Binding(object),
            disclosure: 'One controlled isolated native overlay, with the original overlay ID and disconnected frame 0, on an empty legal tile. No map file, rule, source, owner data or gameplay setting is edited. This tests a late render lease and is not an original map placement.' };
    }, name);
    await page.waitForFunction(expected => window.__m23Binding(window.__m24LateWall).hd === expected,
        expected, { timeout: 30000 });
    fixture.bound = await page.evaluate(() => window.__m23Binding(window.__m24LateWall));
    assert.equal(fixture.bound.hd, expected);
    assert.equal(fixture.bound.frame, 0);
    assert.equal(fixture.bound.batchedHd, false, 'Unprepared late wall uses the existing per-object renderer');
    fixture.status = 'PASS_LATE_ORIGINAL_TO_COMPLETE_HD_WALL_DEMAND_BINDING';
}
