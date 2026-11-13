import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, pauseWorld, worldState } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]), fixture = JSON.parse(await fs.readFile(path.resolve(process.argv[3])));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'Load a real Soviet 03 defense checkpoint, select Burn through the normal music playlist API, use named Save/Load UI and a complete application restart, then verify the selected music/time and exact world/RNG/mission state. Music control does not alter source simulation.' };
let app, page, labels;
async function click(action, fallback) {
    const button = page.locator(`[data-action=${action}]`);
    if (await button.count()) await button.click(); else await page.getByRole('button', { name: labels[fallback], exact: true }).click();
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    await page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(checkpoint, 'sov03u.map'), fixture);
    await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
        && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), fixture.tick, { timeout: 180000 });
    await pauseWorld(page);
    await page.evaluate(async () => { const music = window.__ra2debug.music;
        await music.selectPlaylistItem(music.getPlaylist().find(spec => spec.sound === 'Burn')); });
    await page.waitForFunction(() => { const music = window.__ra2debug.music.getPlaybackState();
        return music?.sound === 'Burn' && music.playing && music.time > 3; });
    await page.getByRole('button', { name: labels['gui:save'], exact: true }).click();
    await page.waitForSelector('[data-save-scope=campaign][data-mode=save]');
    await page.locator('.save-native-name').fill('Original Soviet 03 music restoration');
    await click('SaveGame', 'gui:save'); await page.locator('[data-action=AcknowledgeSave]').waitFor(); await click('AcknowledgeSave');
    const record = await page.evaluate(async () => {
        const db = await new Promise(resolve => { const request = indexedDB.open('ra2-hd-campaign-library', 1); request.onsuccess = () => resolve(request.result); });
        try { return await new Promise(resolve => { const request = db.transaction('saves').objectStore('saves').getAll(); request.onsuccess = () => resolve(request.result[0]); }); }
        finally { db.close(); }
    });
    report.saved = { tick: record.tick, presentation: record.checkpoint.presentation, checksum: record.checkpoint.checksum };
    assert.equal(report.saved.presentation.music.sound, 'Burn'); assert(report.saved.presentation.music.time > 3);
    const expected = await worldState(page);
    await fs.writeFile(path.join(out, 'music-checkpoint.json'), JSON.stringify(record.checkpoint));
    await app.close(); app = undefined;
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    await page.getByRole('button', { name: labels['gui:load'], exact: true }).click();
    await page.locator(`[role=option][data-id="${record.id}"]`).click(); await click('LoadGame', 'gui:load');
    await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
        && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), record.tick, { timeout: 180000 });
    await pauseWorld(page); assert.deepEqual(await worldState(page), expected);
    await page.waitForFunction(time => { const state = window.__ra2debug.music.getPlaybackState();
        return state?.sound === 'Burn' && state.playing && state.time >= time - .1; }, report.saved.presentation.music.time);
    report.restored = await page.evaluate(() => ({ music: window.__ra2debug.music.getPlaybackState(),
        tick: window.__ra2debug.game.currentTick, failure: window.__ra2debug.game.campaign.failure,
        preMissionMovieAbsent: !document.querySelector('[data-campaign-media=s03_f00e]') }));
    const offset = report.restored.music.time - report.saved.presentation.music.time;
    assert(offset >= -.1 && offset < 2.5, `Music restore offset: ${offset}`);
    assert(!report.restored.failure && report.restored.preMissionMovieAbsent);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_NAMED_SAVE_RESTART_EXACT_WORLD_AND_SELECTED_MUSIC_POSITION';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
