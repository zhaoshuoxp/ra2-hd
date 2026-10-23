// Review-only native-state probe; excluded from normal application payloads.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const output = process.env.M16_OUTPUT ?? '.artifacts/m1-6a/runtime-original-v1';
await fs.mkdir(output, { recursive: false });
const origin = 'http://127.0.0.1:4286';
const report = { status: 'RUNNING', errors: [], samples: [], fixture: 'Natural Soviet construction; frozen render-only state sweep' };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    await context.route('**/*', route => route.request().url().startsWith(origin) || /^(data|blob):/.test(route.request().url()) ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.stack));
    await page.goto(`${origin}/?conscript-hd=4`);
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 60000 });
    await page.evaluate(() => {
        Object.entries({ _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '1',
            _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '3;10000;10;1;1;0;1;0;;0;1;0;0',
            _r_lastBots: JSON.stringify([null, null, null, { d: 0, c: 0, co: 2, s: 3, t: 1 }, null, null, null, null]) })
            .forEach(([k, v]) => localStorage.setItem(k, v));
    });
    await page.getByText('Offline Skirmish', { exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.renderResolution.value = '4k'; window.__ra2debug.skirmishLobby.startGame(1700000000000); });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    await page.evaluate(() => { const d = window.__ra2debug; d.actionsApi.orderUnits([d.localPlayer.getOwnedObjects().find(o => /MCV$/.test(o.name)).id], 10); });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(o => o.name === 'NACNST'));
    await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(0, 2, 'NAPOWR', 1));
    await page.waitForFunction(() => window.__ra2debug.localPlayer.production.getQueue(0).status === 3, undefined, { timeout: 90000 });
    report.placement = await page.evaluate(() => {
        const d = window.__ra2debug, yard = d.localPlayer.getOwnedObjects().find(o => o.name === 'NACNST'), candidates = [];
        for (let dx = -8; dx <= 8; dx++)
            for (let dy = -8; dy <= 8; dy++)
                candidates.push({ rx: yard.tile.rx + dx, ry: yard.tile.ry + dy });
        candidates.sort((a, b) => ((a.rx - yard.tile.rx + 3) ** 2 + (a.ry - yard.tile.ry - 3) ** 2) - ((b.rx - yard.tile.rx + 3) ** 2 + (b.ry - yard.tile.ry - 3) ** 2));
        const tile = candidates.find(t => d.game.getConstructionWorker(d.localPlayer).canPlaceAt('NAPOWR', t, { normalizedTile: true }));
        if (!tile)
            throw Error('No legal NAPOWR placement');
        d.actionsApi.placeBuilding('NAPOWR', tile.rx, tile.ry);
        return tile;
    });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(o => o.name === 'NAPOWR'));
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.gameScreen.gameAnimationLoop.stop();
        const plant = d.localPlayer.getOwnedObjects().find(o => o.name === 'NAPOWR');
        window.__napowr = d.renderableManager.getRenderableByGameObject(plant);
        window.__napowrPlant = plant;
        window.__captureNapowr = ({ body = 0, active = 0, buildup, mode = '4k', hide = false }) => {
            const r = window.__napowr, bodyModel = r.mainObj;
            d.generalOptions.graphics.renderResolution.value = mode;
            for (const models of r.animObjects.values())
                for (const model of models)
                    model.get3DObject().visible = false;
            bodyModel.get3DObject().visible = !hide && buildup === undefined;
            bodyModel.setFrame(body);
            const activeModel = [...r.animObjects].find(([k]) => k === 2)?.[1][0];
            if (activeModel) {
                activeModel.get3DObject().visible = !hide && buildup === undefined;
                activeModel.setFrame(active);
            }
            if (buildup !== undefined) {
                const m = r.animObjects.get(5)[0];
                m.get3DObject().visible = !hide;
                m.setFrame(buildup);
            }
            d.worldScene.scene.updateMatrixWorld(true);
            d.worldScene.meshBatchManager.updateMeshes();
            d.worldScene.meshBatchManager.processRenderQueue();
            d.renderer.render();
            const renderer = d.renderer.renderer, canvas = renderer.domElement, gl = renderer.getContext();
            const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
            gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const c = document.createElement('canvas');
            c.width = gl.drawingBufferWidth;
            c.height = gl.drawingBufferHeight;
            const ctx = c.getContext('2d');
            const im = ctx.createImageData(c.width, c.height);
            for (let y = 0; y < c.height; y++)
                im.data.set(pixels.subarray((c.height - 1 - y) * c.width * 4, (c.height - y) * c.width * 4), y * c.width * 4);
            ctx.putImageData(im, 0, 0);
            const mesh = bodyModel.getShapeMesh(), p = mesh.geometry.attributes.position, v = d.worldScene.viewport, points = [];
            for (let i = 0; i < p.count; i++) {
                const q = d.worldScene.camera.position.clone().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).project(d.worldScene.camera);
                points.push([v.x + (q.x + 1) * v.width / 2, v.y + (1 - q.y) * v.height / 2]);
            }
            return { png: c.toDataURL(), tick: d.game.currentTick, mode, css: [canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height], buffer: [c.width, c.height], dpr: devicePixelRatio, ratio: renderer.getPixelRatio(), logical: [d.renderer.width, d.renderer.height], camera: d.worldScene.camera.projectionMatrix.toArray(), points, glError: gl.getError(), models: [['body', bodyModel], ...[...r.animObjects].flatMap(([type, ms]) => ms.map(m => [type, m]))].map(([type, m]) => ({ type, frame: m.builder.getFrame(), offset: m.builder.frameOffset, visible: m.get3DObject().visible, size: m.builder.shpFile.filename, vertices: Array.from(m.getShapeMesh().geometry.attributes.position.array) })) };
        };
    });
    console.log('Scene ready');
    if (process.env.M16_CANDIDATE === '1') {
        const { captureCandidate } = await import('./runtime-candidate.mjs');
        await captureCandidate(page, output, report);
    }
    else {
        for (const mode of ['1080p', '4k'])
            for (const [name, state] of [['normal', { body: 0, active: 0 }], ['active-09', { body: 0, active: 9 }], ['damaged', { body: 1, active: 19 }], ['critical', { body: 2, active: 28 }], ['buildup-12', { buildup: 12 }], ['empty', { hide: true }]]) {
                const sample = await page.evaluate(s => window.__captureNapowr(s), { ...state, mode });
                await fs.writeFile(`${output}/${name}-${mode}.png`, Buffer.from(sample.png.split(',')[1], 'base64'));
                delete sample.png;
                report.samples.push({ name, ...sample });
            }
        // Every native visible body, activity, and construction state is retained.
        for (const [role, count] of [['body', 3], ['active', 38], ['buildup', 26]])
            for (let n = 0; n < count; n++) {
                const state = role === 'body' ? { body: n, active: n ? 19 : 0 } : role === 'active' ? { body: n < 19 ? 0 : 1, active: n } : { buildup: n };
                const sample = await page.evaluate(s => window.__captureNapowr(s), { ...state, mode: '1080p' });
                await fs.writeFile(`${output}/sweep-${role}-${n}.png`, Buffer.from(sample.png.split(',')[1], 'base64'));
                delete sample.png;
                report.samples.push({ name: `sweep-${role}-${n}`, ...sample });
            }
    }
    assert.deepEqual(report.errors, []);
    assert(report.samples.every(s => s.glError === 0));
    report.status = 'PASS_DIAGNOSTIC_RENDER_REVIEW';
}
catch (error) {
    report.status = 'FAIL';
    report.failure = error.stack;
    throw error;
}
finally {
    await fs.writeFile(`${output}/result.json`, JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
