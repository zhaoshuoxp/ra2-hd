import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, worldState, returnCampaignHome } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]), density = Number(process.argv[3] ?? 4);
const skirmish = process.argv.find(value => value.startsWith('--skirmish='))?.slice(11);
const edition = process.argv.find(value => value.startsWith('--edition='))?.slice(10) ?? 'ra2';
assert(['ra2', 'yr'].includes(edition)); assert(!skirmish || /^[a-z0-9_-]+\.map$/.test(skirmish));
assert([0, 2, 4].includes(density)); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', density, edition, map: skirmish ?? 'all08u.map', errors: [], failedResources: [], captures: [],
    scope: 'Actual original bridge-to-land road joins. Reveal, freeze and camera framing are presentation assistance; source placements, world/tick/RNG/teams and original map/rules/objectives are preserved. Skirmish uses a separate test profile and normal lobby start.' };
let app, page;
const snapshot = () => skirmish ? page.evaluate(() => {
    const g = window.__ra2debug.game;
    return JSON.parse(JSON.stringify({ tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(),
        world: g.debugGetState(), pendingCallbacks: g.afterTickCallbacks.length }));
}) : worldState(page);
try {
    let labels;
    ({ app, page, labels } = await campaignSession(out, report, { density, edition }));
    if (skirmish) {
        await returnCampaignHome(page, labels);
        await page.evaluate(({ edition, skirmish }) => {
            localStorage.setItem(`_edition:${edition}:_r_lastMap`, skirmish);
        }, { edition, skirmish });
        await page.getByRole('button', { name: labels['hd:menuskirmish'], exact: true }).click();
        await page.waitForFunction(() => window.__ra2debug.skirmishLobby);
        assert.equal(await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts.mapName.toLowerCase()), skirmish);
        await page.evaluate(() => { void window.__ra2debug.skirmishLobby.startGame(1700000000049); });
        await page.waitForFunction(() => window.__ra2debug.game?.status === 1 && window.__ra2debug.gameScreen?.playerUi,
            undefined, { timeout: 180000 });
    } else {
        await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(undefined, 'all08u.map'));
        await waitWorld(page, 'all08u.map');
    }
    report.sourceSetup = await page.evaluate(skirmish => {
        const d = window.__ra2debug, g = d.game;
        if (g.campaign) d.gameScreen.gameTurnMgr.setCampaignPaused(true);
        else d.gameScreen.gameTurnMgr.setPaused(true);
        if (g.campaign) g.campaign.inspectionModified = true;
        g.mapShroudTrait.revealMap(g.localPlayer, g); d.gameScreen.pointer.unlock(true);
        document.querySelector('[data-campaign-diagnostic]')?.remove();
        const heads = g.world.getAllObjects().filter(o => (skirmish ? /^LOBRDB(19|21|23|25)$/.test(o.name)
            : o.name === 'LOBRDB21') && o.isLowBridge?.());
        window.__roadJoins = skirmish ? [heads.find(o => o.isXBridge()), heads.find(o => !o.isXBridge())].filter(Boolean) : heads;
        if (!heads.length || !skirmish && heads.length !== 2) throw Error('Expected original concrete bridge heads');
        return { sourceSha256: g.officialSkirmishSourceSha256, originalHeads: heads.map(o => ({ name: o.name, tile: [o.tile.rx, o.tile.ry] })) };
    }, !!skirmish);
    await page.waitForFunction(density => window.__roadJoins.every(actor => {
        const model = window.__ra2debug.renderableManager.getRenderableByGameObject(actor)?.mainRenderable;
        return model?.get3DObject() && (!density || model.builder.getHdPage?.());
    }), density, { timeout: 60000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    report.before = await snapshot();
    const count = await page.evaluate(() => window.__roadJoins.length);
    for (let index = 0; index < count; index++) {
        const observation = await page.evaluate(index => {
            const d = window.__ra2debug, w = d.worldScene, actor = window.__roadJoins[index];
            const r = d.renderableManager.getRenderableByGameObject(actor), model = r.mainRenderable;
            w.cameraZoom.zoom = w.lastCameraZoom = 2; w.camera.zoom = 2; w.camera.updateProjectionMatrix();
            const free = w.cameraPan.freeCamera, previous = free.value; free.value = true;
            try {
                d.worldInteraction.minimapHandler.panToTile(actor.tile);
                const seed = w.cameraPan.getPan();
                w.cameraPan.setPan({ x: seed.x * 2, y: seed.y * 2 });
                for (let pass = 0; pass < 3; pass++) {
                    w.updateCamera(w.cameraPan.getPan(), 2);
                    d.renderableManager.getRenderableContainer().cullRenderables(w.viewport.width);
                    const automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
                    try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
                    const mesh = model.getShapeMesh(), p = mesh.geometry.getAttribute('position');
                    const points = Array.from({ length: p.count }, (_, i) => w.camera.position.clone()
                        .set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(mesh.matrixWorld).project(w.camera));
                    const pan = w.cameraPan.getPan();
                    w.cameraPan.setPan({ x: pan.x + (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) * w.viewport.width / 4,
                        y: pan.y - (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) * w.viewport.height / 4 });
                }
            } finally { free.value = previous; }
            w.updateCamera(w.cameraPan.getPan(), 2); d.renderableManager.getRenderableContainer().cullRenderables(w.viewport.width);
            w.meshBatchManager.updateMeshes(); d.renderer.render();
            const tiles = [];
            for (let rx = actor.tile.rx - 5; rx <= actor.tile.rx + 1; rx++)
                for (let ry = actor.tile.ry - 1; ry <= actor.tile.ry + 3; ry++) {
                    const tile = d.game.map.tiles.getByMapCoords(rx, ry); if (!tile) continue;
                    const entry = d.theater.tileSets.getTile(tile.tileNum);
                    tiles.push({ rx, ry, tileNum: tile.tileNum, subTile: tile.subTile, z: tile.z,
                        files: entry.files.map(file => {
                            const binding = d.theater.terrainHd?.bindings.get(file.images[tile.subTile]);
                            return { member: file.filename, hd: !!binding,
                                source: binding?.source, rect: binding?.rect, logical: binding?.logical };
                        }) });
                }
            const b = model.builder, frame = b.getFrame(), hd = b.getHdPage?.();
            const sample = b.hdOverride?.frames[frame + b.frameOffset]?.sampleRect;
            const logical = b.getSpriteGeometryOptions(frame).logicalSize;
            return { name: actor.name, tile: [actor.tile.rx, actor.tile.ry], visible: r.get3DObject().visible, tiles,
                hd: !!hd, gpuHd: !!hd && hd.base === model.getShapeMesh().material.map,
                actualDensity: sample && [sample.width / logical.width, sample.height / logical.height],
                identity: b.hdOverride?.identity, terrainDensity: d.terrainHd?.density,
                glError: d.renderer.renderer.getContext().getError() };
        }, index);
        assert(observation.visible); assert.equal(observation.glError, 0);
        if (density) { assert(observation.gpuHd); assert.deepEqual(observation.actualDensity, [density, density]); }
        const file = `actual-road-join-${index + 1}.png`; await page.screenshot({ path: path.join(out, file) });
        report.captures.push({ ...observation, file });
    }
    report.after = await snapshot(); assert.deepEqual(report.after, report.before);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_ACTUAL_SOURCE_BRIDGE_ROAD_JOIN_CAPTURE_UNCHANGED_WORLD';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
