import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { replaySourcePrefix, continueRecordedSource } from './replay-source.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';

const [output, directory, prefix, active, loss] = process.argv.slice(2), out = path.resolve(output);
await fs.mkdir(out, { recursive: false });
const source = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(directory, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
const report = { status: 'RUNNING', errors: [], failedResources: [], sourceDirectory: path.resolve(directory),
    scope: 'Fresh original creation seeds and recorded ordinary commands reconstruct a state before the actual original team camera. Presentation is suppressed only before that prefix. The original timer triggers34/50/24/20 live; actual named Save UI and full app restart restore its active camera, exact world/RNG/mission and180-tick continuation, then reach the recorded original failure. No assigned result, altered source, hidden save or post-creation RNG edits.' };
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    report.prefix = await replaySourcePrefix(page, source, prefix);
    report.activeBoundary = await continueRecordedSource(page, source, active);
    report.activeCamera = await page.evaluate(() => {
        const g = window.__ra2debug.game;
        return { tick: g.currentTick, hash: g.getHash(), move: g.campaign.captureMedia().cameraMove,
            teamTrace: g.campaign.teams.trace.filter(row => row.opcode === 34),
            converted: g.campaign.machine.variables.get('0') };
    });
    assert(report.activeCamera.converted && report.activeCamera.teamTrace.length === 1);
    assert(report.activeCamera.move && report.activeCamera.move.progress > 0 && report.activeCamera.move.progress < 1);
    assert.equal(report.activeCamera.move.speed, 4);
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report, 'Allied08 source camera'));
    assert(report.restoredCameraMove);
    report.continued = await continueRecordedSource(page, source, loss);
    report.failure = await page.evaluate(() => {
        const g = window.__ra2debug.game;
        return { tick: g.currentTick, hash: g.getHash(), result: g.campaign.result,
            actions: g.campaign.trace.filter(action => action.opcode === 51 || action.opcode === 2) };
    });
    assert.equal(report.failure.result, 'defeat');
    assert.deepEqual(report.failure.actions.map(action => action.opcode), [51, 2]);
    await page.evaluate(() => { const manager = window.__ra2debug.gameScreen.gameTurnMgr;
        manager.setPaused(false); manager.setCampaignPaused(false); manager.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=defeat][data-score-phase=complete]', { timeout: 120000 });
    report.score = await page.locator('body').innerText();
    assert.equal(await page.locator('[data-campaign-media]').count(), 0);
    await page.screenshot({ path: path.join(out, 'native-original-timed-camera-restart-defeat.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_TIMED_CAMERA_SAVE_RESTART_AND_RECORDED_FAILURE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
