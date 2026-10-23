// Diagnose the reported Manhattan color cast using unchanged source lamps and matched camera crops.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [stage, output] = process.argv.slice(2);
const root = '.artifacts/m2-4/newurban-final-actors-batch98-20261021';
const reference = JSON.parse(await fs.readFile(`${root}/native-2x-v1/report.json`));
const ready = reference.manhattan.nativeStates.actors[0];
const capture = ready.readyCapture;
process.argv.push('--map=manhatta.map', '--bot-slot=1');
const session = await startSession(stage, output, 'yr', false, async ({ page }) => {
    await page.evaluate(() => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = false;
        graphics.hdDensity.value = 2;
    });
});
const { page, report } = session;
report.matchedReference = { file: `${root}/native-2x-v1/report.json`, tile: ready.samples.ready.tile,
    framebuffer: capture.buffer, crop: capture.source };
report.cases = [];

async function switchDensity(density) {
    await page.evaluate(density => {
        const d = window.__ra2debug;
        clearInterval(window.__allied.timer);
        window.__lampProbeOldGame = d.game;
        d.generalOptions.graphics.hdEnabled.value = true;
        d.generalOptions.graphics.hdDensity.value = density;
        d.gameScreen.controller.goToScreen(0, { route: { screenType: 1, params: undefined } });
    }, density);
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby, undefined, { timeout: 60000 });
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
        && window.__ra2debug.game !== window.__lampProbeOldGame, undefined, { timeout: 90000 });
    await page.evaluate(() => window.__installAlliedFixtures());
}

async function snapshot(name, visibility) {
    const result = await page.evaluate(({ rect, expected, visibility }) => {
        const d = window.__ra2debug, canvas = d.renderer.renderer.domElement;
        if (canvas.width !== expected[0] || canvas.height !== expected[1])
            throw Error('Native framebuffer differs from reported image');
        for (const lamp of window.__lampProbeMeshes)
            lamp.mesh.visible = visibility === 'all' ? lamp.visible : visibility === 'blue' && lamp.blue && lamp.visible;
        d.renderer.render();
        const [left, top, width, height] = rect;
        const target = document.createElement('canvas');
        target.width = width;
        target.height = height;
        target.getContext('2d').drawImage(canvas, left, top, width, height, 0, 0, width, height);
        return { png: target.toDataURL().split(',')[1], glError: d.renderer.renderer.getContext().getError() };
    }, { rect: capture.source, expected: capture.buffer, visibility });
    assert.equal(result.glError, 0);
    const file = `${name}.png`;
    await fs.writeFile(path.join(session.out, file), Buffer.from(result.png, 'base64'));
    return { file, crop: capture.source, framebuffer: capture.buffer, rescaled: false };
}

let failure;
try {
    report.disclosure = 'Original source map and lamp rules remain unchanged. Diagnostic mesh visibility is temporarily toggled only for the on/off evidence and restored before leaving each case. No source, map, rule, texture or renderer patch is made by this probe.';
    for (const density of [1, 2, 4]) {
        if (density !== 1) await switchDensity(density);
        const row = { density };
        report.cases.push(row);
        row.lighting = await page.evaluate(({ tile }) => {
            const d = window.__ra2debug, g = d.game;
            const anchor = g.map.tiles.getByMapCoords(tile[0], tile[1]);
            d.worldInteraction.minimapHandler.panToTile(anchor);
            const sources = g.getWorld().getAllObjects().filter(object => object.isSpawned && object.rules.lightIntensity);
            window.__lampProbeMeshes = [];
            const lamps = sources.map(object => {
                const rule = object.rules, r = d.renderableManager.getRenderableByGameObject(object);
                const meshes = [];
                r?.get3DObject()?.traverse(mesh => {
                    const material = mesh.material;
                    if (!material?.uniforms?.lampMap) return;
                    const texture = material.uniforms.lampMap.value;
                    const pixels = texture.image.getContext('2d').getImageData(0, 0, 32, 32).data;
                    window.__lampProbeMeshes.push({ mesh, visible: mesh.visible,
                        blue: rule.lightBlueTint > rule.lightRedTint && rule.lightBlueTint > rule.lightGreenTint });
                    meshes.push({ visible: mesh.visible, colorSpace: texture.colorSpace,
                        center: [...pixels.slice((16 * 32 + 16) * 4, (16 * 32 + 16) * 4 + 4)],
                        blendEquation: material.blendEquation, blendSrc: material.blendSrc, blendDst: material.blendDst });
                });
                return { id: object.id, name: object.name, tile: [object.tile.rx, object.tile.ry, object.tile.z],
                    raw: Object.fromEntries(['LightIntensity', 'LightVisibility', 'LightRedTint', 'LightGreenTint', 'LightBlueTint']
                        .map(key => [key, rule.ini.getString(key)])),
                    effective: { intensity: rule.lightIntensity, visibility: rule.lightVisibility,
                        red: rule.lightRedTint, green: rule.lightGreenTint, blue: rule.lightBlueTint }, meshes };
            });
            return { sourceSha256: g.officialSkirmishSourceSha256, ambient: d.mapRenderable.lighting.getAmbient(),
                lamps, meshes: window.__lampProbeMeshes.length, environmentDensity: d.environmentHd.density,
                terrainDensity: d.terrainHd.density };
        }, { tile: ready.samples.ready.tile });
        assert.equal(row.lighting.sourceSha256, '3016a9b96fc0df087f8f3487db2a5da023ee545906ae553eface0f83d77ddd8c');
        assert(row.lighting.meshes > 0);
        await page.waitForTimeout(120);
        row.allLights = await snapshot(`manhattan-${density}x-all-native-lamps`, 'all');
        row.noLights = await snapshot(`manhattan-${density}x-diagnostic-lamps-hidden`, 'none');
        row.blueOnly = await snapshot(`manhattan-${density}x-native-blue-lamps-only`, 'blue');
        await page.evaluate(() => {
            for (const lamp of window.__lampProbeMeshes) lamp.mesh.visible = lamp.visible;
        });
    }
    const original = report.cases[0].lighting.lamps.map(({ id, ...lamp }) => lamp);
    for (const row of report.cases.slice(1))
        assert.deepEqual(row.lighting.lamps.map(({ id, ...lamp }) => lamp), original);
    report.technicalStatus = 'PASS_MATCHED_ORIGINAL_2X_4X_SOURCE_LAMP_RULES_AND_GPU_COEFFICIENTS';
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, technical: report.technicalStatus }));
