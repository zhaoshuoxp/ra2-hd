import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';
import { replaySourcePrefix } from './replay-source.mjs';

const out = path.resolve(process.argv[2]), sourceDirectory = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const source = JSON.parse(await fs.readFile(path.join(sourceDirectory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(sourceDirectory, 'applied-command-journal.json')));
source.identity.launch ??= source.identity.source;
source.difficulty = source.identity.launch.difficulty;
const mission = source.identity.launch.mission;
const manifest = JSON.parse(await fs.readFile(path.join('.local/campaign/ra2', mission.slice(0, -4), 'manifest.json')));
const next = manifest.catalog.find(entry => entry.filename === mission).next;
assert(next, 'A real catalog successor is required');
const nextManifest = JSON.parse(await fs.readFile(path.join('.local/campaign/ra2', next.slice(0, -4), 'manifest.json')));
const movies = ['Basic.Intro', 'Basic.Brief'].flatMap(binding => nextManifest.media.filter(movie =>
    (movie.bindings ?? [movie]).some(reference => reference.binding === binding)).map(movie => movie.name))
    .filter((name, index, names) => names.indexOf(name) === index);
const label = process.argv.find(value => value.startsWith('--label='))?.slice(8)
    ?? source.samples.findLast(sample => sample.result === 'victory')?.label;
assert(label, 'A previously observed original victory is required');
const report = { status: 'RUNNING', errors: [], failedResources: [],
    mission, next, expectedMovies: movies,
    scope: 'Re-execute a previously observed original victory with its ordinary command journal and creation seeds, then exercise actual result/continue into the catalog successor. No forced victory, source edit or hidden save initializes a world. Prefix reconstruction suppresses presentation only; successor movies/loading/initialization run normally. Loading artwork acceptance is separate.' };
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 2 }));
    report.replay = await replaySourcePrefix(page, source, label);
    report.oldEnvironment = await page.evaluate(() => {
        const d = window.__ra2debug; window.__previousCampaignWorld = d.game; window.__previousEnvironment = d.environmentHd;
        return { existed: !!d.environmentHd, gpuBytes: d.environmentHd?.gpuBytes };
    });
    assert(report.oldEnvironment.existed && report.oldEnvironment.gpuBytes > 0);
    await page.evaluate(() => { const manager = window.__ra2debug.gameScreen.gameTurnMgr;
        manager.setPaused(false); manager.setCampaignPaused(false); manager.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=victory]', { timeout: 45000 });
    await page.getByRole('button', { name: labels['hd:campaigncontinuemission'], exact: true }).click();
    report.movies = [];
    for (const movie of movies) {
        await page.waitForSelector(`[data-campaign-media=${movie}] video`);
        await page.waitForFunction(movie => document.querySelector(`[data-campaign-media=${movie}] video`)?.currentTime > 1, movie);
        report.movies.push(await page.evaluate(movie => { const video = document.querySelector(`[data-campaign-media=${movie}] video`);
            return { movie, duration: video.duration, time: video.currentTime, size: [video.videoWidth, video.videoHeight] };
        }, movie));
        await page.screenshot({ path: path.join(out, `actual-successor-${movie}.png`) });
        await page.locator(`[data-campaign-media=${movie}] button`).click();
    }
    await waitWorld(page, next);
    report.continued = await page.evaluate(oldMovies => {
        const d = window.__ra2debug, g = d.game;
        return { launch: g.campaign.launch, tick: g.currentTick, journalCommands: g.campaign.journal.commands.length,
            originalPlayer: g.localPlayer.country.name, previousWorldReplaced: g !== window.__previousCampaignWorld,
            previousEnvironmentDisposed: window.__previousEnvironment.disposed,
            previousEnvironmentGpuBytes: window.__previousEnvironment.gpuBytes,
            previousMovieAbsent: oldMovies.every(name => !document.querySelector(`[data-campaign-media=${name}]`)) };
    }, manifest.media.map(movie => movie.name));
    assert.equal(report.continued.launch.mission, next); assert.equal(report.continued.launch.difficulty, source.difficulty);
    assert.equal(report.continued.journalCommands, 0);
    assert(report.continued.previousWorldReplaced && report.continued.previousEnvironmentDisposed && report.continued.previousMovieAbsent);
    assert.equal(report.continued.previousEnvironmentGpuBytes, 0);
    await page.screenshot({ path: path.join(out, 'actual-successor-fresh-world.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_RECORDED_ORIGINAL_VICTORY_CONTINUE_TO_FRESH_CATALOG_SUCCESSOR';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
