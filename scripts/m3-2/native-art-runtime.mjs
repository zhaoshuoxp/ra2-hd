import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, pauseWorld, stepWorld, waitWorld, worldState } from './native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const density = Number(process.argv.find(value => value.startsWith('--density='))?.split('=')[1] ?? 4);
assert([0, 2, 4].includes(density));
const checkpointPath = process.argv.find(value => value.startsWith('--checkpoint='))?.slice(13);
const checkpoint = checkpointPath && JSON.parse(await fs.readFile(path.resolve(checkpointPath)));
const report = { status: 'RUNNING', density, scope: 'Exact saved-world density comparison, followed by explicitly posed diagnostic VLAD loaded/empty/ownership captures. Poses and reveal are presentation inspection, not native mission events.',
    errors: [], failedResources: [], frames: [] };
let app, page;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    ({ app, page } = await campaignSession(out, report, { density }));
    await page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(checkpoint || undefined, 'sov02t.map'), checkpoint);
    if (checkpoint) {
        await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 180000 });
        const state = await worldState(page); assert.equal(state.hash, checkpoint.expected.worldHash);
        assert.deepEqual(state.rng, checkpoint.expected.rng); assert.deepEqual(state.mission, checkpoint.expected.mission);
        assert.deepEqual(state.world, checkpoint.expected.world);
        await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.menu.close(); d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true); });
        await stepWorld(page, 300);
        const after = await worldState(page);
        assert.equal(after.hash, 205617629);
        report.determinism = { restoredTick: state.tick, restoredHash: state.hash, afterTick: after.tick, afterHash: after.hash,
            matchesNative2xCheckpointAnd300TickContinuation: true, source: path.basename(checkpointPath), checkpointChecksum: checkpoint.checksum };
    } else await waitWorld(page, 'sov02t.map');
    await pauseWorld(page);
    if (density) {
        await page.evaluate(async () => { const d = window.__ra2debug, g = d.game;
            g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
            window.__vlad = g.world.getAllObjects().find(o => o.name === 'VLAD');
            if (!window.__vlad) throw Error('Original VLAD placement is absent');
            d.worldInteraction.minimapHandler.panToTile(window.__vlad.tile);
            window.__vladRelease = d.worldView.sovietUnitsHd.prewarm('VLAD'); await d.worldView.sovietUnitsHd.idle(); });
        await page.waitForFunction(() => window.__ra2debug.renderableManager.getRenderableByGameObject(window.__vlad)?.unitVxlHd?.active, undefined, { timeout: 30000 });
        report.family = await page.evaluate(() => { const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__vlad), hd = r.unitVxlHd;
            d.gameScreen.gameAnimationLoop.stop();
            return { status: d.sovietUnitsHd.families.VLAD, parts: hd.family.parts.map(p => ({ member: p.member, identity: p.override.identity })),
                gpuBytes: d.sovietUnitsHd.gpuBytes, budget: d.sovietUnitsHd.budget }; });
        assert.equal(report.family.status.density, density); assert.equal(report.family.status.status, 'READY');
        assert.equal(report.family.parts.length, 3);
        report.poseBefore = await worldState(page);
        for (const state of ['loaded', 'empty']) for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
            const capture = await page.evaluate(({ state, heading }) => {
                const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__vlad), world = d.worldScene;
                r.mainVxl.visible = state === 'loaded'; r.noSpawnAltVxl.visible = state === 'empty';
                r.updateVxlRotation(heading, true); r.palette = r.palette.clone().remap({ r: 255, g: 0, b: 0 }); r.unitVxlHd.update();
                const policy = world.scene.matrixWorldAutoUpdate; world.scene.matrixWorldAutoUpdate = true;
                try { world.scene.updateMatrixWorld(true); } finally { world.scene.matrixWorldAutoUpdate = policy; }
                world.meshBatchManager.updateMeshes(); d.renderer.render();
                const gl = d.renderer.renderer, point = world.camera.position.clone().set(0, 0, 0).applyMatrix4(r.posObj.matrixWorld).project(world.camera);
                const ratio = gl.domElement.width / d.renderer.width, v = world.viewport;
                const pivot = [(v.x + (point.x + 1) * v.width / 2) * ratio, (v.y + (1 - point.y) * v.height / 2) * ratio];
                const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 384;
                const crop = [Math.round(pivot[0] - 256), Math.round(pivot[1] - 230), 512, 384];
                const render = () => { canvas.getContext('2d').clearRect(0, 0, 512, 384); canvas.getContext('2d').drawImage(gl.domElement, ...crop, 0, 0, 512, 384); return canvas.toDataURL('image/png'); };
                const red = render(); r.palette = r.palette.clone().remap({ r: 0, g: 0, b: 255 }); r.unitVxlHd.update(); world.meshBatchManager.updateMeshes(); d.renderer.render();
                return { red, blue: render(), active: r.unitVxlHd.active, crop, heading, state, glError: gl.getContext().getError() };
            }, { state, heading });
            assert(capture.active); assert.equal(capture.glError, 0);
            for (const color of ['red', 'blue']) {
                const name = `${state}-${heading}-${color}.png`;
                await fs.writeFile(path.join(out, name), Buffer.from(capture[color].split(',')[1], 'base64')); capture[color] = name;
            }
            report.frames.push(capture); await save();
        }
        report.poseAfter = await worldState(page);
        assert.deepEqual(report.poseAfter, report.poseBefore);
        report.frozenWorldTickRngAndTeamsUnchanged = true;
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = density ? 'PASS_NATIVE_DENSITY_STATE_AND_COMPLETE_VLAD_POSES' : 'PASS_NATIVE_ORIGINAL_MATCHES_HD_SAVED_STATE_AND_CONTINUATION';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.familyFailure = await page.evaluate(() => window.__ra2debug?.sovietUnitsHd?.families?.VLAD).catch(() => null);
        await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, error: report.error }));
