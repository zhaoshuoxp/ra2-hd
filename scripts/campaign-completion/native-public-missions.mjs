import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { campaignSession, openMissionSelection, returnCampaignHome, switchCampaignEdition, waitWorld } from '../m3-2/native-session.mjs';
import { nativeMemorySnapshot } from './native-memory-snapshot.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const missions = process.argv.slice(3).filter(value => !value.startsWith('--'));
const unavailable = process.argv.find(value => value.startsWith('--unavailable='))?.slice(14) ?? 'sov01umd.map';
const unavailableEdition = process.argv.find(value => value.startsWith('--unavailable-edition='))?.slice(22) ?? 'yr';
const skipUnavailableProbe = process.argv.includes('--skip-unavailable-probe');
const density = Number(process.argv.find(value => value.startsWith('--density='))?.split('=')[1] ?? 2);
assert([2, 4].includes(density));
assert(['ra2', 'yr'].includes(unavailableEdition));
const naturalIntro = process.argv.includes('--natural-intro'), factionStart = process.argv.includes('--faction-start');
if (!missions.length) missions.push('sov04s.map', 'sov05u.map');
assert(!factionStart || missions.length === 1 && /01[tsu]\.map$/.test(missions[0]));
const report = { status: 'RUNNING', errors: [], failedResources: [], starts: [],
    scope: 'Actual public direct selection starts each verified original mission from its source initial world with the complete default Intro/Brief sequence and no save. Abort returns to selection and releases the prior environment and communications. Whole original loading fallback is permitted while its independent HD artwork review remains pending. No full mission victory is manufactured here.' };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    ({ app, page, labels } = await campaignSession(out, report, { density }));
    await openMissionSelection(page, labels);
    const selectFaction = async mission => {
        const faction = mission.startsWith('all') ? 'allied' : mission.startsWith('trn') ? 'tutorial' : 'soviet';
        await page.locator('[data-campaign-mission-faction]').selectOption(faction);
        await page.waitForSelector(`[data-campaign-mission="${mission}"]`);
    };
    if (!skipUnavailableProbe) {
        if (unavailableEdition === 'yr') {
            await switchCampaignEdition(page, labels, 'yr'); await openMissionSelection(page, labels);
        }
        await selectFaction(unavailable);
        assert.equal(await page.locator(`[data-campaign-mission="${unavailable}"]`).getAttribute('data-playable'), 'false');
        report.unavailable = { mission: unavailable, edition: unavailableEdition, playable: false };
        if (unavailableEdition === 'yr') {
            await switchCampaignEdition(page, labels, 'ra2'); await openMissionSelection(page, labels);
        }
    } else {
        report.unavailable = { skipped: true, reason: 'All original RA2/YR missions are now public; the complete YR entry matrix qualifies current edition isolation separately.' };
    }
    // The negative edition probe creates fresh option objects from the isolated
    // profile. Apply the observer density to the final RA2 session afterward.
    report.afterEditionProbeGraphics = await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        const before = { enabled: graphics.hdEnabled.value, density: graphics.hdDensity.value };
        graphics.hdEnabled.value = true; graphics.hdDensity.value = density;
        return { before, requested: density,
            after: { enabled: graphics.hdEnabled.value, density: graphics.hdDensity.value } };
    }, density);
    for (const mission of missions) {
        await selectFaction(mission);
        const manifest = JSON.parse(await fs.readFile(path.join('.local/campaign/ra2', mission.slice(0, -4), 'manifest.json')));
        const movies = ['Basic.Intro', 'Basic.Brief'].flatMap(binding => manifest.media.filter(movie =>
            (movie.bindings ?? [movie]).some(reference => reference.binding === binding)).map(movie => movie.name))
            .filter((name, index, names) => names.indexOf(name) === index);
        const row = page.locator(`[data-campaign-mission="${mission}"]`);
        assert.equal(await row.getAttribute('data-playable'), 'true');
        if (factionStart) {
            await page.getByRole('button', { name: labels['gui:back'], exact: true }).click();
            await page.locator('[data-campaign-difficulty]').fill('1');
            await page.locator(`[data-campaign-faction=${mission.startsWith('all') ? 'allied' : 'soviet'}]`).click();
        } else {
            await row.click(); await page.locator('[data-campaign-difficulty-choice=normal]').click();
            await page.waitForSelector('[data-campaign-preview]');
            await page.getByRole('button', { name: labels['hd:campaignstartmission'], exact: true }).click();
        }
        const start = { mission, route: factionStart ? 'faction-default-first' : 'direct-mission-selection', movies: [] };
        for (const movie of movies) {
            await page.waitForSelector(`[data-campaign-media=${movie}] video`);
            await page.waitForFunction(movie => document.querySelector(`[data-campaign-media=${movie}] video`)?.currentTime > 1.5
                && document.querySelector(`[data-campaign-movie-subtitle=${movie}]`)?.textContent.trim(), movie);
            start.movies.push(await page.evaluate(movie => { const video = document.querySelector(`[data-campaign-media=${movie}] video`);
                return { movie, time: video.currentTime, duration: video.duration, size: [video.videoWidth, video.videoHeight],
                    subtitle: document.querySelector(`[data-campaign-movie-subtitle=${movie}]`).textContent,
                    activeWorldAbsent: !window.__ra2debug.game?.campaign };
            }, movie));
            assert(start.movies.at(-1).activeWorldAbsent);
            await page.screenshot({ path: path.join(out, `public-direct-${movie}.png`) });
            if (naturalIntro) {
                const duration = start.movies.at(-1).duration;
                await page.waitForFunction(movie => !document.querySelector(`[data-campaign-media=${movie}]`), movie,
                    { timeout: Math.ceil(duration * 1000) + 15000 });
                start.movies.at(-1).completion = 'natural-ended';
            } else {
                await page.locator(`[data-campaign-media=${movie}] button`).click();
                start.movies.at(-1).completion = 'active-skip';
            }
        }
        await waitWorld(page, mission);
        start.world = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
            window.__directEnvironment = d.environmentHd;
            return { launch: g.campaign.launch, tick: g.currentTick, commands: g.campaign.journal.commands.length,
                result: g.campaign.result, failures: g.campaign.issues, actors: g.world.getAllObjects().length,
                media: g.campaign.captureMedia?.(), graphics: { enabled: d.generalOptions.graphics.hdEnabled.value,
                    density: d.generalOptions.graphics.hdDensity.value } };
        });
        report.currentStart = start; await save();
        assert.equal(start.world.launch.mission, mission); assert.equal(start.world.launch.difficulty, 'normal');
        assert(!start.world.launch.diagnostic && !start.world.result); assert(start.world.tick < 20);
        assert.equal(start.world.commands, 0); assert.deepEqual(start.world.failures, []);
        assert(start.world.graphics.enabled); assert.equal(start.world.graphics.density, density);
        start.memory = await nativeMemorySnapshot(app, page);
        await page.screenshot({ path: path.join(out, `public-direct-${mission.slice(0, -4)}-fresh-world.png`) });
        await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
        await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
        await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
        await page.waitForSelector('[data-campaign-missions][data-campaign-ready=true]');
        start.afterAbort = await page.evaluate(() => ({ environmentDisposed: window.__directEnvironment.disposed,
            gpuBytes: window.__directEnvironment.gpuBytes, activeMedia: document.querySelectorAll('[data-campaign-media]').length }));
        assert(start.afterAbort.environmentDisposed); assert.equal(start.afterAbort.gpuBytes, 0);
        assert.equal(start.afterAbort.activeMedia, 0); report.starts.push(start); delete report.currentStart; await save();
    }
    if (process.argv.includes('--skirmish-after')) {
        await returnCampaignHome(page, labels);
        await page.getByRole('button', { name: labels['hd:menuskirmish'], exact: true }).click();
        await page.waitForFunction(() => window.__ra2debug.skirmishLobby);
        // Use the normal lobby start method; no map, rules, actors or result are injected.
        await page.evaluate(() => { void window.__ra2debug.skirmishLobby.startGame(); });
        await page.waitForFunction(() => window.__ra2debug.game?.status === 1 && window.__ra2debug.gameScreen?.playerUi,
            undefined, { timeout: 180000 });
        report.skirmishAfter = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, manager = d.gameScreen.gameTurnMgr;
            window.__skirmishEnvironment = d.environmentHd;
            manager.setPaused(true); d.gameScreen.pointer.unlock(true);
            const tick = g.currentTick; manager.setPaused(false);
            try { for (let i = 0; i < 120; i++) manager.doGameTurn(performance.now()); }
            finally { manager.setPaused(true); }
            const session = d.trainer.session;
            return { campaignAbsent: !g.campaign, hudReady: !!d.gameScreen.playerUi, tickBefore: tick,
                tickAfter: g.currentTick, trainerFresh: !!session && !session.pending && !session.enabledEffects.size
                    && !session.protectedObjects.size, density: d.generalOptions.graphics.hdDensity.value,
                activeMedia: document.querySelectorAll('[data-campaign-media]').length,
                assistance: 'Normal public lobby start method and 120 unmodified simulation turns; no player commands or trainer effects.' };
        });
        assert(report.skirmishAfter.campaignAbsent && report.skirmishAfter.hudReady && report.skirmishAfter.trainerFresh);
        assert.equal(report.skirmishAfter.tickAfter - report.skirmishAfter.tickBefore, 120);
        assert.equal(report.skirmishAfter.activeMedia, 0); assert.equal(report.skirmishAfter.density, density);
        await page.screenshot({ path: path.join(out, 'public-skirmish-after-campaign.png') });
        await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
        await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
        await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
        await page.waitForSelector('[data-score-theme]', { timeout: 90000 });
        report.skirmishAfter.score = await page.evaluate(async () => {
            const scene = document.querySelector('[data-score-theme]');
            const background = scene.querySelector('.score-background');
            const url = getComputedStyle(background).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
            const image = new Image(); image.src = url; await image.decode();
            return { theme: scene.dataset.scoreTheme, hd: scene.dataset.scoreHd,
                imageSize: [image.naturalWidth, image.naturalHeight], url };
        });
        assert.equal(report.skirmishAfter.score.hd, 'true');
        const scoreFile = `res/presentation/score-${report.skirmishAfter.score.theme.split('-')[1]}-hd.png`;
        const expectedScore = PNG.sync.read(await fs.readFile(path.join('public', scoreFile)));
        assert.equal(report.skirmishAfter.score.url, 'ra2://game/' + scoreFile);
        assert.deepEqual(report.skirmishAfter.score.imageSize, [expectedScore.width, expectedScore.height]);
        await page.screenshot({ path: path.join(out, 'public-skirmish-score.png') });
        await page.getByRole('button', { name: labels['gui:continue'], exact: true }).click();
        await page.getByRole('button', { name: labels['gui:startgame'], exact: true }).waitFor({ timeout: 90000 });
        report.skirmishAfter.afterAbort = await page.evaluate(() => ({ noTrainerSession: !window.__ra2debug.trainer.session,
            activeMedia: document.querySelectorAll('[data-campaign-media]').length,
            environmentDisposed: window.__skirmishEnvironment.disposed, gpuBytes: window.__skirmishEnvironment.gpuBytes }));
        assert(report.skirmishAfter.afterAbort.noTrainerSession); assert.equal(report.skirmishAfter.afterAbort.activeMedia, 0);
        assert(report.skirmishAfter.afterAbort.environmentDisposed); assert.equal(report.skirmishAfter.afterAbort.gpuBytes, 0);
        await page.waitForFunction(() => {
            const menu = window.__ra2debug.mainMenuController.mainMenu;
            return !menu.sidebarCollapsed && !menu.sidebarNeedsRefresh;
        });
        await page.getByRole('button', { name: labels['gui:back'], exact: true }).click();
        await page.getByRole('button', { name: labels['hd:menuskirmish'], exact: true }).waitFor({ timeout: 90000 });
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_PUBLIC_DIRECT_SOURCE_STARTS_AND_ABORT_CLEANUP';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
