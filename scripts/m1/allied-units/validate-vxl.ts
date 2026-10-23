import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { PNG } from 'pngjs';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { resolveMember } from '../../../src/offline/retail';
import { Engine } from '../../../src/engine/Engine';
import { loadVxlFamily } from '../../../src/engine/renderable/unitVxl/loadVxlFamily';
import { vxlUnitFamilies } from '../../../src/engine/renderable/unitVxl/identities';

const root = process.argv[2], output = process.argv[3];
assert(root && output, 'Usage: validate-vxl.ts PACK_ROOT REPORT [--yr-only]');
const bytes = readFileSync(path.join(root, 'manifest.json'));
const manifest = JSON.parse(bytes.toString());
const authoringTheater = process.argv.includes('--authoring-theater=SNOW') ? 'SNOW' : 'TEMPERATE';
assert.equal(manifest.theater, authoringTheater, 'Explicit authored theater must match the candidate');
const hash = createHash('sha256').update(bytes).digest('hex');
const saved = { contract: vxlUnitFamilies[manifest.identity], vfs: Engine.vfs,
    fetch: globalThis.fetch, bitmap: globalThis.createImageBitmap, document: globalThis.document };
const reports = [];
try {
    vxlUnitFamilies[manifest.identity] = { hash, authoringTheater,
        members: [...new Set<string>(manifest.parts.map((part: any) => part.member))],
        ...(manifest.density === 2 ? { density: 2 as const } : {}) };
    globalThis.fetch = (async (url: string) => {
        const name = url.split('/').at(-1)!;
        assert(/^[\w.-]+$/.test(name));
        return new Response(readFileSync(path.join(root, name)));
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
    for (const edition of (process.argv.includes('--yr-only') ? ['yr'] : ['ra2', 'yr']) as ('ra2' | 'yr')[]) {
        const archives = new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(name =>
            [name, readFileSync(`.local/assets/ra2/${name}`)] as const));
        if (edition === 'yr') for (const name of ['expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'])
            archives.set(name, readFileSync(`.local/assets/yr/${name}`));
        const tree = editionRetailTree(archives, edition);
        Engine.vfs = { openFile: (name: string) => resolveMember(tree, name).file } as any;
        let uploads = 0, disposed = 0;
        const renderer = { capabilities: { maxTextureSize: 2048 }, getContext: () => ({ getError: () => 0 }),
            initTexture: (texture: any) => { uploads++; texture.addEventListener('dispose', () => disposed++); } };
        const loaded = await loadVxlFamily(manifest.identity, 256 * 1024 * 1024, renderer as any, () => false);
        assert.equal(loaded.density, manifest.density, JSON.stringify(loaded.attempts));
        assert.equal(loaded.vxl!.parts.length, manifest.parts.length);
        const physicalBytes = loaded.vxl!.parts.reduce((total, part) => total + part.override.pages.reduce((sum, page) =>
            sum + page.base.image.data.byteLength + page.data.image.data.byteLength + (page.tiles?.map.image.data.byteLength ?? 0), 0), 0);
        assert.equal(physicalBytes, loaded.gpuBytes);
        loaded.vxl!.dispose(); assert.equal(uploads, disposed);
        const before = uploads;
        const denied = await loadVxlFamily(manifest.identity, 1, renderer as any, () => false);
        assert.equal(denied.density, 1); assert.equal(denied.gpuBytes, 0); assert.equal(uploads, before);
        reports.push({ edition, parts: manifest.parts.length, physicalBytes, uploads, disposed, budgetFallback: true });
    }
} finally {
    if (saved.contract) vxlUnitFamilies[manifest.identity] = saved.contract;
    else delete vxlUnitFamilies[manifest.identity];
    Engine.vfs = saved.vfs; globalThis.fetch = saved.fetch; globalThis.createImageBitmap = saved.bitmap;
    globalThis.document = saved.document;
}
writeFileSync(output, JSON.stringify({ status: 'PASS_STAGED_VXL_SOURCE_AND_CPU_RESOLUTION', manifestHash: hash,
    runtimeActivation: false, webglVerified: false, reports }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(reports));
