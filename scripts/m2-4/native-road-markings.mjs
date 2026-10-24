import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--2x') ? 2 : 4;
const original = process.argv.includes('--original');
const s = await startSession(receipt, output, process.argv.includes('--ra2') ? 'ra2' : 'yr', false, async ({ page }) => {
    await page.evaluate(({ density, original }) => {
        const g = window.__ra2debug.generalOptions.graphics;
        g.hdEnabled.value = !original; g.hdDensity.value = density;
    }, { density, original });
});
const { page, out, report } = s;
report.disclosure = 'Native original map with fixed seed, revealed shroud and stopped AI. Original source coordinates and camera zoom are preserved; no natural-match claim.';
report.captures = [];
let failure;
try {
    report.initial = await page.evaluate(() => {
        const d = window.__ra2debug;
        clearInterval(window.__allied.timer);
        return { map: d.game.gameOpts.mapName, tick: d.game.currentTick, terrain: structuredClone(d.terrainHd),
            environment: structuredClone(d.environmentHd), actor: structuredClone(d.sovietUnitsHd),
            prepared: { bytes: d.preparedHdCache.bytes, pendingBytes: d.preparedHdCache.pendingBytes },
            glError: d.renderer.renderer.getContext().getError() };
    });
    assert.equal(report.initial.glError, 0);
    if (!original) {
        assert.equal(report.initial.terrain.density, density);
        assert(report.initial.terrain.groups.every(group => group.status === 'PUBLISHED'));
        assert(report.initial.terrain.worldChargeBytes <= report.initial.terrain.budget);
    } else assert.equal(report.initial.terrain.gpuBytes, 0);
    const requested = process.argv.find(arg => arg.startsWith('--members='))?.slice(10).split(',')
        ?? ['proad03', 'proad04', 'proad07', 'proad14', 'proadc13', 'proadc14', 'rough01', 'rough02', 'rough03', 'rough06'];
    let samples = report.initial.terrain.placedBindings.filter(row => requested.includes(row.member.split('.')[0]));
    const reference = process.argv.find(arg => arg.startsWith('--reference='))?.slice(12);
    if (reference) samples = (JSON.parse(await fs.readFile(reference))).captures;
    const selected = [];
    for (const name of requested) {
        const matches = samples.filter(row => row.member.split('.')[0] === name);
        if (!matches.length) continue;
        const center = [0, 1].map(axis => matches.reduce((sum, row) => sum + row.tile[axis], 0) / matches.length);
        selected.push(matches.sort((a, b) => Math.hypot(a.tile[0] - center[0], a.tile[1] - center[1])
            - Math.hypot(b.tile[0] - center[0], b.tile[1] - center[1]))[0]);
    }
    assert(selected.length, 'At least one actual original marking placement must be present');
    for (const sample of selected) {
        if (!original) assert(report.initial.terrain.placedBindings.some(row => row.member === sample.member
            && row.tile[0] === sample.tile[0] && row.tile[1] === sample.tile[1]),
            'A comparison camera must target the same actual native source placement');
        await page.evaluate(tile => {
            const d = window.__ra2debug;
            d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(tile[0], tile[1]));
        }, sample.tile);
        await page.waitForTimeout(160);
        const capture = await page.evaluate(() => {
            const d = window.__ra2debug; d.renderer.render();
            const canvas = d.renderer.getCanvas();
            return { png: canvas.toDataURL('image/png').split(',')[1], size: [canvas.width, canvas.height],
                tick: d.game.currentTick, glError: d.renderer.renderer.getContext().getError() };
        });
        assert.equal(capture.glError, 0);
        const file = sample.member + '.png';
        await fs.writeFile(path.join(out, file), Buffer.from(capture.png, 'base64'));
        delete capture.png;
        report.captures.push({ ...sample, ...capture, file });
    }
    report.status = 'PASS_NATIVE_MAC_MARKING_PLACEMENTS';
    await fs.writeFile(path.join(out, 'captures.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, map: report.initial.map, density, captures: report.captures.length }));
} catch (error) { failure = error; report.failure = error.stack; }
await s.close(failure);
if (failure) throw failure;
