import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [kitArgument, outputArgument, mode = '4x'] = process.argv.slice(2);

const scene = process.argv[5] ?? 'small';
const kit = path.resolve(kitArgument), output = path.resolve(outputArgument);
await fs.mkdir(output, { recursive: false });
const existing = new Set(await fs.readdir(path.join(kit, 'Diagnostic-Runs')).catch(() => []));
const report = { status: 'RUNNING', platform: 'darwin-arm64', windows: 'NOT_RUN', mode,
    boundary: 'Same-state pixel comparisons outside timing loops; native ticking and automatic renderer updates are frozen only for equivalence. Explicit renderer.update(0) and render still exercise the production paths.', errors: [] };
const app = await electron.launch({
    executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.join(kit, 'resources/app'), `--diag-mode=${mode}`, `--diag-scene=${scene}`, '--diag-seconds=3'],
    env: { ...process.env, RA2_HD_DIAGNOSTIC: '1', RA2_DIAGNOSTIC_ROOT: kit, RA2_DIAGNOSTIC_HARNESS: '1' }, timeout: 60000,
});
try {
    const page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.message));
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
    const started = Date.now(); let run;
    while (Date.now() - started < 150000) {
        const latest = (await fs.readdir(path.join(kit, 'Diagnostic-Runs')))
            .filter(name => !existing.has(name) && name.endsWith(`${scene}-${mode}-none`)).sort().at(-1);
        if (latest) {
            run = JSON.parse(await fs.readFile(path.join(kit, 'Diagnostic-Runs', latest, 'run.json')));
            if (run.status !== 'RUNNING') break;
        }
        await page.waitForTimeout(500);
    }
    assert.equal(run?.status, 'CAPTURED'); report.run = run;
    report.comparisons = await page.evaluate(async () => {
        const d = window.__ra2debug, renderer = d.renderer, webgl = renderer.renderer, gl = webgl.getContext();
        const manager = d.worldScene.meshBatchManager, loop = d.gameScreen.gameAnimationLoop;
        if (!Array.isArray(manager.retiredBatches)) throw Error('Copied candidate lacks bounded batch retirement');
        const tick = loop.tickGame, updateRenderer = loop.updateRenderer, pan = { ...d.worldScene.cameraPan.getPan() };
        const startTick = d.game.currentTick, results = [];
        loop.tickGame = () => true; loop.updateRenderer = () => {};
        const read = () => {
            renderer.render();
            const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
            gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            return pixels;
        };
        const difference = (a, b) => a.reduce((count, byte, index) => count + Number(byte !== b[index]), 0);
        try {
            for (const offset of [{ x: 0, y: 0 }, { x: -350, y: 150 }, { x: 350, y: -150 }]) {
                d.worldScene.cameraPan.setPan({ x: pan.x + offset.x, y: pan.y + offset.y }); renderer.update(0);
                const baseline = read(), sources = [], clones = new Map();
                const warmupEquivalence = [];
                for (const ownerMap of [renderer.paletteProgramWarmups, renderer.combatProgramWarmups].filter(Boolean)) {
                    const holders = [...ownerMap];
                    for (const [, holder] of holders) holder.dispose();
                    ownerMap.clear();
                    const withoutWarmup = read();
                    for (const [scene, holder] of holders) {
                        const replacement = holder.constructor.create(scene.scene);
                        if (!replacement) throw Error('Failed to restore native HD warmup');
                        await replacement.prepare(webgl, scene.camera, scene.scene);
                        ownerMap.set(scene, replacement);
                    }
                    warmupEquivalence.push({ ownerGroups: holders.length,
                        removedDifferentBytes: difference(baseline, withoutWarmup),
                        restoredDifferentBytes: difference(baseline, read()),
                        retainedAfterRestore: ownerMap.size });
                }
                d.worldScene.scene.traverseVisible(object => {
                    if (object.isBatchedMesh && !Array.isArray(object.material)) sources.push(object);
                });
                if (!sources.length) throw Error('No actual native batched sources');
                const originals = sources.map(mesh => mesh.material);
                let links = 0; const link = gl.linkProgram;
                gl.linkProgram = function (...args) { links++; return link.apply(this, args); };
                try {
                    sources.forEach(mesh => {
                        if (!clones.has(mesh.material)) clones.set(mesh.material, mesh.material.clone());
                        mesh.material = clones.get(mesh.material);
                    });
                    renderer.update(0);
                    const retired = [...manager.retiredBatches];
                    if (!retired.length) throw Error('Material replacement failed to retire native batches');
                    const detached = retired.every(batch => !batch.get3DObject().parent);
                    const deferred = read(), linksAfterReplacement = links;
                    manager.disposeRetiredBatches();
                    const resourcesAfterDrain = { retired: manager.retiredBatches.length,
                        geometry: webgl.info.memory.geometries, programs: webgl.info.programs.length };
                    const immediate = read();
                    sources.forEach((mesh, index) => { mesh.material = originals[index]; }); renderer.update(0);
                    const restored = read();
                    results.push({ offset, sources: sources.length, clonedMaterials: clones.size,
                        retired: retired.length, detached, linksAfterReplacement, totalLinks: links,
                        candidateDifferentBytes: difference(baseline, deferred),
                        immediateDisposalDifferentBytes: difference(deferred, immediate),
                        restoredDifferentBytes: difference(baseline, restored),
                        nonzeroBytes: baseline.reduce((count, byte) => count + Number(byte !== 0), 0),
                        comparedBytes: baseline.length, width: gl.drawingBufferWidth, height: gl.drawingBufferHeight,
                        shaderChecksEnabled: webgl.debug.checkShaderErrors,
                        resourcesAfterDrain, warmupEquivalence });
                } finally {
                    gl.linkProgram = link;
                    sources.forEach((mesh, index) => { mesh.material = originals[index]; }); renderer.update(0);
                    manager.disposeRetiredBatches(); clones.forEach(material => material.dispose());
                }
            }
        } finally { loop.tickGame = tick; loop.updateRenderer = updateRenderer; d.worldScene.cameraPan.setPan(pan); }
        return { startTick, endTick: d.game.currentTick, results, output: renderer.outputMetrics,
            density: d.generalOptions.graphics.hdDensity.value };
    });
    assert.equal(report.comparisons.startTick, report.comparisons.endTick);
    for (const result of report.comparisons.results) {
        assert.equal(result.candidateDifferentBytes, 0); assert.equal(result.immediateDisposalDifferentBytes, 0);
        assert.equal(result.restoredDifferentBytes, 0); assert(result.nonzeroBytes > 0);
        assert.equal(result.detached, true); assert.equal(result.linksAfterReplacement, 0);
        assert.equal(result.totalLinks, 0); assert.equal(result.shaderChecksEnabled, true);
        assert.equal(result.resourcesAfterDrain.retired, 0);
        for (const comparison of result.warmupEquivalence) {
            assert.equal(comparison.ownerGroups, mode === 'original' ? 0 : 1);
            assert.equal(comparison.removedDifferentBytes, 0);
            assert.equal(comparison.restoredDifferentBytes, 0);
            assert.equal(comparison.retainedAfterRestore, mode === 'original' ? 0 : 1);
        }
    }
    assert.deepEqual(report.errors, []); report.status = 'PASS_NATIVE_BATCH_HANDOFF_PIXEL_AND_PROGRAM_EQUIVALENCE';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await app.close(); }
