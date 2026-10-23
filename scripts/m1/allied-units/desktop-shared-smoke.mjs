// Exercise changed SHP/VXL archetypes once, with a healthy peer during failure.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from './desktop-session.mjs';

const session = await startSession(process.argv[2], process.argv[3]);
const { page, report, stage, close } = session;
let failure;
try {
    const fixture = async mode => {
        await page.evaluate(() => {
            const f = window.__allied;
            f.probes = [f.spawn('E1', 3), f.spawn('MTNK', 7)];
            window.__ra2debug.worldInteraction.minimapHandler.panToTile(f.center);
        });
        await page.waitForFunction(mode => {
            const d = window.__ra2debug, f = window.__allied;
            return f.probes.every(unit => {
                const s = f.sample(unit);
                if (mode === 'off') return !s.shpHd && !s.vxlHd;
                if (mode === 'failed' && unit.name === 'E1')
                    return d.sovietUnitsHd.families.E1?.status === 'FAILED' && !s.shpHd;
                return s.shpHd || s.vxlHd;
            });
        }, mode, { timeout: 90000 });
        return page.evaluate(() => window.__allied.probes.map(window.__allied.sample));
    };
    report.on = await fixture('on'); await stage('hd-on');
    if (!process.argv.includes('--failure-only')) {
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied, g = d.game;
            f.occlusionDestinations = f.probes.map((unit, index) => {
                d.renderableManager.getRenderableByGameObject(unit).selectionModel.setSelected(true);
                const tile = g.map.tiles.getAll().filter(t => t.occluded && g.map.isWithinBounds(t)
                    && g.map.getTileZone(t) === 0 && !t.rampType
                    && g.map.terrain.getPassableSpeed(t, unit.rules.speedType, unit.isInfantry(), false) > 0
                    && !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()))
                    .sort((a, b) => Math.hypot(a.rx - unit.tile.rx, a.ry - unit.tile.ry)
                        - Math.hypot(b.rx - unit.tile.rx, b.ry - unit.tile.ry))[index];
                if (!tile) throw Error('No native occluded destination');
                d.actionsApi.orderUnits([unit.id], 0, tile.rx, tile.ry); return tile;
            });
        });
        await page.waitForFunction(() => window.__allied.probes.every((unit, index) =>
            !unit.isMoving && unit.tile === window.__allied.occlusionDestinations[index]), undefined, { timeout: 60000 });
        report.selectionOcclusion = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            d.worldInteraction.minimapHandler.panToTile(f.probes[0].tile);
            return f.probes.map(unit => {
                const r = d.renderableManager.getRenderableByGameObject(unit);
                r.selectionModel.setSelected(true);
                return { ...f.sample(unit), occluded: !!unit.tile.occluded, selected: r.selectionModel.isSelected() };
            });
        });
        assert(report.selectionOcclusion.every(s => s.occluded && s.selected && (s.shpHd || s.vxlHd)));
        await stage('selection-occlusion');
        const cdp = await page.context().newCDPSession(page);
        report.resolutions = [];
        for (const [width, height] of [[1920, 1080], [3840, 2160]]) {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
            await page.evaluate(height => {
                window.__ra2debug.generalOptions.graphics.renderResolution.value = height === 2160 ? '4k' : '1080p';
            }, height);
            await page.waitForFunction(({ width, height }) => {
                const c = window.__ra2debug.renderer.renderer.domElement;
                return c.width === width && c.height === height;
            }, { width, height });
            report.resolutions.push(await page.evaluate(() => {
                const d = window.__ra2debug, c = d.renderer.renderer.domElement;
                return { buffer: [c.width, c.height], camera: d.worldScene.camera.position,
                    samples: window.__allied.probes.map(window.__allied.sample) };
            }));
            await stage('hd-' + height);
        }
        report.ownerChange = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            return f.probes.map(unit => {
                const before = unit.owner.color; d.game.changeObjectOwner(unit, f.enemy);
                return { name: unit.name, before, after: unit.owner.color };
            });
        });
        assert(report.ownerChange.every(value => value.before !== value.after));
        await stage('owner-change');
        await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
        report.opacity = [];
        for (const opacity of [1, 0.5, 0, 1]) {
            const result = await page.evaluate(opacity => {
                const d = window.__ra2debug, f = window.__allied;
                const infantry = d.renderableManager.getRenderableByGameObject(f.probes[0]);
                const vehicle = d.renderableManager.getRenderableByGameObject(f.probes[1]);
                infantry.shpRenderable.setOpacity(opacity);
                vehicle.vxlBuilders.forEach(builder => builder.setOpacity(opacity));
                vehicle.unitVxlHd.update();
                d.worldScene.scene.updateMatrixWorld(true); d.worldScene.meshBatchManager.updateMeshes();
                d.renderer.render();
                return { opacity, shpOpacity: infantry.shpRenderable.builder.opacity,
                    shpHd: !!infantry.shpRenderable.builder.hdOverride,
                    vxlHd: vehicle.unitVxlHd.active, shadowOpacity: vehicle.unitVxlHd.shadow.opacity.value,
                    batchedNative: vehicle.unitVxlHd.meshes.some(mesh => mesh.isBatchedMesh),
                    visibleLayers: vehicle.unitVxlHd.layers.flatMap(layer => layer.frames)
                        .filter(frame => frame.batch.visible || frame.translucent.visible).length,
                    gl: d.renderer.renderer.getContext().getError() };
            }, opacity);
            assert.equal(result.shpOpacity, opacity); assert.equal(result.shadowOpacity, opacity);
            assert(result.shpHd && result.gl === 0);
            assert.equal(result.vxlHd, !(opacity < 1 && result.batchedNative));
            assert.equal(result.visibleLayers > 0, opacity > 0 && result.vxlHd);
            report.opacity.push(result); await stage('opacity-' + report.opacity.length);
        }
    }
    const restart = async enabled => {
        await page.evaluate(enabled => {
            clearInterval(window.__allied.timer);
            const d = window.__ra2debug;
            window.__oldAlliedWorld = d.worldView; window.__oldAlliedDemand = d.sovietUnitsHd;
            window.__oldAlliedGame = d.game; d.generalOptions.graphics.hdEnabled.value = enabled;
        }, enabled);
        await page.evaluate(async () => { await window.r.reset; });
        await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
            && window.__ra2debug.game !== window.__oldAlliedGame, undefined, { timeout: 90000 });
        const disposal = await page.evaluate(() => ({ bytes: window.__oldAlliedDemand.gpuBytes,
            disposed: window.__oldAlliedWorld.sovietUnitsHd === undefined }));
        assert.deepEqual(disposal, { bytes: 0, disposed: true });
        await page.evaluate(() => window.__installAlliedFixtures());
        return disposal;
    };
    if (!process.argv.includes('--failure-only')) {
        report.offDisposal = await restart(false); report.off = await fixture('off'); await stage('hd-off');
    }
    const catalog = JSON.parse(await fs.readFile('desktop/allied-unit-contracts.json', 'utf8'));
    const family = JSON.parse(await fs.readFile(path.join(report.resources, catalog.shp.E1.familyPath), 'utf8'));
    const route = '/local-hd/' + family.members[0].sha256 + '/manifest.json';
    await page.evaluate(route => {
        const original = window.fetch;
        window.__alliedOriginalFetch = original; window.__alliedInjected = 0;
        window.fetch = (input, init) => {
            const url = typeof input === 'string' ? input : input.url ?? String(input);
            if (url.endsWith(route)) {
                window.__alliedInjected++;
                return Promise.resolve(new Response('{"corrupt":true}', {
                    status: 200, headers: { 'Content-Type': 'application/json' },
                }));
            }
            return original(input, init);
        };
    }, route);
    report.failureDisposal = await restart(true); report.fallback = await fixture('failed');
    report.injectedRequests = await page.evaluate(() => window.__alliedInjected);
    assert(report.injectedRequests > 0); await stage('failed-family-healthy-peer');
    await page.evaluate(() => { window.fetch = window.__alliedOriginalFetch; });
    report.recoveryDisposal = await restart(true); report.recovered = await fixture('on');
    await stage('restart-recovered');
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
