import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const restoreApp = process.argv.find(a => a.startsWith('--restore-app='))?.slice(14);
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [],
    scope: 'Original Allied11, real named save in the old application, complete quit and restoration in the repaired application. The world, tick, RNG, variables, teams and queues must replay exactly. Only renderer inspection and camera framing are used; no source, rule, actor or objective edits.' };
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 4 }));
    report.originApp = process.argv.find(a => a.startsWith('--app='))?.slice(6) ?? 'development';
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('all11t.map'));
    await waitWorld(page, 'all11t.map'); await page.waitForTimeout(500);
    await page.evaluate(() => { const s = window.__ra2debug.gameScreen;
        s.gameTurnMgr.setPaused(false); s.gameTurnMgr.setCampaignPaused(false); s.gameAnimationLoop.start(); });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const s = window.__ra2debug.gameScreen;
        s.gameTurnMgr.setPaused(true); s.gameTurnMgr.setCampaignPaused(true); });
    await page.waitForTimeout(500);
    report.before = await page.evaluate(() => {
        const d = window.__ra2debug;
        return [...d.game.localPlayer.buildings].filter(u => u.name === 'NASAM').map(u => {
            const r = d.renderableManager.getRenderableByGameObject(u), hd = r.buildingTurretHd;
            const mesh = [...hd?.meshes.values() ?? []].map(([, m]) => m).find(m => m.visible);
            return { id: u.id, ready: u.buildStatus === 1, hd: !!hd,
                stale: !!mesh && !mesh.matrixWorld.equals(mesh.parent.matrixWorld.clone().multiply(mesh.matrix)) };
        });
    });
    assert(report.before.some(u => u.ready && u.stale), 'The old application must reproduce a missing turret before saving');
    const index = process.argv.findIndex(a => a.startsWith('--app='));
    if (index >= 0) process.argv.splice(index, 1);
    if (restoreApp) process.argv.push('--app=' + restoreApp);
    report.restoreApp = restoreApp ?? 'development';
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report,
        'V56 Old Application AA Visibility', stepWorld, async ({ page }) => {
            await page.waitForTimeout(500);
            report.restoredInitialCamera = await page.evaluate(() => {
                const d = window.__ra2debug;
                return [...d.game.localPlayer.buildings].filter(u => u.name === 'NASAM').map(u => {
                    const r = d.renderableManager.getRenderableByGameObject(u);
                    const mesh = [...r.buildingTurretHd?.meshes.values() ?? []].map(([, m]) => m).find(m => m.visible);
                    return { id: u.id, ready: u.buildStatus === 1, visible: r.turret.visible,
                        culled: r.target[Symbol.for('ra2.viewCulled')], matrix: mesh?.matrixWorld.elements,
                        expected: mesh?.parent.matrixWorld.clone().multiply(mesh.matrix).elements };
                });
            });
            assert(report.restoredInitialCamera.some(u => !u.culled));
            for (const actor of report.restoredInitialCamera.filter(u => !u.culled)) {
                assert(actor.ready && actor.visible);
                if (actor.matrix) assert.deepEqual(actor.matrix, actor.expected);
            }
            await page.screenshot({ path: path.join(out, 'actual-old-save-restored-before-camera-tour.png') });
            const actors = await page.evaluate(() => [...window.__ra2debug.game.localPlayer.buildings]
                .filter(u => u.name === 'NASAM').map(u => ({ id: u.id, tile: [u.tile.rx, u.tile.ry] })));
            report.restoredTurrets = [];
            for (const actor of actors) {
                await page.evaluate(tile => { const d = window.__ra2debug;
                    d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(...tile)); }, actor.tile);
                await page.waitForTimeout(400);
                const state = await page.evaluate(id => {
                    const d = window.__ra2debug, u = d.game.world.getObjectById(id), r = d.renderableManager.getRenderableByGameObject(u);
                    const mesh = [...r.buildingTurretHd?.meshes.values() ?? []].map(([, m]) => m).find(m => m.visible);
                    return { id, ready: u.buildStatus === 1, visible: r.turret.visible,
                        matrix: mesh?.matrixWorld.elements,
                        expected: mesh?.parent.matrixWorld.clone().multiply(mesh.matrix).elements,
                        paused: d.gameScreen.gameTurnMgr.isSimulationPaused() };
                }, actor.id);
                assert(state.ready && state.visible && state.paused);
                if (state.matrix) assert.deepEqual(state.matrix, state.expected);
                report.restoredTurrets.push(state);
            }
            await page.screenshot({ path: path.join(out, 'actual-old-save-restored-with-complete-turrets.png') });
        }));
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_OLD_APP_MISSING_TURRET_SAVE_FULL_RESTART_EXACT_WORLD_AND_REPAIRED_RENDERING';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
