import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const [kitArg, outputArg, mode = '4x'] = process.argv.slice(2);
const kit = path.resolve(kitArg), output = path.resolve(outputArg);
await fs.mkdir(output, { recursive: false });
const report = { status: 'RUNNING', platform: 'darwin-arm64', windows: 'NOT_RUN', mode,
    boundary: 'Instrumented stress loading and 28 seconds of native combat ownership proof. Exact Mac shader-source identity and lifecycle only, not Windows timing acceptance.', errors: [] };
const app = await electron.launch({
    executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.join(kit, 'resources/app'), `--diag-mode=${mode}`, '--diag-scene=stress', '--diag-seconds=15'],
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
            const d = debug(), renderer = d.renderer.renderer, warmups = [...d.renderer.paletteProgramWarmups.values()];
            const owners = warmups.flatMap(warmup => {
                const list = [];
                warmup.mesh.traverse(mesh => {
                    const material = mesh.material;
                    if (material) list.push({ program: id(renderer.properties.get(material).currentProgram.program),
                        side: material.side, usedTimes: renderer.properties.get(material).currentProgram.usedTimes });
                });
                return list;
            });
            const liveStart = stamp();
            await new Promise(resolve => setTimeout(resolve, 28000));
            return { before, liveStart, end: stamp(), owners, warmupCount: warmups.length,
                detached: warmups.every(value => value.mesh.parent === null), links, waits, deletions,
                uses: [...uses].map(([program, firstUse]) => ({ program, firstUse })),
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
    const expected = [
        ['11bd85c0c1bf1b947b280c5cf2c42b0955c1977004963494cba8726a2578bcb2', '858d989e8feeedee9ceebc6dcdb8024a034a7e726f27e746081175da29e1c490'],
        ['ccf731683fd40be6fda025c8ea9a8848dbeffaf7b73f2f547e42c4f4b862b760', 'd8c94cba8a66ee02d0fb9d17f6a50a2dc62d42807f106b009329deed12535df8'],
    ];
    assert.equal(p.owners.length, 2);
    for (const [index, owner] of p.owners.entries()) {
        assert.equal(owner.side, index === 0 ? 1 : 0);
        const links = p.links.filter(row => row.program === owner.program);
        assert.equal(links.length, 1); assert.equal(links[0].playing, false);
        assert.deepEqual(links[0].sources, expected[index]);
        assert.equal(p.links.filter(row => row.sources.join(':') === expected[index].join(':')).length, 1,
            'The measured combat shader linked again');
        const waits = p.waits.filter(row => row.program === owner.program);
        assert.equal(waits.length, 1); assert.equal(waits[0].playing, false);
        assert(p.uses.some(row => row.program === owner.program && row.firstUse.playing));
        assert(!p.deletions.some(row => row.program === owner.program));
    }
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
        const latest = (await fs.readdir(path.join(kit, 'Diagnostic-Runs')))
            .filter(name => name.endsWith(`stress-${mode}-none`)).sort().at(-1);
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
    report.finalWarmupCount = await page.evaluate(() => window.__ra2debug.renderer.paletteProgramWarmups.size);
    assert.equal(report.finalWarmupCount, 1);
    report.exit = await page.evaluate(() => {
        const d = window.__ra2debug, materials = [], programs = [], released = [];
        let textureDisposals = 0;
        for (const warmup of d.renderer.paletteProgramWarmups.values()) warmup.mesh.traverse(mesh => {
            const material = mesh.material;
            if (!material) return;
            const index = materials.length; materials.push(material); released.push(0);
            programs.push(d.renderer.renderer.properties.get(material).currentProgram);
            material.addEventListener('dispose', () => released[index]++);
            for (const texture of [material.map, material.palette].filter(Boolean))
                texture.addEventListener('dispose', () => textureDisposals++);
        });
        const before = programs.map(program => program.usedTimes);
        d.renderer.removeScene(d.worldScene); d.renderer.removeScene(d.worldScene);
        return { before, after: programs.map(program => program.usedTimes), released, textureDisposals,
            ownerCount: d.renderer.paletteProgramWarmups.size };
    });
    assert.equal(report.exit.ownerCount, 0); assert.deepEqual(report.exit.released, [1, 1]);
    assert.equal(report.exit.textureDisposals, 0);
    assert.deepEqual(report.exit.after, report.exit.before.map(count => count - 1));
    assert.deepEqual(report.errors, []); report.status = 'PASS_NATIVE_PREPARED_COMBAT_PAIR_REUSED_WITHOUT_RELINK';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await app.close(); }
