import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/yuri-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const density = Number(process.argv.find(x => x.startsWith('--density='))?.split('=')[1] ?? 4);
const snow = process.argv.includes('--snow');
const diagnosticAllied = process.argv.includes('--diagnostic-allied');
const followup = process.argv.includes('--followup');
const configure = async ({ page }) => page.evaluate(density => {
    const g = window.__ra2debug.generalOptions.graphics;
    g.hdEnabled.value = density > 0;
    if (density) g.hdDensity.value = density;
}, density);
const s = await startSession(receipt, output, 'yr', snow, configure, configure);
const { page, report, stage, close, out, startClip, stopClip } = s;
report.density = density || 'Original';
let failure;
try {
    await page.evaluate(followup => {
        const d = window.__ra2debug, f = window.__allied;
        f.buildings = {};
        f.detailSize = [1400, 1000];
        f.focus = actor => {
            f.actor = actor;
            d.worldInteraction.minimapHandler.panToTile(actor.tile);
        };
        f.sampleBuilding = b => {
            const r = d.renderableManager.getRenderableByGameObject(b);
            return { name: b.name, tick: d.game.currentTick, state: r?.currentAnimType,
                hd: !!r?.mainObj?.builder?.hdOverride,
                animations: r && [...r.animObjects].map(([type, list]) => ({ type,
                    layers: list.map(l => ({ visible: l.get3DObject().visible,
                        frame: l.builder.getFrame(), start: r.animations.get(l).props.start,
                        end: r.animations.get(l).props.end, file: l.builder.shpFile?.filename,
                        flat: l.builder.flat, offset: l.builder.offset })) })) };
        };
        for (const name of followup ? ['YAPOWR', 'GAYARD']
            : ['YAPOWR', 'YAREFN', 'YABRCK', 'YATECH', 'YAWEAP', 'GAWEAP', 'YAYARD', 'GAYARD'])
            f.buildings[name] = f.building(name);
    }, followup);
    await page.waitForFunction(({ density, followup }) => !density || (followup ? ['GAYARD']
        : ['YAWEAP', 'GAWEAP', 'YAYARD', 'GAYARD']).every(name =>
        window.__allied.sampleBuilding(window.__allied.buildings[name]).hd), { density, followup }, { timeout: 90000 });
    report.initial = await page.evaluate(() => Object.values(window.__allied.buildings).map(window.__allied.sampleBuilding));
    for (const name of diagnosticAllied ? [] : followup ? ['GAYARD'] : ['YAYARD', 'GAYARD']) {
        await page.evaluate(name => window.__allied.focus(window.__allied.buildings[name]), name);
        await stage(name + '-idle');
        await startClip();
        await page.waitForTimeout(2500);
        await stopClip(name + '-idle');
        await page.evaluate(name => {
            const d = window.__ra2debug, f = window.__allied;
            d.game.changeObjectOwner(f.buildings[name], f.enemy);
        }, name);
        await page.waitForTimeout(150);
        await stage(name + '-other-owner');
        await page.evaluate(name => {
            const d = window.__ra2debug, f = window.__allied;
            d.game.changeObjectOwner(f.buildings[name], f.player);
        }, name);
    }
    for (const [factory, unit] of [['YAWEAP', 'YTNK'], ['YAWEAP', 'DISK'], ['GAWEAP', 'MTNK']]) {
        if (followup || diagnosticAllied && factory !== 'GAWEAP') continue;
        await page.evaluate(({ factory, unit }) => {
            const d = window.__ra2debug, f = window.__allied;
            f.player.production.setPrimaryFactory(f.buildings[factory]);
            f.focus(f.buildings[factory]); f.delivery = []; f.product = undefined; f.deliveryFrames = {}; f.layerDiagnostics = {};
            d.game.events.subscribe(e => { if (e.type === 44 && e.target.name === unit && e.target.owner === f.player)
                f.product = e.target; });
            f.factoryTimer = setInterval(() => {
                const b = f.buildings[factory], sample = f.sampleBuilding(b);
                f.delivery.push(sample);
                if (![7, 8].includes(sample.state)) return;
                const phase = Math.floor((d.game.currentTick - (f.deliveryStart ??= d.game.currentTick)) / 8);
                if (f.deliveryFrames[phase]) return;
                d.renderer.render();
                const c = d.renderer.renderer.domElement, v = d.worldScene.viewport;
                const r = d.renderableManager.getRenderableByGameObject(b), p = r.getPosition().clone().project(d.worldScene.camera);
                const ratio = c.width / d.renderer.width;
                const crop = document.createElement('canvas'); crop.width = 1100; crop.height = 850;
                crop.getContext('2d').drawImage(c, Math.round((v.x+(p.x+1)*v.width/2)*ratio-550),
                    Math.round((v.y+(1-p.y)*v.height/2)*ratio-480), 1100, 850, 0, 0, 1100, 850);
                f.deliveryFrames[phase] = crop.toDataURL();
                if (unit !== 'DISK' && phase >= 7 && !f.layerDiagnostics.original) {
                    f.layerDiagnostics.original = crop.toDataURL();
                    const layers = [...r.animObjects.get(7), r.bib];
                    for (const [i, layer] of layers.entries()) {
                        const mesh = layer.get3DObject(), visible = mesh.visible; mesh.visible = false;
                        d.worldScene.meshBatchManager?.updateMeshes();
                        d.renderer.render();
                        crop.getContext('2d').drawImage(c, Math.round((v.x+(p.x+1)*v.width/2)*ratio-550),
                            Math.round((v.y+(1-p.y)*v.height/2)*ratio-480), 1100, 850, 0, 0, 1100, 850);
                        f.layerDiagnostics[['without-foreground', 'without-under-door', 'without-bib'][i]] = crop.toDataURL();
                        mesh.visible = visible;
                    }
                    d.worldScene.meshBatchManager?.updateMeshes();
                    d.renderer.render();
                }
            }, 30);
            f.deliveryStart = undefined;
            const rule = d.game.rules.getObject(unit, 7);
            const queue = f.player.production.getQueueForObject(rule);
            d.actionsApi.queueForProduction(queue.type, 7, unit, 1);
        }, { factory, unit });
        await startClip();
        await page.waitForFunction(() => window.__allied.product?.isSpawned, undefined, { timeout: 90000 });
        await stage(factory + '-' + unit + '-delivery');
        await page.waitForTimeout(2500);
        await stopClip(factory + '-' + unit + '-delivery');
        report[factory + '-' + unit] = await page.evaluate(() => {
            clearInterval(window.__allied.factoryTimer);
            return { trace: window.__allied.delivery, product: window.__allied.sample(window.__allied.product) };
        });
        for (const [phase, data] of Object.entries(await page.evaluate(() => window.__allied.deliveryFrames)))
            await fs.writeFile(path.join(out, `${factory}-${unit}-phase-${phase}.png`), Buffer.from(data.split(',')[1], 'base64'));
        for (const [layer, data] of Object.entries(await page.evaluate(() => window.__allied.layerDiagnostics)))
            await fs.writeFile(path.join(out, `${factory}-${unit}-${layer}.png`), Buffer.from(data.split(',')[1], 'base64'));
        assert(report[factory + '-' + unit].trace.some(x => x.state === (unit === 'DISK' ? 8 : 7)), 'Native delivery state must be observed');
    }
    if (!diagnosticAllied && !followup) {
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            f.actor = f.spawn('BSUB', 7, f.buildings.YAYARD.tile); f.focus(f.actor);
            f.origin = f.actor.tile; f.motion = [];
            f.moveTimer = setInterval(() => {
                const r = d.renderableManager.getRenderableByGameObject(f.actor);
                f.motion.push({ ...f.sample(f.actor), position: f.actor.position.worldPosition.toArray(),
                    tilt: r?.tiltObj?.rotation.toArray(), clip: r?.unitVxlHd?.layers[0]?.frames[0]?.batch.material.clippingPlanes });
            }, 30);
        });
        await page.waitForFunction(density => !density || window.__allied.sample(window.__allied.actor).vxlHd, density);
        await stage('BSUB-idle');
        await startClip();
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied, u = f.actor;
            const rule = u.rules;
            const target = d.game.map.tiles.getAll().filter(t => Math.hypot(t.rx-u.tile.rx,t.ry-u.tile.ry) > 5
                && Math.hypot(t.rx-u.tile.rx,t.ry-u.tile.ry) < 8
                && d.game.map.terrain.getPassableSpeed(t,rule.speedType,false,false) > 0)[0];
            if (!target) throw Error('No submarine destination');
            d.actionsApi.orderUnits([u.id], 0, target.rx, target.ry);
        });
        await page.waitForFunction(() => window.__allied.actor.isMoving, undefined, { timeout: 20000 });
        await stage('BSUB-moving');
        await page.waitForTimeout(2200);
        await stopClip('BSUB-moving');
        report.submarine = await page.evaluate(() => { clearInterval(window.__allied.moveTimer); return window.__allied.motion; });
    }
    if (followup) {
        report.radarBefore = await page.evaluate(() => ({ disabled: window.__ra2debug.localPlayer.radarTrait.isDisabled(),
            ui: window.__ra2debug.uiArt.metrics() }));
        assert(report.radarBefore.disabled);
        assert.equal(report.radarBefore.ui.revision, 'yuri-emblem-ui-v1');
        await stage('Yuri-radar-off');
        await page.evaluate(() => {
            const f = window.__allied;
            for (let i = 0; i < 4; i++) f.building('YAPOWR');
            f.radar = f.building('NAPSIS');
        });
        await page.waitForFunction(() => !window.__ra2debug.localPlayer.radarTrait.isDisabled());
        await page.waitForTimeout(1600);
        await stage('Yuri-radar-on');
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            d.game.changeObjectOwner(f.radar, f.enemy);
        });
        await page.waitForFunction(() => window.__ra2debug.localPlayer.radarTrait.isDisabled());
        await page.waitForTimeout(1600);
        await stage('Yuri-radar-return');
    }
    report.uiBeforePause = await page.evaluate(() => window.__ra2debug.uiArt.metrics());
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.waitForTimeout(500);
    await page.waitForFunction(() => !document.querySelector('canvas[data-ui-art="pause-yuri"]').hidden);
    await stage('Yuri-pause');
    assert.equal(await page.locator('[data-pause-faction="yuri"]').count(), process.argv.includes('--baseline') ? 0 : 1);
    report.uiDuringPause = await page.evaluate(() => window.__ra2debug.uiArt.metrics());
    report.pauseSource = await page.locator('canvas[data-ui-art="pause-yuri"]').getAttribute('data-pause-source');
    assert.equal(report.pauseSource, 'yuri-pause-emblem.png');
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.close());
    await page.waitForTimeout(300);
    report.uiAfterPause = await page.evaluate(() => window.__ra2debug.uiArt.metrics());
    assert.equal(report.uiAfterPause.domCanvasBytes, report.uiBeforePause.domCanvasBytes);
    assert.equal(report.uiAfterPause.reservedBytes, report.uiBeforePause.reservedBytes);
    assert(report.uiDuringPause.reservedBytes <= 16 * 1024 * 1024);
    if (!process.argv.includes('--baseline')) {
        await page.evaluate(() => {
            const d = window.__ra2debug;
            d.gameScreen.menu.open(); d.generalOptions.graphics.hdEnabled.value = false;
        });
        await page.waitForTimeout(300);
        await stage('Yuri-pause-original');
        report.pauseOriginal = await page.evaluate(() => ({
            hiddenBitmap: document.querySelector('canvas[data-ui-art="pause-yuri"]').hidden,
            bitmapWidth: document.querySelector('canvas[data-ui-art="pause-yuri"]').width,
            ui: window.__ra2debug.uiArt.metrics(),
        }));
        assert(!report.pauseOriginal.hiddenBitmap);
        assert.equal(report.pauseOriginal.bitmapWidth, 182);
        assert.equal(report.pauseOriginal.ui.domCanvasBytes, 182 * 164 * 4);
        await page.evaluate(density => {
            const d = window.__ra2debug;
            d.gameScreen.menu.close(); d.generalOptions.graphics.hdEnabled.value = density > 0;
        }, density);
    }
    assert.equal(report.errors.length, 0);
} catch (error) { failure = error; }
finally { await close(failure); }
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, output: out }));
