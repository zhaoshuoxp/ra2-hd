// Incremental density checks in the exact package; no legacy acceptance replay.
import assert from 'node:assert/strict';
import { startSession } from '../allied-units/desktop-session.mjs';

const [receipt, output, edition = 'yr', theater = 'temperate'] = process.argv.slice(2);
const s = await startSession(receipt, output, edition, theater === 'snow');
let failure;
try {
    await s.page.evaluate(edition => {
        const f = window.__allied;
        const names = ['GAGAP', 'GAWALL', 'GAPILL', 'GAAIRC', 'GASPYSAT', 'ATESLA',
            'GADEPT', 'GAOREP', 'GAWEAT', 'NASAM', 'GAPOWR', 'NAHAND', 'NAREFN',
            'NAWEAP', 'NACNST', 'NAYARD', 'NALASR', 'NAFLAK', 'TESLA', 'NAIRON'];
        if (edition === 'yr') names.push('GAROBO', 'NAINDP', 'NABNKR');
        f.buildings = names.map((name, i) => f.building(name, { rx: f.center.rx + (i % 5) * 9, ry: f.center.ry + Math.floor(i / 5) * 9 }));
        for (const name of ['SPY', 'ADOG', 'SHK', 'IVAN', 'DESO', 'FLAKT', 'DOG', 'SENGINEER']) f.spawn(name, 3);
        for (const name of ['HARV', 'SMCV', 'HTK', 'APOC', 'TTNK', 'DTRUCK']) f.spawn(name, 7);
    }, edition);
    await s.page.waitForFunction(() => {
        const d = window.__ra2debug, f = window.__allied;
        return f.buildings.every(u => !!d.renderableManager.getRenderableByGameObject(u)?.mainObj?.builder.hdOverride)
            && ['SPY', 'ADOG'].every(n => d.sovietUnitsHd.families[n]?.status === 'READY');
    }, undefined, { timeout: 60000 });
    s.report.bindings = await s.page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied, w = d.worldView;
        return f.buildings.map(u => {
            const r = d.renderableManager.getRenderableByGameObject(u);
            return { name: u.name, identity: r.mainObj.builder.hdOverride.identity,
                report: w.sovietBuildingsHd?.[u.name]?.report ?? d.sovietUnitsHd.families[u.name],
                turret: !!r.buildingTurretHd };
        });
    });
    s.report.eager = await s.page.evaluate(() => Object.fromEntries(Object.entries(window.__ra2debug.worldView.sovietBuildingsHd)
        .map(([name, family]) => [name, family.report])));
    for (const [name, r] of Object.entries(s.report.eager)) {
        if (['NAHAND', 'NAREFN', 'NAWEAP', 'NACNST', 'NAYARD', 'NALASR', 'NAFLAK', 'TESLA', 'NAIRON', 'NAINDP', 'NABNKR'].includes(name))
            assert.equal(r.density, 4, name + ': ' + JSON.stringify(r));
    }
    for (const name of ['GAAIRC', 'NASAM', 'NAIRON', 'NAWEAP', 'GAPOWR', 'NAYARD']) {
        await s.page.evaluate(name => {
            const f = window.__allied, d = window.__ra2debug;
            f.actor = f.buildings.find(u => u.name === name);
            d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        }, name);
        await s.page.waitForTimeout(200);
        await s.stage(name);
    }
    await s.page.evaluate(() => {
        const f = window.__allied, d = window.__ra2debug;
        for (const u of Object.values(f.actors)) d.actionsApi.orderUnits([u.id], 0, u.tile.rx + 3, u.tile.ry);
    });
    s.report.live = await s.page.evaluate(async () => {
        const d = window.__ra2debug, startTick = d.game.currentTick;
        const intervals = []; let previous = performance.now();
        for (let i = 0; i < 180; i++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const now = performance.now(); intervals.push(now - previous); previous = now;
        }
        intervals.sort((a, b) => a - b);
        return { samples: intervals.length, medianFrameIntervalMs: intervals[90], p95FrameIntervalMs: intervals[171],
            ticksAdvanced: d.game.currentTick - startTick, contextLost: d.renderer.renderer.getContext().isContextLost(),
            glError: d.renderer.renderer.getContext().getError(), disclosure: 'Live requestAnimationFrame intervals, including display scheduling.' };
    });
    assert(s.report.live.ticksAdvanced > 0);
    assert.equal(s.report.live.glError, 0);
    assert.equal(s.report.live.contextLost, false);
    s.report.demand = await s.page.evaluate(() => window.__ra2debug.sovietUnitsHd.families);
    for (const [name, r] of Object.entries(s.report.demand)) {
        assert(!/FALLBACK|FAIL/.test(r.status), name + ': ' + JSON.stringify(r));
        if (['SPY', 'ADOG', 'GAAIRC', 'NASAM'].includes(name)) assert.equal(r.density, 4, name + ': ' + JSON.stringify(r));
    }
    for (const name of ['SPY', 'ADOG']) {
        await s.page.evaluate(name => {
            const f = window.__allied, d = window.__ra2debug;
            f.actor = Object.values(f.actors).find(u => u.name === name);
            d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        }, name);
        await s.page.waitForTimeout(200);
        await s.stage(name);
    }
} catch (error) { failure = error; console.error(error); }
await s.close(failure);
if (failure) process.exitCode = 1;
