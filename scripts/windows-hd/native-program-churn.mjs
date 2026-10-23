import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const [kitArgument, outputArgument, mode = '4x'] = process.argv.slice(2);
const firstUse = process.argv.includes('--first-use');
const warmStress = process.argv.includes('--warm-stress');
assert(!(firstUse && warmStress));
const early = firstUse || warmStress, scene = warmStress ? 'stress' : 'small';
const skipHidden = process.argv.includes('--skip-hidden-bodies');
const kit = path.resolve(kitArgument), output = path.resolve(outputArgument);
await fs.mkdir(output, { recursive: false });
const existing = new Set(await fs.readdir(path.join(kit, 'Diagnostic-Runs')).catch(() => []));
const report = { status: 'RUNNING', platform: 'darwin-arm64', windows: 'NOT_RUN', mode,
    boundary: warmStress ? 'Eight-second instrumented stress ownership probe twenty seconds after the first native loop. Mac support only, not Windows timing acceptance.'
        : firstUse ? 'Instrumented ownership/upload probe at initial debug renderer exposure, tick 0-2, for fifteen seconds. Loading and the first rendered frame may precede this hook. Not timing acceptance.'
        : 'Eight-second material/program ownership probe after normal capture; instrumented, not timing acceptance.', errors: [] };
const app = await electron.launch({
    executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.join(kit, 'resources/app'), `--diag-mode=${mode}`, `--diag-scene=${scene}`, `--diag-seconds=${early ? 15 : 3}`],
    env: { ...process.env, RA2_HD_DIAGNOSTIC: '1', RA2_DIAGNOSTIC_ROOT: kit, RA2_DIAGNOSTIC_HARNESS: '1' },
    timeout: 60000,
});
try {
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.message));
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
    const started = Date.now();
    let run;
    if (early) await page.waitForFunction(() => window.__ra2WinDiagnostic, undefined, { timeout: 120000 });
    while (!early && Date.now() - started < 150000) {
        const latest = (await fs.readdir(path.join(kit, 'Diagnostic-Runs')))
            .filter(name => !existing.has(name) && name.endsWith(`${scene}-${mode}-none`)).sort().at(-1);
        if (latest) {
            run = JSON.parse(await fs.readFile(path.join(kit, 'Diagnostic-Runs', latest, 'run.json')));
            if (run.status !== 'RUNNING') break;
        }
        await page.waitForTimeout(500);
    }
    if (!early) { assert.equal(run?.status, 'CAPTURED'); report.run = run; }
    report.probe = await page.evaluate(async ({ skipHidden, firstUse, warmStress }) => {
        const d = window.__ra2debug;
        let firstLoopObservedAt;
        if (warmStress) {
            while (!d.renderer?.renderer || !d.gameScreen?.gameAnimationLoop?.isStarted)
                await new Promise(resolve => setTimeout(resolve, 10));
            firstLoopObservedAt = performance.now();
            await new Promise(resolve => setTimeout(resolve, 20000));
            window.__ra2WinDiagnostic.setTraceActive(true);
        }
        if (firstUse) window.__ra2WinDiagnostic.setTraceActive(true);
        while (!d.renderer?.renderer) await new Promise(resolve => setTimeout(resolve, 10));
        const webgl = d.renderer.renderer, gl = webgl.getContext();
        const installedBeforeNativeStart = !d.gameScreen?.gameAnimationLoop?.isStarted;
        const names = ['shaderSource', 'attachShader', 'linkProgram', 'deleteProgram', 'getProgramInfoLog',
            'texImage2D', 'texSubImage2D', 'bufferData', 'bufferSubData'];
        const original = new Map(names.map(name => [name, gl[name]]));
        const direct = webgl.renderBufferDirect, programIds = new WeakMap(), shaders = new WeakMap();
        const attachments = new WeakMap(), materials = new Map(), links = [], deletions = [], disposals = [], waits = [];
        const uploads = {}, slowUploads = [];
        let active, serial = 0;
        const patched = new Map();
        if (skipHidden) d.worldScene.scene.traverse(object => {
            const material = object.material;
            if (material?.type !== 'HdSpriteMaterial' || material.uniforms?.hdPass?.value !== 0) return;
            const prototype = Object.getPrototypeOf(object);
            if (typeof prototype.updateFromMeshes !== 'function') throw Error('Hidden parent is not a merged sprite batch');
            if (!patched.has(prototype)) {
                const update = prototype.updateFromMeshes;
                prototype.updateFromMeshes = function (...args) {
                    const result = update.apply(this, args);
                    if (this.material.type === 'HdSpriteMaterial' && this.material.uniforms.hdPass?.value === 0)
                        this.material.visible = this.castShadow || !this.material.uniforms.hdFiltering.value;
                    return result;
                };
                patched.set(prototype, update);
            }
            material.visible = object.castShadow || !material.uniforms.hdFiltering.value;
        });
        const programId = program => {
            if (!programIds.has(program)) programIds.set(program, ++serial);
            return programIds.get(program);
        };
        const stamp = () => ({ atMs: performance.now(), tick: d.game?.currentTick ?? null });
        const materialInfo = material => material ? { id: material.id, uuid: material.uuid, type: material.type,
            name: material.name, defines: { ...material.defines }, customKey: material.customProgramCacheKey(),
            transparent: material.transparent, side: material.side, forceSinglePass: material.forceSinglePass,
            alphaTest: material.alphaTest,
            hdPass: material.uniforms?.hdPass?.value, hdFiltering: material.uniforms?.hdFiltering?.value,
            clippingPlanes: material.clippingPlanes?.length ?? 0, map: material.map ? { name: material.map.name,
                width: material.map.image?.width, height: material.map.image?.height, uuid: material.map.uuid } : null } : null;
        const objectInfo = object => {
            if (!object) return null;
            const parents = []; let parent = object;
            while (parent && parents.length < 6) { parents.push({ id: parent.id, name: parent.name, type: parent.type }); parent = parent.parent; }
            return { id: object.id, name: object.name, type: object.type, parents, castShadow: object.castShadow,
                attributes: Object.keys(object.geometry?.attributes ?? {}), drawRange: { ...object.geometry?.drawRange } };
        };
        webgl.renderBufferDirect = function (...args) {
            const previous = active; active = { material: args[3], object: args[4] };
            try { return direct.apply(this, args); } finally { active = previous; }
        };
        gl.shaderSource = function (shader, source) {
            shaders.set(shader, source); return original.get('shaderSource').call(this, shader, source);
        };
        gl.attachShader = function (program, shader) {
            if (!attachments.has(program)) attachments.set(program, []);
            attachments.get(program).push(shader);
            return original.get('attachShader').call(this, program, shader);
        };
        const familyMatches = material => {
            if (!['HdSpriteMaterial', 'PaletteBasicMaterial'].includes(material?.type)) return [];
            const matches = new Map();
            for (const renderable of d.renderableManager?.getRenderableContainer().getChildren() ?? []) {
                let matched = false;
                renderable.get3DObject?.()?.traverse(object => {
                    const list = Array.isArray(object.material) ? object.material : [object.material];
                    if (list.some(source => source?.map === material.map)) matched = true;
                });
                if (matched) matches.set(renderable.gameObject?.name ?? renderable.unit?.name ?? 'UNRESOLVED', true);
                if (matches.size >= 16) break;
            }
            return [...matches.keys()];
        };
        gl.linkProgram = function (program) {
            const material = active?.material;
            if (material && !materials.has(material)) {
                const listener = () => { if (disposals.length < 512) disposals.push({ ...stamp(), material: materialInfo(material), stack: new Error().stack }); };
                material.addEventListener('dispose', listener); materials.set(material, listener);
            }
            if (links.length < 512) links.push({ ...stamp(), program: programId(program), material: materialInfo(material),
                object: objectInfo(active?.object), familyMatches: familyMatches(material), sources: (attachments.get(program) ?? []).map(shader => shaders.get(shader)),
                stack: new Error().stack });
            return original.get('linkProgram').call(this, program);
        };
        gl.deleteProgram = function (program) {
            if (program && deletions.length < 512) deletions.push({ ...stamp(), program: programId(program), stack: new Error().stack });
            return original.get('deleteProgram').call(this, program);
        };
        gl.getProgramInfoLog = function (program) {
            const start = performance.now();
            try { return original.get('getProgramInfoLog').call(this, program); }
            finally { if (waits.length < 512) waits.push({ ...stamp(), program: programId(program), cpuMs: performance.now() - start }); }
        };
        for (const name of ['texImage2D', 'texSubImage2D', 'bufferData', 'bufferSubData']) {
            const metric = uploads[name] = { calls: 0, cpuMs: 0, maximumCpuMs: 0 };
            gl[name] = function (...args) {
                const at = performance.now();
                try { return original.get(name).apply(this, args); }
                finally {
                    const elapsed = performance.now() - at;
                    metric.calls++; metric.cpuMs += elapsed; metric.maximumCpuMs = Math.max(metric.maximumCpuMs, elapsed);
                    if (elapsed > 2 && slowUploads.length < 512) slowUploads.push({ ...stamp(), method: name, cpuMs: elapsed,
                        material: materialInfo(active?.material), object: objectInfo(active?.object) });
                }
            };
        }
        const startTick = d.game?.currentTick ?? null, startPrograms = webgl.info.programs.length;
        let firstLiveTick, liveStartMs;
        try {
            if (firstUse) while (!d.gameScreen?.gameAnimationLoop?.isStarted)
                await new Promise(resolve => setTimeout(resolve, 10));
            firstLiveTick = d.game.currentTick; liveStartMs = performance.now();
            await new Promise(resolve => setTimeout(resolve, firstUse ? 15000 : 8000));
        }
        finally {
            webgl.renderBufferDirect = direct;
            for (const [name, method] of original) gl[name] = method;
            for (const [material, listener] of materials) material.removeEventListener('dispose', listener);
            for (const [prototype, update] of patched) prototype.updateFromMeshes = update;
            if (skipHidden) d.worldScene.scene.traverse(object => {
                if (object.material?.type === 'HdSpriteMaterial' && object.material.uniforms.hdPass?.value === 0)
                    object.material.visible = true;
            });
        }
        if (firstUse || warmStress) window.__ra2WinDiagnostic.setTraceActive(false);
        return { firstLoopObservedAt, installedBeforeNativeStart, firstLiveTick, liveStartMs, startTick, endTick: d.game.currentTick, startPrograms, endPrograms: webgl.info.programs.length,
            shaderChecksEnabled: webgl.debug.checkShaderErrors, links, deletions, disposals, waits, uploads, slowUploads };
    }, { skipHidden, firstUse, warmStress });
    report.firstUse = firstUse;
    report.warmStress = warmStress;
    if (early) {
        if (firstUse) assert(report.probe.startTick <= 2 && report.probe.firstLiveTick <= 2, 'Early-live probe missed its tick 0-2 boundary');
        else assert(report.probe.startTick > 500 && report.probe.liveStartMs - report.probe.firstLoopObservedAt >= 20000,
            'Warm ownership probe started too early');
        const deadline = Date.now() + 150000;
        while (Date.now() < deadline) {
            const latest = (await fs.readdir(path.join(kit, 'Diagnostic-Runs')))
                .filter(name => !existing.has(name) && name.endsWith(`${scene}-${mode}-none`)).sort().at(-1);
            if (latest) {
                run = JSON.parse(await fs.readFile(path.join(kit, 'Diagnostic-Runs', latest, 'run.json')));
                if (run.status !== 'RUNNING') break;
            }
            await page.waitForTimeout(500);
        }
        assert.equal(run?.status, 'CAPTURED'); report.run = run;
    }
    report.experimentalSkipHiddenBodies = skipHidden;
    const sources = new Map();
    for (const link of report.probe.links) link.sources = link.sources.map(source => {
        const hash = createHash('sha256').update(source).digest('hex'); sources.set(hash, source); return hash;
    });
    await fs.writeFile(path.join(output, 'shader-sources.json'), JSON.stringify(Object.fromEntries(sources), null, 2));
    assert(report.probe.endTick > report.probe.startTick); assert.equal(report.probe.shaderChecksEnabled, true);
    assert.deepEqual(report.errors, []);
    if (process.argv.includes('--expect-first-use-handoff')) {
        assert(firstUse);
        const hdLinks = report.probe.links.filter(link => link.material?.type === 'HdSpriteMaterial');
        assert.equal(hdLinks.length, 2);
        assert.deepEqual(hdLinks.map(link => link.material.hdPass).sort(), [1, 2]);
        assert(hdLinks.every(link => link.familyMatches.includes('GAPOWR')));
        assert.equal(new Set(hdLinks.map(link => link.sources.join(':'))).size, 2);
        const programs = new Set(hdLinks.map(link => link.program));
        assert(!report.probe.deletions.some(row => programs.has(row.program)), 'The first owners lost their programs');
        report.handoff = 'Each GAPOWR body/coverage shader pair links once; no release/relink during the fifteen-second native route.';
    }
    if (process.argv.includes('--expect-no-churn')) {
        assert.equal(report.probe.links.length, 0); assert.equal(report.probe.waits.length, 0);
    }
    report.status = 'PASS_NATIVE_INSTRUMENTED_PROGRAM_OWNERSHIP_PROBE';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await app.close(); }
