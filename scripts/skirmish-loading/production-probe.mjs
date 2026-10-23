import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const density = process.argv.includes('--2x') ? 2 : 4;
const side = process.argv.includes('--yuri') ? 'yuri' : process.argv.includes('--soviet') ? 'soviet' : 'allied';
const session = await startSession(process.argv[2], process.argv[3], 'yr', process.argv.includes('--snow'),
    async ({ page }) => page.evaluate(density => window.__ra2debug.generalOptions.graphics.hdDensity.value = density, density),
    async ({ page }) => page.evaluate(side => {
        if (side === 'allied') return;
        const screen = window.__ra2debug.mainMenuController.getCurrentScreen(), form = screen.buildFormProps();
        const name = form.availablePlayerCountries.find(name => side === 'yuri' ? /Yuri/i.test(name) : /Russian/i.test(name));
        if (!name) throw Error('Native lobby country unavailable: ' + side);
        form.onCountrySelect(name, 0);
    }, side));
const { page, report, out } = session;
let failure;
try {
    report.setup = await page.evaluate(side => {
        const d = window.__ra2debug, f = window.__allied;
        const yards = [side === 'yuri' ? 'YACNST' : side === 'soviet' ? 'NACNST' : 'GACNST'].map(name => f.building(name));
        const prerequisites = side === 'yuri' ? [] : side === 'soviet' ? ['NAPOWR', 'NAPOWR', 'NAREFN', 'NAHAND']
            : ['GAPOWR', 'GAPOWR', 'GAREFN', 'GAPILE'];
        for (const name of prerequisites) f.building(name);
        return yards.map(unit => ({ name: unit.name, id: unit.id }));
    }, side);
    await page.waitForFunction(names => {
        const d = window.__ra2debug;
        return names.every(name => d.localPlayer.getOwnedObjects().filter(o => o.name === name)
            .every(o => d.renderableManager.getRenderableByGameObject(o)?.mainObj?.builder.hdOverride));
    }, report.setup.map(unit => unit.name));
    report.production = [];
    for (const name of side === 'yuri' ? ['YAPOWR'] : side === 'soviet' ? ['NAWEAP'] : ['AMRADR']) {
        await page.evaluate(name => {
            const d = window.__ra2debug, rule = d.game.rules.getObject(name, 2), production = d.localPlayer.production;
            if (!production.isAvailableForProduction(rule)) throw Error('Native production unavailable: ' + name);
            const queue = production.getQueueForObject(rule);
            window.__productionLoading = { name, identity: name === 'AMRADR' ? 'GAAIRC' : name,
                start: performance.now(), queueType: queue.type, trace: [], longTasks: [] };
            const sample = () => {
                const probe = window.__productionLoading, state = d.sovietUnitsHd.families[probe.identity];
                probe.trace.push({ time: performance.now() - probe.start, status: state?.status,
                    density: state?.density, queueStatus: queue.status, progress: queue.getFirst()?.progress });
                if (!probe.ready && state?.status === 'READY') probe.ready = performance.now() - probe.start;
            };
            window.__productionLoading.timer = setInterval(sample, 10);
            const observer = window.__productionLoading.observer = new PerformanceObserver(list => {
                for (const task of list.getEntries()) window.__productionLoading.longTasks.push(task.duration);
            });
            observer.observe({ type: 'longtask' });
            d.actionsApi.queueForProduction(queue.type, 2, name, 1);
        }, name);
        await page.waitForFunction(() => window.__productionLoading.ready &&
            window.__ra2debug.localPlayer.production.getQueue(window.__productionLoading.queueType).status === 3,
            undefined, { timeout: 90000 });
        await page.evaluate(name => {
            const d = window.__ra2debug, worker = d.game.getConstructionWorker(d.localPlayer);
            const tile = d.game.map.tiles.getAll().find(tile => d.game.map.isWithinBounds(tile)
                && worker.canPlaceAt(name, tile, { normalizedTile: true }));
            if (!tile) throw Error('No native placement foundation: ' + name);
            window.__productionLoading.placement = performance.now();
            const poll = () => {
                const unit = d.localPlayer.getOwnedObjects().find(unit => unit.name === name);
                const renderable = unit && d.renderableManager.getRenderableByGameObject(unit);
                if (!renderable?.mainObj?.builder) { requestAnimationFrame(poll); return; }
                window.__productionLoading.firstFrame = { name, id: unit.id,
                    identity: renderable.mainObj.builder.hdOverride?.identity,
                    time: performance.now() - window.__productionLoading.placement };
            };
            requestAnimationFrame(poll);
            d.actionsApi.placeBuilding(name, tile.rx, tile.ry);
        }, name);
        await page.waitForFunction(() => window.__productionLoading.firstFrame, undefined, { timeout: 10000 });
        const result = await page.evaluate(() => {
            const probe = window.__productionLoading;
            clearInterval(probe.timer); probe.observer.disconnect();
            const { timer, observer, ...data } = probe;
            return { ...data, cache: { ...window.__ra2debug.preparedHdCache } };
        });
        assert(result.firstFrame.identity?.endsWith('/' + density));
        assert(result.trace.some(entry => entry.status === 'READY' && entry.queueStatus !== 3));
        assert(result.cache.bytes + result.cache.pendingBytes <= 128 * 1024 * 1024);
        report.production.push(result);
    }
    // The expensive shipyard is also requested through the native queue event,
    // then canceled. No fixture placement or altered build completion is used.
    if (side === 'soviet') {
    await page.evaluate(() => {
        const d = window.__ra2debug, rule = d.game.rules.getObject('NAYARD', 2), production = d.localPlayer.production;
        if (!production.isAvailableForProduction(rule)) throw Error('NAYARD unavailable');
        const queue = production.getQueueForObject(rule);
        window.__shipyardStart = performance.now();
        d.actionsApi.queueForProduction(queue.type, 2, 'NAYARD', 1);
    });
    await page.waitForFunction(() => window.__ra2debug.sovietUnitsHd.families.NAYARD.status === 'READY',
        undefined, { timeout: 30000 });
    report.shipyard = await page.evaluate(() => {
        const d = window.__ra2debug, rule = d.game.rules.getObject('NAYARD', 2), queue = d.localPlayer.production.getQueueForObject(rule);
        const result = { readyMs: performance.now() - window.__shipyardStart, queueStatus: queue.status,
            progress: queue.getFirst()?.progress, family: d.sovietUnitsHd.families.NAYARD };
        d.actionsApi.unqueueFromProduction(queue.type, 2, 'NAYARD', 1);
        return result;
    });
    assert.equal(report.shipyard.family.density, density);
    assert.notEqual(report.shipyard.queueStatus, 3);
    }
    await page.screenshot({ path: path.join(out, 'production.png') });
} catch (error) { failure = error; }
finally {
    await page.evaluate(() => {
        clearInterval(window.__productionLoading?.timer);
        window.__productionLoading?.observer?.disconnect();
    }).catch(() => {});
    await session.close(failure);
}
if (failure) throw failure;
await fs.writeFile(path.join(out, 'validation.json'), JSON.stringify({ status: 'PASS_NATIVE_QUEUE_PREPARATION', density,
    production: report.production, shipyard: report.shipyard, worldAllocation: report.worldAllocation }, null, 2) + '\n');
console.log(JSON.stringify({ density, production: report.production.map(probe => ({ name: probe.name,
    readyMs: probe.ready, firstFrame: probe.firstFrame, maxLongTaskMs: Math.max(0, ...probe.longTasks) })),
    shipyard: report.shipyard, world: report.worldAllocation }, null, 2));
