import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]), mission = process.argv[3] ?? 'all02umd.map';
const density = Number(process.argv.find(value => value.startsWith('--density='))?.slice(10) ?? 4);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', mission, density, errors: [], failedResources: [], views: [],
    scope: 'Original source scene with supported map reveal, frozen simulation and ordinary camera pans. Optional QA workers provide bounded CPU/memory pressure. No actor, rule, RNG or result is edited; no mission-goal or physical-memory-target credit.' };
let session;
try {
    session = await campaignSession(out, report, { edition: 'yr', density });
    const { page } = session;
    await page.evaluate(async mission => {
        const screen = window.__ra2debug.mainMenuController.screens.get(22);
        screen.difficulty = 'easy'; await screen.launchPrepared(mission);
    }, mission);
    await waitWorld(page, mission);
    await page.evaluate(() => {
        const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setPaused(true);
        d.trainer.setEnabled(true);
        if (!d.trainer.send({ type: 'reveal' })) throw Error('Supported map reveal rejected');
    });
    await stepWorld(page, 1);
    const targets = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, selected = new Map();
        for (const u of g.world.getAllObjects()) {
            if (!u.isBuilding() || u.isDestroyed || !d.sovietUnitsHd.families[u.name]) continue;
            if (!selected.has(u.name)) selected.set(u.name, { id: u.id, name: u.name, tile: [u.tile.rx, u.tile.ry] });
        }
        return [...selected.values()].slice(0, 14);
    });
    assert(targets.length >= 6);
    report.before = await page.evaluate(() => ({ hash: window.__ra2debug.game.getHash(),
        rng: window.__ra2debug.game.prng.snapshot(), tick: window.__ra2debug.game.currentTick }));
    if (process.argv.includes('--stress')) {
        report.pressure = 'Two bounded isolated QA workers, each retaining 128 MiB and executing CPU work in 80 ms bursts. This is not a physical 8/16 GiB qualification.';
        await page.evaluate(() => {
            const source = `const memory=new Uint8Array(128*1024*1024);memory.fill(1);let value=0;function work(){const end=performance.now()+80;while(performance.now()<end)value=Math.sin(value+1);setTimeout(work,20)}work();`;
            const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
            window.__feedbackLoadWorkers = [new Worker(url), new Worker(url)]; URL.revokeObjectURL(url);
        });
    }
    for (let round = 0; round < 2; round++) for (const target of targets) {
        await page.evaluate(id => {
            const d = window.__ra2debug, u = d.game.world.getAllObjects().find(u => u.id === id);
            const free = d.worldScene.cameraPan.freeCamera, previous = free.value; free.value = true;
            try { d.worldInteraction.minimapHandler.panToTile(u.tile); }
            finally { free.value = previous; }
        }, target.id);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const sample = await page.evaluate(target => {
            const d = window.__ra2debug, g = d.game, u = g.world.getAllObjects().find(u => u.id === target.id);
            const r = d.renderableManager.getRenderableByGameObject(u), family = d.sovietUnitsHd.families[target.name];
            return { target, family: { density: family.density, status: family.status, gpuBytes: family.gpuBytes },
                actualHdBody: !!r?.mainObj?.builder?.hdOverride,
                actorBytes: d.sovietUnitsHd.gpuBytes, actorBudget: d.sovietUnitsHd.budget,
                geometryCount: d.renderer.renderer.info.memory.geometries, textureCount: d.renderer.renderer.info.memory.textures };
        }, target);
        report.views.push({ round, ...sample });
        assert.equal(sample.family.status, 'READY'); assert.equal(sample.family.density, density);
        assert(sample.actualHdBody, 'The first rendered camera view must use the prepared HD building body');
        assert(sample.actorBytes <= sample.actorBudget);
        if (round === 1 && target === targets[0]) await page.screenshot({ path: path.join(out, 'native-camera-return.png') });
    }
    report.after = await page.evaluate(() => ({ hash: window.__ra2debug.game.getHash(),
        rng: window.__ra2debug.game.prng.snapshot(), tick: window.__ra2debug.game.currentTick }));
    assert.deepEqual(report.after, report.before); assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_HD_CAMERA_TOUR_AND_RETURN_WITH_UNCHANGED_FROZEN_SOURCE_WORLD';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally {
    await session?.page.evaluate(() => window.__feedbackLoadWorkers?.forEach(worker => worker.terminate())).catch(() => {});
    await session?.app.close(); await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, error: report.error, views: report.views.length }));
