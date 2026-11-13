import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';
const out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: false });
const report = {
    status: 'RUNNING', errors: [], failedResources: [], samples: [], scope: 'Unchanged original Allied11 opening without player orders. Accelerate only to tick900, then observe normal real-time play and the original ship/squid story. No spawn, health, rule, trigger, goal or RNG edits.'
};
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('all11t.map'));
    await waitWorld(page, 'all11t.map');
    await stepWorld(page, 900);
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        window.__squidFrames = [];
        window.__shipDamage = [];
        let previous;
        g.desiredSpeed.value = 1;
        for (const ship of g.world.getAllObjects().filter(u => u.name === 'CRUISE')) {
            const damage = ship.healthTrait.inflictDamage;
            ship.healthTrait.inflictDamage = function (amount, source, world) { window.__shipDamage.push({ tick: g.currentTick, id: ship.id, amount, source: source?.obj?.name, weapon: source?.weapon?.name }); return damage.call(this, amount, source, world); };
        }
        function frame(time) { if (previous !== undefined)
            window.__squidFrames.push(time - previous); previous = time; window.__squidRaf = requestAnimationFrame(frame); }
        window.__squidRaf = requestAnimationFrame(frame);
        d.gameScreen.gameTurnMgr.setPaused(false);
        d.gameScreen.gameTurnMgr.setCampaignPaused(false);
        d.gameScreen.gameAnimationLoop.start();
    });
    let captured = false, capturedShake = false;
    for (let n = 0; n < 260; n++) {
        await page.waitForTimeout(100);
        const s = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, ship = g.world.getAllObjects().find(u => u.name === 'CRUISE' && u.parasiteableTrait?.getParasite());
            const r = ship && d.renderableManager.getRenderableByGameObject(ship);
            const units = g.world.getAllObjects().filter(u => u.isInfantry() && u.isSpawned).slice(0, 12).map(u => { const a = d.renderableManager.getRenderableByGameObject(u); return { id: u.id, frame: a?.shpAnimRunner?.animation?.getCurrentFrame(), sequence: a?.currentSequenceParams?.type }; });
            return {
                wall: performance.now(), tick: g.currentTick, hash: g.getHash(), paused: d.gameScreen.gameTurnMgr.isSimulationPaused(), movies: g.campaign.captureMedia().movies, units,
                ship: ship && {
                    id: ship.id, hp: ship.healthTrait.getHitPoints(), tile: [ship.tile.rx, ship.tile.ry], parasite: ship.parasiteableTrait.getParasite().id, shp: !r?.objectArt.isVoxel, animation: !!r?.squidGrabAnim, frame: r?.squidGrabAnim?.animation?.getCurrentFrame(), props: r?.squidGrabAnim?.getAnimProps()
                }
            };
        });
        report.samples.push(s);
        if (s.ship?.animation && !captured) {
            await page.evaluate(tile => { const d = window.__ra2debug; d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(...tile)); }, s.ship.tile);
            await page.screenshot({ path: path.join(out, 'native-original-squid-grab.png') });
            captured = true;
        }
        if (s.ship?.animation && s.ship.frame >= 80 && s.ship.frame % 10 >= 6 && !capturedShake) {
            await page.screenshot({ path: path.join(out, 'native-original-squid-complete-shake.png') });
            capturedShake = true;
        }
    }
    report.shipDamage = await page.evaluate(() => window.__shipDamage);
    report.frames = await page.evaluate(() => { cancelAnimationFrame(window.__squidRaf); const f = window.__squidFrames; return { count: f.length, maxMs: Math.max(...f), over250Ms: f.filter(t => t > 250) }; });
    assert(captured, 'Original CRUISE was not rendered with the SQDG animation');
    const active = report.samples.filter(s => s.ship?.animation);
    assert(active.length > 2);
    report.pauseRuns = [];
    for (let i = 0; i < report.samples.length;) {
        if (!report.samples[i].paused) {
            i++;
            continue;
        }
        let j = i + 1;
        while (j < report.samples.length && report.samples[j].paused && report.samples[j].tick === report.samples[i].tick)
            j++;
        if (j - i > 3) {
            const run = report.samples.slice(i, j);
            assert(run.every(s => s.hash === run[0].hash));
            report.pauseRuns.push({ tick: run[0].tick, durationMs: run.at(-1).wall - run[0].wall, worldExact: true, units: run.map(s => s.units) });
        }
        i = j;
    }
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_ORIGINAL_SQUID_GRAB_REAL_TIME_OBSERVATION';
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
console.log(JSON.stringify({ status: report.status, error: report.error, frames: report.frames, out }));
