import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, worldState } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from '../campaign-completion/ordinary-commands.mjs';
import { closeCampaignMenuPaused } from '../campaign-completion/named-save-restart.mjs';

const out = path.resolve(process.argv[2]), checkpoint = JSON.parse(await fs.readFile(path.resolve(process.argv[3])));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], samples: [],
    scope: 'Exact real checkpoint restoration, read-only factory/task inspection and ordinary rally/move orders. Source rules, health, production and task state are never edited.' };
let session, commands;
async function inspect(label) {
    report.samples.push(await commands.inspect(label));
    (report.factories ??= []).push(await session.page.evaluate(label => {
        const g = window.__ra2debug.game;
        const point = tile => tile && [tile.rx, tile.ry, tile.z];
        const task = (value, depth = 0) => value && ({ name: value.constructor.name, status: value.status,
            options: value.options && { ignoredBlockers: value.options.ignoredBlockers?.map(object => object.id),
                forceWaitOnPathBlocked: value.options.forceWaitOnPathBlocked, closeEnoughTiles: value.options.closeEnoughTiles },
            target: point(value.targetTile ?? value.target?.tile), rampBlockersPushed: value.rampBlockersPushed,
            checkRampTiles: value.checkRampTiles?.map(point),
            children: depth < 2 ? value.children?.map(child => task(child, depth + 1)) : undefined });
        return { label, tick: g.currentTick,
            factories: [...g.localPlayer.buildings].filter(building => building.factoryTrait).map(building => ({
                id: building.id, name: building.name, tile: point(building.tile), foundation: building.getFoundation(),
                status: building.factoryTrait.status, delivering: building.factoryTrait.deliveringUnit?.id,
                rally: point(building.rallyTrait?.getRallyPoint()),
                cells: g.map.tileOccupation.calculateTilesForGameObject(building.tile, building).map(tile => ({
                    tile: point(tile), actors: g.map.getObjectsOnTile(tile).filter(object => object.isUnit()).map(object => object.id) })) })),
            units: g.localPlayer.getOwnedObjects().filter(unit => unit.isUnit() && unit.isSpawned).map(unit => ({
                id: unit.id, name: unit.name, tile: point(unit.tile), moveState: unit.moveTrait?.moveState,
                tasks: unit.unitOrderTrait?.getTasks().map(value => task(value)) })) };
    }, label));
    await fs.writeFile(path.join(out, 'progress.json'), JSON.stringify(report, null, 2) + '\n');
}
try {
    session = await campaignSession(out, report, { edition: 'yr' });
    await session.page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22)
        .launchDiagnostic(checkpoint, checkpoint.identity.mission), checkpoint);
    await session.page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
        && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 180000 });
    const restored = await worldState(session.page);
    assert.deepEqual({ worldHash: restored.hash, rng: restored.rng, mission: restored.mission,
        world: restored.world, pendingCallbacks: restored.pendingCallbacks }, checkpoint.expected);
    await closeCampaignMenuPaused(session.page);
    await session.page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true));
    commands = new OrdinaryCampaignCommands(session.page, report);
    commands.groundDefenders = ['HTNK', 'APOC', 'E2', 'SHK', 'DRON'];
    await inspect('restored-stalled-production');
    await commands.order(['NAWEAP', 'NAHAND'], 0, undefined, [112, 32]);
    await commands.order(['V3'], 0, undefined, [103, 30]);
    await commands.order(['HTNK', 'HTK'], 4, undefined, [114, 32]);
    for (let i = 0; i < 5; i++) { await commands.step(180); await inspect('ordinary-clearance-' + i); }
    report.status = 'OBSERVED_ORIGINAL_PRODUCTION_AND_ORDINARY_CLEARANCE';
    report.finalCheckpoint = 'last-trusted-checkpoint.json';
    const saved = await session.page.evaluate(() => { const g = window.__ra2debug.game; return g.campaign.journal.capture(g); });
    await fs.writeFile(path.join(out, report.finalCheckpoint), JSON.stringify(saved) + '\n');
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await session?.app.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
