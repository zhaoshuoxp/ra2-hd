import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, worldState, stepWorld } from '../m3-2/native-session.mjs';
import { readFeedbackSource, replayFeedbackOpening } from './feedback-source-replay-v53.mjs';
const out = path.resolve(process.argv[2]), density = Number(process.argv[3] ?? 2);
await fs.mkdir(out, { recursive: false });
const mission = process.argv.find(a => a.startsWith('--mission='))?.slice(10) ?? 'all06u.map';
const prefix = Number(process.argv.find(a => a.startsWith('--prefix='))?.slice(9) ?? 0);
const families = (process.argv.find(a => a.startsWith('--families='))?.slice(11) ?? 'NASAM,NAFLAK').split(',');
const report = {
    status: 'RUNNING', errors: [], failedResources: [], density, cases: [], scope: 'Unchanged original mission AA placements, diagnostic reveal/camera only. Inspect normal offscreen return, then explicitly replace/dispose one renderer allocation to reproduce cache eviction. This renderer-only fault injection changes no simulation, artwork, source placement or production budget.'
};
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density }));
    report.mission = mission;
    if (prefix) {
        const source = await readFeedbackSource(path.join(import.meta.dirname, 'fixtures/all12-source-commands-v26.json'));
        report.sourcePrefix = await replayFeedbackOpening(page, source, prefix);
    }
    else {
        await page.evaluate(m => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(m), mission);
        await waitWorld(page, mission);
        await stepWorld(page, 90);
    }
    await page.evaluate(() => { const s = window.__ra2debug.gameScreen; s.gameTurnMgr.setPaused(false); s.gameTurnMgr.setCampaignPaused(false); s.gameAnimationLoop.start(); });
    await page.waitForTimeout(prefix ? 4000 : 1500);
    await page.evaluate(() => { const s = window.__ra2debug.gameScreen; s.gameTurnMgr.setPaused(true); s.gameTurnMgr.setCampaignPaused(true); });
    report.setup = await page.evaluate(() => { const g = window.__ra2debug.game; g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g); return g.world.getAllObjects().filter(u => ['NASAM', 'NAFLAK'].includes(u.name)).map(u => ({ id: u.id, name: u.name, tile: [u.tile.rx, u.tile.ry] })); });
    const before = await worldState(page);
    for (const name of families) {
        const actor = report.setup.find(u => u.name === name);
        assert(actor, `No original ${name}`);
        await page.evaluate(tile => { const d = window.__ra2debug; d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(...tile)); }, actor.tile);
        await page.waitForFunction(id => { const d = window.__ra2debug, u = d.game.world.getObjectById(id), r = d.renderableManager.getRenderableByGameObject(u); return !!r?.turret && (!d.generalOptions.graphics.hdEnabled.value || !!r.buildingTurretHd); }, actor.id, { timeout: 90000 });
        const inspect = () => page.evaluate(id => {
            const d = window.__ra2debug, u = d.game.world.getObjectById(id), r = d.renderableManager.getRenderableByGameObject(u);
            const hd = r.buildingTurretHd;
            const materials = r.turretBuilders.flatMap(b => [...b.sections.values()].map(m => ({ color: m.material.colorWrite, depth: m.material.depthWrite })));
            return {
                id: u.id, name: u.name, turret: r.turret.visible, buildStatus: u.buildStatus, currentAnimType: r.currentAnimType, hp: u.healthTrait.health, materials, hd: hd && {
                    density: hd.resources.density, disposed: hd.resources.disposed, parts: hd.resources.parts.size, visible: [...hd.meshes.values()].filter(([, s]) => s.visible).length
                }
            };
        }, actor.id);
        const initial = await inspect();
        report.cases.push({ actor, initial });
        assert(initial.turret);
        if (density)
            assert(initial.hd?.visible > 0);
        await page.screenshot({ path: path.join(out, `${name}-initial.png`) });
        await page.evaluate(tile => { const d = window.__ra2debug, g = d.game; const far = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t)).sort((a, b) => Math.hypot(b.rx - tile[0], b.ry - tile[1]) - Math.hypot(a.rx - tile[0], a.ry - tile[1]))[0]; d.worldInteraction.minimapHandler.panToTile(far); }, actor.tile);
        await page.waitForTimeout(350);
        await page.evaluate(tile => { const d = window.__ra2debug; d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(...tile)); }, actor.tile);
        await page.waitForTimeout(500);
        const returned = await inspect();
        assert(returned.turret);
        if (density)
            assert(returned.hd?.visible > 0);
        let replacement;
        if (density) {
            replacement = await page.evaluate(async (id) => {
                const d = window.__ra2debug, u = d.game.world.getObjectById(id), r = d.renderableManager.getRenderableByGameObject(u), old = r.buildingTurretHd.resources;
                const fresh = new old.constructor(old.contract, old.density, old.assemblyCompletionFrame, old.nativePivot, old.showMainAtAssemblyCompletion);
                for (const [h, p] of old.parts) {
                    const image = await createImageBitmap(p.base.image);
                    const base = p.base.clone();
                    base.image = image;
                    base.needsUpdate = true;
                    const mask = p.mask.clone();
                    mask.image = { ...p.mask.image, data: p.mask.image.data.slice() };
                    mask.needsUpdate = true;
                    fresh.parts.set(h, { base, mask });
                }
                const originalGetter = r.imageFinder.getBuildingTurretHd;
                r.imageFinder.getBuildingTurretHd = function (name) { return name === u.name ? fresh : originalGetter.call(this, name); };
                old.dispose();
                window.__turretReplacements ??= [];
                window.__turretReplacements.push({ r, old, fresh, originalGetter });
                return { oldDisposed: old.disposed, parts: fresh.parts.size };
            }, actor.id);
            await page.waitForTimeout(500);
            const rebound = await inspect();
            assert(rebound.hd?.visible > 0 && !rebound.hd.disposed);
            assert(replacement.oldDisposed);
            replacement.rebound = rebound;
            await page.screenshot({ path: path.join(out, `${name}-after-resource-replacement.png`) });
            await page.evaluate(id => { const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(d.game.world.getObjectById(id)); const last = window.__turretReplacements.at(-1); r.imageFinder.getBuildingTurretHd = function (name) { return name === r.gameObject.name ? undefined : last.originalGetter.call(this, name); }; last.fresh.dispose(); }, actor.id);
            await page.waitForTimeout(250);
            const fallback = await inspect();
            assert(!fallback.hd && fallback.materials.some(m => m.color));
            replacement.fallback = fallback;
            await page.screenshot({ path: path.join(out, `${name}-native-fallback.png`) });
        }
        Object.assign(report.cases.at(-1), { returned, replacement });
    }
    const after = await worldState(page);
    assert.equal(after.tick, before.tick);
    assert.equal(after.hash, before.hash);
    assert.deepEqual(after.rng, before.rng);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_ORIGINAL_AA_TURRETS_OFFSCREEN_RETURN_RESOURCE_REPLACEMENT_AND_NATIVE_FALLBACK';
}
catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => { });
}
finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
