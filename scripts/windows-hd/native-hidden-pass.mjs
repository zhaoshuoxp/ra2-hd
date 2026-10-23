import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [kitArgument, outputArgument, mode = '4x'] = process.argv.slice(2);
const expectSuppressed = process.argv.includes('--expect-suppressed');
const kit = path.resolve(kitArgument), output = path.resolve(outputArgument);
await fs.mkdir(output, { recursive: false });
const existing = new Set(await fs.readdir(path.join(kit, 'Diagnostic-Runs')).catch(() => []));
const report = { status: 'RUNNING', platform: 'darwin-arm64', windows: 'NOT_RUN', mode,
    boundary: 'Same-state pixel comparisons outside timing loops; native ticking is frozen only for equivalence.', errors: [] };
const app = await electron.launch({
    executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.join(kit, 'resources/app'), `--diag-mode=${mode}`, '--diag-scene=small', '--diag-seconds=3'],
    env: { ...process.env, RA2_HD_DIAGNOSTIC: '1', RA2_DIAGNOSTIC_ROOT: kit, RA2_DIAGNOSTIC_HARNESS: '1' }, timeout: 60000,
});
try {
    const page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.message));
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
    const started = Date.now(); let run;
    while (Date.now() - started < 150000) {
        const latest = (await fs.readdir(path.join(kit, 'Diagnostic-Runs')))
            .filter(name => !existing.has(name) && name.endsWith(`small-${mode}-none`)).sort().at(-1);
        if (latest) {
            run = JSON.parse(await fs.readFile(path.join(kit, 'Diagnostic-Runs', latest, 'run.json')));
            if (run.status !== 'RUNNING') break;
        }
        await page.waitForTimeout(500);
    }
    assert.equal(run?.status, 'CAPTURED'); report.run = run;
    report.comparisons = await page.evaluate(() => {
        const d = window.__ra2debug, renderer = d.renderer, webgl = renderer.renderer, gl = webgl.getContext();
        const loop = d.gameScreen.gameAnimationLoop, tick = loop.tickGame, autoReset = webgl.info.autoReset;
        const startTick = d.game.currentTick, pan = { ...d.worldScene.cameraPan.getPan() }, results = [];
        loop.tickGame = () => true; webgl.info.autoReset = false;
        try {
            for (const offset of [{ x: 0, y: 0 }, { x: -350, y: 150 }, { x: 350, y: -150 }]) {
                d.worldScene.cameraPan.setPan({ x: pan.x + offset.x, y: pan.y + offset.y }); renderer.update(0);
                const bodies = [], coverages = [];
                // traverseVisible tests object visibility; a hidden parent's
                // material must leave its sorted coverage children reachable.
                d.worldScene.scene.traverseVisible(object => {
                    if (object.material?.type === 'HdSpriteMaterial' && object.material.uniforms.hdPass?.value === 0) bodies.push(object);
                    if (object.name === 'hd-sprite-edge') coverages.push(object);
                });
                if (!bodies.length || !coverages.length) throw Error('No actual hidden HD body/coverage pair');
                const initialSuppressed = bodies.filter(body => !body.castShadow).every(body => !body.material.visible);
                const uniforms = [...new Set(bodies.map(body => body.material.uniforms.hdFiltering))];
                const initialUniforms = uniforms.map(uniform => uniform.value), initialVisibility = bodies.map(body => body.material.visible);
                const render = suppress => {
                    for (const body of bodies) body.material.visible = suppress
                        ? body.castShadow || !body.material.uniforms.hdFiltering.value : true;
                    webgl.info.reset(); renderer.render();
                    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                    return { pixels, calls: webgl.info.render.calls, triangles: webgl.info.render.triangles };
                };
                try {
                    for (const filtering of [true, false]) {
                        uniforms.forEach(uniform => { uniform.value = filtering; });
                        const baseline = render(false), candidate = render(true), restored = render(false);
                        let differentBytes = 0, restoredDifferentBytes = 0, nonzeroBytes = 0;
                        baseline.pixels.forEach((byte, index) => {
                            if (byte !== candidate.pixels[index]) differentBytes++;
                            if (byte !== restored.pixels[index]) restoredDifferentBytes++;
                            if (byte) nonzeroBytes++;
                        });
                        const culled = bodies.filter(body => !body.castShadow && filtering);
                        results.push({ offset, filtering, hiddenBodies: bodies.length, culledBodies: culled.length,
                            coverageMeshes: coverages.length, coverageVisible: coverages.every(mesh => mesh.visible && mesh.material.visible),
                            initialSuppressed, width: gl.drawingBufferWidth, height: gl.drawingBufferHeight,
                            differentBytes, restoredDifferentBytes, nonzeroBytes, comparedBytes: baseline.pixels.length,
                            calls: [baseline.calls, candidate.calls, restored.calls], triangles: [baseline.triangles, candidate.triangles, restored.triangles],
                            expectedSavedCalls: culled.reduce((sum, body) => sum + (body.material.transparent && body.material.side === 2
                                && !body.material.forceSinglePass ? 2 : 1), 0), shaderChecksEnabled: webgl.debug.checkShaderErrors });
                    }
                } finally {
                    uniforms.forEach((uniform, index) => { uniform.value = initialUniforms[index]; });
                    bodies.forEach((body, index) => { body.material.visible = initialVisibility[index]; });
                }
            }
        } finally { loop.tickGame = tick; webgl.info.autoReset = autoReset; d.worldScene.cameraPan.setPan(pan); }
        return { startTick, endTick: d.game.currentTick, results, output: renderer.outputMetrics,
            density: d.generalOptions.graphics.hdDensity.value };
    });
    assert.equal(report.comparisons.startTick, report.comparisons.endTick);
    for (const result of report.comparisons.results) {
        assert.equal(result.differentBytes, 0); assert.equal(result.restoredDifferentBytes, 0);
        assert(result.nonzeroBytes > 0); assert.equal(result.calls[0], result.calls[2]);
        assert.equal(result.calls[0] - result.calls[1], result.expectedSavedCalls);
        assert.equal(result.shaderChecksEnabled, true); assert.equal(result.coverageVisible, true);
        if (expectSuppressed) assert.equal(result.initialSuppressed, true);
    }
    assert.deepEqual(report.errors, []); report.status = 'PASS_NATIVE_HIDDEN_BODY_PIXEL_EQUIVALENCE';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await app.close(); }
