import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { campaignSession, worldState } from '../m3-2/native-session.mjs';
import { replaySourcePrefix } from './replay-source.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';

const [output, sourceArg, prefix, densityArg = '0'] = process.argv.slice(2);
const out = path.resolve(output), density = Number(densityArg);
assert([0, 2, 4].includes(density)); await fs.mkdir(out, { recursive: false });
const source = JSON.parse(await fs.readFile(path.join(sourceArg, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(sourceArg, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
const report = { status: 'RUNNING', errors: [], failedResources: [], density, captures: [],
    scope: 'Actual original Allied03 action88 source sparks, reconstructed from original creation seeds and recorded ordinary commands. Camera framing, disabling only the flash material and temporary renderer-only shroud UV coverage are explicit diagnostics. Source rules/triggers/objectives, world exploration, simulation and RNG remain unchanged. Native random flash phase and pristine blend/physics equivalence remain qualified.' };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');

async function inspectLight(label) {
    await page.waitForFunction(() => window.__ra2debug.worldScene.getChildren().some(fx =>
        fx.get3DObject?.()?.name === 'fx_campaign_sparks' && fx.get3DObject().userData.lightRadius > 0));
    await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    const framed = await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldScene;
        const effects = w.getChildren().filter(fx => fx.get3DObject?.()?.name === 'fx_campaign_sparks');
        window.__sourceLightEffects = effects;
        const origin = w.camera.position.clone().copy(effects[0].state.position).project(w.camera);
        const before = w.cameraPan.getPan(), zoom = w.cameraZoom.getZoom();
        const free = w.cameraPan.freeCamera, previous = free.value; free.value = true;
        try { w.cameraPan.setPan({ x: before.x + origin.x * w.viewport.width / (2 * zoom),
            y: before.y - origin.y * w.viewport.height / (2 * zoom) }); }
        finally { free.value = previous; }
        w.updateCamera(w.cameraPan.getPan(), zoom); d.renderer.render();
        return { before, after: w.cameraPan.getPan(), effects: effects.map(fx => ({
            name: fx.name, stateFlash: fx.state.flash, particles: fx.state.sparks.length,
            lightSize: fx.state.lightSize, particleCap: fx.state.particleCap, oneFrameLight: fx.state.oneFrameLight,
            source: fx.get3DObject().userData, order: fx.flash.renderOrder,
            depthTest: fx.flash.material.depthTest, scale: fx.flash.scale.toArray(),
            projectedLogicalWidth: fx.flash.scale.x * w.camera.projectionMatrix.elements[0] * w.viewport.width / (2 * zoom),
            expectedLogicalWidth: (fx.get3DObject().userData.lightRadius + 1) * 2 })) };
    });
    assert(framed.effects.every(fx => Math.abs(fx.projectedLogicalWidth - fx.expectedLogicalWidth) < .001),
        'Flash does not retain the original logical pixel scale');
    const before = await worldState(page);
    const captures = await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldScene, gl = d.renderer.renderer;
        const effects = window.__sourceLightEffects;
        const originalOpacity = effects.map(fx => fx.flash.material.opacity);
        const center = w.camera.position.clone().copy(effects[0].state.position).project(w.camera);
        const v = w.viewport, ratio = gl.domElement.width / d.renderer.width;
        const x = (v.x + (center.x + 1) * v.width / 2) * ratio;
        const y = (v.y + (1 - center.y) * v.height / 2) * ratio;
        const left = Math.max(0, Math.floor(x - 128 * ratio)), top = Math.max(0, Math.floor(y - 96 * ratio));
        const width = Math.min(gl.domElement.width - left, Math.ceil(256 * ratio));
        const height = Math.min(gl.domElement.height - top, Math.ceil(192 * ratio));
        const capture = enabled => {
            effects.forEach((fx, i) => fx.flash.material.opacity = enabled ? originalOpacity[i] : 0);
            d.renderer.render();
            const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(gl.domElement, left, top, width, height, 0, 0, width, height);
            return canvas.toDataURL('image/png');
        };
        const on = capture(true), off = capture(false);
        const shroud = w.getChildren().find(object => object.shroudLayer)?.shroudLayer;
        if (!shroud) throw Error('Actual original shroud renderer is absent');
        const uv = shroud.uvAttribute.array.slice();
        let coveredOn, coveredOff;
        try {
            // Change only the renderer's mask sampling, retaining the source
            // exploration map and every original effect/actor in place.
            const covered = shroud.uvLookup.subarray(15 * shroud.uvElemsPerPiece, 16 * shroud.uvElemsPerPiece);
            for (let i = 0; i < shroud.uvAttribute.array.length; i += shroud.uvElemsPerPiece)
                shroud.uvAttribute.array.set(covered, i);
            shroud.uvAttribute.needsUpdate = true;
            coveredOn = capture(true); coveredOff = capture(false);
        } finally {
            shroud.uvAttribute.array.set(uv); shroud.uvAttribute.needsUpdate = true;
            effects.forEach((fx, i) => fx.flash.material.opacity = originalOpacity[i]); d.renderer.render();
        }
        return { on, off, coveredOn, coveredOff, glError: gl.getContext().getError(), bounds: [left, top, width, height] };
    });
    const difference = (on, off) => {
        const a = PNG.sync.read(Buffer.from(on.split(',')[1], 'base64'));
        const b = PNG.sync.read(Buffer.from(off.split(',')[1], 'base64'));
        assert.equal(a.width, b.width); assert.equal(a.height, b.height);
        let changed = 0, darkened = 0;
        for (let i = 0; i < a.data.length; i += 4) {
            if ([0, 1, 2].some(channel => a.data[i + channel] !== b.data[i + channel])) changed++;
            if ([0, 1, 2].some(channel => a.data[i + channel] < b.data[i + channel])) darkened++;
        }
        return { changed, darkened, dimensions: [a.width, a.height] };
    };
    const visible = difference(captures.on, captures.off), covered = difference(captures.coveredOn, captures.coveredOff);
    assert(visible.changed > 100, 'Source flash did not illuminate the actual world');
    assert.equal(visible.darkened, 0); assert.equal(covered.changed, 0); assert.equal(captures.glError, 0);
    assert.deepEqual(await worldState(page), before);
    for (const key of ['on', 'off', 'coveredOn', 'coveredOff'])
        await fs.writeFile(path.join(out, `${label}-${key}.png`), Buffer.from(captures[key].split(',')[1], 'base64'));
    await page.screenshot({ path: path.join(out, `${label}-native-scene.png`) });
    report.captures.push({ label, framed, visible, covered, bounds: captures.bounds,
        worldTickRngVariablesTeamsAndExplorationUnchanged: true, glError: captures.glError });
    await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start()); await save();
}

try {
    ({ app, page, labels } = await campaignSession(out, report, { density }));
    report.prefix = await replaySourcePrefix(page, source, prefix);
    report.sourceActions = await page.evaluate(() => window.__ra2debug.game.campaign.trace.filter(action => action.opcode === 88));
    assert(report.sourceActions.some(action => action.key === '0AF78D3C'));
    await inspectLight('original-source');
    if (process.argv.includes('--restart')) {
        ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report,
            'Original source spark light', undefined, async session => {
                ({ app, page, labels } = session); await inspectLight('after-named-restart');
            }));
    }
    report.beforeAbort = await page.evaluate(() => {
        const scene = window.__ra2debug.worldScene;
        window.__lightDisposal = scene.getChildren().filter(fx => fx.get3DObject?.()?.name === 'fx_campaign_sparks')
            .map(fx => {
                const materials = fx.get3DObject().children.map(sprite => sprite.material), disposed = new Set();
                materials.forEach(material => material.addEventListener('dispose', () => disposed.add(material)));
                return { fx, scene, materials, disposed };
            });
        return window.__lightDisposal.map(({ materials }) => materials.length);
    });
    assert(report.beforeAbort.length > 0);
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
    await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
    await page.waitForSelector('[data-campaign-missions][data-campaign-ready=true]');
    report.afterAbort = await page.evaluate(() => ({ worldAbsent: !window.__ra2debug.game?.campaign,
        effects: window.__lightDisposal.map(({ fx, scene, materials, disposed }) => ({
            detached: !scene.getChildren().includes(fx), groupCleared: !fx.get3DObject(),
            materials: materials.length, disposed: disposed.size })) }));
    assert(report.afterAbort.worldAbsent);
    assert(report.afterAbort.effects.every(fx => fx.detached && fx.groupCleared && fx.materials === fx.disposed));
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_SOURCE_FLASH_WORLD_ILLUMINATION_SHROUD_STATE_AND_DISPOSAL';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
