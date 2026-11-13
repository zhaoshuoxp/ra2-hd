import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, openMissionSelection, stepWorld, waitWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const mediaOnly = process.argv.includes('--media-only');
const report = { status: 'RUNNING', errors: [], failedResources: [], starts: [], commands: [],
    scope: 'Public direct Soviet 03 selection, original default briefing and source-triggered Sofia/Yuri radar movies, ordinary production, radar recovery and native difficulty parameters. This opening check does not replace full objective/difficulty evidence.' };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function start(difficulty) {
    await page.locator('[data-campaign-mission="sov03u.map"]').click();
    await page.locator(`[data-campaign-difficulty-choice=${difficulty}]`).click();
    await page.waitForFunction(() => !!document.querySelector('[data-campaign-preview]'));
    await page.getByRole('button', { name: labels['hd:campaignstartmission'], exact: true }).click();
    await page.waitForSelector('[data-campaign-media=s03_f00e] video', { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('[data-campaign-media=s03_f00e] video')?.currentTime > 1.5);
    const brief = await page.evaluate(() => { const video = document.querySelector('[data-campaign-media=s03_f00e] video');
        return { duration: video.duration, width: video.videoWidth, height: video.videoHeight, time: video.currentTime,
            gamePresent: !!window.__ra2debug.game?.campaign,
            text: document.querySelector('[data-campaign-movie-subtitle=s03_f00e]')?.textContent }; });
    assert(brief.duration > 81 && brief.duration < 82); assert(!brief.gamePresent); assert(brief.text.trim());
    await page.screenshot({ path: path.join(out, `native-${difficulty}-default-briefing.png`) });
    await page.locator('[data-campaign-media=s03_f00e] button').click(); await waitWorld(page, 'sov03u.map');
    const parameters = await page.evaluate(() => {
        const g = window.__ra2debug.game, ini = g.rules.getIni(), difficulty = g.campaign.launch.difficulty;
        const index = { easy: 0, normal: 1, hard: 2 }[difficulty];
        const expected = (human) => {
            const section = ini.getSection(['Easy', 'Normal', 'Difficult'][human ? index : 2 - index]);
            const pairs = [['firepower', 'Firepower'], ['groundSpeed', 'Groundspeed'], ['airSpeed', 'Airspeed'], ['armor', 'Armor'],
                ['rof', 'ROF'], ['cost', 'Cost'], ['buildTime', 'BuildTime'], ['repairDelay', 'RepairDelay'], ['buildDelay', 'BuildDelay']];
            const defaults = { firepower: 1, groundSpeed: 1, airSpeed: 1, armor: 1, rof: 1, cost: 1, buildTime: 1,
                repairDelay: .02, buildDelay: .03 };
            return { ...Object.fromEntries(pairs.map(([key, tag]) => [key, section.getNumber(tag, defaults[key])])),
                teamDelay: ini.getSection('General').getNumberArray('TeamDelays')[2 - index] };
        };
        return { launch: g.campaign.launch, tick: g.currentTick, commands: g.campaign.journal.commands.length,
            human: g.localPlayer.handicap, expectedHuman: expected(true), expectedAi: expected(false),
            ai: [...g.campaign.houses].filter(([name]) => name.startsWith('BadGuy1')).map(([name, owner]) => [name, owner.handicap]),
            mapLightning: ['LightningStormDuration', 'LightningDamage', 'LightningHitDelay', 'LightningScatterDelay'].map(key => [key, ini.getSection('General').getString(key)]) };
    });
    assert.equal(parameters.launch.difficulty, difficulty); assert.equal(parameters.commands, 0); assert(!parameters.launch.diagnostic);
    assert.deepEqual(parameters.human, parameters.expectedHuman);
    for (const [, handicap] of parameters.ai) assert.deepEqual(handicap, parameters.expectedAi);
    report.starts.push({ difficulty, brief, parameters }); await save();
}
async function build(name) {
    await page.evaluate(name => { const d = window.__ra2debug, g = d.game, rule = g.rules.getBuilding(name);
        if (!g.localPlayer.production.isAvailableForProduction(rule)) throw Error('Source production unavailable: ' + name);
        d.actionsApi.queueForProduction(g.localPlayer.production.getQueueForObject(rule).type, 2, name, 1); }, name);
    report.commands.push({ command: 'produce', name });
    for (let i = 0; i < 60; i++) {
        await stepWorld(page, 90);
        const tile = await page.evaluate(name => {
            const d = window.__ra2debug, g = d.game, rule = g.rules.getBuilding(name), queue = g.localPlayer.production.getQueueForObject(rule);
            if (queue.status !== 3 || queue.getFirst()?.rules !== rule) return;
            const yard = [...g.localPlayer.buildings].find(unit => unit.rules.constructionYard), worker = g.getConstructionWorker(g.localPlayer);
            for (let radius = 2; radius < 18; radius++) for (let y = yard.tile.ry - radius; y <= yard.tile.ry + radius; y++) {
                for (let x = yard.tile.rx - radius; x <= yard.tile.rx + radius; x++) {
                    const tile = g.map.tiles.getByMapCoords(x, y);
                    if (tile && worker.canPlaceAt(name, tile, { normalizedTile: true })) { d.actionsApi.placeBuilding(name, x, y); return [x, y]; }
                }
            }
            throw Error('No legal ordinary building placement');
        }, name);
        if (tile) { report.commands.push({ command: 'place', name, tile }); await stepWorld(page, 120); return; }
    }
    throw Error('Ordinary production stalled: ' + name);
}
async function abortToSelection() {
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
    await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
    await page.waitForSelector('[data-campaign-missions][data-campaign-ready=true]');
    assert.equal(await page.locator('[data-campaign-media]').count(), 0);
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 2 }));
    await openMissionSelection(page, labels); await start('normal');
    await page.waitForFunction(() => window.__ra2debug.music?.getPlaybackState()?.sound === 'InDeep'
        && window.__ra2debug.music.getPlaybackState().playing);
    report.musicBefore = await page.evaluate(() => window.__ra2debug.music.getPlaybackState());
    assert(report.musicBefore.gain > 0);
    await stepWorld(page, 45);
    await page.waitForSelector('[data-sidebar-radar] [data-campaign-media=s03_p01e] video');
    await page.waitForFunction(() => document.querySelector('[data-campaign-media=s03_p01e] video')?.currentTime > 1);
    const before = await page.evaluate(() => window.__ra2debug.game.currentTick); await stepWorld(page, 30);
    report.sofia = await page.evaluate(() => {
        const d = window.__ra2debug, video = document.querySelector('[data-campaign-media=s03_p01e] video');
        const v = video.getBoundingClientRect(), radar = video.closest('[data-sidebar-radar]').getBoundingClientRect();
        return { tick: d.game.currentTick, movie: video.parentElement.dataset.campaignMedia, sourceIndex: 79,
            videoSize: [video.videoWidth, video.videoHeight], bounds: { x: v.x, y: v.y, width: v.width, height: v.height },
            radar: { x: radar.x, y: radar.y, width: radar.width, height: radar.height },
            text: document.querySelector('[data-campaign-movie-subtitle=s03_p01e]')?.textContent,
            music: d.music.getPlaybackState(), voiceVolume: video.volume };
    });
    assert.equal(report.sofia.tick, before + 30); assert(report.sofia.bounds.width <= report.sofia.radar.width + 1);
    assert.equal(report.sofia.music.sound, 'InDeep'); assert(report.sofia.music.playing && report.sofia.voiceVolume > 0);
    assert(Math.abs(report.sofia.music.gain - report.musicBefore.gain * .3) < .00001);
    await page.screenshot({ path: path.join(out, 'native-source-sofia-radar-simulation-continues.png') });
    await page.evaluate(() => { const d = window.__ra2debug, mcv = d.game.localPlayer.getOwnedObjects().find(unit => unit.name === 'SMCV');
        d.actionsApi.orderUnits([mcv.id], 9, mcv.id); });
    await stepWorld(page, 150); await build('NAREFN'); await build('NAHAND');
    await page.evaluate(() => { const d = window.__ra2debug, rule = d.game.rules.getObject('E2', 3);
        d.actionsApi.queueForProduction(d.game.localPlayer.production.getQueueForObject(rule).type, 3, 'E2', 12); });
    report.commands.push({ command: 'produce', name: 'E2', count: 12 });
    await build('NAWEAP');
    // The original branch waits eight simulation seconds after activation.
    for (let i = 0; i < 8 && !await page.evaluate(() => window.__ra2debug.game.campaign.trace.some(action => action.key === '09A2B03C')); i++) {
        await stepWorld(page, 30);
    }
    await page.waitForSelector('[data-sidebar-radar] [data-campaign-media=s01_p01e] video', { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('[data-campaign-media=s01_p01e] video')?.currentTime > 1.5);
    report.yuri = await page.evaluate(() => { const d = window.__ra2debug, video = document.querySelector('[data-campaign-media=s01_p01e] video');
        return { tick: d.game.currentTick, time: video.currentTime, duration: video.duration,
            text: document.querySelector('[data-campaign-movie-subtitle=s01_p01e]')?.textContent,
            sourceMovieAction: d.game.campaign.trace.filter(action => action.key === '09A2B03C'),
            completed: d.gameScreen.campaignMediaPlayer.snapshot(), music: d.music.getPlaybackState(), voiceVolume: video.volume }; });
    assert(report.yuri.sourceMovieAction.length); assert(report.yuri.text.trim());
    assert(report.yuri.music.playing && report.yuri.voiceVolume > 0);
    assert(Math.abs(report.yuri.music.gain - report.musicBefore.gain * .3) < .00001);
    await page.screenshot({ path: path.join(out, 'native-source-yuri-after-war-factory.png') });
    await page.locator('[data-campaign-media=s01_p01e] button').click();
    await page.waitForFunction(() => !document.querySelector('[data-sidebar-radar] [data-campaign-media]'));
    report.radarRestored = await page.locator('[data-sidebar-radar]').isVisible(); assert(report.radarRestored);
    report.speechAfterMovies = await page.evaluate(() => window.__ra2debug.gameScreen.campaignSpeech.snapshot());
    await page.waitForFunction(gain => Math.abs(window.__ra2debug.music.getPlaybackState().gain - gain) < .00001,
        report.musicBefore.gain, { timeout: 60000 });
    report.musicAfter = await page.evaluate(() => window.__ra2debug.music.getPlaybackState());
    assert(report.musicAfter.playing && report.musicAfter.time > report.musicBefore.time);
    assert(Math.abs(report.musicAfter.gain - report.musicBefore.gain) < .00001);
    await page.screenshot({ path: path.join(out, 'native-radar-restored-after-source-movies.png') });
    await abortToSelection();
    if (!mediaOnly) { await start('easy'); await abortToSelection(); await start('hard'); await abortToSelection(); }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = mediaOnly ? 'PASS_NATIVE_SOURCE_BRIEF_RADAR_MOVIES_MUSIC_DUCKING_AND_RECOVERY'
        : 'PASS_NATIVE_DIRECT_SELECTION_SOURCE_BRIEF_RADAR_MOVIES_AND_ALL_DIFFICULTY_PARAMETERS';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
