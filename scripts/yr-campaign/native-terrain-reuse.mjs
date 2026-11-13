import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, worldState } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]), density = Number(process.argv[3]);
assert([2, 4].includes(density)); await fs.mkdir(out, { recursive: false });
const ledger = JSON.parse(await fs.readFile('docs/campaign-art/yr-v1/terrain-reused-families.json'));
const report = { status: 'RUNNING', mission: 'sov04dmd.map', density, errors: [], failedResources: [],
    scope: 'Fresh original source, with diagnostic map reveal and renderer camera framing only. Inspect source terrain placements, real HD mesh textures and requested density while simulation, actors, tasks, RNG and objectives remain frozen. Not objective or public lifecycle acceptance.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { edition: 'yr', density }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(undefined, 'sov04dmd.map'));
    await waitWorld(page, 'sov04dmd.map');
    report.terrain = await page.evaluate(({ members, groups, density }) => {
        const d = window.__ra2debug, g = d.game, w = d.worldScene, terrain = d.theater.terrainHd;
        g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
        d.gameScreen.pointer.unlock(true); document.querySelector('[data-campaign-diagnostic]')?.remove();
        const selected = terrain.report.groups.filter(group => groups.includes(group.id));
        const placed = terrain.report.placedBindings.filter(binding => members.includes(binding.member));
        const bindings = [...terrain.bindings.values()].filter(binding => members.includes(binding.source.member));
        const meshes = new Set();
        w.scene.traverse(object => { if (object.isMesh && object.name === 'map_tiles_hd') meshes.add(object.material.map); });
        return { groups: selected, placed, allocation: terrain.report.worldChargeBytes, budget: terrain.report.budget,
            bindings: bindings.map(binding => ({ source: binding.source, group: binding.group,
                sample: [binding.rect.width, binding.rect.height], logical: [binding.logical.width, binding.logical.height],
                density, actualHdTerrainMesh: meshes.has(binding.texture), texture: binding.texture.uuid })) };
    }, { members: ledger.members.map(row => row.member), groups: ledger.addedGroups, density });
    assert.equal(report.terrain.groups.length, 3);
    assert(report.terrain.groups.every(group => group.status === 'PUBLISHED' && group.density === density));
    assert.equal(report.terrain.bindings.length, 25);
    assert(report.terrain.allocation <= report.terrain.budget);
    for (const binding of report.terrain.bindings) {
        assert(binding.actualHdTerrainMesh); assert.deepEqual(binding.sample, binding.logical.map(size => size * density));
        assert.equal(binding.source.sha256, ledger.members.find(row => row.member === binding.source.member).sourceSha256);
    }
    for (const member of ledger.members) assert(report.terrain.placed.some(row => row.member === member.member),
        'A real original placement must consume the requested terrain member: ' + member.member);
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.gameScreen.gameAnimationLoop.stop(); d.renderer.update(0);
    });
    report.before = await worldState(page);
    report.captures = [];
    for (const member of ledger.members) {
        const placed = report.terrain.placed.find(row => row.member === member.member);
        const framing = await page.evaluate(({ placement, zoom }) => {
            const d = window.__ra2debug, g = d.game, w = d.worldScene;
            const tile = g.map.tiles.getAll().find(tile => tile.rx === placement.tile[0] && tile.ry === placement.tile[1]);
            if (!tile) throw Error('Original source terrain placement disappeared');
            const free = w.cameraPan.freeCamera, previous = free.value; free.value = true;
            let nativePan;
            try {
                d.worldInteraction.minimapHandler.panToTile(tile); nativePan = w.cameraPan.getPan();
                // The diagnostic zoom uses the camera's scaled pan units.
                w.cameraPan.setPan({ x: nativePan.x * zoom, y: nativePan.y * zoom });
            } finally { free.value = previous; }
            w.cameraZoom.zoom = w.lastCameraZoom = zoom; w.camera.zoom = zoom; w.camera.updateProjectionMatrix();
            w.updateCamera(w.cameraPan.getPan(), zoom);
            d.renderableManager.getRenderableContainer().cullRenderables(w.viewport.width);
            const automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
            try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
            w.meshBatchManager.updateMeshes(); d.renderer.render();
            const gl = d.renderer.renderer, viewport = w.viewport, ratio = gl.domElement.width / d.renderer.width;
            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width * ratio); canvas.height = Math.floor(viewport.height * ratio);
            const context = canvas.getContext('2d');
            context.drawImage(gl.domElement, Math.floor(viewport.x * ratio), Math.floor(viewport.y * ratio),
                canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let samples = 0, visible = 0;
            for (let pixel = 0; pixel < pixels.length; pixel += 128) {
                samples++; if (Math.max(pixels[pixel], pixels[pixel + 1], pixels[pixel + 2]) > 5) visible++;
            }
            return { tile: placement.tile, zoom, nativePan, drawPan: w.cameraPan.getPan(),
                glError: d.renderer.renderer.getContext().getError(),
                scenePreparing: d.renderer.preparingScenes.has(w), visibleWorldFraction: visible / samples,
                tick: g.currentTick, hash: g.getHash() };
        }, { placement: placed, zoom: density / 2 });
        report.currentFraming = framing;
        assert.equal(framing.glError, 0); assert.equal(framing.tick, report.before.tick);
        assert.equal(framing.hash, report.before.hash);
        assert.equal(framing.scenePreparing, false);
        assert(framing.visibleWorldFraction > .1, 'A source terrain capture must contain a visible world');
        const file = member.member.replace('.', '-') + '.png';
        await page.screenshot({ path: path.join(out, file) }); report.captures.push({ member: member.member, file, ...framing });
    }
    delete report.currentFraming;
    report.after = await worldState(page); assert.deepEqual(report.after, report.before);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_ORIGINAL_DESERT_PLACEMENTS_ALL_25_SOURCE_SUBTILES_HD_MESHES_AND_REQUESTED_DENSITY';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
