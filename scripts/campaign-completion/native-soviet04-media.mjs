import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [],
    scope: 'Prepared original briefing playback is an explicit standalone compatibility scene while Soviet 04 is publicly unavailable. The two radar movies must then fire from actual unmodified source triggers in a fresh original mission through ordinary construction and the real Allied landing. No map event is manufactured. Full public lifecycle promotion is separate.' };
let app, page, labels;
async function movie(id, sourceIndex, sourceTrigger, naturalEnd) {
    await page.waitForSelector(`[data-sidebar-radar] [data-campaign-media=${id}] video`, { timeout: 30000 });
    await page.waitForFunction(id => document.querySelector(`[data-campaign-media=${id}] video`)?.currentTime > 1.8
        && document.querySelector(`[data-campaign-movie-subtitle=${id}]`)?.textContent.trim(), id);
    const start = await page.evaluate(() => window.__ra2debug.game.currentTick);
    await commands.step(30);
    const state = await page.evaluate(({ id, sourceTrigger }) => {
        const d = window.__ra2debug, video = document.querySelector(`[data-campaign-media=${id}] video`), bounds = video.getBoundingClientRect();
        const radar = video.closest('[data-sidebar-radar]').getBoundingClientRect();
        return { time: video.currentTime, duration: video.duration, size: [video.videoWidth, video.videoHeight],
            bounds: { width: bounds.width, height: bounds.height }, radar: { width: radar.width, height: radar.height },
            text: document.querySelector(`[data-campaign-movie-subtitle=${id}]`).textContent,
            tick: d.game.currentTick, music: d.music.getPlaybackState(), volume: video.volume,
            sourceActions: d.game.campaign.trace.filter(action => action.key === sourceTrigger),
            inputLocked: d.game.campaign.inputLocked };
    }, { id, sourceTrigger });
    assert.equal(state.tick, start + 30); assert(state.text.trim() && state.volume > 0 && state.music.playing);
    assert.equal(state.music.sound, 'Burn'); assert(state.music.gain > 0 && state.music.gain < .15);
    assert(state.sourceActions.some(action => action.opcode === 100)); assert(!state.inputLocked);
    assert(state.bounds.width <= state.radar.width + 1); assert.deepEqual(state.size, [140, 110]);
    await page.screenshot({ path: path.join(out, `native-source-${id}-radar.png`) });
    if (!naturalEnd) await page.locator(`[data-campaign-media=${id}] button`).click();
    await page.waitForFunction(id => !document.querySelector(`[data-campaign-media=${id}]`), id, { timeout: 30000 });
    const outcomes = await page.evaluate(() => window.__ra2debug.game.campaign.movieOutcomes);
    assert(outcomes.some(outcome => outcome.id === id && outcome.outcome === (naturalEnd ? 'ended' : 'skipped')));
    return { id, sourceIndex, sourceTrigger, naturalEnd, radarRestored: await page.locator('[data-sidebar-radar]').isVisible(), ...state };
}
let commands;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 2 }));
    await page.evaluate(async () => {
        const screen = window.__ra2debug.mainMenuController.screens.get(22), controller = screen.rootController, go = controller.goToScreen;
        controller.goToScreen = () => {};
        try { await screen.launchPrepared('sov04s.map'); } finally { controller.goToScreen = go; }
        window.__briefingCompatibility = screen.preview('s04_f00e');
    });
    await page.waitForSelector('[data-campaign-media=s04_f00e] video');
    await page.waitForFunction(() => document.querySelector('[data-campaign-media=s04_f00e] video')?.currentTime > 1.8
        && document.querySelector('[data-campaign-movie-subtitle=s04_f00e]')?.textContent.trim());
    report.brief = await page.evaluate(() => { const video = document.querySelector('[data-campaign-media=s04_f00e] video');
        return { time: video.currentTime, duration: video.duration, size: [video.videoWidth, video.videoHeight],
            text: document.querySelector('[data-campaign-movie-subtitle=s04_f00e]').textContent,
            gameAbsent: !window.__ra2debug.game?.campaign, musicStopped: !window.__ra2debug.music.getPlaybackState().playing }; });
    assert(report.brief.duration > 93 && report.brief.duration < 95 && report.brief.text.trim());
    assert(report.brief.gameAbsent && report.brief.musicStopped);
    await page.screenshot({ path: path.join(out, 'standalone-original-briefing-compatibility.png') });
    await page.locator('[data-campaign-media=s04_f00e] button').click();
    await page.evaluate(() => window.__briefingCompatibility);
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov04s.map'));
    await waitWorld(page, 'sov04s.map'); commands = new OrdinaryCampaignCommands(page, report);
    await commands.order(['SMCV'], 9); await commands.step(150);
    await commands.build('NAREFN'); await commands.build('NAHAND'); await commands.queue('E2', 10);
    await commands.build('NAFLAK'); await commands.build('NAFLAK'); await commands.build('NAPOWR');
    await commands.build('NAWEAP');
    report.sofia = await movie('s04_p02e', 101, '09EB22AC', true);
    await commands.queue('HTK', 4); await commands.queue('HTNK', 6); await commands.queue('SUB', 4);
    await commands.build('NAREFN'); await commands.build('NAPOWR'); await commands.build('NAFLAK');
    for (let i = 0; i < 180 && !await page.evaluate(() => window.__ra2debug.game.campaign.trace.some(action => action.key === '09E1086C')); i++) {
        await commands.step(90);
    }
    report.korean = await movie('s04_p01e', 90, '09E1086C', false);
    report.after = await commands.inspect('actual-source-media-complete');
    assert(!report.after.failure && report.sofia.radarRestored && report.korean.radarRestored);
    await page.screenshot({ path: path.join(out, 'native-radar-after-original-communications.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET04_BRIEF_COMPATIBILITY_AND_SOURCE_RADAR_MOVIES';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
