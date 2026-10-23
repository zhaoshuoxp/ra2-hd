import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { createSpriteGeometry } from '../../src/engine/gfx/SpriteUtils';
import { resolveHdSprite, disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import { HdSpriteMaterial } from '../../src/engine/gfx/material/HdSpriteMaterial';

const sha = 'a'.repeat(64);
const source = { member: 'cons.shp', sha256: sha, theater: 'TEMPERATE', canvas: [64, 64], frames: [0, 1].map(nativeFrame => ({
    nativeFrame, trimOrigin: [5, 7], trimSize: [23, 17], legacyRenderSize: [24, 18], empty: false })) };
function fixture() {
    return { schemaVersion: 2, packId: 'fixture', packRevision: '1',
        source: { ...source, kind: 'resolved-shp-member' }, logical: { canvas: source.canvas, frames: structuredClone(source.frames) },
        color: { representation: 'authored-sRGB-RGBA8-plus-RGBA8-data' }, variants: [2, 4].map(density => ({ density,
            pages: [{ id: 'p0', size: [24 * density + 4, (18 * density + 4) * 2], base: `${density}-base.png`, data: `${density}-data.png`,
                baseSha256: sha, dataSha256: sha, baseBytes: 42, dataBytes: 42 }],
            frames: [0, 1].map(nativeFrame => ({ nativeFrame, page: 'p0',
                sampleRect: [2, 2 + nativeFrame * (18 * density + 4), 24 * density, 18 * density],
                contentRect: [2, 2 + nativeFrame * (18 * density + 4), 23 * density, 17 * density] })) })) };
}
async function read(filename: string) {
    const d = Number(filename[0]), width = 24 * d + 4, height = (18 * d + 4) * 2;
    const rgba = new Uint8Array(width * height * 4);
    if (filename.includes('data')) for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
    return { width, height, rgba };
}
const resolve = (manifest: any, density = 4, reader = read, cap = 2048) => resolveHdSprite(manifest, sha, source, density, cap, reader);

test('unavailable or invalid optional prepared pages retain the complete validated PNG family', async () => {
    const reader = Object.assign(read, { prepared: async () => { throw Error('corrupt optional payload'); } });
    const result = await resolve(fixture(), 4, reader);
    expect(result.density).toBe(4);
    expect(result.attempts).toEqual([]);
    expect(result.override!.frames).toHaveLength(2);
    disposeHdSprite(result.override);
    delete (reader as any).prepared;
});

test('a 4x-only member produces actual 2x textures after validation and rejects corrupt source art', async () => {
    const manifest = fixture(); manifest.variants = manifest.variants.filter(v => v.density === 4);
    const high = await resolve(manifest, 4), low = await resolve(manifest, 2);
    expect(low.density).toBe(2);
    expect(low.gpuBytes).toBe(high.gpuBytes / 4);
    expect(low.override!.frames[0].sampleRect.width).toBe(48);
    expect(low.override!.pages[0].base.image.width).toBe(50);
    disposeHdSprite(high.override); disposeHdSprite(low.override);
    const corrupt = await resolve(manifest, 2, async filename => {
        const page = await read(filename);
        if (filename.includes('data')) page.rgba[1] = 200;
        return page;
    });
    expect(corrupt.density).toBe(1);
    expect(corrupt.attempts[0].reason).toBe('invalid-remap-data');
});

test('logical geometry preserves noncentral splits, odd padding, align, flat and camera rotation', () => {
    for (const flat of [true, false]) for (const depth of [true, false]) for (const x of [-8, -32, 2]) {
        const camera = new THREE.PerspectiveCamera(); camera.rotation.set(-Math.PI / 6, Math.PI / 4, 0, 'YXZ');
        const options = { camera, texture: { image: { width: 24, height: 18 } } as THREE.Texture,
            textureArea: { x: 0, y: 0, width: 24, height: 18 }, align: { x: -1, y: 1 }, offset: { x, y: -19 },
            flat, depth, depthOffset: 3, scale: 256 / 30 };
        const original = createSpriteGeometry(options);
        for (const density of [2, 4]) {
            const hd = createSpriteGeometry({ ...options, texture: { image: { width: 256, height: 256 } } as THREE.Texture,
                textureArea: { x: 12, y: 20, width: 24 * density, height: 18 * density }, logicalSize: { width: 24, height: 18 } });
            expect(Array.from(hd.attributes.position.array)).toEqual(Array.from(original.attributes.position.array));
            const a = original.attributes.uv, b = hd.attributes.uv;
            for (let i = 0; i < b.count; i++) {
                expect(b.getX(i)).toBeCloseTo((12 + a.getX(i) * 24 * density) / 256, 6);
                expect(b.getY(i)).toBeCloseTo(1 - (20 + (1 - a.getY(i)) * 18 * density) / 256, 6);
            }
            hd.dispose();
        }
        original.dispose();
    }
});
test('selects complete 4x, downshifts to complete 2x, and honors disabled', async () => {
    let result = await resolve(fixture()); expect(result.density).toBe(4); disposeHdSprite(result.override);
    const pack = fixture(); pack.variants.pop(); result = await resolve(pack);
    expect(result.density).toBe(2); expect(result.attempts[0].reason).toBe('missing-density'); disposeHdSprite(result.override);
    expect((await resolve(pack, 1)).override).toBeUndefined();
});
test('missing or invalid 4x files discard candidate and downshift once', async () => {
    for (const error of ['missing-file', 'hash-mismatch', 'decode-failure', 'allocation-failure']) {
        const result = await resolve(fixture(), 4, async name => { if (name[0] === '4') throw new Error(error); return read(name); });
        expect(result.density).toBe(2); expect(result.attempts).toEqual([{ density: 4, reason: error }]); disposeHdSprite(result.override);
    }
});
test('bad source identity, theater, metadata, color and schema fall back before reading pages', async () => {
    for (const mutate of [p => p.source.sha256 = 'b'.repeat(64), p => p.source.theater = 'SNOW',
        p => p.source.member = 'e1.shp', p => p.logical.frames[0].trimOrigin[0]++, p => p.schemaVersion = 1,
        p => p.color.representation = 'indexed']) {
        const pack = fixture(); mutate(pack);
        const result = await resolve(pack, 4, async () => { throw new Error('Must not read'); });
        expect(result.density).toBe(1); expect(result.attempts[0].reason).toBe('source-or-contract-mismatch');
    }
});
test('incomplete animations, duplicate frames, overlapping gutters and unsafe names reject whole member', async () => {
    for (const mutate of [v => v.frames.pop(), v => v.frames[1].nativeFrame = 0,
        v => { v.frames[1].sampleRect[1] = 2; v.frames[1].contentRect[1] = 2; },
        v => v.pages[0].base = '../outside.png', v => v.frames[0].sampleRect[0] = -1,
        v => v.frames[0].contentRect[2]++]) {
        const pack = fixture(); pack.variants.forEach(mutate);
        const result = await resolve(pack); expect(result.override).toBeUndefined(); expect(result.attempts.length).toBe(2);
    }
});
test('actual GPU size limit downshifts or falls back; malformed decoded masks and sizes reject', async () => {
    const downshift = await resolve(fixture(), 4, read, 100); expect(downshift.density).toBe(2); disposeHdSprite(downshift.override);
    expect((await resolve(fixture(), 4, read, 32)).density).toBe(1);
    for (const channel of [1, 2, 3, -1]) {
        const result = await resolve(fixture(), 4, async name => {
            const value = await read(name);
            if (name.includes('data')) { if (channel < 0) value.width++; else value.rgba[channel] = channel === 3 ? 0 : 255; }
            return value;
        });
        expect(result.density).toBe(1);
    }
});
test('HD batch material clones share immutable maps and keep live uniforms', () => {
    const data = new THREE.Texture(), palette = new THREE.Texture(), base = new THREE.Texture();
    const material = new HdSpriteMaterial({ map: base, remapMap: data, palette });
    const clone = material.clone();
    expect(clone.uniforms.remapMap.value).toBe(data); expect(clone.palette).toBe(palette); expect(clone.map).toBe(base);
    const shader: any = { uniforms: {} }; clone.onBeforeCompile(shader, {} as any);
    clone.extraLight = new THREE.Vector3(0.5, 0.25, 0.1);
    expect(shader.uniforms.extraLight.value).toBe(clone.extraLight);
    clone.dispose(); material.dispose(); data.dispose(); palette.dispose(); base.dispose();
});
test('failed GPU upload disposes candidate pages before 2x retry', async () => {
    let uploads = 0, disposed = 0;
    const result = await resolveHdSprite(fixture(), sha, source, 4, 2048, read, textures => {
        uploads++;
        if (uploads === 1) { textures.forEach(t => t.addEventListener('dispose', () => disposed++)); throw new Error('gpu-upload-failure'); }
    });
    expect(result.density).toBe(2); expect(uploads).toBe(2); expect(disposed).toBe(2);
    expect(result.attempts[0].reason).toBe('gpu-upload-failure'); disposeHdSprite(result.override);
});
test('opaque padding or remap coverage outside alpha rejects the member', async () => {
    for (const mode of ['padding', 'remap']) {
        const result = await resolve(fixture(), 4, async name => {
            const value = await read(name);
            if (mode === 'padding' && name.includes('base')) value.rgba[3] = 255;
            if (mode === 'remap' && name.includes('data')) value.rgba[(2 * value.width + 2) * 4] = 255;
            return value;
        });
        expect(result.density).toBe(1);
        expect(result.attempts.every(a => a.reason === (mode === 'padding' ? 'nontransparent-padding' : 'remap-outside-coverage'))).toBe(true);
    }
});
