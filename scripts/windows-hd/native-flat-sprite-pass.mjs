import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [kitArgument, outputArgument, mode = '4x', scene = 'small'] = process.argv.slice(2);
const expectSinglePass = process.argv.includes('--expect-single-pass');
const kit = path.resolve(kitArgument), output = path.resolve(outputArgument);
await fs.mkdir(output, { recursive: false });
const existingRuns = new Set(await fs.readdir(path.join(kit, 'Diagnostic-Runs')).catch(() => []));
const app = await electron.launch({
    executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.join(kit, 'resources/app'), `--diag-mode=${mode}`, `--diag-scene=${scene}`, '--diag-seconds=3'],
    env: { ...process.env, RA2_HD_DIAGNOSTIC: '1', RA2_DIAGNOSTIC_ROOT: kit, RA2_DIAGNOSTIC_HARNESS: '1' },
    timeout: 60000,
});
const report = { status: 'RUNNING', platform: 'darwin-arm64', windowsCandidate: 'NOT_RUN', mode, scene, errors: [] };
try {
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.message));
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
    const start = Date.now();
    let run;
    while (Date.now() - start < 180000) {
        const names = (await fs.readdir(path.join(kit, 'Diagnostic-Runs')))
            .filter(name => !existingRuns.has(name) && name.endsWith(`${scene}-${mode}-none`)).sort();
        if (names.length) {
            run = JSON.parse(await fs.readFile(path.join(kit, 'Diagnostic-Runs', names.at(-1), 'run.json')));
            if (run.status !== 'RUNNING') break;
        }
        await page.waitForTimeout(1000);
    }
    assert.equal(run?.status, 'CAPTURED');
    report.run = run;
    report.comparisons = await page.evaluate(() => {
        const d = window.__ra2debug, renderer = d.renderer, webgl = renderer.renderer;
        const gl = webgl.getContext(), loop = d.gameScreen.gameAnimationLoop;
        const tick = loop.tickGame, autoReset = webgl.info.autoReset;
        const startTick = d.game.currentTick, pan = { ...d.worldScene.cameraPan.getPan() };
        loop.tickGame = () => true; webgl.info.autoReset = false;
        const results = [];
        try {
            for (const offset of [{ x: 0, y: 0 }, { x: -350, y: 150 }, { x: 350, y: -150 }]) {
                d.worldScene.cameraPan.setPan({ x: pan.x + offset.x, y: pan.y + offset.y });
                renderer.update(0);
                const meshes = [];
                d.worldScene.scene.traverseVisible(object => {
                    if (object.name === 'hd-sprite-edge' && object.material.transparent && object.material.side === 2) meshes.push(object);
                });
                const materials = [...new Set(meshes.map(mesh => mesh.material))];
                if (!materials.length) throw Error('No actual sorted HD edge materials in view');
                const flags = materials.map(material => material.forceSinglePass);
                const render = single => {
                    materials.forEach(material => { material.forceSinglePass = single; });
                    webgl.info.reset(); renderer.render();
                    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                    // Readback is outside all timing measurements, solely for visual equivalence.
                    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                    return { pixels, calls: webgl.info.render.calls, triangles: webgl.info.render.triangles };
                };
                const baseline = render(false), candidate = render(true), restored = render(false);
                let differentBytes = 0, restoredDifferentBytes = 0, nonzeroBytes = 0;
                baseline.pixels.forEach((byte, index) => {
                    if (byte !== candidate.pixels[index]) differentBytes++;
                    if (byte !== restored.pixels[index]) restoredDifferentBytes++;
                    if (byte) nonzeroBytes++;
                });
                results.push({ offset, edgeMeshes: meshes.length, edgeMaterials: materials.length,
                    initialSinglePass: flags.every(Boolean),
                    width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, comparedBytes: baseline.pixels.length,
                    differentBytes, restoredDifferentBytes, nonzeroBytes,
                    calls: [baseline.calls, candidate.calls, restored.calls],
                    triangles: [baseline.triangles, candidate.triangles, restored.triangles],
                    shaderChecksEnabled: webgl.debug.checkShaderErrors, tick: d.game.currentTick });
                materials.forEach((material, index) => { material.forceSinglePass = flags[index]; });
            }
        } finally {
            loop.tickGame = tick; webgl.info.autoReset = autoReset; d.worldScene.cameraPan.setPan(pan);
        }
        return { startTick, endTick: d.game.currentTick, results, output: renderer.outputMetrics,
            hdDensity: d.generalOptions.graphics.hdDensity.value, map: d.game.gameOpts.mapName };
    });
    assert.equal(report.comparisons.startTick, report.comparisons.endTick);
    for (const result of report.comparisons.results) {
        assert.equal(result.differentBytes, 0); assert.equal(result.restoredDifferentBytes, 0);
        assert(result.nonzeroBytes > 0); assert.equal(result.calls[0], result.calls[2]);
        assert.equal(result.calls[0] - result.calls[1], result.edgeMeshes);
        assert.equal(result.shaderChecksEnabled, true);
        if (expectSinglePass) assert.equal(result.initialSinglePass, true);
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(output, 'restored-native-scene.png') });
    assert.equal(report.errors.length, 0);
    report.status = 'PASS_NATIVE_SAME_STATE_FLAT_SPRITE_SINGLE_PASS_EXPERIMENT';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await app.close(); }
