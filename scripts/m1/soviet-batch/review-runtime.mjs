// Consolidated representative fixture. Never imported by the normal game entry.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve('.artifacts/m1-6b');
const output = path.join(root, process.env.M16B_OUTPUT ?? 'runtime-original-v1');
await fs.mkdir(output, { recursive: false });
const accepted = JSON.parse(await fs.readFile('.artifacts/m1-6a/final-acceptance.json', 'utf8'));
const inventory = JSON.parse(await fs.readFile(path.join(root, 'source-v1/inventory.json'), 'utf8'));
const states = JSON.parse(await fs.readFile(path.join(root, process.env.M16B_STATES ?? 'references-v1/states.json'), 'utf8'));
const profile = path.join(output, 'profile');
await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }));
const report = { exports: process.env.M16B_EXPORTS ?? 'exports-v1', status: 'RUNNING', scope: 'Four-family representative diagnostic only', sourceApp: accepted.app, errors: [], consoleErrors: [], placements: [], families: {} };
const app = await electron.launch({ executablePath: path.join(accepted.app, 'Contents/MacOS/Electron'), cwd: '/private/tmp', env: { ...process.env, RA2_DESKTOP_USER_DATA: profile }, timeout: 60000 });
try {
    const page = await app.firstWindow();
    page.on('pageerror', e => report.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error')
        report.consoleErrors.push(m.text()); });
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    await page.evaluate(() => {
        const g = window.__ra2debug.generalOptions.graphics;
        g.conscriptHd.value = true;
        g.napowrHd.value = true;
        g.rhinoHd.value = true;
        g.powerPlantHd.value = true;
        Object.entries({ _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '6;10000;10;1;1;0;1;0;;0;1;0;0', _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) }).forEach(([k, v]) => localStorage.setItem(k, v));
    });
    await page.getByText('Offline Skirmish', { exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    await page.evaluate(() => { const d = window.__ra2debug; d.actionsApi.orderUnits([d.localPlayer.getOwnedObjects().find(u => /MCV$/.test(u.name)).id], 10); });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === 'NACNST'));
    for (const name of ['NAPOWR', 'NAHAND', 'NAREFN', 'NAWEAP']) {
        await page.evaluate(n => window.__ra2debug.actionsApi.queueForProduction(0, 2, n, 1), name);
        await page.waitForFunction(() => window.__ra2debug.localPlayer.production.getQueue(0).status === 3, undefined, { timeout: 120000 });
        report.placements.push(await page.evaluate(name => {
            const d = window.__ra2debug, y = d.localPlayer.getOwnedObjects().find(u => u.name === 'NACNST'), tiles = [];
            for (let x = -12; x <= 12; x++)
                for (let z = -12; z <= 12; z++)
                    tiles.push({ rx: y.tile.rx + x, ry: y.tile.ry + z });
            const [dx, dz] = ({ NAPOWR: [-4, -2], NAHAND: [-5, 2], NAREFN: [-5, 7], NAWEAP: [5, 5] })[name];
            tiles.sort((a, b) => Math.hypot(a.rx - y.tile.rx - dx, a.ry - y.tile.ry - dz) - Math.hypot(b.rx - y.tile.rx - dx, b.ry - y.tile.ry - dz));
            const tile = tiles.find(t => d.game.getConstructionWorker(d.localPlayer).canPlaceAt(name, t, { normalizedTile: true }));
            if (!tile)
                throw Error(`No legal foundation: ${name}`);
            d.actionsApi.placeBuilding(name, tile.rx, tile.ry);
            return { name, tile, tick: d.game.currentTick };
        }, name));
        await page.waitForFunction(n => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === n), name);
        await page.waitForTimeout(2400);
        console.log('Naturally built', name);
    }
    await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameAnimationLoop.stop(); d.gameScreen.pointer.unlock(); });
    report.acceptedAssets = await page.evaluate(() => { const d = window.__ra2debug; return { napowr: d.napowrHd, conscript: d.conscriptHd, rhino: d.rhinoHd }; });
    await page.evaluate(inventory => {
        const d = window.__ra2debug;
        window.__batchParts = id => {
            const u = d.localPlayer.getOwnedObjects().find(u => u.name === id), r = d.renderableManager.getRenderableByGameObject(u);
            return { u, r, parts: [{ role: 'body', m: r.mainObj }, { role: 'bib', m: r.bib }, ...[...r.animObjects].flatMap(([type, ms]) => ms.map(m => ({ role: String(type), m })))].filter(p => p.m).map(p => ({ ...p, member: inventory.families[id].members.find(m => m.aggregateOffset === p.m.builder.frameOffset).source.member })) };
        };
        window.__captureBatch = ({ id, layers, mode = '4k' }) => {
            const { r, parts } = window.__batchParts(id);
            d.generalOptions.graphics.renderResolution.value = mode;
            for (const p of parts)
                p.m.get3DObject().visible = false;
            for (const m of r.fireObjects)
                m.get3DObject().visible = false;
            for (const [member, frame] of layers) {
                const p = parts.find(p => p.member === member && p.role !== '6');
                if (!p)
                    throw Error(`Missing ${id}/${member}`);
                p.m.setFrame(frame);
                p.m.get3DObject().visible = true;
            }
            d.worldScene.scene.updateMatrixWorld(true);
            d.worldScene.meshBatchManager.updateMeshes();
            d.worldScene.meshBatchManager.processRenderQueue();
            d.renderer.render();
            const rr = d.renderer.renderer, canvas = rr.domElement, gl = rr.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
            const pixels = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d'), im = ctx.createImageData(w, h);
            for (let y = 0; y < h; y++)
                im.data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
            ctx.putImageData(im, 0, 0);
            const v = d.worldScene.viewport, points = [];
            for (const { m } of parts.filter(p => p.m.get3DObject().visible)) {
                const mesh = m.getShapeMesh(), pos = mesh.geometry.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    const p = d.worldScene.camera.position.clone().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(d.worldScene.camera);
                    points.push([v.x + (p.x + 1) * v.width / 2, v.y + (1 - p.y) * v.height / 2]);
                }
            }
            return { png: c.toDataURL(), id, mode, tick: d.game.currentTick, logical: [d.renderer.width, d.renderer.height], css: [canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height], buffer: [w, h], dpr: devicePixelRatio, camera: d.worldScene.camera.projectionMatrix.toArray(), points, glError: gl.getError(), animationSpeed: r.gameSpeed.value,
                parts: parts.map(({ m, role, member }) => ({ role, member, visible: m.get3DObject().visible, frame: m.builder.getFrame(), offset: m.builder.frameOffset, vertices: Array.from(m.getShapeMesh().geometry.attributes.position.array) })),
                materials: parts.filter(p => p.m.get3DObject().visible).map(({ m, role }) => ({ role, type: m.getShapeMesh().material.type, identity: m.builder.hdOverride?.identity ?? null, shadowMap: m.getShadowMesh()?.material.map?.uuid ?? null })) };
        };
    }, inventory);
    if (process.env.M16B_CANDIDATE) {
        const { install } = await import('./review-candidate.mjs');
        await install(page, root);
    }
    for (const id of Object.keys(states)) {
        if (process.env.M16B_FAMILIES && !process.env.M16B_FAMILIES.split(',').includes(id)) {
            const previous = JSON.parse(await fs.readFile(path.join(root, 'runtime-candidate-v1/result.json'), 'utf8'));
            report.families[id] = { ...previous.families[id], reusedFrom: 'runtime-candidate-v1' };
            await fs.cp(path.join(root, 'runtime-candidate-v1', id), path.join(output, id), { recursive: true });
            continue;
        }
        report.families[id] = { status: 'RUNNING', samples: [] };
        const dir = path.join(output, id);
        await fs.mkdir(dir);
        await page.evaluate(id => { const d = window.__ra2debug, { u } = window.__batchParts(id); d.worldInteraction.minimapHandler.panToTile(u.tile); }, id);
        const selected = process.env.M16B_MOTION ? Object.keys(states[id]) : process.env.M16B_CANDIDATE ? ['normal', ({ NAHAND: 'damaged', NAREFN: 'unload', NAWEAP: 'open', NACNST: 'production' })[id]] : Object.keys(states[id]).filter(s => !s.startsWith('buildup'));
        for (const [state, layers] of Object.entries(states[id]).filter(([s]) => selected.includes(s))) {
            for (const mode of (process.env.M16B_MOTION ? ['4k'] : ['1080p', '4k']))
                for (const density of (process.env.M16B_CANDIDATE ? (process.env.M16B_MOTION ? [0, 4] : [0, 2, 4]) : [0])) {
                    if (process.env.M16B_CANDIDATE)
                        await page.evaluate(({ id, state, density }) => window.__setBatchCandidate(id, state, density), { id, state, density });
                    const s = await page.evaluate(args => window.__captureBatch(args), { id, layers, mode });
                    assert.equal(s.glError, 0);
                    assert(s.materials.every(m => density ? m.type === 'HdSpriteMaterial' && m.identity?.includes('REPRESENTATIVE_ONLY') : m.type !== 'HdSpriteMaterial' && !m.identity));
                    const file = `${state}-${mode}-${density || 'original'}.png`;
                    await fs.writeFile(path.join(dir, file), Buffer.from(s.png.split(',')[1], 'base64'));
                    delete s.png;
                    report.families[id].samples.push({ ...s, state, density: density || 1, file });
                }
        }
        if (process.env.M16B_CANDIDATE)
            await page.evaluate(id => window.__setBatchCandidate(id, 'normal', 0), id);
        await page.evaluate(({ id, layers }) => window.__captureBatch({ id, layers }), { id, layers: states[id].normal ?? states[id][selected[0]] });
        report.families[id].status = 'PASS_REPRESENTATIVE_RENDER';
        console.log(id, report.families[id].status);
    }
    if (process.env.M16B_CANDIDATE)
        report.cleanup = await page.evaluate(() => { const rr = window.__ra2debug.renderer.renderer; window.__batchTextures.forEach(t => t.dispose()); return { released: window.__batchTextures.every(t => !rr.properties.get(t).__webglTexture) }; });
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_CONSOLIDATED_REPRESENTATIVE_RENDER';
}
catch (e) {
    report.status = 'FAIL';
    report.failure = e.stack;
    throw e;
}
finally {
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    await app.close();
}
