import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';
import { waitWorld } from '../m3-2/native-session.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov06lmd.map');
let failure;
try {
    let state = await pilot.open();
    await pilot.page.evaluate(() => {
        const d = window.__ra2debug;
        window.__endingSpeech = d.gameScreen.campaignSpeech;
        window.__endingSpeechStart = window.__endingSpeech.outcomes.length;
    });
    pilot.report.beforeEnding = await pilot.page.evaluate(() => ({
        pending: window.__endingSpeech.snapshot(), tick: window.__ra2debug.game.currentTick }));
    for (let i = 0; i < 200 && state.result !== 'victory'; i++) {
        await pilot.commands.step(30, { defend: false, repair: false });
        state = await pilot.observe('original-lunar-ending-' + i);
    }
    assert.equal(state.result, 'victory');
    await pilot.page.evaluate(() => {
        const d = window.__ra2debug, m = d.gameScreen.gameTurnMgr;
        m.setPaused(false); m.setCampaignPaused(false); m.doGameTurn(performance.now());
    });
    pilot.report.ending = [];
    for (let i = 0; i < 900; i++) {
        const sample = await pilot.page.evaluate(() => {
            const d = window.__ra2debug, speech = window.__endingSpeech;
            return { wall: performance.now(), tick: d.game?.currentTick, hash: d.game?.getHash(),
                pending: speech.snapshot(), outcomes: speech.outcomes.slice(window.__endingSpeechStart),
                visibleText: document.body.innerText.slice(-1500),
                media: [...document.querySelectorAll('[data-campaign-media] video')].map(v => ({
                    id: v.closest('[data-campaign-media]').dataset.campaignMedia, time: v.currentTime, duration: v.duration,
                    ended: v.ended, rate: v.playbackRate })),
                result: document.querySelector('[data-campaign-result]')?.getAttribute('data-campaign-result'),
                phase: document.querySelector('[data-campaign-result]')?.getAttribute('data-score-phase') };
        });
        pilot.report.ending.push(sample);
        if ([1, 10, 25].includes(i)) await pilot.page.screenshot({ path: path.join(pilot.out, `native-ending-${i}.png`) });
        if (sample.phase === 'complete') break;
        await pilot.page.waitForTimeout(500);
        if (i % 10 === 0) await fs.writeFile(path.join(pilot.out, 'ending-progress.json'), JSON.stringify(pilot.report, null, 2) + '\n');
    }
    const last = pilot.report.ending.at(-1);
    assert.equal(last.result, 'victory'); assert.equal(last.phase, 'complete');
    assert(last.outcomes.length > 0 && last.outcomes.every(v => v.reason === 'ended'));
    assert(pilot.report.ending.some(s => s.pending.some(p => p.mission)), 'Observe actual source ending narration');
    const world = pilot.report.ending.filter(s => s.tick !== undefined && !s.result);
    assert(world.length > 1 && world.every(s => s.tick === world[0].tick && s.hash === world[0].hash));
    await pilot.page.screenshot({ path: path.join(pilot.out, 'native-ending-complete-score.png') });
    if (process.argv.includes('--public-next')) {
        const oldId = await pilot.page.evaluate(() => window.__ra2debug.game?.id);
        await pilot.page.evaluate(() => {
            window.__transitionFrames = [];
            const sample = () => {
                const section = document.querySelector('[data-campaign-starting]');
                if (section) window.__transitionFrames.push({ time: performance.now(),
                    text: section.textContent, background: getComputedStyle(section).backgroundColor,
                    ariaLabel: section.getAttribute('aria-label') });
                window.__transitionRaf = requestAnimationFrame(sample);
            };
            window.__transitionRaf = requestAnimationFrame(sample);
        });
        await pilot.page.getByRole('button', { name: pilot.session.labels['hd:campaigncontinuemission'], exact: true }).click();
        await pilot.page.waitForFunction(() => [...document.querySelectorAll('[data-campaign-media] video')]
            .some(video => video.currentTime > .5), undefined, { timeout: 90000 });
        pilot.report.nextTransition = await pilot.page.evaluate(() => {
            cancelAnimationFrame(window.__transitionRaf);
            const movie = document.querySelector('[data-campaign-media]');
            return { frames: window.__transitionFrames, movie: movie.dataset.campaignMedia,
                time: movie.querySelector('video').currentTime };
        });
        assert(pilot.report.nextTransition.frames.length, 'Observe actual painted transition frames');
        assert(pilot.report.nextTransition.frames.every(frame => frame.text === ''
            && frame.background === 'rgb(0, 0, 0)'), 'No visible starting text may flash before the movie');
        await pilot.page.screenshot({ path: path.join(pilot.out, 'native-public-next-movie.png') });
        await pilot.page.locator('[data-campaign-media] button').click();
        await waitWorld(pilot.page, 'sov07tmd.map', oldId);
        pilot.report.publicNextWorld = await pilot.page.evaluate(() => ({
            id: window.__ra2debug.game.id, tick: window.__ra2debug.game.currentTick,
            launch: window.__ra2debug.game.campaign.launch }));
        assert.equal(pilot.report.publicNextWorld.launch.semanticsVersion, 48);
        assert.equal(pilot.report.publicNextWorld.launch.difficulty, pilot.report.launch.difficulty);
        await pilot.page.screenshot({ path: path.join(pilot.out, 'native-public-next-fresh-world.png') });
        pilot.commands = undefined;
    }
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET06_ENDING_NARRATION_DRAINS_NATURALLY_BEFORE_SCORE_WITH_FROZEN_SIMULATION';
} catch (error) { failure = error; }
await pilot.finish(failure);
