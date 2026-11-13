import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld, worldState } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const source = path.resolve(process.argv.find(value => value.startsWith('--checkpoint='))?.slice(13)
    ?? path.join(import.meta.dirname, 'fixtures/soviet05-legacy-v7-checkpoint.json'));
const checkpoint = JSON.parse(await fs.readFile(source));
const report = { status: 'RUNNING', source, errors: [], failedResources: [],
    scope: 'Restore a retained original campaign checkpoint without trainer/physical-time extensions. Exact saved world, RNG, mission and subsequent180 ticks must survive a new capture/restoration. No real user data or source rules are modified.' };
let app, page, labels;
async function restore(saved) {
    if (await page.evaluate(() => !window.__ra2debug.mainMenuController)) {
        await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
        await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
        await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
        await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    }
    const oldId = await page.evaluate(() => window.__ra2debug.game?.id);
    await page.evaluate(saved => window.__ra2debug.mainMenuController.screens.get(22)
        .launchDiagnostic(saved, saved.options.campaign.mission), saved);
    await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
        && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), saved.tick, { timeout: 180000 });
    await page.evaluate(() => { const d = window.__ra2debug;
        d.gameScreen.menu.close(); d.gameScreen.gameTurnMgr.setCampaignPaused(true); });
    await waitWorld(page, saved.options.campaign.mission);
    return { oldId, ...await worldState(page) };
}
try {
    assert.equal(checkpoint.trainer, undefined); assert.equal(checkpoint.playTime, undefined);
    ({ app, page, labels } = await campaignSession(out, report, { density: 2 }));
    report.restored = await restore(checkpoint);
    assert.equal(report.restored.hash, checkpoint.expected.worldHash);
    assert.deepEqual(report.restored.rng, checkpoint.expected.rng);
    assert.deepEqual(report.restored.mission, checkpoint.expected.mission);
    report.policy = await page.evaluate(() => { const g = window.__ra2debug.game, c = g.campaign;
        return { launch: c.launch, estimatedLegacyPhysicalMs: c.playTime.elapsedMs,
            simulationMs: g.currentTime, selectedSpeed: g.speed.value }; });
    assert(Math.abs(report.policy.estimatedLegacyPhysicalMs - report.policy.simulationMs / report.policy.selectedSpeed) < 100);
    assert.equal(report.policy.launch.chargingVersion, undefined);
    assert.equal(report.policy.launch.paradropControlVersion, undefined);
    const upgraded = await page.evaluate(() => window.__ra2debug.game.campaign.journal.capture(window.__ra2debug.game));
    await stepWorld(page, 180); const expected = await worldState(page);
    await restore(upgraded); await stepWorld(page, 180);
    assert.deepEqual(await worldState(page), expected);
    report.after180 = { tick: expected.tick, hash: expected.hash };
    report.upgraded = { checksum: upgraded.checksum, playTime: upgraded.playTime };
    await page.screenshot({ path: path.join(out, 'native-legacy-checkpoint-restored.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_LEGACY_POLICY_CHECKPOINT_AND_UPGRADED_CONTINUATION';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
