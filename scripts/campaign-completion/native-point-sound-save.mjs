import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, pauseWorld, worldState } from '../m3-2/native-session.mjs';
import { closeCampaignMenuPaused } from './named-save-restart.mjs';
import { continueRecordedSource } from './replay-source.mjs';

const [outArg, checkpointArg, sourceArg, target, waypointArg] = process.argv.slice(2);
const out = path.resolve(outArg), checkpoint = JSON.parse(await fs.readFile(path.resolve(checkpointArg)));
const source = JSON.parse(await fs.readFile(path.join(path.resolve(sourceArg), 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(path.resolve(sourceArg), 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'A separate fresh application loads the exact checkpoint produced by the real named Save UI. The private diagnostic loader is used only for this explicit existing-save audio probe. Source audio requests must reconstruct, all retained point handles must play, and the actual subsequent source Stop Sounds At must stop its real handles while leaving other locations active. Recorded ordinary commands continue the unchanged source world; no injected story action, hidden new-mission save or simulation/RNG edit.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 0 }));
    await page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22)
        .launchDiagnostic(checkpoint, checkpoint.identity.mission), checkpoint);
    await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
        && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 180000 });
    await pauseWorld(page); const { tick, hash, ...state } = await worldState(page);
    assert.equal(tick, checkpoint.tick); assert.deepEqual({ worldHash: hash, ...state }, checkpoint.expected);
    report.restored = { tick, hash, exactWorldRngMissionTeamsAndCallbacks: true };
    await closeCampaignMenuPaused(page);
    report.before = await page.evaluate(waypoint => {
        const d = window.__ra2debug, g = d.game, handler = d.gameScreen.playerUi.soundHandler;
        const tile = g.map.getTileAtWaypoint(waypoint), key = `${tile.rx},${tile.ry},${tile.z}`;
        const handles = [...(handler.triggerSoundHandles.get(key) ?? [])];
        window.__sourcePointSoundAudit = [];
        g.events.subscribe(event => {
            if (event.type !== 60) return;
            window.__sourcePointSoundAudit.push({ tick: g.currentTick, key: `${event.tile.rx},${event.tile.ry},${event.tile.z}`,
                testedHandlesPlaying: handles.map(handle => handle.isPlaying()),
                locationRetained: handler.triggerSoundHandles.has(key), emitterRetained: g.campaign.soundEmitters.has(key),
                otherLocations: [...handler.triggerSoundHandles].filter(([name]) => name !== key)
                    .map(([name, active]) => ({ key: name, playing: [...active].some(handle => handle.isPlaying()) })) });
        });
        d.gameScreen.playerUi.worldInteraction.minimapHandler.panToTile(tile);
        return { key, sourceLocations: g.campaign.soundEmitters.size, restoredLocations: handler.triggerSoundHandles.size,
            testedHandlesPlaying: handles.map(handle => handle.isPlaying()),
            allLocationsPlaying: [...handler.triggerSoundHandles.values()].every(active => [...active].some(handle => handle.isPlaying())) };
    }, Number(waypointArg));
    assert.equal(report.before.sourceLocations, report.before.restoredLocations);
    assert(report.before.testedHandlesPlaying.length > 0 && report.before.testedHandlesPlaying.every(Boolean));
    assert(report.before.allLocationsPlaying);
    const before = await worldState(page); await page.waitForTimeout(1000); assert.deepEqual(await worldState(page), before);
    await page.screenshot({ path: path.join(out, 'native-restored-point-sounds-before-source-demolition.png') });
    report.continuation = await continueRecordedSource(page, source, target);
    report.after = await page.evaluate(() => window.__sourcePointSoundAudit);
    const stopped = report.after.find(event => event.key === report.before.key);
    assert(stopped && !stopped.locationRetained && !stopped.emitterRetained);
    assert(stopped.testedHandlesPlaying.every(playing => !playing));
    assert(stopped.otherLocations.length > 0 && stopped.otherLocations.every(location => location.playing));
    await page.screenshot({ path: path.join(out, 'native-actual-source-point-sound-stopped.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_EXISTING_SAVE_AMBIENT_RESTORE_AND_ACTUAL_SOURCE_POINT_STOP';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
