// Check the actual installed atlases through the shared loaders, including failure cleanup.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { PNG } from 'pngjs';
import catalog from '../../../desktop/yuri-unit-contracts.json';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { resolveMember } from '../../../src/offline/retail';
import { Engine } from '../../../src/engine/Engine';
import { ShpFile } from '../../../src/data/ShpFile';
import { loadVxlFamily } from '../../../src/engine/renderable/unitVxl/loadVxlFamily';
import { resolveSovietUnitMembers } from '../../../src/engine/renderable/builder/loadSovietUnitsHd';
import { disposeHdSprite } from '../../../src/engine/renderable/builder/resolveHdSprite';

const root = path.resolve(process.argv[2]), output = process.argv[3];
const filter = process.argv.find(arg => arg.startsWith('--families='))?.split('=')[1]?.split(',');
const selected = (name: string) => !filter || filter.includes(name);
if (filter) for (const name of filter) assert(name in catalog.vxl || name in catalog.shp, name);
assert(root && output, 'Usage: validate-resources.ts RESOURCE_ROOT REPORT');
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const archives = new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(name =>
    [name, readFileSync(path.join(root, 'assets/ra2', name))] as const));
for (const name of ['expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'])
    archives.set(name, readFileSync(path.join(root, 'assets/yr', name)));
const tree = editionRetailTree(archives, 'yr');
const saved = { vfs: Engine.vfs, fetch: globalThis.fetch, bitmap: globalThis.createImageBitmap, document: globalThis.document };
let uploads = 0, disposed = 0;
const renderer = { capabilities: { maxTextureSize: 2048 }, getContext: () => ({ getError: () => 0 }),
    initTexture(texture: any) { uploads++; texture.addEventListener('dispose', () => disposed++); } };
const physical = (pages: any[]) => pages.reduce((n, p) => n + p.base.image.data.byteLength + p.data.image.data.byteLength
    + (p.tiles?.map.image.data.byteLength ?? 0), 0);
const routes = new Map<string, string>();
for (const entry of Object.values(catalog.vxl)) for (const variant of entry.variants)
    routes.set(variant.hash, path.dirname(path.join(root, variant.path)));
let deniedHashes = new Set<string>(), deniedFiles = new Set<string>();
const reports: any[] = [], failures: any[] = [];
try {
    Engine.vfs = { openFile: (name: string) => resolveMember(tree, name).file } as any;
    globalThis.fetch = (async (url: string) => {
        const [, , identity, filename] = url.split('/');
        assert(routes.has(identity) && /^[\w.-]+$/.test(filename));
        if (deniedHashes.has(identity) || deniedFiles.has(identity + '/' + filename)) return new Response('', { status: 404 });
        return new Response(readFileSync(path.join(routes.get(identity)!, filename)));
    }) as any;
    globalThis.createImageBitmap = (async (blob: Blob) => ({
        ...PNG.sync.read(Buffer.from(await blob.arrayBuffer())), close() {},
    })) as any;
    globalThis.document = { createElement: () => {
        let pixels: any;
        return { width: 0, height: 0, getContext: () => ({
            drawImage: (bitmap: any) => { pixels = bitmap.data; }, getImageData: () => ({ data: pixels }),
        }) };
    } } as any;

    for (const [identity, contract] of Object.entries(catalog.shp)) {
        if (!selected(identity)) continue;
        const familyBytes = readFileSync(path.join(root, contract.familyPath));
        assert.equal(hash(familyBytes), contract.hash);
        const family = JSON.parse(familyBytes.toString());
        const inputs = contract.members.map(member => {
            const pack = family.members.find((m: any) => m.member === member.member);
            const directory = path.join(root, 'hd-packs', pack.packId, pack.revision);
            const bytes = readFileSync(path.join(directory, 'manifest.json')), manifest = JSON.parse(bytes.toString());
            assert.equal(hash(bytes), member.manifestHash);
            const file = resolveMember(tree, member.member).file, image = new ShpFile(file);
            assert.equal(hash(Uint8Array.from(file.getBytes())), member.sourceHash);
            assert.equal(image.images.length, member.totalFrames);
            const source = { member: member.member, sha256: member.sourceHash, theater: 'TEMPERATE',
                canvas: [image.width, image.height], frames: image.images.slice(0, member.frames).map((f, nativeFrame) => ({
                    nativeFrame, trimOrigin: [f.x, f.y], trimSize: [f.width, f.height],
                    legacyRenderSize: [f.width + f.width % 2, f.height + f.height % 2], empty: !f.imageData.some(Boolean),
                })) };
            const read = async (name: string, expected: string, size: number) => {
                const data = readFileSync(path.join(directory, name));
                assert.equal(hash(data), expected); assert.equal(data.length, size);
                const png = PNG.sync.read(data);
                return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
            };
            return { image, source, manifest, manifestHash: hash(bytes), read };
        });
        for (const density of [2, 4] as const) {
            const before = uploads;
            const loaded = await resolveSovietUnitMembers(inputs, density, 1280 * 1024 * 1024, 2048,
                textures => textures.forEach(t => renderer.initTexture(t)), () => false, true);
            assert.equal(loaded.density, density, JSON.stringify(loaded.attempts));
            assert.equal(loaded.members.size, contract.members.length);
            assert.equal([...loaded.members.values()].reduce((n, m) => n + physical(m.override.pages), 0), loaded.gpuBytes);
            for (const member of contract.members) assert.equal(loaded.members.get(member.member)!.override.frames.length, member.frames);
            loaded.members.forEach(m => disposeHdSprite(m.override));
            assert.equal(uploads, disposed);
            reports.push({ kind: 'SHP', identity, density, gpuBytes: loaded.gpuBytes, uploads: uploads - before,
                frames: contract.members.reduce((n, m) => n + m.frames, 0), released: true });
        }
        const before = uploads;
        const rejected = await resolveSovietUnitMembers(inputs, 4, 1, 2048, () => { throw Error('Budget rejection must not upload'); }, () => false, true);
        assert.equal(rejected.gpuBytes, 0); assert.equal(uploads, before);
    }
    for (const [identity, contract] of Object.entries(catalog.vxl)) {
        if (!selected(identity)) continue;
        for (const density of [2, 4] as const) {
            const before = uploads;
            const loaded = await loadVxlFamily(identity, 1280 * 1024 * 1024, renderer as any, () => false, density);
            assert.equal(loaded.density, density, JSON.stringify(loaded.attempts));
            assert.equal(loaded.vxl!.parts.length, JSON.parse(readFileSync(path.join(root, contract.variants.find(v => v.density === density)!.path), 'utf8')).parts.length);
            assert.equal(loaded.vxl!.parts.reduce((n, p) => n + physical(p.override.pages), 0), loaded.gpuBytes);
            loaded.vxl!.dispose(); assert.equal(uploads, disposed);
            reports.push({ kind: 'VXL', identity, density, parts: loaded.vxl!.parts.length, gpuBytes: loaded.gpuBytes,
                uploads: uploads - before, released: true });
        }
        const before = uploads;
        const rejected = await loadVxlFamily(identity, 1, renderer as any, () => false, 4);
        assert.equal(rejected.gpuBytes, 0); assert.equal(rejected.density, 1); assert.equal(uploads, before);
    }
    // Reject a missing missile asset after the submarine body has already decoded.
    if (selected('BSUB')) {
        const boomer = catalog.vxl.BSUB;
        for (const variant of [...boomer.variants].sort((a, b) => b.density - a.density)) {
            const m = JSON.parse(readFileSync(path.join(root, variant.path), 'utf8'));
            const child = m.parts.find((p: any) => p.actor === 'CMISL');
            deniedFiles.add(variant.hash + '/' + child.files.data.file);
            if (variant.density === 4) {
                const fallback = await loadVxlFamily('BSUB', 1280 * 1024 * 1024, renderer as any, () => false, 4);
                assert.equal(fallback.density, 2); assert.equal(fallback.vxl!.parts.length, 2);
                fallback.vxl!.dispose(); assert.equal(uploads, disposed);
                failures.push({ family: 'BSUB', missing: '4x CMISL data', selectedDensity: 2, completeParts: 2, released: true });
            }
        }
        const original = await loadVxlFamily('BSUB', 1280 * 1024 * 1024, renderer as any, () => false, 4);
        assert.equal(original.density, 1); assert.equal(original.gpuBytes, 0); assert(!original.vxl);
        assert.equal(uploads, disposed);
        failures.push({ family: 'BSUB', missing: 'Both CMISL densities', selectedDensity: 1, noPartialBody: true, released: true });
    }
    if (filter) for (const identity of filter.filter(name => name in catalog.vxl)) {
        const contract = catalog.vxl[identity as keyof typeof catalog.vxl];
        for (const variant of [...contract.variants].sort((a, b) => b.density - a.density)) {
            const manifest = JSON.parse(readFileSync(path.join(root, variant.path), 'utf8'));
            const part = manifest.parts.at(-1);
            deniedFiles.add(variant.hash + '/' + part.files.data.file);
            const loaded = await loadVxlFamily(identity, 1280 * 1024 * 1024, renderer as any, () => false, 4);
            assert.equal(loaded.density, variant.density === 4 ? 2 : 1);
            if (loaded.vxl) {
                assert.equal(loaded.vxl.parts.length, manifest.parts.length);
                loaded.vxl.dispose();
            } else assert.equal(loaded.gpuBytes, 0);
            assert.equal(uploads, disposed);
            failures.push({ family: identity, missing: variant.density + 'x final component data',
                selectedDensity: loaded.density, completeFamily: true, released: true });
        }
    }
} finally {
    Engine.vfs = saved.vfs; globalThis.fetch = saved.fetch; globalThis.createImageBitmap = saved.bitmap;
    globalThis.document = saved.document;
}
const result = { status: 'PASS_COMPLETE_INSTALLED_SOURCE_CPU_ALLOCATION_AND_FALLBACK', root, reports, failures,
    uploads, disposed, webglVerified: false, runtimeActivation: false };
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: result.status, sourceDensityCases: reports.length, uploads, disposed, fallbackCases: failures.length }));
