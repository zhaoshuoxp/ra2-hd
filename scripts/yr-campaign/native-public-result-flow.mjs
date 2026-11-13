import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NativeCampaignPilot } from './native-pilot.mjs';
import { stepWorld, waitWorld } from '../m3-2/native-session.mjs';

const [output, mission, mode] = process.argv.slice(2);
assert(mode === 'next' && mission === 'all03umd.map' || mode === 'retry' && mission === 'all07smd.map');
const pilot = new NativeCampaignPilot(output, mission), report = pilot.report;
report.scope = 'Original source result followed by the actual public score Next/Retry button. '
    + 'The victory case replays retained ordinary Hard inputs through current original constructors; '
    + 'the defeat case uses ordinary repair and critical-yard sale. No source, world, rule, RNG or result edits. '
    + 'New public initialization and preserved difficulty are checked separately from the source gameplay.';
async function originalDefeat(state) {
    const yard = state.own.find(unit => unit.name === 'NACNST')
        ?? state.houses.flatMap(house => house.objects).find(unit => unit.name === 'NACNST' && unit.id === 2737);
    const engineers = state.own.filter(unit => unit.name === 'ENGINEER');
    const power = state.houses.flatMap(house => house.objects).find(unit => unit.name === 'NAPOWR' && unit.id === 2738);
    assert(yard && power && engineers.length);
    if (yard.health < 100) await pilot.commands.order([engineers[0].id], 15, yard.id);
    await pilot.commands.order([(engineers[1] ?? engineers[0]).id], 15, power.id);
    await pilot.commands.step(900, { defend: false, repair: false });
    await pilot.page.evaluate(id => window.__ra2debug.actionsApi.sellObject(id), yard.id);
    report.commands.push({ kind: 'ordinary-critical-yard-sale', id: yard.id });
    for (let i = 0; i < 150; i++) {
        try { await pilot.commands.step(90, { defend: false, repair: false }); }
        catch (error) { if (!error.message.startsWith('Original source defeat at tick')) throw error; }
        if (await pilot.page.evaluate(() => !!window.__ra2debug.game.campaign.result)) break;
    }
    assert.equal(await pilot.page.evaluate(() => window.__ra2debug.game.campaign.result), 'defeat');
}
try {
    const initial = await pilot.open();
    assert.equal(report.launch.difficulty, 'hard'); assert.equal(report.launch.semanticsVersion, 45);
    const oldId = await pilot.page.evaluate(() => window.__ra2debug.game.id);
    if (mode === 'next') {
        const file = process.argv.find(value => value.startsWith('--replay-commands='))?.slice(18);
        assert(file);
        const bytes = await fs.readFile(file), seed = JSON.parse(bytes);
        assert.equal(seed.schema, 'yr-original-input-replay-seed-v1');
        for (const proof of Object.values(seed.proof).filter(value => value?.file)) {
            assert.equal(createHash('sha256').update(await fs.readFile(proof.file)).digest('hex'), proof.sha256);
        }
        assert.equal(initial.tick, seed.tick - 1);
        report.inputProvenance = { file, sha256: createHash('sha256').update(bytes).digest('hex'),
            proof: seed.proof, commands: seed.commands.length, worldAssigned: false, runningRngAssigned: false };
    }
    await pilot.page.evaluate(() => {
        const d = window.__ra2debug, screen = d.gameScreen, player = screen.campaignMediaPlayer;
        const audit = window.__yrPublicResultAudit = { terrain: d.terrainHd, environment: d.environmentHd,
            player, assets: screen.campaignMovieAssets, finish: {} };
        const finish = player.finishForResult;
        player.finishForResult = async function(...args) {
            audit.finish.startedAt = performance.now(); audit.finish.pendingAtStart = this.snapshot();
            const completed = await finish.apply(this, args);
            audit.finish.completedAt = performance.now(); audit.finish.completed = completed;
            audit.finish.pendingAfter = this.snapshot(); return completed;
        };
    });
    if (mode === 'next') await stepWorld(pilot.page, 1);
    else await originalDefeat(initial);
    report.originalResult = await pilot.page.evaluate(() => {
        const c = window.__ra2debug.game.campaign;
        return { tick: window.__ra2debug.game.currentTick, result: c.result, launch: c.launch,
            sourceResultActions: c.trace.filter(action => [1, 2, 68].includes(action.opcode)) };
    });
    assert.equal(report.originalResult.result, mode === 'next' ? 'victory' : 'defeat');
    assert(report.originalResult.sourceResultActions.length);
    await pilot.completeResultFlow();
    report.score = await pilot.page.evaluate(() => {
        const a = window.__yrPublicResultAudit;
        return { at: performance.now(), finish: a.finish, playerDisposed: a.player.disposed,
            pending: a.player.snapshot(), assetSources: a.assets.sources.size,
            terrainReleased: a.terrain.disposed && !a.terrain.worldChargeBytes,
            environmentReleased: a.environment.disposed && !a.environment.worldChargeBytes };
    });
    assert(report.score.finish.completed && report.score.at >= report.score.finish.completedAt);
    assert.deepEqual(report.score.finish.pendingAfter, []); assert.deepEqual(report.score.pending, []);
    assert(report.score.playerDisposed && report.score.terrainReleased && report.score.environmentReleased);
    assert.equal(report.score.assetSources, 0);
    await pilot.retainMedia('normal-original-result-before-public-route');
    const next = mode === 'next' ? 'all04dmd.map' : mission, labels = pilot.session.labels;
    const button = labels[mode === 'next' ? 'hd:campaigncontinuemission' : 'hd:campaignretrymission'];
    await pilot.page.getByRole('button', { name: button, exact: true }).click();
    const movie = mode === 'next' ? 'a04_f00e' : 'a07_f00e';
    await pilot.page.waitForSelector(`[data-campaign-media=${movie}] video`, { timeout: 90000 });
    await pilot.page.waitForFunction(movie => document.querySelector(`[data-campaign-media=${movie}] video`)?.currentTime > .5, movie);
    report.publicOpening = await pilot.page.evaluate(movie => {
        const video = document.querySelector(`[data-campaign-media=${movie}] video`);
        return { id: movie, time: video.currentTime, duration: video.duration, skippedByPublicControl: true };
    }, movie);
    await pilot.page.locator(`[data-campaign-media=${movie}] button`).click();
    await waitWorld(pilot.page, next, oldId);
    report.publicFreshWorld = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        return { gameId: g.id, tick: g.currentTick, launch: g.campaign.launch,
            commands: g.campaign.journal.commands.length, restoring: !!g.campaign.restoring,
            result: g.campaign.result, failure: g.campaign.failure,
            inspectionModified: !!g.campaign.inspectionModified, state: g.campaign.checkpointState() };
    });
    const fresh = report.publicFreshWorld;
    const manifest = JSON.parse(await fs.readFile(`.local/campaign/yr/${next.slice(0, -4)}/manifest.json`));
    assert.equal(fresh.launch.edition, 'yr'); assert.equal(fresh.launch.mission, next);
    assert.equal(fresh.launch.sourceSha256, manifest.files.find(file => file.name === next).sha256);
    assert.equal(fresh.launch.difficulty, 'hard'); assert.equal(fresh.launch.semanticsVersion, 45);
    assert(fresh.gameId !== oldId && fresh.tick < 20 && !fresh.launch.diagnostic);
    assert(!fresh.restoring && !fresh.result && !fresh.failure && !fresh.inspectionModified);
    assert.equal(fresh.commands, 0); assert.equal(await pilot.page.locator('[data-campaign-media]').count(), 0);
    await pilot.page.screenshot({ path: path.join(pilot.out, `native-public-${mode}-fresh-hard.png`) });
    await pilot.page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await pilot.page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
    await pilot.page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
    await pilot.page.waitForSelector('[data-campaign-missions][data-campaign-ready=true]', { timeout: 90000 });
    report.returnedDifficulty = await pilot.page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).difficulty);
    assert.equal(report.returnedDifficulty, 'hard');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = mode === 'next' ? 'PASS_ORIGINAL_HARD_SOURCE_WIN_NORMAL_SCORE_PUBLIC_NEXT_FRESH_SOURCE_AND_DIFFICULTY'
        : 'PASS_ORIGINAL_HARD_SOURCE_LOSS_NORMAL_SCORE_PUBLIC_RETRY_FRESH_SOURCE_AND_DIFFICULTY';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await pilot.session?.page.screenshot({ path: path.join(pilot.out, 'failure.png') }).catch(() => {});
} finally {
    await pilot.retainMedia('final-public-result-observation').catch(error => { report.mediaObserverError = error.stack; });
    await fs.writeFile(path.join(pilot.out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await pilot.session?.app.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out: pilot.out }));
