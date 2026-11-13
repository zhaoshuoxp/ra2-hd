import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, openMissionSelection, pauseWorld, root, stepWorld, waitWorld, worldState } from './native-session.mjs';

const out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', scope: 'Actual mission selection, original pre-mission playback and shared lifecycle. Specialized media exercises are explicitly separate from original mission triggers.',
    cases: [], screenshots: [], errors: [], failedResources: [] };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save(); }
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 4 }));
    await openMissionSelection(page, labels);
    await page.locator('[data-campaign-mission="sov02t.map"]').click();
    const start = page.getByRole('button', { name: labels['hd:campaignstartmission'], exact: true });
    await start.waitFor(); await page.waitForFunction(() => !!document.querySelector('[data-campaign-preview]'));
    assert.equal(await page.locator('[data-campaign-mission][data-playable=true]').count(), 5);
    await page.locator('[data-campaign-mission="sov06t.map"]').click();
    await page.waitForTimeout(300); assert(await start.isDisabled()); await shot('01-unavailable-next-mission');
    await page.locator('[data-campaign-mission="sov02t.map"]').click();
    await page.locator('[data-campaign-difficulty-choice=hard]').click();
    await page.waitForFunction(() => !!document.querySelector('[data-campaign-preview]'));
    await shot('02-direct-second-mission-hard'); await start.click();
    await page.waitForSelector('[data-campaign-media=s02_f00e] video', { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('[data-campaign-media] video')?.currentTime > 1);
    report.brief = await page.evaluate(() => { const v = document.querySelector('[data-campaign-media] video');
        return { id: v.parentElement.dataset.campaignMedia, duration: v.duration, width: v.videoWidth, height: v.videoHeight,
            gamePresent: !!window.__ra2debug.game?.campaign, volume: v.volume, time: v.currentTime }; });
    assert(!report.brief.gamePresent); assert(report.brief.duration > 59); await shot('03-original-second-mission-brief');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-campaign-loading-source="ls800s02.shp"]', { timeout: 45000 });
    await shot('04-second-mission-hd-loading');
    await waitWorld(page, 'sov02t.map');
    const fresh = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { launch: g.campaign.launch, tick: g.currentTick, objects: g.world.getAllObjects().length,
            player: g.localPlayer.country.name, handicap: g.localPlayer.handicap, callbacks: g.afterTickCallbacks.length,
            journalCommands: g.campaign.journal.commands.length, movies: g.campaign.movieOutcomes }; });
    assert.equal(fresh.launch.difficulty, 'hard'); assert(!fresh.launch.diagnostic); assert.equal(fresh.journalCommands, 0);
    report.cases.push({ name: 'Direct Hard launch uses original initial state without a save', ...fresh });
    await stepWorld(page, Math.max(0, 4501 - fresh.tick));
    await page.waitForSelector('[data-sidebar-radar] [data-campaign-media=s02_p01e]', { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('[data-campaign-media=s02_p01e] video')?.currentTime > .2);
    const sampleRadar = () => page.evaluate(() => { const e = document.querySelector('[data-campaign-media]'), v = e?.querySelector('video'), host = document.querySelector('[data-sidebar-radar]');
        return { tick: window.__ra2debug.game.currentTick, host: host.getBoundingClientRect().toJSON(), rect: e?.getBoundingClientRect().toJSON(),
            visible: e && getComputedStyle(e).visibility, fit: v && getComputedStyle(v).objectFit, time: v?.currentTime, volume: v?.volume,
            video: v && [v.videoWidth, v.videoHeight], paused: v?.paused, outcomes: window.__ra2debug.game.campaign.movieOutcomes }; });
    const radar = await sampleRadar(); assert.equal(radar.visible, 'visible'); assert.equal(radar.fit, 'contain');
    assert(radar.rect.left > radar.host.left && radar.rect.right < radar.host.right); await shot('05-original-trigger-radar-transmission');
    const beforeTicks = radar.tick; await stepWorld(page, 45); assert.equal((await sampleRadar()).tick, beforeTicks + 45);
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.waitForTimeout(100); const paused = await sampleRadar(); assert(paused.paused);
    await page.waitForTimeout(350); assert.equal((await sampleRadar()).time, paused.time);
    const win = await app.browserWindow(page);
    await win.evaluate(w => w.setSize(1440, 900)); await page.waitForTimeout(200);
    const resized = await sampleRadar(); assert(resized.rect.right <= resized.host.right + 1);
    await win.evaluate(w => w.setFullScreen(true)); await page.waitForTimeout(350);
    const full = await sampleRadar(); assert(full.rect.right <= full.host.right + 1); await shot('06-radar-transmission-fullscreen');
    await win.evaluate(w => w.setFullScreen(false)); await page.waitForTimeout(350);
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.close()); await pauseWorld(page);
    await page.locator('[data-campaign-media=s02_p01e] button').click();
    await page.waitForSelector('[data-campaign-media]', { state: 'detached' });
    report.cases.push({ name: 'Original action 100 plays in the scaled radar while simulation continues; menu pauses it; skip restores radar', radar, resized, full });
    const originalState = await worldState(page);
    report.specialized = await page.evaluate(async () => {
        const d = window.__ra2debug, s = d.gameScreen, p = s.campaignMediaPlayer, a = s.campaignMovieAssets, strings = s.strings;
        const first = a.trigger(77, p, strings), duplicate = a.trigger(77, p, strings), second = a.trigger(78, p, strings);
        window.__mediaExercise = Promise.all([first, duplicate, second]);
        return { duplicateSharesPromise: first === duplicate, pending: p.pending, before: d.game.currentTick };
    });
    assert(report.specialized.duplicateSharesPromise); assert.deepEqual(report.specialized.pending, ['s02_p02e', 's02_p03e']);
    const volumes = await page.evaluate(() => { const mixer = window.__ra2debug.gameScreen.mixer;
        const before = { master: mixer.getVolume(0), voice: mixer.getVolume(4), muted: mixer.isMuted(4), music: mixer.getVolume(5) };
        mixer.setVolume(0, .5); mixer.setVolume(4, .25); return before; });
    await page.waitForFunction(() => Math.abs(document.querySelector('[data-campaign-media] video').volume - .125) < .001);
    await page.evaluate(() => window.__ra2debug.gameScreen.mixer.setMuted(4, true));
    await page.waitForFunction(() => document.querySelector('[data-campaign-media] video').volume === 0);
    report.specialized.volume = { masterTimesVoice: .125, mute: 0, musicPreferenceUnchanged: await page.evaluate(() => window.__ra2debug.gameScreen.mixer.getVolume(5)) === volumes.music };
    await page.evaluate(volumes => { const mixer = window.__ra2debug.gameScreen.mixer;
        mixer.setVolume(0, volumes.master); mixer.setVolume(4, volumes.voice); mixer.setMuted(4, volumes.muted); }, volumes);
    await page.locator('[data-campaign-media=s02_p02e] button').click();
    await page.waitForSelector('[data-campaign-media=s02_p03e]');
    await page.evaluate(() => window.__ra2debug.gameScreen.campaignMediaPlayer.cancel());
    report.specialized.outcomes = await page.evaluate(() => window.__mediaExercise);
    assert.deepEqual(report.specialized.outcomes, ['skipped', 'skipped', 'cancelled']);
    assert.deepEqual(await worldState(page), originalState);
    report.specialized.scope = 'Presentation-only queue, repeated-request and cancellation fixture; no source trigger is manufactured.';
    await shot('07-radar-restored');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_DIRECT_SELECTION_BRIEF_LOADING_AND_RADAR_MEDIA';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await shot('failure').catch(() => {}); }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, error: report.error }));
