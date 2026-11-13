import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, openMissionSelection, pauseWorld, stepWorld, switchCampaignEdition, waitWorld } from './native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', scope: 'Original Easy opening/difficulty, then an explicit loss-branch exercise using ordinary force-attack and exposed movement orders. No direct health, object deletion, trigger or result modification. Actual Retry, return and edition selection follow.',
    errors: [], failedResources: [], commands: [], screenshots: [] };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save(); }
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 2 }));
    await openMissionSelection(page, labels);
    await page.locator('[data-campaign-mission="sov02t.map"]').click();
    await page.locator('[data-campaign-difficulty-choice=easy]').click();
    await page.waitForFunction(() => !!document.querySelector('[data-campaign-preview]'));
    await page.getByRole('button', { name: labels['hd:campaignstartmission'], exact: true }).click();
    await page.waitForSelector('[data-campaign-media=s02_f00e]'); await page.locator('[data-campaign-media] button').click();
    await waitWorld(page, 'sov02t.map'); await stepWorld(page, 30);
    report.opening = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
        window.__retryOriginal = g;
        return { id: g.id, difficulty: g.campaign.launch.difficulty, human: g.localPlayer.handicap,
            ai: [...g.campaign.houses].filter(([name]) => ['Americans', 'Germans'].includes(name)).map(([name, owner]) => [name, owner.handicap]),
            arrivals: g.campaign.trace.filter(action => action.opcode === 80).map(action => action.key), teams: g.campaign.teams.snapshot() }; });
    assert.equal(report.opening.difficulty, 'easy'); assert.equal(report.opening.arrivals.length, 7);
    await stepWorld(page, 1000);
    for (let i = 0; i < 220; i++) {
        const command = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
            if (g.campaign.result || g.campaign.inputLocked) return;
            const units = g.localPlayer.getOwnedObjects().filter(o => o.isUnit() && o.isSpawned && !o.isDestroyed);
            const fighters = units.filter(o => o.attackTrait && o.rules.naval !== true);
            const victim = fighters.length > 1 ? fighters[0] : undefined;
            if (victim) d.actionsApi.orderUnits(fighters.filter(o => o !== victim).map(o => o.id), 3, victim.id);
            else {
                for (const unit of units) d.actionsApi.orderUnits([unit.id], 1, unit.rules.naval ? 88 : 82, unit.rules.naval ? 84 : 96);
            }
            return { tick: g.currentTick, units: units.map(o => o.id), victim: victim?.id, mode: victim ? 'force-attack-own-unit' : 'move-into-enemy-defense' };
        });
        if (command) report.commands.push(command);
        const state = await stepWorld(page, 150);
        if (state.result) break;
    }
    report.result = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { tick: g.currentTick, result: g.campaign.result, failure: g.campaign.failure,
            finalPlayerObjects: g.localPlayer.getOwnedObjects().map(o => [o.id, o.name]), sourceActions: g.campaign.trace.filter(a => a.opcode === 2) }; });
    assert.equal(report.result.result, 'defeat'); assert(report.result.sourceActions.some(action => action.key === '089D1680'));
    await page.evaluate(() => { const m = window.__ra2debug.gameScreen.gameTurnMgr; m.setCampaignPaused(false); m.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=defeat]', { timeout: 45000 }); await shot('01-original-defeat-and-retry');
    await page.getByRole('button', { name: labels['hd:campaignretrymission'], exact: true }).click();
    await page.waitForSelector('[data-campaign-media=s02_f00e]'); await page.locator('[data-campaign-media] button').click();
    await waitWorld(page, 'sov02t.map');
    report.retry = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { id: g.id, difficulty: g.campaign.launch.difficulty, tick: g.currentTick, commands: g.campaign.journal.commands.length }; });
    assert.notEqual(report.retry.id, report.opening.id); assert.equal(report.retry.difficulty, 'easy'); assert.equal(report.retry.commands, 0);
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
    await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
    await page.waitForSelector('[data-campaign-missions][data-campaign-ready=true]');
    report.returnSelection = await page.evaluate(() => ({ difficulty: window.__ra2debug.mainMenuController.screens.get(22).difficulty,
        buttons: [...document.querySelectorAll('[data-campaign-difficulty-choice]')].map(e => [e.dataset.campaignDifficultyChoice, e.getAttribute('aria-pressed')]) }));
    await page.waitForSelector('[data-campaign-difficulty-choice=easy][aria-pressed=true]');
    assert.equal(await page.locator('[data-campaign-difficulty-choice=easy][aria-pressed=true]').count(), 1);
    assert.equal(await page.locator('[data-campaign-media]').count(), 0); await shot('02-return-to-selection-after-retry');
    await switchCampaignEdition(page, labels, 'yr');
    await openMissionSelection(page, labels);
    await page.waitForSelector('[data-campaign-missions] [data-campaign-mission]');
    assert.equal(await page.locator('[data-campaign-mission][data-playable=true]').count(), 0);
    assert(await page.getByRole('button', { name: labels['hd:campaignstartmission'], exact: true }).isDisabled());
    await shot('03-yr-catalog-remains-unavailable');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_EASY_ORIGINAL_DEFEAT_RETRY_RETURN_AND_UNAVAILABLE_YR_CATALOG';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await shot('failure').catch(() => {}); }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, error: report.error }));
