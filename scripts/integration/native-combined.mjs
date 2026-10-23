// A bounded combined scene: complete D bindings, current C interfaces, UI and release.
import assert from 'node:assert/strict';
import { startSession } from '../m1/yuri-units/desktop-session.mjs';

const [receipt, output, densityArg = '4'] = process.argv.slice(2);
const density = Number(densityArg);
const arcsOnly = process.argv.includes('--arcs-only');
assert([2, 4].includes(density));
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const g = window.__ra2debug.generalOptions.graphics;
        g.hdEnabled.value = true; g.hdDensity.value = density;
    }, density);
});
const { page, report, stage, startClip, stopClip, close } = session;
const wait = (predicate, timeout = 30000) => page.waitForFunction(predicate, undefined, { timeout });
let failure, recording = false;
try {
    report.density = density;
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied, g = d.game;
        f.byName = {}; f.cBuildings = [];
        const names = ['INIT', 'BRUTE', 'VIRUS', 'YURIPR', 'YURI', 'CCOMAND', 'PTROOP', 'CIVAN',
            'YENGINEER', 'LTNK', 'YHVR', 'PCV', 'SMIN', 'YTNK', 'TELE', 'CAOS', 'BSUB', 'MIND', 'DISK', 'LUNR'];
        const infantry = new Set(names.slice(0, 9).concat('LUNR'));
        const ore = g.map.tiles.getAll().filter(t => g.map.getObjectsOnTile(t).some(o => o.isOverlay() && o.isTiberium()));
        const minerSite = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && !t.rampType && g.map.getTileZone(t) === 0)
            .sort((a, b) => Math.min(...ore.map(o => Math.hypot(b.rx - o.rx, b.ry - o.ry)))
                - Math.min(...ore.map(o => Math.hypot(a.rx - o.rx, a.ry - o.ry))))[0];
        for (const name of names) {
            const unit = f.spawn(name, infantry.has(name) ? 3 : 7, name === 'SMIN' ? minerSite : f.center);
            unit.attackTrait?.setDisabled(true); f.byName[name] = unit;
        }
        for (const name of ['YAPOWR', 'YAPOWR', 'YABRCK', 'YAPSYT', 'YAGGUN', 'YAGRND', 'YAGNTC', 'NATBNK']) {
            const b = f.building(name); b.attackTrait?.setDisabled(true); f.cBuildings.push(b);
        }
        // Supply native power for the tower/mutator in this mixed legal fixture.
        for (let i = 0; i < 6; i++) f.cBuildings.push(f.building('YAPOWR'));
        f.buildingSample = unit => {
            const r = d.renderableManager.getRenderableByGameObject(unit), b = r?.mainObj?.builder;
            return { name: unit.name, id: unit.id, hd: !!b?.hdOverride, identity: b?.hdOverride?.identity,
                density: b?.hdOverride?.density, palette: b?.palette?.hash, spawned: unit.isSpawned,
                turret: r?.buildingTurretHd && { density: r.buildingTurretHd.resources.density,
                    members: r.buildingTurretHd.resources.contract.members, bytes: r.buildingTurretHd.resources.gpuBytes } };
        };
        f.countLinks = () => {
            let count = 0; d.worldScene.get3DObject().traverse(o => { if (o.name === 'fx_mclink') count++; }); return count;
        };
        f.worldAllocation = () => {
            const w = d.worldView, demand = d.sovietUnitsHd;
            const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
                + (w.napowrHd?.report.gpuBytes ?? 0) + [...(w.rhinoHd?.parts.values() ?? [])]
                    .reduce((n, p) => n + p.bitmap.width * p.bitmap.height * 5 + p.palette.image.data.byteLength, 0);
            const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !demand.families[name])
                .reduce((n, [, family]) => n + family.report.gpuBytes, 0);
            return { baseline, eager, demand: demand.gpuBytes, total: baseline + eager + demand.gpuBytes,
                limit: baseline + eager + demand.budget, cache: { ...d.preparedHdCache }, ui: d.uiArt.metrics() };
        };
    });
    await wait(() => {
        const f = window.__allied;
        return Object.values(f.byName).every(u => f.sample(u).shpHd || f.sample(u).vxlHd)
            && f.cBuildings.every(b => f.buildingSample(b).hd);
    }, 60000);
    report.bindings = await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        return Object.values(f.byName).map(u => ({ ...f.sample(u), allocation: d.sovietUnitsHd.families[u.name] }));
    });
    for (const row of report.bindings) if (row.allocation) assert.equal(row.allocation.density, density, row.name);
    report.cBindings = await page.evaluate(() => window.__allied.cBuildings.map(window.__allied.buildingSample));
    assert(report.cBindings.every(row => row.identity.endsWith('/' + density)));
    assert(report.cBindings.find(row => row.name === 'YAGGUN').turret.density === density);
    await stage('combined-C-D-LUNR-bindings');
    await startClip(); recording = true;

    // Native forward and reverse deployment, keeping C building art and D mobile art.
    for (const name of arcsOnly ? [] : ['PCV', 'SMIN']) {
        await page.evaluate(name => {
            const d = window.__ra2debug, f = window.__allied, worker = d.game.getConstructionWorker(f.player);
            const building = name === 'PCV' ? 'YACNST' : 'YAREFN';
            const site = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t)
                && worker.canPlaceAt(building, t, { ignoreAdjacent: true }))
                .sort((a, b) => Math.hypot(a.rx - f.center.rx, a.ry - f.center.ry)
                    - Math.hypot(b.rx - f.center.rx, b.ry - f.center.ry))[0];
            if (!site) throw Error('No legal native deployment foundation');
            f.mobile = f.spawn(name, 7, site);
            d.actionsApi.orderUnits([f.mobile.id], 11);
            d.worldInteraction.minimapHandler.panToTile(f.mobile.tile);
            d.actionsApi.orderUnits([f.mobile.id], 10);
        }, name);
        await wait(() => window.__allied.mobile.replacedBy?.isSpawned
            && window.__allied.mobile.replacedBy.buildStatus === 1, 45000);
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            f.deployed = f.mobile.replacedBy; f.cBuildings.push(f.deployed);
            d.worldInteraction.minimapHandler.panToTile(f.deployed.tile);
        });
        await wait(() => window.__allied.buildingSample(window.__allied.deployed).hd);
        if (name === 'SMIN') await wait(() => window.__allied.buildingSample(window.__allied.deployed).turret
            && window.__allied.deployed.slaveMinerTrait.getSlaves().some(s => s.isSpawned
                && window.__allied.sample(s).shpHd), 45000);
        const deployed = await page.evaluate(() => {
            const f = window.__allied;
            return { building: f.buildingSample(f.deployed), workers: f.deployed.slaveMinerTrait?.getSlaves().map(f.sample),
                mobileParts: f.sample(f.mobile).parts };
        });
        assert.equal(deployed.building.name, name === 'PCV' ? 'YACNST' : 'YAREFN');
        assert(deployed.building.identity.endsWith('/' + density));
        if (name === 'SMIN') {
            assert.equal(deployed.building.turret.density, density);
            assert(deployed.building.turret.members.includes('smintur.vxl'));
            assert(deployed.workers.some(worker => worker.name === 'SLAV' && worker.shpHd));
        }
        await stage(name + '-native-deployed');
        const colors = [];
        for (const enemy of [true, false]) {
            await page.evaluate(enemy => {
                const d = window.__ra2debug, f = window.__allied;
                d.game.changeObjectOwner(f.deployed, enemy ? f.enemy : f.player);
            }, enemy);
            await page.waitForTimeout(120);
            colors.push(await page.evaluate(() => {
                const f = window.__allied, b = f.deployed;
                return { owner: b.owner.name, body: f.buildingSample(b),
                    workerOwners: b.slaveMinerTrait?.getSlaves().map(s => s.owner.name) };
            }));
        }
        assert.notEqual(colors[0].body.palette, colors[1].body.palette);
        if (name === 'SMIN') assert(colors.every(row => row.workerOwners.every(owner => owner === row.owner)));
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied, worker = d.game.getConstructionWorker(f.player);
            const b = f.deployed;
            const target = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t)
                && Math.hypot(t.rx - b.tile.rx, t.ry - b.tile.ry) >= 4
                && worker.canPlaceAt(b.name, t, { ignoreAdjacent: true }))
                .sort((a, c) => Math.hypot(a.rx - b.tile.rx, a.ry - b.tile.ry)
                    - Math.hypot(c.rx - b.tile.rx, c.ry - b.tile.ry))[0];
            if (!target) throw Error('No legal native redeployment site');
            d.actionsApi.orderUnits([b.id], 0, target.rx, target.ry);
        });
        await wait(() => window.__allied.deployed.replacedBy?.isSpawned);
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            f.mobileAgain = f.deployed.replacedBy; f.actors[f.mobileAgain.id] = f.mobileAgain;
            d.actionsApi.orderUnits([f.mobileAgain.id], 11);
            d.worldInteraction.minimapHandler.panToTile(f.mobileAgain.tile);
        });
        await wait(() => window.__allied.sample(window.__allied.mobileAgain).vxlHd);
        const mobile = await page.evaluate(() => window.__allied.sample(window.__allied.mobileAgain));
        assert(mobile.parts.includes(name === 'SMIN' ? 'smintur.vxl' : 'pcv.vxl'));
        await stage(name + '-native-packed-mobile');
        await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.mobileAgain.id], 10));
        await wait(() => window.__allied.mobileAgain.replacedBy?.isSpawned
            && window.__allied.mobileAgain.replacedBy.buildStatus === 1);
        await wait(() => window.__allied.buildingSample(window.__allied.mobileAgain.replacedBy).hd);
        report.deployments ??= [];
        report.deployments.push({ name, deployed, colors, mobile,
            redeployed: await page.evaluate(() => window.__allied.buildingSample(window.__allied.mobileAgain.replacedBy)) });
    }

    report.controlSelection = [];
    for (const name of ['YAPSYT', 'MIND', 'YURIPR']) {
        await page.evaluate(name => {
            const d = window.__ra2debug, f = window.__allied;
            f.controller = name === 'YAPSYT' ? f.cBuildings.find(b => b.name === name) : f.byName[name];
            f.controller.attackTrait.setDisabled(false);
            f.victim = f.spawn('E2', 3, { rx: f.controller.tile.rx + 3, ry: f.controller.tile.ry }, f.enemy);
            f.victim.attackTrait.setDisabled(true); f.victim.moveTrait.setDisabled(true);
            d.worldInteraction.minimapHandler.panToTile(f.controller.tile);
            d.actionsApi.orderUnits([f.controller.id], 2, f.victim.id);
        }, name);
        await wait(() => window.__allied.victim.owner === window.__allied.player);
        const counts = [];
        for (const mode of ['target', 'both', 'source', 'none']) {
            await page.evaluate(mode => {
                const d = window.__ra2debug, f = window.__allied, s = d.game.unitSelection;
                s.deselectAll();
                if (mode === 'target' || mode === 'both') s.addToSelection(f.victim);
                if (mode === 'source' || mode === 'both') s.addToSelection(f.controller);
            }, mode);
            await page.waitForTimeout(120);
            const count = await page.evaluate(() => window.__allied.countLinks());
            assert.equal(count, mode === 'none' ? 0 : 1, name + '/' + mode); counts.push({ mode, count });
        }
        report.controlSelection.push({ name, counts });
        await page.evaluate(() => window.__allied.controller.attackTrait.setDisabled(true));
    }
    await stage('combined-selection-arcs');
    report.clip = await stopClip('combined-deploy-and-selection'); recording = false;
    report.combinedAllocation = await page.evaluate(() => window.__allied.worldAllocation());
    assert(report.combinedAllocation.total <= report.combinedAllocation.limit);
    assert.equal(report.combinedAllocation.limit, (density === 2 ? 256 : 1280) * 1024 * 1024);
    assert(report.combinedAllocation.cache.bytes + report.combinedAllocation.cache.pendingBytes <= 128 * 1024 * 1024);
    assert(report.combinedAllocation.ui.reservedBytes <= 16 * 1024 * 1024);
    report.lunar = await page.evaluate(() => {
        const d = window.__ra2debug, rule = d.game.rules.getObject('LUNR', 3);
        return { allocation: d.sovietUnitsHd.families.LUNR, techLevel: rule.techLevel,
            buildable: d.localPlayer.production.isAvailableForProduction(rule),
            uiRevision: d.uiArt.revision, uiEntries: d.uiArt.manifest.assets.length };
    });
    assert.equal(report.lunar.techLevel, 11); assert.equal(report.lunar.buildable, false);
    assert.equal(report.lunar.uiEntries, 490);
    for (const cameo of ['lunricon', 'lunruico']) {
        await page.evaluate(cameo => {
            const d = window.__ra2debug, m = d.gameScreen.hud.sidebarCard.props.sidebarModel;
            m.tabs[2].items = [{ target: { type: 0, rules: d.game.rules.getObject('LUNR', 3) },
                cameo, disabled: true, progress: 0, quantity: 0, status: 0 }];
            m.tabs[2].disabled = false; m.tabs[2].needsUpdate = true; m.activeTabId = 2;
        }, cameo);
        await page.waitForFunction(cameo => {
            const c = window.__ra2debug.gameScreen.hud.sidebarCard, b = c.slotObjects[0].builder;
            return c.publishedItems?.[0]?.cameo === cameo && b.isHdActive
                && b.frames[b.native.getFrame()].id === cameo + '.shp';
        }, cameo);
    }
    // Next-match HD Off exercises genuine world disposal and atomic Original binding.
    await page.evaluate(() => {
        const d = window.__ra2debug;
        clearInterval(window.__allied.timer); window.__combinedOldDemand = d.sovietUnitsHd;
        window.__combinedOldGame = d.game; d.generalOptions.graphics.hdEnabled.value = false;
    });
    await page.evaluate(async () => { await window.r.reset; });
    await wait(() => window.__ra2debug.game?.status === 1 && window.__ra2debug.game !== window.__combinedOldGame, 90000);
    report.teardown = await page.evaluate(() => ({ releasedBytes: window.__combinedOldDemand.gpuBytes,
        oldFamilies: Object.keys(window.__combinedOldDemand.families), uiBytes: window.__ra2debug.uiArt.metrics().reservedBytes }));
    assert.equal(report.teardown.releasedBytes, 0); assert.equal(report.teardown.uiBytes, 0);
    await page.evaluate(() => {
        window.__installAlliedFixtures(); const f = window.__allied;
        f.originalControl = f.spawn('YURIPR', 3); f.originalControl.attackTrait.setDisabled(true);
    });
    await wait(() => window.__allied.sample(window.__allied.originalControl).frame !== undefined);
    assert.equal(await page.evaluate(() => window.__allied.sample(window.__allied.originalControl).shpHd), false);
    await stage('combined-teardown-Original');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.consoleErrors, []);
} catch (error) { failure = error; }
finally {
    if (recording) await stopClip('partial-failure').catch(() => {});
    await close(failure);
}
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, density, allocation: report.combinedAllocation, teardown: report.teardown }));
