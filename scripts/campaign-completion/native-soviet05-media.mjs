import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';
import { replaySourcePrefix, continueRecordedSource } from './replay-source.mjs';

const out = path.resolve(process.argv[2]), directory = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const source = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(directory, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [],
    scope: 'Original Soviet 05 briefing is an explicitly labeled standalone compatibility scene until public promotion. The real source tower instruction must then play from original action 100/index 92, reached by normal recorded movement in a fresh source world. No trigger is manufactured, no source changes. Opening/Crazy Ivan movies have separate fresh-source control/restart evidence.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 0 }));
    await page.evaluate(async () => {
        const screen = window.__ra2debug.mainMenuController.screens.get(22), controller = screen.rootController, go = controller.goToScreen;
        controller.goToScreen = () => {};
        try { await screen.launchPrepared('sov05u.map'); } finally { controller.goToScreen = go; }
        window.__briefingCompatibility = screen.preview('s05_f00e');
    });
    await page.waitForSelector('[data-campaign-media=s05_f00e] video');
    await page.waitForFunction(() => document.querySelector('[data-campaign-media=s05_f00e] video')?.currentTime > 1.8
        && document.querySelector('[data-campaign-movie-subtitle=s05_f00e]')?.textContent.trim());
    report.brief = await page.evaluate(() => { const video = document.querySelector('[data-campaign-media=s05_f00e] video');
        return { time: video.currentTime, duration: video.duration, size: [video.videoWidth, video.videoHeight],
            text: document.querySelector('[data-campaign-movie-subtitle=s05_f00e]').textContent,
            gameAbsent: !window.__ra2debug.game?.campaign, musicStopped: !window.__ra2debug.music.getPlaybackState().playing };
    });
    assert(report.brief.duration > 55 && report.brief.duration < 57 && report.brief.text.trim());
    assert(report.brief.gameAbsent && report.brief.musicStopped);
    await page.screenshot({ path: path.join(out, 'standalone-original-soviet05-briefing-compatibility.png') });
    await page.locator('[data-campaign-media=s05_f00e] button').click(); await page.evaluate(() => window.__briefingCompatibility);
    report.replay = await replaySourcePrefix(page, source, 'ordinary-passive-corrected-route-38-55');
    const opening = page.locator('[data-campaign-media=s05_p01e] button');
    if (await opening.count()) await opening.click();
    report.approach = await continueRecordedSource(page, source, 'original-neutral-city-tower-defense-cleared');
    await page.waitForSelector('[data-sidebar-radar] [data-campaign-media=s05_p02e] video', { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('[data-campaign-media=s05_p02e] video')?.currentTime > .3
        && document.querySelector('[data-campaign-movie-subtitle=s05_p02e]')?.textContent.trim());
    const start = await page.evaluate(() => window.__ra2debug.game.currentTick);
    await new OrdinaryCampaignCommands(page, report).step(30, { defend: false });
    report.towerMovie = await page.evaluate(() => { const d = window.__ra2debug, video = document.querySelector('[data-campaign-media=s05_p02e] video');
        const bounds = video.getBoundingClientRect(), radar = video.closest('[data-sidebar-radar]').getBoundingClientRect();
        return { time: video.currentTime, duration: video.duration, size: [video.videoWidth, video.videoHeight],
            bounds: { width: bounds.width, height: bounds.height }, radar: { width: radar.width, height: radar.height },
            text: document.querySelector('[data-campaign-movie-subtitle=s05_p02e]').textContent,
            tick: d.game.currentTick, music: d.music.getPlaybackState(), volume: video.volume,
            sourceActions: d.game.campaign.trace.filter(action => action.key === '0B009B0C'), inputLocked: d.game.campaign.inputLocked };
    });
    const movie = report.towerMovie;
    assert.equal(movie.tick, start + 30); assert(movie.text.trim() && movie.volume > 0 && movie.music.playing);
    assert.equal(movie.music.sound, 'Motorize'); assert(movie.music.gain > 0 && movie.music.gain < .15);
    assert(movie.sourceActions.some(action => action.opcode === 100)); assert(!movie.inputLocked);
    assert(movie.bounds.width <= movie.radar.width + 1); assert.deepEqual(movie.size, [140, 110]);
    await page.screenshot({ path: path.join(out, 'native-original-soviet05-tower-radar-instruction.png') });
    await page.waitForFunction(() => !document.querySelector('[data-campaign-media=s05_p02e]'), undefined, { timeout: 15000 });
    report.after = await page.evaluate(() => ({ outcomes: window.__ra2debug.game.campaign.movieOutcomes,
        radarVisible: !!document.querySelector('[data-sidebar-radar]'), music: window.__ra2debug.music.getPlaybackState() }));
    assert(report.after.outcomes.some(outcome => outcome.id === 's05_p02e' && outcome.outcome === 'ended'));
    assert(report.after.radarVisible);
    await page.evaluate(() => { const d = window.__ra2debug;
        d.worldInteraction.minimapHandler.panToTile(d.game.world.getAllObjects().find(unit => unit.name === 'CAPARS01').tile); });
    await page.screenshot({ path: path.join(out, 'native-original-density-tower-before-handoff.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET05_BRIEF_COMPATIBILITY_AND_ACTUAL_TOWER_RADAR_MOVIE';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
