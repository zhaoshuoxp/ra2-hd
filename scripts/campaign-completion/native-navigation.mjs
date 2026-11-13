import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, openMissionSelection, switchCampaignEdition, waitWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], screenshots: [],
    scope: 'Actual native sidebar mission-selection child page, faction default first mission, original pre-mission playback, difficulty persistence, main-menu-only edition switch and unavailable YR guards.' };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function shot(name) {
    await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save();
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 2 }));
    assert.equal(await page.locator('[data-campaign-edition]').count(), 0);
    assert.equal(await page.locator('[data-campaign-missions]').count(), 0);
    await shot('01-faction-screen-sidebar');
    await openMissionSelection(page, labels);
    await page.locator('[data-campaign-mission="sov02t.map"]').click();
    await page.locator('[data-campaign-difficulty-choice=hard]').click();
    assert.equal(await page.locator('[data-campaign-edition]').count(), 0);
    await page.locator('[data-campaign-mission-faction]').selectOption('allied');
    await page.waitForSelector('[data-campaign-mission="all01t.map"]');
    assert.equal(await page.locator('[data-campaign-mission="sov02t.map"]').count(), 0);
    await page.locator('[data-campaign-mission-faction]').selectOption('soviet');
    await page.waitForSelector('[data-campaign-mission="sov02t.map"]');
    await page.locator('[data-campaign-mission="sov02t.map"]').click();
    await shot('02-mission-child-page');
    await page.getByRole('button', { name: labels['gui:back'], exact: true }).click();
    await page.waitForSelector('[data-campaign-selection]');
    await page.locator('[data-campaign-faction=soviet]').click();
    await page.waitForSelector('[data-campaign-media=s01_f00e] video', { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('[data-campaign-media=s01_f00e] video')?.currentTime > .2);
    await shot('03-faction-starts-original-first-mission-intro');
    await page.locator('[data-campaign-media] button').click();
    await waitWorld(page, 'sov01t.map');
    report.factionLaunch = await page.evaluate(() => {
        const g = window.__ra2debug.game;
        return { launch: g.campaign.launch, tick: g.currentTick, commands: g.campaign.journal.commands.length };
    });
    assert.equal(report.factionLaunch.launch.mission, 'sov01t.map');
    assert.equal(report.factionLaunch.launch.difficulty, 'hard');
    assert(!report.factionLaunch.launch.diagnostic);
    assert.equal(report.factionLaunch.commands, 0);
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
    await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
    await page.waitForSelector('[data-campaign-missions][data-campaign-ready=true]');
    await switchCampaignEdition(page, labels, 'yr');
    assert.equal(await page.locator('[data-campaign-edition]').count(), 0);
    await openMissionSelection(page, labels);
    assert.equal(await page.locator('[data-campaign-mission][data-playable=true]').count(), 0);
    assert(await page.getByRole('button', { name: labels['hd:campaignstartmission'], exact: true }).isDisabled());
    await shot('04-main-menu-selected-yr-catalog');
    await switchCampaignEdition(page, labels, 'ra2');
    await openMissionSelection(page, labels);
    await page.locator('[data-campaign-mission="sov02t.map"]').click();
    await page.waitForFunction(() => !!document.querySelector('[data-campaign-preview]'));
    await page.getByRole('button', { name: labels['hd:campaignstartmission'], exact: true }).click();
    await page.waitForSelector('[data-campaign-media=s02_f00e]');
    await page.locator('[data-campaign-media] button').click();
    await waitWorld(page, 'sov02t.map');
    report.directLaunch = await page.evaluate(() => {
        const g = window.__ra2debug.game;
        return { launch: g.campaign.launch, tick: g.currentTick, commands: g.campaign.journal.commands.length };
    });
    assert.equal(report.directLaunch.launch.mission, 'sov02t.map');
    assert(!report.directLaunch.launch.diagnostic); assert.equal(report.directLaunch.commands, 0);
    await shot('05-direct-second-mission-from-child-page');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_FACTION_FIRST_MISSION_CHILD_SELECTION_AND_MAIN_MENU_EDITION_SWITCH';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await shot('failure').catch(() => {}); }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
