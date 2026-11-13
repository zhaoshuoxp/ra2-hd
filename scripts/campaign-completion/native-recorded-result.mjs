import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';
import { replaySourcePrefix } from './replay-source.mjs';
import { inspectScoreLayout } from './score-layout-observer.mjs';

const out = path.resolve(process.argv[2]), sourceDirectory = path.resolve(process.argv[3]), label = process.argv[4];
await fs.mkdir(out, { recursive: false });
const source = JSON.parse(await fs.readFile(path.join(sourceDirectory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(sourceDirectory, 'applied-command-journal.json')));
source.identity.launch ??= source.identity.source; source.difficulty = source.identity.launch.difficulty;
const target = source.samples.findLast(sample => sample.label === label); assert(['victory', 'defeat'].includes(target?.result));
const winMovie = process.argv.find(value => value.startsWith('--win='))?.slice(6);
const report = { status: 'RUNNING', errors: [], failedResources: [], sourceDirectory,
    scope: 'Re-execute recorded ordinary actions from a fresh original map, verify the recorded result/world hash and source goal machine, then exercise actual result dispatch and score UI. Presentation is suppressed during prefix reconstruction only. No assigned result, altered source or hidden save initializes this world.' };
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 2 }));
    report.replay = await replaySourcePrefix(page, source, label);
    report.sourceGoal = await page.evaluate(() => {
        const g = window.__ra2debug.game, c = g.campaign;
        return { gameId: g.id, launch: c.launch, result: c.result, tick: g.currentTick, hash: g.getHash(),
            fired: [...c.machine.states].filter(([, state]) => state.fired).map(([id, state]) => [id, state.fired]), trace: c.trace.slice(-20),
            originalGoalActions: [...c.definition.triggers.values()].filter(trigger => trigger.actions.some(action => [1, 2].includes(action.opcode)))
                .map(trigger => ({ id: trigger.id, fired: c.machine.states.get(trigger.id).fired, actions: trigger.actions })) };
    });
    assert.equal(report.sourceGoal.result, target.result);
    assert(report.sourceGoal.originalGoalActions.some(trigger => trigger.fired > 0
        && trigger.actions.some(action => action.opcode === (target.result === 'victory' ? 1 : 2))));
    await page.evaluate(() => { const manager = window.__ra2debug.gameScreen.gameTurnMgr;
        manager.setPaused(false); manager.setCampaignPaused(false); manager.doGameTurn(performance.now()); });
    if (winMovie) {
        assert.equal(target.result, 'victory');
        await page.waitForSelector(`[data-campaign-media=${winMovie}] video`);
        await page.waitForFunction(movie => document.querySelector(`[data-campaign-media=${movie}] video`)?.currentTime > .7
            && document.querySelector(`[data-campaign-movie-subtitle=${movie}]`)?.textContent.trim(), winMovie);
        report.winBeforeScore = await page.evaluate(movie => {
            const video = document.querySelector(`[data-campaign-media=${movie}] video`);
            return { movie, time: video.currentTime, duration: video.duration,
                size: [video.videoWidth, video.videoHeight], volume: video.volume,
                objectFit: getComputedStyle(video).objectFit,
                subtitle: document.querySelector(`[data-campaign-movie-subtitle=${movie}]`).textContent };
        }, winMovie);
        assert(report.winBeforeScore.volume > 0); assert.equal(report.winBeforeScore.objectFit, 'contain');
        assert.deepEqual(report.winBeforeScore.size, [640, 480]);
        await page.screenshot({ path: path.join(out, 'native-original-win-before-score.png') });
    }
    await page.waitForSelector(`[data-campaign-result=${target.result}]`, { timeout: 120000 });
    await page.waitForSelector('[data-score-phase=complete]', { timeout: 30000 });
    report.score = { visible: await page.locator('[data-campaign-score]').isVisible(), text: await page.locator('body').innerText() };
    assert(report.score.visible);
    await page.screenshot({ path: path.join(out, `native-original-${target.result}-score.png`) });
    if (process.argv.includes('--inspect-score-layout')) {
        report.scoreLayout = await inspectScoreLayout(app, page, out, source.identity.launch.mission);
    }
    if (process.argv.includes('--retry')) {
        assert.equal(target.result, 'defeat');
        const mission = source.identity.launch.mission;
        const manifest = JSON.parse(await fs.readFile(path.join('.local/campaign/ra2', mission.slice(0, -4), 'manifest.json')));
        const movies = ['Basic.Intro', 'Basic.Brief'].flatMap(binding => manifest.media.filter(movie =>
            (movie.bindings ?? [movie]).some(reference => reference.binding === binding)).map(movie => movie.name))
            .filter((name, index, names) => names.indexOf(name) === index);
        const previousGameId = report.sourceGoal.gameId;
        await page.evaluate(() => {
            const campaign = window.__ra2debug.mainMenuController.screens.get(22);
            const screen = campaign.rootController.screens.get(1), start = screen.onGameStart;
            screen.onGameStart = function (...args) {
                screen.onGameStart = start; start.apply(this, args);
                this.gameTurnMgr.setCampaignPaused(true);
            };
        });
        await page.getByRole('button', { name: labels['hd:campaignretrymission'], exact: true }).click();
        report.retryMovies = [];
        for (const movie of movies) {
            await page.waitForSelector(`[data-campaign-media=${movie}] video`, { timeout: 30000 });
            await page.waitForFunction(movie => document.querySelector(`[data-campaign-media=${movie}] video`)?.currentTime > .5, movie);
            report.retryMovies.push(movie); await page.locator(`[data-campaign-media=${movie}] button`).click();
        }
        await waitWorld(page, mission, previousGameId);
        report.retry = await page.evaluate(() => { const g = window.__ra2debug.game;
            return { tick: g.currentTick, difficulty: g.campaign.launch.difficulty, mission: g.campaign.launch.mission,
                semanticsVersion: g.campaign.launch.semanticsVersion, result: g.campaign.result,
                commands: g.campaign.journal.commands.length, failure: g.campaign.failure };
        });
        assert(report.retry.tick < 20 && !report.retry.result && !report.retry.failure);
        assert.equal(report.retry.mission, mission); assert.equal(report.retry.difficulty, source.difficulty);
        assert.equal(report.retry.semanticsVersion, source.identity.launch.semanticsVersion); assert.equal(report.retry.commands, 0);
        await page.screenshot({ path: path.join(out, 'native-original-fresh-retry.png') });
    }
    const postScore = process.argv.find(value => value.startsWith('--postscore='))?.slice(12);
    if (process.argv.includes('--return-selection')) {
        if (process.argv.includes('--terminal')) {
            assert.equal(await page.getByRole('button', { name: labels['hd:campaigncontinuemission'], exact: true }).count(), 0);
        }
        if (process.argv.includes('--next-unavailable')) {
            assert(await page.getByRole('button', { name: labels['hd:campaigncontinuemission'], exact: true }).isDisabled());
        }
        await page.getByRole('button', { name: labels['hd:campaignreturnselection'], exact: true }).click();
        await page.waitForSelector('[data-campaign-missions][data-campaign-ready=true]');
        report.selectionReturn = await page.evaluate(() => ({ activeWorldAbsent: !window.__ra2debug.game?.campaign,
            media: document.querySelectorAll('[data-campaign-media]').length }));
        assert(report.selectionReturn.activeWorldAbsent); assert.equal(report.selectionReturn.media, 0);
        if (process.argv.includes('--inspect-score-layout')) {
            report.uiAfterSelection = await page.evaluate(() => window.__ra2debug.uiArt.metrics());
            report.scoreBackdropReleased = await page.evaluate(() =>
                !document.querySelector('[data-campaign-score]')
                && [...window.__ra2debug.uiArt.surfaces.values()].filter(surface => surface.kind === 'dom'
                    && surface.gpu === 6800000).length === 1);
            assert(report.scoreBackdropReleased);
            assert(report.uiAfterSelection.domImageGpuBytesUpperBound < 2 * 6800000);
        }
        await page.screenshot({ path: path.join(out, 'native-original-score-selection-return.png') });
    }
    if (postScore) {
        assert.equal(target.result, 'victory');
        assert.equal(await page.getByRole('button', { name: labels['hd:campaigncontinuemission'], exact: true }).count(), 0,
            'The original terminal campaign must offer its selection return without a fake unavailable successor');
        await page.getByRole('button', { name: labels['hd:campaignreturnselection'], exact: true }).click();
        await page.waitForSelector(`[data-campaign-media=${postScore}] video`);
        await page.waitForFunction(movie => document.querySelector(`[data-campaign-media=${movie}] video`)?.currentTime > 1
            && document.querySelector(`[data-campaign-movie-subtitle=${movie}]`)?.textContent.trim(), postScore);
        report.postScore = await page.evaluate(movie => {
            const d = window.__ra2debug, video = document.querySelector(`[data-campaign-media=${movie}] video`);
            return { movie, time: video.currentTime, duration: video.duration, size: [video.videoWidth, video.videoHeight],
                volume: video.volume, objectFit: getComputedStyle(video).objectFit,
                subtitle: document.querySelector(`[data-campaign-movie-subtitle=${movie}]`).textContent,
                activeWorldAbsent: !d.game?.campaign, music: d.mainMenuController.music?.getPlaybackState() };
        }, postScore);
        assert(report.postScore.activeWorldAbsent && report.postScore.volume > 0);
        assert.equal(report.postScore.objectFit, 'contain'); assert.deepEqual(report.postScore.size, [640, 480]);
        if (report.postScore.music?.playing) assert.equal(report.postScore.music.gain, 0);
        await page.screenshot({ path: path.join(out, `native-original-${postScore}-postscore.png`) });
        await page.waitForSelector('[data-campaign-missions][data-campaign-ready=true]', { timeout: 45000 });
        assert.equal(await page.locator('[data-campaign-media]').count(), 0);
        report.selectionReturn = { withoutAutomaticSuccessor: await page.evaluate(() => !window.__ra2debug.game?.campaign),
            naturallyEnded: true };
        assert(report.selectionReturn.withoutAutomaticSuccessor);
        await page.screenshot({ path: path.join(out, 'native-original-terminal-selection.png') });
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = postScore ? 'PASS_NATIVE_ORIGINAL_TERMINAL_SCORE_POSTSCORE_AND_SELECTION_RETURN'
        : process.argv.includes('--return-selection') ? 'PASS_NATIVE_ORIGINAL_RESULT_SCORE_AND_SELECTION_RETURN'
        : process.argv.includes('--retry') ? 'PASS_NATIVE_RECORDED_ORIGINAL_FAILURE_SCORE_AND_FRESH_RETRY'
            : 'PASS_NATIVE_RECORDED_ORIGINAL_GOAL_AND_ACTUAL_RESULT_SCORE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
