import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/yuri-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const density = Number(process.argv.find(x => x.startsWith('--density='))?.split('=')[1] ?? 4);
const snow = process.argv.includes('--snow');
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
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        f.buildings = {};
        f.detailSize = [1400, 1000];
        f.focus = actor => {
            if (f.actor) d.renderableManager.getRenderableByGameObject(f.actor).selectionModel.setSelected(false);
            f.actor = actor;
            d.renderableManager.getRenderableByGameObject(actor).selectionModel.setSelected(true);
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
        for (const name of ['YAPOWR', 'YAREFN', 'YABRCK', 'YATECH', 'YAWEAP', 'GAWEAP'])
            f.buildings[name] = f.building(name);
    });
    await page.waitForFunction(density => !density || ['YAWEAP', 'GAWEAP'].every(name =>
        window.__allied.sampleBuilding(window.__allied.buildings[name]).hd), density, { timeout: 90000 });
    report.initial = await page.evaluate(() => Object.values(window.__allied.buildings).map(window.__allied.sampleBuilding));
    for (const [factory, unit, damaged] of [['YAWEAP', 'YTNK', false], ['YAWEAP', 'YTNK', true],
        ['YAWEAP', 'DISK', true], ['GAWEAP', 'MTNK', false], ['GAWEAP', 'MTNK', true]]) {
        const label = `${factory}-${unit}-${damaged ? 'damaged' : 'healthy'}`;
        await page.evaluate(({ factory, damaged }) => {
            const f = window.__allied; f.focus(f.buildings[factory]);
            if (damaged) f.buildings[factory].healthTrait.health = 25;
        }, { factory, damaged });
        await page.waitForTimeout(150);
        await stage(label + '-idle-before');
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
        await stage(label + '-delivery');
        await page.waitForTimeout(2500);
        await stopClip(label + '-delivery');
        report[label] = await page.evaluate(() => {
            clearInterval(window.__allied.factoryTimer);
            return { trace: window.__allied.delivery, product: window.__allied.sample(window.__allied.product) };
        });
        for (const [phase, data] of Object.entries(await page.evaluate(() => window.__allied.deliveryFrames)))
            await fs.writeFile(path.join(out, `${label}-phase-${phase}.png`), Buffer.from(data.split(',')[1], 'base64'));
        for (const [layer, data] of Object.entries(await page.evaluate(() => window.__allied.layerDiagnostics)))
            await fs.writeFile(path.join(out, `${label}-${layer}.png`), Buffer.from(data.split(',')[1], 'base64'));
        await page.waitForFunction(() => window.__ra2debug.renderableManager
            .getRenderableByGameObject(window.__allied.actor).currentAnimType === 0);
        await stage(label + '-idle-after');
        report[label].after = await page.evaluate(() => window.__allied.sampleBuilding(window.__allied.actor));
        assert(report[label].after.animations.filter(a => [7, 8].includes(a.type)).every(a => a.layers.every(l => !l.visible)));
        const healthPose = damaged ? 1 : 0;
        for (const sample of report[label].trace.filter(x => [7, 8].includes(x.state)))
            for (const animation of sample.animations.filter(a => a.type === sample.state))
                for (const layer of animation.layers.filter(l => l.visible)) assert.equal(layer.frame, healthPose);
        assert(report[label].trace.some(x => x.state === (unit === 'DISK' ? 8 : 7)), 'Native delivery state must be observed');
    }
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.trainer.setEnabled(true);
        if (!d.trainer.send({ type: 'effect', effect: 'technology', enabled: true })) throw Error('Trainer command rejected');
    });
    const cameosReady = () => {
        const card = window.__ra2debug.gameScreen.hud.sidebarCard;
        return card.publishedItems.length > 0 && card.publishedItems.every((_, i) => card.slotObjects[i].isHdArtwork);
    };
    await page.waitForFunction(cameosReady);
    report.uiBeforePause = await page.evaluate(() => window.__ra2debug.uiArt.metrics());
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.waitForTimeout(500);
    await page.waitForFunction(() => !document.querySelector('canvas[data-ui-art="pause-yuri"]').hidden);
    await stage('Yuri-pause');
    assert.equal(await page.locator('[data-pause-faction="yuri"]').count(), 1);
    report.uiDuringPause = await page.evaluate(() => window.__ra2debug.uiArt.metrics());
    report.pauseSource = await page.locator('canvas[data-ui-art="pause-yuri"]').getAttribute('data-pause-source');
    assert.equal(report.pauseSource, 'yuri-pause-emblem-hd-v2.png');
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.controller.pushScreen(4));
    await page.waitForTimeout(300); await stage('Yuri-pause-options');
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.controller.popScreen());
    await page.waitForTimeout(300);
    assert.equal(await page.locator('canvas[data-ui-art="pause-yuri"]').evaluate(c => c.width), 1322);
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.close());
    await page.waitForTimeout(300);
    await page.waitForFunction(cameosReady);
    report.uiAfterPause = await page.evaluate(() => window.__ra2debug.uiArt.metrics());
    assert.equal(report.uiAfterPause.domCanvasBytes, report.uiBeforePause.domCanvasBytes);
    assert(report.uiAfterPause.reservedBytes <= 16 * 1024 * 1024);
    assert.equal(await page.locator('canvas[data-ui-art="pause-yuri"]').evaluate(c=>c.width),1);
    await page.evaluate(()=>window.__ra2debug.gameScreen.menu.open());
    await page.waitForFunction(()=>document.querySelector('canvas[data-ui-art="pause-yuri"]').width===1322);
    assert.equal(await page.locator('canvas[data-ui-art="pause-yuri"]').evaluate(c=>getComputedStyle(c).filter),'brightness(0.5)');
    await page.evaluate(()=>window.__ra2debug.gameScreen.menu.close());
    await page.waitForTimeout(500);await stage('Yuri-sidebar-return');
    assert(report.uiDuringPause.reservedBytes <= 16 * 1024 * 1024);
    {
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
