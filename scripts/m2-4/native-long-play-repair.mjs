import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const original = process.argv.includes('--original');
const s = await startSession(receipt, output, process.argv.includes('--ra2') ? 'ra2' : 'yr', false, async ({ page }) => {
    await page.evaluate(({ density, original }) => {
        const g = window.__ra2debug.generalOptions.graphics;
        g.hdEnabled.value = !original; g.hdDensity.value = density;
    }, { density: process.argv.includes('--2x') ? 2 : 4, original });
});
const { page, out } = s;
const report = { status: 'RUNNING', disclosure: 'Native Mac match with repeated sidebar changes, controlled UI budget pressure and stopped AI; not a natural long match.' };
try {
    report.initial = await page.evaluate(() => {
        const d = window.__ra2debug, theater = d.mapRenderable.tileLayer.theater;
        clearInterval(window.__allied.timer);
        window.__roadBindings = [];
        for (const tile of d.game.map.tiles.getAll()) {
            const source = theater.tileSets.getTile(tile.tileNum);
            for (const file of source?.files ?? []) {
                if (!/road|pave|urb|hyte/i.test(file.filename)) continue;
                const row = { member: file.filename, tile: [tile.rx, tile.ry],
                    bound: file.images.filter(image => theater.terrainHd.bindings.has(image)).length,
                    images: file.images.length };
                if (!window.__roadBindings.some(r => r.member === row.member)) window.__roadBindings.push(row);
            }
        }
        return { map: d.game.gameOpts.mapName, terrain: structuredClone(d.terrainHd),
            environment: structuredClone(d.environmentHd), ui: d.uiArt.metrics(), roads: window.__roadBindings,
            tick: d.game.currentTick, glError: d.renderer.renderer.getContext().getError() };
    });
    await fs.writeFile(path.join(out, 'initial.json'), JSON.stringify(report.initial, null, 2));
    console.log('Terrain:', JSON.stringify({ map: report.initial.map,
        fallback: report.initial.terrain.groups.filter(g => g.status !== 'PUBLISHED'), ui: report.initial.ui }));
    assert.equal(report.initial.ui.enabled, !original, 'The native case must use the selected graphics setting');
    if (original) {
        assert.equal(report.initial.terrain.gpuBytes, 0);
        assert(report.initial.roads.every(road => road.bound === 0));
    } else {
        assert(report.initial.terrain.groups.length > 0);
        assert(report.initial.terrain.groups.every(group => group.status === 'PUBLISHED'));
        assert(report.initial.roads.every(road => road.bound === road.images));
    }
    assert.equal(report.initial.glError, 0);
    await page.screenshot({ path: path.join(out, 'initial.png') });
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        for (const name of ['GACNST', ...Array(6).fill('GAPOWR'), 'GACSPH', 'GAWEAT', 'CAAIRP']) f.building(name);
        d.gameScreen.hud.sidebarModel.activeTabId = 1;
    });
    await page.waitForFunction(() => window.__ra2debug.gameScreen.hud.sidebarCard.publishedItems.length >= 3);
    await page.waitForTimeout(800);
    for (let cycle = 0; cycle < 12; cycle++) {
        await page.evaluate(tab => { window.__ra2debug.gameScreen.hud.sidebarModel.activeTabId = tab; }, cycle % 4);
        await page.waitForTimeout(150);
    }
    await page.evaluate(() => { window.__ra2debug.gameScreen.hud.sidebarModel.activeTabId = 1; });
    await page.waitForFunction(() => window.__ra2debug.gameScreen.hud.sidebarCard.publishedItems.length >= 3);
    const clock = async (phase, label) => {
        await page.evaluate(phase => {
            const d = window.__ra2debug;
            d.localPlayer.superWeaponsTrait.getAll().forEach(sw => {
                sw.chargeTicks = Math.round(sw.rechargeTicks * (1 - phase)); sw.status = 0;
            });
            d.gameScreen.hud.sidebarModel.updateSuperWeapons();
        }, phase);
        await page.waitForTimeout(250);
        const row = await page.evaluate(() => {
            const d = window.__ra2debug, c = d.gameScreen.hud.sidebarCard;
            return { ui: d.uiArt.metrics(), clocks: c.progressOverlays.slice(0, 3).map(o => {
                const b = o.builder;
                return { frame: b.getFrame(), hd: b.isHdActive, opacity: b.opacity,
                    nativeOpacity: b.native?.mesh.material.opacity, nativeDepthWrite: b.native?.mesh.material.depthWrite,
                    nativeTransparent: b.native?.mesh.material.transparent, depthWrite: b.overlay?.material.depthWrite };
            }) };
        });
        await page.screenshot({ path: path.join(out, label + '.png') });
        return row;
    };
    report.clockNormal = await clock(0.35, 'clock-normal');
    report.pressure = await page.evaluate(() => {
        const art = window.__ra2debug.uiArt;
        for (const overlay of window.__ra2debug.gameScreen.hud.sidebarCard.progressOverlays) overlay.setVisible(false);
        window.__pressureOwner = {};
        const available = art.metrics().budget - art.metrics().reservedBytes - (art.metrics().resultHeadroomBytes ?? 0);
        return { available, reserved: art.reserveSurface(window.__pressureOwner, Math.max(0, available - 1000), 0) };
    });
    report.clockPressure = await clock(0.7, 'clock-pressure');
    assert(report.pressure.reserved);
    assert(report.clockPressure.clocks.every(clock => !clock.hd && clock.nativeDepthWrite === false
        && clock.nativeTransparent && clock.nativeOpacity === 0.5));
    report.clockPixels = await page.evaluate(() => {
        const d = window.__ra2debug, c = d.gameScreen.hud.sidebarCard;
        const overlay = c.progressOverlays[0];
        const position = c.getUiObject().get3DObject().getWorldPosition(c.getUiObject().get3DObject().position.clone());
        const source = d.renderer.getCanvas(), scale = source.width / d.renderer.width;
        const image = document.createElement('canvas');
        image.width = Math.round(c.props.slotSize.width * scale);
        image.height = Math.round(c.props.slotSize.height * scale);
        const capture = () => {
            d.renderer.render();
            image.getContext('2d').drawImage(source, Math.round(position.x * scale), Math.round(position.y * scale),
                image.width, image.height, 0, 0, image.width, image.height);
            return { png: image.toDataURL(), pixels: Array.from(image.getContext('2d').getImageData(0, 0, image.width, image.height).data) };
        };
        overlay.setFrame(1); overlay.setVisible(false);
        const clear = capture();
        overlay.setVisible(true); overlay.setFrame(1); overlay.setOpacity(0.5);
        const shaded = capture();
        const ratios = [];
        for (let i = 0; i < clear.pixels.length; i += 4) {
            const a = clear.pixels[i] + clear.pixels[i + 1] + clear.pixels[i + 2];
            const b = shaded.pixels[i] + shaded.pixels[i + 1] + shaded.pixels[i + 2];
            if (a > 150 && b < a * 0.9) ratios.push(b / a);
        }
        ratios.sort((a, b) => a - b);
        return { clear: clear.png, shaded: shaded.png, samples: ratios.length,
            median: ratios[Math.floor(ratios.length / 2)] };
    });
    for (const key of ['clear', 'shaded']) {
        await fs.writeFile(path.join(out, `clock-${key}.png`), Buffer.from(report.clockPixels[key].split(',')[1], 'base64'));
        delete report.clockPixels[key];
    }
    assert(report.clockPixels.samples > 50);
    assert(report.clockPixels.median > 0.3 && report.clockPixels.median < 0.85, 'Native clock must preserve visible cameo detail');
    await page.evaluate(victory => {
        const d = window.__ra2debug, game = d.game;
        for (const player of victory ? game.getCombatants().filter(p => p !== d.localPlayer) : [d.localPlayer])
            for (const o of [...player.getOwnedObjects()]) game.destroyObject(o, undefined, true);
    }, !process.argv.includes('--defeat'));
    await page.waitForSelector('[data-game-result-banner]', { timeout: 15000 });
    await page.waitForTimeout(1200);
    report.result = await page.evaluate(() => {
        const c = document.querySelector('[data-game-result-banner] canvas');
        return { hidden: c.hidden, size: [c.width, c.height], data: { ...c.dataset }, ui: window.__ra2debug.uiArt.metrics() };
    });
    assert.equal(report.result.hidden, false);
    assert.equal(report.result.data.resultState, 'ready');
    assert.equal(report.result.size[0], 872, 'The protected complete 2X result background must fit under pressure');
    assert(report.result.ui.reservedBytes <= report.result.ui.budget);
    await page.screenshot({ path: path.join(out, 'result-pressure.png') });
    console.log('UI:', JSON.stringify({ normal: report.clockNormal, pressure: report.clockPressure, result: report.result }));
    await page.evaluate(() => { window.__ra2debug.uiArt.releaseSurface(window.__pressureOwner); });
    await page.waitForSelector('.score-scene', { timeout: 25000 });
    report.release = await page.evaluate(() => ({ ui: window.__ra2debug.uiArt.metrics(),
        banners: document.querySelectorAll('[data-game-result-banner]').length,
        resultSurfaces: [...window.__ra2debug.uiArt.surfaces.values()].filter(surface => surface.kind === 'result').length }));
    assert.equal(report.release.banners, 0);
    assert.equal(report.release.ui.resultHeadroomBytes, 0);
    assert.equal(report.release.resultSurfaces, 0);
    assert.equal(s.report.errors.length, 0);
    report.status = 'PASS_NATIVE_MAC_ROADS_CLOCK_ALPHA_RESULT_PRESSURE_AND_RELEASE';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack;
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
} finally {
    await fs.writeFile(path.join(out, 'diagnosis.json'), JSON.stringify(report, null, 2));
    await s.app.close();
}
