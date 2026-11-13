import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { campaignSession, worldState } from '../m3-2/native-session.mjs';
import { closeCampaignMenuPaused } from './named-save-restart.mjs';
import { replaySourcePrefix, continueRecordedSource } from './replay-source.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';

const [outArg, sourceArg, prefix, requestLabel, goalLabel] = process.argv.slice(2);
const out = path.resolve(outArg), directory = path.resolve(sourceArg);
await fs.mkdir(out, { recursive: false });
const source = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(directory, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
const goal = source.samples.findLast(sample => sample.label === goalLabel);
assert.equal(goal?.result, 'victory');
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'Specialized persistence probe on the ACTUALLY source-triggered fullscreen movie, reached with recorded ordinary commands. Capture uses the real campaign journal and real save-record serializer. Only its record insertion into a DISPOSABLE profile library is programmatic; the fresh-app Load UI restores it. This does not claim that the fullscreen UI offers a manual save button. No injected story event, source edit, result assignment or hidden new-mission initializer.' };
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    report.replay = await replaySourcePrefix(page, source, prefix);
    report.request = await continueRecordedSource(page, source, requestLabel);
    await page.waitForFunction(() => document.querySelector('[data-campaign-media][style*="position: fixed"] video')?.currentTime > 1);
    // The menu deliberately pauses the actual movie. Its Save UI is not clicked
    // through the fullscreen overlay; persistence insertion is labeled above.
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    const checkpoint = await page.evaluate(() => { const g = window.__ra2debug.game; return g.campaign.journal.capture(g); });
    const movie = checkpoint.presentation.movies.find(movie => movie.placement === 'fullscreen');
    assert(movie && movie.time > .5);
    const before = await worldState(page);
    await fs.writeFile(path.join(out, 'fullscreen-checkpoint.json'), JSON.stringify(checkpoint));
    execFileSync('bun', ['scripts/campaign-completion/create-save-record.ts', path.join(out, 'fullscreen-checkpoint.json'),
        path.join(out, 'fullscreen-save-record.json')], { cwd: process.cwd(), stdio: 'pipe' });
    const record = JSON.parse(await fs.readFile(path.join(out, 'fullscreen-save-record.json')));
    await page.evaluate(async record => {
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('ra2-hd-campaign-library', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('saves', { keyPath: 'id' });
            request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        try {
            await new Promise((resolve, reject) => {
                const tx = db.transaction('saves', 'readwrite'); tx.objectStore('saves').put(record);
                tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error);
            });
        } finally { db.close(); }
    }, record);
    await app.close(); ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    await page.getByRole('button', { name: labels['gui:load'], exact: true }).click();
    await page.locator(`[role=option][data-id="${record.id}"]`).click();
    await page.locator('[data-action=LoadGame]').click();
    await page.waitForFunction(({ tick, movie }) => window.__ra2debug.game?.currentTick === tick
        && window.__ra2debug.gameScreen?.menu?.getCurrentScreen()
        && document.querySelector(`[data-campaign-media=${movie.id}] video`)?.currentTime >= movie.time - .15,
    { tick: checkpoint.tick, movie }, { timeout: 180000 });
    assert.deepEqual(await worldState(page), before);
    assert.equal(await page.locator('[data-campaign-media=s12_f00e]').count(), 0);
    await closeCampaignMenuPaused(page);
    await page.waitForFunction(movie => document.querySelector(`[data-campaign-media=${movie.id}] video`)?.currentTime > movie.time + .4, movie);
    report.resumed = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, manager = d.gameScreen.gameTurnMgr;
        const before = { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot() };
        for (let i = 0; i < 100; i++) manager.doGameTurn(performance.now());
        return { before, after: { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot() },
            media: g.campaign.captureMedia().movies, worldInputEnabled: d.gameScreen.playerUi.worldInteraction.isEnabled() };
    });
    assert.deepEqual(report.resumed.before, report.resumed.after); assert.equal(report.resumed.worldInputEnabled, false);
    await page.screenshot({ path: path.join(out, 'native-original-restored-fullscreen.png') });
    await page.evaluate(id => {
        const manager = window.__ra2debug.gameScreen.gameTurnMgr;
        manager.setPaused(true);
        try { document.querySelector(`[data-campaign-media=${id}] button`).click(); }
        finally { manager.setCampaignPaused(true); manager.setPaused(false); }
    }, movie.id);
    await new OrdinaryCampaignCommands(page, { commands: [] }).step(goal.tick - checkpoint.tick, { defend: false, repair: false });
    const state = await worldState(page); assert.equal(state.tick, goal.tick); assert.equal(state.hash, goal.hash);
    assert.equal(await page.evaluate(() => window.__ra2debug.game.campaign.result), 'victory');
    report.checkpoint = { tick: checkpoint.tick, hash: before.hash, movie, checksum: checkpoint.checksum,
        exactWorldRngMissionTeamsQueuesAndCallbacks: true };
    report.result = { tick: state.tick, hash: state.hash, result: 'victory' };
    await page.evaluate(() => { const manager = window.__ra2debug.gameScreen.gameTurnMgr;
        manager.setCampaignPaused(false); manager.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=victory][data-score-phase=complete]', { timeout: 120000 });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_FULLSCREEN_CHECKPOINT_FULL_RESTART_SKIP_AND_SOURCE_VICTORY';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
