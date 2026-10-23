// Native factory queues, damage/death and occlusion in a controlled fixture scene.
import assert from 'node:assert/strict';
import { startSession } from './desktop-session.mjs';

const session = await startSession(process.argv[2], process.argv[3], 'yr', false, async ({ page }) => {
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdDensity.value = 4; });
});
const { page, report, stage, startClip, stopClip, close } = session;
let failure;
try {
    report.disclosure = 'Legal foundation fixtures; actual native production queues, movement and attacks. Initial damaged health is a fixture parameter. No trainer, prerequisite, weapon or animation rule changes.';
    await page.evaluate(() => {
        const f = window.__allied, sample = f.sample, d = window.__ra2debug;
        f.deathRenderables = {};
        f.sample = u => {
            const r = d.renderableManager.getRenderableByGameObject(u) ?? f.deathRenderables[u.id];
            const builder = r?.shpRenderable?.builder;
            return { ...sample(u), stance: u.stance, frame: builder?.getFrame(),
                shpHd: !!builder?.mesh && !!builder?.hdOverride };
        };
        f.factories = ['YACNST', 'YAPOWR', 'YABRCK', 'YAWEAP', 'YAREFN'].map(name => f.building(name));
        f.initialIds = new Set(f.player.getOwnedObjects().map(u => u.id));
        f.productionSnapshots = [];
        f.productionTimer = setInterval(() => {
            f.productionSnapshots.push({ tick: d.game.currentTick, credits: f.player.credits,
                queues: [2, 3].map(type => f.player.production.getQueue(type).getAll().map(item =>
                    ({ name: item.rules.name, progress: item.progress, creditsSpent: item.creditsSpent }))) });
        }, 100);
    });
    await page.waitForFunction(() => window.__allied.factories.every(b => b.buildStatus === 1), undefined, { timeout: 45000 });
    report.productionAdmission = await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        return ['INIT', 'LTNK'].map(name => ({ name,
            available: f.player.production.isAvailableForProduction(d.game.rules.getObject(name, name === 'INIT' ? 3 : 7)) }));
    });
    assert(report.productionAdmission.every(row => row.available));
    await startClip();
    await page.evaluate(() => {
        const api = window.__ra2debug.actionsApi;
        api.queueForProduction(2, 3, 'INIT', 1); api.queueForProduction(3, 7, 'LTNK', 1);
    });
    await page.waitForFunction(() => {
        const f = window.__allied;
        f.produced = f.player.getOwnedObjects().filter(u => !f.initialIds.has(u.id) && ['INIT', 'LTNK'].includes(u.name));
        for (const u of f.produced) f.actors[u.id] = u;
        return ['INIT', 'LTNK'].every(name => f.produced.some(u => u.name === name && u.isSpawned));
    }, undefined, { timeout: 90000 });
    await page.waitForFunction(() => window.__allied.produced.every(u => {
        const s = window.__allied.sample(u); return s.shpHd || s.vxlHd;
    }));
    report.production = await page.evaluate(() => ({ snapshots: window.__allied.productionSnapshots,
        produced: window.__allied.produced.map(window.__allied.sample) }));
    assert(report.production.snapshots.some(s => s.queues.flat().some(q => q.progress > 0 && q.creditsSpent > 0)));
    await stage('native-factory-production'); await stopClip('native-factory-production');
    await page.evaluate(() => clearInterval(window.__allied.productionTimer));
    report.damageDeaths = {};
    for (const name of ['INIT', 'BRUTE', 'VIRUS', 'YURIPR', 'SLAV']) {
        const result = report.damageDeaths[name] = {};
        await page.evaluate(name => {
            const d = window.__ra2debug, f = window.__allied;
            f.actor = f.spawn(name, 3, { rx: f.center.rx - 10, ry: f.center.ry - 10 });
            f.actor.attackTrait.setDisabled(true);
            d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        }, name);
        await page.waitForFunction(() => window.__allied.sample(window.__allied.actor).shpHd);
        await startClip(); await stage(name + '-before-damage');
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            f.actor.healthTrait.health = 12;
            f.deathRenderable = d.renderableManager.getRenderableByGameObject(f.actor);
            f.deathRenderables[f.actor.id] = f.deathRenderable;
            f.killer = f.spawn('E2', 3, { rx: f.actor.tile.rx + 2, ry: f.actor.tile.ry }, f.enemy);
            d.actionsApi.orderUnits([f.killer.id], 2, f.actor.id);
        });
        await page.waitForFunction(() => window.__allied.actor.isDestroyed, undefined, { timeout: 45000 });
        await stage(name + '-native-death');
        await page.waitForTimeout(600);
        result.trace = await page.evaluate(() => window.__allied.traces.flat().filter(s => s.id === window.__allied.actor.id));
        assert(result.trace.some(s => s.destroyed && s.shpHd), name + ' death must retain its actual HD lease');
        result.damageObserved = result.trace.some(s => s.health > 0 && s.health < 12);
        result.nativeDeath = true; result.clip = await stopClip(name + '-native-death');
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            if (f.killer.isSpawned) d.game.unspawnObject(f.killer);
        });
    }
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied, g = d.game;
        f.probes = [f.spawn('INIT', 3), f.spawn('LTNK', 7)];
        f.occlusionDestinations = f.probes.map((u, index) => {
            const tile = g.map.tiles.getAll().filter(t => t.occluded && g.map.isWithinBounds(t) && !t.rampType
                && g.map.getTileZone(t) === 0 && g.map.terrain.getPassableSpeed(t, u.rules.speedType, u.isInfantry(), false) > 0
                && !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()))
                .sort((a, b) => Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry))[index];
            if (!tile) throw Error('No native occluded tile');
            d.actionsApi.orderUnits([u.id], 0, tile.rx, tile.ry); return tile;
        });
    });
    await page.waitForFunction(() => window.__allied.probes.every((u, i) => !u.isMoving
        && u.tile === window.__allied.occlusionDestinations[i]), undefined, { timeout: 60000 });
    report.selectionOcclusion = await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        d.worldInteraction.minimapHandler.panToTile(f.probes[0].tile); f.actor = f.probes[0];
        return f.probes.map(u => {
            const r = d.renderableManager.getRenderableByGameObject(u); r.selectionModel.setSelected(true);
            return { ...f.sample(u), selected: r.selectionModel.isSelected(), occluded: !!u.tile.occluded,
                nativeShadow: !!r.shpRenderable?.shadowRenderable || !!r.unitVxlHd?.shadow };
        });
    });
    assert(report.selectionOcclusion.every(s => s.selected && s.occluded && (s.shpHd || s.vxlHd)));
    await stage('native-selection-shadows-occlusion');
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
