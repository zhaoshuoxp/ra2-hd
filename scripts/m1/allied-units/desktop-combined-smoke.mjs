// Four incremental mixed-content cases in one immutable packaged build.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from './desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
await fs.mkdir(output, { recursive: false });
const cases = [
    ['ra2', false, ['E1', 'TANY', 'AMCV', 'MTNK', 'CMIN']],
    ['yr', false, ['GGI', 'JUMPJET', 'FV', 'BFRT', 'ROBO']],
    ['ra2', true, ['GHOST', 'CLEG', 'SPY', 'SNIPE', 'MGTK', 'SREF']],
    ['yr', true, ['ADOG', 'ENGINEER', 'CCOMAND', 'PTROOP', 'CIVAN', 'TNKD']],
];
const report = { status: 'RUNNING', cases: [] };
for (const [edition, snow, names] of cases) {
    const key = edition + (snow ? '-snow' : '-temperate');
    const session = await startSession(receipt, path.join(output, key), edition, snow);
    const { page, stage, close } = session;
    let failure;
    try {
        assert.equal(await page.evaluate(() => window.__ra2debug.theater.type), snow ? 4 : 1);
        await page.evaluate(names => {
            const f = window.__allied;
            f.buildingControls = [f.building('GAPOWR'), f.building('NAPOWR')];
            if (names.includes('ROBO')) f.building('GAROBO');
            const vehicles = new Set(['AMCV', 'MTNK', 'CMIN', 'FV', 'BFRT', 'ROBO', 'MGTK', 'SREF', 'TNKD']);
            f.combined = names.map(name => f.spawn(name, vehicles.has(name) ? 7 : 3));
            f.controls = [f.spawn('E2', 3), f.spawn('TTNK', 7)];
            window.__ra2debug.worldInteraction.minimapHandler.panToTile(f.center);
        }, names);
        await page.waitForFunction(() => {
            const f = window.__allied;
            return f.buildingControls.every(unit => window.__ra2debug.renderableManager
                .getRenderableByGameObject(unit)?.mainObj?.builder.hdOverride) && [...f.combined, ...f.controls].every(unit => {
                const r = window.__ra2debug.renderableManager.getRenderableByGameObject(unit);
                return !!(r?.shpRenderable?.builder?.hdOverride || r?.conscriptHd || r?.unitVxlHd?.active);
            });
        }, undefined, { timeout: 90000 });
        await stage('combined-hd');
        session.report.buildingControls = await page.evaluate(() => window.__allied.buildingControls.map(unit => {
            const builder = window.__ra2debug.renderableManager.getRenderableByGameObject(unit).mainObj.builder;
            return { name: unit.name, identity: builder.hdOverride.identity, nativeShadow: builder.hasShadow };
        }));
        const allocation = await page.evaluate(() => {
            const d = window.__ra2debug, w = d.worldView, demand = d.sovietUnitsHd;
            const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
                + (w.napowrHd?.report.gpuBytes ?? 0)
                + [...(w.rhinoHd?.parts.values() ?? [])].reduce((n, p) => n + p.bitmap.width * p.bitmap.height * 5
                    + p.palette.image.data.byteLength, 0);
            const eager = Object.entries(w.sovietBuildingsHd).filter(([name]) => !demand.families[name])
                .reduce((n, [, family]) => n + family.report.gpuBytes, 0);
            return { baseline, eager, demand, total: baseline + eager + demand.gpuBytes, limit: 256 * 1024 * 1024 };
        });
        assert(allocation.total <= allocation.limit);
        session.report.allocation = allocation;
        report.cases.push({ key, names, allocationBytes: allocation.total, status: 'PASS' });
    } catch (error) { failure = error; report.cases.push({ key, status: 'FAIL', error: error.stack }); }
    await close(failure);
    if (failure) { report.status = 'FAIL'; break; }
}
if (report.status === 'RUNNING') report.status = 'PASS_FOUR_INCREMENTAL_COMBINED_CASES';
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
if (report.status === 'FAIL') process.exitCode = 1;
console.log(report.status);
