import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [],
    scope: 'Fresh original Soviet01 prepared launch, normal paid deployment/building/engineer commands and actual original production hint. No hidden checkpoint, source, rule, health, ownership or RNG edit. Public navigation is verified separately.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov01t.map'));
    await waitWorld(page, 'sov01t.map');
    const commands = new OrdinaryCampaignCommands(page, report);
    report.start = await page.evaluate(() => {
        const g = window.__ra2debug.game;
        return { launch: g.campaign.launch, tick: g.currentTick, journal: g.campaign.journal.commands.length };
    });
    assert.equal(report.start.launch.semanticsVersion, 5); assert.equal(report.start.launch.countryIdentityVersion, 1);
    assert.equal(report.start.journal, 0); assert(report.start.tick < 20);
    await commands.step(1600, { defend: false, repair: false });
    const mcvs = await commands.order(['SMCV'], 9);
    if (mcvs.length) await commands.step(120, { defend: false, repair: false });
    assert(await page.evaluate(() => [...window.__ra2debug.game.localPlayer.buildings].some(o =>
        o.name === 'NACNST' && o.isSpawned && !o.isDestroyed)), 'Original scripted MCV deployment must supply the yard');
    await commands.build('NAPOWR'); await commands.build('NAHAND');
    await commands.queue('SENGINEER', 2); await commands.step(1200);
    report.production = await page.evaluate(() => {
        const g = window.__ra2debug.game, c = g.campaign;
        return { tick: g.currentTick, hash: g.getHash(), credits: g.localPlayer.credits,
            engineers: g.localPlayer.getOwnedObjects().filter(o => o.name === 'SENGINEER' && o.isSpawned && !o.isDestroyed)
                .map(o => ({ id: o.id, name: o.name, owner: o.owner.name, health: o.healthTrait.health, tile: [o.tile.rx, o.tile.ry] })),
            hint: c.machine.states.get('0A0FF90C'), variable7: c.machine.variables.get('7'),
            trusted: c.journal.trusted, modified: c.inspectionModified, failure: c.failure };
    });
    assert.equal(report.production.engineers.length, 2); assert.equal(report.production.hint.fired, 1);
    assert.equal(report.production.variable7, true); assert(report.production.trusted && !report.production.modified);
    assert(!report.production.failure);
    await page.screenshot({ path: path.join(out, 'actual-paid-engineers-and-source-hint.png') });
    await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(await page.evaluate(() =>
        window.__ra2debug.game.campaign.journal.commands)) + '\n');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_FRESH_FIRST_MISSION_PAID_ENGINEERS_AND_ORIGINAL_HINT';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
