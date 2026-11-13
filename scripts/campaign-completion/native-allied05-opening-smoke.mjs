import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';

const out = path.resolve(process.argv[2]);
const density = Number(process.argv.find(value => value.startsWith('--density='))?.slice(10) ?? 0);
assert([0, 2, 4].includes(density));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], samples: [], commands: [],
    requestedDensity: density,
    scope: 'Fresh original Normal All05 opening, actual source radar86 and tick-owned smoke. Genuine named Save UI/full restart and real renderer state. No injected event, altered source/rules/actors/tasks/objectives, diagnostic reveal or post-creation RNG edit. Pre-mission playback and full goal have separate evidence.' };
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('all05s.map'));
    await waitWorld(page, 'all05s.map');
    const commands = new OrdinaryCampaignCommands(page, report);
    report.samples.push(await commands.inspect('fresh-original-normal-opening'));
    for (let i = 0; i < 150; i++) {
        await commands.step(10, { defend: false, repair: false });
        if (await page.evaluate(() => window.__ra2debug.game.campaign.captureMedia().movies.some(movie => movie.id === 'a05_p03e'))) break;
    }
    await page.waitForSelector('[data-sidebar-radar] [data-campaign-media=a05_p03e] video', { timeout: 6000 });
    await page.waitForFunction(() => document.querySelector('[data-campaign-media=a05_p03e] video')?.currentTime > .3
        && document.querySelector('[data-campaign-movie-subtitle=a05_p03e]')?.textContent.trim(), undefined, { timeout: 6000 });
    const tick = await page.evaluate(() => window.__ra2debug.game.currentTick);
    await commands.step(30, { defend: false, repair: false });
    report.radar = await page.evaluate(() => {
        const d = window.__ra2debug, video = document.querySelector('[data-campaign-media=a05_p03e] video');
        const bounds = video.getBoundingClientRect(), radar = video.closest('[data-sidebar-radar]').getBoundingClientRect();
        return { tick: d.game.currentTick, time: video.currentTime, duration: video.duration,
            size: [video.videoWidth, video.videoHeight], objectFit: getComputedStyle(video).objectFit, volume: video.volume,
            bounds: [bounds.width, bounds.height], radar: [radar.width, radar.height],
            text: document.querySelector('[data-campaign-movie-subtitle=a05_p03e]')?.textContent,
            music: d.music.getPlaybackState(), inputLocked: d.game.campaign.inputLocked,
            actions: d.game.campaign.trace.filter(action => action.key === '07D4739C') };
    });
    assert.equal(report.radar.tick, tick + 30); assert.equal(report.radar.objectFit, 'contain');
    assert.deepEqual(report.radar.size, [140, 110]); assert(report.radar.volume > 0 && report.radar.text.trim());
    assert(report.radar.music.playing && report.radar.music.gain > 0 && report.radar.music.gain < .15);
    assert(report.radar.bounds[0] <= report.radar.radar[0] + 1);
    assert(report.radar.actions.some(action => action.opcode === 100));
    await page.screenshot({ path: path.join(out, 'actual-original-radar86.png') });
    await page.waitForFunction(() => !document.querySelector('[data-campaign-media=a05_p03e]'), undefined, { timeout: 15000 });
    report.afterMovie = await page.evaluate(() => ({ media: window.__ra2debug.game.campaign.captureMedia(),
        music: window.__ra2debug.music.getPlaybackState() }));
    // Original queued speech resumes after the movie and keeps music ducked
    // until the utterance ends. Observe that lifecycle before expecting recovery.
    await page.waitForFunction(() => !window.__ra2debug.game.campaign.captureMedia().speech.length
        && window.__ra2debug.music.getPlaybackState()?.gain > .15, undefined, { timeout: 45000 });
    report.recovery = await page.evaluate(() => ({ outcomes: window.__ra2debug.game.campaign.movieOutcomes,
        radarVisible: !!document.querySelector('[data-sidebar-radar]'), music: window.__ra2debug.music.getPlaybackState() }));
    assert(report.recovery.outcomes.some(movie => movie.id === 'a05_p03e' && movie.outcome === 'ended'));
    assert(report.recovery.radarVisible && report.recovery.music.gain > report.radar.music.gain);
    report.parameters = await page.evaluate(() => {
        const g = window.__ra2debug.game, c = g.campaign, units = g.localPlayer.campaignControlledPlayers
            .flatMap(owner => owner.getOwnedObjects()).filter(unit => unit.isUnit() && unit.isSpawned);
        const tanya = units.find(unit => unit.name === 'TANY');
        return { tick: g.currentTick, launch: c.launch, human: g.localPlayer.handicap, enemy: c.houses.get('RedTeam House').handicap,
            credits: g.localPlayer.credits, controlled: g.localPlayer.campaignControlledPlayers.map(owner => owner.name),
            aiTriggers: c.definition.aiTriggers.size, delays: g.rules.getIni().getSection('General').getNumberArray('TeamDelays'),
            tanya: { rank: tanya.veteranLevel, tag: tanya.tag.triggerId, idle: tanya.idleActionTrait.getCampaignIdleRequests() },
            spies: units.filter(unit => unit.name === 'SPY').map(unit => ({ id: unit.id, owner: unit.owner.name })),
            infantry: units.filter(unit => unit.name === 'E1').length, smoke: c.particles.snapshot() };
    });
    const p = report.parameters, values = handicap => [handicap.armor, handicap.rof, handicap.buildTime];
    assert.equal(p.launch.difficulty, 'normal'); assert.equal(p.credits, 10000); assert.equal(p.controlled.length, 4);
    assert.deepEqual(values(p.human), [1, 1, 1]); assert.deepEqual(values(p.enemy), [1, 1, 1]);
    assert.equal(p.enemy.teamDelay, 2500); assert.deepEqual(p.delays, [2000, 2500, 3500]); assert.equal(p.aiTriggers, 109);
    assert.deepEqual(p.tanya, { rank: 2, tag: '08836B30', idle: 1 });
    assert.equal(p.spies.length, 3); assert(p.spies.every(spy => spy.owner === 'Spies House')); assert.equal(p.infantry, 0);
    assert(p.smoke.smoke.some(system => system.particles.length > 0));
    await page.evaluate(() => {
        const d = window.__ra2debug, system = d.game.campaign.particles.smoke.find(system => system.particles.length);
        d.worldInteraction.minimapHandler.panToTile(system.tile);
    });
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report, 'Original All05 live smoke'));
    await page.waitForFunction(() => {
        const d = window.__ra2debug, expected = d.game.campaign.particles.smoke.flatMap(system => system.particles);
        const actual = d.renderableManager.getRenderableContainer().getChildren().filter(anim => anim.attachment?.frame !== undefined);
        return expected.length > 0 && actual.length === expected.length && actual.every(anim => anim.mainObj);
    }, undefined, { timeout: 30000 });
    report.renderedSmoke = await page.evaluate(() => {
        const d = window.__ra2debug, expected = d.game.campaign.particles.smoke.flatMap(system => system.particles);
        const actual = d.renderableManager.getRenderableContainer().getChildren().filter(anim => anim.attachment?.frame !== undefined);
        return expected.map(particle => {
            const anim = actual.find(anim => anim.attachment === particle.visual);
            return { expected: { position: particle.visual.position.toArray(), frame: particle.visual.frame,
                opacity: 1 - particle.visual.translucency / 100 }, actual: anim && { position: anim.getPosition().toArray(),
                frame: anim.mainObj.builder.getFrame(), opacity: anim.mainObj.builder.getVisualOpacity() } };
        });
    });
    for (const particle of report.renderedSmoke) assert.deepEqual(particle.actual, particle.expected);
    assert.equal(await page.locator('[data-campaign-media]').count(), 0);
    await page.screenshot({ path: path.join(out, 'actual-original-smoke-after-full-restart.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_NORMAL_OPENING_RADAR86_AND_NAMED_ACTIVE_SMOKE_FULL_RESTART';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
