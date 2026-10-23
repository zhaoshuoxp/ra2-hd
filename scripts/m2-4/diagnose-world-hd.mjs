import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [target, output] = process.argv.slice(2);
const density = process.argv.includes('--2x') ? 2 : 4;
const session = await startSession(target, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const g = window.__ra2debug.generalOptions.graphics;
        g.hdEnabled.value = true; g.hdDensity.value = density;
    }, density);
});
const { page, out } = session;
const report = { density, stages: [] };
async function snapshot(label) {
    const state = await page.evaluate(() => {
        const d = window.__ra2debug;
        return { prefs: d.generalOptions.graphics.serialize(), map: d.game.gameOpts.mapName, tick: d.game.currentTick,
            terrain: d.terrainHd.worldChargeBytes, environment: d.environmentHd.worldChargeBytes,
            demand: structuredClone(d.sovietUnitsHd),
            actors: d.localPlayer.getOwnedObjects().filter(o => o.isTechno()).map(o => {
                const r = d.renderableManager.getRenderableByGameObject(o);
                return { id: o.id, name: o.name, body: !!r?.mainObj?.builder?.hdOverride,
                    shp: !!r?.shpRenderable?.builder?.hdOverride, vxl: !!r?.unitVxlHd?.active,
                    main: !!r?.mainObj?.hdOverride, frame: r?.currentAnimType };
            }) };
    });
    report.stages.push({ label, ...state });
    await fs.writeFile(path.join(out, 'diagnosis.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ label, map: state.map, density, budget: state.demand.budget,
        bytes: state.demand.gpuBytes, families: Object.fromEntries(Object.entries(state.demand.families)
            .filter(([, f]) => !['NOT_REQUESTED', 'EVICTED_IDLE'].includes(f.status))) }));
}
try {
    await snapshot('start');
    for (const name of ['GACNST', 'GAPOWR', 'GAPILE', 'GAREFN', 'GAWEAP', 'GAAIRC', 'GATECH', 'NACNST', 'NAHAND', 'NAWEAP']) {
        await page.evaluate(name => window.__allied.building(name), name);
        await page.waitForTimeout(300);
    }
    for (const [name, type] of [['E1', 3], ['ADOG', 3], ['MTNK', 7], ['FV', 7], ['CMIN', 7], ['E2', 3], ['HTNK', 7]])
        await page.evaluate(({ name, type }) => window.__allied.spawn(name, type), { name, type });
    await page.waitForTimeout(5000);
    await snapshot('mixed-base-and-army');
    await page.screenshot({ path: path.join(out, 'mixed-base-and-army.png') });
} catch (error) {
    report.failure = error.stack; await fs.writeFile(path.join(out, 'diagnosis.json'), JSON.stringify(report, null, 2)); throw error;
} finally { await session.app.close(); }
