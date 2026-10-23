import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { startSession } from '../allied-units/desktop-session.mjs';

const original = process.argv.includes('--original'), density = process.argv.includes('--density=2') ? 2 : 4;
const snow = process.argv.includes('--snow'), edition = process.argv.includes('--edition=ra2') ? 'ra2' : 'yr';
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
const s = await startSession(process.argv[2], process.argv[3], edition, snow, async ({ page, report, out }) => {
    report.options = [];
    const target = original ? 'original' : String(density);
    assert.equal(await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdDensity.value), 4);
    for (const selected of ['original', '2', '4', ...(target !== '4' ? [target] : [])]) {
        await page.getByRole('button', { name: locale['hd:menuoptions'], exact: true }).click();
        await page.locator('[data-hd-family="all"]').waitFor();
        assert.equal(await page.locator('[data-hd-family]').count(), 1);
        const models = await page.evaluate(() => window.__ra2debug.mainMenuController.getCurrentScreen().strings.get('STT:GfxModels'));
        assert.equal(await page.locator(`[data-r-tooltip=${JSON.stringify(models)}]`).count(), 0);
        const control = page.locator('[data-hd-family="all"]');
        await control.locator('.select-value').click();
        await control.getByText(selected === 'original' ? 'Original' : `${selected}×`, { exact: true }).click();
        const options = await page.evaluate(() => {
            const g = window.__ra2debug.generalOptions.graphics;
            return { enabled: g.hdEnabled.value, density: g.hdDensity.value, serialized: g.serialize() };
        });
        assert.equal(options.enabled, selected !== 'original');
        if (selected !== 'original') assert.equal(options.density, Number(selected));
        await page.screenshot({ path: path.join(out, `options-${selected}.png`) });
        if (selected === '4') {
            await control.locator('.select-value').click();
            const clip = await page.locator('.general-opts fieldset').first().boundingBox();
            await page.screenshot({ path: path.join(out, 'options-dropdown.png'), clip });
            await control.locator('.select-value').click();
        }
        const back = await page.evaluate(() => window.__ra2debug.mainMenuController.getCurrentScreen().strings.get('GUI:Back'));
        await page.getByRole('button', { name: back, exact: true }).click();
        await page.reload();
        await page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
        const restored = await page.evaluate(() => window.__ra2debug.generalOptions.graphics.serialize());
        assert.equal(restored, options.serialized);
        report.options.push({ selected, ...options, persisted: true, modelsSelectorAbsent: true });
    }
});
let failure;
s.report.consoleErrors = [];
s.page.on('console', message => { if (message.type() === 'error') s.report.consoleErrors.push(message.text().slice(0, 3000)); });
try {
    await s.page.evaluate(source => (0, eval)(source), await fs.readFile('.artifacts/graphics-options-shadow-aa/gpu-fixture.js', 'utf8'));
    s.report.gpuFixture = await s.page.evaluate(() => window.__testShadowCoverage());
    const gpu = s.report.gpuFixture;
    assert.deepEqual(gpu.nearestLevels, [0, 128]); assert(gpu.smoothLevels > 20);
    assert.equal(gpu.smoothMax, 128); assert.equal(gpu.emptyMax, 0);
    assert.equal(gpu.solidCenter, 128); assert.equal(gpu.mergedDifference, 0);
    assert.equal(gpu.fadedMax, 32); assert.equal(gpu.glError, 0);
    s.report.embeddedGpu = await s.page.evaluate(() => window.__testEmbeddedShadow());
    const embedded = s.report.embeddedGpu;
    assert(embedded.blackBodyPreserved); assert(embedded.darkOverlappingBootPreserved); assert(embedded.opaqueBodyPreserved);
    assert(embedded.ownerMaskedBodyPreserved);
    assert(embedded.afterAlphaLevels > embedded.beforeAlphaLevels); assert.equal(embedded.glError, 0);
    s.report.fixture = await s.page.evaluate(edition => {
        const f = window.__allied;
        f.units = ['E1', 'E2', 'TANY', ...(edition === 'yr' ? ['GGI'] : [])].map((name, i) => f.spawn(name, 3,
            { rx: f.center.rx + (i % 2) * 3, ry: f.center.ry + Math.floor(i / 2) * 3 }));
        f.units.push(f.spawn('DRON', 7, { rx: f.center.rx + 6, ry: f.center.ry + 6 }));
        f.buildings = ['GAPILE', 'NAPOWR'].map((name, i) => f.building(name,
            { rx: f.center.rx + 15 + i * 9, ry: f.center.ry + 15 }));
        f.tank = f.spawn('HTNK', 7, { rx: f.center.rx + 10, ry: f.center.ry });
        return [...f.units, ...f.buildings, f.tank].map(u => ({ name: u.name, id: u.id }));
    }, edition);
    await s.page.waitForFunction(original => {
        const d = window.__ra2debug, f = window.__allied;
        return [...f.units, ...f.buildings, f.tank].every(u => {
            const r = d.renderableManager.getRenderableByGameObject(u);
            const b = r?.shpRenderable?.builder ?? r?.mainObj?.builder;
            return !!r && (u.name === 'HTNK' ? original || !!r.rhinoHd
                : !!b && (original || !!b.hdOverride));
        });
    }, original, { timeout: 90000 });
    s.report.bindings = await s.page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        f.setAA = enabled => {
            const materials = new Set();
            d.worldScene.scene.traverse(o => {
                for (const m of [o.material].flat()) if (m?.uniforms?.shadowAntialias) materials.add(m);
            });
            for (const m of materials) m.uniforms.shadowAntialias.value = enabled;
            return materials.size;
        };
        return [...f.units, ...f.buildings].map(u => {
            const r = d.renderableManager.getRenderableByGameObject(u);
            const sprite = r.shpRenderable ?? r.mainObj, b = sprite.builder;
            const shadow = sprite.getShadowMesh();
            const frame = b.shpFile.getImage(b.getFrame());
            return { name: u.name, hd: !!b.hdOverride, embeddedShadow: b.embeddedShadow,
                embeddedPixels: [...frame.imageData].filter(index => index === 12).length,
                identity: b.hdOverride?.identity, shadowMaterial: shadow?.material.type,
                nativeShadowSize: shadow?.material.map.image && [shadow.material.map.image.width, shadow.material.map.image.height],
                position: shadow?.position.toArray(), visible: shadow?.visible };
        });
    });
    for (const row of s.report.bindings) {
        assert.equal(row.hd, !original, row.name); assert.equal(row.shadowMaterial, 'ShpShadowMaterial', row.name);
        if (!original) assert(row.identity.split('|').every(member => member.endsWith('/' + density)), row.name + ': ' + row.identity);
    }
    s.report.comparisons = [];
    const names = ['E1', 'E2', 'TANY', ...(edition === 'yr' ? ['GGI'] : []), 'DRON', 'GAPILE', 'NAPOWR', 'HTNK'];
    for (const name of names) {
        await s.page.evaluate(name => {
            const d = window.__ra2debug, f = window.__allied;
            f.actor = [...f.units, ...f.buildings, f.tank].find(u => u.name === name);
            f.detailSize = f.actor.isBuilding() ? [800, 700] : [340, 280];
            d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        }, name);
        await s.page.waitForTimeout(200);
        await s.page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
        const before = await s.page.evaluate(() => {
            const d = window.__ra2debug;
            return { tick: d.game.currentTick, materials: window.__allied.setAA(false), textures: d.renderer.renderer.info.memory.textures };
        });
        assert(before.materials > 0);
        await s.stage(name + '-before');
        await s.page.evaluate(() => window.__allied.setAA(true));
        await s.stage(name + '-after');
        const after = await s.page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick,
            textures: window.__ra2debug.renderer.renderer.info.memory.textures }));
        assert.equal(after.tick, before.tick); assert.equal(after.textures, before.textures);
        const hash = async tag => createHash('sha256').update(await fs.readFile(path.join(s.out, `${name}-${tag}-detail.png`))).digest('hex');
        const equal = await hash('before') === await hash('after');
        if (name === 'HTNK') assert(equal, 'Unchanged VXL control must be pixel identical');
        else assert(!equal, name + ' shadow must visibly change');
        s.report.comparisons.push({ name, before, after, pixelIdentical: equal });
        await s.page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start());
    }
    s.report.nativeStates = [];
    if (process.argv.includes('--clip')) s.report.video = await s.startClip();
    for (const name of ['E1', ...(edition === 'yr' ? ['GGI'] : [])]) {
        await s.page.evaluate(name => {
            const d = window.__ra2debug, f = window.__allied;
            f.actor = f.units.find(u => u.name === name);
            f.detailSize = [340, 280];
            d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
            d.actionsApi.orderUnits([f.actor.id], 0, f.actor.tile.rx + 3, f.actor.tile.ry);
        }, name);
        await s.page.waitForFunction(() => window.__allied.actor.isMoving);
        await s.stage(name + '-moving');
        await s.page.waitForFunction(() => !window.__allied.actor.isMoving);
        await s.page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 10));
        await s.page.waitForFunction(() => window.__allied.actor.deployerTrait.isDeployed());
        await s.page.waitForTimeout(500);
        await s.stage(name + '-deployed');
        s.report.nativeStates.push(await s.page.evaluate(() => {
            const d = window.__ra2debug, u = window.__allied.actor, r = d.renderableManager.getRenderableByGameObject(u);
            const body = r.shpRenderable.builder, shadow = r.shpRenderable.shadowRenderable.builder;
            return { name: u.name, deployed: u.deployerTrait.isDeployed(), bodyFrame: body.getFrame(), shadowFrame: shadow.getFrame(),
                expectedShadowFrame: r.shpRenderable.shadowRenderable.computeShadowFrameNo(body.getFrame()),
                shadowVisible: r.shpRenderable.getShadowMesh().visible, material: r.shpRenderable.getShadowMesh().material.type,
                embeddedShadow: body.embeddedShadow,
                embeddedPixels: [...body.shpFile.getImage(body.getFrame()).imageData].filter(index => index === 12).length };
        }));
    }
    for (const state of s.report.nativeStates) {
        assert(state.deployed); assert.equal(state.shadowFrame, state.expectedShadowFrame);
        assert(state.shadowVisible || state.embeddedShadow && state.embeddedPixels > 0);
    }
    if (process.argv.includes('--clip')) await s.stopClip('native-infantry-movement-deployment');
    // A dense visible SHP scene measures the added sampling work, rather than the VXL control alone.
    await s.page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        f.pressureUnits = Array.from({ length: 48 }, (_, i) => f.spawn(i % 2 ? 'E1' : 'E2', 3,
            { rx: f.center.rx + i % 8, ry: f.center.ry + Math.floor(i / 8) }));
        d.worldInteraction.minimapHandler.panToTile({ rx: f.center.rx + 4, ry: f.center.ry + 3 });
    });
    await s.page.waitForTimeout(300);
    await s.stage('dense-infantry');
    await s.page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    s.report.performance = await s.page.evaluate(() => {
        const d = window.__ra2debug, gl = d.renderer.renderer.getContext(), results = [];
        const info = d.renderer.renderer.info, autoReset = info.autoReset;
        info.autoReset = false;
        // Alternate same-frame render batches; synchronization includes CPU submission.
        for (const enabled of [false, true, true, false]) {
            window.__allied.setAA(enabled);
            const times = [];
            for (let i = 0; i < 50; i++) {
                info.reset();
                const start = performance.now(); d.renderer.render(); gl.finish();
                if (i >= 10) times.push(performance.now() - start);
            }
            times.sort((a, b) => a - b);
            results.push({ enabled, medianMs: times[20], p95Ms: times[38],
                textures: d.renderer.renderer.info.memory.textures, drawCalls: d.renderer.renderer.info.render.calls });
        }
        info.autoReset = autoReset;
        window.__allied.setAA(true);
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const masks = new Set();
        d.worldScene.scene.traverse(o => {
            for (const m of [o.material].flat()) if (m?.uniforms?.embeddedShadowMap) masks.add(m.uniforms.embeddedShadowMap.value);
        });
        const maskBytes = [...masks].reduce((total, map) => total + map.image.width * map.image.height * 4, 0);
        return { results, reusedNativeMaskTextures: masks.size, nativeMaskBytes: maskBytes,
            glError: gl.getError(), renderer: ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
            buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], contextLost: gl.isContextLost() };
    });
    assert.equal(s.report.performance.glError, 0); assert.equal(s.report.performance.contextLost, false);
    assert.equal(s.report.consoleErrors.length, 0);
} catch (error) { failure = error; console.error(error); }
await s.close(failure);
if (failure) process.exitCode = 1;
