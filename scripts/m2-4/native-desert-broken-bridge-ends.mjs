// Observe all four Desert bridge ends produced by native destruction on the original map.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
import { installNativeObjectBindings } from '../m2/official-maps/native-object-bindings.mjs';

const [stage, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const original = process.argv.includes('--original');
process.argv.push('--map=deathvalleygirl.map', '--bot-slot=1');
const session = await startSession(stage, output, 'yr', false, async ({ page }) => {
    await page.evaluate(({ density, original }) => {
        const options = window.__ra2debug.generalOptions.graphics;
        options.hdEnabled.value = !original;
        options.hdDensity.value = density;
    }, { density, original });
});
let failure;
try {
    const { page, report } = session;
    await installNativeObjectBindings(page);
    await page.evaluate(async () => {
        const options = window.__ra2debug.generalOptions.graphics;
        options.renderResolution.value = '720p';
        await new Promise(resolve => setTimeout(resolve, 100));
        options.renderResolution.value = '1080p';
    });
    await page.waitForFunction(() => window.__ra2debug.renderer.renderer.domElement.height === 1080);
    report.disclosure = 'Original deathvalleygirl.map, unchanged native rules and placements. Controlled map reveal/stopped AI; native repair-hut demolition produces all four broken ends. No overlay, bridge, source map or source archive is added or edited.';
    report.density = original ? 1 : density;
    report.initial = await page.evaluate(() => {
        const d = window.__ra2debug;
        const heads = d.game.getWorld().getAllObjects().filter(o => /^LOBRDG(19|21|23|25)$/.test(o.name));
        return { sourceSha256: d.game.officialSkirmishSourceSha256,
            heads: heads.map(window.__m23Binding), tick: d.game.currentTick };
    });
    assert.deepEqual([...new Set(report.initial.heads.map(o => o.name))].sort(), ['LOBRDG19', 'LOBRDG21', 'LOBRDG23', 'LOBRDG25']);
    report.demolitions = await page.evaluate(() => {
        const d = window.__ra2debug;
        const huts = d.game.getWorld().getAllObjects().filter(o => o.cabHutTrait);
        const handled = new Set();
        const actions = [];
        for (const hut of huts) {
            const pieces = hut.cabHutTrait.getBridgePieces();
            if (!pieces?.some(p => /^LOBRDG\d+$/.test(p.obj.name))) continue;
            const key = pieces.map(p => p.obj.id).sort().join(',');
            if (handled.has(key) || !pieces.some(p => !p.obj.isDestroyed)) continue;
            handled.add(key);
            actions.push({ hut: hut.id, tile: [hut.tile.rx, hut.tile.ry], sourcePieces: pieces.map(p => window.__m23Binding(p.obj)) });
            hut.cabHutTrait.demolishBridge(d.game, { player: d.localPlayer });
        }
        return actions;
    });
    assert(report.demolitions.length > 0);
    await page.waitForTimeout(500);
    report.brokenEnds = await page.evaluate(() => {
        const d = window.__ra2debug;
        return d.game.getWorld().getAllObjects().filter(o => /^LOBRDG(20|22|24|26)$/.test(o.name)).map(window.__m23Binding);
    });
    assert.deepEqual([...new Set(report.brokenEnds.map(o => o.name))].sort(), ['LOBRDG20', 'LOBRDG22', 'LOBRDG24', 'LOBRDG26']);
    for (const end of report.brokenEnds) {
        const initial = report.initial.heads.find(o => o.id === end.id);
        assert(initial && JSON.stringify(initial.tile) === JSON.stringify(end.tile));
        assert.equal(!!end.hd, !original);
        if (!original) assert(end.hd.includes(`/DESERT/tiles/${density}`));
    }
    report.captureRoute = [];
    for (const name of ['LOBRDG20', 'LOBRDG22', 'LOBRDG24', 'LOBRDG26']) {
        const end = report.brokenEnds.find(o => o.name === name);
        await page.evaluate(id => {
            const d = window.__ra2debug;
            const object = d.game.getWorld().getAllObjects().find(o => o.id === id);
            d.worldInteraction.minimapHandler.panToTile(object.tile);
        }, end.id);
        await page.waitForTimeout(160);
        const png = await page.evaluate(() => {
            const d = window.__ra2debug;
            d.renderer.render();
            return d.renderer.renderer.domElement.toDataURL().split(',')[1];
        });
        await fs.writeFile(path.join(output, `${name}-framebuffer.png`), Buffer.from(png, 'base64'));
        report.captureRoute.push({ name, id: end.id, tile: end.tile, file: `${name}-framebuffer.png` });
    }
    report.graphics = await page.evaluate(() => {
        const d = window.__ra2debug, canvas = d.renderer.renderer.domElement;
        return { output: [canvas.width, canvas.height], tick: d.game.currentTick,
            glError: d.renderer.renderer.getContext().getError(), environment: d.environmentHd,
            terrain: d.terrainHd, hdEnabled: d.generalOptions.graphics.hdEnabled.value };
    });
    assert(report.graphics.tick > report.initial.tick);
    assert.equal(report.graphics.glError, 0);
    if (original) {
        assert.equal(report.graphics.hdEnabled, false);
        assert.equal(report.graphics.environment.worldChargeBytes, 0);
        assert.equal(report.graphics.terrain.worldChargeBytes, 0);
    } else assert.equal(report.graphics.environment.families['desert-bridge-low-wood'].status, 'PUBLISHED_COMPLETE_FAMILY');
    assert.equal(report.errors.length, 0);
    report.brokenEndStatus = 'PASS_FOUR_ORIGINAL_NATIVE_HEADS_AND_DESTRUCTION_TRANSITIONS';
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
