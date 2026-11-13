import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'Read-only original Allied07 map/waypoint/topology intake. The unsupported original action18 is allowed to stop diagnostic execution; no instruction is skipped, event injected or result manufactured. This is not playability or gameplay evidence.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 0 }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(undefined, 'all07t.map'));
    await page.waitForFunction(() => window.__ra2debug.game?.campaign?.launch.mission === 'all07t.map', undefined, { timeout: 180000 });
    // The diagnostic world may stop before GameScreen's turn manager exists.
    await page.evaluate(() => window.__ra2debug.gameScreen?.gameTurnMgr?.setCampaignPaused(true));
    report.source = await page.evaluate(() => {
        const g = window.__ra2debug.game, c = g.campaign;
        return { launch: c.launch, tick: g.currentTick, hash: g.getHash(), failure: c.failure, issues: c.issues,
            worldObjects: g.world.getAllObjects().length,
            bridges: [...g.map.bridges.pieces].map(piece => ({ name: piece.obj.name,
                tile: [piece.obj.tile.rx, piece.obj.tile.ry], high: piece.obj.isHighBridge(),
                elevation: piece.obj.tileElevation, head: piece.headType })),
            waypoints: [0, 6, 7, 9].map(id => {
                const coords = c.definition.waypoints.get(id), tile = coords && g.map.tiles.getByMapCoords(coords.x, coords.y);
                return { id, coords, tile: tile && { rx: tile.rx, ry: tile.ry, z: tile.z, landType: tile.landType,
                    terrainType: tile.terrainType, onBridgeLandType: tile.onBridgeLandType },
                    contents: tile && g.map.tileOccupation.getObjectsOnTile(tile).map(o => ({ name: o.name, type: o.type })) };
            }) };
    });
    const topology = await page.evaluate(() => {
        const g = window.__ra2debug.game, initial = g.map.getInitialMapObjects();
        return { bounds: g.map.mapBounds.getRawLocalSize(), fullSize: g.map.mapBounds.getFullSize(),
            tiles: g.map.tiles.getAll().map(tile => ({ x: tile.rx, y: tile.ry, z: tile.z,
                land: tile.landType, terrain: tile.terrainType, ramp: tile.rampType,
                track: g.rules.getLandRules(tile.landType).getSpeedModifier(1) })),
            terrains: initial.terrains.map(object => ({ ...object,
                occupation: g.rules.getObject(object.name, 6).getOccupationBits(g.map.getTheaterType()) })),
            overlays: initial.overlays.map(object => {
                const name = g.rules.getOverlayName(object.id), rule = g.rules.getObject(name, 4);
                return { ...object, name, crushable: rule.crushable, wall: rule.wall,
                    land: rule.land, noUseTileLandType: rule.noUseTileLandType };
            }) };
    });
    await fs.writeFile(path.join(out, 'original-zone-topology.json'), JSON.stringify(topology) + '\n');
    report.topology = { tiles: topology.tiles.length, terrains: topology.terrains.length, overlays: topology.overlays.length };
    assert.equal(report.source.launch.sourceSha256, '3925c1211d86938a7137ff0df11cba85c59d3ae75742221d5e2d4d502d33c103');
    assert(report.source.issues.some(issue => issue.reason.includes('18')));
    assert(report.source.waypoints.every(waypoint => waypoint.tile));
    await page.screenshot({ path: path.join(out, 'diagnostic-original-zone-intake-not-gameplay.png') });
    report.status = 'PASS_READ_ONLY_ORIGINAL_MAP_INTAKE_NOT_PLAYABILITY';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, source: report.source, error: report.error, out }));
