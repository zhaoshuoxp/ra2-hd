import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, pauseWorld, worldState } from '../m3-2/native-session.mjs';
import { closeCampaignMenuPaused } from '../campaign-completion/named-save-restart.mjs';

const out = path.resolve(process.argv[2]), checkpoint = JSON.parse(await fs.readFile(path.resolve(process.argv[3])));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'Read-only navigation/topology inspection of real restored progress. Explicit diagnostic reveal occurs only after the exact checkpoint comparison; it cannot establish objective or save acceptance.' };
let session;
try {
    session = await campaignSession(out, report, { edition: 'yr', density: 0 });
    await session.page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22)
        .launchDiagnostic(checkpoint, checkpoint.identity.mission), checkpoint);
    await session.page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
        && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 180000 });
    await pauseWorld(session.page);
    const restored = await worldState(session.page);
    assert.deepEqual({ worldHash: restored.hash, rng: restored.rng, mission: restored.mission, world: restored.world,
        pendingCallbacks: restored.pendingCallbacks }, checkpoint.expected);
    await closeCampaignMenuPaused(session.page);
    await session.page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true));
    report.topology = await session.page.evaluate(() => {
        const g = window.__ra2debug.game, own = g.localPlayer.getOwnedObjects(), boat = own.find(object => object.name === 'SAPC');
        const boris = own.find(object => object.name === 'BORIS'), terrain = g.map.terrain;
        const boatIslands = terrain.getIslandIdMap(boat.rules.speedType, false), footIslands = terrain.getIslandIdMap(boris.rules.speedType, true);
        const describe = unit => ({ id: unit.id, name: unit.name, tile: [unit.tile.rx, unit.tile.ry], speedType: unit.rules.speedType,
            movementZone: unit.rules.movementZone, footIsland: footIslands.get(unit.tile, unit.onBridge), boatIsland: boatIslands.get(unit.tile, unit.onBridge) });
        const tiles = g.map.tiles.getAll().filter(tile => g.map.isWithinBounds(tile)).map(tile => ({
            x: tile.rx, y: tile.ry, z: tile.z, terrain: tile.terrainType, land: tile.landType,
            foot: terrain.getPassableSpeed(tile, boris.rules.speedType, true, false),
            boat: terrain.getPassableSpeed(tile, boat.rules.speedType, false, false),
            footIsland: footIslands.get(tile, false), boatIsland: boatIslands.get(tile, false),
        }));
        const statics = g.world.getAllObjects().filter(object => (object.isBuilding() || object.isOverlay() && object.rules.wall)
            && !object.isDestroyed).map(object => ({ id: object.id, name: object.name, owner: object.owner?.name,
                tile: [object.tile.rx, object.tile.ry], wall: object.rules.wall, gate: object.rules.gate,
                cells: g.map.tileOccupation.calculateTilesForGameObject(object.tile, object).map(tile => [tile.rx, tile.ry]) }));
        return { tick: g.currentTick, boat: describe(boat), boris: describe(boris), tiles, statics };
    });
    if (!process.argv.includes('--no-reveal')) {
    await session.page.evaluate(() => { const g = window.__ra2debug.game;
        g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g); });
    for (const name of ['SAPC', 'BORIS']) {
        await session.page.evaluate(name => { const d = window.__ra2debug, unit = d.game.localPlayer.getOwnedObjects().find(unit => unit.name === name);
            d.worldInteraction.minimapHandler.panToTile(unit.tile); }, name);
        await session.page.screenshot({ path: path.join(out, name.toLowerCase() + '-diagnostic.png') });
    }
    } else assert.deepEqual(await worldState(session.page), restored);
    report.status = 'PASS_READ_ONLY_SOURCE_NAVIGATION_OBSERVATION_NOT_OBJECTIVE_ACCEPTANCE';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await session?.app.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
