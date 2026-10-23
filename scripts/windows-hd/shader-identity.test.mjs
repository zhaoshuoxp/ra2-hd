import { test, expect } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { installShaderIdentityProbe } from './shader-identity-probe.mjs';
import { stageRuntime } from './shader-identity-bootstrap.mjs';

function fixture() {
    const originals = {}, calls = {}, gl = {};
    for (const name of ['shaderSource', 'attachShader', 'linkProgram', 'getProgramInfoLog', 'useProgram', 'deleteProgram']) {
        calls[name] = 0; gl[name] = originals[name] = () => { calls[name]++; return name === 'getProgramInfoLog' ? '' : undefined; };
    }
    const renderer = { debug: { checkShaderErrors: true }, getContext: () => gl,
        renderBufferDirect(camera, scene, geometry, material, object) {
            const a = {}, b = {}, program = {};
            gl.shaderSource(a, 'vertex'); gl.shaderSource(b, 'fragment');
            gl.attachShader(program, a); gl.attachShader(program, b); gl.linkProgram(program);
            gl.getProgramInfoLog(program); gl.useProgram(program); gl.useProgram(program); gl.deleteProgram(program);
        } };
    const direct = renderer.renderBufferDirect;
    const api = {
        startDetailed() {
            const original = gl.getProgramInfoLog;
            gl.getProgramInfoLog = function (...args) { return original.apply(this, args); };
            this.detailed = { report: {}, restores: [() => { gl.getProgramInfoLog = original; }] };
        },
        endDetailed() {
            const detail = this.detailed; if (!detail) return null;
            detail.restores.forEach(restore => restore()); delete this.detailed; return detail.report;
        },
    };
    globalThis.window = { __ra2WinDiagnostic: api, __ra2debug: { renderer: { renderer }, game: { currentTick: 1400 },
        gameScreen: { gameAnimationLoop: { isStarted: true } } } };
    const material = { type: 'PaletteBasicMaterial', id: 1, defines: { TEST: '' }, customProgramCacheKey: () => 'test',
        alphaTest: .5, side: 2, transparent: false, clippingPlanes: [] };
    const object = { id: 2, name: 'test_sprite', type: 'Mesh', geometry: { attributes: { position: {} }, drawRange: { count: 6 } } };
    return { api, gl, renderer, originals, direct, calls, material, object };
}

test('capture binds exact shader sources to the active material and restores nested GL wrappers', () => {
    const f = fixture(); installShaderIdentityProbe({ companionId: 'test' });
    expect(f.gl.getProgramInfoLog).toBe(f.originals.getProgramInfoLog);
    f.api.startDetailed(); f.renderer.renderBufferDirect(null, null, null, f.material, f.object);
    const report = f.api.endDetailed().shaderIdentity;
    expect(report.status).toBe('CAPTURED'); expect(report.links[0].sources).toEqual(['vertex', 'fragment']);
    expect(report.links[0].material.type).toBe('PaletteBasicMaterial'); expect(report.links[0].object.name).toBe('test_sprite');
    expect(report.links[0].program).toBe(report.waits[0].program); expect(report.firstUses).toHaveLength(1);
    expect(report.deletions).toHaveLength(1); expect(report.shaderChecksEnabled).toBe(true);
    for (const [name, original] of Object.entries(f.originals)) expect(f.gl[name]).toBe(original);
    expect(f.renderer.renderBufferDirect).toBe(f.direct); expect(f.api.endDetailed()).toBeNull();
});

test('bounded evidence drops extra records without dropping native GL operations', () => {
    const f = fixture(); installShaderIdentityProbe({ companionId: 'test' }); f.api.startDetailed();
    for (let i = 0; i < 70; i++) f.renderer.renderBufferDirect(null, null, null, f.material, f.object);
    const report = f.api.endDetailed().shaderIdentity;
    expect(report.links).toHaveLength(64); expect(report.waits).toHaveLength(64); expect(report.dropped.links).toBe(6);
    expect(f.calls.linkProgram).toBe(70); expect(f.calls.getProgramInfoLog).toBe(70); expect(f.calls.useProgram).toBe(140);
    expect(f.gl.getProgramInfoLog).toBe(f.originals.getProgramInfoLog);
});

test('failed installation or final family inspection restores all wrappers and reports the failure', () => {
    let f = fixture(); delete f.gl.attachShader; installShaderIdentityProbe({ companionId: 'test' });
    expect(() => f.api.startDetailed()).toThrow('Missing shader capture API');
    expect(f.gl.shaderSource).toBe(f.originals.shaderSource); expect(f.gl.getProgramInfoLog).toBe(f.originals.getProgramInfoLog);
    expect(f.renderer.renderBufferDirect).toBe(f.direct); expect(f.api.detailed).toBeUndefined();
    f = fixture(); installShaderIdentityProbe({ companionId: 'test' }); f.api.startDetailed();
    f.material.map = { uuid: 'test', image: { width: 1, height: 1 } };
    f.renderer.renderBufferDirect(null, null, null, f.material, f.object);
    window.__ra2debug.renderableManager = { getRenderableContainer: () => { throw Error('lookup failed'); } };
    const report = f.api.endDetailed().shaderIdentity;
    expect(report.status).toBe('FAILED'); expect(report.failure).toBe('lookup failed');
    expect(f.gl.getProgramInfoLog).toBe(f.originals.getProgramInfoLog); expect(f.renderer.renderBufferDirect).toBe(f.direct);
});

test('runtime staging copies only pinned runtime bytes and rejects changed source bytes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ra2-shader-staging-'));
    const kit = path.join(root, 'kit'), own = path.join(root, 'companion');
    await fs.mkdir(kit); await fs.mkdir(own);
    const bytes = Buffer.from('runtime fixture'); await fs.writeFile(path.join(kit, 'Red Alert 2 HD.exe'), bytes);
    const row = { file: 'Red Alert 2 HD.exe', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    const manifest = { files: [row, { file: 'resources/app/untouched', bytes: 1 }, { file: 'RA2-HD-Editions-Resources/art', bytes: 1 }] };
    const staged = await stageRuntime(kit, own, manifest);
    expect(staged.files).toEqual([row]); expect(await fs.readFile(path.join(staged.folder, row.file))).toEqual(bytes);
    const pkg = JSON.parse(await fs.readFile(path.join(staged.folder, 'resources/app/package.json'), 'utf8'));
    expect(path.isAbsolute(pkg.main)).toBe(false);
    expect(path.resolve(staged.folder, 'resources/app', pkg.main)).toBe(path.join(own, 'shader-identity-entry.mjs'));
    await fs.writeFile(path.join(kit, row.file), 'Runtime fixture');
    await expect(stageRuntime(kit, own, manifest)).rejects.toThrow();
    expect(await fs.readFile(path.join(staged.folder, row.file))).toEqual(bytes);
});
