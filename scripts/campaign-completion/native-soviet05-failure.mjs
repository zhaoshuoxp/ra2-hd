import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], samples: [],
    scope: 'Fresh original Soviet 05 player-force failure. Ordinary commands send the controlled Shock Troopers against original enemies and force-attack the original Tesla Coil/barracks with the player infantry. No resign, source/rule/trigger/health edit or forced result. Tower-specific failure is a separate branch.' };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function state() {
    return page.evaluate(() => { const g = window.__ra2debug.game, c = g.campaign;
        return { tick: g.currentTick, hash: g.getHash(), result: c.result, failure: c.failure,
            fired: c.machine.states.get('08AB8D40').fired, defeat: c.trace.filter(action => action.opcode === 2),
            other3: c.houses.get('Other3 House').getOwnedObjects(true).filter(unit => !unit.isDestroyed)
                .map(unit => ({ id: unit.id, name: unit.name, health: unit.healthTrait?.health })),
            barracks: g.localPlayer.getOwnedObjects().find(unit => unit.name === 'NAHAND')?.healthTrait.health };
    });
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov05u.map'));
    await waitWorld(page, 'sov05u.map');
    report.initial = await page.evaluate(() => { const d = window.__ra2debug, g = d.game, c = g.campaign;
        const target = c.houses.get('Other3 House').getOwnedObjects().find(unit => unit.name === 'TESLA');
        const infantry = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'E2');
        const shock = c.houses.get('Other3 House').getOwnedObjects().filter(unit => unit.name === 'SHK');
        d.actionsApi.orderUnits(shock.map(unit => unit.id), 4, 61, 79);
        d.actionsApi.orderUnits(infantry.map(unit => unit.id), 3, target.id);
        return { launch: c.launch, target: target.id, infantry: infantry.map(unit => unit.id), shock: shock.map(unit => unit.id) };
    });
    let current;
    for (let i = 0; i < 80; i++) {
        await stepWorld(page, 150); current = await state(); report.samples.push(current); await save();
        if (!current.other3.some(unit => unit.name === 'TESLA') || current.result) break;
    }
    assert(!current.other3.some(unit => unit.name === 'TESLA'));
    await page.evaluate(ids => { const d = window.__ra2debug, g = d.game;
        const barracks = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'NAHAND');
        if (barracks) d.actionsApi.orderUnits(ids.filter(id => g.world.hasObjectId(id)), 3, barracks.id);
    }, report.initial.infantry);
    for (let i = 0; i < 100 && !current.result; i++) {
        await stepWorld(page, 150); current = await state(); report.samples.push(current); await save();
    }
    assert.equal(current.result, 'defeat'); assert(current.fired && current.defeat.length && !current.failure);
    assert.equal(current.other3.length, 0); assert.equal(current.barracks, undefined);
    report.final = current;
    await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands)));
    await page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setCampaignPaused(false));
    await page.waitForSelector('[data-campaign-result=defeat][data-score-phase=complete]', { timeout: 120000 });
    report.score = await page.locator('body').innerText(); await page.screenshot({ path: path.join(out, 'native-original-soviet05-force-defeat.png') });
    await page.getByRole('button', { name: labels['hd:campaignretrymission'], exact: true }).click();
    if (process.argv.includes('--unavailable')) {
        await page.waitForSelector('[data-campaign-missions][data-campaign-ready=true]');
        assert.equal(await page.locator('[data-campaign-mission="sov05u.map"]').getAttribute('data-playable'), 'false');
        report.retry = { policy: 'The private prepared mission is still unavailable publicly; retry correctly returns to its selected catalog row.' };
    } else {
        await page.waitForSelector('[data-campaign-media=s05_f00e] video', { timeout: 30000 });
        report.retry = { briefing: true };
        await page.locator('[data-campaign-media=s05_f00e] button').click(); await waitWorld(page, 'sov05u.map');
        report.retry.initial = await page.evaluate(() => { const g = window.__ra2debug.game;
            return { tick: g.currentTick, difficulty: g.campaign.launch.difficulty, result: g.campaign.result,
                barracks: g.localPlayer.getOwnedObjects().find(unit => unit.name === 'NAHAND')?.healthTrait.health,
                towerOwner: g.world.getAllObjects().find(unit => unit.name === 'CAPARS01').owner.name };
        });
        assert(report.retry.initial.tick < 10 && !report.retry.initial.result);
        assert.equal(report.retry.initial.barracks, 100); assert.equal(report.retry.initial.towerOwner, 'Other2 House');
        assert.equal(report.retry.initial.difficulty, 'normal');
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = process.argv.includes('--unavailable') ? 'PASS_NATIVE_ORIGINAL_SOVIET05_PLAYER_FAILURE_AND_UNAVAILABLE_RETURN'
        : 'PASS_NATIVE_ORIGINAL_SOVIET05_PLAYER_FORCE_FAILURE_AND_RETRY';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
