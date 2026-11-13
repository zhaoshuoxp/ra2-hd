import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld, worldState } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]), mission = process.argv[3] ?? 'sov01umd.map';
const density = Number(process.argv[4] ?? 0), ticks = Number(process.argv[5] ?? 900);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', mission, density, errors: [], failedResources: [],
    scope: 'Native original-source opening through the private source launcher, without altering the map, rules, triggers, variables or result. This checks startup/runtime only and does not establish mission playability or a complete victory.' };
let app, page;
let errorTimer;
try {
    const handledError = new Promise((_, reject) => {
        errorTimer = setInterval(() => fs.readFile(path.join(out, 'profile/game-error-latest.json'), 'utf8').then(value => {
            const error = JSON.parse(value); report.handledError = error;
            reject(new Error(error.error?.stack || error.error?.message || 'Handled native game error'));
        }).catch(error => { if (error.code !== 'ENOENT') reject(error); }), 500);
    });
    await Promise.race([handledError, (async () => {
        ({ app, page } = await campaignSession(out, report, { edition: 'yr', density }));
        await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission), mission);
        await waitWorld(page, mission);
        await page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true));
        report.initial = await worldState(page);
        report.progress = await stepWorld(page, ticks);
        report.final = await worldState(page);
        report.launch = await page.evaluate(() => window.__ra2debug.game.campaign.launch);
        report.hd = await page.evaluate(() => {
            const d = window.__ra2debug;
            return { terrain: d.terrainHd, environment: d.environmentHd, actors: d.sovietUnitsHd };
        });
        assert.equal(report.launch.edition, 'yr'); assert.equal(report.launch.semanticsVersion, 41);
        assert(!report.progress.failure, report.progress.failure);
        assert.notEqual(report.progress.result, 'defeat', 'Original no-input opening ended in defeat');
        await page.screenshot({ path: path.join(out, 'native-opening.png') });
        assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
        report.status = 'PASS_NATIVE_SOURCE_OPENING_NOT_COMPLETE_MISSION_ACCEPTANCE';
    })()]);
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally {
    clearInterval(errorTimer);
    if (page) {
        report.visible = await page.locator('body').innerText().catch(() => 'Unavailable');
        await page.screenshot({ path: path.join(out, report.status === 'FAIL' ? 'native-failure.png' : 'native-final.png') }).catch(() => {});
    }
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, mission, density, progress: report.progress, error: report.error, out }));
