import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { readFeedbackSource, replayFeedbackOpening } from './feedback-source-replay-v53.mjs';
const out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: false });
const source = await readFeedbackSource(path.join(import.meta.dirname, 'fixtures/all11-source-commands-v25.json'));
const report = {
    status: 'RUNNING', errors: [], failedResources: [], scope: 'Retained original Allied11 ordinary-command opening, stopped at its first actual Action117 paused movie. The legacy simulation policy isolates presentation pause verification. No source, health, trigger, objective or RNG edits.'
};
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    report.opening = await replayFeedbackOpening(page, source, 0);
    for (let batch = 0; batch < 120; batch++) {
        report.boundary = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game;
            for (let i = 0; i < 120; i++) {
                if (g.campaign.captureMedia().movies.some(m => m.placement === 'transmission-paused'))
                    return { tick: g.currentTick, movies: g.campaign.captureMedia().movies };
                for (const c of window.__feedbackSourceCommands.get(g.currentTick) ?? []) {
                    const a = d.actionFactory.create(c.type);
                    a.unserialize(new Uint8Array(c.data));
                    a.player = g.getPlayer(c.player);
                    g.campaign.journal.record(g, a.player, [a]);
                    a.process();
                }
                g.update();
            }
            return { tick: g.currentTick, movies: g.campaign.captureMedia().movies };
        });
        if (report.boundary.movies.some(m => m.placement === 'transmission-paused'))
            break;
    }
    assert(report.boundary.movies.some(m => m.placement === 'transmission-paused'), 'Original paused source movie did not occur');
    const movie = page.locator('[data-sidebar-radar] [data-campaign-media] video');
    await movie.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-sidebar-radar] [data-campaign-media] video')?.currentTime > .2);
    await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setPaused(false); d.gameScreen.gameAnimationLoop.start(); });
    const snapshot = () => page.evaluate(() => { const d = window.__ra2debug, g = d.game; return {
        tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), paused: d.gameScreen.gameTurnMgr.isSimulationPaused(), units: g.world.getAllObjects().filter(u => u.isInfantry() && u.isSpawned).map(u => { const r = d.renderableManager.getRenderableByGameObject(u); return { id: u.id, frame: r?.animRunner?.animation?.getCurrentFrame(), sequence: r?.currentSequenceParams?.type }; })
    }; });
    report.before = await snapshot();
    assert(report.before.paused);
    assert(report.before.units.some(u => u.frame !== undefined));
    await page.waitForTimeout(2000);
    report.during = await snapshot();
    assert.deepEqual(report.during, report.before);
    await page.screenshot({ path: path.join(out, 'native-original-paused-transmission.png') });
    await movie.waitFor({ state: 'detached', timeout: 180000 });
    await page.waitForFunction(tick => window.__ra2debug.game.currentTick > tick, report.before.tick);
    report.resumed = await snapshot();
    assert(report.resumed.tick > report.before.tick);
    assert(!report.resumed.paused);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_ORIGINAL_ACTION117_FREEZES_WORLD_AND_INFANTRY_ANIMATION_THEN_RESUMES';
}
catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
}
finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, boundary: report.boundary, out }));
