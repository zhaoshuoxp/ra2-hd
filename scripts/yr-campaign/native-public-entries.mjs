import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, openMissionSelection, switchCampaignEdition, waitWorld } from '../m3-2/native-session.mjs';

const [output, faction, requestedDensity] = process.argv.slice(2);
const out = path.resolve(output), density = Number(requestedDensity);
assert(['allied', 'soviet'].includes(faction) && [2, 4].includes(density));
await fs.mkdir(out, { recursive: false });
const current = JSON.parse(await fs.readFile('docs/yr-campaign-current.json'));
const missions = current.missions.filter(row => row.faction === faction);
assert.equal(missions.length, 7);
const report = { status: 'RUNNING', faction, density, errors: [], failedResources: [], starts: [],
    scope: 'Actual faction-first and all seven direct public entries from original initial worlds. '
        + 'Each source Intro/Brief is observed and skipped through its public control for this entry matrix. '
        + 'Full natural movie playback, task goals and meaningful save continuations have separate qualified evidence. '
        + 'Abort/Quit, complete scene release and public edition isolation are observed without source or world edits.' };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function start(row, difficulty, route) {
    const { mission } = row;
    const manifest = JSON.parse(await fs.readFile(`.local/campaign/yr/${mission.slice(0, -4)}/manifest.json`));
    const opening = ['Basic.Intro', 'Basic.Brief'].flatMap(binding => manifest.media.filter(movie =>
        (movie.bindings ?? [movie]).some(reference => reference.binding === binding)).map(movie => movie.name))
        .filter((name, i, names) => names.indexOf(name) === i);
    if (route === 'faction-first') {
        assert.equal(await page.locator('[data-campaign-missions]').count(), 0);
        await page.locator('[data-campaign-difficulty]').fill(String(['easy', 'normal', 'hard'].indexOf(difficulty)));
        await page.locator(`[data-campaign-faction=${faction}]`).click();
    } else {
        if (!await page.locator('[data-campaign-missions]').count()) await openMissionSelection(page, labels, faction);
        await page.locator('[data-campaign-mission-faction]').selectOption(faction);
        const selector = `[data-campaign-mission="${mission}"]`;
        await page.waitForSelector(selector);
        assert.equal(await page.locator(selector).getAttribute('data-playable'), 'true');
        assert.equal(await page.locator('[data-campaign-mission]').count(), 7);
        await page.locator(selector).click();
        await page.locator(`[data-campaign-difficulty-choice=${difficulty}]`).click();
        await page.waitForSelector('[data-campaign-preview]');
        await page.getByRole('button', { name: labels['hd:campaignstartmission'], exact: true }).click();
    }
    const observed = [];
    for (const movie of opening) {
        await page.waitForSelector(`[data-campaign-media=${movie}] video`, { timeout: 90000 });
        await page.waitForFunction(movie => document.querySelector(`[data-campaign-media=${movie}] video`)?.currentTime > .5, movie);
        const state = await page.evaluate(movie => {
            const video = document.querySelector(`[data-campaign-media=${movie}] video`);
            return { id: movie, time: video.currentTime, duration: video.duration,
                size: [video.videoWidth, video.videoHeight], worldAbsent: !window.__ra2debug.worldScene,
                edition: document.documentElement.dataset.edition };
        }, movie);
        assert(state.time > 0 && state.duration > 0 && state.size.every(n => n > 0));
        observed.push(state);
        await page.locator(`[data-campaign-media=${movie}] button`).click();
    }
    await waitWorld(page, mission);
    const world = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        window.__publicEntryOldResources = { terrain: d.terrainHd, environment: d.environmentHd };
        return { gameId: g.id, launch: g.campaign.launch, tick: g.currentTick, hash: g.getHash(),
            commands: g.campaign.journal.commands.length, restoring: !!g.campaign.restoring,
            result: g.campaign.result, failure: g.campaign.failure, inspectionModified: !!g.campaign.inspectionModified,
            graphics: { enabled: d.generalOptions.graphics.hdEnabled.value, density: d.generalOptions.graphics.hdDensity.value },
            terrainGroups: d.terrainHd.groups, terrainCharge: d.terrainHd.worldChargeBytes,
            environmentCharge: d.environmentHd.worldChargeBytes };
    });
    assert.equal(world.launch.edition, 'yr'); assert.equal(world.launch.mission, mission);
    assert.equal(world.launch.difficulty, difficulty); assert.equal(world.launch.semanticsVersion, 45);
    assert.equal(world.launch.sourceSha256, row.sourceSha256); assert.equal(world.launch.provenanceDigest, manifest.provenanceDigest);
    assert.equal(world.commands, 0); assert(world.tick < 20 && !world.launch.diagnostic);
    assert(!world.restoring && !world.result && !world.failure && !world.inspectionModified);
    assert(world.graphics.enabled && world.graphics.density === density && world.terrainCharge > 0);
    assert(world.terrainGroups.some(group => group.status === 'PUBLISHED'));
    await page.screenshot({ path: path.join(out, `${route}-${mission.slice(0, -4)}-fresh.png`) });
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
    await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
    await page.waitForSelector('[data-campaign-missions][data-campaign-ready=true]', { timeout: 90000 });
    await page.waitForFunction(() => Object.values(window.__publicEntryOldResources).every(r => r.disposed
        && !r.gpuBytes && !r.retainedCpuBytes && !r.worldChargeBytes));
    assert.equal(await page.locator('[data-campaign-media]').count(), 0);
    assert.equal(await page.locator('[data-sidebar-radar]').count(), 0);
    const release = await page.evaluate(() => JSON.parse(JSON.stringify(window.__publicEntryOldResources)));
    report.starts.push({ mission, route, difficulty, opening: observed, movieSkipScope: 'PUBLIC_ENTRY_MATRIX', world, release });
    await save();
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { edition: 'yr', density }));
    report.factions = await page.locator('[data-campaign-faction]').evaluateAll(elements => elements.map(e => e.dataset.campaignFaction));
    assert.deepEqual(report.factions.sort(), ['allied', 'soviet']);
    await start(missions[0], 'hard', 'faction-first');
    for (const [index, row] of missions.entries()) await start(row, ['easy', 'normal', 'hard'][index % 3], 'direct');
    assert.equal(new Set(report.starts.map(r => r.world.gameId)).size, 8);
    await switchCampaignEdition(page, labels, 'ra2');
    await openMissionSelection(page, labels, faction);
    report.ra2Rows = await page.locator('[data-campaign-mission]').evaluateAll(elements => elements.map(e => ({
        mission: e.dataset.campaignMission, playable: e.dataset.playable })));
    assert.equal(report.ra2Rows.length, 12);
    assert(report.ra2Rows.every(row => !row.mission.includes('md.map') && row.playable === 'true'));
    await switchCampaignEdition(page, labels, 'yr');
    await openMissionSelection(page, labels, faction);
    report.yrRowsAfterReturn = await page.locator('[data-campaign-mission]').evaluateAll(elements => elements.map(e => ({
        mission: e.dataset.campaignMission, playable: e.dataset.playable })));
    assert.equal(report.yrRowsAfterReturn.length, 7);
    assert(report.yrRowsAfterReturn.every(row => row.mission.endsWith('md.map') && row.playable === 'true'));
    await page.screenshot({ path: path.join(out, 'public-yr-selection-after-edition-roundtrip.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_PUBLIC_FACTION_FIRST_SEVEN_DIRECT_SOURCE_STARTS_ABORT_RELEASE_AND_EDITION_ISOLATION';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
