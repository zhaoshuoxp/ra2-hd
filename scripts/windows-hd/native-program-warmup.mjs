import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const [kitArg, outputArg, mode = '4x'] = process.argv.slice(2);
const kit = path.resolve(kitArg), output = path.resolve(outputArg);
await fs.mkdir(output, { recursive: false });
const report = { status: 'RUNNING', platform: 'darwin-arm64', windows: 'NOT_RUN', mode,
    boundary: 'Instrumented loading/first-use ownership proof, not performance acceptance.', errors: [] };
const app = await electron.launch({
    executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.join(kit, 'resources/app'), `--diag-mode=${mode}`, '--diag-scene=small', '--diag-seconds=15'],
    env: { ...process.env, RA2_HD_DIAGNOSTIC: '1', RA2_DIAGNOSTIC_ROOT: kit, RA2_DIAGNOSTIC_HARNESS: '1' }, timeout: 60000,
});
try {
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.message));
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
    await page.waitForFunction(() => window.__ra2WinDiagnostic, undefined, { timeout: 120000 });
    report.probe = await page.evaluate(async () => {
        const debug = () => window.__ra2debug;
        const stamp = () => ({ atMs: performance.now(), tick: debug()?.game?.currentTick ?? null,
            playing: !!debug()?.gameScreen?.gameAnimationLoop?.isStarted });
        const before = stamp();
        const proto = WebGL2RenderingContext.prototype;
        const names = ['shaderSource', 'attachShader', 'linkProgram', 'getProgramInfoLog', 'useProgram', 'deleteProgram'];
        const original = new Map(names.map(name => [name, proto[name]]));
        const shaders = new WeakMap(), attachments = new WeakMap(), ids = new WeakMap();
        const links = [], waits = [], deletions = [], uses = new Map(); let serial = 0;
        const id = program => { if (!ids.has(program)) ids.set(program, ++serial); return ids.get(program); };
        proto.shaderSource = function (shader, source) { shaders.set(shader, source); return original.get('shaderSource').call(this, shader, source); };
        proto.attachShader = function (program, shader) {
            if (!attachments.has(program)) attachments.set(program, []);
            attachments.get(program).push(shader); return original.get('attachShader').call(this, program, shader);
        };
        proto.linkProgram = function (program) {
            links.push({ ...stamp(), program: id(program), sources: attachments.get(program).map(shader => shaders.get(shader)) });
            return original.get('linkProgram').call(this, program);
        };
        proto.getProgramInfoLog = function (program) {
            const start = performance.now();
            try { return original.get('getProgramInfoLog').call(this, program); }
            finally { waits.push({ ...stamp(), program: id(program), cpuMs: performance.now() - start }); }
        };
        proto.useProgram = function (program) {
            if (program) { const key = id(program); if (!uses.has(key)) uses.set(key, stamp()); }
            return original.get('useProgram').call(this, program);
        };
        proto.deleteProgram = function (program) {
            if (program) deletions.push({ ...stamp(), program: id(program) });
            return original.get('deleteProgram').call(this, program);
        };
        try {
            while (!window.__ra2WinDiagnostic) await new Promise(resolve => setTimeout(resolve, 10));
            window.__ra2WinDiagnostic.setTraceActive(true);
            while (!debug()?.gameScreen?.gameAnimationLoop?.isStarted) await new Promise(resolve => setTimeout(resolve, 10));
            const d = debug(), renderer = d.renderer.renderer, warmups = [...d.renderer.hdProgramWarmups.values()];
            const owners = warmups.flatMap(warmup => {
                const list = [];
                warmup.mesh.traverse(mesh => {
                    const material = mesh.material;
                    if (material) list.push({ program: id(renderer.properties.get(material).currentProgram.program),
                        hdPass: material.uniforms.hdPass.value, usedTimes: renderer.properties.get(material).currentProgram.usedTimes });
                });
                return list;
            });
            const liveStart = stamp();
            await new Promise(resolve => setTimeout(resolve, 15000));
            const matches = [];
            for (const renderable of d.renderableManager.getRenderableContainer().getChildren()) {
                if (renderable.gameObject?.name !== 'GAPOWR') continue;
                renderable.get3DObject()?.traverse(source => {
                    const map = source.material?.map;
                    if (!map) return;
                    d.worldScene.scene.traverse(mesh => {
                        const material = mesh.material;
                        if (material?.type !== 'HdSpriteMaterial' || material.map !== map) return;
                        const program = renderer.properties.get(material).currentProgram;
                        if (program) matches.push({ family: 'GAPOWR', hdPass: material.uniforms.hdPass?.value,
                            program: id(program.program), usedTimes: program.usedTimes });
                    });
                });
            }
            return { before, liveStart, end: stamp(), owners, warmupCount: warmups.length,
                detached: warmups.every(value => value.mesh.parent === null), links, waits, deletions,
                uses: [...uses].map(([program, firstUse]) => ({ program, firstUse })), matches,
                shaderChecksEnabled: renderer.debug.checkShaderErrors };
        } finally {
            for (const [name, method] of original) proto[name] = method;
            window.__ra2WinDiagnostic?.setTraceActive(false);
        }
    });
    const sources = new Map();
    for (const link of report.probe.links) link.sources = link.sources.map(source => {
        const hash = createHash('sha256').update(source).digest('hex'); sources.set(hash, source); return hash;
    });
    await fs.writeFile(path.join(output, 'shader-sources.json'), JSON.stringify(Object.fromEntries(sources), null, 2));
    const p = report.probe;
    assert.equal(p.before.playing, false); assert.equal(p.warmupCount, 1); assert.equal(p.detached, true);
    assert.equal(p.shaderChecksEnabled, true); assert(p.liveStart.tick <= 2); assert(p.end.tick > 520);
    const expected = ['66b2ef5f73f20aad761d40e2c1c1479cb284255e9d0fdc8988c8c6cce31040af',
        'ae137aab975cfb0258abb9e2e08a7744db5622a77d2d0a42e66365520e29e1cc'];
    assert.equal(p.owners.length, 2);
    for (const [index, owner] of p.owners.entries()) {
        assert.equal(owner.hdPass, index + 1);
        const link = p.links.filter(row => row.program === owner.program);
        assert.equal(link.length, 1); assert.equal(link[0].playing, false);
        assert(link[0].sources.includes(expected[index]));
        assert(link[0].sources.includes('34e2e9af1a0c7d352ac7ead3929f2ed459e6818def55944d7797fae1fc79b08c'));
        const waits = p.waits.filter(row => row.program === owner.program);
        assert.equal(waits.length, 1); assert.equal(waits[0].playing, false);
        assert(p.matches.some(row => row.hdPass === owner.hdPass && row.program === owner.program));
        assert(p.uses.some(row => row.program === owner.program && row.firstUse.playing));
        assert(!p.deletions.some(row => row.program === owner.program));
    }
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
        const latest = (await fs.readdir(path.join(kit, 'Diagnostic-Runs')))
            .filter(name => name.endsWith(`small-${mode}-none`)).sort().at(-1);
        if (latest) {
            const runPath = path.join(kit, 'Diagnostic-Runs', latest);
            report.run = JSON.parse(await fs.readFile(path.join(runPath, 'run.json')));
            if (report.run.status !== 'RUNNING') {
                report.phases = JSON.parse(await fs.readFile(path.join(runPath, 'phases.json'))); break;
            }
        }
        await page.waitForTimeout(500);
    }
    assert.equal(report.run.status, 'CAPTURED'); assert.equal(report.phases.length, 4);
    assert(report.phases.every(phase => phase.validity === 'VALID_BOUNDED_SAMPLE' && phase.tickEnd > phase.tickStart));
    report.finalWarmupCount = await page.evaluate(() => window.__ra2debug.renderer.hdProgramWarmups.size);
    assert.equal(report.finalWarmupCount, 1);
    report.exit = await page.evaluate(() => {
        const d = window.__ra2debug, materials = [], programs = [], released = [];
        let textureDisposals = 0;
        for (const warmup of d.renderer.hdProgramWarmups.values()) warmup.mesh.traverse(mesh => {
            const material = mesh.material;
            if (!material) return;
            const index = materials.length; materials.push(material); released.push(0);
            programs.push(d.renderer.renderer.properties.get(material).currentProgram);
            material.addEventListener('dispose', () => released[index]++);
            for (const texture of [material.map, material.palette, material.uniforms.remapMap.value].filter(Boolean))
                texture.addEventListener('dispose', () => textureDisposals++);
        });
        const before = programs.map(program => program.usedTimes);
        d.renderer.removeScene(d.worldScene); d.renderer.removeScene(d.worldScene);
        return { before, after: programs.map(program => program.usedTimes), released, textureDisposals,
            ownerCount: d.renderer.hdProgramWarmups.size };
    });
    assert.equal(report.exit.ownerCount, 0); assert.deepEqual(report.exit.released, [1, 1]);
    assert.equal(report.exit.textureDisposals, 0);
    assert.deepEqual(report.exit.after, report.exit.before.map(count => count - 1));
    assert.deepEqual(report.errors, []); report.status = 'PASS_NATIVE_PREPARED_PAIR_REUSED_BY_GAPOWR';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await app.close(); }
