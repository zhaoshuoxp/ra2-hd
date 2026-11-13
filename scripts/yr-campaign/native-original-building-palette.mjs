import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { campaignSession, waitWorld, worldState } from '../m3-2/native-session.mjs';

const [output, originalFile, identity] = process.argv.slice(2);
const out = path.resolve(output), original = JSON.parse(await fs.readFile(originalFile));
const source = original.sources.find(source => source.identity === identity);
assert.equal(original.edition, 'yr');
assert.equal(source.bodyFrames, 4);
assert.equal(source.framePalettes['3'].runtimeUsed, true);
const paletteIdentity = source.framePalettes['3'];
const palette = await fs.readFile(path.join(path.dirname(originalFile), 'native', paletteIdentity.member));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(palette), paletteIdentity.sha256);
const expectedRgb = sha(Buffer.from(palette.map(value => value * 4)));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', mission: original.mission, identity, errors: [], failedResources: [],
    scope: 'Fresh original source at Original graphics. Renderer-only rubble pose and reveal inspect the real native palette; original actor, world, health, RNG, tasks and objectives remain unchanged. No HD or ordinary destruction is claimed.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { edition: 'yr', density: 0 }));
    await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22)
        .launchDiagnostic(undefined, mission), original.mission);
    await waitWorld(page, original.mission);
    await page.evaluate(identity => {
        const d = window.__ra2debug, g = d.game;
        const actor = g.world.getAllObjects().find(actor => actor.name === identity && actor.isSpawned && !actor.isDestroyed);
        if (!actor) throw Error('Original source actor absent: ' + identity);
        window.__originalPaletteActor = actor;
        g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
        d.gameScreen.pointer.unlock(true); document.querySelector('[data-campaign-diagnostic]')?.remove();
        d.worldInteraction.minimapHandler.panToTile(actor.tile);
    }, identity);
    report.before = await worldState(page);
    report.native = await page.evaluate(async () => {
        const d = window.__ra2debug, actor = window.__originalPaletteActor;
        d.mapRenderable.shroudLayer?.update(0); d.gameScreen.gameAnimationLoop.stop();
        const r = d.renderableManager.getRenderableByGameObject(actor), w = d.worldScene;
        if (!r.rubbleObj) throw Error('Native rubble renderer absent');
        for (const other of d.game.world.getAllObjects()) if (other !== actor) {
            const root = d.renderableManager.getRenderableByGameObject(other)?.get3DObject();
            if (root) root.visible = false;
        }
        d.mapRenderable.terrainLayer.get3DObject().visible = false;
        r.get3DObject().visible = true; r.mainObj.get3DObject().visible = false;
        r.rubbleObj.get3DObject().visible = true; r.rubbleObj.setFrame(3);
        w.meshBatchManager.updateMeshes(); d.renderer.render();
        const builder = r.rubbleObj.builder, colors = new Uint8Array(768);
        for (let index = 0; index < 256; index++) {
            const color = builder.palette.getColor(index); colors.set([color.r, color.g, color.b], index * 3);
        }
        const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
            .map(value => value.toString(16).padStart(2, '0')).join('');
        return { actor: actor.id, health: actor.healthTrait.health, member: r.mainShpFile.filename,
            paletteRgbSha256: await digest(colors),
            indexSha256: await digest(new Uint8Array(r.mainShpFile.images[3].imageData)),
            frame: builder.frameNo, hd: !!builder.getHdPage?.(),
            glError: d.renderer.renderer.getContext().getError() };
    });
    assert.equal(report.native.member, source.member);
    assert.equal(report.native.paletteRgbSha256, expectedRgb);
    assert.equal(report.native.indexSha256, source.frames[3].indexSha256);
    assert.equal(report.native.hd, false); assert.equal(report.native.frame, 3);
    assert.equal(report.native.glError, 0);
    report.palette = paletteIdentity;
    await page.screenshot({ path: path.join(out, 'original-rubble.png') });
    report.after = await worldState(page); assert.deepEqual(report.after, report.before);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOURCE_RUBBLE_PALETTE_AND_INDICES';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
