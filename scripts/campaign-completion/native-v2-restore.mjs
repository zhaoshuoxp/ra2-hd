import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { campaignSession, pauseWorld, stepWorld, worldState } from '../m3-2/native-session.mjs';
import { closeCampaignMenuPaused } from './named-save-restart.mjs';

const out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: false });
const fixture = new URL('../m3-2/fixtures/soviet02-v2-checkpoint.json', import.meta.url);
const provenance = JSON.parse(await fs.readFile(new URL('../m3-2/fixtures/soviet02-v2-checkpoint-provenance.json', import.meta.url)));
const bytes = await fs.readFile(fixture);
assert.equal(createHash('sha256').update(bytes).digest('hex'), provenance.sha256);
const checkpoint = JSON.parse(bytes);
assert.equal(checkpoint.options.campaign.semanticsVersion, 2);
const report = { status: 'RUNNING', errors: [], failedResources: [], fixtureSha256: provenance.sha256,
    scope: 'Restore the small hash-verified retained Soviet 02 v2 checkpoint under its original execution semantics. No actual user profile or retired history tree is restored; strict world/RNG/mission checks remain enabled.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    await page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(checkpoint, 'sov02t.map'), checkpoint);
    await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 180000 });
    await pauseWorld(page);
    const state = await worldState(page);
    assert.equal(state.tick, checkpoint.tick);
    assert.equal(state.hash, checkpoint.expected.worldHash);
    assert.deepEqual(state.rng, checkpoint.expected.rng);
    assert.deepEqual(state.mission, checkpoint.expected.mission);
    assert.deepEqual(state.world, checkpoint.expected.world);
    assert.equal(state.pendingCallbacks, checkpoint.expected.pendingCallbacks);
    report.restored = { tick: state.tick, hash: state.hash, fullStateAndRngEqual: true };
    await page.screenshot({ path: path.join(out, 'restored-v2.png') });
    await closeCampaignMenuPaused(page);
    await page.evaluate(() => window.__ra2debug.gameScreen.pointer.unlock(true));
    await stepWorld(page, 300);
    const continued = await worldState(page);
    assert.equal(continued.tick, 4801); assert.equal(continued.hash, 205617629);
    report.after300Ticks = { tick: continued.tick, hash: continued.hash };
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_V2_CHECKPOINT_STRICT_STATE_AND_RECORDED_CONTINUATION';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
