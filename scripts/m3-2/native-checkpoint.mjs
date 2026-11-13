import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { campaignSession, pauseWorld, stepWorld, waitWorld, worldState } from './native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', scope: 'Fresh original Normal Soviet 02, ordinary assisted beach commands, real named Save and Load UI, full application restart, exact world/RNG/trigger/team comparison and further native mission progression.',
    errors: [], failedResources: [], commands: [], screenshots: [] };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save(); }
async function commandBeach() {
    const command = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
        if (g.campaign.inputLocked) return;
        const target = g.world.getAllObjects().filter(o => o.name === 'GAPILL' && !o.isDestroyed && o.tile.rx < 90 && o.tile.ry < 75).sort((a, b) => a.id - b.id)[0];
        const ids = g.localPlayer.getOwnedObjects().filter(o => o.isSpawned && ['HTNK', 'E2'].includes(o.name)).map(o => o.id);
        if (!target || !ids.length) return;
        const hidden = g.mapShroudTrait.getPlayerShroud(g.localPlayer).isShrouded(target.tile, target.tileElevation);
        if (hidden) d.actionsApi.orderUnits(ids, 4, target.tile.rx, target.tile.ry); else d.actionsApi.orderUnits(ids, 2, target.id);
        return { tick: g.currentTick, ids, order: hidden ? 'attack-move' : 'attack', target: target.id };
    });
    if (command) report.commands.push(command);
}
async function closeMenu() { await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.menu.close();
    d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true); }); }
async function action(name, fallback) {
    const button = page.locator(`[data-action=${name}]`);
    if (await button.count()) await button.click(); else await page.getByRole('button', { name: labels[fallback], exact: true }).click();
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 2 }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov02t.map'));
    await waitWorld(page, 'sov02t.map');
    while (await page.evaluate(() => window.__ra2debug.game.currentTick < 4501)) {
        await commandBeach();
        const left = await page.evaluate(() => 4501 - window.__ra2debug.game.currentTick);
        await stepWorld(page, Math.min(120, left));
    }
    await page.waitForSelector('[data-sidebar-radar] [data-campaign-media=s02_p01e]', { timeout: 10000 });
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.getByRole('button', { name: labels['gui:save'], exact: true }).click();
    await page.waitForSelector('[data-save-scope=campaign][data-mode=save]');
    await page.locator('.save-native-name').fill('M3.2 native mid-mission'); await action('SaveGame', 'gui:save');
    await page.locator('[data-action=AcknowledgeSave]').waitFor(); await action('AcknowledgeSave');
    const record = await page.evaluate(async () => { const db = await new Promise(resolve => {
        const q = indexedDB.open('ra2-hd-campaign-library', 1); q.onsuccess = () => resolve(q.result); });
        try { return await new Promise(resolve => { const q = db.transaction('saves').objectStore('saves').getAll(); q.onsuccess = () => resolve(q.result[0]); }); }
        finally { db.close(); } });
    assert.equal(record.mission, 'sov02t.map'); assert.equal(record.tick, 4501);
    assert.equal(record.checkpoint.presentation.movies[0].id, 's02_p01e');
    await fs.writeFile(path.join(out, 'checkpoint.json'), JSON.stringify(record.checkpoint) + '\n');
    const savedState = await worldState(page); await shot('01-original-transmission-named-save');
    await action('CloseSaves', 'gui:back'); await closeMenu(); await stepWorld(page, 300);
    const reference = await worldState(page);
    await app.close(); app = undefined;
    ({ app, page, labels } = await campaignSession(out, report, { density: 2 }));
    await page.getByRole('button', { name: labels['gui:load'], exact: true }).click();
    await page.locator(`[role=option][data-id="${record.id}"]`).click(); await action('LoadGame', 'gui:load');
    await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), record.tick, { timeout: 180000 });
    await pauseWorld(page);
    assert.deepEqual(await worldState(page), savedState);
    assert.equal(await page.locator('[data-campaign-media=s02_f00e]').count(), 0);
    report.presentation = await page.evaluate(() => window.__ra2debug.game.campaign.captureMedia());
    assert.equal(report.presentation.movies[0].id, 's02_p01e');
    assert(Math.abs(report.presentation.movies[0].time - record.checkpoint.presentation.movies[0].time) < .2);
    await shot('02-mid-mission-restored-after-full-restart');
    await closeMenu(); await stepWorld(page, 300); assert.deepEqual(await worldState(page), reference);
    report.restoration = { tick: record.tick, hash: savedState.hash, after300Ticks: reference.hash, checksum: record.checkpoint.checksum,
        exactWorldRngMissionTeamsAndCallbacks: true, noIntroReplay: true, sourceSemanticsVersion: record.checkpoint.options.campaign.semanticsVersion,
        commands: record.checkpoint.commands.length, referenceSha256: createHash('sha256').update(JSON.stringify(reference)).digest('hex') };
    for (let i = 0; i < 50; i++) {
        await commandBeach(); await stepWorld(page, 150);
        if (await page.evaluate(() => window.__ra2debug.game.localPlayer.getOwnedObjects().some(o => o.name === 'SMCV' && o.isSpawned))) break;
    }
    report.continued = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { tick: g.currentTick, variables: [...g.campaign.machine.variables], result: g.campaign.result,
            playerMcv: g.localPlayer.getOwnedObjects().filter(o => o.name === 'SMCV' && o.isSpawned).map(o => o.id), failure: g.campaign.failure }; });
    assert(report.continued.playerMcv.length); assert(!report.continued.failure); await shot('03-original-mcv-progression-after-restore');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_SOVIET02_NAMED_SAVE_RESTART_EXACT_RESTORE_PENDING_MEDIA_AND_CONTINUATION';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await shot('failure').catch(() => {}); }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, error: report.error }));
