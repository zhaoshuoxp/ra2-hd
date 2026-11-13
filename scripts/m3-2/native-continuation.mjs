import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { campaignSession, root, waitWorld } from './native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const checkpoint = JSON.parse(await fs.readFile(path.join(root, 'scripts/m3-1/fixtures/mid-mission-checkpoint.json')));
const history = path.join(root, '../project-history/m3-1-accepted-main-20261025');
const index = JSON.parse(await fs.readFile(path.join(history, 'Evidence/manifest.json')));
const record = index.files.find(row => row.file === 'input-final/report.json');
const bytes = gunzipSync(await fs.readFile(path.join(history, record.object)));
assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
const accepted = JSON.parse(bytes).final;
const commands = accepted.commands.filter(command => command.tick >= checkpoint.tick);
const report = { status: 'RUNNING', scope: 'Restore the accepted first-mission checkpoint and replay its retained ordinary command journal to the original victory trigger, then click Continue into a fresh second mission. This reuses accepted physical-input evidence; it is assisted replay.',
    source: record, errors: [], failedResources: [], screenshots: [] };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save(); }
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 2 }));
    await page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(checkpoint, 'sov01t.map'), checkpoint);
    await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 180000 });
    report.restored = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
        window.__firstMission = g; d.gameScreen.menu.close(); d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true);
        return { tick: g.currentTick, hash: g.getHash(), id: g.id, difficulty: g.campaign.launch.difficulty, diagnostic: g.campaign.launch.diagnostic,
            trainerEnabled: d.trainer.preferences.enabled, trainerModified: d.trainer.session.modified }; });
    assert.equal(report.restored.hash, checkpoint.expected.worldHash); assert(!report.restored.diagnostic && !report.restored.trainerModified);
    await page.evaluate(commands => window.__continuationCommands = commands, commands);
    for (let batch = 0; batch < 130; batch++) {
        const state = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, manager = d.gameScreen.gameTurnMgr;
            manager.setCampaignPaused(false);
            try { for (let i = 0; i < 240 && !g.campaign.result && !g.campaign.failure; i++) {
                for (const record of window.__continuationCommands.filter(record => record.tick === g.currentTick)) {
                    const action = d.actionFactory.create(record.type); action.unserialize(new Uint8Array(record.data)); action.player = g.getPlayer(record.player);
                    g.campaign.journal.record(g, action.player, [action]); action.process();
                }
                manager.doGameTurn(performance.now());
            } } finally { manager.setCampaignPaused(true); }
            return { tick: g.currentTick, result: g.campaign.result, failure: g.campaign.failure, trace: g.campaign.trace };
        });
        assert(!state.failure, state.failure);
        if (state.result) { report.result = state; break; }
    }
    assert.equal(report.result?.result, 'victory'); assert.equal(report.result.tick, accepted.tick);
    assert(report.result.trace.some(action => action.key === '0A301C50' && action.opcode === 1));
    await page.evaluate(() => { const m = window.__ra2debug.gameScreen.gameTurnMgr; m.setCampaignPaused(false); m.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=victory]', { timeout: 45000 });
    await shot('01-authentic-first-mission-victory');
    await page.getByRole('button', { name: labels['hd:campaigncontinuemission'], exact: true }).click();
    await page.waitForSelector('[data-campaign-media=s02_f00e] video', { timeout: 30000 });
    assert.equal(await page.locator('[data-campaign-media]').count(), 1); await shot('02-continue-original-second-mission-brief');
    await page.locator('[data-campaign-media=s02_f00e] button').click();
    await waitWorld(page, 'sov02t.map');
    report.continued = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
        return { id: g.id, tick: g.currentTick, launch: g.campaign.launch, commands: g.campaign.journal.commands.length,
            oldGameDisposed: window.__firstMission !== g, outcomes: g.campaign.movieOutcomes,
            checkpoint: d.gameScreen.params?.campaignCheckpoint, media: document.querySelectorAll('[data-campaign-media]').length }; });
    assert.notEqual(report.continued.id, report.restored.id); assert.equal(report.continued.launch.difficulty, 'normal');
    assert(!report.continued.launch.diagnostic && report.continued.tick < 120); assert.equal(report.continued.commands, 0); assert.equal(report.continued.media, 0);
    await shot('03-second-mission-fresh-world-after-first-victory');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_ORIGINAL_FIRST_MISSION_VICTORY_CONTINUES_TO_FRESH_SECOND_MISSION';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await shot('failure').catch(() => {}); }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, error: report.error }));
