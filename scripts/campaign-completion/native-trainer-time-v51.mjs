import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'Fresh original Soviet09, real wall-clock play/pause at two speeds, actual trainer controls and named-save UI, full application exit/restart and subsequent180 original ticks. Only supported trainer commands alter the world; no diagnostic reveal or rule/trigger/objective edits. Test profile is isolated from real saves.' };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function live(milliseconds, speed) {
    const before = await page.evaluate(speed => {
        const d = window.__ra2debug, g = d.game, m = d.gameScreen.gameTurnMgr;
        g.desiredSpeed.value = speed; m.setPaused(false); m.setCampaignPaused(false);
        return { real: performance.now(), physical: g.campaign.playTime.elapsedMs, simulation: g.currentTime, tick: g.currentTick };
    }, speed);
    await page.waitForTimeout(milliseconds);
    const after = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
        d.gameScreen.gameTurnMgr.setCampaignPaused(true);
        return { real: performance.now(), physical: g.campaign.playTime.elapsedMs, simulation: g.currentTime, tick: g.currentTick }; });
    const physical = after.physical - before.physical, real = after.real - before.real;
    assert(Math.abs(physical - real) < 150, JSON.stringify({ before, after }));
    assert(after.tick > before.tick);
    (report.clockSamples ??= []).push({ speed, before, after, physical, real });
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 2 }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov09u.map'));
    await waitWorld(page, 'sov09u.map'); await stepWorld(page, 1200);
    const yuri = await page.evaluate(() => window.__ra2debug.game.world.getAllObjects()
        .filter(o => o.name === 'YURI' && !o.isDestroyed && o.isSpawned).map(o => ({ id: o.id, tile: [o.tile.rx, o.tile.ry] })));
    assert.equal(yuri.length, 2); report.yuri = yuri;
    await live(2200, 4.5); await live(1400, 1.5);
    const paused = await page.evaluate(() => window.__ra2debug.game.campaign.playTime.elapsedMs);
    await page.waitForTimeout(900);
    assert(Math.abs(await page.evaluate(() => window.__ra2debug.game.campaign.playTime.elapsedMs) - paused) < 5);
    report.pausedClockStable = true;
    await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.pointer.unlock(true); d.trainer.setEnabled(true); });
    await page.locator('.trainer-bar').getByRole('button', { name: labels['trainer:economy'], exact: true }).click();
    await page.locator('[data-trainer-action=addCredits]').click(); await page.locator('[data-trainer-action=power]').click();
    await page.locator('.trainer-bar').getByRole('button', { name: labels['trainer:economy'], exact: true }).click();
    await page.evaluate(ids => { const d = window.__ra2debug, g = d.game;
        if (!d.trainer.send({ type: 'protect', targets: ids.map(id => g.getObjectById(id)) })
            || !d.trainer.send({ type: 'reveal' })) throw Error('Supported trainer command rejected');
    }, yuri.map(o => o.id));
    await stepWorld(page, 2);
    report.trainerBefore = await page.evaluate(() => { const d = window.__ra2debug, g = d.game, s = d.trainer.session;
        return { enabled: s.enabledForSave, effects: s.effects, protected: [...s.protectedObjects].map(o => o.id),
            modified: g.campaign.trainerModified, inspection: g.campaign.inspectionModified,
            journalEvents: g.campaign.journal.trainerEvents, time: g.campaign.playTime.elapsedMs, speed: g.desiredSpeed.value,
            credits: g.localPlayer.credits, trusted: g.campaign.journal.trusted };
    });
    assert(report.trainerBefore.modified && !report.trainerBefore.inspection && report.trainerBefore.trusted);
    assert.equal(report.trainerBefore.protected.length, 2); assert(report.trainerBefore.effects.power > 0);
    await page.evaluate(id => { const d = window.__ra2debug; if (!d.trainer.send({ type: 'heal', targets: [d.game.getObjectById(id)] })) throw Error('Pending heal rejected'); }, yuri[0].id);
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report,
        'Soviet09 trainer, idle Yuri and physical play time', stepWorld, async (_session, checkpoint) => {
            const restored = await _session.page.evaluate(() => { const d = window.__ra2debug, g = d.game, s = d.trainer.session;
                return { enabled: s.enabledForSave, effects: s.effects, protected: [...s.protectedObjects].map(o => o.id),
                    modified: g.campaign.trainerModified, inspection: g.campaign.inspectionModified,
                    pending: s.pending, physical: g.campaign.playTime.elapsedMs, speed: g.desiredSpeed.value,
                    media: g.campaign.captureMedia(), launch: g.campaign.launch }; });
            assert.deepEqual(restored.effects, report.trainerBefore.effects);
            assert.deepEqual(restored.protected, report.trainerBefore.protected);
            assert.equal(restored.pending, 1); assert.equal(restored.physical, checkpoint.playTime.elapsedMs);
            assert.equal(restored.speed, 1.5); assert(restored.modified && !restored.inspection);
            assert.equal(restored.launch.paradropControlVersion, 1); assert.equal(restored.launch.semanticsVersion, 11);
            report.trainerRestored = restored;
        }));
    await page.screenshot({ path: path.join(out, 'native-trainer-campaign-restored.png') });
    const captured = await page.evaluate(() => window.__ra2debug.game.campaign.journal.capture(window.__ra2debug.game));
    assert(captured.trainer.events.length >= 5); assert(captured.playTime.elapsedMs >= 3400);
    report.resave = { tick: captured.tick, trainerEvents: captured.trainer.events.length, time: captured.playTime, checksum: captured.checksum };
    report.airport = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        const airport = g.world.getAllObjects().find(o => o.name === 'CAAIRP');
        const signs = g.world.getAllObjects().filter(o => ['CASIN01E', 'CASIN01W'].includes(o.name)
            && Math.abs(o.tile.rx - airport.tile.rx) + Math.abs(o.tile.ry - airport.tile.ry) < 20);
        d.worldInteraction.minimapHandler.panToTile(airport.tile);
        return signs.map(o => { const r = d.renderableManager.getRenderableByGameObject(o);
            return { id: o.id, name: o.name, tile: [o.tile.rx, o.tile.ry], originalActorRetained: !o.isDestroyed,
                missingMainImage: !r?.mainObj, debugPlaceholder: !!r?.placeholderObj }; });
    });
    assert.equal(report.airport.length, 2); assert(report.airport.every(o => o.originalActorRetained && !o.debugPlaceholder));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, 'native-airport-trainer-revealed-no-white-cubes.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_CAMPAIGN_TRAINER_SAVE_FULL_RESTART_PENDING_EFFECTS_WORLD_RNG_AND_PHYSICAL_TIME';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
