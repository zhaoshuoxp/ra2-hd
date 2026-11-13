import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { replaySourcePrefix } from './replay-source.mjs';

const [outArg, sourceArg, prefix] = process.argv.slice(2), out = path.resolve(outArg);
await fs.mkdir(out, { recursive: false });
const source = JSON.parse(await fs.readFile(path.join(sourceArg, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(sourceArg, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'Abort the actual original opening while its source spark system is active. Observe the real renderer instance/material dispose events and ordinary Abort/Quit UI. No synthetic effect, source edit or simulation mutation.' };
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    report.prefix = await replaySourcePrefix(page, source, prefix);
    await page.waitForFunction(() => window.__ra2debug.worldScene.getChildren()
        .some(fx => fx.get3DObject?.()?.name === 'fx_campaign_sparks' && fx.get3DObject().userData.sourcePoints > 0));
    report.before = await page.evaluate(() => {
        const scene = window.__ra2debug.worldScene;
        window.__campaignSparkExitObservers = scene.getChildren().filter(fx => fx.get3DObject?.()?.name === 'fx_campaign_sparks')
            .map(fx => {
                const materials = fx.get3DObject().children.map(sprite => sprite.material), disposed = new Set();
                materials.forEach((material, index) => material.addEventListener('dispose', () => disposed.add(index)));
                return { scene, fx, materials, disposed };
            });
        return window.__campaignSparkExitObservers.map(({ fx, materials }) => ({ active: fx.state.active, materials: materials.length }));
    });
    assert(report.before.length && report.before.every(effect => effect.active && effect.materials > 0));
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
    await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
    await page.waitForSelector('[data-campaign-missions][data-campaign-ready=true]');
    report.after = await page.evaluate(() => ({ activeWorldAbsent: !window.__ra2debug.game?.campaign,
        effects: window.__campaignSparkExitObservers.map(({ scene, fx, materials, disposed }) => ({
            active: fx.state.active, groupCleared: !fx.get3DObject(), detached: !scene.getChildren().includes(fx),
            materials: materials.length, disposedMaterials: disposed.size })) }));
    assert(report.after.activeWorldAbsent);
    assert(report.after.effects.every(effect => !effect.active && effect.groupCleared && effect.detached
        && effect.materials === effect.disposedMaterials));
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_ORIGINAL_ACTIVE_SPARK_ABORT_DETACH_AND_MATERIAL_RELEASE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, after: report.after, error: report.error, out }));
